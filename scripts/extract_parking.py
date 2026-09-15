import json
import sys
import pdfplumber


def clean(value):
    return " ".join((value or "").replace("\n", " ").split())


pdf_path, output_path = sys.argv[1:3]
records = []
current_area = ""
current_time = ""

with pdfplumber.open(pdf_path) as pdf:
    for page in pdf.pages:
        for table in page.extract_tables():
            for row in table:
                if not row or len(row) < 4:
                    continue
                area, charge_time, road, limits = map(clean, row[:4])
                if road in {"路段", ""} or area.startswith("臺北市路邊"):
                    continue
                if area:
                    current_area = area
                if charge_time:
                    current_time = charge_time
                records.append({
                    "area": current_area,
                    "time": current_time,
                    "road": road,
                    "limits": limits,
                })

with open(output_path, "w", encoding="utf-8") as handle:
    json.dump(records, handle, ensure_ascii=False, separators=(",", ":"))

print(f"wrote {len(records)} records")
