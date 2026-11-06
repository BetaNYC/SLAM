"""The search box's lookup files, split so a search loads only what it needs (#85).

Before #85 one file, ``bin-index.json``, held every BIN and every page point (57 KB for two
districts; several MB citywide). Now, under ``site/static/data/lookup/``:

- ``bins-<b>.json``: ``{"bins": {BIN: page id}}`` for one borough. A BIN's first digit is its
  borough (1 Manhattan, 2 Bronx, 3 Brooklyn, 4 Queens, 5 Staten Island), so a picked suggestion with
  a BIN needs exactly one of these. All five are written, empty or not, so the browser never asks
  for a file that does not exist.
- ``points-<district>.json``: ``[[page id, lon, lat], ...]`` for one district, for the nearest-page
  fallback.
- ``index.json``: ``{"radius_m", "districts": {slug: {"bbox": [min lon, min lat, max lon, max lat],
  "n"}}}``. The bbox is of the district's own page points (some sit just outside the district line),
  so the browser loads only the points files whose bbox, padded by the radius, contains the spot.
  With district outlines (#104), each district also gets ``"area"``: the bbox of its outline.
- ``outline-<district>.json``: one district's outline as a GeoJSON Feature (coordinates rounded to
  6 decimals, about 10 cm, never simplified, so boundary-street addresses land as before). Only
  a search that finds nothing loads one, and only for the districts whose ``area`` holds the spot,
  to say which district map to open. Before #104 that search loaded every outline at once
  (``districts.geojson``), which citywide would be the biggest download of a miss.
"""
from __future__ import annotations

BOROUGHS = "12345"


def _round(c):
    """Round every coordinate in a nested GeoJSON coordinate list to 6 decimals."""
    if c and isinstance(c[0], (int, float)):
        return [round(c[0], 6), round(c[1], 6)]
    return [_round(x) for x in c]


def _flat(c):
    """Every [lon, lat] pair in a nested GeoJSON coordinate list."""
    if c and isinstance(c[0], (int, float)):
        yield c
    else:
        for x in c:
            yield from _flat(x)


def split_lookup(pages, radius_m: int, outlines: dict | None = None) -> dict[str, object]:
    """File name (relative to lookup/) -> JSON payload.

    ``pages`` is an iterable of dicts with ``id``, ``bin`` (a real BIN or falsy), ``district``,
    ``lon`` and ``lat`` (None when the page has no point). ``outlines`` maps a district slug to
    its GeoJSON geometry (Polygon or MultiPolygon).
    """
    bins: dict[str, dict[str, str]] = {b: {} for b in BOROUGHS}
    points: dict[str, list] = {}
    for p in sorted(pages, key=lambda p: p["id"]):
        b = p.get("bin")
        if b:
            if b[0] not in bins:
                raise ValueError(f"BIN {b} on page {p['id']} does not start with a borough digit")
            bins[b[0]][b] = p["id"]
        if p.get("lon") is not None:
            points.setdefault(p["district"], []).append(
                [p["id"], round(p["lon"], 6), round(p["lat"], 6)])
    out: dict[str, object] = {f"bins-{b}.json": {"bins": m} for b, m in bins.items()}
    districts = {}
    for slug, pts in sorted(points.items()):
        out[f"points-{slug}.json"] = pts
        lons = [x[1] for x in pts]
        lats = [x[2] for x in pts]
        districts[slug] = {"bbox": [min(lons), min(lats), max(lons), max(lats)], "n": len(pts)}
    for slug, geom in sorted((outlines or {}).items()):
        if geom.get("type") not in ("Polygon", "MultiPolygon"):
            raise ValueError(f"district {slug}: outline is {geom.get('type')}, not a polygon")
        g = {"type": geom["type"], "coordinates": _round(geom["coordinates"])}
        out[f"outline-{slug}.json"] = {"type": "Feature", "properties": {"slug": slug}, "geometry": g}
        xs, ys = zip(*_flat(g["coordinates"]))
        districts.setdefault(slug, {"n": 0})["area"] = [min(xs), min(ys), max(xs), max(ys)]
    out["index.json"] = {"radius_m": radius_m, "districts": districts}
    return out
