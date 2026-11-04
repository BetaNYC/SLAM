# SLAM v2 prototype (rough, local)

Built overnight 2026-11-04 as a rough first cut of SLAM v2 (epic #56). Two community
districts only: **Manhattan CD 1** (`boro_cd` 101) and **Brooklyn CD 4** (`boro_cd` 304).
The v1 app at the repo root is untouched; all new work is in `pipeline/` and `site/`.

## Run it

Requirements: [uv](https://docs.astral.sh/uv/) (Python 3.11 to 3.15 is fine) and Node 22.17+.
Tested on Node 26.13.0, npm 11.20.0, uv 0.12.22, Python 3.14.10 and 3.11.15.

```sh
# 1. Pipeline: fetch NYC + NYS open data, write site/static/data/ (about 20-50 s live)
cd pipeline
uv sync
uv run python build.py             # live fetch (anonymous, read-only)
uv run python build.py --offline   # rebuild from pipeline/.cache/raw, no network
uv run pytest -q                   # 30 tests against recorded real responses

# 2. Site: static SvelteKit build (prerenders ~1,300 address pages)
cd ../site
npm install
npm test                           # node --test, 6 tests (two read the built static/data)
npm run check                      # svelte-check
npm run build                      # writes site/build/

# 3. Serve the static build
cd build && python3 -m http.server 4173 --bind 127.0.0.1
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
| Accessibility basics: skip link, semantic tables with `<caption>` and `scope`, labelled inputs, ARIA tabs with arrow keys, visible focus ring, works at 360 px (tables scroll sideways). | throughout | #53 (partly) |

## Stubbed or missing

- **No history, so no "new this week" badge** and no weekly digest (#52). Each run is a snapshot.
- **No nightly build, CI or failure alerts** (#49). Runs by hand only.
- **No automated accessibility testing** (#53): no axe in CI, no screen-reader pass. Only checked by eye at 360 px and 1280 px.
- **Pending cannabis**: there is no pending-applications dataset like SLA's. The closest signal is OCM license rows with `license_status` "In-Process", which are shown in the Cannabis tab.
- **Street events** (`tvpp-9vvx`) are approved permits only and have **no coordinates**, so they are list-only and not on the map or on address pages. Each row is one occurrence; one permit (`event_id`) can repeat. Sports permits are hidden by default (toggle to show).
- **Nearby only sees the two districts.** An address near a district edge will not list neighbors across the line.
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
- **Gaps**: the ZIP in the address key can split one building. 44 Wilson Ave has two pages (SLA
  rows carry 11207 on one and 11237 on the other; 311 uses 11237). All 627 complaints land "at" the
  11237 page; the 11207 page shows 0 at the address and 663 "nearby" (the same 627 plus 36 others),
  because the two pages share one point. Dropping ZIP from the key, or merging pages that share a
  point, would fix it; not done here. Intersection-only complaints are never "at" an address.
  2010 to 2019 (`76ig-c548`) is not pulled. A complaint is a report to 311, not a finding, and the pages say so.

## Technical notes

- **DuckDB 2.0 axis order.** `ST_Distance_Sphere` refuses to run until `geometry_always_xy` is set
  explicitly. The pipeline sets it to `true` (longitude, latitude everywhere) and a test checks that
  0.001 degrees of latitude comes out at about 111 m.
- **TLS.** uv-managed Pythons do not see the macOS keychain, so `net.py` uses `truststore`.
- **SvelteKit 3.** No `svelte.config.js` (config lives in `vite.config.js`), `#lib` instead of `$lib`,
  `resolve()`/`asset()` from `$app/paths`. Data is read at build time in `+page.server.js` via
  `src/lib/server/data.js`, and `entries()` lists every district and address to prerender.
