# Tathya

A source-first, mobile-first site on India's record, with what improved, where it lagged, and the official source behind every number. The full spec is in [docs/requirements.md](docs/requirements.md).

**Phase 1 (this branch): Development tracker.** It shows a state-wise India map for five NFHS indicators, with a slider across survey rounds, an all-India trend, the highest and lowest 5 states, two-state compare, a fact card with source, and share images and text.

## Run locally

No build step. Serve the folder and open http://localhost:8080:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/serve.ps1
```

## Data

| File | What |
|---|---|
| `data/nfhs_state.csv` | One row per state × indicator × round, with `source_url`, `source_page`, `publisher`, `date_pulled`, `archive_url` |
| `data/indicators.json` | Labels and definitions in English and Hindi |
| `data/regions.json` | States and UTs (codes, English and Hindi names) |
| `supabase/migrations/0001_tracker.sql` | Tables plus read-only row-level security |
| `scripts/build-seed.ps1` | Generates `supabase/seed.sql` from the files above |

The site reads from Supabase when `SUPABASE_ANON_KEY` is set in `js/config.js`, and falls back to the local files otherwise.

To load the data into Supabase:
1. In the Supabase SQL Editor, run `supabase/migrations/0001_tracker.sql`.
2. Run `scripts/build-seed.ps1`.
3. Run the generated `supabase/seed.sql` in the SQL Editor.

Rules:
- Every row carries its source.
- Never mix datasets in one line.
- Mark series breaks.
- Leave a value out rather than guess. Missing data shows as grey hatching.

## Map

`geo/india-states.topo.json` is built by `tools/build-map.html` (open it on the local server and press Build) from a January 2020 Survey-of-India-based state shapefile (AnujTiwari on GitHub, no licence yet) kept outside git in `geo/src/`.

**It has not been verified against the Survey of India map.** The site shows a banner until that review is done. See [docs/methodology.md](docs/methodology.md#map).
