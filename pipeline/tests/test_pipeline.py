"""Tests against REAL recorded responses in tests/fixtures/ (recorded 2026-11-04
from data.ny.gov, data.cityofnewyork.us and geosearch.planninglabs.nyc). No
invented payloads."""

from __future__ import annotations

import json
from pathlib import Path

import duckdb
import pytest

from slam_pipeline.sources import (
    COMPLAINTS_311_END, COMPLAINTS_311_START,
    DISTRICT_SOURCE,
    DISTRICTS,
    SOURCES,
    SOURCES_BY_KEY,
)
from slam_pipeline.transform import (
    C311_KEEP,
    GRADE_BUCKETS,
    SchemaError,
    accept_geosearch,
    address_id,
    address_key,
    board_311_slug,
    building_street,
    check_columns,
    check_rows,
    co_issued_date,
    count_by_type,
    count_by_type_year,
    events_for_district,
    grade_bucket,
    house_number,
    meters,
    normalize_311,
    normalize_address,
    normalize_address,
    normalize_co,
    normalize_event,
    normalize_record,
    page_co_bin,
    parse_boards,
    place_restaurant,
    real_bin,
    recent_311,
    reduce_inspections,
    strip_name_prefix,
)

FX = Path(__file__).parent / "fixtures"


def load(name):
    return json.loads((FX / name).read_text())


def load_text(name):
    return (FX / name).read_text()


# ---------------------------------------------------------------- schema check

@pytest.mark.parametrize("src", [*(s.key for s in SOURCES), "districts"])
def test_every_selected_field_exists_in_recorded_schema(src):
    if src == "districts":
        sid, fields = DISTRICT_SOURCE["id"], DISTRICT_SOURCE["fields"]
    else:
        sid, fields = SOURCES_BY_KEY[src].id, SOURCES_BY_KEY[src].fields
    check_columns(src, fields, load(f"views_{sid}.json"))


def test_check_columns_fails_loud_on_missing_field():
    meta = load("views_f8i8-k2gm.json")
    with pytest.raises(SchemaError, match="received_datee"):
        check_columns("liquor_pending", ["application_id", "received_datee"], meta)


def test_check_rows_fails_when_field_absent_everywhere():
    rows = load("sla_pending_sample.json")
    check_rows("liquor_pending", rows, ["application_id", "georeference"])
    with pytest.raises(SchemaError):
        check_rows("liquor_pending", rows, ["licensepermitid"])


def test_ocm_selection_never_includes_contact_name():
    assert "primary_contact_name" not in SOURCES_BY_KEY["cannabis_license"].fields
    for row in load("ocm_licenses_sample.json"):
        assert "primary_contact_name" not in row


# ---------------------------------------------------------------- normalize

def test_normalize_pending_row():
    row = load("sla_pending_sample.json")[1]
    r = normalize_record(SOURCES_BY_KEY["liquor_pending"], row)
    assert r["rid"] == "NA-0007-26-112858"
    assert r["name"] == "Kermit Lynch Wine Merchant Corporation"  # no dba -> legal name
    assert r["date"] == "2026-05-15" and r["date_label"] == "Received"
    assert (r["lon"], r["lat"]) == (-73.99966, 40.72464)  # GeoJSON [lon, lat]
    assert r["aid"] and r["akey"].endswith("|10012")


def test_normalize_ocm_row_without_coordinates():
    row = load("ocm_licenses_sample.json")[0]
    r = normalize_record(SOURCES_BY_KEY["cannabis_license"], row)
    assert r["rid"] == "MM0306D" and r["lon"] is None and r["name"] == "Cannabist"


def test_normalize_ocm_in_process_row_keeps_license_status():
    # A real In-Process row from jskf-tt3q (pulled 2026-11-07): an applicant with proximity
    # protection, so no license number and no issue date. The site's "not yet issued" label
    # (#110) reads `status`, which must be OCM's own `license_status`, unchanged.
    rows = load("ocm_licenses_sample.json")
    row = next(x for x in rows if x["license_status"] == "In-Process")
    r = normalize_record(SOURCES_BY_KEY["cannabis_license"], row)
    assert r["status"] == "In-Process"
    assert r["rid"] == "OCMRETL-2023-002086" and not r.get("license_number")
    assert not r["date"]
    for x in rows:
        assert normalize_record(SOURCES_BY_KEY["cannabis_license"], x)["status"] == x["license_status"]


def test_address_normalization_groups_variants():
    assert normalize_address("185 Greenwich Street.") == normalize_address("185 GREENWICH ST")
    assert normalize_address("100 North 3rd Street") == "100 N 3 ST"
    # Suites/floors collapse to the building (real addresses from the pending list).
    assert normalize_address("185 Greenwich St Ste LL1207") == "185 GREENWICH ST"
    assert normalize_address("185 Greenwich St Ste LL5155") == "185 GREENWICH ST"
    assert normalize_address("110 Greene St Fl 5 Ste 502") == "110 GREENE ST"
    assert building_street("185 Greenwich St Ste LL5155") == "185 Greenwich St"
    assert building_street("4 South Street Space 203") == "4 South Street"
    assert address_key("1193 Myrtle Avenue", "11221-1234") == address_key("1193 MYRTLE AVE",
                                                                          "11221")


def test_cannabis_retail_address_drops_store_name():
    # Real gttd-5u6y values seen 2026-11-04.
    assert strip_name_prefix("THE EMERALD DISPENSARY 85 SUYDAM ST") == "85 SUYDAM ST"
    assert strip_name_prefix("299 KNICKERBOCKER AVE") == "299 KNICKERBOCKER AVE"
    assert strip_name_prefix("1 W 125 ST") == "1 W 125 ST"  # never cut a real address


# ---------------------------------------------------------------- events

def test_parse_boards():
    assert parse_boards("06,") == [6]
    assert parse_boards("04, 05,") == [4, 5]
    assert parse_boards("") == []


def test_events_filter_by_borough_and_board():
    ev = [normalize_event(r) for r in load("events_sample.json")]
    assert all(e["borough"] == "Manhattan" for e in ev)
    assert [e["rid"] for e in events_for_district(ev, "Manhattan", 6)] == ["796129"]
    assert events_for_district(ev, "Brooklyn", 6) == []


# ---------------------------------------------------------------- geocode

def test_accept_geosearch_real_response():
    resp = load("geosearch_132_metropolitan.json")
    assert accept_geosearch(resp, "132") == (-73.962771, 40.716082)
    assert accept_geosearch(resp, "134") is None  # wrong house number is rejected
    assert accept_geosearch({"features": []}, "1") is None
    assert house_number("132 Metropolitan Ave") == "132"


# ---------------------------------------------------------------- spatial

@pytest.fixture(scope="module")
def con():
    c = duckdb.connect()
    c.execute("INSTALL spatial; LOAD spatial; SET geometry_always_xy = true;")
    c.execute("CREATE TABLE d (cd INT, geom GEOMETRY)")
    for f in load("districts_101_304.geojson")["features"]:
        c.execute("INSERT INTO d VALUES (?, ST_GeomFromGeoJSON(?))",
                  [int(f["properties"]["boro_cd"]), json.dumps(f["geometry"])])
    return c


def test_point_in_polygon_real_rows(con):
    src = SOURCES_BY_KEY["liquor_pending"]
    want = {"NA-0082-26-132486": 101,  # 185 Greenwich St, 10007
            "NA-0081-26-132590": 304}  # 1193 Myrtle Ave, 11221
    for row in load("sla_pending_in_districts.json"):
        r = normalize_record(src, row)
        got = con.execute("SELECT cd FROM d WHERE ST_Contains(geom, ST_Point(?, ?))",
                          [r["lon"], r["lat"]]).fetchall()
        assert got == [(want[r["rid"]],)]


def test_point_outside_both_districts(con):
    # 16 Bridgewater St, Brooklyn 11222 (Greenpoint, BK CD 1) from the real sample.
    r = normalize_record(SOURCES_BY_KEY["liquor_pending"], load("sla_pending_sample.json")[0])
    assert con.execute("SELECT count(*) FROM d WHERE ST_Contains(geom, ST_Point(?, ?))",
                       [r["lon"], r["lat"]]).fetchone()[0] == 0


def test_distance_sphere_axis_order(con):
    # 0.001 deg of latitude is ~111 m. If the axis order were wrong (lat read as lon),
    # -74 would be read as a latitude and the pair would come out ~31 m apart.
    m = con.execute("SELECT ST_Distance_Sphere(ST_Point(-74.0, 40.7), ST_Point(-74.0, 40.701))"
                    ).fetchone()[0]
    assert 110 < m < 112


# ---------------------------------------------------------------- 311 complaints
# complaints_311_sample.json: 9 real erm2-nwe9 rows fetched 2026-11-04 with the pipeline's
# own $select (2 per district x location type, plus one extra MN CD 1 noise row).

def test_311_query_uses_configured_window_and_location_types():
    w = SOURCES_BY_KEY["complaints_311"].where
    assert f"created_date >= '{COMPLAINTS_311_START}'" in w
    # Rolling since #90: no upper bound, the nightly build runs through the newest data.
    assert COMPLAINTS_311_END is None and "created_date <" not in w
    assert ("(location_type in ('Club/Bar/Restaurant','Restaurant/Bar/Deli/Bakery')"
            " OR complaint_type in ('Outdoor Dining'))") in w
    assert "community_board in ('01 MANHATTAN','04 BROOKLYN')" in w


def test_311_selects_only_minimal_fields():
    # No resolution text, no cross streets, no channel: only what is shown (+ board for QA).
    assert set(SOURCES_BY_KEY["complaints_311"].fields) == {
        "unique_key", "created_date", "agency", "complaint_type", "descriptor",
        "incident_address", "incident_zip", "status", "community_board", "latitude", "longitude"}
    assert "board" not in C311_KEEP and "ts" not in C311_KEEP and "lat" not in C311_KEEP


def test_board_311_slug():
    assert board_311_slug("01 MANHATTAN", DISTRICTS) == "mn-cd1"
    assert board_311_slug("04 BROOKLYN", DISTRICTS) == "bk-cd4"
    assert board_311_slug("04 MANHATTAN", DISTRICTS) is None
    assert board_311_slug("0 Unspecified", DISTRICTS) is None
    assert board_311_slug(None, DISTRICTS) is None


def test_normalize_311_real_row():
    r = normalize_311(load("complaints_311_sample.json")[0])
    assert r["rid"] == "59887065" and r["date"] == "2024-01-01" and r["year"] == 2024
    assert r["type"] == "Noise - Commercial" and r["descriptor"] == "Loud Music/Party"
    assert (r["lon"], r["lat"]) == (-74.01031512653833, 40.70435458995396)  # strings -> floats
    assert r["agency"] == "NYPD" and r["status"] == "Closed"


def test_311_address_matches_license_address_key():
    """The documented match rule: normalized incident_address + ZIP equals the address
    page key. '47 STONE STREET' / 10004 (311) and '47 Stone St' (license style) match;
    the same street at another ZIP or house number does not."""
    r = normalize_311(load("complaints_311_sample.json")[0])
    assert r["aid"] == address_id(address_key("47 Stone St", "10004"))
    assert r["aid"] != address_id(address_key("47 Stone St", "10005"))
    assert r["aid"] != address_id(address_key("58 Stone St", "10004"))
    w = normalize_311(load("complaints_311_sample.json")[4])  # 211 WEST BROADWAY 10013
    assert w["aid"] == address_id(address_key("211 W Broadway", "10013"))


def test_311_rows_point_in_polygon_agree_with_board(con):
    for row in load("complaints_311_sample.json"):
        r = normalize_311(row)
        got = con.execute("SELECT cd FROM d WHERE ST_Contains(geom, ST_Point(?, ?))",
                          [r["lon"], r["lat"]]).fetchall()
        assert got, r["rid"]
        slug = {101: "mn-cd1", 304: "bk-cd4"}[got[0][0]]
        assert slug == board_311_slug(r["board"], DISTRICTS), r["rid"]


def test_count_by_type_year_and_recent():
    recs = [normalize_311(r) for r in load("complaints_311_sample.json")]
    table = count_by_type_year(recs, [2024, 2025])
    assert table[0] == {"type": "Noise - Commercial", "by_year": {"2024": 5, "2025": 0}, "total": 5}
    assert {t["type"] for t in table} == {"Noise - Commercial", "Food Establishment"}
    assert sum(t["total"] for t in table) == len(recs)
    assert count_by_type_year(recs, [2025]) == []  # years outside the window are not counted
    assert count_by_type(recs)[0] == {"type": "Noise - Commercial", "n": 5}
    top = recent_311(recs, 2)
    assert len(top) == 2 and top[0]["date"] >= top[1]["date"]
    assert set(top[0]) <= set(C311_KEEP)


def test_311_nearby_distance_real_rows(con):
    # 81 PEARL ST and 47 STONE ST (real rows, both 10004) are a short block apart:
    # inside the 150 m "nearby" radius, outside 25 m.
    rows = load("complaints_311_sample.json")
    a, b = normalize_311(rows[0]), normalize_311(rows[1])
    m = con.execute("SELECT ST_Distance_Sphere(ST_Point(?, ?), ST_Point(?, ?))",
                    [a["lon"], a["lat"], b["lon"], b["lat"]]).fetchone()[0]
    assert 25 < m < 150


# ---------------------------------------------------------------- address pages keyed on BIN (#59)
# Fixtures recorded 2026-11-04 from https://geosearch.planninglabs.nyc/v2/search (size=3).

from slam_pipeline.transform import (  # noqa: E402
    address_query,
    group_addresses,
    key_pages,
    pick_address_hit,
    slim_geosearch,
)


def test_address_query_drops_zip_and_unit():
    assert address_query("185 Greenwich St Ste LL5155", "Manhattan") == "185 Greenwich St, Manhattan, NY"
    assert address_query("", "Brooklyn") == ""


def test_pick_hit_185_greenwich_gives_bin_1089309():
    hit = pick_address_hit(load("geosearch_search_185_greenwich.json"), "185 Greenwich St", "Manhattan")
    assert hit["status"] == "matched"
    assert hit["bin"] == "1089309"
    assert hit["label"] == "185 GREENWICH STREET, New York, NY, USA"
    assert hit["confidence"] == 0.8


def test_pick_hit_survives_the_slim_cache_shape():
    full = load("geosearch_search_185_greenwich.json")
    assert pick_address_hit(slim_geosearch(full), "185 Greenwich St", "Manhattan") == \
        pick_address_hit(full, "185 Greenwich St", "Manhattan")


def test_zip_in_query_would_have_picked_the_wrong_building():
    # With the SLA's ZIP 11207 in the text, GeoSearch's hits are 514/518/524 Wilson Ave.
    # The house-number rule refuses them all; that is why address_query leaves ZIP out.
    hit = pick_address_hit(load("geosearch_search_44_wilson_11207.json"), "44 WILSON AVE", "Brooklyn")
    assert hit["status"] == "low_confidence" and hit["bin"] is None
    assert hit["label"].startswith("514 WILSON")


def test_pick_hit_needs_borough_and_street_too():
    resp = load("geosearch_search_44_wilson_brooklyn.json")
    # second hit is 44 WILSON STREET, Staten Island: same number, other street and borough
    assert pick_address_hit(resp, "44 Wilson Ave", "Brooklyn")["bin"] == "3071959"
    assert pick_address_hit(resp, "44 Wilson St", "Brooklyn")["status"] == "low_confidence"
    assert pick_address_hit(resp, "44 Wilson Ave", "Manhattan")["status"] == "low_confidence"


def test_no_features_is_unmatched():
    assert pick_address_hit(load("geosearch_search_no_match.json"), "1 Zzqx Ln", "Brooklyn")["status"] \
        == "unmatched"
    assert pick_address_hit(None, "", "Brooklyn")["status"] == "unmatched"


def test_placeholder_million_bin_is_never_a_key():
    resp = load("geosearch_search_million_bin.json")
    assert resp["features"][0]["properties"]["addendum"]["pad"]["bin"] == "3000000"
    hit = pick_address_hit(resp, "1 Brooklyn Bridge Park", "Brooklyn")
    assert hit["status"] == "matched" and hit["bin"] is None
    assert real_bin("3000000") is None and real_bin("1089309") == "1089309"
    assert real_bin("") is None and real_bin("6000001") is None


def _wilson_records():
    fx = load("sla_44_wilson_rows.json")
    recs = [normalize_record(SOURCES_BY_KEY[k], r) for k in ("liquor_active", "liquor_inactive")
            for r in fx[k]]
    for r in recs:
        r["district"] = "bk-cd4"
    return recs


def test_44_wilson_zip_split_becomes_one_bin_page():
    recs = _wilson_records()
    assert sorted(r["zip"] for r in recs) == ["11207", "11237"]
    groups = group_addresses(recs)
    assert len(groups) == 2, "street + ZIP keys alone split the building (the old bug)"
    hit = pick_address_hit(load("geosearch_search_44_wilson_brooklyn.json"), "44 WILSON AVE", "Brooklyn")
    pages, remap = key_pages(groups, {gid: hit for gid in groups})
    assert list(pages) == ["3071959"]
    page = pages["3071959"]
    assert len(page["records"]) == 2 and page["zip"] == "11237"
    assert page["listed_as"] == ["44 WILSON AVE 11207", "44 WILSON AVE 11237"]
    assert set(remap.values()) == {"3071959"}
    assert all(r["aid"] == "3071959" for r in page["records"])
    # A 311 complaint keyed on the 11237 street + ZIP lands on the merged page too.
    c = normalize_311({"unique_key": "1", "created_date": "2026-10-31T23:00:00.000",
                       "incident_address": "44 WILSON AVENUE", "incident_zip": "11237"})
    assert remap[c["aid"]] == "3071959"


def test_unmatched_groups_keep_their_old_key_and_are_not_dropped():
    recs = _wilson_records()
    groups = group_addresses(recs)
    pages, remap = key_pages(groups, {})  # e.g. --offline with an empty cache
    assert sorted(pages) == sorted(groups)
    assert all(p["bin"] is None and p["geocode"]["status"] == "unmatched" for p in pages.values())
    assert sum(len(p["records"]) for p in pages.values()) == len(recs)


# ---------------------------------------------------------------- restaurant inspections (#61)
# dohmh_sample.json: every 43nn-pn8j row for five camis, recorded 2026-11-04. The Malt House
# and La Cafeteria inspection dates were checked by eye against their ABC Eats pages.

@pytest.fixture(scope="module")
def rests():
    return reduce_inspections(load("dohmh_sample.json"))


def test_inspection_source_filters_on_the_two_boards():
    s = SOURCES_BY_KEY["restaurant_inspections"]
    assert s.id == "43nn-pn8j"
    assert s.where == "community_board in ('101','304')"
    co = SOURCES_BY_KEY["co_dobnow"]
    assert co.id == "pkdm-hqz6" and co.where == "community_board in (101,304)"


def test_one_row_per_violation_reduces_to_one_per_inspection(rests):
    malt = rests["50036043"]  # 7 violation rows, 3 inspections
    assert sum(1 for r in load("dohmh_sample.json") if r["camis"] == "50036043") == 7
    assert [i["date"] for i in malt["inspections"]] == ["2026-02-09", "2024-06-25", "2023-03-08"]
    assert [i["violations"] for i in malt["inspections"]] == [4, 1, 2]
    assert malt["bin"] == "1001098" and malt["street"] == "11 MAIDEN LN"


def test_grade_history_is_graded_inspections_only_newest_first(rests):
    gold = rests["50048523"]  # Gold Sounds, 44 Wilson Ave: 5 inspections, 2 graded
    assert len(gold["inspections"]) == 5
    assert [(h["date"], h["grade"]) for h in gold["history"]] == [("2025-03-21", "A"),
                                                                   ("2023-03-07", "P")]
    assert gold["latest"]["grade"] == "A" and gold["latest"]["grade_date"] == "2025-03-21"
    caf = rests["50165612"]
    assert [(h["date"], h["grade"]) for h in caf["history"]] == [("2026-09-23", "A"),
                                                                  ("2025-06-26", "B")]


def test_1900_placeholder_means_not_yet_inspected():
    desc = load("views_43nn-pn8j.json")["description"]
    assert "inspection date of 1/1/1900 are new establishments that have not yet received" in desc
    r = reduce_inspections(load("dohmh_sample.json"))["50193697"]
    assert r["not_inspected"] and r["inspections"] == [] and r["latest"] is None
    assert grade_bucket(r) == "Not yet inspected"


def test_grade_n_is_not_a_grade(rests):
    polar = rests["50162301"]  # Polar Pub, 185 Greenwich: one pre-permit inspection, grade N
    assert polar["inspections"][0]["grade"] == "N" and polar["history"] == []
    assert grade_bucket(polar) == "Not yet graded"
    assert {grade_bucket(r) for r in rests.values()} <= set(GRADE_BUCKETS)


def test_restaurant_points_fall_in_their_board_district(con, rests):
    for r in rests.values():
        got = con.execute("SELECT cd FROM d WHERE ST_Contains(geom, ST_Point(?, ?))",
                          [r["lon"], r["lat"]]).fetchall()
        assert got == [(int(r["board"]),)], r["camis"]


def test_place_restaurant_bin_first_then_point(rests):
    polar = rests["50162301"]
    # By BIN: 185 Greenwich's page is keyed on BIN 1089309.
    assert place_restaurant(polar, {"1089309": "1089309"}, [], 30)["method"] == "bin"
    # Same BIN missing: a BIN-keyed page nearby is another building, so never by point.
    here = frozenset({normalize_address(polar["street"])})
    pts = [("1089309", polar["lon"], polar["lat"], True, here)]
    assert place_restaurant(polar, {}, pts, 30)["aid"] is None
    # A page without a BIN within 30 m takes it by point, with the distance.
    pts = [("abcdef0123", polar["lon"] + 0.0001, polar["lat"], False, here)]
    got = place_restaurant(polar, {}, pts, 30)
    assert got["method"] == "point" and got["aid"] == "abcdef0123" and 5 <= got["m"] <= 12
    # Too far: not placed, so it is counted as not on a page.
    pts = [("abcdef0123", polar["lon"] + 0.001, polar["lat"], False, here)]
    assert place_restaurant(polar, {}, pts, 30)["method"] is None


def test_point_placement_needs_the_same_address():
    """QA of PR #65: within 30 m but a different building (26 Broadway vs 25 Broadway,
    30 vs 33-35 Wyckoff Ave) must not be placed by point."""
    rest = {"camis": "x", "bin": None, "street": "26 BROADWAY", "lon": -74.0130, "lat": 40.7056}
    other = [("abcdef0123", -74.01302, 40.70562, False, frozenset({normalize_address("25 Broadway")}))]
    assert place_restaurant(rest, {}, other, 30)["aid"] is None
    same = [("abcdef0123", -74.01302, 40.70562, False, frozenset({normalize_address("26 Broadway")}))]
    assert place_restaurant(rest, {}, same, 30)["method"] == "point"
    rest2 = {"camis": "y", "bin": "3072600", "street": "30 WYCKOFF AVENUE", "lon": -73.92, "lat": 40.70}
    across = [("fedcba9876", -73.92002, 40.70001, False, frozenset({normalize_address("33-35 Wyckoff Ave")}))]
    assert place_restaurant(rest2, {}, across, 30)["aid"] is None


def test_meters_matches_duckdb_sphere(con):
    a, b = (-74.0113, 40.7113), (-74.0103, 40.7113)
    m = con.execute("SELECT ST_Distance_Sphere(ST_Point(?, ?), ST_Point(?, ?))", [*a, *b]).fetchone()[0]
    assert abs(meters(*a, *b) - m) < 0.5


# ---------------------------------------------------------------- certificates of occupancy (#62)

def test_co_dobnow_rows_normalize():
    rows = [normalize_co(r) for r in load("co_dobnow_sample.json")]
    assert rows and all(r["bin"] in ("1001905", "1087239") for r in rows)
    first = next(r for r in rows if r["application"] == "CO-000015514")
    assert first["issued"] == "2022-02-15" and first["number"] == "1001905-0000002"
    assert co_issued_date("10/03/23  2:05:11 PM") == "2023-10-03"
    assert co_issued_date(None) == ""


def test_co_bin_prefers_the_page_bin_then_a_single_dohmh_bin():
    assert page_co_bin("1089309", ["1001098"]) == ("1089309", "geosearch")
    assert page_co_bin(None, ["3071959", "3071959", None]) == ("3071959", "dohmh")
    assert page_co_bin(None, ["3071959", "3071960"]) == (None, None)
    assert page_co_bin(None, []) == (None, None)
    assert real_bin("3000000") is None  # placeholder BINs never make a CO link


# ---------------------------------------------------------------- schools and houses of worship (#60)

from slam_pipeline import spatial  # noqa: E402
from slam_pipeline.sources import (  # noqa: E402
    LICENSE_COUNT_EXTRA_COUNTIES,
    PLACE_OF_WORSHIP_CLASSES,
    SCHOOL_NOTES,
    SLA_RULES,
    WORSHIP_CLASSES,
)
from slam_pipeline.transform import (  # noqa: E402
    NO_VALIDATED_ADDRESS_NOTE,
    bbox_with_margin,
    page_point,
    is_on_premises_liquor,
    normalize_school,
    normalize_worship,
    same_street,
    street_name,
)


# SLA's spellings of Queens in 9s3h-dpkz premisescounty, from a $group query on 2026-11-04.
LICENSE_COUNTY_SPELLINGS_CHECKED = {"Queens", "QUEENS"}


def extra_county_where(box):
    import build  # the SoQL lives in build.py next to the pull
    return build.extra_county_where(box)


@pytest.fixture(scope="module")
def sp():
    return spatial.connect()


@pytest.fixture(scope="module")
def schools():
    return {s["name"]: s for s in map(normalize_school, load("facdb_schools_sample.json"))}


def test_state_plane_projection_matches_dcp_own_xy(sp, schools):
    """FacDB publishes DCP's own State Plane feet (xcoord/ycoord) next to latitude/longitude.
    Our EPSG:2263 projection of the lat/lon must land on them."""
    for s in schools.values():
        (x, y), = spatial.project(sp, [(s["lon"], s["lat"])])
        assert abs(x - s["x"]) < 0.1 and abs(y - s["y"]) < 0.1, s["name"]


def test_axis_order_guard(sp, schools):
    pts = [(s["lon"], s["lat"], s["x"], s["y"]) for s in schools.values()]
    assert spatial.check_axis_order(sp, pts, "schools") < 0.1
    # The same points with latitude and longitude swapped, or with always_xy off, are off by
    # millions of feet, and the guard fails the build.
    with pytest.raises(spatial.AxisOrderError, match="axis order"):
        spatial.check_axis_order(sp, [(la, lo, x, y) for lo, la, x, y in pts], "swapped")
    s = schools["MILLENNIUM HIGH SCHOOL"]
    (x, y), = spatial.project(sp, [(s["lon"], s["lat"])], always_xy=False)
    assert abs(x - s["x"]) > 1_000_000


def test_distance_known_pair_in_feet(sp, schools):
    """Millennium HS (75 Broad St) to Richard R. Green HS (7 Beaver St), real FacDB points."""
    a, b = schools["MILLENNIUM HIGH SCHOOL"], schools["RICHARD R. GREEN HIGH SCHOOL OF TEACHING"]
    by_dcp_xy = ((a["x"] - b["x"]) ** 2 + (a["y"] - b["y"]) ** 2) ** 0.5
    assert by_dcp_xy == pytest.approx(534.6, abs=0.1)
    pairs = spatial.pairs_within(sp, [("a", a["lon"], a["lat"])], [("b", b["lon"], b["lat"])], 600)
    assert len(pairs) == 1 and pairs[0][2] == pytest.approx(by_dcp_xy, abs=0.5)
    # Independent check: great-circle metres (haversine) in US survey feet.
    assert pairs[0][2] == pytest.approx(meters(a["lon"], a["lat"], b["lon"], b["lat"]) / 0.3048006096, abs=1)
    assert spatial.pairs_within(sp, [("a", a["lon"], a["lat"])], [("b", b["lon"], b["lat"])], 500) == []


def test_sla_class_mapping_against_sla_table_and_real_values():
    table = {(r["type"], r["class"].zfill(4)): r for r in load("sla_license_classes.json")["rows"]}
    # Spot checks, each read from SLA's own table.
    assert table[("1", "0340")]["description"] == "Restaurant" and table[("1", "0340")]["product"] == "Liquor"
    assert table[("1", "0240")]["product"] == "Wine" and not is_on_premises_liquor("1", "0240")
    assert table[("1", "0100")]["description"] == "Liquor Store" and not is_on_premises_liquor("1", "0100")
    assert table[("1", "0101")]["description"] == "Off Premises Caterer"
    assert not is_on_premises_liquor("1", "0101")
    for c, name in (("0415", "Bottle Club"), ("0416", "Restaurant Brewer"), ("0417", "Cabaret"),
                    ("0370", "Food & Beverage Business")):
        assert table[("1", c)]["description"] == name and is_on_premises_liquor("1", c), c
    for c in ("0422", "0423", "0426"):  # Additional Bar classes: product blank in SLA's table
        assert table[("1", c)]["product"] == "NULL" and not is_on_premises_liquor("1", c)
    assert ("1", "0425") not in table and not is_on_premises_liquor("1", "0425")
    assert not is_on_premises_liquor("2", "0524") and not is_on_premises_liquor("1", "CM")
    # Every counted class in SLA's table is a Liquor-product class: 0340 to 0421 is 82 codes,
    # and SLA's table has all of them but 0418.
    counted = [k for k in table if is_on_premises_liquor(*k)]
    assert all(table[k]["product"] == "Liquor" for k in counted)
    assert len(counted) == 81
    # Every class/description pair in the real active-license pull for the two counties that
    # is counted is in SLA's table with the same description (case-insensitive).
    real = load("sla_active_type_class_values.json")["rows"]
    hits = [r for r in real if is_on_premises_liquor(r["type"], r["class"])]
    assert {r["class"] for r in hits} >= {"0340", "0370", "0417"}
    for r in hits:
        assert table[(r["type"], r["class"])]["description"].lower() == r["description"].lower(), r


def test_pluto_m_class_labels_and_kinds():
    """Labels are PLUTO 26v2's own (data dictionary, "M. CHURCHES, SYNAGOGUES, ETC."). Only M1 is a
    house of worship; M3 "Parsonage, Rectory" and M9 are other religious property (QA of #66)."""
    assert WORSHIP_CLASSES == {"M1": "Church, Synagogue, Chapel", "M2": "Mission House (Non-Residential)",
                               "M3": "Parsonage, Rectory", "M4": "Convents", "M9": "Miscellaneous"}
    assert PLACE_OF_WORSHIP_CLASSES == ("M1",)
    w = {x["cls"]: x for x in (normalize_worship(r, WORSHIP_CLASSES, PLACE_OF_WORSHIP_CLASSES)
                               for r in load("pluto_m3_m9_sample.json"))}
    assert w["M3"]["kind"] == "religious" and w["M3"]["type"] == "Parsonage, Rectory"
    assert w["M9"]["kind"] == "religious" and w["M9"]["type"] == "Miscellaneous"
    m1 = {x["street"]: x for x in (normalize_worship(r, WORSHIP_CLASSES, PLACE_OF_WORSHIP_CLASSES)
                                   for r in load("pluto_worship_sample.json"))}["75 BROADWAY"]
    assert m1["cls"] == "M1" and m1["kind"] == "worship"


def test_school_notes_harbor_and_no_validated_address():
    rows = load("facdb_harbor_and_no_streetname.json")
    s = {x["name"]: x for x in (normalize_school(r, SCHOOL_NOTES) for r in rows)}
    assert "Governors Island" in s["URBAN ASSEMBLY NEW YORK HARBOR SCHOOL"]["note"]
    arts = s["NEW YORK CITY CHARTER SCHOOL OF THE ARTS"]
    assert arts["note"] == NO_VALIDATED_ADDRESS_NOTE and arts["street_name"] == "BROADWAY"
    sample = load("facdb_schools_sample.json")
    mill = {x["name"]: x for x in (normalize_school(r, SCHOOL_NOTES) for r in sample)}
    assert mill["MILLENNIUM HIGH SCHOOL"]["note"] == ""  # FacDB has a validated streetname


def _pages_from_real_rows():
    """Real SLA / Dining Out rows and their real cached GeoSearch responses -> address pages."""
    recs = []
    for x in load("sla_rows_page_points.json"):
        r = normalize_record(SOURCES_BY_KEY[x["source"]], x["row"])
        r["district"] = "bk-cd4" if "WYCKOFF" in r["street"].upper() else "mn-cd1"
        recs.append(r)
    groups = group_addresses(recs)
    cache = load("geosearch_cache_page_points.json")
    geo = {}
    for gid, g in groups.items():
        borough = DISTRICTS[g["district"]]["borough"]
        geo[gid] = pick_address_hit(cache.get(address_query(g["street"], borough)), g["street"], borough)
    pages, _ = key_pages(groups, geo)
    return {p["street"].upper(): p for p in pages.values()}


def test_page_point_is_the_geosearch_point_when_matched():
    """QA of #66: 377 and 378 Greenwich St share one SLA point (0 ft apart on the page);
    GeoSearch puts them about 170 ft apart."""
    p = _pages_from_real_rows()
    a, b = p["377 GREENWICH ST"], p["378 GREENWICH ST"]
    assert a["point"]["source"] == b["point"]["source"] == "geosearch"
    recs_ft = meters(*avg_pt(a["records"]), *avg_pt(b["records"])) * 3.28084
    page_ft = meters(a["lon"], a["lat"], b["lon"], b["lat"]) * 3.28084
    assert recs_ft < 20 and 150 < page_ft < 200, (recs_ft, page_ft)
    # "7 WEST 51ST ST": SLA's point is in Lower Manhattan, GeoSearch's in Midtown.
    w = p["7 WEST 51ST ST"]
    assert w["point"]["source"] == "geosearch" and w["lat"] > 40.75 and w["point"]["records_gap_m"] > 5000


def avg_pt(records):
    pts = [(r["lon"], r["lat"]) for r in records if r["lon"] is not None]
    return sum(x for x, _ in pts) / len(pts), sum(y for _, y in pts) / len(pts)


def test_page_point_falls_back_to_the_records_average():
    hit = {"status": "low_confidence", "bin": None}
    assert page_point(hit, -74.0, 40.7) == {"lon": -74.0, "lat": 40.7, "source": "records",
                                            "records_gap_m": None}
    assert page_point({"status": "unmatched"}, None, None)["source"] is None
    m = page_point({"status": "matched", "lon": -74.0, "lat": 40.701}, -74.0, 40.7)
    assert m["source"] == "geosearch" and m["records_gap_m"] == 111


def test_queens_licenses_count_near_the_county_line(sp):
    """QA of #66: 894 Wyckoff Ave (BK CD 4) showed 0 other on-premises addresses within 500 ft,
    because Queens was not pulled. Real Queens rows from the widened-box pull."""
    assert LICENSE_COUNTY_SPELLINGS_CHECKED <= set(LICENSE_COUNT_EXTRA_COUNTIES)
    w = extra_county_where((-74.05, 40.67, -73.89, 40.73))
    assert w.startswith("premisescounty in ('Queens','QUEENS') AND "
                        "within_box(georeference, 40.730000, -74.050000")
    page = _pages_from_real_rows()["894 WYCKOFF AVE"]
    lsrc = SOURCES_BY_KEY["liquor_active"]
    q = [normalize_record(lsrc, r) for r in load("sla_active_queens_near_wyckoff.json")
         if is_on_premises_liquor(r["type"], r["class"])]
    near = spatial.pairs_within(sp, [(page["id"], page["lon"], page["lat"])],
                                [(r["street"], r["lon"], r["lat"]) for r in q], 500)
    assert sorted(b for _, b, _ in near) == ["859 Wyckoff Ave", "9-15 WYCKOFF AVE"]
    # From SLA's own (old page) point, 1647 Weirfield St is inside 500 ft too: 3, as QA found.
    old = spatial.pairs_within(sp, [("old", *avg_pt(page["records"]))],
                               [(r["street"], r["lon"], r["lat"]) for r in q], 500)
    assert len(old) == 3


def test_normalize_school_and_worship():
    s = {x["name"]: x for x in map(normalize_school, load("facdb_schools_sample.json"))}
    m = s["MILLENNIUM HIGH SCHOOL"]
    assert m["kind"] == "school" and m["street"] == "75 BROAD STREET" and m["street_name"] == "BROAD ST"
    lots = load("pluto_worship_sample.json")
    w = {x["street"]: x for x in (normalize_worship(r, WORSHIP_CLASSES) for r in lots)}
    t = w["75 BROADWAY"]
    assert t["type"] == "Church, Synagogue, Chapel" and t["street_name"] == "BROADWAY"
    assert t["bbl"] == "1000490001" and t["name"] == ""


def test_same_street_flag():
    assert street_name("111 BROADWAY") == "BROADWAY"
    # QA of #66: real FacDB `address` and SLA street strings with floor, suite or unit text.
    for raw, want in [("26 BROADWAY-12TH FL", "BROADWAY"), ("291 BROADWAY-2ND FL", "BROADWAY"),
                      ("26 BROADWAY-STE 900", "BROADWAY"), ("6 BARCLAY ST-FL 2", "BARCLAY ST"),
                      ("231 PALMETTO ST-FL 3-RM 327A", "PALMETTO ST"), ("99 WALL ST - #4487", "WALL ST"),
                      ("101 BROAD ST FL 2", "BROAD ST"), ("25 BROADWAY 9TH FLOOR", "BROADWAY"),
                      ("1 WALL ST 46TH-49TH FLOORS", "WALL ST"), ("200 WEST ST 11TH & 12TH FLOORS", "W ST"),
                      ("21 23 PECK SLIP, GR FL STORE 1", "PECK SLIP"),
                      ("363 Greenwich St # 1A", "GREENWICH ST"),
                      ("25 N MOORE ST 1A", "N MOORE ST"), ("179 Duane St Frnt 1", "DUANE ST"),
                      ("SAINT NICHOLAS AVE", "ST NICHOLAS AVE")]:
        assert street_name(raw) == want, raw
    # ...but street numbers and unit-like words that are part of the street stay.
    assert street_name("217 NORTH 10TH ST") == "N 10 ST"
    assert street_name("89 SOUTH STREET PIER 17") == "S ST PIER 17"
    assert street_name("10-12 Cortlandt St") == "CORTLANDT ST" and street_name("62 AVE B") == "AVE B"
    assert same_street({street_name("25 BROADWAY 9TH")}, street_name("26 BROADWAY-12TH FL")) is True
    assert same_street({"BROADWAY", "CEDAR ST"}, "BROADWAY") is True
    assert same_street({"WILSON AVE"}, street_name("1374 MYRTLE AVENUE")) is False
    assert same_street(set(), "BROADWAY") is None and same_street({"BROADWAY"}, "") is None


def test_bbox_margin_is_at_least_500_ft():
    lo0, la0, lo1, la1 = bbox_with_margin([-74.0, -73.9], [40.70, 40.71], 600)
    assert (40.70 - la0) * 364_000 == pytest.approx(600, rel=1e-6)
    assert (-74.0 - lo0) * 364_000 * 0.7576 > 500  # cos(40.705 deg) is about 0.7576


def test_rule_text_is_the_published_text():
    """SLA_RULES quotes ABC Law §64(7) word for word, from the nysenate.gov page read in a
    browser on 2026-11-04 (revision 2026-07-31)."""
    page = " ".join(load_text("abc64_7_nysenate_2026-07-31.txt").split())
    assert "MOST RECENT REVISION (FROM 2026-07-31)" in page and SLA_RULES["revision"] == "2026-07-31"
    for k in ("lead", "a", "b", "c"):
        assert SLA_RULES[k] in page, k


# ---------------------------------------------------------------- SLA license record (#63)

def test_sla_license_fields_are_selected_and_in_the_recorded_metadata():
    from slam_pipeline.sources import SLA_LICENSE
    for key, names in SLA_LICENSE["fields"].items():
        src = SOURCES_BY_KEY[key]
        cols = {c["fieldName"] for c in load(f"views_{src.id}.json")["columns"]}
        for field_name in names.values():
            assert field_name in src.fields, (key, field_name)
            assert field_name in cols, (key, field_name)
        assert src.has_point == names["point"]


def test_sla_license_keeps_raw_type_and_class_and_the_georeference_point():
    rows = load("sla_44_wilson_rows.json")
    act = normalize_record(SOURCES_BY_KEY["liquor_active"], rows["liquor_active"][0])
    assert act["rid"] == "0370-22-104616"
    assert (act["ltype"], act["lclass"]) == ("1", "0370")
    g = rows["liquor_active"][0]["georeference"]["coordinates"]
    assert (act["lon"], act["lat"]) == (g[0], g[1])  # GeoJSON [lon, lat], unchanged
    pend = normalize_record(SOURCES_BY_KEY["liquor_pending"], load("sla_pending_sample.json")[1])
    assert pend["ltype"] and pend["lclass"]


def test_sla_record_columns_are_the_datasets_own_word_for_word():
    """Every extra field shown (#63) is selected, and its name and description are the State's
    own, from the column metadata read on 2026-11-07."""
    from slam_pipeline.sources import SLA_LICENSE
    meta = load("sla_columns_2026-11-07.json")
    for key, names in SLA_LICENSE["fields"].items():
        src = SOURCES_BY_KEY[key]
        cols = {c["fieldName"]: c for c in meta[src.id]["columns"]}
        for rec_key, spec in SLA_LICENSE["record"].items():
            col = names.get(rec_key)
            if col is None:
                continue
            assert col in src.fields, (key, col)
            assert cols[col]["name"].replace("_", " ") == spec["name"], (key, col)
            assert cols[col]["description"].strip() == spec["description"], (key, col)
            assert (cols[col]["dataTypeName"] == "calendar_date") == bool(spec.get("date")), col
    # Pending applications publish no renewal, effective, legacy or parent column.
    assert set(SLA_LICENSE["fields"]["liquor_pending"]) & set(SLA_LICENSE["record"]) == {"aka"}


def test_no_sla_dataset_publishes_hours_or_method_of_operation():
    """#63 finding: none of the three SLA datasets has hours or method of operation. If the State
    adds one, this fails, so the site can show it instead of saying it is not published."""
    from slam_pipeline.sources import SLA_LICENSE
    meta = load("sla_columns_2026-11-07.json")
    for key in SLA_LICENSE["fields"]:
        for c in meta[SOURCES_BY_KEY[key].id]["columns"]:
            text = f'{c["fieldName"]} {c["name"]} {c["description"] or ""}'.lower()
            for word in SLA_LICENSE["not_published"]:
                assert word not in text, (key, c["fieldName"], word)


def test_sla_record_extras_from_real_rows():
    rows = load("sla_44_wilson_rows.json")
    act = normalize_record(SOURCES_BY_KEY["liquor_active"], rows["liquor_active"][0])
    assert (act["issued"], act["renewed"], act["effective"]) == ("2026-01-13", "2026-01-13", "2026-02-01")
    assert act["legacy_id"] == "1289433"
    assert act["parent_id"] == "" and act["aka"] == ""  # not in the row -> empty, then dropped by slim
    old = normalize_record(SOURCES_BY_KEY["liquor_inactive"], rows["liquor_inactive"][0])
    assert (old["renewed"], old["effective"], old["legacy_id"]) == ("2013-02-08", "2013-02-08", "1267853")
    assert "parent_id" not in old  # the inactive dataset has no parent license column
    bar = next(x["row"] for x in load("sla_rows_page_points.json")
               if x["row"].get("licensepermitid") == "0340-26-151065-01")
    r = normalize_record(SOURCES_BY_KEY["liquor_active"], bar)
    assert r["type"] == "Additional Bar" and r["parent_id"] == "0340-26-151065"
    pend = normalize_record(SOURCES_BY_KEY["liquor_pending"], load("sla_pending_sample.json")[1])
    assert "renewed" not in pend and "legacy_id" not in pend and "aka" in pend
    # Other sources get none of these keys.
    from slam_pipeline.sources import SLA_LICENSE
    ocm = normalize_record(SOURCES_BY_KEY["cannabis_license"], load("ocm_licenses_sample.json")[0])
    assert not set(SLA_LICENSE["record"]) & set(ocm)


# ---------------------------------------------------------------- cannabis siting (Cannabis Law §72(6))

def test_cannabis_distances_follow_cannabis_law_72_6():
    from slam_pipeline.sources import CANNABIS_RULES
    from slam_pipeline.transform import CANNABIS_SCHOOL_FT, CANNABIS_WORSHIP_FT
    # Text read 2026-11-05 through the NYS Open Legislation API (CAN 72, active 2026-02-13).
    assert "within five hundred feet of a building containing a school" in CANNABIS_RULES["a"]
    assert "within two hundred feet of a building exclusively occupied as a house of worship" in CANNABIS_RULES["b"]
    assert "center of the nearest entrance" in CANNABIS_RULES["c"]
    assert (CANNABIS_SCHOOL_FT, CANNABIS_WORSHIP_FT) == (500, 200)
    assert CANNABIS_RULES["url"] == "https://www.nysenate.gov/legislation/laws/CAN/72"


# ---------------------------------------------------------------- LAMP per-license links (#63)

def test_lamp_layers_verified_against_the_real_web_map():
    import json
    from pathlib import Path
    from slam_pipeline.sources import SLA_LICENSE
    from slam_pipeline.transform import verify_lamp_layers
    wm = json.loads((Path(__file__).parent / "fixtures" / "lamp_webmap_2026-11-05.json").read_text())
    layers = SLA_LICENSE["lamp_records"]["layers"]
    got = verify_lamp_layers(wm, layers)
    assert got == {
        "liquor_active": {"layer_id": "18c59d3a27d-layer-12", "field": "LicensePermitID"},
        "liquor_pending": {"layer_id": "18c5a02ff71-layer-11", "field": "ApplicationID"},
        "liquor_inactive": {"layer_id": "18c5a031648-layer-12", "field": "LicensePermitID"},
    }
    # SLA re-authors the map: a layer id disappears or points elsewhere -> that link is dropped.
    moved = {"operationalLayers": [dict(l, id=l["id"] + "x") if "ActiveLicenses" in (l["url"] or "")
                                   else l for l in wm["operationalLayers"]]}
    assert "liquor_active" not in verify_lamp_layers(moved, layers)
    assert verify_lamp_layers(None, layers) == {}


def test_get_json_retries_a_connection_reset(monkeypatch):
    # A live build on 2026-11-05 died on "Connection reset by peer" mid-download.
    import io
    from slam_pipeline import net
    calls = {"n": 0}

    class Resp(io.BytesIO):
        def __enter__(self): return self
        def __exit__(self, *a): return False

    def fake(req, timeout=None):
        calls["n"] += 1
        if calls["n"] == 1:
            raise ConnectionResetError(54, "Connection reset by peer")
        return Resp(b'[{"ok": 1}]')
    monkeypatch.setattr(net.urllib.request, "urlopen", fake)
    monkeypatch.setattr(net.time, "sleep", lambda s: None)
    assert net.get_json("https://example.invalid/x.json") == [{"ok": 1}]
    assert calls["n"] == 2
