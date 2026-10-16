"""Fetch all-India defence series from SIPRI, the World Bank and the DDP dashboard.

Writes the SIPRI, World Bank and DDP rows of data/series_defence.csv and their
entries in data/sources_defence.json. Rows and sources from other datasets
(Union Budget documents, PIB releases) are kept as they are. Re-runnable:
    C:\\ProgramData\\anaconda3\\python.exe -I scripts/data/fetch_defence.py

Sources
- SIPRI Military Expenditure Database: the Excel file linked from
  https://www.sipri.org/databases/milex (the link changes with each edition,
  so it is read from that page).
- SIPRI Arms Transfers Database: the "Import/Export values" table that
  https://armstransfers.sipri.org/ArmsTransfer/ImportExport generates
  (deliveries, 1950 to the latest year, India as recipient and as supplier).
- World Bank WDI API: MS.MIL.XPND.GD.ZS (SIPRI via the World Bank) and
  MS.MIL.TOTL.P1 (IISS The Military Balance via the World Bank).
- Department of Defence Production (DDP) dashboard API (ddpdashboard.gov.in):
  value of defence production and defence exports, Rs crore, by financial year.

Values are written as read, with only unit changes, which the note field states:
US$ m -> US$ bn (/1000), rupees -> Rs crore (/1e7), shares -> per cent (x100).
SIPRI cells shown in blue (SIPRI estimates) or red (highly uncertain) are noted.
"""
import csv
import io
import json
import re
import sys
import tempfile
from datetime import date
from pathlib import Path

import openpyxl
import requests

ROOT = Path(__file__).resolve().parents[2]
TODAY = date.today().isoformat()
WORK = Path(tempfile.gettempdir()) / "tathya-def"
UA = {"User-Agent": "Mozilla/5.0 (tathya data fetch)"}
SERIES = ROOT / "data" / "series_defence.csv"
SOURCES = ROOT / "data" / "sources_defence.json"
MANAGED = ("sipri_", "wb_", "ddp_")          # dataset_id prefixes this script owns
MANAGED_SRC = ("sipri-", "wb-", "ddp-")      # source id prefixes this script owns

FIELDS = ["region_code", "indicator_id", "dataset_id", "period_label", "year", "value", "source_id",
          "source_table", "source_page", "date_pulled", "break_before", "note"]

SIPRI_LICENCE = ("SIPRI terms and conditions (https://www.sipri.org/about/terms-and-conditions): "
                 "free for non-commercial use under SIPRI's fair-use policy, which allows reproducing less "
                 "than 10 per cent of a published data set, with a clear reference to SIPRI. Credit line: "
                 "'Information from the Stockholm International Peace Research Institute (SIPRI) {db}, {url}'. "
                 "Commercial use or reproducing more than 10 per cent needs SIPRI's written permission. "
                 "This site reproduces only India's rows.")

DDP_LICENCE = ("Government of India (Department of Defence Production) public dashboard. No licence statement was found on "
               "the dashboard; figures are cited with attribution to DDP, Ministry of Defence.")

MILEX_SHEETS = [
    # sheet, indicator, dataset, scale, decimals, fiscal, label
    ("Constant (2024) US$", "milex_usd_bn_constant", "sipri_milex_const_usd", 1 / 1000, 3, False,
     "US$ m at constant 2024 prices and exchange rates, divided by 1000 to give US$ bn"),
    ("Local currency financial years", "milex_inr_cr_current", "sipri_milex_inr_fy", 1 / 1e7, 2, True,
     "rupees at current prices, financial year April-March (SIPRI FY y = April y to March y+1), divided by 1e7 to give Rs crore"),
    ("Share of GDP", "milex_pct_gdp", "sipri_milex_pct_gdp", 100, 2, False,
     "share of GDP, calendar year, multiplied by 100 to give per cent"),
    ("Share of Govt. spending", "milex_pct_govt", "sipri_milex_pct_govt", 100, 2, False,
     "share of general government expenditure (IMF WEO), calendar year, multiplied by 100 to give per cent"),
]

WB = [
    ("milex_pct_gdp", "MS.MIL.XPND.GD.ZS", "wb_milex_pct_gdp",
     "SIPRI Military Expenditure Database",
     "SIPRI's military expenditure as % of GDP, republished by the World Bank. Same figures as SIPRI's own file; "
     "kept as a separate line because the World Bank may lag or round differently.",
     "SIPRI terms and conditions, as stated in the World Bank metadata (License_Type: 'SIPRI terms and conditions'); "
     "not CC BY. Non-commercial use only; more than 10% of a SIPRI data set needs SIPRI's permission."),
    ("armed_forces_personnel", "MS.MIL.TOTL.P1", "wb_armed_forces",
     "International Institute for Strategic Studies (IISS), The Military Balance",
     "Active-duty military personnel, including paramilitary forces judged able to support or replace regular forces. "
     "Excludes reservists. Some Military Balance figures are IISS estimates.",
     "CC BY 4.0 (World Bank metadata License_Type 'CC BY-4.0'); original data from IISS The Military Balance."),
]


def sipri_colour(cell):
    c = cell.font.color if cell.font else None
    if c is None:
        return ""
    idx = getattr(c, "indexed", None) if c.type == "indexed" else None
    rgb = c.rgb if c.type == "rgb" and isinstance(c.rgb, str) else None
    if idx == 12 or (rgb and rgb[-6:].upper() == "0000FF"):
        return "SIPRI estimate (shown in blue in the source)"
    if idx == 10 or (rgb and rgb[-6:].upper() == "FF0000"):
        return "highly uncertain data (shown in red in the source)"
    return ""


def milex(rows, sources):
    page = requests.get("https://www.sipri.org/databases/milex", headers=UA, timeout=60).text
    m = re.search(r'href="((?:https?:)?//www\.sipri\.org/sites/default/files/SIPRI-Milex-data[^"]+\.xlsx)"', page)
    url = ("https:" + m.group(1)) if m.group(1).startswith("//") else m.group(1)
    fname = url.rsplit("/", 1)[1]
    WORK.mkdir(parents=True, exist_ok=True)
    path = WORK / fname
    path.write_bytes(requests.get(url, headers=UA, timeout=120).content)
    wb = openpyxl.load_workbook(path)
    footnote = ""
    for r in wb["Footnotes"].iter_rows(values_only=True):
        for v in r:
            if isinstance(v, str) and v.startswith("India:"):
                footnote = v
    for sheet, ind, ds, scale, dec, fiscal, unit_note in MILEX_SHEETS:
        if sheet.startswith("Constant"):  # the price base changes with each edition
            sheet = next(n for n in wb.sheetnames if n.startswith("Constant"))
            unit_note = unit_note.replace("2024", sheet[sheet.find("(") + 1:sheet.find(")")])
        ws = wb[sheet]
        header = None
        for row in ws.iter_rows():
            if row[0].value == "Country":
                header = row
            if isinstance(row[0].value, str) and row[0].value.strip() == "India":
                break
        sid = f"sipri-milex-{ds.split('sipri_milex_')[1].replace('_', '-')}"
        n = 0
        for h, c in zip(header, row):
            if not isinstance(h.value, int) or not isinstance(c.value, (int, float)):
                continue
            y = h.value
            label = f"{y}-{str(y + 1)[-2:]}" if fiscal else str(y)
            note = "; ".join(x for x in [unit_note, sipri_colour(c), f"cell {sheet}!{c.coordinate}"] if x)
            rows.append({"region_code": "IN", "indicator_id": ind, "dataset_id": ds, "period_label": label,
                         "year": y + 1 if fiscal else y, "value": round(c.value * scale, dec), "source_id": sid,
                         "source_table": f"SIPRI Military Expenditure Database ({fname}), sheet '{sheet}'",
                         "source_page": "", "date_pulled": TODAY, "break_before": 0, "note": note})
            n += 1
        sources.append({
            "id": sid, "publisher": "Stockholm International Peace Research Institute (SIPRI)",
            "title": f"SIPRI Military Expenditure Database, India: {sheet}", "url": "https://www.sipri.org/databases/milex",
            "download": url, "class": "B",
            "licence": SIPRI_LICENCE.format(db="Military Expenditure Database", url="https://doi.org/10.55163/CQGC9685"),
            "method": ("SIPRI compiles military spending from official budgets and other sources using its own definition "
                       "(armed forces, defence ministries, paramilitary forces judged trained and equipped for military "
                       "operations, military space; personnel including pensions, operations, procurement, R&D, "
                       "construction, military aid). SIPRI footnote for India: " + footnote),
            "coverage": f"India, {n} annual values ({unit_note})",
            "limitations": ("Military expenditure is an input measure; SIPRI says it is not directly related to military "
                            "capability or security. SIPRI revises the whole series with each edition and the constant-dollar "
                            "base year changes. Pre-1988 Indian figures are SIPRI estimates."),
            "last_checked": TODAY,
        })


def atd(rows, sources):
    api = "https://atbackend.sipri.org/api/p"
    maxyear = int(requests.get(api + "/trades/getMaxYear", headers=UA, timeout=60).text.strip())
    countries = requests.get(api + "/countries/getAllCountriesTrimmed", headers=UA, timeout=60).json()
    india = next(c["EntityId"] for c in countries if c["Name"] == "India")
    for role, ind, ds, total_row in [("Recipient", "arms_imports_tiv", "sipri_atd_imports", "India"),
                                     ("Supplier", "arms_exports_tiv", "sipri_atd_exports", "Total imports from India")]:
        body = {"filters": [
            {"field": "Year range 1", "oldField": "", "condition": "contains", "value1": 1950, "value2": maxyear, "listData": []},
            {"field": role, "oldField": "", "condition": "contains", "value1": "", "value2": "", "listData": [india]},
            {"field": "DeliveryType", "oldField": "", "condition": "", "value1": "delivered", "value2": "", "listData": []},
            {"field": "Status", "oldField": "", "condition": "", "value1": "0", "value2": "", "listData": []}],
            "logic": "AND"}
        text = requests.post(api + "/trades/import-export-csv-str/", json=body, headers=UA, timeout=180).json()["result"]
        WORK.mkdir(parents=True, exist_ok=True)
        (WORK / f"sipri_tiv_{role.lower()}.csv").write_text(text, encoding="utf-8")
        generated = re.search(r"Data generated: ([^\n]+)", text).group(1).strip()
        recs = list(csv.reader(io.StringIO(text)))
        hdr = next(r for r in recs if r and r[0] == "Recipient")
        data = next(r for r in recs if r and r[0] == total_row)
        sid = f"sipri-atd-{'imports' if role == 'Recipient' else 'exports'}"
        n = 0
        for h, v in zip(hdr[1:], data[1:]):
            if not re.fullmatch(r"\d{4}", h) or v.strip() == "":
                continue  # an empty field means SIPRI identified no deliveries; not written as 0
            note = "TIV, millions; not a money value"
            if v.strip() == "0":
                note += "; '0' in the source means between 0 and 0.5 million TIV"
            note += f"; row '{total_row}'"
            rows.append({"region_code": "IN", "indicator_id": ind, "dataset_id": ds, "period_label": h, "year": int(h),
                         "value": int(v.strip()), "source_id": sid,
                         "source_table": f"SIPRI Arms Transfers Database, Import/Export values, India as {role.lower()}, "
                                         f"deliveries 1950-{maxyear} (generated {generated})",
                         "source_page": "", "date_pulled": TODAY, "break_before": 0, "note": note})
            n += 1
        sources.append({
            "id": sid, "publisher": "Stockholm International Peace Research Institute (SIPRI)",
            "title": f"SIPRI Arms Transfers Database: volume of transfers of major arms, India as {role.lower()} (TIV)",
            "url": "https://armstransfers.sipri.org/ArmsTransfer/ImportExport", "class": "B",
            "licence": SIPRI_LICENCE.format(db="Arms Transfers Database", url="https://www.sipri.org/databases/armstransfers"),
            "method": ("Deliveries of major conventional weapons, valued in SIPRI trend-indicator values (TIV). The TIV is "
                       "based on known unit production costs of a core set of weapons and represents the transfer of military "
                       "resources, not the financial value of the transfer."),
            "coverage": f"India, {n} annual values, 1950-{maxyear}",
            "limitations": ("TIV is not money: SIPRI says TIV figures do not represent sales prices and should not be compared "
                            "with GDP, military expenditure, sales values or export-licence values. Major arms only (no small arms "
                            "or most ammunition). Years with no identified deliveries are blank in SIPRI and are left out here. "
                            "SIPRI revises past years as new deliveries are identified."),
            "last_checked": TODAY,
        })


def world_bank(rows, sources):
    for ind, code, ds, provider, caveat, licence in WB:
        url = f"https://api.worldbank.org/v2/country/IND/indicator/{code}?format=json&per_page=200"
        meta, data = requests.get(url, timeout=60).json()
        sid = f"wb-{code.lower().replace('.', '-')}"
        n = 0
        for d in sorted(data, key=lambda d: d["date"]):
            if d["value"] is None:
                continue
            v = float(d["value"])
            rows.append({"region_code": "IN", "indicator_id": ind, "dataset_id": ds, "period_label": d["date"],
                         "year": int(d["date"]), "value": round(v, 2) if ind == "milex_pct_gdp" else int(round(v)),
                         "source_id": sid, "source_table": f"World Bank WDI {code}", "source_page": "",
                         "date_pulled": TODAY, "break_before": 0, "note": ""})
            n += 1
        sources.append({
            "id": sid, "publisher": f"World Bank WDI, original provider: {provider}",
            "title": data[0]["indicator"]["value"], "url": f"https://data.worldbank.org/indicator/{code}?locations=IN",
            "class": "B", "licence": licence, "method": caveat, "coverage": f"India, {n} annual values",
            "limitations": "Republished; check the original provider before using a single value in a claim.",
            "last_checked": TODAY, "api": url, "wb_last_updated": meta.get("lastupdated"),
        })


def ddp(rows, sources):
    api = "https://api.ddpdashboard.gov.in"
    h = dict(UA, Origin="https://ddpdashboard.gov.in")
    prod = requests.get(api + "/defence-production/get-defence-production-latest-data", headers=h, timeout=60).json()["data"]
    latest = requests.get(api + "/defence-production/getdefenceProductionData", headers=h, timeout=60).json()["data"]
    exp = requests.get(api + "/defence-export-api/get-last-updated-defence-export-data", headers=h, timeout=60).json()["data"]
    WORK.mkdir(parents=True, exist_ok=True)
    (WORK / "ddp_production.json").write_text(json.dumps(prod, indent=1), encoding="utf-8")
    (WORK / "ddp_exports.json").write_text(json.dumps(exp, indent=1), encoding="utf-8")
    n = 0
    for r in prod:
        a, b = r["year"].split("-")
        label = f"{a}-{b[-2:]}"
        # the API names the production total 'totalExport'; it is the total value of production
        note = (f"DPSUs {r['defencePublicSector']}, new DPSUs from OFB {r['OFB']}, other PSUs {r['Other_PSU']}, "
                f"private companies {r['Defence_Private_Companies']} (Rs crore, as in the API)")
        if r["year"][:4] == latest["YearID"][:4]:
            note += f"; as on {latest['As_on_date']}, updated {latest['upadteAt']}"
        rows.append({"region_code": "IN", "indicator_id": "def_production_cr", "dataset_id": "ddp_production",
                     "period_label": label, "year": int(a) + 1, "value": float(r["totalExport"]), "source_id": "ddp-dashboard-production",
                     "source_table": "DDP dashboard API, /defence-production/get-defence-production-latest-data, field 'totalExport' (total value of production)",
                     "source_page": "", "date_pulled": TODAY, "break_before": 0, "note": note})
        n += 1
    sources.append({
        "id": "ddp-dashboard-production", "publisher": "Department of Defence Production, Ministry of Defence",
        "title": "DDP dashboard: value of defence production (Rs crore), by financial year",
        "url": "https://ddpdashboard.gov.in/", "api": api + "/defence-production/get-defence-production-latest-data",
        "class": "A", "licence": DDP_LICENCE,
        "method": "Value of production reported to DDP by Defence PSUs, the new DPSUs formed from the Ordnance Factory Board, other PSUs making defence items, and private companies.",
        "coverage": f"India, {n} financial years",
        "limitations": "Self-reported by producers; the latest year may be provisional and is revised. Earlier PIB releases quote other vintages (e.g. Rs 1,26,887 crore for 2023-24 in July 2024, now Rs 1,27,434.48 crore).",
        "last_checked": TODAY,
    })
    n = 0
    for r in exp:
        a, b = r["year"].split("-")
        if int(a) + 1 > date.today().year or (int(a) + 1 == date.today().year and date.today().month < 4):
            continue  # financial year not finished: partial total
        rows.append({"region_code": "IN", "indicator_id": "def_exports_cr", "dataset_id": "ddp_exports",
                     "period_label": r["year"], "year": int(a) + 1, "value": float(r["totalExport"]), "source_id": "ddp-dashboard-exports",
                     "source_table": "DDP dashboard API, /defence-export-api/get-last-updated-defence-export-data, field 'totalExport'",
                     "source_page": "", "date_pulled": TODAY, "break_before": 0,
                     "note": (f"private companies {r['privatecompanies']}, SCOMET {r['scomet']}, DPSU ('Contract value another Export by DPSU') "
                              f"{r['Contract value another Export by DPSU']} (Rs crore, as in the API)")})
        n += 1
    sources.append({
        "id": "ddp-dashboard-exports", "publisher": "Department of Defence Production, Ministry of Defence",
        "title": "DDP dashboard: defence exports (Rs crore), by financial year",
        "url": "https://ddpdashboard.gov.in/", "api": api + "/defence-export-api/get-last-updated-defence-export-data",
        "class": "A", "licence": DDP_LICENCE,
        "method": "Exports by private companies (against DDP export authorisations), SCOMET items, and DPSU exports, as compiled by DDP.",
        "coverage": f"India, {n} completed financial years (the current year's running total is left out)",
        "limitations": "A money value in current rupees, unlike SIPRI TIV. Includes parts, components and services, not only major weapons. The private-sector figure comes from the export-authorisation system.",
        "last_checked": TODAY,
    })


def main():
    rows, sources = [], []
    milex(rows, sources)
    atd(rows, sources)
    world_bank(rows, sources)
    ddp(rows, sources)
    keep = []
    if SERIES.exists():
        with SERIES.open(encoding="utf-8", newline="") as f:
            keep = [r for r in csv.DictReader(f) if not r["dataset_id"].startswith(MANAGED)]
    out = sorted(keep + rows, key=lambda r: (r["indicator_id"], r["dataset_id"], int(r["year"])))
    with SERIES.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(out)
    old = json.loads(SOURCES.read_text(encoding="utf-8")) if SOURCES.exists() else []
    allsrc = [s for s in old if not s["id"].startswith(MANAGED_SRC)] + sources
    SOURCES.write_text(json.dumps(allsrc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{len(rows)} rows from SIPRI/World Bank/DDP, {len(keep)} other rows kept; {len(sources)} sources")


if __name__ == "__main__":
    sys.exit(main())
