# SLAM v2 prototype (rough, local)

Built overnight 2026-11-04 as a rough first cut of SLAM v2 (epic #56). Two community
districts only: **Manhattan CD 1** (`boro_cd` 101) and **Brooklyn CD 4** (`boro_cd` 304).
The v1 app at the repo root is untouched; all new work is in `pipeline/` and `site/`.

## Run it

Requirements: [uv](https://docs.astral.sh/uv/) (Python 3.11 to 3.15 is fine) and Node 22.17+.
Tested on Node 26.13.0, npm 11.20.0, uv 0.12.22, Python 3.14.10 and 3.11.15.

```sh
# 1. Pipeline: fetch NYC + NYS open data, write site/static/data/
#    (a few minutes live; the first run also downloads the City's address file, about 35 s)
cd pipeline
uv sync
uv run python build.py             # live fetch (anonymous, read-only)
uv run python build.py --offline   # rebuild from pipeline/.cache/raw, no network
uv run pytest -q                   # 90 tests against recorded real responses

# 2. Site: static SvelteKit build (one address page for every address, #84)
cd ../site
npm install
npm test                           # node --test, 76 tests (some read the built static/data and site/build)
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
| Map: MapLibre GL JS 6 on the City's own vector basemap (NYC OTI), with OpenFreeMap "liberty" as the fallback; district outline, one toggle per layer, click a point to open its address page, "View as list" link, attribution shown by MapLibre. See "City basemap" below. | `site/src/routes/[district]/map/`, `site/src/lib/basemap.js` | #51 |
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
- When the fallback is in use, the OpenFreeMap style logs three MapLibre warnings about highway-shield filters; they come from the style, not this code. The City style logs none.

## City basemap

Every SLAM map (today: the district map; address pages have no map) draws on the City's own
vector basemap, through one module, `site/src/lib/basemap.js`.

- **Service:** `NYC_Basemap_v3` VectorTileServer on ArcGIS Online, account `maps.nyc.data`
  (public item [NYC Basemap](https://nyc.maps.arcgis.com/home/item.html?id=df7862bfd7984baab51ff9df8e214278)).
  Style: `resources/styles/root.json`, version 8, 184 layers, with its own fonts and sprites.
- **Loaded at runtime in the browser.** The module fetches the style and one tile (`tile/0/0/0.pbf`)
  in parallel, then the sprite index and one glyph range (the street-name font, 0-255). It then rewrites the style's relative URLs to absolute ones: the source `url`
  (`../../`, which points at the Esri service JSON, not TileJSON) becomes an explicit `tiles`
  template taken from the service JSON (`tile/{z}/{y}/{x}.pbf`); `sprite` and `glyphs` are resolved
  against the style URL with their `{placeholders}` kept intact.
- **Fallback at start-up:** if the style, the probe tile, the sprite or the glyph probe fails,
  returns an HTTP error, takes more than 8 s, or the style is not a usable v8 style, the map uses
  OpenFreeMap "liberty", as before. On timeout the pending City requests are aborted. The status
  line says which one loaded. Checked in a browser by blocking `tiles.arcgis.com` (instant
  fallback) and by holding its requests open (fallback after about 8 s).
- **Fallback after start-up:** on the first MapLibre `error` from the City (an `esri` tile, the
  sprite or the style), the map switches once to OpenFreeMap with `setStyle(..., { transformStyle })`,
  carrying every overlay source and layer over with its visibility. At most one switch per page
  view. The status line says "Street map unavailable; using a backup map." once; tile errors go to
  the console, not the live region. Font failures fire no `error` in MapLibre 6.16 (it draws the
  glyphs locally and warns), which is why the start-up check probes a glyph range.
- **Record dots:** a 1.5 px white ring plus a thin dark edge (`#1f2937`, 5.8:1 on the City's park
  green `#96A797`, 5.9:1 on its water blue `#88A9BC`), so they read on parks and water too.
- **City layers changed for readability:** hidden: `Addresses/label/Default` (house numbers),
  `Buildings/label/Buildings`, `Buildings/label/Landmark Building`, and the four
  `Traffic Direction/*` one-way arrows. Building footprint fills (`Buildings/*`) are drawn at 45%
  opacity. Everything else (street names, subway stations, parks, neighborhoods) is unchanged.
  Our district outline gained a white casing so it reads over streets and parks.
- **Attribution:** "SOURCE: NYC OTI" (the service's own `copyrightText`) and "Powered by Esri",
  which [Esri's attribution page](https://developers.arcgis.com/documentation/esri-and-data-attribution/)
  requires when ArcGIS services are used from an open-source library. In fallback, MapLibre shows
  OpenFreeMap's own credit ("OpenFreeMap © OpenMapTiles Data from OpenStreetMap"). The site
  footer and home page say the street map is the City's.
- **Fixtures:** `site/tests/fixtures/city_basemap_root.json` and `city_basemap_service.json` are
  the real files, fetched once on 2026-11-04. Tests: `site/tests/basemap.test.js`.

**Open questions for OTI (not resolved; nothing about them is claimed on the site):**

1. **Terms.** The public item's license field links to the
   [NYC.gov Terms of Use](https://www.nyc.gov/home/terms-of-use.page): a website's terms, not an
   open license. May outside civic sites like this one use the tiles?
2. **"Not for General Use."** The service's own `serviceItemId` (`5223421bee67466faa8911ffe89abff8`,
   owner `tfauvell_nyc`) is the base tileset item, and its description says "Not for General Use"
   and points to the web map and the tile layer instead. That recommended tile layer item
   (`df7862bf…`, owner `maps.nyc.data`, public) points at **the same** VectorTileServer URL, so
   this build uses that URL. Worth confirming with OTI that this is the intended use.
3. The item also carries its own `styles/root.json` (dated June 2025) that differs from the
   service's; this build uses the service's, as the brief does.
4. Rate limits, cost to the City of outside traffic, and update cadence (the item says v3, Q2 2026,
   released 5 May 2026) are not known.

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
| complaints_311 | NYC `erm2-nwe9` 311 Service Requests from 2020 to Present | `(location_type in ('Club/Bar/Restaurant','Restaurant/Bar/Deli/Bakery') OR complaint_type in ('Outdoor Dining')) AND created_date >= '2024-01-01' AND community_board in ('01 MANHATTAN','04 BROOKLYN')`; start date is `COMPLAINTS_311_START` in `sources.py` |

## 311 complaints

**Aligned with v1 (#73, 2026-11-05).** v1 had two 311 layers: complaints at location type
`Club/Bar/Restaurant` (Open Data view `ezmw-ux9w`, all complaint types, colored by
`Noise - Commercial` and `Drinking`), and an Open Restaurants layer (DOT `Outdoor Dining`, DCA
`Sidewalk Cafe`, NYPD `Social Distancing` / `Face Covering Violation`). v2 keeps v1's location-type
filter, adds `Restaurant/Bar/Deli/Bakery` (health complaints), and now also pulls every DOT
`Outdoor Dining` complaint (`COMPLAINTS_311_TYPES`). The other Open Restaurants types have 0 rows in
both districts since 2024. The map colors 311 dots in v1's groups: commercial noise, drinking,
outdoor dining, other (`C311_GROUPS` in `format.js`). A picker on the map switches between three ways
to draw them (`site/src/lib/c311Display.js`): **stacked chips** (v1's look: one chip per complaint,
piled up at its point, 3 px apart in screen pixels and capped at 12 with the total above, which
answers #29's "stacks run across streets"), **circles sized by count** (one circle per point, area
by count, colored by the most common group, the #29 suggestion), and **one dot per complaint**.
BK CD 4: 4,897 complaints at 553 points (top: 633 at 44 Wilson Ave); MN CD 1: 608 points (top: 535
at 52 Stone St). Live run of 2026-11-05: 8,812 fetched
(3,911 MN CD 1, 4,897 BK CD 4).

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
   page, whose id **is** the BIN (`/address/?id=3071959`; before #84, `/address/3071959/`). Everything else keeps its old 10-character id.
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

**Lookup files** (`site/static/data/lookup/`, since #85; before that one `bin-index.json` of about
57 KB): one BIN → page file per borough and one page-point file per district, loaded by the browser
only when a suggestion is picked, and only the ones that pick needs. See "Address lookup that scales".

**Site: the search box.** In the header of every page (`+layout.svelte`).
- After 2 characters, debounced 250 ms, the browser calls GeoSearch `/v2/autocomplete?text=` (keyless)
  and lists up to 5 suggestions. Out-of-order responses are dropped, as the GeoSearch docs warn.
- Picking one opens `/address/?id=<BIN>`. If there is no page for that BIN, it opens the nearest page within
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
  `src/lib/server/data.js`, and `entries()` lists every district to prerender. Address pages are not
  prerendered one by one any more (#84): see "One address page".

## About page and palette (#71, #72)

- `/about/` and `/glossary/` follow BoardStat 2.0's About and Glossary pages
  (https://www.beta.nyc/boardstat/v2/about.html, `glossary.html`). About: intro ("SLA Mapper"),
  in-page nav, Where the data comes from (data date, 311 range and pilot districts from the
  manifest; the sources table with what each is used for; other sources), History (dated eras,
  2018 to November 2026, issue numbers linked), How we used AI tools (Claude for code; Deepgram, an
  online service, transcribed the 2018 SDSC talk; no AI on the site), Open-source tools.
- `/glossary/` has 48 terms in eight `<dl>` sections, each with an `id` anchor, including "How the
  numbers are counted" (311 at this address vs nearby, the 200-ft list, same street, the 500-ft
  count, building points). `nearby_m` and the 311 start date come from the manifest. Datasets point
  to the About table instead of repeating it.
- Header nav: Districts · About · Glossary · Rules, with `aria-current`. The footer says "Not an
  official City of New York product."
- `aboutPalette311.test.js` scans both pages for verdict words and checks the built glossary has
  every `<dt id>` and every in-page `#` link target. axe: 0 violations on both pages, desktop and
  390 px, 2026-11-05.
- Site chrome uses the BetaNYC palette: BetaNYC Blue `#2359a8` (was `#1a5ccf`), body `#414141`,
  background blue `#EEF4FF`, border gray `#949494`, square card corners. The favicon is the BetaNYC
  square mark. Map data colors and the amber focus ring are functional exceptions.


## Cannabis distances and the "approximate" note (#74)

- **Cannabis Law §72(6)** (read 2026-11-05 through the nys-openlegislation MCP, text active
  2026-02-13): dispensaries on the same street and within 500 ft of a building *containing* a
  school, or within 200 ft of a building used only as a house of worship, measured entrance to
  entrance. `CANNABIS_RULES` in `sources.py`, `CANNABIS_SCHOOL_FT` / `CANNABIS_WORSHIP_FT` in
  `transform.py`. Every address page with a cannabis record gets `cannabis_sw` (schools within
  500 ft, houses of worship within 200 ft, building point to building point). Offline run
  2026-11-05: MN CD 1, 11 cannabis pages, 8 with a school within about 500 ft; BK CD 4, 9 pages,
  none (nearest: 412 Knickerbocker Ave, a school about 530 ft away). The rules page quotes §72(6)
  (a), (b), (c), (f) and links §76 (community board notice).
- **`DistanceNote.svelte`**: one note wherever a distance is shown (address pages, rules page;
  same wording in the glossary). SLAM cannot measure door to door, every distance is between
  approximate building points, and a distance near a limit is close, not over or under it.
  Tested in `site/tests/cannabisDistance.test.js`.

## Map keeps its place; details in a side panel (#75)

- The map's view (zoom, center), the layers that are on, the 311 style and the selected address
  live in the URL hash (`#v=z/lat/lon&on=…&c311=…&sel=…`, `site/src/lib/mapState.js`), written
  with SvelteKit's `replaceState` on every move and toggle. Back from an address page restores
  all of it, and the link can be shared. Order on load: hash, then saved choices, then defaults.
- Layer choices and the 311 style are saved in `localStorage` (`slam.map.v1`) for the next visit.
  Storage errors are ignored.
- Clicking any point (license, 311 chip or circle, school, house of worship) opens
  `MapPanel.svelte` beside the map (under it below 52 rem) instead of leaving the page: the
  address's records, 311 counts, health grades, approximate counts nearby with the distance note,
  and a link to the full page. A black ring marks the selection. Focus moves to the panel heading.
- Checked headless (Chromium) on BK CD 4: click a license dot → panel "906 BROADWAY" → full page
  → Back → same view, same layers, sized circles, panel open; a fresh visit keeps the layer choices;
  no console errors.

## Collapsible layers; Boundaries Map links (#77)

- The map's Layers box is a `<details>` accordion. Its summary says how many layers are on and the
  311 style; open or closed is saved with the other layer choices (`open` in `slam.map.v1`). The
  long note under the map is now an "About this map" accordion too.
- Each address page and the map's side panel link to BetaNYC's Boundaries Map at the address
  page's point: `https://boundaries.beta.nyc/?lng=<lon>&lat=<lat>` (`boundariesUrl` in
  `format.js`). Boundaries Map reads those two parameters on load (BetaNYC/nyc-boundaries
  `frontend/src/stores.ts`, `selectedCoordinates`), drops a pin and lists every district that
  contains the point. Checked headless 2026-11-05: the link for 906 Broadway opened with the
  overlap list (Community District, Council, Assembly, Senate, Congress, school district,
  precinct and more). 906 Broadway sits on Broadway, the BK CD 3 / CD 4 line, and Boundaries Map
  lists Brooklyn 3 at that point while SLAM places the address's records in BK CD 4: a reminder
  that points on a boundary street can land on either side.

## 311 window: 2022-01-01 through 2026-11-04 (Noel, 2026-11-05)

- `COMPLAINTS_311_START = "2022-01-01"` (was 2024-01-01) and `COMPLAINTS_311_END = "2026-11-04"`
  (inclusive; the query uses `created_date < '2026-11-05'`; set it to `None` to run through the
  newest data). The manifest records `start`, `end` and `through`.
- Live run 2026-11-05: 13,241 complaints. MN CD 1: 5,599 (2022 645, 2023 1,043, 2024 1,612,
  2025 1,301, 2026 998). BK CD 4: 7,613 (2022 1,273, 2023 1,443, 2024 1,925, 2025 1,677,
  2026 1,295). DOT Outdoor Dining has rows every year 2022 to 2026; the COVID-era Open
  Restaurants types have none since 2022.
- **Stale-page guard** (`top_up_311` in `build.py`): a full paged fetch on 2026-11-05 stopped at
  2026-11-01 while the portal already had complaints through 2026-11-04. After the paged fetch,
  the build asks once more, newest first, for anything created after the newest row it got and
  adds rows it does not have. That run added 13.

## Address matching with the City's own address file (#86)

- `pipeline/slam_pipeline/padmatch.py` matches each address group against the City's normalized
  PAD file (the file NYC Planning Labs' GeoSearch is built from, `labs-geosearch-pad-normalized.csv`,
  PAD 26c, 4,491,112 rows with a house number) in DuckDB, before any GeoSearch call. The file is
  downloaded once per ETag, kept as Parquet in `pipeline/.cache/pad/` (47 MB, plus 45,375 named
  places) and cached in Actions.
- `candidates()` turns one address into the readings worth trying, each tagged with its rule:
  as written; Queens number without the hyphen (`104 30` → `104-30`); ranges; half numbers; AKA;
  text before a comma; trailing text; words after the street type; then the borough from the ZIP,
  then PAD's named places. Readings that can land on the wrong building (`RISKY_RULES`) must be
  within 1,000 ft of the records' own point.
- Offline run 2026-11-05 (same raw data): matched 1,157 → **1,269** of 1,303 address groups;
  "low confidence" 144 → 33; pages keyed on a BIN 1,013 → 1,056; address pages 1,169 → 1,105
  (more records share a building page). GeoSearch matched none of the 34 left.
- Citywide test the same day (`team/reference/nyc-address-matching.md` in the BetaNYC workspace):
  SLA active licenses 97.2%, DOHMH restaurants 98.5% (BIN agreeing 99.4%), 311 addresses 91.9%
  (BBL agreeing 99.3%). Risky readings: 0 matches more than 1,000 ft from SLA's point.
- Found on the way: SLA's own points for Queens numbers written without the hyphen sit on the right
  street at the wrong spot (e.g. `90 28 37TH AVENUE` placed at 74-12 37 Ave, about 4,000 ft off).


## The City's point for licenses: map dots, LAMP links, 500-ft count (#96)

- SLA's `georeference` is generated by data.ny.gov from the address text. For Queens numbers written
  without the hyphen it lands on the right street at the wrong spot. LAMP's own pins do not have
  this problem: on 2026-11-05, four such licenses were 4,007-13,140 ft off in the open data and
  92-203 ft from the City's point in LAMP (`ActiveLicensesV3` FeatureServer, `Latitude`/`Longitude`).
- Records on a matched address page now carry `plon`/`plat` (the page's City point). Map dots and
  "Show on the SLA's LAMP map" use it; records keep their own `lon`/`lat`.
- The 500-ft count measures each active on-premises license from its address page's City point,
  else the City's address file (`padmatch`, with the 1,000 ft check for risky readings), else
  SLA's point. Manifest `schools_worship.on_premises_license_points`: live run 2026-11-05,
  466 from an address page, 1,797 from the City's address file, 30 from SLA's point.
- Effect, same data, before → after: licenses in the box 2,293 → 2,283; pages with 3 or more other
  addresses within about 500 ft: MN CD 1 514 → 514, BK CD 4 254 → 253; 499 pages show a different
  count, mostly by 1 to 3, because both ends of each distance now come from the same source.

## Address matching: more readings and a review list (#95)

- New readings in `padmatch.candidates` (each tagged with its rule): Queens numbers with a range on
  the end (`29-12-14`), three-part Queens numbers (`136 20 30 ROOSEVELT`, `126 12 101 AVE`), a
  letter written apart (`92-15 B`, `169 B GARDNER`), ranges of three or four numbers, a Brooklyn
  number written with a hyphen (`65-02 18TH AVE` → 6502), text after " AT " or a slash, floor text
  (`7TH FL`, `1ST AND 2ND FLRS`, a bare `9TH` at the end), AKA without spaces (`A/K/A15`),
  street-type misspellings (`HGWY`, `PKW`, `AVEUE`), and the first street-type word when cutting
  trailing words.
- New lookups in `PadIndex.lookup`: the street with spaces ignored (`CROSSBAY`), the ZIP's own
  borough with that borough's readings, a street name missing its ending or cut off
  (`ADAM CLAYTON POWELL`, `300 WYCKOFF`, `381 BROADW`) when exactly one street fits, and, last,
  the nearest listed house number on the same side of the street (point only: no BIN or BBL; the
  page says so).
- Safety: a risky reading must land within 1,000 ft of the record's own point **or** in the
  record's ZIP; the nearest-number rule and place names matched on their first words only always
  need the point.
- SLAM, same data: 1,269 → **1,291 of 1,303** address groups matched; low confidence 33 → 11;
  pages keyed on a BIN 1,056 → 1,061. Citywide test (no points for 311): SLA 97.3%, DOHMH 98.7%
  (BIN agreeing 99.4%), 311 91.9%.
- Every build writes `site/static/data/review/unmatched-addresses.csv` (district, street, ZIP,
  status, GeoSearch's top hit, sources, record count) and its row count to the manifest.

## Per-license LAMP links (#63)

- LAMP is an Esri Web AppBuilder app; its documented `query` URL parameter opens one record:
  `https://lamp.sla.ny.gov/?query=<layer id>,<field>,<value>`. The layer ids are internal to LAMP's
  web map (item `66237abfc6dd4ded86c8f181647afd0c`), so every build reads that web map and keeps a
  link only while its layer id still points to the expected service
  (`transform.verify_lamp_layers`; manifest `sla_license.lamp_query`). Active: `18c59d3a27d-layer-12`
  / `LicensePermitID`; pending: `18c5a02ff71-layer-11` / `ApplicationID`; inactive:
  `18c5a031648-layer-12` / `LicensePermitID`.
- Opened in a headless browser on 2026-11-05: an active (0370-22-104616), a pending
  (NA-0081-26-116209) and an inactive (0505-23-024145) license each zoomed LAMP to that record and
  showed its ID. Address pages and district lists now show "Open this license in LAMP" next to the
  map-location link.
- Still not available as open data: days and hours, and method of operation. Approval conditions
  for contested applications are only in SLA's Full Board minutes (PDFs); the page says so and links
  them. Asking SLA to publish them is on the outreach list.
- Review fixes (2026-11-05): license rows are now pulled and re-placed with the City's address
  file within a box one mile wider than `sw_box` (`LICENSE_POINT_SLACK_FT = 5280`), so a license
  whose SLA point is wrong and outside the area but whose building is inside it is counted (Queens
  rows fetched 334 → 619; licenses in the box 2,283 → 2,290; measured from: 466 address page,
  2,918 City file, 43 SLA point). Points off by more than a mile are still missed. The LAMP note now
  says which comparison its numbers come from.
- Review fixes (2026-11-05): a letter written apart never drops N, S, E or W (`100 W BROADWAY` had
  matched 100 Broadway) and is now a risky reading; floor text is an extra reading, never a
  replacement, and a trailing ordinal is a floor only after a street word (`200 WEST 42ND` stays
  the street); the same-ZIP acceptance applies only when the record's point is not trusted (a group
  with an SLA record), never against a trusted point; a page placed at the nearest listed number does
  not pass its neighbor's point to records (`plon`) or to the 500-ft count. Citywide after the
  fixes: SLA 97.5%, DOHMH 98.6% (BIN agreeing 99.4%), 311 91.9%; SLAM still 1,291 of 1,303.
- Review fixes (2026-11-05): an offline build reuses the cached web map, so the per-license check
  is only as fresh as the last live build; an ArcGIS error body (served with HTTP 200) is logged
  and drops the links. The LAMP-record paragraph shows only when the links exist. Not checked yet:
  that the field names are still in each layer (the check covers layer id and service).
## One address page (#84)

Measured 2026-11-05 on the same data (1,105 address pages, two districts):

| | before | after |
|---|---|---|
| `site/build` | 98.8 MB | 21.8 MB |
| HTML files | 1,113 | 10 |
| `build/address/` | 76 MB (1,105 prerendered pages, about 70 KB each) | 32 KB (one shell) |
| Address data files (`data/address/<id>.json`, already published) | 9.8 MB, 8.9 KB each | unchanged |

**Citywide projection** (25,000-30,000 addresses, #93): address files about 225-270 MB plus their
list (`address/index.json`, about 3-4 MB); district pages and district data (about 3.8 MB per pilot
district today; the pilots are busy districts, so 140-230 MB for 59, scaling by 311 volume or by
district count); the app about 2 MB. **About 0.4-0.5 GB**, against roughly 2-2.6 GB with one HTML
page per address and GitHub Pages' 1 GB limit.

**Design: one page at `/address/?id=<id>`, old links forwarded by `404.html`.**
- `src/routes/address/+page.svelte` is prerendered once, as a shell. In the browser it reads `id`
  from the query string and fetches `data/address/<id>.json`, the same file the map side panel
  already fetched (`MapPanel.svelte`). The page body is `AddressView.svelte`, the old page's markup
  unchanged: every section, the print button and print styles, headings, tables with captions,
  the approximate-distance note, Boundaries Map and LAMP links. `?q=&m=` from the search box still
  shows the nearest-page note. A `#section` in a shared link is scrolled to once the data is in.
- The parts that are the same on every address (the 500-foot rule's name and link, SLA class names,
  the cannabis distances) come from the page's own build-time load, as before.
- States: "Loading this address…" (`role=status`; a `<noscript>` note in the shell), "This address
  isn't in SLAM" (no file, HTTP 404, or an id that is not a page id: only `[A-Za-z0-9_-]{1,40}` is
  ever fetched), "No address was chosen" (no `id`), and a network or server error with a Try again
  button (`role=alert`). Logic in `src/lib/addressPage.js`; links via `addressHref()` in
  `src/lib/addressLink.js`.
- **Old links** (`/address/<id>/`, shared, printed, bookmarked): GitHub Pages serves `404.html` for
  any path with no file ([docs](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-custom-404-page-for-your-github-pages-site)).
  `site/static/404.html` is a plain page whose first script turns `/address/<id>/` into
  `/address/?id=<id>`, keeping `?q=&m=` and `#hash`, with `location.replace` so Back skips it.
  Any other unknown path gets a plain "Page not found". It is not SvelteKit's `fallback` page.

**Why not adapter-static's `fallback` (an SPA route `/address/[id]` served by `404.html`).** The
[adapter-static docs](https://svelte.dev/docs/kit/adapter-static) suggest `fallback: '404.html'` for
GitHub Pages, and the [single-page apps docs](https://svelte.dev/docs/kit/single-page-apps) say a
fallback route needs `ssr = false`. It would keep the old URLs as they are, but:
- every address URL would answer **HTTP 404** forever, which link previews, crawlers and link
  checkers read as a dead page;
- the root layout reads the manifest in a server `load`, whose output SvelteKit writes next to
  prerendered pages only, so a fallback route would need that load reworked (not tried);
- every unknown path would boot the whole app.
With the query-string page, the canonical address URL answers **200**; only old links pass through
one 404 and a redirect.

**Trade-offs, honestly.**
- HTTP status: new URLs 200; old URLs 404, then forwarded in the browser.
- Link previews and search engines: an address URL no longer carries the street in its HTML title;
  previews show the generic shell. (The 1,105 prerendered pages did.)
- No JavaScript: the address page cannot show an address. The shell says so and points to the
  district pages, which still list every address as plain HTML. Old links without JavaScript show
  the "Page not found" page with a link home.
- Print: unchanged once the page has loaded (same component, same print CSS).
- Per-address file, not one file per district: a district file would be 4-5 MB for the pilot
  districts (the sum of their address files) to show one address, while the per-address file is
  about 9 KB and was already published for the map panel. One file per district stays the plan for
  the lookup data (#85).

**Tests (#84).** `site/tests/addressPage.test.js` (query parsing, id validation, links, every load state
with a fake `fetch`, the `404.html` forwarder run in `node:vm`, the built shell). Tests that read
`build/address/<id>/index.html` now render `AddressView.svelte` with `svelte/server` from every real
address file (`tests/helpers/`: Node module hooks compile `.svelte` and stand in for `$app/paths`).
Browser check, private headless Chromium against a server that answers like GitHub Pages
(`404.html` with status 404): direct open, old link with `#health`, district list, nearby link,
map side panel → page → Back (same `#v=`), live search to a BIN page, nearest-page fallback
(GeoSearch answer stubbed), unknown, invalid and missing ids, network error and retry, print, no
JavaScript. 0 unexpected console errors.

## Address lookup that scales (#85)

The search box used to download the whole lookup, `bin-index.json` (every BIN → page and every page
point), plus `districts.geojson`, on the first pick. Citywide that would be well over a megabyte for
one search. The pipeline now writes `site/static/data/lookup/` (`pipeline/slam_pipeline/lookup.py`):

- `bins-<b>.json`, `{"bins": {BIN: page id}}`, one per borough. A BIN's first digit is its borough
  (1 Manhattan, 2 Bronx, 3 Brooklyn, 4 Queens, 5 Staten Island). All five are written, empty or not,
  so the browser never asks for a missing file.
- `points-<district>.json`, `[[page id, lon, lat], ...]`, one per district.
- `index.json`, `{radius_m, districts: {slug: {bbox, n}}}`: the bbox of each district's own page
  points (some sit just across the district line).

`locate()` in `site/src/lib/addressSearch.js` loads only what a pick needs, then resolves it exactly
as before (`resolvePick`): a BIN with a page loads one borough file and stops; otherwise it loads
`index.json` and the points files of the districts whose bbox, padded by the 30 m radius, contains
the spot. `districts.geojson` is loaded only when nothing is on file, to say which district map to
open. Files are fetched once per visit; a failed fetch is forgotten, so a retry fetches again.
Stale lookup files and the old `bin-index.json` are moved to `pipeline/.cache/orphaned-lookup/`,
never deleted.

What one search downloads, measured in the browser 2026-11-05 (bytes, uncompressed; gzip about a
quarter):

| Search | before (#84) | after |
|---|---|---|
| BIN with a page (44 Wilson Ave) | 114,389 (`bin-index.json` + `districts.geojson`) | 10,510 (`bins-3.json`) |
| Nearest page (BIN without a page, 10 m from one) | 114,389 | 29,631 (`bins-1`, `index`, `points-mn-cd1`) |
| Nothing on file, inside a pilot district | 114,389 | 74,569 (`index`, `points-bk-cd4`, `districts.geojson`) |
| Nothing on file, outside both | 114,389 | 57,161 (`bins-5`, `index`, `districts.geojson`) |

The address's own data file (about 9 KB) is fetched by the address page after either.

**Citywide projection** (25,000-30,000 pages; about 20 bytes per BIN entry and 33 per point today).
The one-file design would be about 1.3-1.6 MB per search, plus all 59 district outlines. After the
split:
- a BIN hit is one borough file, about 0.1-0.2 MB;
- a nearest-page fallback adds `index.json` (a few KB) and usually one or two district points
  files, about 15-20 KB each.

**Still to do:** the "nothing on file" step still loads every district outline. Citywide that file
grows with 59 districts and will need its own split (for example one outline per district, chosen
by the bboxes in `index.json`).

**Tests.**
- `pipeline/tests/test_lookup.py`: the borough split, all five files, points rounding, bbox, and a
  bad BIN failing loud.
- `site/tests/addressSearch.test.js` checks the built files: every BIN in its own borough file and
  on its page, every point in its district's file and bbox, and the old file gone.
- `locate` against the real built files records which files it loads: one for a BIN hit; bins,
  index and one district for a nearby fallback; none for a far spot. It also gives the same answer
  as resolving against everything at once.
- `districtsNear` padding and `cachedLoader` (fetch once; retry after a failure).
- Browser, private headless Chromium (30/30 checks, 0 console errors): live GeoSearch "44 Wilson
  Ave" → its page loading only `bins-3.json`; nearest-page fallback; "nothing on file" inside BK CD 4
  (map link) and outside both districts, with the downloads above.

