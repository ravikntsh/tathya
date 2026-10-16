"""Fetch all-India series from the World Bank API and the Maddison Project.

Writes data/series_national.csv and data/sources_national.json. Re-runnable.
    C:\\ProgramData\\anaconda3\\python.exe -I scripts/data/fetch_national.py

Each World Bank indicator is kept as its own dataset (one provider per line on
a chart). The World Bank republishes other providers' data, so each source
entry names the original provider.
"""
import csv
import json
import sys
import tempfile
from datetime import date
from pathlib import Path

import pandas as pd
import requests

ROOT = Path(__file__).resolve().parents[2]
TODAY = date(2026, 10, 16).isoformat()
WORK = Path(tempfile.gettempdir()) / "tathya-nat"

# indicator_id on the site, World Bank code, dataset_id, original provider, caveat
WB = [
    ("electricity", "EG.ELC.ACCS.ZS", "wb_electricity",
     "World Bank (Energy Progress Report / SE4ALL), from household surveys and models",
     "Share of population with access to electricity. Modelled for years without a survey."),
    ("improved_water", "SH.H2O.BASW.ZS", "jmp_basic_water",
     "WHO/UNICEF Joint Monitoring Programme (JMP)",
     "'At least basic' drinking water: an improved source within a 30-minute round trip. Stricter than the NFHS 'improved source'."),
    ("improved_sanitation", "SH.STA.BASS.ZS", "jmp_basic_sanitation",
     "WHO/UNICEF Joint Monitoring Programme (JMP)",
     "'At least basic' sanitation: an improved facility not shared with other households. JMP estimates are modelled from surveys."),
    ("clean_fuel", "EG.CFT.ACCS.ZS", "who_clean_fuel",
     "World Health Organization (WHO Household Energy Database)",
     "Share of population (not households) primarily relying on clean fuels and technologies for cooking. Modelled."),
    ("women_bank_account", "FX.OWN.TOTL.FE.ZS", "findex_women_account",
     "World Bank Global Findex Database",
     "Women age 15+ with an account at a financial institution or mobile money. NFHS covers women 15-49 only."),
    ("life_expectancy", "SP.DYN.LE00.IN", "un_wpp_le",
     "United Nations World Population Prospects (UN DESA)",
     "UN estimates, revised with each WPP edition; differs from SRS life tables."),
    ("infant_mortality", "SP.DYN.IMRT.IN", "un_igme_imr",
     "UN Inter-agency Group for Child Mortality Estimation (UN IGME)",
     "Modelled estimates that smooth survey and SRS data; differs from SRS annual rates."),
    ("literacy", "SE.ADT.LITR.ZS", "unesco_adult_literacy",
     "UNESCO Institute for Statistics",
     "Adults age 15+, not the census age 7+ base. Sparse years only."),
]

MADDISON_FILE_ID = 421302  # mpd2023_web.xlsx on DataverseNL, doi:10.34894/INZBF2
MADDISON_URL = f"https://dataverse.nl/api/access/datafile/{MADDISON_FILE_ID}"

FIELDS = ["region_code", "indicator_id", "dataset_id", "period_label", "year", "value", "source_id",
          "source_table", "source_page", "date_pulled", "break_before", "note"]


def world_bank(rows, sources):
    for ind, code, dataset, provider, caveat in WB:
        url = f"https://api.worldbank.org/v2/country/IND/indicator/{code}?format=json&per_page=200"
        meta, data = requests.get(url, timeout=60).json()
        name = data[0]["indicator"]["value"] if data else code
        source_id = f"wb-{code.lower().replace('.', '-')}"
        n = 0
        for d in sorted(data, key=lambda d: d["date"]):
            if d["value"] is None:
                continue
            rows.append({
                "region_code": "IN", "indicator_id": ind, "dataset_id": dataset,
                "period_label": d["date"], "year": int(d["date"]), "value": round(float(d["value"]), 2),
                "source_id": source_id, "source_table": f"World Bank WDI {code}", "source_page": "",
                "date_pulled": TODAY, "break_before": 0, "note": "",
            })
            n += 1
        sources.append({
            "id": source_id, "publisher": f"World Bank WDI, original provider: {provider}",
            "title": name, "url": f"https://data.worldbank.org/indicator/{code}?locations=IN",
            "class": "B", "licence": "CC BY 4.0 (World Bank open data terms)",
            "method": caveat, "coverage": f"India, {n} annual values",
            "limitations": "Republished and sometimes modelled; check the original provider before using a single value in a claim.",
            "last_checked": TODAY, "api": url, "wb_last_updated": meta.get("lastupdated"),
        })
        print(f"{dataset}: {n} values", file=sys.stderr)


def maddison(rows, sources):
    WORK.mkdir(parents=True, exist_ok=True)
    path = WORK / "mpd2023_web.xlsx"
    if not path.exists():
        r = requests.get(MADDISON_URL, timeout=120)
        r.raise_for_status()
        path.write_bytes(r.content)
    df = pd.read_excel(path, sheet_name="Full data")
    ind = df[(df["countrycode"] == "IND") & df["gdppc"].notna()].sort_values("year")
    prev = None
    for _, r in ind.iterrows():
        y = int(r["year"])
        rows.append({
            "region_code": "IN", "indicator_id": "gdp_per_capita", "dataset_id": "maddison_gdppc",
            "period_label": str(y), "year": y, "value": round(float(r["gdppc"]), 0),
            "source_id": "maddison-2023", "source_table": "mpd2023_web.xlsx, sheet 'Full data', countrycode IND",
            "source_page": "", "date_pulled": TODAY,
            # Gaps of more than 10 years between estimates are marked so charts don't imply annual data.
            "break_before": 1 if prev is not None and y - prev > 10 else 0,
            "note": "Benchmark estimate; no annual data in between" if prev is not None and y - prev > 10 else "",
        })
        prev = y
    sources.append({
        "id": "maddison-2023", "publisher": "Maddison Project, Groningen Growth and Development Centre (University of Groningen)",
        "title": "Maddison Project Database 2023 (Bolt and van Zanden, 2024)",
        "url": "https://doi.org/10.34894/INZBF2", "class": "C", "licence": "CC BY 4.0",
        "method": "Historical GDP per capita in 2011 international dollars (PPP), compiled from national accounts and academic reconstructions. India before 1947: Broadberry, Custodis and Gupta (2015) for 1600-1871; Heston (1983) for 1870-1900; Maddison (1985) for 1900-46 (per the file's Sources sheets).",
        "coverage": f"India, {len(ind)} values, {int(ind['year'].min())}-{int(ind['year'].max())}",
        "limitations": "Long-run estimates carry wide uncertainty before 1950; benchmark years are not annual data. Cite: Bolt, J. and van Zanden, J.L. (2024), Journal of Economic Surveys, doi:10.1111/joes.12618.",
        "last_checked": TODAY,
    })
    print(f"maddison_gdppc: {len(ind)} values", file=sys.stderr)


def main():
    rows, sources = [], []
    world_bank(rows, sources)
    maddison(rows, sources)
    out = ROOT / "data" / "series_national.csv"
    with out.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(rows)
    (ROOT / "data" / "sources_national.json").write_text(json.dumps(sources, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {len(rows)} rows to {out}", file=sys.stderr)


if __name__ == "__main__":
    main()
