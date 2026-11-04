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
