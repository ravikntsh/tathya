"""Upload the site data to Supabase through its REST API.

Needs a secret key with write access, read from the environment variable
SUPABASE_SECRET_KEY (or, on Windows, the user-level variable set with setx).
The key is never printed, logged or written to disk. Run build_seed.py first.

    C:\\ProgramData\\anaconda3\\python.exe -I scripts/data/push_supabase.py

Steps: upsert regions, indicators, datasets and sources; delete all
observations; insert observations from data/observations.csv in batches;
check the row count. Table structure changes (migrations) still go through
the SQL Editor.
"""
import csv
import json
import os
import sys
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
URL = "https://hqueptmttyerlzpomfwy.supabase.co/rest/v1"


def secret_key():
    key = os.environ.get("SUPABASE_SECRET_KEY")
    if not key:
        # A local, git-ignored key file (see .gitignore: *SECRET*). Never commit it.
        f = ROOT / "supabase" / "SUPABASE_SECRET_KEY.txt"
        if f.exists():
            key = f.read_text(encoding="utf-8-sig").strip()
    if not key and sys.platform == "win32":
        # setx writes the user environment; read it directly so no restart is needed.
        import winreg
        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment") as k:
                key = winreg.QueryValueEx(k, "SUPABASE_SECRET_KEY")[0]
        except OSError:
            key = None
    if not key:
        sys.exit("SUPABASE_SECRET_KEY is not set. See the docstring of this script.")
    if key.startswith("sb_publishable_"):
        sys.exit("That is the publishable (read-only) key. Use the secret key.")
    return key


KEY = secret_key()
HEADERS = {"apikey": KEY, "Content-Type": "application/json"}
if KEY.startswith("eyJ"):  # legacy service_role JWT
    HEADERS["Authorization"] = f"Bearer {KEY}"


def call(method, path, body=None, prefer=None):
    h = dict(HEADERS)
    if prefer:
        h["Prefer"] = prefer
    r = requests.request(method, f"{URL}/{path}", headers=h, data=None if body is None else json.dumps(body), timeout=120)
    if not r.ok:
        sys.exit(f"{method} {path.split('?')[0]}: HTTP {r.status_code} {r.text[:300]}")
    return r


def upsert(table, rows, key="id"):
    for k in range(0, len(rows), 500):
        call("POST", f"{table}?on_conflict={key}", rows[k:k + 500], prefer="resolution=merge-duplicates,return=minimal")
    print(f"{table}: {len(rows)} upserted")


def load(name):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


regions = [{"code": r["code"], "kind": r["kind"], "name": r["name"]} for r in load("regions.json")]
indicators = [{
    "id": i["id"], "label": i["label"], "short_label": i["short_label"], "definition": i["definition"],
    "unit": i["unit"], "dataset": "multiple", "higher_is_better": i["higher_is_better"],
    "break_note": i.get("break_note"), "sort": i["sort"], "domain": i.get("domain"),
    "decimals": i.get("decimals", 1), "map_domain": i.get("map_domain"),
} for i in load("site_indicators.json")]
datasets = [{"id": d["id"], "label": d["label"], "provider": d["provider"], "class": d["class"], "chart": d.get("chart", True)}
            for d in load("site_datasets.json")]
sources = [{k: s.get(k) for k in ("id", "publisher", "title", "url", "class", "licence", "method", "coverage", "limitations", "last_checked")}
           for s in load("sources.json")]

with (DATA / "observations.csv").open(encoding="utf-8") as fh:
    obs = [{
        "region_code": r["region_code"], "indicator_id": r["indicator_id"], "dataset_id": r["dataset_id"],
        "period_label": r["period_label"], "year": int(r["year"]), "value": float(r["value"]),
        "source_id": r["source_id"], "source_table": r["source_table"] or None, "source_page": r["source_page"] or None,
        "date_pulled": r["date_pulled"], "break_before": str(r["break_before"]) == "1", "note": r["note"] or None,
    } for r in csv.DictReader(fh)]

upsert("regions", regions, "code")
upsert("indicators", indicators)
upsert("datasets", datasets)
upsert("sources", sources)
call("DELETE", "observations?id=gt.0", prefer="return=minimal")
print("observations: cleared")
for k in range(0, len(obs), 500):
    call("POST", "observations", obs[k:k + 500], prefer="return=minimal")
print(f"observations: {len(obs)} inserted")

got = call("GET", "observations?select=id&limit=1", prefer="count=exact").headers.get("content-range", "")
total = int(got.split("/")[-1]) if "/" in got else -1
print(f"check: Supabase has {total} observations (expected {len(obs)})")
sys.exit(0 if total == len(obs) else 1)
