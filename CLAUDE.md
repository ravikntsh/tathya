# Tathya: notes for Claude sessions

## GitHub account
This repo belongs to the **ravikntsh** account. The machine is also signed in as Raviknight, and other sessions may switch the active `gh` account.
- Git pushes are pinned to ravikntsh by the remote URL (`https://ravikntsh@github.com/ravikntsh/tathya.git`) and by `credential.https://github.com.username` in this repo's config. Don't change either.
- Run `gh` commands as ravikntsh without switching the global account: `GH_TOKEN=$(gh auth token --user ravikntsh) gh ...`. Never run `gh auth switch`.
- Commit identity is set in this repo's config: ravikntsh with the GitHub noreply email.

## Tooling
- No build step. Preview with `scripts/serve.ps1` (port 8080).
- Python: `C:\ProgramData\anaconda3\python.exe` (pandas, requests). Node: conda envs `forge` (v26) or `pmtracker-build` (v24).
- Map: `tools/build-map.html` (mapshaper in the browser), with sources in `geo/src/` (gitignored).
- Data: `data/series_*.csv` and `data/sources_*.json` → `scripts/data/build_seed.py` → `supabase/seed.sql` (the user runs it in the Supabase SQL Editor) and `data/observations.csv` (the site's local fallback). Fetch scripts are in `scripts/data/`. The site reads the snapshot by default (`?live=1` reads Supabase). `scripts/data/push_supabase.py` uploads to Supabase using the user's `SUPABASE_SECRET_KEY` environment variable: never print, log or ask for that key.

## Rules
Read `docs/requirements.md`. Revision 2 at the top overrides the rest. Never write a number you didn't read in a source. Keep each source as its own series.
