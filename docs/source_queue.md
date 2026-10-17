# Official-source queue

Events shown on the site with the tag "News report: official source pending". For each one, find a primary or official source that states the date: MEA statements and treaty texts, PIB, Parliament answers, Gazette notifications, the other country's foreign ministry, or UN records. Then add that source to `data/neighbours_events.json` and set `source_class` to `official`.

27 events as of 16 Oct 2026.

| Country | Date | Event | Current source | id |
|---|---|---|---|---|
| Afghanistan | 2015-12 | India-built Afghan parliament building inaugurated | Al Jazeera | `af-2015-parliament-building` |
| Afghanistan | 2016-05 | Chabahar trilateral transit agreement with Iran | Al Jazeera | `af-2016-chabahar-trilateral` |
| Afghanistan | 2016-06 | Salma Dam inaugurated by Modi | Al Jazeera | `af-2016-salma-dam` |
| Afghanistan | 2021-08 | Taliban return to power; India closes embassy | Al Jazeera | `af-2021-taliban-takeover` |
| Afghanistan | 2022 | Indian technical team runs Kabul mission | Al Jazeera | `af-2022-technical-team` |
| Afghanistan | 2025-01 | Foreign Secretary meets Taliban foreign minister in Dubai | Al Jazeera | `af-2025-misri-muttaqi-dubai` |
| Afghanistan | 2025-10 | Muttaqi visits New Delhi; India reopens Kabul embassy | Al Jazeera | `af-2025-embassy-reopened` |
| Afghanistan | 2025-11 | Indian aid after northern Afghanistan earthquake | Al Jazeera | `af-2025-earthquake-aid` |
| Bangladesh | 2011-09-06 | Protocol on land boundary; Teesta deal not concluded | Al Jazeera | `bd-2011-lba-protocol` |
| Bangladesh | 2015-06-06 | Land Boundary Agreement instruments exchanged | Al Jazeera | `bd-2015-lba-ratification` |
| Bangladesh | 2015-08-01 | Exchange of 162 enclaves takes effect | Al Jazeera | `bd-2015-enclave-exchange` |
| Bangladesh | 2024-08-05 | Sheikh Hasina resigns and flies to India | Al Jazeera | `bd-2024-hasina-leaves-for-india` |
| Bangladesh | 2025-11-17 | Hasina sentenced in absentia; Dhaka seeks her return | Al Jazeera | `bd-2025-hasina-verdict-extradition` |
| Myanmar | 2015-06-09 | Indian strikes on militant camps on Myanmar border | Al Jazeera | `mm-2015-cross-border-strikes` |
| Myanmar | 2024-02 | India ends Free Movement Regime, plans border fence | Al Jazeera | `mm-2024-fmr-ended-fencing` |
| Maldives | 2024-01-07 | Maldives suspends deputy ministers over remarks on Modi | Al Jazeera (with Reuters and AFP) | `mv-2024-deputy-ministers-suspended` |
| Nepal | 2015-09 | Border blockade and supply shortages in Nepal | Al Jazeera; Al Jazeera; Al Jazeera | `np-2015-border-blockade` |
| Nepal | 2020-05 | Kalapani-Lipulekh map dispute | Al Jazeera | `np-2020-map-dispute` |
| Pakistan | 1984-04-13 | Operation Meghdoot on the Siachen Glacier | Al Jazeera | `pk-1984-siachen` |
| Pakistan | 2003-11 | Ceasefire along the Line of Control | Al Jazeera; Al Jazeera | `pk-2003-loc-ceasefire` |
| Pakistan | 2016-09-18 | Attack on army base at Uri | Al Jazeera | `pk-2016-uri-attack` |
| Pakistan | 2016-09-29 | India announces strikes across the Line of Control | Al Jazeera | `pk-2016-surgical-strikes` |
| Pakistan | 2019-02-14 | Suicide bombing on CRPF convoy at Pulwama | Al Jazeera | `pk-2019-pulwama-attack` |
| Pakistan | 2019-08-07 | Pakistan downgrades ties after Article 370 change | Al Jazeera | `pk-2019-pakistan-downgrades-ties` |
| Pakistan | 2025-04-22 | Attack on tourists at Pahalgam | Al Jazeera; Al Jazeera | `pk-2025-pahalgam-attack` |
| Pakistan | 2025-04-23 | India holds Indus Waters Treaty in abeyance | Al Jazeera | `pk-2025-indus-treaty-abeyance` |
| Pakistan | 2025-05-07 | Operation Sindoor and four days of hostilities | Al Jazeera; Al Jazeera | `pk-2025-operation-sindoor` |

Also wanted but not yet sourced at all (not on the site): 1959 Dalai Lama asylum; Nathu La and Cho La clashes (1967); India-Burma Friendship Treaty (1951) and boundary agreement (1967); India-Maldives maritime boundary (1976); India-Pakistan non-attack of nuclear installations agreement (1988); Islamabad joint statement (2004); Bhutan's operation against ULFA camps (2003); Ganges water agreement (1977); Kushiyara MoU (2022); Operation Devi Shakti (2021).

## State Chief Ministers (data/state_governments.csv, not yet on the site)

755 rows are collected, but there are too many gaps to publish a map of who governed each state. To fill before publishing (an Indian network connection should reach the sites that blocked access from abroad):
- Gujarat after 1996; Delhi after 2015 (and Sheila Dikshit's end date); Telangana (party labels; split KCR's terms); Andhra Pradesh 1989-94, 2004-14 and 2019-24; Puducherry 1991-2021; Arunachal Pradesh 2003-2016.
- Party labels missing for J&K and Uttarakhand, most of Bihar, Odisha, West Bengal, Tamil Nadu, Jharkhand and Maharashtra, and Karnataka before 1972. Source: Election Commission results (eci.gov.in returned 406 from abroad) or assembly member records.
- Tamil Nadu and Jharkhand: confirm the current Chief Minister after the 2026 elections. Assam: Himanta Biswa Sarma's second term.
- Rows whose note says "END DATE NOT IN ANY SOURCE OPENED" must not be read as current.

## Leads from Indian Data Project (to verify at source)

Indian Data Project (indiandataproject.org; code at github.com/ronit111/indian-data-project, AGPL-3.0) is used here **only as a pointer to primary sources**. Never cite it and never copy its numbers or code. Its figures were hand-curated with AI help, and its own audit (pipeline/CURATED_DATA_AUDIT.md, March 2026) found and fixed errors, including 21 of 30 state immunisation values and a reversed sign for Mizoram's forest change. Every lead below must be read at the primary source before any number enters `data/`.

"Reach" means the host answered from this machine on 2026-10-17. Many .gov.in hosts block or reset connections from here.

### Best lead: MoSPI eSankhyiki API (official, no key)

- **What:** MoSPI's own data API at https://api.mospi.gov.in. The specs are published by MoSPI's National Statistics Office at github.com/nso-india/esankhyiki-mcp (MIT licence, folder `swagger/`).
- **Reach: yes.** It needs no sign-up. A test call returned state GSDP by year (base 2011-12) and GVA by industry.
- **32 datasets:**
  - National Accounts (NAS): national indicators 1-22; state GSDP, NSDP and GSVA are codes 23-34.
  - PLFS, CPI, WPI, IIP, Index of Service Production, ASI, ASUSE, Economic Census.
  - Energy Statistics, MNRE renewables, Environment Statistics.
  - NFHS, UDISE+, AISHE, Women and Men in India, Household Consumption Expenditure, Time Use Survey.
  - NSS rounds 71-80, including the debt and investment survey (AIDIS).
  - An RBI dataset.
- **Use for:**
  - Automating quarterly refreshes of national accounts, state GSDP/NSDP, PLFS jobs and prices.
  - Checking our NFHS, UDISE+ and AISHE figures.
  - New indicators: energy mix, renewables, environment, gender statistics.
- **Cautions:**
  - The API's state codes are its own (state_code 10 returned Himachal Pradesh), so map them explicitly.
  - Keep base 2011-12 and base 2022-23 as separate series.
  - Each dataset still needs its own entry in the source registry.
- verified: no (API reachable; no values taken yet)

### Topic leads

| Area | Primary source | URL | Coverage | Reach | Verified |
|---|---|---|---|---|---|
| Crime | NCRB, Crime in India (yearly; Table 1.1 totals, Part III court disposal Table 18A.1) | https://www.ncrb.gov.in/ | State-wise, yearly; 2023 edition published Oct 2025 | yes (home page) | no |
| Road deaths | MoRTH, Road Accidents in India (yearly) | https://morth.gov.in/ | State-wise, yearly | yes (home page) | no |
| State finances | RBI, Handbook of Statistics on Indian States (Tables 19-33: GSDP, revenue, deficits, debt) | https://www.rbi.org.in/Scripts/AnnualPublications.aspx?head=Handbook+of+Statistics+on+Indian+States | State-wise, long yearly series | yes (already a Tathya source) | no |
| Forest cover | Forest Survey of India, India State of Forest Report (2023); "forest cover" (21.76%) is not "forest + tree cover" (25.17%) | https://fsi.nic.in/isfr-2023 | State-wise, every two years | yes (redirects to fsi.nic.in/hindi/) | no |
| Air quality | CPCB (national air quality data); WHO Global Air Quality Database for city PM2.5 | https://cpcb.nic.in/ ; https://www.who.int/data/gho/data/themes/air-pollution | City/station level | yes | no |
| Power mix | Central Electricity Authority (installed capacity, generation by fuel) | https://cea.nic.in/ | National and state, monthly/yearly | yes | no |
| Elections | Election Commission of India (turnout, results, women candidates) | https://www.eci.gov.in/ ; https://results.eci.gov.in/ | Every election | eci.gov.in: no (406); results.eci.gov.in: yes | no |
| MPs' declared assets and criminal cases | ADR / MyNeta (from candidates' sworn affidavits; ADR is a civil-society analyst, class B) | https://www.myneta.info/LokSabha2024/ | Per election | yes | no |
| Health infrastructure | CBHI, National Health Profile (yearly); MoHFW Rural Health Statistics | https://cbhidghs.mohfw.gov.in/ | State-wise, yearly | no (connection failed) | no |
| Schools | UDISE+ report (Tables 2.2, 6.1); GER methodology changed in 2022-23, so values over 100% before then are not comparable | https://udiseplus.gov.in/ | State-wise, yearly | yes | no |
| Learning levels | ASER (Pratham; civil-society survey, class B) | https://asercentre.org/ | State-wise, rural, every 2 years | not tested | no |
| Union Budget | Annual Financial Statement and Budget at a Glance | https://www.indiabudget.gov.in/ | Yearly | yes | no |
| NFHS-5 machine-readable check | github.com/pratapvardhan/NFHS-5 (CC-BY-4.0 CSV of the NFHS-5 fact sheets): use only to cross-check our NFHS-5 values, never as the cited source | https://github.com/pratapvardhan/NFHS-5 | NFHS-5 states and districts | yes | no |

Design ideas seen there, to do in Tathya's own style: a "per citizen per day" figure for the Union Budget; a crime funnel from cases reported to charge-sheets to convictions; one headline number per section on the home page.
