"""SLAM v2 prototype pipeline.

    uv run python build.py            # fetch live, build site/static/data/
    uv run python build.py --offline  # rebuild from .cache/raw (no network)

Fetches NYC + NYS open data for two community districts, assigns points to
districts with DuckDB spatial, groups records by address, finds what is nearby,
and writes static JSON/GeoJSON for the SvelteKit site. Safe to re-run: every
output file is rewritten whole; the geocode cache only ever grows.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.parse
from datetime import UTC, datetime
from pathlib import Path

import duckdb

from slam_pipeline import net, padmatch, spatial
from slam_pipeline.net import log
from slam_pipeline.sources import (
    COMPLAINTS_311_LOCATION_TYPES,
    COMPLAINTS_311_TYPES,
    COMPLAINTS_311_START,
    COMPLAINTS_311_END,
    DISTRICT_SOURCE,
    DISTRICTS,
    LICENSE_COUNT_EXTRA_COUNTIES,
    PLACE_OF_WORSHIP_CLASSES,
    SCHOOL_NOTES,
    SLA_LICENSE,
    SLA_RULES,
    CANNABIS_RULES,
    SOURCES,
    SOURCES_BY_KEY,
    WORSHIP_CLASSES,
    _sql_list,
)
from slam_pipeline.transform import (
    GEOSEARCH_MIN_CONFIDENCE,
    GEOSEARCH_SIZE,
    GRADE_BUCKETS,
    GRADE_LABEL,
    LIQUOR_COUNT_FT,
    CANNABIS_SCHOOL_FT,
    CANNABIS_WORSHIP_FT,
    CANNABIS_SOURCES,
    SW_BUFFER_FT,
    SW_LIST_FT,
    accept_geosearch,
    address_query,
    bbox_with_margin,
    board_311_slug,
    check_columns,
    check_rows,
    count_by_type,
    count_by_type_year,
    events_for_district,
    grade_bucket,
    group_addresses,
    house_number,
    is_on_premises_liquor,
    key_pages,
    normalize_311,
    normalize_address,
    normalize_co,
    normalize_event,
    normalize_record,
    normalize_school,
    normalize_worship,
    page_co_bin,
    pick_address_hit,
    place_restaurant,
    recent_311,
    reduce_inspections,
    same_street,
    slim_geosearch,
    street_name,
)

HERE = Path(__file__).resolve().parent
CACHE = HERE / ".cache"
RAW = CACHE / "raw"
GEOCODE_CACHE = CACHE / "geocode.json"
ADDRESS_GEOCODE_CACHE = CACHE / "geocode-address.json"  # address pages, keyed by query text
OUT = HERE.parent / "site" / "static" / "data"

NEARBY_M = 150
C311_RECENT_DISTRICT = 200  # rows in the district tab
C311_RECENT_ADDRESS = 10  # rows listed on an address page
C311_COMPARE_M = 25  # reported only: how many complaints a 25 m radius would have matched
GEOSEARCH = "https://geosearch.planninglabs.nyc/v2/search"  # https://geosearch.planninglabs.nyc/docs/
GEOCODE_MIN_INTERVAL = 0.25  # seconds between requests -> at most 4 req/s
ADDRESS_GEOCODE_INTERVAL = 0.35  # address pages: serial, a little gentler still
# The site's search box falls back to the nearest address page within this many metres
# when the BIN it picked has no page (site/src/lib/addressSearch.js reads it from
# bin-index.json). Small on purpose: on a dense block 25 m reaches the next building, but
# SLA points sit about 25 m from the PAD address point (44 Wilson Ave: 25 m), so 30 m it is;
# the page then says it is the nearest page and how far away.
NEAREST_PAGE_M = 30

# Fields whose absence anywhere in the returned rows means the build is wrong.
REQUIRED_IN_ROWS = {
    "liquor_pending": ["application_id", "actual_address_of_premises", "georeference"],
    "liquor_active": ["licensepermitid", "actualaddressofpremises", "georeference"],
    "liquor_inactive": ["license_permit_id", "actual_address_of_premises", "georeference"],
    "cannabis_retail": ["ocm_license_number", "physical_address", "georeference"],
    "cannabis_license": ["application_number", "address_line_1", "license_status"],
    "dining_out": ["street", "latitude", "longitude", "community_board"],
    "street_events": ["event_id", "event_name", "community_board", "event_borough"],
    "complaints_311": ["unique_key", "created_date", "complaint_type", "incident_address",
                       "latitude", "longitude", "community_board"],
    "restaurant_inspections": ["camis", "dba", "inspection_date", "grade", "community_board",
                               "latitude", "longitude", "bin"],
    "co_dobnow": ["bin", "c_of_o_number", "c_of_o_issuance_date"],
    "schools": ["uid", "facname", "factype", "latitude", "longitude", "xcoord", "ycoord"],
    "worship": ["bbl", "bldgclass", "latitude", "longitude", "xcoord", "ycoord"],
}
# handled by their own normalizers
NOT_RECORDS = ("street_events", "complaints_311", "restaurant_inspections", "co_dobnow",
               "schools", "worship")
RESTAURANT_RECENT_INSPECTIONS = 10  # all inspections listed per restaurant on an address page


RESTAURANT_BOARD_SLUG = {str(d["boro_cd"]): slug for slug, d in DISTRICTS.items()}


def _coords(geom: dict):
    """Every [lon, lat] in a GeoJSON Polygon / MultiPolygon."""
    c = geom["coordinates"]
    rings = c if geom["type"] == "Polygon" else [r for poly in c for r in poly]
    for ring in rings:
        yield from ring


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(obj, separators=(",", ":"), default=str))
    tmp.replace(path)


def extra_county_where(box) -> str:
    """SoQL for active licenses in LICENSE_COUNT_EXTRA_COUNTIES inside box (min lon, min lat,
    max lon, max lat)."""
    return (f"premisescounty in {_sql_list(LICENSE_COUNT_EXTRA_COUNTIES)} AND "
            f"within_box(georeference, {box[3]:.6f}, {box[0]:.6f}, {box[1]:.6f}, {box[2]:.6f})")


def top_up_311(s, where: str, rows: list[dict]) -> list[dict]:
    """Guard against a stale page (seen 2026-11-05: a full paged fetch stopped at 2026-11-01
    while the portal already had complaints through 2026-11-04). Ask once more, sorted newest
    first, for anything created after the newest row we got, and add rows we do not have."""
    newest = max(r["created_date"] for r in rows)
    newer = net.fetch_all(s.domain, s.id, select=s.fields,
                          where=f"{where} AND created_date > '{newest}'",
                          order="created_date DESC, unique_key", page_size=5000)
    have = {r["unique_key"] for r in rows}
    add = [r for r in newer if r["unique_key"] not in have]
    if add:
        log("topped_up", source=s.key, rows=len(add), newest_before=newest[:10],
            newest_after=max(r["created_date"] for r in add)[:10])
    return rows + add


def load_or_fetch(key: str, offline: bool, fetch):
    p = RAW / f"{key}.json"
    if offline:
        if not p.exists():
            sys.exit(f"--offline but no cached raw data at {p}; run once without --offline")
        return json.loads(p.read_text())
    data = fetch()
    write_json(p, data)
    return data


# ------------------------------------------------------------------ geocode


def geocode_cannabis(records: list[dict], offline: bool) -> dict:
    cache = json.loads(GEOCODE_CACHE.read_text()) if GEOCODE_CACHE.exists() else {}
    stats = {"requested": 0, "cached": 0, "accepted": 0, "rejected": 0}
    last = 0.0
    for r in records:
        if r["lon"] is not None or not r.get("street"):
            continue
        q = f"{r['street']}, {r.get('city', '')}, NY {r.get('zip', '')}".strip()
        if q in cache:
            stats["cached"] += 1
            resp = cache[q]
        elif offline:
            continue
        else:
            wait = GEOCODE_MIN_INTERVAL - (time.monotonic() - last)
            if wait > 0:
                time.sleep(wait)
            last = time.monotonic()
            url = GEOSEARCH + "?" + urllib.parse.urlencode({"text": q, "size": 1})
            try:
                full = net.get_json(url)
            except RuntimeError as exc:
                log("geocode_error", query=q, error=str(exc))
                continue
            # Cache only what accept_geosearch reads, to keep the cache small.
            resp = {"features": [{"geometry": f["geometry"],
                                  "properties": {k: f["properties"].get(k) for k in
                                                 ("confidence", "accuracy", "housenumber",
                                                  "label")}}
                                 for f in full.get("features", [])[:1]]}
            cache[q] = resp
            stats["requested"] += 1
        hit = accept_geosearch(resp, house_number(r["street"]))
        if hit:
            r["lon"], r["lat"] = hit
            r["geocoded"] = True
            stats["accepted"] += 1
        else:
            stats["rejected"] += 1
    write_json(GEOCODE_CACHE, cache)
    log("geocode_done", **stats)
    return stats


def geocode_addresses(groups: dict[str, dict], offline: bool) -> tuple[dict, dict]:
    """Match every address group to a building. First the City's own address file in DuckDB
    (slam_pipeline/padmatch.py, BetaNYC/SLAM#86), then GeoSearch /v2/search for what the file
    cannot match (serial, polite, cached on disk). Returns (group id -> hit, stats)."""
    cache = json.loads(ADDRESS_GEOCODE_CACHE.read_text()) if ADDRESS_GEOCODE_CACHE.exists() else {}
    stats = {"addresses": len(groups), "requested": 0, "cached": 0, "errors": 0,
             "not_in_cache_offline": 0, "matched": 0, "matched_with_bin": 0,
             "low_confidence": 0, "unmatched": 0, "matched_by_pad_file": 0,
             "matched_by_geosearch": 0, "pad_rules": {}}
    pq = padmatch.ensure_pad(CACHE / "pad", offline, log=log)
    pad = padmatch.PadIndex(pq) if pq else None
    if pad:
        stats["pad_file"] = {**json.loads((CACHE / "pad" / "pad.json").read_text()),
                             "version": pad.version, "rows": pad.rows}
    geo: dict[str, dict] = {}
    last = 0.0
    for gid, g in sorted(groups.items()):
        borough = DISTRICTS[g["district"]]["borough"]
        if pad:
            near = (g["lon"], g["lat"]) if g.get("lon") is not None else None
            hit = pad.lookup(g["street"], padmatch.BORO_DIGIT[borough.upper()], g.get("zip"), near)
            if hit:
                geo[gid] = hit
                stats["matched"] += 1
                stats["matched_by_pad_file"] += 1
                stats["matched_with_bin"] += bool(hit["bin"])
                stats["pad_rules"][hit["rule"]] = stats["pad_rules"].get(hit["rule"], 0) + 1
                continue
        q = address_query(g["street"], borough)
        resp = None
        if not q:
            pass
        elif q in cache:
            stats["cached"] += 1
            resp = cache[q]
        elif offline:
            stats["not_in_cache_offline"] += 1
        else:
            wait = ADDRESS_GEOCODE_INTERVAL - (time.monotonic() - last)
            if wait > 0:
                time.sleep(wait)
            last = time.monotonic()
            url = GEOSEARCH + "?" + urllib.parse.urlencode({"text": q, "size": GEOSEARCH_SIZE})
            try:
                resp = slim_geosearch(net.get_json(url, retries=4))
                cache[q] = resp
                stats["requested"] += 1
                if stats["requested"] % 100 == 0:
                    write_json(ADDRESS_GEOCODE_CACHE, cache)  # keep progress if interrupted
                    log("address_geocode_progress", requested=stats["requested"])
            except RuntimeError as exc:
                stats["errors"] += 1
                log("address_geocode_error", query=q, error=str(exc))
        hit = pick_address_hit(resp, g["street"], borough)
        geo[gid] = hit
        stats[hit["status"]] += 1
        stats["matched_by_geosearch"] += hit["status"] == "matched"
        stats["matched_with_bin"] += bool(hit["bin"])
    write_json(ADDRESS_GEOCODE_CACHE, cache)
    log("address_geocode_done", **stats)
    return geo, stats


# ------------------------------------------------------------------ main


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--offline", action="store_true", help="reuse .cache/raw, no network")
    args = ap.parse_args(argv)
    started = datetime.now(UTC)
    log("start", offline=args.offline, out=str(OUT))

    # ---- metadata + schema checks (fail loud before fetching rows)
    metas = {}
    for s in [DISTRICT_SOURCE, *[vars(x) | {"key": x.key} for x in SOURCES]]:
        key, dom, did = s["key"], s["domain"], s["id"]
        meta = load_or_fetch(f"views_{key}", args.offline,
                             lambda dom=dom, did=did: net.view_metadata(dom, did))
        check_columns(key, s["fields"], meta)
        metas[key] = {"id": did, "domain": dom, "name": meta.get("name"),
                      "rowsUpdatedAt": meta.get("rowsUpdatedAt"),
                      "url": f"https://{dom}/d/{did}"}
    log("schema_ok", sources=len(metas))

    # ---- districts
    where = "boro_cd in (" + ",".join(str(d["boro_cd"]) for d in DISTRICTS.values()) + ")"
    dgeo = load_or_fetch("districts", args.offline, lambda: net.get_json(
        net.soql_url(DISTRICT_SOURCE["domain"], DISTRICT_SOURCE["id"], {"$where": where},
                     fmt="geojson")))
    got = sorted(int(f["properties"]["boro_cd"]) for f in dgeo["features"])
    want = sorted(d["boro_cd"] for d in DISTRICTS.values())
    if got != want:
        raise RuntimeError(f"district polygons: expected boro_cd {want}, got {got}")

    # Bounding box of both districts, widened by SW_BUFFER_FT, for sources with no district
    # field (#60: schools, houses of worship, and the 500-foot license count).
    dx = [c[0] for f in dgeo["features"] for c in _coords(f["geometry"])]
    dy = [c[1] for f in dgeo["features"] for c in _coords(f["geometry"])]
    sw_box = bbox_with_margin(dx, dy, SW_BUFFER_FT)

    def in_box(lon, lat) -> bool:
        return lon is not None and sw_box[0] <= lon <= sw_box[2] and sw_box[1] <= lat <= sw_box[3]

    # ---- rows
    raw = {}
    for s in SOURCES:
        where = s.where
        if s.bbox:
            la, lo = s.bbox
            where += (f" AND {la} between {sw_box[1]:.6f} and {sw_box[3]:.6f}"
                      f" AND {lo} between {sw_box[0]:.6f} and {sw_box[2]:.6f}")
        rows = load_or_fetch(s.key, args.offline, lambda s=s, where=where: net.fetch_all(
            s.domain, s.id, select=s.fields, where=where, order=s.order,
            page_size=s.page_size))
        if s.key == "complaints_311" and not args.offline and rows:
            rows = top_up_311(s, where, rows)
        check_rows(s.key, rows, REQUIRED_IN_ROWS[s.key])
        raw[s.key] = rows
        log("fetched", source=s.key, rows=len(rows))

    # DOHMH agreement check (#61): every restaurant point inside the two districts' bounding
    # box whose community_board is NOT one of ours. Point-in-polygon below tells how many of
    # those the community_board filter missed. Grouped, so one row per restaurant point.
    xs = [c[0] for f in dgeo["features"] for c in _coords(f["geometry"])]
    ys = [c[1] for f in dgeo["features"] for c in _coords(f["geometry"])]
    rsrc = SOURCES_BY_KEY["restaurant_inspections"]
    bbox_where = (f"latitude between {min(ys)} and {max(ys)} and longitude between {min(xs)} and "
                  f"{max(xs)} and (community_board is null or community_board not in "
                  f"{_sql_list(RESTAURANT_BOARD_SLUG)})")
    rest_bbox = load_or_fetch("restaurant_inspections_bbox", args.offline, lambda: net.fetch_all(
        rsrc.domain, rsrc.id, select=["camis", "community_board", "latitude", "longitude"],
        where=bbox_where, order="camis,community_board,latitude,longitude",
        group="camis,community_board,latitude,longitude"))

    # Active licenses in the extra counties (Queens), inside the widened box, for the 500-foot
    # count only. georeference is a Socrata point, so the box is within_box(field, NW lat,
    # NW lon, SE lat, SE lon) (https://dev.socrata.com/docs/functions/within_box.html).
    lsrc = SOURCES_BY_KEY["liquor_active"]
    extra_liq = load_or_fetch("liquor_active_extra_counties", args.offline, lambda: net.fetch_all(
        lsrc.domain, lsrc.id, select=lsrc.fields, where=extra_county_where(sw_box),
        order=lsrc.order, page_size=lsrc.page_size))
    check_rows("liquor_active_extra_counties", extra_liq, REQUIRED_IN_ROWS["liquor_active"])
    log("fetched", source="liquor_active_extra_counties", rows=len(extra_liq))

    if not args.offline:
        write_json(RAW / "_fetched.json", {"fetched": started.isoformat(timespec="seconds")})
    fetched_at = json.loads((RAW / "_fetched.json").read_text())["fetched"]

    # ---- normalize
    recs: list[dict] = []
    for s in SOURCES:
        if s.key in NOT_RECORDS:
            continue
        recs.extend(normalize_record(s, r) for r in raw[s.key])

    # Cannabis: drop OCM license rows already present in the retail-dealer list.
    retail_ids = {r["rid"] for r in recs if r["source"] == "cannabis_retail" and r["rid"]}
    before = len(recs)
    recs = [r for r in recs if not (r["source"] == "cannabis_license"
                                   and r.get("license_number") in retail_ids)]
    dup_dropped = before - len(recs)
    geo_stats = geocode_cannabis([r for r in recs if r["source"] == "cannabis_license"],
                                 args.offline)

    # ---- spatial: assign district with DuckDB spatial
    con = duckdb.connect()
    con.execute("INSTALL spatial; LOAD spatial;")
    # DuckDB 2.0 requires this to be explicit; true = [lon, lat] axis order everywhere
    # (see the error text DuckDB raises and https://duckdb.org/docs/stable/core_extensions/spatial/functions).
    con.execute("SET geometry_always_xy = true;")
    con.execute("CREATE TABLE districts (slug VARCHAR, boro_cd INT, geom GEOMETRY)")
    by_cd = {d["boro_cd"]: slug for slug, d in DISTRICTS.items()}
    for f in dgeo["features"]:
        cd = int(f["properties"]["boro_cd"])
        con.execute("INSERT INTO districts VALUES (?, ?, ST_GeomFromGeoJSON(?))",
                    [by_cd[cd], cd, json.dumps(f["geometry"])])

    con.execute("CREATE TABLE recs (i INT, lon DOUBLE, lat DOUBLE)")
    con.executemany("INSERT INTO recs VALUES (?, ?, ?)",
                    [[i, r["lon"], r["lat"]] for i, r in enumerate(recs) if r["lon"] is not None])
    hits = con.execute("""
        SELECT r.i, d.slug FROM recs r JOIN districts d
          ON ST_Contains(d.geom, ST_Point(r.lon, r.lat))
    """).fetchall()
    pip = {i: slug for i, slug in hits}
    for i, r in enumerate(recs):
        r["district"] = pip.get(i)
    # Dining Out carries the City's own community_board assignment; the query already
    # filtered to 101/304, so keep the City's assignment and only record agreement.
    do_agree = do_total = 0
    board_to_slug = {101: "mn-cd1", 304: "bk-cd4"}
    for r, raw_row in zip([r for r in recs if r["source"] == "dining_out"], raw["dining_out"],
                          strict=True):
        city_slug = board_to_slug.get(int(raw_row.get("community_board") or 0))
        do_total += 1
        do_agree += r["district"] == city_slug
        r["district"] = city_slug

    inside = [r for r in recs if r["district"]]

    # ---- addresses: group by street + ZIP, geocode each group once, key pages on BIN (#59)
    groups = group_addresses(inside)
    addr_geo, addr_geo_stats = geocode_addresses(groups, args.offline)
    addrs, aid_remap = key_pages(groups, addr_geo)
    addr_geo_stats["pages"] = len(addrs)
    addr_geo_stats["pages_keyed_on_bin"] = sum(1 for a in addrs.values() if a["bin"])
    addr_geo_stats["pages_merged_from_several_keys"] = sum(1 for a in addrs.values()
                                                           if len(a["keys"]) > 1)
    for r in inside:
        r.pop("akey", None)

    # Page points (QA of #66): GeoSearch's PAD point when matched, else the records' average
    # (transform.page_point). A page stays in the district its records were assigned to (the
    # data as published). A GeoSearch point outside both districts is usually just across a
    # border street (Broadway, Flushing Ave, Canal St); those pages are still measured and say
    # where GeoSearch puts them. Only a point so far out that a 500 ft circle around it leaves
    # the pulled box (measure_box) gets no proximity facts: "nothing nearby" there would be
    # false. The page says so instead.
    measure_box = bbox_with_margin(dx, dy, SW_BUFFER_FT - LIQUOR_COUNT_FT)
    con.execute("CREATE TABLE apts (id VARCHAR, lon DOUBLE, lat DOUBLE)")
    con.executemany("INSERT INTO apts VALUES (?, ?, ?)",
                    [[a["id"], a["lon"], a["lat"]] for a in addrs.values() if a["lon"] is not None])
    a_pip = dict(con.execute("""
        SELECT a.id, d.slug FROM apts a JOIN districts d ON ST_Contains(d.geom, ST_Point(a.lon, a.lat))
    """).fetchall())
    point_stats = {"geosearch": 0, "records": 0, "no_point": 0,
                   "geosearch_outside_both_districts": 0, "geosearch_in_other_district": 0,
                   "not_measured_outside_pulled_area": 0,
                   "records_gap_over_30m": 0, "records_gap_over_100m": 0, "records_gap_median_m": None}
    gaps = []
    for a in addrs.values():
        src = a["point"]["source"]
        point_stats[src or "no_point"] += 1
        a["point"]["outside_districts"] = src == "geosearch" and a["id"] not in a_pip
        a["point"]["district"] = a_pip.get(a["id"])
        a["point"]["measured"] = a["lon"] is not None and (
            not a["point"]["outside_districts"]
            or (measure_box[0] <= a["lon"] <= measure_box[2]
                and measure_box[1] <= a["lat"] <= measure_box[3]))
        point_stats["not_measured_outside_pulled_area"] += (a["lon"] is not None
                                                            and not a["point"]["measured"])
        if a["point"]["outside_districts"]:
            point_stats["geosearch_outside_both_districts"] += 1
        elif src == "geosearch" and a_pip.get(a["id"]) != a["district"]:
            point_stats["geosearch_in_other_district"] += 1
        g = a["point"]["records_gap_m"]
        if g is not None:
            gaps.append(g)
            point_stats["records_gap_over_30m"] += g > 30
            point_stats["records_gap_over_100m"] += g > 100
    if gaps:
        point_stats["records_gap_median_m"] = sorted(gaps)[len(gaps) // 2]
    point_stats["outside_sample"] = sorted(
        f"{a['id']} {a['street']}" for a in addrs.values() if a["point"]["outside_districts"])
    point_stats["not_measured"] = sorted(
        f"{a['id']} {a['street']}" for a in addrs.values()
        if a["lon"] is not None and not a["point"]["measured"])

    def measured(a) -> bool:
        """Pages whose proximity facts are computed."""
        return a["point"]["measured"]

    con.execute("CREATE TABLE addrs (id VARCHAR, lon DOUBLE, lat DOUBLE)")
    con.executemany("INSERT INTO addrs VALUES (?, ?, ?)",
                    [[a["id"], a["lon"], a["lat"]] for a in addrs.values() if measured(a)])
    near = con.execute(f"""
        SELECT a.id, b.id,
               ST_Distance_Sphere(ST_Point(a.lon, a.lat), ST_Point(b.lon, b.lat)) AS m
          FROM addrs a JOIN addrs b ON a.id <> b.id
           AND abs(a.lat - b.lat) < 0.002 AND abs(a.lon - b.lon) < 0.003  -- cheap prefilter
         WHERE ST_Distance_Sphere(ST_Point(a.lon, a.lat), ST_Point(b.lon, b.lat)) <= {NEARBY_M}
         ORDER BY a.id, m
    """).fetchall()
    nearby: dict[str, list] = {}
    for a_id, b_id, m in near:
        nearby.setdefault(a_id, []).append((b_id, round(m)))

    # ---- 311 complaints: district by point-in-polygon; 311's own board only for agreement
    c311 = [normalize_311(r) for r in raw["complaints_311"]]
    for r in c311:  # street + ZIP key id -> address page id (a BIN where the page has one)
        r["aid"] = aid_remap.get(r["aid"], "")
    con.execute("CREATE TABLE c311 (i INT, lon DOUBLE, lat DOUBLE)")
    con.executemany("INSERT INTO c311 VALUES (?, ?, ?)",
                    [[i, r["lon"], r["lat"]] for i, r in enumerate(c311) if r["lon"] is not None])
    c_pip = dict(con.execute("""
        SELECT c.i, d.slug FROM c311 c JOIN districts d
          ON ST_Contains(d.geom, ST_Point(c.lon, c.lat))
    """).fetchall())
    c_agree = c_outside = c_nopoint = 0
    for i, r in enumerate(c311):
        r["district"] = c_pip.get(i)
        if r["lon"] is None:
            c_nopoint += 1
        elif r["district"] is None:
            c_outside += 1
        c_agree += r["district"] is not None and r["district"] == board_311_slug(r["board"], DISTRICTS)
    c_with_district = sum(1 for r in c311 if r["district"])
    # "At this address" = same normalized incident_address + ZIP as the address page
    # (see transform.normalize_311). All fetched rows are eligible, even ones whose point
    # falls just outside the polygon, because the address key, not the point, decides.
    c_at: dict[str, list] = {}
    for r in c311:
        if r["aid"] in addrs:
            c_at.setdefault(r["aid"], []).append(r)
    # Nearby: within NEARBY_M of the address point, excluding complaints counted "at" it.
    c_near_rows = con.execute(f"""
        SELECT a.id, c.i,
               ST_Distance_Sphere(ST_Point(a.lon, a.lat), ST_Point(c.lon, c.lat)) AS m
          FROM addrs a JOIN c311 c
            ON abs(a.lat - c.lat) < 0.002 AND abs(a.lon - c.lon) < 0.003  -- cheap prefilter
         WHERE ST_Distance_Sphere(ST_Point(a.lon, a.lat), ST_Point(c.lon, c.lat)) <= {NEARBY_M}
    """).fetchall()
    c_near: dict[str, list] = {}
    c_within_compare = set()
    for a_id, ci, m in c_near_rows:
        if m <= C311_COMPARE_M:
            c_within_compare.add(ci)
        if c311[ci]["aid"] != a_id:
            c_near.setdefault(a_id, []).append(c311[ci])
    c_matched = sum(len(v) for v in c_at.values())
    c_through = max((r["date"] for r in c311), default="")
    # Year columns run from the configured start through the newest complaint's year.
    years = list(range(int(COMPLAINTS_311_START[:4]), int((c_through or COMPLAINTS_311_START)[:4]) + 1))

    # ---- restaurant inspections (#61): one restaurant per camis; district = DOHMH's own
    # community_board (the query filter), checked against point-in-polygon.
    rests = reduce_inspections(raw["restaurant_inspections"])
    rlist = list(rests.values())
    con.execute("CREATE TABLE rest (i INT, lon DOUBLE, lat DOUBLE)")
    con.executemany("INSERT INTO rest VALUES (?, ?, ?)",
                    [[i, r["lon"], r["lat"]] for i, r in enumerate(rlist) if r["lon"] is not None])
    r_pip = dict(con.execute("""
        SELECT r.i, d.slug FROM rest r JOIN districts d ON ST_Contains(d.geom, ST_Point(r.lon, r.lat))
    """).fetchall())
    r_agree = r_with_point = 0
    r_disagree = []
    for i, r in enumerate(rlist):
        r["district"] = RESTAURANT_BOARD_SLUG.get(r["board"])
        if r["lon"] is None:
            continue
        r_with_point += 1
        if r_pip.get(i) == r["district"]:
            r_agree += 1
        else:
            r_disagree.append({"camis": r["camis"], "board": r["board"], "pip": r_pip.get(i)})
    # Restaurants the board filter missed: other boards (or none) whose point is inside.
    seen_missed = set()
    con.execute("CREATE TABLE rbox (camis VARCHAR, lon DOUBLE, lat DOUBLE)")
    con.executemany("INSERT INTO rbox VALUES (?, ?, ?)",
                    [[b["camis"], float(b["longitude"]), float(b["latitude"])] for b in rest_bbox
                     if b.get("latitude") and b.get("longitude") and float(b["latitude"])])
    for camis, slug in con.execute("""
        SELECT b.camis, d.slug FROM rbox b JOIN districts d ON ST_Contains(d.geom, ST_Point(b.lon, b.lat))
    """).fetchall():
        if camis not in rests:
            seen_missed.add((camis, slug))
    # Join to address pages: BIN first, then point (transform.place_restaurant).
    page_bins = {a["bin"]: a["id"] for a in addrs.values() if a["bin"]}
    page_pts = [(a["id"], a["lon"], a["lat"], bool(a["bin"]),
                 frozenset(normalize_address(r.get("street")) for r in a["records"]))
                for a in addrs.values() if measured(a)]
    r_at: dict[str, list] = {}
    r_stats = {slug: {"restaurants": 0, "on_page_by_bin": 0, "on_page_by_point": 0,
                      "not_on_a_page": 0, "no_point": 0, "not_yet_inspected": 0}
               for slug in DISTRICTS}
    for r in rlist:
        r.update(place_restaurant(r, page_bins, page_pts, NEAREST_PAGE_M))
        r["bucket"] = grade_bucket(r)
        st = r_stats[r["district"]]
        st["restaurants"] += 1
        st["no_point"] += r["lon"] is None
        st["not_yet_inspected"] += r["not_inspected"]
        if r["method"] == "bin":
            st["on_page_by_bin"] += 1
        elif r["method"] == "point":
            st["on_page_by_point"] += 1
        else:
            st["not_on_a_page"] += 1
        if r["aid"]:
            r_at.setdefault(r["aid"], []).append(r)

    # ---- certificates of occupancy (#62): DOB NOW records by BIN; BIS is linked by BIN.
    co_by_bin: dict[str, list] = {}
    for row in raw["co_dobnow"]:
        c = normalize_co(row)
        if c["bin"]:
            co_by_bin.setdefault(c["bin"], []).append(c)
    for v in co_by_bin.values():
        v.sort(key=lambda c: (c["issued"], c["number"]), reverse=True)

    # ---- schools and houses of worship (#60). Straight lines, building point to building
    # point, in EPSG:2263 feet (slam_pipeline/spatial.py). Nothing here applies a rule.
    sw_con = spatial.connect()
    schools = [normalize_school(r, SCHOOL_NOTES) for r in raw["schools"]]
    worship = [normalize_worship(r, WORSHIP_CLASSES, PLACE_OF_WORSHIP_CLASSES) for r in raw["worship"]]
    # Axis-order guard: our projection of each lat/lon must land on the source's own x/y.
    sw_axis_gap = {
        "schools": round(spatial.check_axis_order(
            sw_con, [(f["lon"], f["lat"], f["x"], f["y"]) for f in schools], "schools"), 2),
        "worship": round(spatial.check_axis_order(
            sw_con, [(f["lon"], f["lat"], f["x"], f["y"]) for f in worship], "worship"), 2)}
    facs = [f for f in schools + worship if f["lon"] is not None]
    fac_by_id = {f["id"]: f for f in facs}
    con.execute("CREATE TABLE facs (id VARCHAR, lon DOUBLE, lat DOUBLE)")
    con.executemany("INSERT INTO facs VALUES (?, ?, ?)", [[f["id"], f["lon"], f["lat"]] for f in facs])
    for fid, slug in con.execute("""
        SELECT f.id, d.slug FROM facs f JOIN districts d ON ST_Contains(d.geom, ST_Point(f.lon, f.lat))
    """).fetchall():
        fac_by_id[fid]["district"] = slug
    # Per district: facilities inside it or within SW_BUFFER_FT of its line, with the distance
    # outside (0 inside). These are the map layer's points and the list view's rows (QA of #66:
    # the map note says every point is in the list view).
    fac_ft = {}  # (slug, facility id) -> feet outside the district
    for fid, slug, ft in con.execute(f"""
        SELECT f.id, d.slug,
               ST_Distance(ST_Transform(d.geom, 'EPSG:4326', 'EPSG:2263', always_xy := true),
                           ST_Transform(ST_Point(f.lon, f.lat), 'EPSG:4326', 'EPSG:2263',
                                        always_xy := true)) AS ft
          FROM facs f, districts d
         WHERE ft <= {SW_BUFFER_FT}
    """).fetchall():
        fac_ft[(slug, fid)] = ft
    page_pts = [(a["id"], a["lon"], a["lat"]) for a in addrs.values() if measured(a)]
    sw_near: dict[str, list] = {}
    for pid, fid, ft in spatial.pairs_within(sw_con, page_pts,
                                             [(f["id"], f["lon"], f["lat"]) for f in facs], SW_LIST_FT):
        sw_near.setdefault(pid, []).append((fac_by_id[fid], ft))
    # Cannabis Law §72(6): schools within 500 ft (a) and houses of worship within 200 ft (b), for
    # pages with a cannabis record only. Same straight-line, building-point method.
    cann_pages = [p for p in page_pts if any(r["source"] in CANNABIS_SOURCES for r in addrs[p[0]]["records"])]
    cann_near: dict[str, list] = {}
    for pid, fid, ft in spatial.pairs_within(sw_con, cann_pages,
                                             [(f["id"], f["lon"], f["lat"]) for f in facs], CANNABIS_SCHOOL_FT):
        f = fac_by_id[fid]
        if f["kind"] == "school" or (f["kind"] == "worship" and ft <= CANNABIS_WORSHIP_FT):
            cann_near.setdefault(pid, []).append((f, ft))
    # Active on-premises liquor licenses (SLA class mapping: transform.is_on_premises_liquor),
    # rows for New York and Kings plus Queens (extra_liq), kept when inside the widened box. One "premises" =
    # one address page, or one street + ZIP key for licenses without a page.
    onprem = []
    for row in raw["liquor_active"] + extra_liq:
        if not is_on_premises_liquor(row.get("type"), row.get("class")):
            continue
        r = normalize_record(lsrc, row)
        if not in_box(r["lon"], r["lat"]):
            continue
        r["premises"] = aid_remap.get(r["aid"], r["aid"]) or f"pt:{r['lon']:.5f},{r['lat']:.5f}"
        r["code"] = str(row.get("class", "")).strip()
        r["county"] = str(row.get("premisescounty", "")).strip()
        onprem.append(r)
    liq_near: dict[str, list] = {}
    for pid, li, ft in spatial.pairs_within(sw_con, page_pts,
                                            [(str(i), r["lon"], r["lat"]) for i, r in enumerate(onprem)],
                                            LIQUOR_COUNT_FT):
        r = onprem[int(li)]
        if r["premises"] != pid:  # licenses at this address are not counted
            liq_near.setdefault(pid, []).append((r, ft))
    sw_stats = {slug: {"schools": 0, "worship": 0, "religious": 0, "pages": 0,
                       "pages_with_sw_within_200ft": 0, "pages_with_school": 0,
                       "pages_with_worship": 0, "pages_with_religious": 0,
                       "pages_with_3_or_more_premises_within_500ft": 0}
                for slug in DISTRICTS}
    for f in facs:
        if f.get("district"):
            sw_stats[f["district"]]["schools" if f["kind"] == "school" else f["kind"]] += 1
    liquor_classes = {}
    for r in onprem:
        liquor_classes.setdefault(r["code"], r["type"])

    # ---- events
    events = [normalize_event(r) for r in raw["street_events"]]

    # ---- outputs
    def slim(r):
        keep = ("source", "rid", "name", "legal_name", "dba", "street", "street2", "city", "zip",
                "type", "cls", "ltype", "lclass", "status", "date", "date_label", "issued",
                "operational", "aid", "lon", "lat", "geocoded")
        return {k: r[k] for k in keep if r.get(k) not in (None, "")}

    counts: dict[str, dict] = {}
    for slug, d in DISTRICTS.items():
        drecs = [slim(r) for r in inside if r["district"] == slug]
        devents = events_for_district(events, d["borough"], d["cb"])
        lists = {k: [r for r in drecs if r["source"] == k] for k in
                 ("liquor_pending", "liquor_active", "liquor_inactive", "cannabis_retail",
                  "cannabis_license", "dining_out")}
        for k in lists:
            lists[k].sort(key=lambda r: (r.get("date", "")), reverse=True)
        lists["street_events"] = sorted(devents, key=lambda e: e["start"])
        counts[slug] = {k: len(v) for k, v in lists.items()}
        d311 = [r for r in c311 if r["district"] == slug]
        counts[slug]["complaints_311"] = len(d311)
        lists["complaints_311"] = {"total": len(d311), "years": years, "through": c_through,
                                   "start": COMPLAINTS_311_START,
                                   "by_type_year": count_by_type_year(d311, years),
                                   "recent": recent_311(d311, C311_RECENT_DISTRICT)}
        drest = sorted((r for r in rlist if r["district"] == slug),
                       key=lambda r: (r["dba"], r["camis"]))
        counts[slug]["restaurant_inspections"] = len(drest)
        counts[slug]["schools"] = sw_stats[slug]["schools"]
        counts[slug]["worship"] = sw_stats[slug]["worship"]
        counts[slug]["religious"] = sw_stats[slug]["religious"]
        dfac = sorted(((fac_by_id[fid], ft) for (s2, fid), ft in fac_ft.items() if s2 == slug),
                      key=lambda p: (p[0]["kind"], p[0]["name"] or p[0]["street"], p[0]["id"]))
        lists["schools_worship"] = {
            "buffer_ft": SW_BUFFER_FT,
            "rows": [{"kind": f["kind"], "name": f["name"], "type": f["type"], "street": f["street"],
                      "ft_outside": round(ft), "note": f["note"]} for f, ft in dfac]}
        counts[slug]["co_dobnow"] = sum(1 for row in raw["co_dobnow"]
                                        if str(row.get("community_board")) == str(d["boro_cd"]))
        lists["restaurants"] = {
            "buckets": [{"bucket": b, "n": sum(1 for r in drest if r["bucket"] == b)}
                        for b in GRADE_BUCKETS],
            "total": len(drest), "stats": r_stats[slug],
            "rows": [{"camis": r["camis"], "dba": r["dba"], "street": r["street"], "zip": r["zip"],
                      "grade": r["bucket"],
                      "grade_date": (r["latest"] or {}).get("grade_date", ""),
                      "last_inspected": r["last_inspected"], "bin": r["bin"] or "",
                      "aid": r["aid"] or "", "placed": r["method"] or ""} for r in drest]}
        write_json(OUT / slug / "list.json", lists)
        # Map layer (#60): the same facilities as the list view, loaded only when switched on.
        write_json(OUT / slug / "schools-worship.geojson", {"type": "FeatureCollection", "features": [
            {"type": "Feature", "geometry": {"type": "Point",
                                             "coordinates": [round(f["lon"], 6), round(f["lat"], 6)]},
             "properties": {"k": f["kind"], "n": f["name"], "t": f["type"], "s": f["street"],
                            "o": round(ft)}}
            for f, ft in dfac]})
        feats = [{"type": "Feature", "geometry": {"type": "Point",
                                                  "coordinates": [r["lon"], r["lat"]]},
                  "properties": {"source": r["source"], "name": r["name"], "aid": r.get("aid", ""),
                                 "street": r.get("street", ""), "status": r.get("status", "")}}
                 for r in drecs if r.get("lon") is not None]
        write_json(OUT / slug / "points.geojson", {"type": "FeatureCollection", "features": feats})
        # 311 dots in their own file so the map can load them only when the layer is on.
        # aid is set only when that address has a page.
        f311 = [{"type": "Feature", "geometry": {"type": "Point",
                                                   "coordinates": [round(r["lon"], 6), round(r["lat"], 6)]},
                 "properties": {"d": r["date"], "t": r["type"], "s": r["street"],
                                "aid": r["aid"] if r["aid"] in addrs else ""}}
                for r in d311]
        write_json(OUT / slug / "points-311.geojson", {"type": "FeatureCollection", "features": f311})

    # The one-file map layer of the first #60 build is now per district (above). Move, not
    # delete, the old file so it is not published.
    old_sw = OUT / "schools-worship.geojson"
    if old_sw.exists():
        dest = CACHE / "orphaned" / started.strftime("%Y%m%dT%H%M%S")
        dest.mkdir(parents=True, exist_ok=True)
        old_sw.replace(dest / old_sw.name)

    write_json(OUT / "districts.geojson", {"type": "FeatureCollection", "features": [
        {"type": "Feature", "geometry": f["geometry"],
         "properties": {"boro_cd": int(f["properties"]["boro_cd"]),
                        "slug": by_cd[int(f["properties"]["boro_cd"])]}}
        for f in dgeo["features"]]})

    index = []
    co_pages_with_records = 0
    for a in addrs.values():
        out = {k: v for k, v in a.items() if k != "keys"}
        out["records"] = [slim(r) for r in a["records"]]
        out["nearby"] = [{"id": b, "m": m, "street": addrs[b]["street"],
                          "records": [{k: r[k] for k in ("source", "name", "type", "status")
                                      if r.get(k)} for r in addrs[b]["records"]]}
                         for b, m in nearby.get(a["id"], [])]
        at = c_at.get(a["id"], [])
        out["c311"] = {"n": len(at), "years": years, "through": c_through,
                       "by_type_year": count_by_type_year(at, years),
                       "recent": recent_311(at, C311_RECENT_ADDRESS)}
        nb = c_near.get(a["id"], [])
        out["c311_near"] = {"n": len(nb), "by_type": count_by_type(nb)}
        here = sorted(r_at.get(a["id"], []), key=lambda r: (r["dba"], r["camis"]))
        out["restaurants"] = [{
            "camis": r["camis"], "dba": r["dba"], "street": r["street"], "zip": r["zip"],
            "bin": r["bin"], "placed": r["method"], "m": r["m"], "bucket": r["bucket"],
            "latest": r["latest"], "history": r["history"],
            "grade_labels": {h["grade"]: GRADE_LABEL[h["grade"]] for h in r["history"]},
            "not_inspected": r["not_inspected"], "last_inspected": r["last_inspected"],
            "n_inspections": len(r["inspections"]),
            "inspections": r["inspections"][:RESTAURANT_RECENT_INSPECTIONS]} for r in here]
        co_bin, co_src = page_co_bin(a["bin"], [r["bin"] for r in here])
        out["co"] = {"bin": co_bin, "bin_source": co_src,
                     "records": co_by_bin.get(co_bin, []) if co_bin else []}
        co_pages_with_records += bool(out["co"]["records"])
        page_streets = {street_name(r.get("street")) for r in a["records"]} - {""}
        near_sw = sorted(sw_near.get(a["id"], []), key=lambda p: (p[1], p[0]["id"]))
        near_liq = sorted(liq_near.get(a["id"], []), key=lambda p: (p[1], p[0]["rid"]))
        premises = {r["premises"] for r, _ in near_liq}
        out["sw"] = {
            "near": [{"kind": f["kind"], "name": f["name"], "type": f["type"], "street": f["street"],
                      "ft": round(ft), "same_street": same_street(page_streets, f["street_name"]),
                      **({"note": f["note"]} if f["note"] else {})}
                     for f, ft in near_sw],
            "liq": {"premises": len(premises), "licenses": len(near_liq),
                    "rows": [{"name": r["name"], "street": r["street"], "code": r["code"],
                              "ft": round(ft), "aid": r["premises"] if r["premises"] in addrs else ""}
                             for r, ft in near_liq]}}
        if any(r["source"] in CANNABIS_SOURCES for r in a["records"]):
            cn = sorted(cann_near.get(a["id"], []), key=lambda p: (p[1], p[0]["id"]))
            out["cannabis_sw"] = [{"kind": f["kind"], "name": f["name"], "type": f["type"],
                                   "street": f["street"], "ft": round(ft),
                                   "same_street": same_street(page_streets, f["street_name"]),
                                   **({"note": f["note"]} if f["note"] else {})} for f, ft in cn]
        st = sw_stats[a["district"]]
        st["pages"] += 1
        if "cannabis_sw" in out:
            st["cannabis_pages"] = st.get("cannabis_pages", 0) + 1
            st["cannabis_pages_with_school_within_500ft"] = (
                st.get("cannabis_pages_with_school_within_500ft", 0)
                + any(f["kind"] == "school" for f in out["cannabis_sw"]))
            st["cannabis_pages_with_worship_within_200ft"] = (
                st.get("cannabis_pages_with_worship_within_200ft", 0)
                + any(f["kind"] == "worship" for f in out["cannabis_sw"]))
        st["pages_with_sw_within_200ft"] += bool(near_sw)
        st["pages_with_school"] += any(f["kind"] == "school" for f, _ in near_sw)
        st["pages_with_worship"] += any(f["kind"] == "worship" for f, _ in near_sw)
        st["pages_with_religious"] += any(f["kind"] == "religious" for f, _ in near_sw)
        st["pages_with_3_or_more_premises_within_500ft"] += len(premises) >= 3
        write_json(OUT / "address" / f"{a['id']}.json", out)
        index.append({"id": a["id"], "bin": a["bin"], "street": a["street"], "zip": a["zip"],
                      "district": a["district"], "n": len(a["records"]),
                      "n311": len(c_at.get(a["id"], [])),
                      "nrest": len(r_at.get(a["id"], []))})
    write_json(OUT / "address" / "index.json", index)
    # The search box's lookup table (#59): BIN -> page id, plus every page point for the
    # nearest-page fallback. Lives outside address/ so the orphan sweep below ignores it.
    write_json(OUT / "bin-index.json", {
        "radius_m": NEAREST_PAGE_M,
        "bins": {a["bin"]: a["id"] for a in addrs.values() if a["bin"]},
        "points": [[a["id"], round(a["lon"], 6), round(a["lat"], 6)]
                   for a in addrs.values() if a["lon"] is not None],
    })
    # Idempotency: address ids from an earlier run that no longer exist are moved
    # (not deleted) out of the site's static tree so they are not published.
    live = {f"{a['id']}.json" for a in index} | {"index.json"}
    orphans = [p for p in (OUT / "address").glob("*.json") if p.name not in live]
    if orphans:
        dest = CACHE / "orphaned-address" / started.strftime("%Y%m%dT%H%M%S")
        dest.mkdir(parents=True, exist_ok=True)
        for p in orphans:
            p.replace(dest / p.name)
        log("orphans_moved", count=len(orphans), dest=str(dest))

    manifest = {
        "generated": datetime.now(UTC).isoformat(timespec="seconds"),
        "data_fetched": fetched_at,
        "duration_s": round((datetime.now(UTC) - started).total_seconds(), 1),
        "nearby_m": NEARBY_M,
        "fetched_live": not args.offline,
        "districts": {slug: {**d, "counts": counts[slug]} for slug, d in DISTRICTS.items()},
        "sources": {k: {**metas[k],
                        "rowsUpdatedAtIso": datetime.fromtimestamp(
                            metas[k]["rowsUpdatedAt"], UTC).isoformat()
                        if metas[k].get("rowsUpdatedAt") else None,
                        "rows_fetched": len(raw[k]) if k in raw else len(dgeo["features"]),
                        "title": SOURCES_BY_KEY[k].title if k in SOURCES_BY_KEY else "Community Districts"}
                    for k in metas},
        "cannabis": {"license_rows_deduped_against_retail": dup_dropped, "geocode": geo_stats},
        "dining_out_pip_agreement": f"{do_agree}/{do_total}",
        "complaints_311": {
            "start": COMPLAINTS_311_START, "end": COMPLAINTS_311_END, "through": c_through,
            "location_types": list(COMPLAINTS_311_LOCATION_TYPES),
            "complaint_types_any_location": list(COMPLAINTS_311_TYPES),
            "fetched": len(c311), "no_point": c_nopoint, "outside_both_districts": c_outside,
            "board_vs_pip_agreement": f"{c_agree}/{c_with_district}",
            "matched_to_address_page": c_matched,
            "within_25m_of_an_address_page": len(c_within_compare),
            "address_match": "normalized incident_address + ZIP equals the address page key",
        },
        "restaurant_inspections": {
            "filter": f"community_board in {list(RESTAURANT_BOARD_SLUG)}",
            "violation_rows_fetched": len(raw["restaurant_inspections"]),
            "restaurants": len(rlist),
            "by_district": r_stats,
            "board_vs_pip_agreement": f"{r_agree}/{r_with_point}",
            "board_vs_pip_disagree": r_disagree,
            "inside_a_district_but_other_board": len(seen_missed),
            "inside_a_district_but_other_board_sample": sorted(seen_missed)[:20],
            "placement": "BIN equals an address page's BIN; else nearest page without a BIN "
                         f"(or any page, if the restaurant has no BIN) within {NEAREST_PAGE_M} m "
                         "that lists the restaurant's own normalized address",
            "not_yet_inspected_rule": "inspection_date 1900-01-01 (dataset column description)",
        },
        "sla_license": SLA_LICENSE,
        "schools_worship": {
            "rules": SLA_RULES,
            "cannabis_rules": CANNABIS_RULES,
            "cannabis_school_ft": CANNABIS_SCHOOL_FT, "cannabis_worship_ft": CANNABIS_WORSHIP_FT,
            "list_ft": SW_LIST_FT, "liquor_count_ft": LIQUOR_COUNT_FT, "buffer_ft": SW_BUFFER_FT,
            "bbox": [round(v, 6) for v in sw_box],
            "measure": "straight line between building points (address page point; FacDB facility "
                       "point; PLUTO lot point; SLA license point), projected to EPSG:2263 feet "
                       "with DuckDB spatial; not entrance to entrance",
            "axis_check_median_gap_ft": sw_axis_gap,
            "schools_fetched": len(schools), "worship_fetched": len(worship),
            "on_premises_licenses_in_box": len(onprem),
            "on_premises_licenses_in_box_by_county": {
                c: sum(1 for r in onprem if r["county"] == c)
                for c in sorted({r["county"] for r in onprem})},
            "license_counties": ["New York", "Kings", *LICENSE_COUNT_EXTRA_COUNTIES],
            "extra_county_rows_fetched": len(extra_liq),
            "on_premises_classes": dict(sorted(liquor_classes.items())),
            "by_district": sw_stats,
            "worship_classes": {c: WORSHIP_CLASSES[c] for c in PLACE_OF_WORSHIP_CLASSES},
            "religious_classes": {c: v for c, v in WORSHIP_CLASSES.items()
                                  if c not in PLACE_OF_WORSHIP_CLASSES},
            "class_labels": "PLUTO DATA DICTIONARY August 2026 (26v2), M. CHURCHES, SYNAGOGUES, ETC.",
            "same_street": "the facility's listed street name (house number and floor, suite or "
                           "unit text removed, normalized like page addresses) equals one of the "
                           "page's listed street names",
        },
        "co_dobnow": {"rows": len(raw["co_dobnow"]), "bins": len(co_by_bin),
                      "address_pages_with_records": co_pages_with_records},
        "addresses": len(index),
        "page_points": {**point_stats,
                        "rule": "GeoSearch PAD point when the page's geocode is matched; else the "
                                "average of the records' own points. A page whose GeoSearch point "
                                "is outside both districts keeps its district but gets no "
                                "proximity facts."},
        "address_geocode": {**addr_geo_stats, "endpoint": GEOSEARCH,
                            "rule": "first the City's normalized PAD file (the file GeoSearch is "
                                    "built from) in DuckDB: same house number, normalized street and "
                                    "borough, with cleanup readings (padmatch.candidates); readings "
                                    f"that can land on the wrong building must be within "
                                    f"{padmatch.RISKY_MAX_FT} ft of the records' own point. Then "
                                    "GeoSearch for the rest: same house number, street and borough; "
                                    f"confidence >= {GEOSEARCH_MIN_CONFIDENCE}; accuracy point. "
                                    "Placeholder BINs (x000000) are never used as keys",
                            "pad_url": padmatch.PAD_URL,
                            "nearest_page_m": NEAREST_PAGE_M},
    }
    write_json(OUT / "manifest.json", manifest)

    # ---- human summary on stdout
    print(f"\nSLAM v2 prototype build, {manifest['generated']}  ({manifest['duration_s']} s); "
          f"data fetched {fetched_at}")
    print(f"{'source':<20}{'fetched':>9}" + "".join(f"{s:>10}" for s in DISTRICTS))
    for s in SOURCES:
        print(f"{s.key:<20}{len(raw[s.key]):>9}" +
              "".join(f"{counts[slug][s.key]:>10}" for slug in DISTRICTS))
    print(f"address geocode: {addr_geo_stats}")
    lists_out = ("outside_sample", "not_measured")
    print(f"page points: { {k: v for k, v in point_stats.items() if k not in lists_out} }")
    print(f"  not measured (outside the pulled area): {point_stats['not_measured']}")
    print(f"  GeoSearch point outside both districts: {point_stats['outside_sample']}")
    print(f"addresses: {len(index)}  nearby pairs (<= {NEARBY_M} m): {len(near)}")
    print(f"cannabis licenses deduped vs retail: {dup_dropped}; geocode: {geo_stats}")
    print(f"dining out: City board vs DuckDB point-in-polygon agree {do_agree}/{do_total}")
    print(f"311 since {COMPLAINTS_311_START} (through {c_through}): fetched {len(c311)}, "
          f"no point {c_nopoint}, outside both polygons {c_outside}; 311 community_board vs "
          f"point-in-polygon agree {c_agree}/{c_with_district}")
    for slug in DISTRICTS:
        d311 = [r for r in c311 if r["district"] == slug]
        by_lt = ", ".join(f"{y} {sum(1 for r in d311 if r['year'] == y)}" for y in years)
        print(f"  {slug}: {len(d311)} complaints ({by_lt})")
    print(f"restaurants: {len(rlist)} from {len(raw['restaurant_inspections'])} violation rows; "
          f"board vs point-in-polygon agree {r_agree}/{r_with_point}; inside a district with "
          f"another board: {len(seen_missed)}")
    for slug, st in r_stats.items():
        print(f"  {slug}: {st}")
    print(f"DOB NOW COs: {len(raw['co_dobnow'])} rows, {len(co_by_bin)} BINs")
    print(f"schools {len(schools)}, houses of worship {len(worship)} fetched (box + {SW_BUFFER_FT} ft); "
          f"axis check median gap ft {sw_axis_gap}; on-premises liquor licenses in box {len(onprem)}")
    for slug, st in sw_stats.items():
        print(f"  {slug}: {st}")
    print(f"311 matched to an address page by address key: {c_matched}; "
          f"within {C311_COMPARE_M} m of an address page point: {len(c_within_compare)}")
    log("done", addresses=len(index))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
