# Methodology: development tracker

## Data

- **Source:** National Family Health Survey (NFHS), conducted by the International Institute for Population Sciences (IIPS) for the Ministry of Health and Family Welfare. Each value links to the official fact sheet PDF it was read from.
- **Rounds:** NFHS-4 (2015-16) and NFHS-5 (2019-21). Both rounds come from the NFHS-5 state fact sheets, which print the two side by side. That keeps each line to one dataset and one set of definitions, with no mixing.
- **Two NFHS-5 phases:** 22 states and UTs were surveyed in Phase I (fact sheets print 2019-20), and India plus 14 states and UTs in Phase II (2020-21; India 2019-21). Each row keeps the years printed in its own fact sheet.
- **Where the PDFs came from:** the official NFHS site (rchiips.org/nfhs) no longer serves these fact sheets. Phase I values were read from the MoHFW National Health Mission copy of the compendium (nhm.gov.in). Phase II values were read from the IIPS compendium as hosted by The DHS Program (ICF, IIPS's partner on NFHS). Both are the official IIPS documents, not reworked versions.
- **Provisional:** the fact sheets are provisional results. The NFHS-5 national report is the final version, and any differences found will go in the correction log.
- **Survey estimates:** these are household survey results with sampling error, not administrative counts. Small differences between states, or between rounds, may not be meaningful. A "real change or chance" test is planned for phase 3.
- **What these indicators are not:**
  - "Improved drinking-water source" is not a household tap connection (Jal Jeevan Mission).
  - "Clean cooking fuel" measures fuel actually used, not LPG connections (Ujjwala).
  - "Women's own bank account" is not the Jan Dhan account total.
  
  Those scheme dashboards will be added as separate lines once their state-wise historical data is confirmed downloadable.
- **Archived copies:** every row has an `archive_url` field. Archiving is pending, and the fact card says so until it's done.

## Map

- **Development boundaries:** the January 2020 state and UT boundary shapefile from github.com/AnujTiwari/India-State-and-Country-Shapefile-Updated-Jan-2020, which says it follows Survey of India records. It already has the 2019 J&K and Ladakh UTs (Gilgit-Baltistan and Aksai Chin in Ladakh, PoK in J&K) and the 2020 DNH-DD merger. `tools/build-map.html` reprojects and simplifies it.
- **Licence:** that repository has no licence. Get the author's permission, or replace it with the Survey of India file, before launch.
- **Not yet verified:** the map carries a "not yet verified against Survey of India" banner (`MAP_VERIFIED` in `js/config.js`). That stays until someone who knows the current Survey of India guidelines has checked it against the official political map.

## Colour

- **Coverage scale:** one hue, light to dark navy, in fixed 20-point bands (0-20, 20-40, 40-60, 60-80 and 80-100%). Because the bands are fixed, moving the slider shows real change rather than a rescaled map.
- **No data:** shown as grey hatching, never as a colour from the scale.
