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
uv run pytest -q                   # 21 tests against recorded real responses

# 2. Site: static SvelteKit build (prerenders ~1,300 address pages)
cd ../site
npm install
npm test                           # node --test, 3 tests
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
| Pull and schema-check 7 sources + district polygons. Every selected field is checked against the portal's `/api/views/<id>.json` before rows are fetched; the run fails loudly if one is missing. Paged SoQL (`$limit`/`$offset`/`$order`). | `pipeline/slam_pipeline/sources.py`, `net.py`, `transform.py` | #47 |
| Geocode OCM licenses (`jskf-tt3q`, no coordinates) with NYC GeoSearch v2, at most 4 req/s, cached in `pipeline/.cache/geocode.json`. A hit is accepted only if confidence >= 0.8, accuracy `point`, and the house number matches. License rows already in the retail-dealer list (`gttd-5u6y`) are deduped by license number. | `build.py` `geocode_cannabis`, `transform.accept_geosearch` | #48 |
| District join with DuckDB spatial (`ST_Contains`), per-address grouping, nearby within 150 m (`ST_Distance_Sphere`), `manifest.json` with per-source counts and each portal's `rowsUpdatedAt`. Safe to re-run: outputs rewritten whole, geocode cache only grows, stale address files are moved to `.cache/orphaned-address/`. | `build.py` | #49 (partly) |
| Home, "My district" list with tabs (Liquor: pending, active, inactive on request; Cannabis; Dining Out; Street events), filter box, client-side CSV of the current tab, address page with "at this address" + "nearby", links to SLA LAMP, Dining Out NYC and each dataset, print stylesheet. | `site/src/routes/` | #50 |
| Map: MapLibre GL JS 6 + OpenFreeMap "liberty" style, district outline, one toggle per layer, click a point to open its address page, "View as list" link, attribution shown by MapLibre. | `site/src/routes/[district]/map/` | #51 |
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
- **Size**: the static build is about 60 MB, mostly per-address `__data.json`. Fine locally; worth slimming before hosting.
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

## Technical notes

- **DuckDB 2.0 axis order.** `ST_Distance_Sphere` refuses to run until `geometry_always_xy` is set
  explicitly. The pipeline sets it to `true` (longitude, latitude everywhere) and a test checks that
  0.001 degrees of latitude comes out at about 111 m.
- **TLS.** uv-managed Pythons do not see the macOS keychain, so `net.py` uses `truststore`.
- **SvelteKit 3.** No `svelte.config.js` (config lives in `vite.config.js`), `#lib` instead of `$lib`,
  `resolve()`/`asset()` from `$app/paths`. Data is read at build time in `+page.server.js` via
  `src/lib/server/data.js`, and `entries()` lists every district and address to prerender.
