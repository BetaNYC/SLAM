# What's changed

This page lists the changes to SLAM, the Street License and Activity Map, that a reader would notice: new pages and maps, new data, data fixes, and corrections when we published something wrong. Newest first. Routine data refreshes are not listed. SLAM began in 2018 as the SLA Mapper; entries before November 2026 are about that first SLAM, and they are one entry per release, taken from its change log, commits and issues.

- **History begins:** 2018-07-11, the first version in the first SLAM's change log. Work on SLAM started on June 29, 2018. Dates before November 2026 are the day the change log or the commit recorded the change. Corrections made before 2026 may be missing.
- **Data refresh:** nightly from NYC Open Data and data.ny.gov, since November 6, 2026

To report a bug in SLAM, or to ask for a new feature, [open an issue on GitHub](https://github.com/BetaNYC/SLAM/issues).

## 2026-11-08: Three more community districts: Brooklyn 1, Manhattan 6 and Bronx 2

- **Tags:** Data
- **What changed:** SLAM now covers six community districts: Manhattan 1 and 6, Bronx 2, and Brooklyn 1, 4 and 9. Boards are added one at a time when they ask, while SLAM is a prototype.
- **More detail:** [Brooklyn 1, Manhattan 6 and Bronx 2](https://github.com/BetaNYC/SLAM/pull/127) · [Brooklyn 9](https://github.com/BetaNYC/SLAM/pull/125)

## 2026-11-08: Addresses on a district line are listed in both districts

- **Tags:** Data
- **What changed:** An address within 100 feet of the line between two districts is now listed in both, and its page says so, for example "On the line between Brooklyn CD 3 and CD 4". SLAM also knows the 12 Joint Interest Areas, the large parks and airports outside every community district, so each can be listed as its own district later.
- **More detail:** [The change](https://github.com/BetaNYC/SLAM/pull/121)

## 2026-11-08: Every date and ID the State publishes for a liquor license

- **Tags:** Data, Site
- **What changed:** Each liquor license on an address page now shows every date and ID the State publishes for it, including when it was first issued and last issued. The State does not publish hours or method of operation, and the page says so.
- **More detail:** [The change](https://github.com/BetaNYC/SLAM/pull/120) · [Issue 63](https://github.com/BetaNYC/SLAM/issues/63)

## 2026-11-08: Easier to use with a keyboard and on a phone

- **Tags:** Site
- **What changed:** Wide tables can be scrolled with the keyboard, and on a phone they scroll sideways instead of squeezing their rows. On a phone the map opens with its Layers box closed, so the map is on the first screen. Every change to the site is now checked for accessibility before it goes live.
- **More detail:** [The change](https://github.com/BetaNYC/SLAM/pull/122) · [Issue 53](https://github.com/BetaNYC/SLAM/issues/53)

## 2026-11-07: Map: distance rings, a Reset button and clearer 311 dots

- **Tags:** Site
- **What changed:** The map can draw approximate distance rings around schools and houses of worship, grouped by license type: 200 feet for liquor licenses, and 500 or 200 feet for cannabis licenses. A "Reset to default" button puts the layers back the way the map opens. The dots for single 311 complaints are now solid with a dark edge, so they are easier to see. An address page has a "See on map" link that opens the map with the right rings on.
- **More detail:** [Distance rings](https://github.com/BetaNYC/SLAM/pull/113) · [Reset button](https://github.com/BetaNYC/SLAM/pull/115) · [311 dots](https://github.com/BetaNYC/SLAM/pull/117) · [See on map](https://github.com/BetaNYC/SLAM/pull/119)

## 2026-11-07: Cannabis applications are labeled as not yet issued

- **Tags:** Data, Site
- **What changed:** Rows the State marks "In-Process" in its cannabis license data are applicants with proximity protection, not issued licenses. They are now labeled "In process (not yet issued)" and listed first, and the Glossary explains the term. Before, they showed the State's raw status with a note at the bottom of the tab.
- **More detail:** [Issue 110](https://github.com/BetaNYC/SLAM/issues/110) · [The change](https://github.com/BetaNYC/SLAM/pull/112)

## 2026-11-07: SLAM is now the Street License and Activity Map

- **Tags:** Site
- **What changed:** SLAM keeps its name and its address, slam.beta.nyc. The letters now stand for Street License and Activity Map instead of SLA Mapper, because SLAM shows much more than liquor licenses.
- **More detail:** [The change](https://github.com/BetaNYC/SLAM/pull/109)

## 2026-11-05: 311 complaints run through the newest data, and the site rebuilds every night

- **Tags:** Data
- **What changed:** Each build now takes 311 complaints from January 1, 2022 through the newest the City has published, and the whole site is rebuilt from open data every morning.
- **More detail:** [Through the newest data](https://github.com/BetaNYC/SLAM/pull/103) · [Nightly updates](https://github.com/BetaNYC/SLAM/issues/90)

## 2026-11-05: 500-foot counts on 499 address pages were off, mostly by 1 to 3

- **Tags:** Data, Correction
- **What changed:** From November 4, 2026, when SLAM 2.0 went live, the count of other licensed places within about 500 feet of an address measured from two different kinds of points: the State's point for each license and the City's point for the building. From November 5, both ends of each distance use the City's point for the building, and 499 address pages show a different 500-foot count, mostly by 1 to 3. Boards use this count for the State's 500-foot rule.
- **If you used the old numbers:** If you used a count from November 4 or 5, 2026, re-check the address page.
- **Who it affects:** Anyone who used the 500-foot count on an address page in Manhattan Community District 1 or Brooklyn Community District 4 on those two days.
- **More detail:** [The fix](https://github.com/BetaNYC/SLAM/pull/98) · [Issue 96](https://github.com/BetaNYC/SLAM/issues/96)

## 2026-11-05: One page per address, with a link to each license in LAMP

- **Tags:** Data, Site
- **What changed:** Each license now opens on its own record in the State Liquor Authority's LAMP map. Map dots and LAMP links use the City's point for the building. Address pages now load as one page, and old address links still work.
- **More detail:** [City points](https://github.com/BetaNYC/SLAM/pull/98) · [LAMP links](https://github.com/BetaNYC/SLAM/pull/102) · [One address page](https://github.com/BetaNYC/SLAM/pull/99)

## 2026-11-05: Addresses are matched with the City's own address file

- **Tags:** Data
- **What changed:** Every address is matched to a building with the City's own address file before any other service is asked. In a citywide test, this matched 97.2% of active liquor licenses.
- **More detail:** [The change](https://github.com/BetaNYC/SLAM/pull/94)

## 2026-11-05: 311 complaints back to 2022, and an About page and Glossary

- **Tags:** Data, Site
- **What changed:** 311 complaints now start on January 1, 2022, and include the outdoor dining complaints the first SLAM showed. A new About page lists every source, and a Glossary explains every term. The map keeps its place when you go back, opens details in a side panel, and links each address to BetaNYC's Boundaries Map.
- **More detail:** [311 from 2022](https://github.com/BetaNYC/SLAM/pull/81) · [About and Glossary](https://github.com/BetaNYC/SLAM/pull/74) · [Map side panel](https://github.com/BetaNYC/SLAM/pull/76) · [Layers and Boundaries Map](https://github.com/BetaNYC/SLAM/pull/78)

## 2026-11-04: SLAM 2.0 replaces the first SLAM

- **Tags:** Site, Data
- **What changed:** By November 3, 2026, the first SLAM showed no data, because the map service it ran on was no longer available. SLAM 2.0 went live at slam.beta.nyc in its place, built from NYC and New York State open data with no hosted database. It started with two districts, Manhattan 1 and Brooklyn 4, and brought back address search, health grades, certificates of occupancy, schools and houses of worship nearby, and the license details boards used in the first SLAM.
- **Who it affects:** Anyone who used the first SLAM. Its code is kept on the main branch of the repository.
- **More detail:** [About SLAM](https://slam.beta.nyc/about/) · [The plan](https://github.com/BetaNYC/SLAM/issues/56) · [Going live](https://github.com/BetaNYC/SLAM/pull/68) · [Build notes](PROTOTYPE.md)

## 2023-01-07: Address search moves to the new GeoSearch

- **Tags:** Site
- **What changed:** The first SLAM moved to a newer build system and to version 2 of NYC Planning Labs' GeoSearch, the service behind its address search.
- **More detail:** [Commits from January 2023](https://github.com/BetaNYC/SLAM/commits/main/?since=2023-01-06&until=2023-01-08)

## 2022-09-21: A note about the State's license lookup

- **Tags:** Site
- **What changed:** The State took its public license lookup offline, and each license in SLAM linked to it. SLAM added a note beside that link, pointing to a records request to the State Liquor Authority and to BetaNYC's RADAR.
- **More detail:** [The commit](https://github.com/BetaNYC/SLAM/commit/0b0c4540)

## 2022-01-20: Fixed after State and City data changes

- **Tags:** Data
- **What changed:** SLAM was fixed after the State Liquor Authority changed its dataset's columns and the City changed its Geoclient service.
- **More detail:** [The commit](https://github.com/BetaNYC/SLAM/commit/bb6b8a31) · [Issue 41](https://github.com/BetaNYC/SLAM/issues/41)

## 2021-10-26: Links to the State's LAMP map

- **Tags:** Data, Site
- **What changed:** Each liquor license linked to the State Liquor Authority's LAMP map, and the license window showed its original, effective and expiration dates.
- **More detail:** [The commit](https://github.com/BetaNYC/SLAM/commit/5efdc56a)

## 2020-08-10: Liquor licenses were in the wrong place for about 12 minutes

- **Tags:** Data, Correction
- **What changed:** An update to the liquor license data swapped its two map coordinates, so licenses were drawn in the wrong place from about 4:12 to 4:24 pm New York time on August 10, 2020. In the same update the license dates were missing until about 4:44 pm. Both were fixed that afternoon.
- **If you used the old numbers:** Only a license location or date you looked up between about 4:12 and 4:44 pm that day could have been wrong.
- **More detail:** [The coordinate fix](https://github.com/BetaNYC/SLAM/commit/c58f76bf) · [The date fix](https://github.com/BetaNYC/SLAM/commit/d0974e4d)

## 2020-07-14: Open Restaurants and its 311 complaints (version 0.11e)

- **Tags:** Data, Site
- **What changed:** SLAM added the City's Open Restaurants applications and a layer of 311 complaints about open restaurants: NYPD social distancing and face covering complaints, sidewalk cafe complaints and DOT outdoor dining complaints. It could also find your own location when you first opened it.
- **More detail:** [The change log](https://github.com/BetaNYC/SLAM/blob/main/README.md#slam-v011e)

## 2020-02-13: SLAM is rebuilt, with district lines (version 0.10e)

- **Tags:** Site, Data
- **What changed:** Zhi Keng He rebuilt SLAM in Svelte. It added community district and City Council district lines, a new address search, and days, hours and method of operation in the license window, and kept its keys out of the public code.
- **More detail:** [The pull request](https://github.com/BetaNYC/SLAM/pull/32) · [The change log](https://github.com/BetaNYC/SLAM/blob/main/README.md#slam-v010e)

## 2019-08-09: Licenses show again, and searched addresses get a point (version 0.9e)

- **Tags:** Data, Site
- **What changed:** By July 18, 2019, SLAM showed no licenses, complaints or health grades, because the State had renamed its dataset's columns. It was fixed on August 8, 2019. A searched address also got a point on the map.
- **More detail:** [Issue 24](https://github.com/BetaNYC/SLAM/issues/24) · [The fix](https://github.com/BetaNYC/SLAM/pull/27) · [Issue 28](https://github.com/BetaNYC/SLAM/issues/28)

## 2018-11-14: Schools and churches on the map (version 0.8e)

- **Tags:** Data
- **What changed:** The shapes of schools and churches were added to the map.
- **More detail:** [Issue 22](https://github.com/BetaNYC/SLAM/issues/22) · [The change log](https://github.com/BetaNYC/SLAM/blob/main/README.md#slam-v08e)

## 2018-08-13: BetaNYC logo and a line chart of complaints (version 0.7e)

- **Tags:** Site
- **What changed:** SLAM added a BetaNYC logo and header, showed complaints by year as a line chart instead of a bar chart, and made the information boxes scroll on their own.
- **More detail:** [The change log](https://github.com/BetaNYC/SLAM/blob/main/README.md#slam-v07e)

## 2018-08-06: SLAM at slam.beta.nyc, with certificates of occupancy (version 0.6e)

- **Tags:** Site, Data
- **What changed:** SLAM moved to slam.beta.nyc. Each liquor license linked to the building's certificate of occupancy, the main box got instructions, and the layout was adjusted for phones.
- **More detail:** [Issue 8](https://github.com/BetaNYC/SLAM/issues/8) · [Issue 10](https://github.com/BetaNYC/SLAM/issues/10) · [The change log](https://github.com/BetaNYC/SLAM/blob/main/README.md#slam-v06e)

## 2018-07-11: The first SLAM, the SLA Mapper (version 0.5e)

- **Tags:** Site, Data
- **What changed:** Lindsay Poirier of BetaNYC built SLAM with and for community boards, to bring together the data a board gathers for a liquor license application: licenses, 311 complaints, health inspections and sidewalk cafes. This first recorded version added a location search bar, a color-coded legend, and the license classes boards review.
- **More detail:** [The change log](https://github.com/BetaNYC/SLAM/blob/main/README.md#slam-v05e) · [Issue 6](https://github.com/BetaNYC/SLAM/issues/6)
