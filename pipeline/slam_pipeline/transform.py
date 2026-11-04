"""Pure functions: field checks, address normalization, record normalization.

No network here, so everything is unit-testable against recorded fixtures.
"""

from __future__ import annotations

import hashlib
import re

from .sources import Source

# ---------------------------------------------------------------- checks


class SchemaError(RuntimeError):
    pass


def check_columns(source_key: str, expected: list[str], view_meta: dict) -> None:
    """Fail loudly if any field we depend on is missing from the portal's
    published column list (`/api/views/<id>.json` -> columns[].fieldName)."""
    have = {c["fieldName"] for c in view_meta.get("columns", [])}
    missing = [f for f in expected if f not in have]
    if missing:
        raise SchemaError(f"{source_key} ({view_meta.get('id')}): expected fields missing from "
                          f"the published schema: {missing}")


def check_rows(source_key: str, rows: list[dict], required: list[str]) -> None:
    """Fail loudly if required fields never appear in the returned rows.
    (Socrata omits null fields from each JSON row, so a field is checked across
    all rows, not per row.)"""
    if not rows:
        return
    seen: set[str] = set()
    for r in rows:
        seen.update(r.keys())
    missing = [f for f in required if f not in seen]
    if missing:
        raise SchemaError(f"{source_key}: required fields absent from every returned row: "
                          f"{missing}")


# ---------------------------------------------------------------- addresses

_SUFFIX = {
    "STREET": "ST", "STR": "ST", "AVENUE": "AVE", "AV": "AVE", "BOULEVARD": "BLVD",
    "PLACE": "PL", "ROAD": "RD", "DRIVE": "DR", "LANE": "LN", "PLAZA": "PLZ",
    "PARKWAY": "PKWY", "SQUARE": "SQ", "TERRACE": "TER", "COURT": "CT", "SLIP": "SLIP",
    "BROADWAY": "BROADWAY", "HIGHWAY": "HWY", "EXPRESSWAY": "EXPY",
}
_DIR = {"NORTH": "N", "SOUTH": "S", "EAST": "E", "WEST": "W"}
_ORD = re.compile(r"\b(\d+)(ST|ND|RD|TH)\b")
# Unit designators: everything from one of these on is a unit, not a building.
_UNIT = re.compile(r"\s(STE|SUITE|FL|FLR|FLOOR|UNIT|APT|SPACE|STORE|RM|ROOM|BSMT|BASEMENT|"
                   r"PH|LOBBY|CONCOURSE|KIOSK|STALL)\b.*$")
_NULLISH = {"N/A", "NA", "NONE", "NULL", "-"}


def normalize_address(street: str | None) -> str:
    """Uppercase, strip punctuation, unify suffixes/directions, drop ordinal
    suffixes ('3RD' -> '3'). Deliberately simple: a grouping key, not a geocoder."""
    if not street:
        return ""
    s = street.upper()
    s = re.sub(r"[.,#]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    s = _UNIT.sub("", " " + s).strip()
    s = _ORD.sub(r"\1", s)
    out = []
    for tok in s.split(" "):
        tok = _DIR.get(tok, tok)
        tok = _SUFFIX.get(tok, tok)
        out.append(tok)
    return " ".join(out)


def building_street(street: str | None) -> str:
    """Display form of a street with any unit designator removed, original case kept:
    '185 Greenwich St Ste LL5155' -> '185 Greenwich St'."""
    if not street:
        return ""
    s = re.sub(r"\s+", " ", street).strip()
    m = _UNIT.search(" " + s.upper())
    return s[: m.start()].strip(" ,") if m and m.start() > 0 else s


def strip_name_prefix(addr: str | None) -> str:
    """gttd-5u6y physical_address sometimes starts with the store name
    ('THE EMERALD DISPENSARY 85 SUYDAM ST'). If the value starts with a letter,
    keep from the first house-number token. Known miss: a store name that itself
    starts with a digit ('7 LEAF CLOVER 132 METROPOLITAN AVE') is left as is,
    because '1 W 125 ST' shows that "the last number" is not a safe rule."""
    if not addr:
        return ""
    a = addr.strip()
    if not a[:1].isalpha():
        return a
    m = re.search(r"(?:^|\s)(\d+(?:-\d+)?[A-Z]?\s+[A-Z])", a.upper())
    return a[m.start(1):].strip() if m else a


def zip5(z: str | None) -> str:
    if not z:
        return ""
    m = re.match(r"\s*(\d{5})", str(z))
    return m.group(1) if m else ""


def address_key(street: str | None, zipcode: str | None) -> str:
    n = normalize_address(street)
    return f"{n}|{zip5(zipcode)}" if n else ""


def address_id(key: str) -> str:
    return hashlib.sha1(key.encode()).hexdigest()[:10]


# ---------------------------------------------------------------- records


def _point(row: dict, src: Source) -> tuple[float | None, float | None]:
    if src.has_point:
        g = row.get(src.has_point)
        if isinstance(g, dict) and g.get("type") == "Point":
            lon, lat = g["coordinates"][:2]  # GeoJSON order is [lon, lat] (RFC 7946 §3.1.1)
            return float(lon), float(lat)
        return None, None
    if src.lat_lon:
        la, lo = row.get(src.lat_lon[0]), row.get(src.lat_lon[1])
        if la and lo:
            return float(lo), float(la)
    return None, None


def _d(v: str | None) -> str:
    """Socrata calendar_date '2026-06-05T13:11:00.000' -> '2026-06-05'."""
    return v[:10] if v else ""


def _clean(v) -> str:
    if v in (None, ""):
        return ""
    s = re.sub(r"\s+", " ", str(v)).strip()
    return "" if s.upper() in _NULLISH else s


def normalize_record(src: Source, row: dict) -> dict:
    """Map a raw row into the common record shape used by the site."""
    lon, lat = _point(row, src)
    k = src.key
    if k == "liquor_pending":
        rec = dict(rid=row.get("application_id"), legal_name=row.get("legalname"),
                   dba=row.get("dba"), street=row.get("actual_address_of_premises"),
                   street2=row.get("additional_address_information"), city=row.get("city"),
                   zip=row.get("zip_code"), type=row.get("description"),
                   cls=f"{row.get('type', '')}/{row.get('class', '')}",
                   status=row.get("status") or "Pending", date=_d(row.get("received_date")),
                   date_label="Received")
    elif k in ("liquor_active", "liquor_inactive"):
        a = k == "liquor_active"
        rec = dict(rid=row.get("licensepermitid" if a else "license_permit_id"),
                   legal_name=row.get("legalname"), dba=row.get("dba"),
                   street=row.get("actualaddressofpremises" if a else "actual_address_of_premises"),
                   street2=row.get("additionaladdressinformation" if a
                                   else "additional_address_information"),
                   city=row.get("city"), zip=row.get("zipcode" if a else "zip_code"),
                   type=row.get("description"),
                   cls=f"{row.get('type', '')}/{row.get('class', '')}",
                   status="Active" if a else "Inactive",
                   date=_d(row.get("expirationdate" if a else "expiration_date")),
                   date_label="Expires" if a else "Expiration date",
                   issued=_d(row.get("originalissuedate" if a else "original_issue_date")))
    elif k == "cannabis_retail":
        rec = dict(rid=row.get("ocm_license_number") or row.get("external_tpid"),
                   legal_name=row.get("legal_name"), dba=row.get("dba_name"),
                   street=strip_name_prefix(row.get("physical_address")), street2="",
                   city=row.get("physical_city"),
                   zip=row.get("physical_zip"), type="Registered adult-use retail dealer",
                   cls="", status="Registered", date="", date_label="")
    elif k == "cannabis_license":
        rec = dict(rid=row.get("license_number") or row.get("application_number"),
                   license_number=row.get("license_number"), legal_name=row.get("entity_name"),
                   dba=row.get("dba"), street=row.get("address_line_1"),
                   street2=row.get("address_line_2"), city=row.get("city"),
                   zip=row.get("zip_code"), type=row.get("license_type"), cls="",
                   status=row.get("license_status"), date=_d(row.get("issued_date")),
                   date_label="Issued", operational=row.get("operational_status"))
    elif k == "dining_out":
        rec = dict(rid=f"{row.get('bbl', '')}-{normalize_address(row.get('street'))}-"
                       f"{row.get('license_type', '')}",
                   legal_name=row.get("business_legal_name"), dba=row.get("assumed_name_s"),
                   street=row.get("street"), street2="", city=row.get("city"),
                   zip=row.get("postcode"), type=row.get("license_type"), cls="",
                   status=row.get("license_status"),
                   date=_d(row.get("license_expiration_date")), date_label="Expires",
                   bbl=row.get("bbl"))
    else:
        raise ValueError(f"no normalizer for {k}")
    rec = {kk: _clean(v) for kk, v in rec.items()}
    rec["source"] = k
    rec["name"] = rec.get("dba") or rec.get("legal_name") or "(no name)"
    rec["lon"], rec["lat"] = lon, lat
    rec["akey"] = address_key(rec.get("street"), rec.get("zip"))
    rec["aid"] = address_id(rec["akey"]) if rec["akey"] else ""
    return rec


# ---------------------------------------------------------------- events


def parse_boards(cb: str | None) -> list[int]:
    """'04, 05,' -> [4, 5]. Non-numeric tokens are ignored."""
    out = []
    for tok in (cb or "").split(","):
        tok = tok.strip()
        if tok.isdigit():
            out.append(int(tok))
    return out


SPORT_TYPES = {"Sport - Youth", "Sport - Adult"}


def normalize_event(row: dict) -> dict:
    return {
        "rid": _clean(row.get("event_id")),
        "name": _clean(row.get("event_name")),
        "start": _clean(row.get("start_date_time"))[:16].replace("T", " "),
        "end": _clean(row.get("end_date_time"))[:16].replace("T", " "),
        "agency": _clean(row.get("event_agency")),
        "type": _clean(row.get("event_type")),
        "location": _clean(row.get("event_location")),
        "street_side": _clean(row.get("event_street_side")),
        "closure": _clean(row.get("street_closure_type")),
        "boards": parse_boards(row.get("community_board")),
        "borough": _clean(row.get("event_borough")),
        "sport": _clean(row.get("event_type")) in SPORT_TYPES,
    }


def events_for_district(events: list[dict], borough: str, cb: int) -> list[dict]:
    return [e for e in events if e["borough"] == borough and cb in e["boards"]]


# ---------------------------------------------------------------- geocoding


def accept_geosearch(resp: dict, house_number: str | None) -> tuple[float, float] | None:
    """Accept a GeoSearch v2 (Pelias) top hit only if it is a point-accuracy
    match with confidence >= 0.8 whose housenumber equals the one we asked for.
    Field names (`confidence`, `accuracy`, `housenumber`) are from a recorded real
    response (tests/fixtures/geosearch_132_metropolitan.json)."""
    feats = resp.get("features") or []
    if not feats:
        return None
    p = feats[0].get("properties", {})
    if p.get("confidence", 0) < 0.8 or p.get("accuracy") != "point":
        return None
    if house_number and str(p.get("housenumber", "")).upper() != house_number.upper():
        return None
    lon, lat = feats[0]["geometry"]["coordinates"][:2]
    return float(lon), float(lat)


def house_number(street: str | None) -> str | None:
    m = re.match(r"\s*(\d+(?:-\d+)?[A-Z]?)\b", (street or "").upper())
    return m.group(1) if m else None


# ---------------------------------------------------------------- 311 complaints


def board_311_slug(board: str | None, districts: dict) -> str | None:
    """311's community_board text ('01 MANHATTAN', '04 BROOKLYN') -> our district slug,
    or None for anything else ('0 Unspecified', other boards)."""
    m = re.match(r"\s*(\d+)\s+(.+?)\s*$", board or "")
    if not m:
        return None
    for slug, d in districts.items():
        if int(m.group(1)) == d["cb"] and m.group(2).upper() == d["borough"].upper():
            return slug
    return None


def normalize_311(row: dict) -> dict:
    """Map an erm2-nwe9 row to the small shape the site shows. `aid` uses the same
    address key as every other layer, so a complaint is "at" an address page exactly
    when its normalized incident_address + ZIP equals that page's key."""
    la, lo = row.get("latitude"), row.get("longitude")
    street = _clean(row.get("incident_address"))
    z = zip5(row.get("incident_zip"))
    key = address_key(street, z)
    created = _clean(row.get("created_date"))
    return {
        "rid": _clean(row.get("unique_key")),
        "ts": created[:19],  # sort key only; not output
        "date": created[:10],
        "year": int(created[:4]) if created[:4].isdigit() else None,
        "type": _clean(row.get("complaint_type")),
        "descriptor": _clean(row.get("descriptor")),
        "street": street,
        "zip": z,
        "agency": _clean(row.get("agency")),
        "status": _clean(row.get("status")),
        "board": _clean(row.get("community_board")),  # agreement check only; not output
        "lon": float(lo) if lo else None,
        "lat": float(la) if la else None,
        "aid": address_id(key) if key else "",
    }


def count_by_type_year(recs: list[dict], years: list[int]) -> list[dict]:
    """[{type, by_year: {"2024": n, ...}, total}] sorted by total, then type.
    Years outside `years` are not counted."""
    table: dict[str, dict[int, int]] = {}
    for r in recs:
        if r.get("year") in years:
            table.setdefault(r["type"] or "(no type)", {}).setdefault(r["year"], 0)
            table[r["type"] or "(no type)"][r["year"]] += 1
    rows = [{"type": t, "by_year": {str(y): c.get(y, 0) for y in years},
             "total": sum(c.values())} for t, c in table.items()]
    return sorted(rows, key=lambda x: (-x["total"], x["type"]))


def count_by_type(recs: list[dict]) -> list[dict]:
    c: dict[str, int] = {}
    for r in recs:
        c[r["type"] or "(no type)"] = c.get(r["type"] or "(no type)", 0) + 1
    return [{"type": t, "n": n} for t, n in sorted(c.items(), key=lambda x: (-x[1], x[0]))]


C311_KEEP = ("rid", "date", "type", "descriptor", "street", "zip", "agency", "status")


def slim_311(r: dict) -> dict:
    """Only the displayed fields."""
    return {k: r[k] for k in C311_KEEP if r.get(k)}


def recent_311(recs: list[dict], n: int) -> list[dict]:
    """Most recent first (created timestamp, then unique_key as a tiebreak), slimmed."""
    return [slim_311(r) for r in sorted(recs, key=lambda r: (r["ts"], r["rid"]), reverse=True)[:n]]


# ---------------------------------------------------------------- address pages keyed on BIN (#59)
#
# Each address page is geocoded once with GeoSearch v2 /v2/search and, when the hit is
# good, keyed on the building's BIN (PAD `addendum.pad.bin`). Field names come from
# recorded real responses in tests/fixtures/geosearch_search_*.json and from
# https://github.com/NYCPlanning/labs-geosearch-docs (src/pages/docs.js: `text`, `size`,
# `label`, `confidence`, GeoJSON [lon, lat]).

GEOSEARCH_MIN_CONFIDENCE = 0.8
GEOSEARCH_SIZE = 3  # look past the top hit: the right building is not always first


def address_query(street: str | None, borough: str) -> str:
    """GeoSearch text for an address page. Deliberately WITHOUT the ZIP: a wrong ZIP
    pulls GeoSearch to another building ('44 WILSON AVE, Brooklyn, NY 11207' returns
    514 Wilson Ave first; tests/fixtures/geosearch_search_44_wilson_11207.json)."""
    s = building_street(street)
    return f"{s}, {borough}, NY" if s else ""


def real_bin(b) -> str | None:
    """A BIN usable as a key: 7 digits, borough code 1-5, and not a 'million BIN'
    (x000000), the placeholder PAD uses when a lot has no specific building
    (tests/fixtures/geosearch_search_million_bin.json: Brooklyn Bridge Park -> 3000000)."""
    s = str(b or "").strip()
    if not re.fullmatch(r"[1-5]\d{6}", s) or s[1:] == "000000":
        return None
    return s


def _street_part(street: str | None) -> str:
    n = normalize_address(street)
    return re.sub(r"^\d+(?:-\d+)?[A-Z]?\s+", "", n)


def slim_geosearch(resp: dict) -> dict:
    """What pick_address_hit reads, so the on-disk cache stays small."""
    keep = ("label", "confidence", "accuracy", "match_type", "housenumber", "street",
            "borough", "postalcode")
    out = []
    for f in (resp.get("features") or [])[:GEOSEARCH_SIZE]:
        p = f.get("properties", {})
        pad = (p.get("addendum") or {}).get("pad") or {}
        out.append({"geometry": f.get("geometry"),
                    "properties": {**{k: p.get(k) for k in keep},
                                   "addendum": {"pad": {"bin": pad.get("bin"), "bbl": pad.get("bbl")}}}})
    return {"features": out}


def pick_address_hit(resp: dict | None, street: str | None, borough: str) -> dict:
    """Judge a /v2/search response for one address page.

    status:
      matched        a hit with the same house number, street and borough, confidence
                     >= 0.8 and accuracy 'point'
      low_confidence GeoSearch answered, but no hit passes that rule (the top hit is
                     recorded for the manifest, but not used)
      unmatched      no features at all (or no query could be built)
    bin is set only for a matched hit with a real (non-placeholder) BIN."""
    feats = (resp or {}).get("features") or []
    if not feats:
        return {"status": "unmatched", "bin": None, "label": None, "confidence": None}
    hn = (house_number(street) or "").upper()
    sp = _street_part(street)
    for f in feats:
        p = f.get("properties", {})
        if (hn and str(p.get("housenumber", "")).upper() == hn
                and _street_part(f"0 {p.get('street', '')}") == sp
                and str(p.get("borough", "")).lower() == borough.lower()):
            ok = (p.get("confidence") or 0) >= GEOSEARCH_MIN_CONFIDENCE and p.get("accuracy") == "point"
            if not ok:
                break
            lon, lat = f["geometry"]["coordinates"][:2]
            pad = (p.get("addendum") or {}).get("pad") or {}
            return {"status": "matched", "bin": real_bin(pad.get("bin")), "label": p.get("label"),
                    "confidence": p.get("confidence"), "zip": p.get("postalcode"),
                    "lon": float(lon), "lat": float(lat)}
    p = feats[0].get("properties", {})
    return {"status": "low_confidence", "bin": None, "label": p.get("label"),
            "confidence": p.get("confidence")}


def group_addresses(records: list[dict]) -> dict[str, dict]:
    """Group records by their address key id (`aid`). One group per normalized street + ZIP."""
    groups: dict[str, dict] = {}
    for r in records:
        if not r.get("aid"):
            continue
        g = groups.setdefault(r["aid"], {"id": r["aid"], "street": building_street(r["street"]),
                                         "city": r["city"], "zip": (r["zip"] or "")[:5],
                                         "district": r["district"], "records": [], "_pts": []})
        g["records"].append(r)
        if r.get("lon") is not None:
            g["_pts"].append((r["lon"], r["lat"]))
    for g in groups.values():
        pts = g.pop("_pts")
        g["lon"] = sum(p[0] for p in pts) / len(pts) if pts else None
        g["lat"] = sum(p[1] for p in pts) / len(pts) if pts else None
    return groups


def key_pages(groups: dict[str, dict], geo: dict[str, dict]) -> tuple[dict[str, dict], dict[str, str]]:
    """Merge address groups into address pages.

    A group whose geocode is `matched` with a real BIN goes to the page whose id is that
    BIN; every other group keeps its old id (sha1 of street|ZIP, 10 hex characters, so it
    can never collide with a 7-digit BIN). Returns (pages by id, old group id -> page id).
    This is what puts 44 Wilson Ave 11207 and 11237 on one page."""
    by_page: dict[str, list[dict]] = {}
    remap: dict[str, str] = {}
    for gid, g in groups.items():
        hit = geo.get(gid) or {"status": "unmatched", "bin": None}
        pid = hit["bin"] or gid
        remap[gid] = pid
        by_page.setdefault(pid, []).append(g)
    pages: dict[str, dict] = {}
    for pid, gs in by_page.items():
        gs = sorted(gs, key=lambda g: (-len(g["records"]), g["street"], g["zip"]))
        main = gs[0]
        hit = geo.get(main["id"]) or {"status": "unmatched", "bin": None}
        recs = [r for g in gs for r in g["records"]]
        pts = [(g["lon"], g["lat"], len(g["records"])) for g in gs if g["lon"] is not None]
        w = sum(p[2] for p in pts)
        page = {"id": pid, "bin": hit["bin"], "street": main["street"], "city": main["city"],
                "zip": (hit.get("zip") if hit["bin"] else None) or main["zip"],
                "district": main["district"], "records": recs,
                "lon": sum(p[0] * p[2] for p in pts) / w if pts else None,
                "lat": sum(p[1] * p[2] for p in pts) / w if pts else None,
                "geocode": {k: hit.get(k) for k in ("status", "label", "confidence")},
                "keys": [g["id"] for g in gs],
                # Every street + ZIP the sources used for this page (more than one = merged).
                "listed_as": sorted({f"{g['street']} {g['zip']}".strip() for g in gs})}
        for r in recs:
            r["aid"] = pid
        pages[pid] = page
    return pages, remap


# ---------------------------------------------------------------- restaurant inspections (#61)
#
# DOHMH 43nn-pn8j. Field meanings are from the dataset's own column descriptions
# (https://data.cityofnewyork.us/api/views/43nn-pn8j.json, recorded in
# tests/fixtures/views_43nn-pn8j.json):
#   - one row per violation; inspection-level values repeat on each violation row
#   - "Inspection dates of 1/1/1900 mean an establishment has not yet had an inspection"
#   - grade: N = Not Yet Graded, A/B/C, Z = Grade Pending, P = Grade Pending issued on
#     re-opening following an initial inspection that resulted in a closure

NOT_INSPECTED_DATE = "1900-01-01"
GRADED = ("A", "B", "C", "Z", "P")  # N (not yet graded) and blank are not grades
GRADE_LABEL = {"A": "A", "B": "B", "C": "C", "Z": "Grade pending",
               "P": "Grade pending (re-opening)", "N": "Not yet graded"}
# District-tab buckets for a restaurant's current state, in display order.
GRADE_BUCKETS = ("A", "B", "C", "Grade pending", "Not yet graded", "Not yet inspected")


def _num(v) -> float | None:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f or None  # 0 means "no coordinate" in this dataset


def reduce_inspections(rows: list[dict]) -> dict[str, dict]:
    """One restaurant per camis, one inspection per (inspection_date, inspection_type).

    Each restaurant: camis, dba, street, zip, boro, board, bin, bbl, lon, lat,
    inspections (newest first: date, type, action, score, grade, grade_date, violations),
    history (graded inspections only, newest first), latest (history[0] or None),
    not_inspected (only the 1900-01-01 placeholder row), last_inspected."""
    out: dict[str, dict] = {}
    insp: dict[str, dict[tuple, dict]] = {}
    for r in rows:
        camis = _clean(r.get("camis"))
        if not camis:
            continue
        rest = out.get(camis)
        if rest is None:
            street = " ".join(x for x in (_clean(r.get("building")), _clean(r.get("street"))) if x)
            rest = out[camis] = {
                "camis": camis, "dba": _clean(r.get("dba")) or "(no name)", "street": street,
                "zip": zip5(r.get("zipcode")), "boro": _clean(r.get("boro")),
                "board": _clean(r.get("community_board")), "bin": real_bin(r.get("bin")),
                "bbl": _clean(r.get("bbl")), "lon": _num(r.get("longitude")),
                "lat": _num(r.get("latitude"))}
        d = _d(r.get("inspection_date"))
        if not d or d == NOT_INSPECTED_DATE:
            continue
        key = (d, _clean(r.get("inspection_type")))
        i = insp.setdefault(camis, {}).setdefault(key, {
            "date": d, "type": key[1], "action": _clean(r.get("action")),
            "score": _clean(r.get("score")), "grade": "", "grade_date": "", "violations": 0})
        if r.get("violation_code"):
            i["violations"] += 1
        g = _clean(r.get("grade")).upper()
        if g and not i["grade"]:
            i["grade"], i["grade_date"] = g, _d(r.get("grade_date"))
    for camis, rest in out.items():
        lst = sorted(insp.get(camis, {}).values(), key=lambda i: (i["date"], i["type"]), reverse=True)
        rest["inspections"] = lst
        rest["history"] = [{k: i[k] for k in ("date", "grade", "grade_date", "score", "type")}
                           for i in lst if i["grade"] in GRADED]
        rest["latest"] = rest["history"][0] if rest["history"] else None
        rest["not_inspected"] = not lst
        rest["last_inspected"] = lst[0]["date"] if lst else ""
    return out


def grade_bucket(rest: dict) -> str:
    """The restaurant's current state for the district tab (one of GRADE_BUCKETS)."""
    if rest["not_inspected"]:
        return "Not yet inspected"
    g = (rest["latest"] or {}).get("grade", "")
    if g in ("A", "B", "C"):
        return g
    if g in ("Z", "P"):
        return "Grade pending"
    return "Not yet graded"


def meters(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    """Great-circle distance (haversine, mean Earth radius 6,371,008.8 m)."""
    import math
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = (math.sin((p2 - p1) / 2) ** 2
         + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2)
    return 2 * 6371008.8 * math.asin(math.sqrt(a))


def place_restaurant(rest: dict, bins: dict[str, str], points: list[tuple[str, float, float, bool]],
                     radius_m: float) -> dict:
    """Join a restaurant to an address page.

    1. by BIN: the restaurant's (real) BIN is a page's BIN.
    2. by point: otherwise, the nearest page within radius_m, but only a page that has
       no BIN of its own, or any page when the restaurant has no BIN. A restaurant whose
       BIN differs from a BIN page's is in another building, so it is never put there.
    `points` = [(page id, lon, lat, page has a BIN)].
    Returns {"aid", "method": "bin" | "point" | None, "m"}."""
    if rest.get("bin") and rest["bin"] in bins:
        return {"aid": bins[rest["bin"]], "method": "bin", "m": None}
    if rest.get("lon") is None:
        return {"aid": None, "method": None, "m": None}
    best = None
    for pid, lon, lat, has_bin in points:
        if has_bin and rest.get("bin"):
            continue
        if abs(lat - rest["lat"]) > 0.001 or abs(lon - rest["lon"]) > 0.0015:  # cheap prefilter
            continue
        m = meters(rest["lon"], rest["lat"], lon, lat)
        if m <= radius_m and (best is None or m < best[1]):
            best = (pid, m)
    if best:
        return {"aid": best[0], "method": "point", "m": round(best[1])}
    return {"aid": None, "method": None, "m": None}


# ---------------------------------------------------------------- certificates of occupancy (#62)

_CO_TS = re.compile(r"^\s*(\d{1,2})/(\d{1,2})/(\d{2,4})\b")


def co_issued_date(v: str | None) -> str:
    """pkdm-hqz6 c_of_o_issuance_date is text like '02/15/22 11:08:46 AM' (every value in
    the 2026-11-04 pull for both districts had this MM/DD/YY shape) -> '2022-02-15'."""
    m = _CO_TS.match(v or "")
    if not m:
        return ""
    mo, dd, yy = (int(x) for x in m.groups())
    if yy < 100:
        yy += 2000
    return f"{yy:04d}-{mo:02d}-{dd:02d}"


def normalize_co(row: dict) -> dict:
    return {"bin": real_bin(row.get("bin")), "number": _clean(row.get("c_of_o_number")),
            "application": _clean(row.get("application_number")),
            "job": _clean(row.get("job_filing_name")), "job_type": _clean(row.get("job_type")),
            "status": _clean(row.get("c_of_o_status")),
            "filing_type": _clean(row.get("c_of_o_filing_type")),
            "issued": co_issued_date(row.get("c_of_o_issuance_date"))}


def page_co_bin(page_bin: str | None, restaurant_bins: list[str]) -> tuple[str | None, str | None]:
    """The BIN the CO link uses: the page's own (GeoSearch/PAD) BIN, else DOHMH's `bin`
    when every restaurant placed on the page agrees on one. Returns (bin, source)."""
    if page_bin:
        return page_bin, "geosearch"
    uniq = sorted({b for b in restaurant_bins if b})
    if len(uniq) == 1:
        return uniq[0], "dohmh"
    return None, None
