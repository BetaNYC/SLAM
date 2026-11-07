# SLAM v2

SLAM, the SLA Mapper, puts the open data a New York City community board looks up for a liquor license application in one place: State Liquor Authority licenses and applications, cannabis licenses, outdoor dining, permitted street events, 311 complaints, health inspections, certificates of occupancy, and nearby schools and houses of worship. It shows facts as the City and State publish them; it does not decide whether a law or rule applies.

- **Live:** https://slam.beta.nyc (a prototype covering Manhattan Community District 1 and Brooklyn Community District 4)
- **On the site:** an About page (sources, history, how we used AI tools) and a Glossary of every term and calculation.
- **Detailed build notes:** [`PROTOTYPE.md`](PROTOTYPE.md), section by section, with the numbers from each run.
- **Plans and work:** [epic #56](https://github.com/BetaNYC/SLAM/issues/56), [what v1 had, #58](https://github.com/BetaNYC/SLAM/issues/58), [citywide, #93](https://github.com/BetaNYC/SLAM/issues/93).
- **The first SLAM (2018-2023)** lives on the `main` branch, along with its leftover files in this branch (`src/`, `public/`, the root `package.json`). It ran on Carto, which is gone; v2 is `pipeline/` and `site/`.

## How it works

A small Python program (`pipeline/`) downloads open data, places every record in today's community district lines with DuckDB spatial, groups records by building, finds what is near each address, and writes plain JSON and GeoJSON files. A SvelteKit site (`site/`) turns those files into static pages. Address pages are one page, `/address/?id=<id>`, that loads that address's JSON file in the browser, so the site does not grow by one HTML page per address; old `/address/<id>/` links are forwarded by `site/static/404.html` (#84). There is no database server and no API key. GitHub Actions rebuilds and publishes it to GitHub Pages (`.github/workflows/v2-deploy.yml`).

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

# 3. Look at it
cd build && python3 -m http.server 4173 --bind 127.0.0.1
# open http://127.0.0.1:4173/
```

`site/static/data/`, `site/build/` and `pipeline/.cache/` are not committed.

## Updating the data

The workflow runs on every push to `v2`, by hand from the Actions tab, and nightly at 10:17 UTC. GitHub runs scheduled workflows only from the repository's default branch, so the nightly run starts when `v2` becomes the default branch (#90).

## Contributing

Open an issue or a pull request against `v2`. Write facts, not verdicts: the site never says a place "violates", "meets" or is "eligible" for anything (a test checks). Every number on a page should come from a named source with a date.

## License and credit

GNU General Public License v3.0 (see [`LICENSE`](LICENSE)). A [BetaNYC](https://beta.nyc) prototype. Not an official City of New York product. Built with the help of Claude, an AI coding assistant; see the site's About page for how.
