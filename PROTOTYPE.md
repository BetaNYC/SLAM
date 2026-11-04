# SLAM v2 prototype (rough, local)

Built overnight 2026-11-04 as a rough first cut of SLAM v2 (epic #56). Two community
districts only: **Manhattan CD 1** (`boro_cd` 101) and **Brooklyn CD 4** (`boro_cd` 304).
The v1 app at the repo root is untouched; all new work is in `pipeline/` and `site/`.

## Run it

Requirements: [uv](https://docs.astral.sh/uv/) (Python 3.11 to 3.15 is fine) and Node 22.17+.
Tested on Node 26.13.0, npm 11.20.0, uv 0.12.22, Python 3.14.10 and 3.11.15.

```sh
# 1. Pipeline: fetch NYC + NYS open data, write site/static/data/
#    (about 20-50 s live, plus about 9 min the first time to geocode every address page)
cd pipeline
uv sync
uv run python build.py             # live fetch (anonymous, read-only)
uv run python build.py --offline   # rebuild from pipeline/.cache/raw, no network
uv run pytest -q                   # 64 tests against recorded real responses

# 2. Site: static SvelteKit build (prerenders ~1,300 address pages)
cd ../site
npm install
npm test                           # node --test, 34 tests (ten read the built static/data, one the built site/build)
npm run check                      # svelte-check
npm run build                      # writes site/build/

# 3. Serve the static build
cd build && /usr/bin/python3 -m http.server 4173 --bind 127.0.0.1   # Homebrew python3's http.server hung on office-mac
# open http://127.0.0.1:4173/
```

The site build reads `site/static/data/`, so run the pipeline before the first build.
`site/static/data/`, `site/build/` and `pipeline/.cache/` are git-ignored.

## What works

| Part | Where | Issue |
|---|---|---|
| Pull and schema-check 8 sources + district polygons. Every selected field is checked against the portal's `/api/views/<id>.json` before rows are fetched; the run fails loudly if one is missing. Paged SoQL (`$limit`/`$offset`/`$order`). | `pipeline/slam_pipeline/sources.py`, `net.py`, `transform.py` | #47 |
| Geocode OCM licenses (`jskf-tt3q`, no coordinates) with NYC GeoSearch v2, at most 4 req/s, cached in `pipeline/.cache/geocode.json`. A hit is accepted only if confidence >= 0.8, accuracy `point`, and the house number matches. License rows already in the retail-dealer list (`gttd-5u6y`) are deduped by license number. | `build.py` `geocode_cannabis`, `transform.accept_geosearch` | #48 |
| District join with DuckDB spatial (`ST_Contains`), per-address grouping, nearby within 150 m (`ST_Distance_Sphere`), `manifest.json` with per-source counts and each portal's `rowsUpdatedAt`. Safe to re-run: outputs rewritten whole, geocode cache only grows, stale address files are moved to `.cache/orphaned-address/`. | `build.py` | #49 (partly) |
| Home, "My district" list with tabs (Liquor: pending, active, inactive on request; Cannabis; Dining Out; Street events; 311 complaints), filter box, client-side CSV of the current tab, address page with "at this address" + "nearby", links to SLA LAMP, Dining Out NYC and each dataset, print stylesheet. | `site/src/routes/` | #50 |
| Map: MapLibre GL JS 6 + OpenFreeMap "liberty" style, district outline, one toggle per layer, click a point to open its address page, "View as list" link, attribution shown by MapLibre. | `site/src/routes/[district]/map/` | #51 |
| 311 complaints at bar/club/restaurant locations: district tab (count by type x year plus the 200 most recent, filter + CSV), address-page section (by type x year and the 10 most recent at the address; counts by type within 150 m), map layer off by default and fetched only when switched on. See "311 complaints" below. | `sources.py` `complaints_311`, `transform.py` `normalize_311` etc., `site/src/lib/CountTable311.svelte`, `Complaints311Table.svelte`, `popup311.js` | #47 (source), #50, #51 |
| Address search (one box in the header of every page) and address pages keyed on BIN. See "Address search" below. | `site/src/lib/AddressSearch.svelte`, `addressSearch.js`; `build.py` `geocode_addresses`; `transform.py` `pick_address_hit`, `key_pages` | #59 |
| Restaurant health grades: "Health inspections" on the address page (latest grade, grade history, ABC Eats link per restaurant), "Health grades" tab on the district page (counts by current grade, grade filter, table, CSV). See "Health inspections" below. | `sources.py` `restaurant_inspections`, `transform.py` `reduce_inspections`, `grade_bucket`, `place_restaurant` | #61 |
| Certificate of occupancy: the address page shows the BIN (or "No BIN found"), links DOB BIS's CO listing for that BIN, points to DOB NOW for COs since March 2021, and lists DOB NOW CO records for the BIN. No Geoclient. See "Certificate of occupancy" below. | `sources.py` `co_dobnow`, `transform.py` `normalize_co`, `page_co_bin`; `site/src/lib/format.js` `coBisUrl` | #62 |
| Schools and houses of worship (#60): address-page section with schools (FacDB), houses of worship (PLUTO M1) and other religious property (PLUTO M2–M4, M9) within about 200 ft, the count and list of active on-premises liquor licenses within about 500 ft, and a box quoting ABC Law §64(7) and how SLA measures. Map layer, off by default. Facts only, no verdict. See "Schools and houses of worship" below. | `sources.py` `schools`, `worship`, `SLA_RULES`; `slam_pipeline/spatial.py`; `transform.py` `is_on_premises_liquor` etc.; `site/src/lib/popupSW.js` | #60 |
| SLA license record (#63, part): each liquor license on the address page and the district Liquor tab shows its SLA ID and raw `type` / `class`, and links "Show on the SLA's LAMP map" at the license's own point. A note names the dataset fields, says what the LAMP link is and isn't, and says where hours and conditions live (Full Board minutes). No hours or method are shown: no open source has them. See "SLA license record" below. | `sources.py` `SLA_LICENSE`; `transform.py` (`ltype`, `lclass`); `site/src/lib/format.js` `lampUrl`; `site/src/lib/SlaLicenseNote.svelte` | #63 |
| Accessibility basics: skip link, semantic tables with `<caption>` and `scope`, labelled inputs, ARIA tabs with arrow keys, visible focus ring, works at 360 px (tables scroll sideways). | throughout | #53 (partly) |

## Stubbed or missing

- **No history, so no "new this week" badge** and no weekly digest (#52). Each run is a snapshot.
- **Deploy** (#49, partly): `.github/workflows/v2-deploy.yml` runs the pipeline tests, a live
  pipeline build, the site tests, svelte-check and the site build, then publishes `site/build` to
  the `gh-pages` branch, which GitHub Pages serves at **slam.beta.nyc** (this replaced SLAM v1 on
  2026-11-04). It runs on every push to `v2` and by hand (Actions > "SLAM v2 build and deploy" >
  Run workflow). The nightly `schedule` only fires from the default branch (`main`), so it is not
  active yet. The GeoSearch caches are carried between runs with `actions/cache`; raw pulls are
  fresh each run. If a step fails, nothing is published and the last good site stays up. No
  failure alerts yet. The old v1 workflow (`deploy-to-gh-pages.yml`, on push to `main`) is still on
  `main`; a push to `main` would put v1 back.
- **No automated accessibility testing** (#53): no axe in CI, no screen-reader pass. Only checked by eye at 360 px and 1280 px.
- **Pending cannabis**: there is no pending-applications dataset like SLA's. The closest signal is OCM license rows with `license_status` "In-Process", which are shown in the Cannabis tab.
- **Street events** (`tvpp-9vvx`) are approved permits only and have **no coordinates**, so they are list-only and not on the map or on address pages. Each row is one occurrence; one permit (`event_id`) can repeat. Sports permits are hidden by default (toggle to show).
- **Nearby only sees the two districts.** An address near a district edge will not list neighbors across the line.
- **Address search gaps** (#59): 144 of 1,302 address keys come back "low confidence" and keep a street + ZIP page (house ranges like `599-603 BUSHWICK AVE`, `AKA` addresses, `ST NICHOLAS` vs GeoSearch's `SAINT NICHOLAS`, half numbers). 2 return nothing. GeoSearch autocomplete ranks citywide with no focus point, so "1 Centre Street" suggests a Bronx address first. 311 complaints still match a page only by street + ZIP key (now remapped to the BIN page); they are not geocoded themselves. The nearest-page fallback (30 m) can land on a neighbor on a dense block; the page says so and gives the distance. No screen-reader pass yet; axe found 0 violations.
- **Address grouping is a simple normalizer** (uppercase, suffixes, drop unit designators such as `Ste`/`Fl`/`Store`). It will miss some matches and could rarely merge two. Retail-dealer addresses that start with the store name are trimmed only when the name starts with a letter (`7 LEAF CLOVER 132 METROPOLITAN AVE` is left as is).
- **Geocoding**: 7 of 145 OCM addresses were rejected by the acceptance rule and are unmapped (they still appear in lists marked "not mapped").
- **Size**: the static build is about 93 MB (68 MB before #61, #62 and #60), mostly per-address `index.html` and `__data.json`. Fine locally; worth slimming before hosting.
- **No base path** is configured, so the build assumes it is served from `/`, which is how slam.beta.nyc serves it.
- The OpenFreeMap style logs three MapLibre warnings about highway-shield filters; they come from the style, not this code.

## Sources (all verified from `/api/views/<id>.json`, 2026-11-04)

| Key | Dataset | Filter |
|---|---|---|
| districts | NYC `5crt-au7u` Community Districts | `boro_cd in (101,304)` |
| liquor_pending | NYS `f8i8-k2gm` Current SLA Pending Licenses | `premises_county in ('New York','Kings')` |
| liquor_active | NYS `9s3h-dpkz` Current Liquor Authority Active Licenses | `premisescounty in (...)` |
| liquor_inactive | NYS `6dg3-2z7i` Current SLA Inactive Licenses | `premises_county in (...)` |
| cannabis_retail | NYS `gttd-5u6y` Registered Retail Dealers of Adult-use Cannabis | `physical_county in ('NEW YORK','KINGS')` (upper case in this dataset) |
| cannabis_license | NYS `jskf-tt3q` Current OCM Licenses | `county in (...)`; `primary_contact_name` is never selected |
| dining_out | NYC `fpeh-f7ci` Dining Out NYC Locations | `community_board in (101,304)` (the City's own assignment; agrees with point-in-polygon 98/98) |
| street_events | NYC `tvpp-9vvx` NYC Permitted Event Information | `event_borough in ('Manhattan','Brooklyn')`, then board split in Python |
| restaurant_inspections | NYC `43nn-pn8j` DOHMH New York City Restaurant Inspection Results | `community_board in ('101','304')` (text here) |
| co_dobnow | NYC `pkdm-hqz6` DOB NOW: Certificate of Occupancy | `community_board in (101,304)` (number here) |
| schools | NYC `ji82-xba5` Facilities Database (26v1) | `facgroup = 'SCHOOLS (K-12)'` and four subgroups (below), inside the districts' box + 600 ft |
| worship | NYC `64uk-42ks` PLUTO (26v2) | `bldgclass in ('M1','M2','M3','M4','M9')`, inside the districts' box + 600 ft |
| liquor_active_extra_counties | NYS `9s3h-dpkz` SLA Active Licenses | `premisescounty in ('Queens','QUEENS')` and `within_box(georeference, …)` of the districts' box + 600 ft; used only for the 500-ft count |
| complaints_311 | NYC `erm2-nwe9` 311 Service Requests from 2020 to Present | `location_type in ('Club/Bar/Restaurant','Restaurant/Bar/Deli/Bakery') AND created_date >= '2024-01-01' AND community_board in ('01 MANHATTAN','04 BROOKLYN')`; start date is `COMPLAINTS_311_START` in `sources.py` |

## 311 complaints

Run of 2026-11-04 (live, then `--offline`, same numbers):

| | MN CD 1 | BK CD 4 |
|---|---|---|
| Rows fetched (311's own `community_board`) | 3,683 | 4,757 |
| Inside the district polygon (shown) | 3,683 | 4,753 |
| 2024 / 2025 / 2026 to date (through 2026-11-01) | 1,527 / 1,200 / 956 | 1,854 / 1,641 / 1,258 |

- **District = point-in-polygon**, like the other layers. 311's `community_board` agrees with it for
  8,436 of the 8,436 points that fall inside a polygon. 4 BK rows fall inside neither: all are
  street-only addresses (`CYPRESS AVENUE`, `BROADWAY`, no house number) whose point is on the
  boundary street itself (0 m from the line). Every fetched row had coordinates.
- **"At this address" = normalized `incident_address` + ZIP equals the address page's key** (the same
  `address_key` the license layers use). Chosen over a 25 m radius because 25 m reaches the next
  buildings on a dense block: across the run, 5,108 complaints match an address page by key, while
  7,561 sit within 25 m of some address page point. Tested in `test_311_address_matches_license_address_key`.
- **Nearby** = complaints whose point is within 150 m of the address page's point, minus the ones
  counted at the address; shown as counts by type only.
- **Map**: 311 dots live in `site/static/data/<district>/points-311.geojson` (650 to 860 KB), loaded on
  first toggle. A dot opens the address page it is matched to (by the key above), otherwise a popup with
  date, type and address. "Nearest address page" was interpreted as "the page this complaint is counted
  on", so a click never opens a page that does not list the complaint.
- **Fields kept**: unique_key, created_date, agency, complaint_type, descriptor, incident_address,
  incident_zip, status, latitude, longitude, plus community_board for the agreement check only (not
  written to the site). No resolution text.
- **Gaps**: fixed in #59: 44 Wilson Ave used to have two pages (SLA rows carry 11207 on one and
  11237 on the other). Both keys now resolve to BIN 3071959, so there is one page with both licenses,
  627 complaints at it and 36 nearby. Intersection-only complaints are never "at" an address.
  2010 to 2019 (`76ig-c548`) is not pulled. A complaint is a report to 311, not a finding, and the pages say so.

## Health inspections (#61)

Run of 2026-11-04 (live, then `--offline`, same numbers):

| | MN CD 1 | BK CD 4 |
|---|---|---|
| Restaurants (one per `camis`) | 918 | 434 |
| On an address page by BIN | 685 | 266 |
| On an address page by location (≤ 30 m, same street address) | 11 | 1 |
| Not on an address page (district tab only) | 222 | 167 |
| No coordinates | 0 | 0 |
| Not yet inspected (1900-01-01 placeholder) | 157 | 50 |

- **Pull**: 12,049 violation rows for the two boards. `community_board` is DOHMH's own field (`'101'`, `'304'`, text).
- **Agreement**: DOHMH `community_board` and point-in-polygon agree for **1,352 of 1,352** restaurants. A second,
  grouped query lists every restaurant point in the two districts' bounding box with another board: **1** falls inside
  a polygon, Dunkin at 325 Wyckoff Ave, Queens 11385 (board 405, BIN 4082322). It sits on the border street, so the
  board filter is right to leave it out. District assignment is DOHMH's board; the check is in `manifest.json`.
- **One row per violation → one row per inspection**: grouped by `camis`, then `(inspection_date, inspection_type)`;
  the inspection keeps action, score, grade, grade date and a violation count.
- **Grades** (from the `grade` column description): A, B, C, Z (grade pending), P (grade pending on re-opening) count
  as graded; N (not yet graded) and blank do not. Grade history = graded inspections only, newest first. Latest grade
  = the newest of those.
- **Not yet inspected**: the dataset description says "Establishments with inspection date of 1/1/1900 are new
  establishments that have not yet received an inspection." Those rows are not inspections; the restaurant shows
  "Not yet inspected" (a test reads the recorded description).
- **Placement on an address page**: by BIN first (DOHMH `bin` = the page's BIN). Otherwise the nearest page within
  30 m (`NEAREST_PAGE_M`), but only a page with no BIN of its own, or any page when the restaurant has no BIN: a
  restaurant whose BIN differs from a BIN-keyed page's is in another building. The page must also list the
  restaurant's own normalized street address (QA on #65: distance alone had put 101 restaurants on pages by location; 89 of those did not share the page's
  normalized street address, e.g. 25 Broadway on 26 Broadway's page). The page says when a restaurant was
  placed by location, and how far.
- **Not on a page**: restaurants in buildings with no license, cannabis or Dining Out record get no address page of
  their own. They are counted (above, in the manifest and in the tab's note) and listed in the district tab, marked
  "not on an address page".
- **ABC Eats**: `https://a816-health.nyc.gov/ABCEatsRestaurants/#!/Search/<camis>`, the link ABC Eats' own search
  results use. Opened cold on 2026-11-04 for camis 50036043 (The Malt House, 11 Maiden Ln) and 50165612 (La Cafeteria,
  1153 Broadway): each showed that restaurant's name, address and inspections. v1's `#/Search/<camis>` (no `!`) now
  drops to the empty search form.
- No map layer for restaurants yet.

## Certificate of occupancy (#62)

- **BIN**: the address page's own BIN (GeoSearch PAD, #59). For a page without one, DOHMH's `bin`, when every
  restaurant placed there agrees on a single BIN (3 pages). Otherwise "No BIN found" (153 pages). No Geoclient, no key.
- **Link**: DOB BIS "C of O PDF Listing for Property",
  `https://a810-bisweb.nyc.gov/bisweb/COsByLocationServlet?requestid=1&allbin=<BIN>` (v1's pattern, now https).
  Opened in a browser on 2026-11-04 for BIN 1089309 (185 Greenwich St: "There are no certificates of occupancy on
  file") and BIN 3071959 (44 Wilson Ave: one CO PDF). Plain `curl` gets an Akamai 403; browsers are fine.
  The BIS page says "For Certificates of Occupancy requested on or after March 1, 2021, see DOB NOW."
- **DOB NOW**: the public portal's BIN search is an in-page form; the URL stays `.../publish/Index.html#!/` after a
  search, so there is no per-BIN link. The page links the portal and says which BIN to type.
- **Open data**: two CO datasets carry BIN. `bs8b-p36w` (DOB Certificate Of Occupancy) covers 2012 to March 2021 only
  and its PDFs are the ones BIS links, so it is not pulled. `pkdm-hqz6` (DOB NOW: Certificate of Occupancy, March 2021
  on) is pulled for the two boards (4,849 rows, 794 BINs) and listed on the page by BIN (190 address pages have
  records). Chosen as well as, not instead of, the BIS link: neither test BIN has a DOB NOW record, and older COs exist
  only in BIS. Issuance dates arrive as text (`02/15/22 11:08:46 AM`) and are shown as `2022-02-15`.

## Schools and houses of worship (#60)

Run of 2026-11-04 after the QA fixes (`--offline` for every source; the Queens license rows were
fetched live once):

| | MN CD 1 | BK CD 4 |
|---|---|---|
| Schools inside the district | 40 | 45 |
| Houses of worship (PLUTO M1 lots) inside the district | 12 | 48 |
| Other religious property (PLUTO M2, M3, M4, M9) inside the district | 5 | 27 |
| Address pages | 627 | 542 |
| Pages with any of those within about 200 ft | 121 | 94 |
| … with a school / a house of worship / other religious property | 90 / 33 / 9 | 17 / 55 / 30 |
| Pages with 3 or more other addresses holding an on-premises liquor license within about 500 ft | 563 | 257 |

Pulled: 438 schools and 782 lots (both districts' bounding box plus 600 ft, so it reaches past
both district lines); 2,291 active on-premises liquor licenses in the same box (New York 1,021,
Kings 1,172, Queens 98).

The first #60 build (before the QA fixes) had 125 / 86 pages with something within 200 ft and
568 / 253 pages at 3 or more licenses: it measured from SLA's points and left out Queens.

**The rule, current text.** ABC Law §64(7) read on https://www.nysenate.gov/legislation/laws/ABC/64
on 2026-11-04 in a browser (curl gets a 403). The page shows "VIEWING MOST RECENT REVISION (FROM
2026-07-31)". Paragraphs (a), (b) and the measuring clause of (c) are word for word the same as the
2025-08-29 text in the local nys-openlegislation corpus. The page quotes them from `SLA_RULES`
in `sources.py`, and a test checks them against the recorded page text
(`tests/fixtures/abc64_7_nysenate_2026-07-31.txt`). §64-a and §105 are linked, not quoted, and
were not re-read.

**Sources and why.**
- **Schools: Facilities Database `ji82-xba5`.** Categories from its own data dictionary
  (`facilities_data_dictionary.xlsx`, sheet "Categorization", attached to the dataset) and a
  `$group` over the two districts: group `SCHOOLS (K-12)`, subgroups `PUBLIC K-12 SCHOOLS`,
  `CHARTER K-12 SCHOOLS`, `NON-PUBLIC K-12 SCHOOLS`, `PUBLIC AND PRIVATE SPECIAL EDUCATION SCHOOLS`.
  Left out: the GED and alternative high school equivalency subgroup (programs), and the day care,
  pre-K, college, after-school and proprietary-school groups. FacDB gives a name and a point.
- **Houses of worship: PLUTO `64uk-42ks`.** FacDB has **no** house-of-worship category (checked in
  the same sheet), so PLUTO building classes M1–M4 and M9 are pulled, as v1 did. PLUTO has
  `latitude`/`longitude` ("the approximate location of the tax lot") and no facility name, so a lot
  is named by its address. Class labels are word for word PLUTO's own data dictionary
  ("PLUTO DATA DICTIONARY August 2026 (26v2)", group "M. CHURCHES, SYNAGOGUES, ETC.", read
  2026-11-04 from
  https://s-media.nyc.gov/agencies/dcp/assets/files/pdf/data-tools/bytes/pluto_datadictionary.pdf):
  M1 Church, Synagogue, Chapel; M2 Mission House (Non-Residential); M3 Parsonage, Rectory;
  M4 Convents; M9 Miscellaneous. **Only M1 is shown as a "House of worship".** M2, M3, M4 and M9
  are shown as "Other religious property" with PLUTO's class name: PLUTO does not call them a
  place of worship, and M3 is a residence. `ownername` is not pulled.
- **Schools at an office or mailing address.** FacDB leaves `streetname` blank when it has no
  complete, validated address, and `address` then holds "any location description that was
  provided" (its own column descriptions). Those schools get a note on the page saying the address
  may be an office or mailing address. The Harbor School has its own note (below).

**How distance is measured.** DuckDB spatial: every point is projected from WGS 84 to EPSG:2263
(NAD83 / New York Long Island, US survey feet) and measured with planar `ST_Distance`. Axis order is
set twice: `SET geometry_always_xy = true` and `ST_Transform(..., always_xy := true)`. A build-time
guard projects each school and lot and compares it with the source's own State Plane `xcoord`/`ycoord`;
the median gap was 0.00 ft (schools) and 0.01 ft (lots), and the build fails above 5 ft. With the axis
order wrong the gap is millions of feet (tested). Points are the address page's point, FacDB's
facility point, PLUTO's lot point and SLA's license point. None is an entrance, so the page says
every distance is "approximate, building point to building point".

**The address page's point** (QA of #66) is GeoSearch's PAD address point when the page's geocode
is `matched` (same house number, street and borough; `transform.page_point`), else the average of
its records' own points (mostly SLA `georeference`). Each page records which one it used
(`point.source`) and the manifest counts them (`page_points`): 1,023 GeoSearch, 146 records. The
first #60 build used the records' average for every page; on matched pages it was a median 23 m
from the PAD point, over 30 m on 197 pages and over 100 m on 18. 377 and 378 Greenwich St shared
one SLA point (3 m apart); they are now 53 m apart. Spot checks against QA's haversine numbers from
the GeoSearch point: 73 Warren St to the German School 148 ft, 17 State St to the M1 lot at 7 State
St 137 ft; 538 Hart St drops out of the 200-ft list.

GeoSearch puts 36 pages outside both districts. 34 are just across a border street (Broadway and
Flushing Ave in Brooklyn, Canal St): they keep the district their records were assigned to, as
published, are measured from GeoSearch's point, and say they are just across the line. Two are far
away: "7 WEST 51ST ST" and "127 W 28TH ST" (Midtown; SLA's points are in Lower Manhattan). A
500-ft circle around them leaves the pulled box, so they keep their district but get **no**
proximity facts (no nearby, 311 nearby, schools or license count), and the page says why.

The same point is used for "Nearby" (150 m), 311 "nearby" and the 25 m comparison count, and
restaurant placement by location. Before → after: nearby pairs 20,348 → 20,346; 311 complaints
within 25 m of a page point 7,150 → 5,539 (matched by address key: 5,108, unchanged); restaurants
placed by location 12 → 4 (by BIN 951, unchanged). Placement by location needs the restaurant
within 30 m of the page point: with the PAD point, 8 restaurants at 96 South St, 21 Ann St and
517 Clayton Rd (Governors Island, where GeoSearch's point is 263 m from SLA's and DOHMH's) are now
farther than that and are listed on the district tab only.

**Same street.** The facility's listed street name (house number removed, normalized like page
addresses: `75 BROADWAY` → `BROADWAY`) is compared with the street names of the page's records.
Floor, suite and unit text after the street is removed on both sides first (`26 BROADWAY-12TH FL`,
`99 WALL ST - #4487`, `25 BROADWAY 9TH FLOOR`, `363 Greenwich St # 1A` all lose it; `SAINT` is read
as `ST`). That turned 12 wrong "different street" rows into "same street", mostly Broadway schools.
Still missed: spelling variants (`SAINT NICOLAS` vs `ST NICHOLAS`) and `AKA` addresses.
The page shows "Same street name", "Different street name in the records" or "Not known". It never
says "no": a corner building fronts two streets (SLA's guide counts it as on both) and PLUTO and
FacDB list one address each.

**500-foot count.** Active licenses (`9s3h-dpkz`) of type 1, classes 0340 to 0421, in New York,
Kings and Queens counties. BK CD 4 borders Ridgewood, Queens, so Queens rows are pulled for this
count only, inside the widened box (`premisescounty in ('Queens','QUEENS')`, both spellings from a
`$group` on 2026-11-04, and `within_box(georeference, …)`): 334 rows, 98 on-premises. Four BK CD 4
pages went from under 3 to 3 or more. 894 Wyckoff Ave went from 0 to 2 (859 Wyckoff Ave and
9-15 Wyckoff Ave; a third Queens license, 1647 Weirfield St, is 491 ft from SLA's point but 558 ft
from GeoSearch's). SLA's class table
(https://sla.ny.gov/leap-license-type-and-class-definitions, an .xlsx linked from the dataset,
recorded in `tests/fixtures/sla_license_classes.json`) gives each class a product but **no ABC
section**, so the mapping to §64, 64-a, 64-b, 64-c and 64-d is ours: the run of retail classes whose
product is Liquor, Restaurant (0340) to Winter Race Tracks (0421), which includes Bottle Club (0415),
Restaurant Brewer (0416) and Cabaret (0417). Not counted: wine- and beer-only, Liquor Store (0100),
Off Premises Caterer (0101), manufacturers, wholesalers, permits (type 2), Additional Bar (0422,
0423, 0426; product blank in SLA's table) and For-profit Club (0425; not in SLA's table, and §64-f is
not named in §64(7)(b)). Classes actually present in the box: 0340, 0343, 0346, 0349, 0361, 0370,
0371, 0373, 0415, 0416, 0417. "Premises" = one address page (or one street + ZIP key for a
license with no page). Licenses at the page itself are not counted. Pending and inactive licenses
are not counted.

**Gaps.**
- Building points are not entrances. Big lots (a church with a long frontage) can be closer or
  farther entrance to entrance than point to point.
- FacDB places some schools at a mailing address: the Urban Assembly New York Harbor School is at
  10 South Street (the Battery Maritime Building), while the school is on Governors Island. The
  City's data is shown as published; the school's row on each address page carries a note saying
  so (`SCHOOL_NOTES` in `sources.py`, keyed on FacDB `uid`). Pages 1000003 and 4265904626 list
  it (1085792 did from SLA's point; from GeoSearch's it is over 200 ft away).
- "Occupied exclusively as a school…" is not judged. A school in a mixed-use tower is listed the
  same as a stand-alone building.
- SLA's LAMP has its own "Public/Private Schools" and "Places of Worship" layers; not compared yet.
- The page does not show the exceptions (pre-1933 premises, older licenses, renewals, parcel
  carve-outs); it names them in one line and links the statute and SLA's guide.
- The map layer is one file per district (`data/<district>/schools-worship.geojson`): everything
  inside the district or within 600 ft of its line (65 points for MN CD 1, 161 for BK CD 4), loaded
  only when switched on. The district list view's "Schools and worship" tab lists the same points,
  so the map note's "the list view is the accessible equivalent" is true.
- **The statute text is on one page, `/rules/`.** Each address page has a short summary of the rule
  and a link. The SLA class link is marked "Excel file"; SLA's guide is marked "PDF, 2013" and as
  Office of Counsel guidance, not the law.

## SLA license record (#63, part)

Built 2026-11-04. The hours and method-of-operation half of #63 stays research.

- **LAMP link**: `https://lamp.sla.ny.gov/?center=<lon>,<lat>&level=18` (`lampUrl` in `format.js`).
  Esri Web AppBuilder's documented `center` (geographic x,y, so longitude first) and `level`
  parameters ([docs](https://doc.arcgis.com/en/web-appbuilder/latest/manage-apps/app-url-parameters.htm)).
  v1 used the same pattern. Rounded to 5 decimals. No point, or a point out of range, gives no
  link. The `?query=<layer id>,...` form is **not** used: its layer id is internal to SLA's web map.
- **Which point**: the license's own `georeference` from the SLA dataset, which the column
  description says is "Open Data platform-generated geocoding information from supplied address
  components". Not SLAM's geocode, not SLA's LAMP pin. In the 2026-11-04 build, all 2,344 SLA records on
  address pages have one (records with no point never reach a page).
- **Browser check (Playwright, 2026-11-04, no sign-in)**: opened the link for OL'DAYS, 73 Warren St
  (`0240-24-104108`, MN CD 1) and GOLDSOUNDS, 44 Wilson Ave (`0370-22-104616`, BK CD 4). LAMP's map
  centered exactly on the requested point (read back from the map: same lon/lat to 5 decimals) at
  level 18. LAMP shows a welcome box first. For these two licenses SLA's own pin was 8 to 11 m from our
  point and on screen. That is not true of every license: QA on #67 compared all 2,344 and found most
  within about 13 m, but 145 more than 50 m away and 41 more than 150 m, and no LAMP pin at all for
  "Additional Bar" permits (classes 422, 423, 426). The page tells people to check the pin's license ID.
  For the two test licenses, clicking it opened SLA's popup for that license ID. The popup ("1 of 6",
  several licenses at one spot) lists premises and license details, principals and disciplinary
  history. It has **no hours or method of operation**.
- **ID, type and class**: the dataset's own fields (`licensepermitid` active, `license_permit_id`
  inactive, `application_id` pending; `type`, `class`, `description`), shown raw. Pending and
  inactive store `class` without leading zeros (`340` vs active `0370`); the page shows what the
  dataset has. Field names and source links with last-updated dates are in the note under the table.
- **Hours, method, conditions**: none of the three SLA datasets has them. The note says so and links
  [SLA Full Board meetings](https://sla.ny.gov/full-board-meetings) and the
  [event calendar](https://sla.ny.gov/event-calendar); each meeting's page links its minutes PDF,
  which record approval conditions for contested applications. PDFs are not parsed.

## Address search (#59)

**Pipeline: one page per building.**
1. Records are grouped by normalized street + ZIP, as before (1,302 groups in the 2026-11-04 run).
2. Each group is geocoded once with GeoSearch `/v2/search` (`text`, `size=3`), serial, about 3 req/s,
   retried with backoff (`net.get_json`), cached in `pipeline/.cache/geocode-address.json`. The query is
   `<street>, <borough>, NY` **without the ZIP**: a wrong ZIP pulls GeoSearch to another building
   (`44 WILSON AVE, Brooklyn, NY 11207` returns 514 Wilson Ave first).
3. A hit is **matched** only if house number, street (normalized) and borough all agree, confidence >= 0.8
   and accuracy `point`. It looks at the top 3 hits, not just the first. Otherwise the group is
   **low confidence** (GeoSearch answered, nothing passed) or **unmatched** (no features).
4. Matched groups are keyed on PAD's BIN (`properties.addendum.pad.bin`). Placeholder "million BINs"
   (`x000000`, e.g. Brooklyn Bridge Park → 3000000) are never keys. Groups with the same BIN become one
   page, whose id **is** the BIN (`/address/3071959/`). Everything else keeps its old 10-character id.
   Nothing is dropped.
5. The page shows the BIN and, when merged, every street + ZIP the sources used. 311 "at this address"
   now follows the merge.

2026-11-04 run (`manifest.json` → `address_geocode`, same numbers live and `--offline`):

| | |
|---|---|
| Address keys geocoded | 1,302 (1,290 requests, 12 repeat queries, 0 errors) |
| Matched / with a usable BIN | 1,156 / 1,146 |
| Low confidence / unmatched | 144 / 2 |
| Address pages (was 1,302) | 1,169, of which 1,013 keyed on BIN and 117 merged from 2+ keys |
| 311 complaints at an address page | 5,108 (unchanged) |

Spot check of merges: they are real multi-address buildings, e.g. `27 PARK PLACE` + `26 MURRAY ST`,
`2 WORLD FINANCIAL CENTER` + `225 LIBERTY ST`, `8 WILSON AVE` 11206 + 11237.

**`site/static/data/bin-index.json`** (about 57 KB): `{radius_m, bins: {BIN: page id}, points: [[page id, lon, lat], ...]}`.
Loaded by the browser only when a suggestion is picked.

**Site: the search box.** In the header of every page (`+layout.svelte`).
- After 2 characters, debounced 250 ms, the browser calls GeoSearch `/v2/autocomplete?text=` (keyless)
  and lists up to 5 suggestions. Out-of-order responses are dropped, as the GeoSearch docs warn.
- Picking one opens `/address/<BIN>/`. If there is no page for that BIN, it opens the nearest page within
  **30 m** (`NEAREST_PAGE_M` in `build.py`), and that page says "nearest page on file, about N m away".
  30 m because SLA's points sit about 25 m from PAD's address point (44 Wilson Ave). Otherwise the box
  says "Nothing on file here yet" with a link to the district map centered on that spot
  (`/<district>/map/?lon=&lat=`, orange marker), or that the spot is outside the two pilot districts.
- Enter with nothing highlighted runs `/v2/search` on the typed text and takes the top hit.
- WAI-ARIA combobox (list autocomplete, manual selection): `role=combobox`, `aria-expanded`,
  `aria-controls`, `aria-activedescendant`; Up/Down move and wrap, Enter opens, Escape closes the list
  (a second Escape clears), Tab closes. A polite live region reads the count ("5 suggestions…").
  axe-core 4.14 found 0 violations on the home page with the list open and on an address page.
- Nothing personal is kept: no localStorage or cookies; GeoSearch calls use `cache: 'no-store'`,
  `credentials: 'omit'`, `referrerPolicy: 'no-referrer'`.
- Logic is in `site/src/lib/addressSearch.js` and unit-tested against recorded real autocomplete
  responses in `site/tests/fixtures/`.

**API docs.** `geosearch.planninglabs.nyc/docs` timed out from office-mac on 2026-11-04, so endpoints and
parameters were read from the docs' own source, `NYCPlanning/labs-geosearch-docs` `src/pages/docs.js`
(`/v2/search` and `/v2/autocomplete`, `text`, `size`, `focus.point.*`, `boundary.rect.*`; `label`,
`confidence`; GeoJSON `[lon, lat]`). `addendum.pad.bin` is not in those docs; it is read from recorded
responses.

## Technical notes

- **DuckDB 2.0 axis order.** `ST_Distance_Sphere` refuses to run until `geometry_always_xy` is set
  explicitly. The pipeline sets it to `true` (longitude, latitude everywhere) and a test checks that
  0.001 degrees of latitude comes out at about 111 m.
- **TLS.** uv-managed Pythons do not see the macOS keychain, so `net.py` uses `truststore`.
- **SvelteKit 3.** No `svelte.config.js` (config lives in `vite.config.js`), `#lib` instead of `$lib`,
  `resolve()`/`asset()` from `$app/paths`. Data is read at build time in `+page.server.js` via
  `src/lib/server/data.js`, and `entries()` lists every district and address to prerender.
