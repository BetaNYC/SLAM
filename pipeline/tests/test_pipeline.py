"""Tests against REAL recorded responses in tests/fixtures/ (recorded 2026-11-04
from data.ny.gov, data.cityofnewyork.us and geosearch.planninglabs.nyc). No
invented payloads."""

from __future__ import annotations

import json
from pathlib import Path

import duckdb
import pytest

from slam_pipeline.sources import (
    COMPLAINTS_311_START,
    DISTRICT_SOURCE,
    DISTRICTS,
    SOURCES,
    SOURCES_BY_KEY,
)
from slam_pipeline.transform import (
    C311_KEEP,
    SchemaError,
    accept_geosearch,
    address_id,
    address_key,
    board_311_slug,
    building_street,
    check_columns,
    check_rows,
    count_by_type,
    count_by_type_year,
    events_for_district,
    house_number,
    normalize_311,
    normalize_address,
    normalize_event,
    normalize_record,
    parse_boards,
    recent_311,
    strip_name_prefix,
)

FX = Path(__file__).parent / "fixtures"


def load(name):
    return json.loads((FX / name).read_text())


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
    assert "location_type in ('Club/Bar/Restaurant','Restaurant/Bar/Deli/Bakery')" in w
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
    real_bin,
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
