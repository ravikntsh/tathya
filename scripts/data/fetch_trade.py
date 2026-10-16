"""Fetch India's annual merchandise trade with its neighbours from UN Comtrade.

Writes data/neighbour_trade.csv. Re-runnable, no API key needed:
    C:\\ProgramData\\anaconda3\\python.exe -I scripts/data/fetch_trade.py [--raw DIR] [--first 1988] [--last YEAR]

Uses the public preview endpoint of the Comtrade API
(https://comtradeapi.un.org/public/v1/preview/C/A/HS). The preview accepts only
one period per call and returns at most 500 records, so the script makes one
call per year covering all nine partners and both flows (18 records). Raw JSON
responses are saved to the raw directory so every value can be traced.

Values are India-reported (reporterCode 699), HS classification, cmdCode TOTAL,
primaryValue in current US$ (exports FOB, imports CIF as reported by India).
"""
import argparse
import csv
import json
import sys
import tempfile
import time
from datetime import date
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "neighbour_trade.csv"
URL = "https://comtradeapi.un.org/public/v1/preview/C/A/HS"
REPORTER = 699  # India
SOURCE_ID = "comtrade-india-neighbours"

# 2-letter code -> UN M49 code used by Comtrade
PARTNERS = {
    "CN": 156, "PK": 586, "BD": 50, "NP": 524, "BT": 64,
    "LK": 144, "MM": 104, "MV": 462, "AF": 4,
}


def fetch_year(year, raw_dir, session):
    """Return the parsed JSON for one year, using a cached raw file if present."""
    path = raw_dir / f"comtrade_{REPORTER}_{year}.json"
    if path.exists():
        data = json.loads(path.read_text(encoding="utf-8"))
        if data.get("error") in (None, "") and data.get("data"):
            return data
    params = {
        "reporterCode": REPORTER,
        "partnerCode": ",".join(str(c) for c in PARTNERS.values()),
        "period": year,
        "flowCode": "X,M",
        "cmdCode": "TOTAL",
    }
    for attempt in range(5):
        r = session.get(URL, params=params, timeout=90)
        if r.status_code == 429 or r.status_code >= 500:
            time.sleep(5 * (attempt + 1))
            continue
        r.raise_for_status()
        data = r.json()
        path.write_text(r.text, encoding="utf-8")
        time.sleep(1.5)  # be polite to the public endpoint
        return data
    raise RuntimeError(f"Comtrade failed for {year} after retries")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", default=str(Path(tempfile.gettempdir()) / "tathya-trade"))
    ap.add_argument("--first", type=int, default=1988)
    ap.add_argument("--last", type=int, default=date.today().year)
    ap.add_argument("--refresh", action="store_true", help="ignore cached raw files")
    args = ap.parse_args()
    raw_dir = Path(args.raw)
    raw_dir.mkdir(parents=True, exist_ok=True)
    if args.refresh:
        for p in raw_dir.glob(f"comtrade_{REPORTER}_*.json"):
            p.unlink()

    code_to_iso = {v: k for k, v in PARTNERS.items()}
    values = {}  # (iso, year) -> {"X": v, "M": v, "cls": set()}
    years_with_data = []
    session = requests.Session()
    for year in range(args.first, args.last + 1):
        data = fetch_year(year, raw_dir, session)
        if data.get("error"):
            print(f"{year}: API error: {data['error']}", file=sys.stderr)
            continue
        rows = data.get("data") or []
        print(f"{year}: {len(rows)} records")
        if rows:
            years_with_data.append(year)
        for rec in rows:
            # keep only the plain total: no second partner, all customs, all transport modes
            if rec.get("partner2Code") not in (0, None) or rec.get("motCode") not in (0, None) \
                    or rec.get("customsCode") not in ("C00", None) or rec.get("cmdCode") != "TOTAL":
                continue
            iso = code_to_iso.get(rec["partnerCode"])
            flow = rec["flowCode"]
            if iso is None or flow not in ("X", "M"):
                continue
            cell = values.setdefault((iso, rec["refYear"]), {"cls": set()})
            if flow in cell and cell[flow] != rec["primaryValue"]:
                raise RuntimeError(f"Conflicting values for {iso} {year} {flow}")
            cell[flow] = rec["primaryValue"]
            cell["cls"].add(rec.get("classificationCode") or "")

    def fmt(v):
        if v is None:
            return ""
        return str(int(v)) if float(v).is_integer() else repr(float(v))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["partner", "year", "exports_usd", "imports_usd", "source_id", "note"])
        for iso in PARTNERS:
            for year in years_with_data:
                cell = values.get((iso, year))
                if cell is None:
                    # the API answered for this year but had no record for this partner
                    w.writerow([iso, year, "", "", SOURCE_ID,
                                "no India-reported record in Comtrade for this year"])
                    continue
                notes = []
                if "X" not in cell:
                    notes.append("exports not reported")
                if "M" not in cell:
                    notes.append("imports not reported")
                notes.append("HS classification " + "/".join(sorted(cell["cls"])))
                w.writerow([iso, year, fmt(cell.get("X")), fmt(cell.get("M")),
                            SOURCE_ID, "; ".join(notes)])
    print(f"wrote {OUT} ({len(values)} partner-years)")


if __name__ == "__main__":
    main()
