# Tathya

A source-first, mobile-first site on India's record, with what improved, where it lagged, and the source behind every number. The full spec is in [docs/requirements.md](docs/requirements.md).

**Phase 1: Development tracker.** It covers ten indicators: sanitation, electricity, clean cooking fuel, drinking water, women's bank accounts, literacy, life expectancy, infant mortality, GDP per person and state income per person. All-India lines go back to the 1850s where sources exist, and state maps start in 1951. Each source stays its own line on a chart. The page also has a fact card with the source, two-state compare, CSV download, and share images and text.

## Run locally

No build step. Serve the folder and open http://localhost:8080:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/serve.ps1
```

## Data

| File | What |
|---|---|
| `data/series_*.csv` | Observations: one row per region × indicator × dataset × period, with source id, table and page |
| `data/sources_*.json` | Source registry: publisher, URL, class (A to F), licence, method, coverage, limitations |
| `data/datasets.json` | One entry per consistent series from one provider |
| `data/indicators.json` | Labels, definitions, units and map scale (English and Hindi) |
| `data/regions.json` | States and UTs (codes, English and Hindi names) |
| `scripts/data/fetch_national.py` | Downloads the World Bank and Maddison Project series |
| `scripts/data/build_seed.py` | Checks every row, then writes `supabase/seed.sql`, `data/observations.csv` and `data/sources.json` |
| `supabase/migrations/` | Tables plus read-only row-level security |

The site reads from Supabase when `SUPABASE_ANON_KEY` is set in `js/config.js`, and falls back to the local files otherwise.

To load the data into Supabase:
1. In the Supabase SQL Editor, run `supabase/migrations/0001_tracker.sql`, then `0002_sources_and_series.sql`.
2. Run `C:\ProgramData\anaconda3\python.exe -I scripts/data/build_seed.py`.
3. Run the generated `supabase/seed.sql` in the SQL Editor.

Rules:
- Every row carries its source.
- Never mix datasets in one line.
- Mark series breaks.
- Leave a value out rather than guess. Missing data shows as grey hatching.

## Map

`geo/india-states.topo.json` is built by `tools/build-map.html` (open it on the local server and press Build) from a January 2020 Survey-of-India-based state shapefile (AnujTiwari on GitHub, no licence yet) kept outside git in `geo/src/`.

**It has not been verified against the Survey of India map.** The site shows a banner until that review is done. See [docs/methodology.md](docs/methodology.md#map).
