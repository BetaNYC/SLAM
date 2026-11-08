"""Community districts and Joint Interest Areas, by City Planning's own numbers (#87, #88).

City Planning's Community Districts dataset (NYC Open Data 5crt-au7u) has one row per
`boro_cd`: the first digit is the borough (1 Manhattan, 2 Bronx, 3 Brooklyn, 4 Queens,
5 Staten Island), the last two the district. It holds the 59 community districts and 12
Joint Interest Areas: large parks, airports and similar places that are in no community
district. On 2026-11-07 the dataset's 71 rows were the 59 districts plus 164, 226, 227, 228,
355, 356, 480, 481, 482, 483, 484 and 595 (tests/fixtures/districts_citywide_boro_cd.json).
The dataset has no name or type column (its only columns are boro_cd, shape_leng,
shape_area and the_geom; tests/fixtures/views_5crt-au7u.json), so a Joint Interest Area is
told apart by its number. We follow BetaNYC's BoardStat v2 (v2/pipeline/boardstat_build.py,
`MAX_CD`, `cd_label`): any boro_cd above the borough's highest community district number is
a Joint Interest Area, and it is listed as its own district.

How other datasets write a district, checked with $group on 2026-11-07
(tests/fixtures/district_board_spellings_2026-11-07.json):
  - 311 (erm2-nwe9) community_board: two digits + borough, the last two digits of boro_cd even
    for a Joint Interest Area: '04 BROOKLYN', '64 MANHATTAN', '55 BROOKLYN', '80 QUEENS',
    '95 STATEN ISLAND'.
  - Street events (tvpp-9vvx) community_board: a comma list of those same last two digits,
    with event_borough: '55,' (Brooklyn), '64, 8,' (Manhattan), '26,' (Bronx).
  - Health inspections (43nn-pn8j) and Dining Out (fpeh-f7ci) community_board: the whole
    boro_cd, '304', '164', '480'. Dining Out had no Joint Interest Area rows that day.
So `cb` below is the last two digits for every district, the number 311 and street events use.

This module only names and labels districts. Which ones SLAM builds is `sources.DISTRICTS`.
"""
from __future__ import annotations

BOROUGHS = {1: "Manhattan", 2: "Bronx", 3: "Brooklyn", 4: "Queens", 5: "Staten Island"}
BORO_ABBR = {1: "MN", 2: "BX", 3: "BK", 4: "QN", 5: "SI"}
# Highest real community district number per borough (BoardStat v2's MAX_CD). Any boro_cd
# above it is a Joint Interest Area.
MAX_CD = {1: 12, 2: 12, 3: 18, 4: 14, 5: 3}
COMMUNITY_DISTRICTS = sum(MAX_CD.values())  # 59

# ---- Addresses on a district line (#88)
# District lines mostly run down the middle of a street, so a building on a boundary street
# faces another district across it. An address whose City point (the City's address file,
# PAD) is within BOUNDARY_FT of another district's line is listed in both districts, with a
# note saying it is on the line.
#
# Why 100 ft and not half a street width (30 to 50 ft): the City's point sits inside the lot,
# not at the curb, so it is half the street plus part of the lot away from the line. Measured
# on the 2026-11-07 build (1,081 pages with a City point):
#   - 906 Broadway, Brooklyn (a corner lot; Boundaries Map: CD 3, SLAM had CD 4) is 92 ft from
#     the CD 4 line, and 905 Broadway across the street is 69 ft from the CD 3 line. Broadway
#     there runs under the elevated J train. 50 ft misses both.
#   - 78 pages are within 100 ft of another district, 67 of them on Broadway, Flushing Ave,
#     Canal St, West Broadway or Wyckoff Ave. Past 100 ft the count falls to about 4 pages per
#     10 ft, out to 200 ft.
# One number for the whole city; check it again for each borough as districts are turned on (#92).
BOUNDARY_FT = 100.0
# Records whose own point is outside every district SLAM builds, but within this distance of
# one, are matched to the City's address file (never sent to GeoSearch) in case their City
# point is on the line. SLA's own points sit a median 75 ft from the City's (QA of #66).
BOUNDARY_CANDIDATE_FT = 500.0


def split(boro_cd) -> tuple[int, int]:
    """301 -> (3, 1). Refuses a number that is not a known borough + district."""
    boro, num = divmod(int(boro_cd), 100)
    if boro not in BOROUGHS or num < 1:
        raise ValueError(f"boro_cd {boro_cd!r} is not a borough digit + district number")
    return boro, num


def is_jia(boro_cd) -> bool:
    """True for a Joint Interest Area: a boro_cd above its borough's highest district."""
    boro, num = split(boro_cd)
    return num > MAX_CD[boro]


def slug(boro_cd) -> str:
    """The district's id on the site: 101 -> 'mn-cd1', 304 -> 'bk-cd4', 355 -> 'bk-jia355'.
    A Joint Interest Area keeps its whole boro_cd, the number City Planning publishes."""
    boro, num = split(boro_cd)
    abbr = BORO_ABBR[boro].lower()
    return f"{abbr}-jia{int(boro_cd)}" if is_jia(boro_cd) else f"{abbr}-cd{num}"


def info(boro_cd) -> dict:
    """The fields a `sources.DISTRICTS` entry carries, for any district.

    cb is the last two digits of boro_cd: the community board number for a community district,
    and the number 311 and street events use for a Joint Interest Area, which has no board.
    `name` is the short form used inside a sentence: 'CD 4' or 'Joint Interest Area 355'."""
    boro, num = split(boro_cd)
    borough = BOROUGHS[boro]
    if is_jia(boro_cd):
        name = f"Joint Interest Area {int(boro_cd)}"
        return {"boro_cd": int(boro_cd), "label": f"{borough} {name}", "name": name,
                "short": f"{BORO_ABBR[boro]} JIA {int(boro_cd)}", "borough": borough,
                "cb": num, "jia": True}
    return {"boro_cd": int(boro_cd), "label": f"{borough} Community District {num}",
            "name": f"CD {num}", "short": f"{BORO_ABBR[boro]} CD {num}", "borough": borough,
            "cb": num, "jia": False}


def registry(boro_cds) -> dict[str, dict]:
    """slug -> info() for every boro_cd given (e.g. every row of 5crt-au7u)."""
    return {slug(c): info(c) for c in sorted(int(c) for c in boro_cds)}


def check_citywide(boro_cds) -> dict:
    """Counts of the districts in the dataset. Fails loudly if the community districts are not
    exactly the 59 the City Charter sets up (one per board), or a number is repeated."""
    cds = [int(c) for c in boro_cds]
    if len(set(cds)) != len(cds):
        raise RuntimeError(f"community districts: repeated boro_cd in {sorted(cds)}")
    real = sorted(c for c in cds if not is_jia(c))
    want = sorted(b * 100 + n for b, top in MAX_CD.items() for n in range(1, top + 1))
    if real != want:
        raise RuntimeError(f"community districts: expected the {COMMUNITY_DISTRICTS} districts "
                           f"{want}, got {real}")
    return {"community_districts": len(real), "joint_interest_areas": len(cds) - len(real),
            "joint_interest_area_ids": sorted(c for c in cds if is_jia(c))}


def line_note(slugs: list[str], reg: dict[str, dict]) -> str:
    """'On the line between Brooklyn CD 3 and CD 4'. The borough is named once when every
    district is in one borough, else with each one: 'Brooklyn CD 4 and Queens CD 5'."""
    ds = sorted((reg[s] for s in slugs), key=lambda d: d["boro_cd"])
    if len(ds) < 2:
        raise ValueError("a line note needs two or more districts")
    if len({d["borough"] for d in ds}) == 1:
        parts = [f"{ds[0]['borough']} {ds[0]['name']}", *(d["name"] for d in ds[1:])]
    else:
        parts = [f"{d['borough']} {d['name']}" for d in ds]
    joined = parts[0] + " and " + parts[1] if len(parts) == 2 else (
        ", ".join(parts[:-1]) + " and " + parts[-1])
    return f"On the line between {joined}"


def place_on_lines(near: list[tuple[str, float]], published: list[str], built,
                   reg: dict[str, dict]) -> dict:
    """Which built districts list an address, and the note when it is on a line.

    near: every district within BOUNDARY_FT of the address's City point, [(slug, ft)] (empty
    when the address has no City point). published: the built districts its records were
    placed in by their own points, most records first (the data as published). Returns
    {"listed_in": built slugs, records' districts first; "line": every district on the line,
    built or not, by number ([] when not on a line); "note": line_note() or None}."""
    listed = list(dict.fromkeys(published))
    listed += [s for s, _ in near if s in built and s not in listed]
    line = sorted({s for s, _ in near}, key=lambda s: reg[s]["boro_cd"]) if len(near) > 1 else []
    return {"listed_in": listed, "line": line, "note": line_note(line, reg) if line else None}
