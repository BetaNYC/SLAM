"""Straight-line distances in feet with DuckDB spatial (#60).

Points are WGS 84 longitude/latitude. They are projected to NAD83 / New York Long Island
(EPSG:2263, US survey feet), the State Plane zone DCP publishes FacDB's and PLUTO's own
xcoord/ycoord in, and measured there with planar ST_Distance.

Axis order is set explicitly twice: the connection runs `SET geometry_always_xy = true`
(DuckDB 2.0 refuses to guess) and every ST_Transform passes `always_xy := true`, so input
is read as (longitude, latitude). `check_axis_order` compares our projection against the
source's own State Plane coordinates and fails the build if they disagree.
DuckDB spatial docs: https://duckdb.org/docs/stable/core_extensions/spatial/functions
"""

from __future__ import annotations

import json
import statistics

import duckdb

STATE_PLANE = "EPSG:2263"  # NAD83 / New York Long Island (ftUS)
WGS84 = "EPSG:4326"
AXIS_TOLERANCE_FT = 5.0


class AxisOrderError(RuntimeError):
    pass


def connect() -> duckdb.DuckDBPyConnection:
    con = duckdb.connect()
    con.execute("INSTALL spatial; LOAD spatial;")
    con.execute("SET geometry_always_xy = true;")
    return con


def project(con, lonlat: list[tuple[float, float]], always_xy: bool = True) -> list[tuple[float, float]]:
    """[(lon, lat)] -> [(x ft, y ft)] in EPSG:2263. `always_xy` is a parameter only so the
    guard test can show what the wrong axis order produces."""
    if not lonlat:
        return []
    con.execute("CREATE OR REPLACE TEMP TABLE _p (i INT, lon DOUBLE, lat DOUBLE)")
    con.executemany("INSERT INTO _p VALUES (?, ?, ?)", [[i, lo, la] for i, (lo, la) in enumerate(lonlat)])
    rows = con.execute(f"""
        SELECT ST_X(g), ST_Y(g) FROM (
          SELECT i, ST_Transform(ST_Point(lon, lat), '{WGS84}', '{STATE_PLANE}', always_xy := ?) AS g
            FROM _p) ORDER BY i
    """, [always_xy]).fetchall()
    return [(x, y) for x, y in rows]


def check_axis_order(con, samples: list[tuple[float, float, float, float]], label: str) -> float:
    """samples = [(lon, lat, source x ft, source y ft)]. Fails loudly when the median gap
    between our projection and the source's own State Plane point is over 5 ft (a swapped
    axis order is off by millions of feet). Returns the median gap in feet."""
    samples = [s for s in samples if None not in s]
    if not samples:
        raise AxisOrderError(f"{label}: no rows with both lat/lon and State Plane x/y to check")
    ours = project(con, [(s[0], s[1]) for s in samples])
    gaps = [((x - s[2]) ** 2 + (y - s[3]) ** 2) ** 0.5 for (x, y), s in zip(ours, samples, strict=True)]
    med = statistics.median(gaps)
    if med > AXIS_TOLERANCE_FT:
        raise AxisOrderError(f"{label}: projected points are a median {med:,.0f} ft from the "
                             f"source's own State Plane x/y (limit {AXIS_TOLERANCE_FT} ft); "
                             "check the axis order")
    return med


def pairs_within(con, a: list[tuple[str, float, float]], b: list[tuple[str, float, float]],
                 feet: float) -> list[tuple[str, str, float]]:
    """Every (a id, b id, feet) with a straight-line distance <= feet. Inputs are
    [(id, lon, lat)]; both sides are projected to EPSG:2263 first."""
    if not a or not b:
        return []
    for name, pts in (("_a", a), ("_b", b)):
        xy = project(con, [(lo, la) for _, lo, la in pts])
        con.execute(f"CREATE OR REPLACE TEMP TABLE {name} (id VARCHAR, x DOUBLE, y DOUBLE)")
        con.executemany(f"INSERT INTO {name} VALUES (?, ?, ?)",
                        [[p[0], x, y] for p, (x, y) in zip(pts, xy, strict=True)])
    return [(i, j, d) for i, j, d in con.execute(f"""
        SELECT _a.id, _b.id, ST_Distance(ST_Point(_a.x, _a.y), ST_Point(_b.x, _b.y)) AS ft
          FROM _a JOIN _b ON abs(_a.x - _b.x) <= {feet} AND abs(_a.y - _b.y) <= {feet}
         WHERE ST_Distance(ST_Point(_a.x, _a.y), ST_Point(_b.x, _b.y)) <= {feet}
         ORDER BY _a.id, ft, _b.id
    """).fetchall()]


def load_districts(con, features: list[dict], slug_of) -> None:
    """Make the `districts_all` table (slug, boro_cd, geom in WGS 84, as the dataset publishes
    it) and `districts_sp` (the same outlines in EPSG:2263 feet, with their bounding boxes for a
    cheap prefilter). `features` are GeoJSON features of NYC 5crt-au7u; `slug_of(boro_cd)`
    names each one (districts.slug)."""
    con.execute("CREATE OR REPLACE TABLE districts_all (slug VARCHAR, boro_cd INT, geom GEOMETRY)")
    for f in features:
        cd = int(f["properties"]["boro_cd"])
        con.execute("INSERT INTO districts_all VALUES (?, ?, ST_GeomFromGeoJSON(?))",
                    [slug_of(cd), cd, json.dumps(f["geometry"])])
    con.execute(f"""
        CREATE OR REPLACE TABLE districts_sp AS
        SELECT slug, g AS geom, ST_XMin(g) AS x0, ST_YMin(g) AS y0, ST_XMax(g) AS x1, ST_YMax(g) AS y1
          FROM (SELECT slug, ST_Transform(geom, '{WGS84}', '{STATE_PLANE}', always_xy := true) AS g
                  FROM districts_all)
    """)


def districts_near(con, pts: list[tuple[str, float, float]], feet: float) -> dict[str, list[tuple[str, float]]]:
    """For each (id, lon, lat): every district whose outline is within `feet` of the point,
    as [(slug, feet from the line)], nearest first. A district the point is inside is 0 ft.
    Needs `districts_sp` (load_districts). Points with no district within `feet` are left out."""
    if not pts:
        return {}
    xy = project(con, [(lo, la) for _, lo, la in pts])
    con.execute("CREATE OR REPLACE TEMP TABLE _dn (id VARCHAR, x DOUBLE, y DOUBLE)")
    con.executemany("INSERT INTO _dn VALUES (?, ?, ?)",
                    [[p[0], x, y] for p, (x, y) in zip(pts, xy, strict=True)])
    out: dict[str, list[tuple[str, float]]] = {}
    for pid, slug, ft in con.execute(f"""
        SELECT p.id, d.slug, ST_Distance(d.geom, ST_Point(p.x, p.y)) AS ft
          FROM _dn p JOIN districts_sp d
            ON p.x BETWEEN d.x0 - {feet} AND d.x1 + {feet}
           AND p.y BETWEEN d.y0 - {feet} AND d.y1 + {feet}
         WHERE ST_DWithin(d.geom, ST_Point(p.x, p.y), {feet})
         ORDER BY p.id, ft, d.slug
    """).fetchall():
        out.setdefault(pid, []).append((slug, ft))
    return out
