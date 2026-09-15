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


def clean_road_for_geocoding(value):
    value = re.sub(r"[（(].*?[）)]", "", value)
    value = re.sub(r"單號側|雙號側|東側|西側|南側|北側|周邊道路|周邊", "", value)
    return value.strip(" 、，")


def geocode(item):
    query = f"新北市{item['area']}{clean_road_for_geocoding(item['road'])}"
    params = urlencode({
        "SingleLine": query,
        "f": "json",
        "outFields": "Match_addr",
        "maxLocations": 1,
        "forStorage": "false",
    })
    result = subprocess.run(
        ["curl", "-L", "-sS", "--max-time", "20", f"https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?{params}"],
        check=True,
        capture_output=True,
        text=True,
    )
    candidates = json.loads(result.stdout).get("candidates", [])
    if candidates and candidates[0].get("score", 0) >= 70:
        location = candidates[0]["location"]
        item["lat"] = round(location["y"], 6)
        item["lng"] = round(location["x"], 6)
        item["position"] = "收費路段代表位置"
    return item


html_path, output_path = sys.argv[1:3]
tables = pd.read_html(html_path)
items = []
for area, table in zip(AREAS, tables):
    for _, row in table.iterrows():
        if str(row.iloc[0]).strip() != "機車收費":
            continue
        road = str(row.iloc[1]).strip()
        weekday = str(row.iloc[2]).strip()
        holiday = str(row.iloc[3]).strip()
        price = str(row.iloc[4]).strip()
        items.append({
            "city": "新北市",
            "area": area,
            "time": f"平日 {weekday}・假日 {holiday}",
            "road": road,
            "limits": price,
            "price": price,
        })

with ThreadPoolExecutor(max_workers=6) as executor:
    items = list(executor.map(geocode, items))

items.sort(key=lambda item: (item["area"], item["road"]))
with open(output_path, "w", encoding="utf-8") as handle:
    json.dump(items, handle, ensure_ascii=False, separators=(",", ":"))

matched = sum("lat" in item for item in items)
print(f"wrote {len(items)} motorcycle paid routes; geocoded {matched}")
