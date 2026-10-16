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

## Long-run and multi-source data (Phase 1b)

- **One source per line.** Each line on a chart is one dataset from one provider. When two sources measure the same thing differently, they appear as separate lines and are never spliced together. The dataset ids are listed in `data/datasets.json`, and each source's publisher, URL, class, licence, method and limits are in `data/sources_*.json`.
- **Before 1947.** India-level only:
  - Census literacy (literates per 1,000, 1881-1971, Census 1971 Monograph 9)
  - Census actuarial life expectancy for men and women separately (1881-1970). No persons figure is printed for most periods, so we don't compute one.
  - Infant mortality from British India registration (1921-46, Census 1941 Paper 3). Registration was incomplete, so these figures are not comparable with SRS.
  - Maddison Project GDP per person
  
  Territory before 1947 is British India or a set of provinces, as each source states. Partition (1951) and changes in definition are marked as breaks.
- **State series since 1951.** Literacy, SRS infant mortality, SRS life expectancy and per capita NSDP come from the RBI Handbook of Statistics on Indian States. Literacy is from the 2023-24 edition; the others are from 2024-25.
  - Undivided Andhra Pradesh, and J&K including Ladakh, are marked in each row's note.
  - The literacy age base changes in 1981, from 5+ to 7+, and is shown as a break.
- **Where sources overlap, primary documents win.** The India rows for SRS infant mortality and life expectancy appear both in ORGI's own reports and in the RBI Handbook. `build_seed.py` keeps the ORGI figure and lists every difference. As of 16 Oct 2026 there is one: the RBI Handbook 2024-25, Table 7, prints All-India life expectancy for 1994-98 as 62.6, the same as its Andhra Pradesh row. ORGI's SRS Abridged Life Tables print 61.4. We use 61.4.
- **International series** (World Bank, WHO/UNICEF JMP, WHO, Findex, UN WPP, UN IGME, UNESCO) are republished or modelled estimates. Each source entry names the original provider. They measure slightly different things from the Indian surveys (for example, population instead of households, or adults 15+ instead of age 7+), and the definition box says so.

## Map

- **Development boundaries:** the January 2020 state and UT boundary shapefile from github.com/AnujTiwari/India-State-and-Country-Shapefile-Updated-Jan-2020, which says it follows Survey of India records. It already has the 2019 J&K and Ladakh UTs (Gilgit-Baltistan and Aksai Chin in Ladakh, PoK in J&K) and the 2020 DNH-DD merger. `tools/build-map.html` reprojects and simplifies it.
- **Licence:** that repository has no licence. Get the author's permission, or replace it with the Survey of India file, before launch.
- **Not yet verified:** the map carries a "not yet verified against Survey of India" banner (`MAP_VERIFIED` in `js/config.js`). That stays until someone who knows the current Survey of India guidelines has checked it against the official political map.

## Colour

- **Coverage scale:** one hue, light to dark navy, in fixed 20-point bands (0-20, 20-40, 40-60, 60-80 and 80-100%). Because the bands are fixed, moving the slider shows real change rather than a rescaled map.
- **No data:** shown as grey hatching, never as a colour from the scale.
