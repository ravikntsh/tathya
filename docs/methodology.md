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
- **NFHS-6 (2023-24).** Read from the official NFHS-6 Fact Sheets (nfhsiips.in). The copy the editor supplied is byte-identical to the official file. It covers India and 35 states/UTs; Manipur was not surveyed. The NFHS-6 fact sheets do not print sanitation or cooking fuel. Their NFHS-5 comparison column matches our NFHS-5 data in all 108 cases checked.
- **NFHS-1 to NFHS-5 via the DHS Program API.** The DHS Program (ICF) recalculates NFHS indicators to its own standard definitions:
  - Electricity and water are per person.
  - Sanitation counts shared toilets as improved, so it is its own line and not the fact-sheet series.
  - Open defecation uses the same definition in all five rounds.
  
  For NFHS-4 and 5, the DHS values for electricity, water, cooking fuel and bank accounts are within 0.1 point of the fact sheets. Pre-2000 rounds show undivided Bihar, MP, UP and AP, and J&K includes Ladakh until NFHS-5; these are marked as breaks.
- **NFHS-1 to 3 India reports.** "Any toilet" (1992-2006) and women's bank accounts (NFHS-3) were read from the printed India reports. NFHS-1 is a scanned report, so its values are lower-confidence.
- **International series** (World Bank, WHO/UNICEF JMP, WHO, Findex, UN WPP, UN IGME, UNESCO) are republished or modelled estimates. Each source entry names the original provider. They measure slightly different things from the Indian surveys (for example, population instead of households, or adults 15+ instead of age 7+), and the definition box says so.

## Percentages calculated from official counts

For the 1991 and 2011 Census, ORGI publishes state household amenity tables as **counts**, not percentages. Tathya calculates the percentage as

> value = round(100 × households with the amenity ÷ total households, 1)

with the numerator and denominator both taken from the same official table and the same Total row. For Dadra & Nagar Haveli and Daman & Diu, the counts for the two former UTs are added up before dividing.

Each calculated row's note starts with "Calculated by Tathya from Census counts" and names the columns, the table and the file. Fact cards and share images carry the label "percentage calculated by Tathya from official Census counts".

Before any row was used, the same formula was run on every case where ORGI also prints a percentage, and the results were compared.

## Combined map view ("All sources")

The map's default view combines every source that has state data for an indicator. The slider moves through each year that any source covers. For each state and year:
- **Source order:** the first real figure found, taking official (class A) sources first, then other sources, newest first. A figure dated within one year counts, because NFHS rounds were fielded across two years.
- **Showing the source:** the fact card names the source of the figure, so mixing sources is visible, never hidden.
- **Two-state compare:** each state's line uses one source only (the first in that order with at least two points), and the line's label names it.
- **Rankings:** Top 5 and Bottom 5 use real figures only. Estimates stay on the map, marked with a star.

A single source can still be chosen from the map's source menu.

## Gaps filled with starred (*) estimates

On the map, when a state has no figure for the round or year shown, Tathya fills it with an estimate and marks it with a **\***. The state is also faded with a dashed edge. A note under the map explains the star.

1. **The state's own data in the same source** comes first: a straight line between its real points, or its recent trend after the last one (method below).
2. **If that isn't possible, the same indicator from another source** that covers the state. For example, Manipur was not surveyed in NFHS-6, so its value comes from the DHS series of NFHS-1 to 5. The card names the source used.
3. **India, when the source has no All-India figure** (for example, per capita state income): the population-weighted average of the states shown, using Census populations (RBI Handbook 2023-24, Table 1) for the census year at or before the year shown.
   - It needs at least 80% of India's population covered.
   - After 2014 Andhra Pradesh and Telangana are left out, and after 2019 J&K and Ladakh, because Census populations exist only for the undivided states.
   - An official India figure, where one exists, is always used instead.

No star is ever shown before a state's first real data point.

## Estimates (off by default)

The reader can turn on "Show estimates for years without data". When it's on, the map slider moves year by year, and years without real data are filled with estimates. **An estimate is never data.** On the map it is faded with a dashed edge, and in rankings and cards it is marked ≈. Estimates can be shared, but every shared image carries an "ESTIMATE · NOT OFFICIAL DATA" stamp, a ≈ value, the method, the 90% range (for trends) and the real data points it is based on. The estimated bar is drawn as a dashed outline. Shared text begins with the same label, and links reopen the page in estimates mode.

- **Between two real data points** of the same series: a straight line. If a definition or territory changes between the two points, there is no estimate across that gap.
- **After the latest point:** a trend through the latest (up to) five points of the latest unbroken segment, with a 90% prediction interval. It needs at least three points.
  - **Scale:** the trend is fitted on a logit scale for percentages, so it flattens near 0% and 100%, and on a log scale for rates per 1,000 such as infant mortality, so it stays above zero. Other indicators use a straight line.
  - **How far:** only series whose latest point is within 15 years are extended, and at most 15 years past that point, and never beyond four years from today. A series that ended in 1946 is never projected.
  - **Too uncertain:** if the 90% range is wider than the estimate itself, no estimate is shown. This happens for small states whose yearly figures swing widely.
- **Same-source fallback:** where neither of the above works (the year sits across a break, or the state's latest stretch has fewer than three points), the state moves with India's figures in the same source, keeping the gap to India it had at its nearest real figure (on the same logit or log scale). India's figures are interpolated between that source's rounds and never extended past its last round. The gap is held for at most 15 years. Example: Madhya Pradesh in 2002, between undivided MP in NFHS-2 (1998-99) and today's MP in NFHS-3 (2005-06).
- **Across a break, as a last resort (maps only):** if a state still has no estimate, a straight line between its nearest real figures on either side, even though the series breaks between them, as long as they are at most 12 years apart. The card says the two figures are not fully comparable. Example: Uttar Pradesh in 2002, between undivided UP in 1998-99 and today's UP in 2005-06. Charts never draw a line across a break.
- **States created by a split, before the split:** where the source has no figure for the undivided state that year, the child state shows the undivided state's estimate, starred and labelled "estimate for undivided ...". Example: Telangana in 2013 shows undivided Andhra Pradesh.
- **No estimates before the first real data point** (of the state, or of the undivided state it was part of).

## Map

- **Development boundaries:** the January 2020 state and UT boundary shapefile from github.com/AnujTiwari/India-State-and-Country-Shapefile-Updated-Jan-2020, which says it follows Survey of India records. It already has the 2019 J&K and Ladakh UTs (Gilgit-Baltistan and Aksai Chin in Ladakh, PoK in J&K) and the 2020 DNH-DD merger. `tools/build-map.html` reprojects and simplifies it.
- **Licence:** that repository has no licence. Get the author's permission, or replace it with the Survey of India file, before launch.
- **Not yet verified:** the map carries a "not yet verified against Survey of India" banner (`MAP_VERIFIED` in `js/config.js`). That stays until someone who knows the current Survey of India guidelines has checked it against the official political map.

## Colour

- **Coverage scale:** one hue, light to dark navy, in fixed 20-point bands (0-20, 20-40, 40-60, 60-80 and 80-100%). Because the bands are fixed, moving the slider shows real change rather than a rescaled map.
- **No data:** shown as grey hatching, never as a colour from the scale.
