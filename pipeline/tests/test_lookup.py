"""The search box's split lookup files (#85)."""
import pytest

from slam_pipeline.lookup import split_lookup

PAGES = [
    {"id": "1000003", "bin": "1000003", "district": "mn-cd1", "lon": -74.0123456789, "lat": 40.7012341},
    {"id": "a40aec8fce", "bin": "", "district": "mn-cd1", "lon": -74.01, "lat": 40.71},
    {"id": "3071959", "bin": "3071959", "district": "bk-cd4", "lon": -73.9296, "lat": 40.7026},
    {"id": "3000001", "bin": "3000001", "district": "bk-cd4", "lon": None, "lat": None},
]


def test_one_bins_file_per_borough_all_five_written():
    out = split_lookup(PAGES, 30)
    assert sorted(k for k in out if k.startswith("bins-")) == [f"bins-{b}.json" for b in "12345"]
    assert out["bins-1.json"] == {"bins": {"1000003": "1000003"}}
    assert out["bins-3.json"] == {"bins": {"3000001": "3000001", "3071959": "3071959"}}
    assert out["bins-4.json"] == {"bins": {}}


def test_points_per_district_rounded_and_only_with_a_point():
    out = split_lookup(PAGES, 30)
    assert out["points-mn-cd1.json"] == [["1000003", -74.012346, 40.701234], ["a40aec8fce", -74.01, 40.71]]
    assert out["points-bk-cd4.json"] == [["3071959", -73.9296, 40.7026]]


def test_index_has_radius_and_bbox_of_each_districts_points():
    idx = split_lookup(PAGES, 30)["index.json"]
    assert idx["radius_m"] == 30
    assert idx["districts"]["mn-cd1"] == {"bbox": [-74.012346, 40.701234, -74.01, 40.71], "n": 2}
    assert idx["districts"]["bk-cd4"]["n"] == 1


def test_bin_without_a_borough_digit_fails_loud():
    with pytest.raises(ValueError):
        split_lookup([{"id": "x", "bin": "0123456", "district": "mn-cd1", "lon": 0, "lat": 0}], 30)
