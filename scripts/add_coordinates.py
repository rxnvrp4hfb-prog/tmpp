import json
import re
import sys
from collections import defaultdict

import shapefile
from pyproj import Transformer


def normalized(value):
    value = (value or "").replace("臺", "台")
    value = re.sub(r"[（(].*?[）)]", "", value)
    value = re.sub(r"東側|西側|南側|北側|計時收費|機車|無名巷|A$|B$|C$|D$", "", value)
    value = value.replace("一段", "1段").replace("二段", "2段").replace("三段", "3段")
    value = value.replace("四段", "4段").replace("五段", "5段").replace("六段", "6段").replace("七段", "7段")
    return re.sub(r"[^0-9A-Za-z\u4e00-\u9fff]", "", value)


source_json, shp_path, output_json = sys.argv[1:4]
with open(source_json, encoding="utf-8") as handle:
    items = json.load(handle)

wanted = defaultdict(list)
for index, item in enumerate(items):
    key = normalized(item["road"])
    if key:
        wanted[key].append(index)

reader = shapefile.Reader(shp_path, encoding="utf-8")
fields = [field[0] for field in reader.fields[1:]]
type_index = fields.index("pktype")
road_index = fields.index("roadname")
transformer = Transformer.from_crs("EPSG:3826", "EPSG:4326", always_xy=True)
coordinates = defaultdict(list)

for shape_record in reader.iterShapeRecords():
    record = shape_record.record
    if record[type_index] != "02":
        continue
    road_key = normalized(record[road_index])
    if road_key not in wanted:
        continue
    shape = shape_record.shape
    if not shape.points:
        continue
    min_x, min_y, max_x, max_y = shape.bbox
    longitude, latitude = transformer.transform((min_x + max_x) / 2, (min_y + max_y) / 2)
    coordinates[road_key].append((longitude, latitude))

matched = 0
for item in items:
    points = coordinates.get(normalized(item["road"]), [])
    if points:
        item["lng"] = round(sum(point[0] for point in points) / len(points), 6)
        item["lat"] = round(sum(point[1] for point in points) / len(points), 6)
        item["position"] = "政府格位圖資推估"
        matched += 1

with open(output_json, "w", encoding="utf-8") as handle:
    json.dump(items, handle, ensure_ascii=False, separators=(",", ":"))

print(f"matched {matched} of {len(items)} paid road records")
