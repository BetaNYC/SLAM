"""Matching addresses against the City's normalized PAD file (#86).

Fixtures are real rows: pad_sample.json and pad_places_sample.json were cut from
labs-geosearch-pad-normalized.csv (PAD 26c, Last-Modified 2026-08-21) on 2026-11-05. The address
texts below are real SLA and DOHMH spellings seen in the citywide test that day.
"""
import json
from pathlib import Path

import duckdb
import pytest

from slam_pipeline import padmatch
from slam_pipeline.padmatch import PadIndex, candidates, street_key

FIX = Path(__file__).parent / "fixtures"
ASTORIA = (-73.9306, 40.7615)  # SLA's own point for a "21 37 BROADWAY" license in Queens


@pytest.fixture(scope="module")
def ix(tmp_path_factory):
    d = tmp_path_factory.mktemp("pad")
    con = duckdb.connect()
    con.execute("CREATE TABLE pad (num VARCHAR, street VARCHAR, zipcode VARCHAR, lon DOUBLE, lat DOUBLE, bin VARCHAR, bbl VARCHAR, version VARCHAR)")
    con.executemany("INSERT INTO pad VALUES (?,?,?,?,?,?,?,?)", json.loads((FIX / "pad_sample.json").read_text()))
    con.execute(f"COPY pad TO '{d / 'pad.parquet'}' (FORMAT parquet)")
    con.execute("CREATE TABLE pl (name VARCHAR, zipcode VARCHAR, lon DOUBLE, lat DOUBLE, bin VARCHAR, bbl VARCHAR)")
    con.executemany("INSERT INTO pl VALUES (?,?,?,?,?,?)", json.loads((FIX / "pad_places_sample.json").read_text()))
    con.execute(f"COPY pl TO '{d / 'places.parquet'}' (FORMAT parquet)")
    return PadIndex(d / "pad.parquet")


def first(text, boro):
    return candidates(text, boro)[0][:2]


def test_numbered_avenue_is_read_as_written_first():
    # "365 5 AVENUE" is 365 Fifth Avenue, not a range 365-5.
    assert first("365 5 AVENUE", "1") == ("365", "5 AVE")
    assert all(sk != "AVE" for _, sk, _ in candidates("365 5 AVENUE", "1"))


def test_queens_number_without_hyphen():
    c = candidates("104 30 ROOSEVELT AVENUE", "4")
    assert ("104-30", "ROOSEVELT AVE", "Queens number without the hyphen") in c
    # Outside Queens the same shape is a range, never a hyphenated number.
    assert not any(n == "104-30" for n, _, _ in candidates("104 30 ROOSEVELT AVENUE", "1"))


@pytest.mark.parametrize("text,boro,expect", [
    ("237 243 AVENUE U", "3", ("237", "AVE U", "first number of a range")),
    ("47-31 47-33 JUNCTION BLVD", "4", ("47-31", "JUNCTION BLVD", "first of two Queens numbers")),
    ("216 1/2 Greene Ave", "3", ("216 1/2", "GREENE AVE", "half number")),
    ("335 BOWERY AKA 4 E 3RD ST", "1", ("4", "E 3 ST", "AKA address")),
    ("335 BOWERY AKA 4 E 3RD ST", "1", ("335", "BOWERY", "address before AKA")),
    ("55-48 METROPOLITAN AVE, 1ST FL", "4", ("55-48", "METROPOLITAN AVE", "text before the comma")),
    ("1185 BROADWAY- ZAYTINYA", "1", ("1185", "BROADWAY", "trailing text removed")),
    ("80-82 CLINTON ST", "3", ("80", "CLINTON ST", "first number of a range")),
])
def test_cleanup_readings(text, boro, expect):
    assert expect in candidates(text, boro)


def test_word_number_and_ordinals():
    assert first("ONE EAST 161ST STREET", "2") == ("1", "E 161 ST")
    assert street_key("FIRST AVENUE") == street_key("1 AVENUE") == "1 AVE"


def test_street_key_folds_both_sides_the_same_way():
    assert street_key("HORACE HARDING EXPWY") == street_key("HORACE HARDING EXPRESSWAY")
    assert street_key("SAINT NICHOLAS AVENUE") == street_key("ST NICHOLAS AVE")
    assert street_key("FLATBUSH AVENUE EXTENSION") == street_key("FLATBUSH AVE EXT")


def test_lookup_as_written(ix):
    h = ix.lookup("365 5 AVENUE", "1", "10016")
    assert (h["bin"], h["rule"]) == ("1017097", "as written")


def test_borough_decides_between_same_address_in_two_boroughs(ix):
    # 365 5 AVENUE exists in Manhattan (1017097) and Brooklyn (3021387).
    assert ix.lookup("365 5 AVENUE", "3", "11215")["bin"] == "3021387"


def test_lookup_queens_rule_and_half_number(ix):
    assert ix.lookup("104 30 ROOSEVELT AVENUE", "4", "11368")["bin"] == "4048773"
    assert ix.lookup("216 1/2 Greene Ave", "3")["bin"] == "3056216"


def test_risky_reading_must_be_near_the_records_own_point(ix):
    # Read as a range, "21 37 BROADWAY" would land on 21 Broadway in Lower Manhattan: miles
    # from the license's own point in Astoria. Rejected when the point is known.
    assert ix.lookup("21 37 BROADWAY", "1", near=ASTORIA) is None
    loose = ix.lookup("21 37 BROADWAY", "1")
    assert loose and loose["rule"] == "first number of a range"


def test_safe_reading_is_not_held_back_by_a_far_point(ix):
    # SLA's own points for Queens numbers written without the hyphen are often blocks off
    # (2026-11-05: 249 of 852 more than 1,000 ft away, on the right street at the wrong spot).
    h = ix.lookup("104 30 ROOSEVELT AVENUE", "4", near=ASTORIA)
    assert h["bin"] == "4048773"


def test_named_place_and_placeholder_bin(ix):
    h = ix.lookup("JFK International Airport", "4", "11430")
    assert h["rule"] == "named place" and h["bin"] is None  # 4000000 is PAD's placeholder BIN
    assert ix.lookup("1 TAVERN ON THE GREEN", "1")["bin"] == "1085773"


def test_borough_from_zip_when_the_county_is_wrong(ix):
    h = ix.lookup("237 AVENUE U", "4", "11223")  # filed under Queens; ZIP 11223 is Brooklyn
    assert h["bin"] == "3191335" and h["rule"].endswith("borough from the ZIP")


def test_ensure_pad_offline(tmp_path):
    assert padmatch.ensure_pad(tmp_path, offline=True) is None
    (tmp_path / "pad.parquet").write_bytes(b"x")
    assert padmatch.ensure_pad(tmp_path, offline=True) == tmp_path / "pad.parquet"
