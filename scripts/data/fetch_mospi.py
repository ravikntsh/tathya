"""Fetch state and All-India series from MoSPI's eSankhyiki API (api.mospi.gov.in).

No key is needed. The API specs are published by MoSPI's National Statistics
Office at github.com/nso-india/esankhyiki-mcp (folder swagger/).

What it writes (data/series_mospi.csv), each kept as its own dataset:
  - National Accounts (base 2011-12, current series), by state:
      gsdp_current       Gross State Domestic Product, current prices (indicator 23)
      gsdp_growth_real   GSDP growth rate at constant prices (indicator 26)
  - PLFS, usual status (ps+ss), age 15+, rural+urban:
      lfpr, lfpr_female  Labour force participation rate (indicator 1), persons and women,
                         July-June years (plfs_ay_api) and calendar years (plfs_cy_api)
  - CPI, base 2012, combined rural+urban, General Index, by state:
      cpi_inflation      Average inflation over the financial year (April-March): the mean
                         of the 12 monthly General Index values against the previous
                         year's mean. Calculated by Tathya from the published monthly
                         indices (the API gives monthly figures only); marked as such.

It also prints a cross-check of API values against figures already in data/
(RBI per-capita NSDP, PLFS unemployment and worker rates read from the reports).

Every raw API page is saved under --raw (default: a temp folder) for audit.

    C:\\ProgramData\\anaconda3\\python.exe -I scripts/data/fetch_mospi.py [--raw DIR] [--only nas,plfs,cpi]
"""
import argparse
import csv
import datetime as dt
import json
import re
import ssl
import sys
import tempfile
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
BASE = "https://api.mospi.gov.in"
TODAY = dt.date.today().isoformat()
OUT = DATA / "series_mospi.csv"
COLS = ["region_code", "indicator_id", "dataset_id", "period_label", "year", "value", "source_id",
        "source_table", "source_page", "date_pulled", "break_before", "note"]

sys.stdout.reconfigure(encoding="utf-8")
class LegacyTLS(requests.adapters.HTTPAdapter):
    """api.mospi.gov.in needs TLS legacy renegotiation, which OpenSSL 3 refuses by
    default. Allow only that; certificate checks stay on."""

    def init_poolmanager(self, *args, **kwargs):
        ctx = ssl.create_default_context()
        ctx.options |= getattr(ssl, "OP_LEGACY_SERVER_CONNECT", 0x4)
        kwargs["ssl_context"] = ctx
        return super().init_poolmanager(*args, **kwargs)


S = requests.Session()
S.mount(BASE, LegacyTLS())
S.headers["User-Agent"] = "Tathya data fetch (github.com/ravikntsh/tathya)"


# ---------- regions ----------

def norm(name):
    return re.sub(r"[^a-z]", "", name.lower().replace("&", "and"))


REGIONS = json.loads((DATA / "regions.json").read_text(encoding="utf-8"))
CODE = {norm(r["name"]["en"]): r["code"] for r in REGIONS}
CODE.update({
    "allindia": "IN", "india": "IN", "nctofdelhi": "DL", "orissa": "OR", "uttaranchal": "UT",
    "pondicherry": "PY", "andamanandnicobar": "AN", "andamannicobarislands": "AN",
    "jammukashmir": "JK", "thedadraandnagarhavelianddamananddiu": "DH",
    "dadranagarhavelianddamandiu": "DH", "dadraandnagarhavelianddamandiu": "DH",
})
UNMAPPED = defaultdict(int)


def region(label):
    c = CODE.get(norm(label))
    if not c:
        UNMAPPED[label] += 1
    return c


# ---------- API ----------

def fetch(path, params, raw_dir, tag):
    """All pages of one query. Returns [(page, record)]. Saves each raw page."""
    out, page, limit = [], 1, 200
    while True:
        p = dict(params, limit=limit, page=page, Format="JSON")
        for attempt in range(5):
            try:
                r = S.get(BASE + path, params=p, timeout=90)
                j = r.json()
                break
            except Exception:
                time.sleep(3 * (attempt + 1))
        else:
            raise RuntimeError(f"{path} {params} page {page}: no response")
        if j.get("success") is False and "Limit" in str(j.get("message", "")):
            limit = 100
            continue
        (raw_dir / f"{tag}_p{page:03d}.json").write_text(json.dumps(j, ensure_ascii=False), encoding="utf-8")
        out += [(page, x) for x in (j.get("data") or [])]
        if page >= int((j.get("meta_data") or {}).get("totalPages") or 1):
            return out
        page += 1


def fy_year(label):
    """'2023-24' -> 2024 (the year a financial or July-June year ends)."""
    return int(label[:4]) + 1


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


# ---------- National Accounts: states ----------

NAS_SRC = "mospi-esankhyiki-nas-state-2011"
# Order of NSO estimate rounds for a year, earliest to latest.
REVISION = {"First Advance Estimates": 1, "Second Advance Estimates": 2, "Provisional Estimates": 3,
            "First Revised Estimates": 4, "Second Revised Estimates": 5, "Third Revised Estimates": 6, "Final Estimates": 7}


def nas(raw):
    rows, check = [], {}
    q = {"base_year": "2011-12", "series": "Current", "frequency_code": "Annually"}
    for code, ind, field, unit_note in [
        (23, "gsdp_current", "current_price", "current prices; Rs crore"),
        (26, "gsdp_growth_real", "constant_price", "growth rate at constant 2011-12 prices; per cent"),
    ]:
        for page, x in fetch("/api/nas/getNASData", dict(q, indicator_code=code), raw, f"nas_{code}"):
            rc, v = region(x["state"]), num(x.get(field))
            if not rc or v is None:
                continue
            rows.append({
                "region_code": rc, "indicator_id": ind, "dataset_id": "mospi_nas_state_2011",
                "period_label": x["year"], "year": fy_year(x["year"]), "value": v, "source_id": NAS_SRC,
                "source_table": f"MoSPI eSankhyiki NAS API getNASData (base_year=2011-12, series=Current, frequency=Annually, indicator_code={code}: {x['indicator']}), field {field}",
                "source_page": f"api page {page}", "date_pulled": TODAY, "break_before": 0,
                "note": f"NSO state accounts, base 2011-12; {unit_note}; fiscal year April-March {x['year']}; state label in API: {x['state']}",
            })
    # All-India: GDP (indicator 5) and GDP growth (indicator 22) carry several estimate
    # rounds per year; keep the latest round for each year.
    for code, ind, field, what in [
        (5, "gsdp_current", "current_price", "All-India GDP, current prices; Rs crore"),
        (22, "gsdp_growth_real", "constant_price", "All-India GDP growth rate at constant 2011-12 prices; per cent"),
    ]:
        best = {}
        for page, x in fetch("/api/nas/getNASData", dict(q, indicator_code=code), raw, f"nas_{code}"):
            v, rank = num(x.get(field)), REVISION.get(x.get("revision"))
            if v is None or rank is None:
                continue
            if x["year"] not in best or rank > best[x["year"]][0]:
                best[x["year"]] = (rank, page, x, v)
        for year, (_, page, x, v) in best.items():
            rows.append({
                "region_code": "IN", "indicator_id": ind, "dataset_id": "mospi_nas_state_2011",
                "period_label": year, "year": fy_year(year), "value": v, "source_id": NAS_SRC,
                "source_table": f"MoSPI eSankhyiki NAS API getNASData (base_year=2011-12, series=Current, frequency=Annually, indicator_code={code}: {x['indicator']}), field {field}",
                "source_page": f"api page {page}", "date_pulled": TODAY, "break_before": 0,
                "note": f"NSO national accounts, base 2011-12; {what}; fiscal year April-March {year}; latest estimate round in the API: {x['revision']}",
            })
    # Per capita NSDP, only to check against the RBI Handbook copy already in data/.
    for page, x in fetch("/api/nas/getNASData", dict(q, indicator_code=25), raw, "nas_25"):
        rc = region(x["state"])
        if rc:
            check[("const", rc, x["year"])] = num(x.get("constant_price"))
            check[("cur", rc, x["year"])] = num(x.get("current_price"))
    return rows, check


# ---------- PLFS ----------

PLFS_SRC = "mospi-esankhyiki-plfs-lfpr"


def plfs(raw):
    rows, check = [], {}
    base = {"frequency_code": 1, "age_code": 1, "weekly_status_code": 1, "sector_code": 3}
    for ind_code in (1, 2, 3):
        recs = fetch("/api/plfs/getData", dict(base, indicator_code=ind_code, gender_code="2,3"), raw, f"plfs_{ind_code}")
        for page, x in recs:
            if not (x.get("religion") == "all" and x.get("socialGroup") == "all" and x.get("General_Education") == "all"
                    and x.get("AgeGroup") == "15 years and above" and x.get("weekly_status") == "PS+SS"
                    and x.get("sector") == "rural + urban"):
                continue
            rc, v = region(x["state"]), num(x.get("value"))
            if not rc or v is None:
                continue
            calendar = x["year_type"] == "Calendar Year"
            period = f"{x['year']} (Jan-Dec)" if calendar else x["year"]
            if ind_code != 1:
                if x["gender"] == "person":
                    check[(ind_code, "cy" if calendar else "ay", rc, period)] = v
                continue
            ind = "lfpr" if x["gender"] == "person" else "lfpr_female" if x["gender"] == "female" else None
            if not ind:
                continue
            rows.append({
                "region_code": rc, "indicator_id": ind, "dataset_id": "plfs_cy_api" if calendar else "plfs_ay_api",
                "period_label": period, "year": int(x["year"]) if calendar else fy_year(x["year"]), "value": v,
                "source_id": PLFS_SRC,
                "source_table": f"MoSPI eSankhyiki PLFS API getData (indicator_code=1 LFPR, frequency_code=1, age_code=1, weekly_status_code=1, sector_code=3, gender {x['gender']}), {x['year_type']}",
                "source_page": f"api page {page}", "date_pulled": TODAY, "break_before": 0,
                "note": f"PLFS usual status (ps+ss); age 15 years and above; rural+urban; {x['gender']}s; "
                        + (f"calendar year January-December {x['year']}" if calendar else f"agricultural year July-June {x['year']}")
                        + f"; state label in API: {x['state']}",
            })
    return rows, check


# ---------- CPI ----------

CPI_SRC = "mospi-esankhyiki-cpi-2012"
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]


def cpi(raw):
    def one(sc):
        q = {"base_year": "2012", "series": "Current", "state_code": sc, "sector_code": 3}
        return [x for _, x in fetch("/api/cpi/getCPIIndex", q, raw, f"cpi_{sc}") if x.get("subgroup") == "General-Overall"]

    with ThreadPoolExecutor(6) as pool:
        recs = [x for part in pool.map(one, [*range(1, 37), 99]) for x in part]
    # index by region and financial year (April-March)
    by = defaultdict(dict)
    for x in recs:
        rc, v = region(x["state"]), num(x.get("index"))
        if not rc or v is None:
            continue
        m = MONTHS.index(x["month"]) + 1
        y = int(x["year"])
        fy = y if m >= 4 else y - 1  # FY starting year
        by[(rc, fy)][m] = (v, x.get("status"), x["state"])
    rows = []
    for (rc, fy), months in sorted(by.items()):
        prev = by.get((rc, fy - 1))
        if len(months) != 12 or not prev or len(prev) != 12:
            continue
        a = sum(v for v, _, _ in months.values()) / 12
        b = sum(v for v, _, _ in prev.values()) / 12
        label = f"{fy}-{str(fy + 1)[2:]}"
        prov = any(s != "F" for _, s, _ in [*months.values(), *prev.values()])
        api_label = next(iter(months.values()))[2]
        rows.append({
            "region_code": rc, "indicator_id": "cpi_inflation", "dataset_id": "cpi_2012_fy",
            "period_label": label, "year": fy + 1, "value": round((a / b - 1) * 100, 2), "source_id": CPI_SRC,
            "source_table": "MoSPI eSankhyiki CPI API getCPIIndex (base_year=2012, series=Current, sector_code=3 combined), subgroup General-Overall, monthly index",
            "source_page": "api (all pages)", "date_pulled": TODAY, "break_before": 0,
            "note": f"Calculated by Tathya: mean of the 12 monthly CPI General Index values (base 2012=100, rural+urban) for April {fy} to March {fy + 1}, "
                    f"divided by the mean for April {fy - 1} to March {fy}, minus 1 (per cent; MoSPI's method for annual inflation). "
                    f"Means {a:.2f} and {b:.2f}."
                    + (" Includes provisional months." if prov else "") + f" State label in API: {api_label}",
        })
    return rows


# ---------- checks ----------

def existing(dataset_ids):
    out = {}
    for f in DATA.glob("series_*.csv"):
        if f.name == OUT.name:
            continue
        with f.open(encoding="utf-8-sig") as fh:
            for r in csv.DictReader(fh):
                if r["dataset_id"] in dataset_ids:
                    out[(r["dataset_id"], r["indicator_id"], r["region_code"], r["period_label"])] = float(r["value"])
    return out


def compare(name, pairs, tol):
    same = diff = 0
    worst = []
    for key, (a, b) in pairs.items():
        if a is None or b is None:
            continue
        if abs(a - b) <= tol:
            same += 1
        else:
            diff += 1
            worst.append((abs(a - b), key, a, b))
    print(f"  {name}: {same} match, {diff} differ (tolerance {tol})")
    for d, key, a, b in sorted(worst, reverse=True)[:8]:
        print(f"    {key}: in data/ {a}  API {b}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", default=str(Path(tempfile.gettempdir()) / "tathya-mospi-raw"))
    ap.add_argument("--only", default="nas,plfs,cpi")
    a = ap.parse_args()
    raw = Path(a.raw)
    raw.mkdir(parents=True, exist_ok=True)
    only = set(a.only.split(","))
    rows = []
    have = existing({"rbi_nsdp_pc_2011", "rbi_nsdp_pc_current", "plfs_ar", "plfs_cy_api"})

    if "nas" in only:
        r, chk = nas(raw)
        rows += r
        print(f"NAS: {len(r)} rows")
        compare("per-capita NSDP, constant 2011-12 (RBI Handbook vs API)",
                {k: (v, chk.get(("const", k[2], k[3]))) for k, v in have.items() if k[0] == "rbi_nsdp_pc_2011"}, 1)
        compare("per-capita NSDP, current prices (RBI Handbook vs API)",
                {k: (v, chk.get(("cur", k[2], k[3]))) for k, v in have.items() if k[0] == "rbi_nsdp_pc_current"}, 1)
    if "plfs" in only:
        r, chk = plfs(raw)
        rows += r
        print(f"PLFS: {len(r)} rows")
        ids = {"unemployment_rate": 3, "wpr": 2}
        compare("UR and WPR, July-June (annual reports read from PDFs vs API)",
                {k: (v, chk.get((ids.get(k[1]), "ay", k[2], k[3]))) for k, v in have.items() if k[0] == "plfs_ar" and k[1] in ids}, 0.05)
        compare("UR and WPR, calendar year (earlier API pull vs today's)",
                {k: (v, chk.get((ids.get(k[1]), "cy", k[2], k[3]))) for k, v in have.items() if k[0] == "plfs_cy_api" and k[1] in ids}, 0.05)
    if "cpi" in only:
        r = cpi(raw)
        rows += r
        print(f"CPI: {len(r)} rows. All-India average inflation by financial year:")
        for x in r:
            if x["region_code"] == "IN":
                print(f"    {x['period_label']}: {x['value']}%")

    # keep rows of parts not fetched this run
    if OUT.exists() and only != {"nas", "plfs", "cpi"}:
        keep_ids = {"nas": {"mospi_nas_state_2011"}, "plfs": {"plfs_ay_api", "plfs_cy_api"}, "cpi": {"cpi_2012_fy"}}
        drop = set().union(*(keep_ids[p] for p in only))
        with OUT.open(encoding="utf-8") as fh:
            rows = [r for r in csv.DictReader(fh) if r["dataset_id"] not in drop or r["source_id"] not in {NAS_SRC, PLFS_SRC, CPI_SRC}] + rows
    rows.sort(key=lambda r: (r["indicator_id"], r["dataset_id"], r["region_code"], int(r["year"])))
    with OUT.open("w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=COLS)
        w.writeheader()
        w.writerows(rows)
    print(f"Wrote {len(rows)} rows to {OUT.relative_to(ROOT)}; raw pages in {raw}")
    if UNMAPPED:
        print("State labels not matched to a region (skipped):", dict(UNMAPPED))


if __name__ == "__main__":
    main()
