"""Joint Interest Areas (#87) and addresses on a district line (#88), against real recorded data:
the 71 boro_cd values and the Brooklyn CD 3 and CD 4 outlines of NYC 5crt-au7u, and the City's
address file (PAD) points for 905 and 906 Broadway, Brooklyn, all recorded 2026-11-07."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from slam_pipeline import districts, spatial
from slam_pipeline.sources import (COMPLAINTS_311_BOARDS, DISTRICTS, PILOT_BORO_CDS,
                                   RESTAURANT_BOARDS)
from slam_pipeline.transform import board_311_slug, events_for_district, parse_boards

FIX = Path(__file__).parent / "fixtures"


def load(name):
    return json.loads((FIX / name).read_text())


CITYWIDE = [int(c) for c in load("districts_citywide_boro_cd.json")["boro_cd"]]


# ---------------------------------------------------------------- #87 Joint Interest Areas

def test_citywide_dataset_is_59_districts_and_12_joint_interest_areas():
    got = districts.check_citywide(CITYWIDE)
    assert got["community_districts"] == 59
    assert got["joint_interest_areas"] == 12
    assert got["joint_interest_area_ids"] == [164, 226, 227, 228, 355, 356, 480, 481, 482, 483,
                                              484, 595]


def test_check_citywide_fails_loudly_on_a_missing_district():
    with pytest.raises(RuntimeError, match="expected the 59"):
        districts.check_citywide([c for c in CITYWIDE if c != 304])
    with pytest.raises(RuntimeError, match="repeated"):
        districts.check_citywide(CITYWIDE + [304])


@pytest.mark.parametrize("cd, jia", [(112, False), (164, True), (212, False), (226, True),
                                     (318, False), (355, True), (414, False), (480, True),
                                     (503, False), (595, True)])
def test_jia_is_any_number_above_the_boroughs_highest_district(cd, jia):
    assert districts.is_jia(cd) is jia


def test_labels_and_slugs():
    assert districts.info(304) | {"slug": districts.slug(304)} == {
        "boro_cd": 304, "label": "Brooklyn Community District 4", "name": "CD 4",
        "short": "BK CD 4", "borough": "Brooklyn", "cb": 4, "jia": False, "slug": "bk-cd4"}
    j = districts.info(355)
    assert districts.slug(355) == "bk-jia355"
    assert j["label"] == "Brooklyn Joint Interest Area 355"
    assert j["short"] == "BK JIA 355" and j["jia"] is True and j["cb"] == 55
    assert districts.slug(595) == "si-jia595"
    reg = districts.registry(CITYWIDE)
    assert len(reg) == 71 and len(set(reg)) == 71  # every slug is unique


def test_pilot_districts_are_unchanged():
    assert PILOT_BORO_CDS == (101, 304)
    assert {s: (d["label"], d["short"], d["borough"], d["cb"]) for s, d in DISTRICTS.items()} == {
        "mn-cd1": ("Manhattan Community District 1", "MN CD 1", "Manhattan", 1),
        "bk-cd4": ("Brooklyn Community District 4", "BK CD 4", "Brooklyn", 4)}
    assert COMPLAINTS_311_BOARDS == ("01 MANHATTAN", "04 BROOKLYN")
    assert RESTAURANT_BOARDS == ("101", "304")


def test_jia_board_text_matches_how_each_dataset_writes_it():
    """Read from the $group results recorded 2026-11-07, not assumed."""
    spell = load("district_board_spellings_2026-11-07.json")
    c311 = {r["community_board"] for r in spell["erm2-nwe9 community_board (created_date >= 2026-01-01)"]}
    dohmh = {r["community_board"] for r in spell["43nn-pn8j community_board"]}
    reg = districts.registry(CITYWIDE)
    for slug, d in reg.items():
        if not d["jia"]:
            continue
        text = f"{d['cb']:02d} {d['borough'].upper()}"
        if text in c311:  # 311 had rows for 11 of the 12 that year
            assert board_311_slug(text, {slug: d}) == slug
    assert {"64 MANHATTAN", "55 BROOKLYN", "80 QUEENS", "95 STATEN ISLAND"} <= c311
    assert {"164", "355", "480", "595"} <= dohmh
    ev = spell["tvpp-9vvx event_borough, community_board (like 64/55/80/95/26)"]
    events = [{"borough": r["event_borough"], "boards": parse_boards(r["community_board"])} for r in ev]
    cp = reg["mn-jia164"]
    assert len(events_for_district(events, cp["borough"], cp["cb"])) == 2  # '64,' and '64, 8,'


# ---------------------------------------------------------------- #88 addresses on a line

@pytest.fixture(scope="module")
def con():
    c = spatial.connect()
    spatial.load_districts(c, load("districts_303_304.geojson")["features"], districts.slug)
    return c


def broadway():
    return {r[0]: (r[3], r[4]) for r in load("pad_broadway_905_906.json")}


def test_906_broadway_is_on_the_line_between_brooklyn_cd_3_and_cd_4(con):
    """Boundaries Map puts 906 Broadway in CD 3; the licenses' own points put it in CD 4."""
    pts = broadway()
    near = spatial.districts_near(con, [("906", *pts["906"]), ("905", *pts["905"])],
                                  districts.BOUNDARY_FT)
    assert [s for s, _ in near["906"]] == ["bk-cd3", "bk-cd4"]
    assert near["906"][0][1] == 0  # the City's point is inside CD 3
    assert 85 < near["906"][1][1] < districts.BOUNDARY_FT  # about 92 ft from the CD 4 line
    # Across the street, 905 Broadway is inside CD 4, about 69 ft from the CD 3 line.
    assert [s for s, _ in near["905"]] == ["bk-cd4", "bk-cd3"]
    reg = districts.registry([303, 304])
    assert districts.line_note(["bk-cd4", "bk-cd3"], reg) == \
        "On the line between Brooklyn CD 3 and CD 4"


def test_half_a_street_width_would_miss_906_broadway(con):
    """Why BOUNDARY_FT is not 30-50 ft: the City's point sits inside the lot, not at the curb."""
    near = spatial.districts_near(con, [("906", *broadway()["906"])], 50)
    assert [s for s, _ in near["906"]] == ["bk-cd3"]


def test_listing_on_a_line():
    reg = districts.registry(CITYWIDE)
    built = {"bk-cd4", "mn-cd1"}
    near = [("bk-cd3", 0.0), ("bk-cd4", 91.8)]
    # Only CD 4 is built: listed in CD 4, and the note names both.
    got = districts.place_on_lines(near, ["bk-cd4"], built, reg)
    assert got == {"listed_in": ["bk-cd4"], "line": ["bk-cd3", "bk-cd4"],
                   "note": "On the line between Brooklyn CD 3 and CD 4"}
    # Both built: listed in both, the records' district first.
    got = districts.place_on_lines(near, ["bk-cd4"], built | {"bk-cd3"}, reg)
    assert got["listed_in"] == ["bk-cd4", "bk-cd3"]
    # Records placed nowhere we build (a boundary candidate): listed by the City's point only.
    assert districts.place_on_lines(near, [], built, reg)["listed_in"] == ["bk-cd4"]
    # Not near a line: no note.
    assert districts.place_on_lines([("bk-cd4", 0.0)], ["bk-cd4"], built, reg) == {
        "listed_in": ["bk-cd4"], "line": [], "note": None}
    # No City point: the records' district, as published.
    assert districts.place_on_lines([], ["bk-cd4"], built, reg)["listed_in"] == ["bk-cd4"]


def test_line_note_wording():
    reg = districts.registry(CITYWIDE)
    assert districts.line_note(["bk-cd4", "qn-cd5"], reg) == \
        "On the line between Brooklyn CD 4 and Queens CD 5"
    assert districts.line_note(["bk-cd9", "bk-jia355", "bk-cd14"], reg) == \
        "On the line between Brooklyn CD 9, CD 14 and Joint Interest Area 355"
    with pytest.raises(ValueError):
        districts.line_note(["bk-cd4"], reg)


def test_a_page_on_a_line_is_in_the_points_file_of_every_district_it_is_listed_in():
    from slam_pipeline.lookup import split_lookup
    pts = broadway()
    pages = [{"id": "3042867", "bin": "3042867", "district": "bk-cd4", "listed_in": ["bk-cd4", "bk-cd3"],
              "lon": pts["906"][0], "lat": pts["906"][1]},
             {"id": "3071873", "bin": "3071873", "district": "bk-cd4", "lon": pts["905"][0],
              "lat": pts["905"][1]}]
    out = split_lookup(pages, 30)
    assert [p[0] for p in out["points-bk-cd4.json"]] == ["3042867", "3071873"]
    assert [p[0] for p in out["points-bk-cd3.json"]] == ["3042867"]
