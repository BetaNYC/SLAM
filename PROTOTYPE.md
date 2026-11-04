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
uv run pytest -q                   # 39 tests against recorded real responses

# 2. Site: static SvelteKit build (prerenders ~1,300 address pages)
cd ../site
npm install
npm test                           # node --test, 17 tests (four read the built static/data)
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
| Accessibility basics: skip link, semantic tables with `<caption>` and `scope`, labelled inputs, ARIA tabs with arrow keys, visible focus ring, works at 360 px (tables scroll sideways). | throughout | #53 (partly) |

## Stubbed or missing

- **No history, so no "new this week" badge** and no weekly digest (#52). Each run is a snapshot.
- **No nightly build, CI or failure alerts** (#49). Runs by hand only.
- **No automated accessibility testing** (#53): no axe in CI, no screen-reader pass. Only checked by eye at 360 px and 1280 px.
- **Pending cannabis**: there is no pending-applications dataset like SLA's. The closest signal is OCM license rows with `license_status` "In-Process", which are shown in the Cannabis tab.
- **Street events** (`tvpp-9vvx`) are approved permits only and have **no coordinates**, so they are list-only and not on the map or on address pages. Each row is one occurrence; one permit (`event_id`) can repeat. Sports permits are hidden by default (toggle to show).
- **Nearby only sees the two districts.** An address near a district edge will not list neighbors across the line.
- **Address search gaps** (#59): 144 of 1,302 address keys come back "low confidence" and keep a street + ZIP page (house ranges like `599-603 BUSHWICK AVE`, `AKA` addresses, `ST NICHOLAS` vs GeoSearch's `SAINT NICHOLAS`, half numbers). 2 return nothing. GeoSearch autocomplete ranks citywide with no focus point, so "1 Centre Street" suggests a Bronx address first. 311 complaints still match a page only by street + ZIP key (now remapped to the BIN page); they are not geocoded themselves. The nearest-page fallback (30 m) can land on a neighbor on a dense block; the page says so and gives the distance. No screen-reader pass yet; axe found 0 violations.
- **Address grouping is a simple normalizer** (uppercase, suffixes, drop unit designators such as `Ste`/`Fl`/`Store`). It will miss some matches and could rarely merge two. Retail-dealer addresses that start with the store name are trimmed only when the name starts with a letter (`7 LEAF CLOVER 132 METROPOLITAN AVE` is left as is).
- **Geocoding**: 7 of 145 OCM addresses were rejected by the acceptance rule and are unmapped (they still appear in lists marked "not mapped").
- **Size**: the static build is about 68 MB (60 MB before 311), mostly per-address `__data.json`. Fine locally; worth slimming before hosting.
- **No base path** is configured, so the build assumes it is served from `/`. GitHub Pages under `/SLAM/` would need `paths.base`.
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
