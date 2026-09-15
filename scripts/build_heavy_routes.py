import json
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlencode

import pandas as pd


AREAS = [
    "板橋區", "土城區", "中和區", "永和區", "新店區", "三重區", "新莊區",
    "蘆洲區", "樹林區", "鶯歌區", "三峽區", "汐止區", "林口區", "八里區",
    "淡水區", "五股區", "泰山區", "金山區", "深坑區", "石碇區", "坪林區",
]

TAIPEI_SHARED = [
    ("大安區", "復興南路1段（東側）", "市民大道3段至復興南路1段95號"),
    ("南港區", "三重路（西側）", "經貿二路106巷至新民街"),
    ("士林區", "基河路（西側）", "百齡高中旁"),
    ("中山區", "松江路（東側）", "民權東路2段至錦州街"),
    ("大同區", "民生西路（南側）", "寧夏路至太原路"),
    ("內湖區", "瑞光路513巷22弄（南側）", "瑞光路583巷至瑞光路513巷"),
    ("松山區", "南京東路3段（北側）", "南京東路3段269巷至敦化北路"),
    ("文山區", "新光路2段（北側）", "捷運動物園站旁"),
    ("北投區", "西安街2段（西側）", "石牌國中旁"),
    ("信義區", "逸仙路（西側）", "松高路至仁愛路4段"),
    ("信義區", "仁愛路4段（北側）", "近逸仙路"),
    ("萬華區", "昆明街（西側）", "峨嵋街至成都路"),
    ("中正區", "杭州南路1段（西側）", "杭州南路1段24號前"),
    ("中正區", "徐州路（南側）", "徐州路2號前"),
]


def clean(value):
    return re.sub(r"[（(].*?[）)]", "", value).strip()


def geocode(item):
    query = f"{item['city']}{item['area']}{clean(item['road'])} {item.get('location_hint', '')}"
    params = urlencode({"SingleLine": query, "f": "json", "outFields": "Match_addr", "maxLocations": 1, "forStorage": "false"})
    result = subprocess.run(
        ["curl", "-L", "-sS", "--max-time", "20", f"https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?{params}"],
        check=True, capture_output=True, text=True,
    )
    candidates = json.loads(result.stdout).get("candidates", [])
    if candidates and candidates[0].get("score", 0) >= 65:
        location = candidates[0]["location"]
        item["lat"] = round(location["y"], 6)
        item["lng"] = round(location["x"], 6)
        item["position"] = "重機可停路段代表位置"
    item.pop("location_hint", None)
    return item


html_path, ntpc_general_path, output_path = sys.argv[1:4]
with open(ntpc_general_path, encoding="utf-8") as handle:
    ntpc_general = json.load(handle)

# Since 2026-07-01, New Taipei opens all roadside paid motorcycle spaces to large heavy motorcycles.
items = [{
    **item,
    "vehicle": "heavy",
    "spaceType": "共用收費機車格",
    "limits": f"每4小時30元・{item['price']}",
    "price": "每4小時30元",
    "rule": "大型重機可斜向或跨2格，但車身不得超出格線",
} for item in ntpc_general]

tables = pd.read_html(html_path)
dedicated = []
for area, table in zip(AREAS, tables):
    for _, row in table.iterrows():
        if "大型重型機車收費" not in str(row.iloc[0]):
            continue
        dedicated.append({
            "city": "新北市", "area": area, "vehicle": "heavy", "spaceType": "大重機專用格",
            "road": str(row.iloc[1]).strip(),
            "time": f"平日 {str(row.iloc[2]).strip()}・假日 {str(row.iloc[3]).strip()}",
            "limits": str(row.iloc[4]).strip(), "price": str(row.iloc[4]).strip(),
            "rule": "依專用格位方向完整入格停放",
        })

taipei = [{
    "city": "台北市", "area": area, "vehicle": "heavy", "spaceType": "機車／大重機共用格",
    "road": road, "location_hint": limits, "time": "依現場牌面", "limits": limits,
    "price": "依現場公告", "rule": "僅限官方公告的共用格位範圍",
} for area, road, limits in TAIPEI_SHARED]

with ThreadPoolExecutor(max_workers=6) as executor:
    located = list(executor.map(geocode, taipei + dedicated))
items.extend(located)
items.sort(key=lambda item: (item["city"], item["area"], item["road"], item["spaceType"]))

with open(output_path, "w", encoding="utf-8") as handle:
    json.dump(items, handle, ensure_ascii=False, separators=(",", ":"))

print(f"wrote {len(items)} heavy-motorcycle route records; {sum('lat' in item for item in items)} mapped")
