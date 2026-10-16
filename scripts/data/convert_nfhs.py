"""One-off: convert data/nfhs_state.csv to the multi-source format (data/series_nfhs.csv).

    C:\\ProgramData\\anaconda3\\python.exe -I scripts/data/convert_nfhs.py
"""
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PH1 = "https://nhm.gov.in/uhc-day/Session%202/NFHS-5%20State%20Factsheet%20Compendium_Phase-I%20(1).pdf"
PH2 = "https://dhsprogram.com/pubs/pdf/OF43/NFHS-5_India_and_State_Factsheet_Compendium_Phase-II.pdf"
SOURCE_BY_URL = {PH1: "nfhs5-compendium-phase1", PH2: "nfhs5-compendium-phase2"}
FIELDS = ["region_code", "indicator_id", "dataset_id", "period_label", "year", "value", "source_id",
          "source_table", "source_page", "date_pulled", "break_before", "note"]


def end_year(years):
    a, b = years.split("-")
    return int(a[: len(a) - len(b)] + b)


rows = []
with (ROOT / "data" / "nfhs_state.csv").open(encoding="utf-8") as f:
    for r in csv.DictReader(f):
        note = r["note"]
        if r["round"] == "NFHS-5":
            note = (note + "; " if note else "") + f"NFHS-5 fieldwork {r['survey_years']}"
        rows.append({
            "region_code": r["state_code"], "indicator_id": r["indicator_id"], "dataset_id": "nfhs",
            "period_label": r["round"], "year": end_year(r["survey_years"]), "value": r["value"],
            "source_id": SOURCE_BY_URL[r["source_url"]],
            "source_table": "State fact sheet, Key Indicators" if r["state_code"] != "IN" else "India fact sheet, Key Indicators",
            "source_page": r["source_page"], "date_pulled": r["date_pulled"], "break_before": 0, "note": note,
        })

with (ROOT / "data" / "series_nfhs.csv").open("w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=FIELDS)
    w.writeheader()
    w.writerows(rows)

sources = [
    {"id": "nfhs5-compendium-phase1", "publisher": "IIPS / Ministry of Health and Family Welfare (copy hosted by MoHFW National Health Mission)",
     "title": "NFHS-5 State Factsheet Compendium, Phase I (22 states/UTs)", "url": PH1, "class": "A",
     "licence": "Government of India publication", "method": "Household survey; fact sheets print NFHS-5 (2019-20) and NFHS-4 (2015-16) side by side.",
     "coverage": "22 states/UTs", "limitations": "Provisional fact-sheet results; survey estimates with sampling error.", "last_checked": "2026-10-16"},
    {"id": "nfhs5-compendium-phase2", "publisher": "IIPS / Ministry of Health and Family Welfare (copy hosted by The DHS Program, ICF)",
     "title": "NFHS-5 India and State Factsheet Compendium, Phase II (India + 14 states/UTs)", "url": PH2, "class": "A",
     "licence": "Government of India publication", "method": "Household survey; fact sheets print NFHS-5 (2020-21; India 2019-21) and NFHS-4 (2015-16) side by side.",
     "coverage": "India and 14 states/UTs", "limitations": "Provisional fact-sheet results; survey estimates with sampling error.", "last_checked": "2026-10-16"},
]
(ROOT / "data" / "sources_nfhs.json").write_text(json.dumps(sources, indent=2, ensure_ascii=False), encoding="utf-8")
print(len(rows), "rows")
