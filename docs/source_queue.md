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
