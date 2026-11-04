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

from slam_pipeline import net
from slam_pipeline.net import log
from slam_pipeline.sources import (
    COMPLAINTS_311_LOCATION_TYPES,
    COMPLAINTS_311_START,
    DISTRICT_SOURCE,
    DISTRICTS,
    SOURCES,
    SOURCES_BY_KEY,
)
from slam_pipeline.transform import (
    GEOSEARCH_MIN_CONFIDENCE,
    GEOSEARCH_SIZE,
    accept_geosearch,
    address_query,
    board_311_slug,
    check_columns,
    check_rows,
    count_by_type,
    count_by_type_year,
    events_for_district,
    group_addresses,
    house_number,
    key_pages,
    normalize_311,
    normalize_event,
    normalize_record,
    pick_address_hit,
    recent_311,
    slim_geosearch,
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
}
NOT_RECORDS = ("street_events", "complaints_311")  # handled by their own normalizers


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(obj, separators=(",", ":"), default=str))
    tmp.replace(path)


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
    """Geocode every address group once with /v2/search (serial, polite, cached on disk).
    Returns (group id -> pick_address_hit result, stats)."""
    cache = json.loads(ADDRESS_GEOCODE_CACHE.read_text()) if ADDRESS_GEOCODE_CACHE.exists() else {}
    stats = {"addresses": len(groups), "requested": 0, "cached": 0, "errors": 0,
             "not_in_cache_offline": 0, "matched": 0, "matched_with_bin": 0,
             "low_confidence": 0, "unmatched": 0}
    geo: dict[str, dict] = {}
    last = 0.0
    for gid, g in sorted(groups.items()):
        borough = DISTRICTS[g["district"]]["borough"]
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

    # ---- rows
    raw = {}
    for s in SOURCES:
        rows = load_or_fetch(s.key, args.offline, lambda s=s: net.fetch_all(
            s.domain, s.id, select=s.fields, where=s.where, order=s.order,
            page_size=s.page_size))
        check_rows(s.key, rows, REQUIRED_IN_ROWS[s.key])
        raw[s.key] = rows
        log("fetched", source=s.key, rows=len(rows))

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

    con.execute("CREATE TABLE addrs (id VARCHAR, lon DOUBLE, lat DOUBLE)")
    con.executemany("INSERT INTO addrs VALUES (?, ?, ?)",
                    [[a["id"], a["lon"], a["lat"]] for a in addrs.values() if a["lon"] is not None])
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

    # ---- events
    events = [normalize_event(r) for r in raw["street_events"]]

    # ---- outputs
    def slim(r):
        keep = ("source", "rid", "name", "legal_name", "dba", "street", "street2", "city", "zip",
                "type", "cls", "status", "date", "date_label", "issued", "operational", "aid",
                "lon", "lat", "geocoded")
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
        write_json(OUT / slug / "list.json", lists)
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

    write_json(OUT / "districts.geojson", {"type": "FeatureCollection", "features": [
        {"type": "Feature", "geometry": f["geometry"],
         "properties": {"boro_cd": int(f["properties"]["boro_cd"]),
                        "slug": by_cd[int(f["properties"]["boro_cd"])]}}
        for f in dgeo["features"]]})

    index = []
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
        write_json(OUT / "address" / f"{a['id']}.json", out)
        index.append({"id": a["id"], "bin": a["bin"], "street": a["street"], "zip": a["zip"],
                      "district": a["district"], "n": len(a["records"]),
                      "n311": len(c_at.get(a["id"], []))})
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
            "start": COMPLAINTS_311_START, "through": c_through,
            "location_types": list(COMPLAINTS_311_LOCATION_TYPES),
            "fetched": len(c311), "no_point": c_nopoint, "outside_both_districts": c_outside,
            "board_vs_pip_agreement": f"{c_agree}/{c_with_district}",
            "matched_to_address_page": c_matched,
            "within_25m_of_an_address_page": len(c_within_compare),
            "address_match": "normalized incident_address + ZIP equals the address page key",
        },
        "addresses": len(index),
        "address_geocode": {**addr_geo_stats, "endpoint": GEOSEARCH,
                            "rule": "same house number, street and borough; confidence >= "
                                    f"{GEOSEARCH_MIN_CONFIDENCE}; accuracy point; placeholder "
                                    "BINs (x000000) not used as keys",
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
    print(f"311 matched to an address page by address key: {c_matched}; "
          f"within {C311_COMPARE_M} m of an address page point: {len(c_within_compare)}")
    log("done", addresses=len(index))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
