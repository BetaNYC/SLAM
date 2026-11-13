# SLAM v2

SLAM, the Street License and Activity Map, puts the open data a New York City community board looks up for a liquor license application in one place: State Liquor Authority licenses and applications, cannabis licenses, outdoor dining, permitted street events, 311 complaints, health inspections, certificates of occupancy, and nearby schools and houses of worship. It shows facts as the City and State publish them; it does not decide whether a law or rule applies.

- **Live:** https://slam.beta.nyc (a prototype covering Manhattan Community Districts 1 and 6, Bronx Community District 2, and Brooklyn Community Districts 1, 4 and 9)
- **On the site:** an About page (sources, history, how we used AI tools) and a Glossary of every term and calculation.
- **What's changed:** [`WHATS-CHANGED.md`](WHATS-CHANGED.md), new data, fixes and corrections since 2018, newest first; on the site at https://slam.beta.nyc/whats-changed/ (built from the file by `npm run whats-changed` in `site/`, and checked in CI).
- **Detailed build notes:** [`PROTOTYPE.md`](PROTOTYPE.md), section by section, with the numbers from each run.
- **Plans and work:** [epic #56](https://github.com/BetaNYC/SLAM/issues/56), [what v1 had, #58](https://github.com/BetaNYC/SLAM/issues/58), [citywide, #93](https://github.com/BetaNYC/SLAM/issues/93).
- **The name:** SLAM began in 2018 as the SLA Mapper, named for the State Liquor Authority. In 2026 it became the Street License and Activity Map, because it now covers more than liquor licenses.
- **The first SLAM (2018-2023)** lives on the `main` branch (`v2` is now the default branch), Its old source (`src/`, `public/`) is kept in this branch for reference only; its build files were removed (#129). It ran on Carto, which is gone; v2 is `pipeline/` and `site/`.

## How it works

A small Python program (`pipeline/`) downloads open data, places every record in today's community district lines with DuckDB spatial (see "District lines" below), groups records by building, finds what is near each address, and writes plain JSON and GeoJSON files. A SvelteKit site (`site/`) turns those files into static pages. Address pages are one page, `/address/?id=<id>`, that loads that address's JSON file in the browser, so the site does not grow by one HTML page per address; old `/address/<id>/` links are forwarded by `site/static/404.html` (#84). There is no database server and no API key. GitHub Actions rebuilds and publishes it to GitHub Pages (`.github/workflows/v2-deploy.yml`).

| Layer | Tools |
|---|---|
| Data | NYC Open Data and data.ny.gov (Socrata, read-only, keyless) |
| Pipeline | Python 3.11+, [uv](https://docs.astral.sh/uv/), [DuckDB](https://duckdb.org) with the spatial extension, pytest |
| Site | [SvelteKit](https://svelte.dev) (static adapter), [MapLibre GL](https://maplibre.org) |
| Street map | The City's NYC Basemap (SOURCE: NYC OTI, powered by Esri); OpenFreeMap if it does not load |
| Hosting | GitHub Pages, `slam.beta.nyc` |

### Matching addresses to buildings

Every address is matched to a building (BIN), a tax lot (BBL) and a map point with **the City's own address file**: NYC Planning Labs' normalized copy of City Planning's Property Address Directory (PAD), the same file the GeoSearch service is built from. The pipeline downloads it once per release, keeps it as Parquet, and matches in DuckDB (`pipeline/slam_pipeline/padmatch.py`). It also tries the common ways addresses are written: Queens numbers without the hyphen (`104 30` for `104-30`), ranges, half numbers, "AKA" addresses, trailing text, the borough taken from the ZIP, and named places. Readings that could land on the wrong building must be within 1,000 ft of the record's own map point. Only what the file cannot match is sent to [GeoSearch](https://geosearch.planninglabs.nyc), slowly and cached.

Tested citywide on 2026-11-05: 97.2% of active liquor licenses, 98.5% of restaurant inspection addresses (agreeing with the Health Department's own BIN 99.4% of the time) and 91.9% of 311 addresses (agreeing with 311's own BBL 99.3% of the time). Details in `PROTOTYPE.md`, "Address matching with the City's own address file".

### District lines

City Planning's Community Districts dataset (`5crt-au7u`) has 71 rows: the 59 community districts and 12 Joint Interest Areas (large parks, airports and similar places outside every community district). As in BetaNYC's BoardStat v2, any `boro_cd` above its borough's highest district (`MAX_CD = {1: 12, 2: 12, 3: 18, 4: 14, 5: 3}`) is a Joint Interest Area and is listed as its own district (#87; `pipeline/slam_pipeline/districts.py`). Which districts are built is `PILOT_BORO_CDS` in `pipeline/slam_pipeline/sources.py`: the two pilots plus boards added on request: Brooklyn CD 9 (#124); Brooklyn CD 1, Manhattan CD 6 and Bronx CD 2 (#126).

An address whose City point is within 100 ft of another district's line (`BOUNDARY_FT`) is listed in every district on that line that SLAM builds, and its page says, for example, "On the line between Brooklyn CD 3 and CD 4". Its records, map dots and counts are in each of those districts (#88). 100 ft, not half a street width, because the City's point sits inside the lot: 906 Broadway, Brooklyn is 92 ft from the CD 4 line. The reasoning and the numbers are in `districts.py`.

### Distances are approximate

The laws SLAM quotes (ABC Law §64(7) for liquor, Cannabis Law §72(6) for cannabis) measure from entrance to entrance. SLAM has no entrances: it measures straight lines between building points, so every distance on the site is approximate and says so.

### Asking the portals politely

The pipeline asks NYC Open Data and data.ny.gov one question at a time, at least 2 seconds apart, waits longer when a portal says it is busy (HTTP 429 or 503, honoring `Retry-After`), and retries a few times before it gives up (`pipeline/slam_pipeline/net.py`, #106). It needs no key. If `SOCRATA_APP_TOKEN` is set, it is sent as `X-App-Token` to those two portals only.

## Run it

Requirements: uv (Python 3.11 to 3.15) and Node 22.17 or newer.

```sh
# 1. Pipeline: fetch the open data and write site/static/data/
cd pipeline
uv sync
uv run python build.py             # live fetch; the first run also downloads the City's address file (~35 s)
uv run python build.py --offline   # rebuild from pipeline/.cache/, no network
uv run pytest -q                   # tests against recorded real responses

# 2. Site
cd ../site
npm install
npm test
npm run check
npm run build                      # writes site/build/
npx playwright install chromium    # once per machine
npm run test:a11y                  # axe, keyboard and phone-size checks on site/build/ (#53)

# 3. Look at it
cd build && python3 -m http.server 4173 --bind 127.0.0.1
# open http://127.0.0.1:4173/
```

`site/static/data/`, `site/build/` and `pipeline/.cache/` are not committed.

## Updating the data

The workflow (`.github/workflows/v2-deploy.yml`) rebuilds and publishes the site on every push to `v2`, by hand from the Actions tab, and nightly at 10:17 UTC (about 5 to 6 am in New York). `v2` is the default branch, so the nightly run is on: it has run every morning since 2026-11-06 (#90). It needs no secrets; every source is open and keyless.

Every pull request to `v2` runs the site tests and the accessibility checks (`.github/workflows/v2-site-a11y.yml`) on the data last published to `gh-pages`. The checks are axe-core against WCAG 2.0, 2.1 and 2.2 A and AA on the home, district, address, map, About, Glossary and Rules pages, at desktop size and at 360 x 800 and 390 x 844; keyboard use of the map page; and phone layout. Any serious or critical axe violation fails the run, and the deploy workflow runs the same checks before it publishes.

## Data sources

Every dataset is read from its portal's own API, and its fields are checked against that portal's own column list (`pipeline/slam_pipeline/sources.py`).

| What | Dataset | ID |
|---|---|---|
| Liquor license applications | SLA Pending Licenses (data.ny.gov) | `f8i8-k2gm` |
| Liquor licenses | SLA Active Licenses (data.ny.gov) | `9s3h-dpkz` |
| Past liquor licenses | SLA Inactive Licenses (data.ny.gov) | `6dg3-2z7i` |
| Registered cannabis retail dealers | NYS Registered Retail Dealers of Adult-use Cannabis Products (data.ny.gov) | `gttd-5u6y` |
| Cannabis licenses (and applicants with proximity protection) | Current OCM Licenses (data.ny.gov) | `jskf-tt3q` |
| Outdoor dining | Dining Out NYC Locations (NYC Open Data) | `fpeh-f7ci` |
| Street events | NYC Permitted Event Information (NYC Open Data) | `tvpp-9vvx` |
| 311 complaints | 311 Service Requests from 2020 to Present (NYC Open Data) | `erm2-nwe9` |
| Health inspections | DOHMH New York City Restaurant Inspection Results (NYC Open Data) | `43nn-pn8j` |
| Certificates of occupancy | DOB NOW: Certificate of Occupancy (NYC Open Data) | `pkdm-hqz6` |
| Schools (K-12) | Facilities Database (NYC Open Data) | `ji82-xba5` |
| Houses of worship | PLUTO, building classes M1-M4 and M9 (NYC Open Data) | `64uk-42ks` |
| Community districts | Community Districts (NYC Open Data) | `5crt-au7u` |
| Addresses | City Planning's Property Address Directory, as normalized by NYC Planning Labs | [CSV](https://planninglabs.nyc3.digitaloceanspaces.com/geosearch-data/latest/labs-geosearch-pad-normalized.csv) |

Each license links to its record on SLA's [LAMP](https://lamp.sla.ny.gov/) map. An address page shows every date and ID the three SLA datasets publish for a license (first issued, last issued, effective and expiration dates; legacy serial number; parent license; AKA address). None of the three publishes hours or method of operation (column lists checked 2026-11-07, [#63](https://github.com/BetaNYC/SLAM/issues/63)), and SLAM does not copy them from other pages; a test fails if the State adds such a column.

## Contributing

Open an issue or a pull request against `v2`. Write facts, not verdicts: the site never says a place "violates", "meets" or is "eligible" for anything (a test checks). Every number on a page should come from a named source with a date.

## License and credit

GNU General Public License v3.0 (see [`LICENSE`](LICENSE)). A [BetaNYC](https://beta.nyc) prototype. Not an official City of New York product.

Lindsay Poirier of BetaNYC built the first SLAM in 2018, with and for community boards, on Carto.js and Chart.js. Zhi Keng He rebuilt it in Svelte in 2020. The site's About page tells the full history, issue by issue.

SLAM v2 was built by BetaNYC staff with the help of Claude, an AI coding assistant; see the site's About page for how.
