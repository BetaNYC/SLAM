"""Match NYC addresses to a building (BIN), tax lot (BBL) and point with the City's own
address file, in DuckDB, without calling a geocoding service (BetaNYC/SLAM#86).

The file is the one NYC Planning Labs' GeoSearch is built from: DCP's Property Address
Directory (PAD) expanded into one row per address, with every Street Name Dictionary variant,
by `NYCPlanning/labs-geosearch-pad-normalize`. Its URL is the CSV importer's source in
`NYCPlanning/labs-geosearch-docker/pelias.json` (read 2026-11-05). Columns:
name, source, number, street, zipcode, lon, lat, addendum_json_pad ({"bbl", "bin", "version"}).

Tested 2026-11-05 (BetaNYC workspace `team/reference/nyc-address-matching.md`): same BIN as
GeoSearch for 1,136 of 1,136 pilot addresses; citywide 97.4% of DOHMH restaurants matched with
BIN agreeing 99.4%. What it cannot match is messy address text, so `candidates` below turns
one address into the readings worth trying, each tagged with the rule that produced it.
"""
from __future__ import annotations

import json
import re
import urllib.request
from pathlib import Path

import duckdb

from .net import USER_AGENT
from .transform import _street_part, real_bin

PAD_URL = ("https://planninglabs.nyc3.digitaloceanspaces.com/geosearch-data/latest/"
           "labs-geosearch-pad-normalized.csv")
BORO_DIGIT = {"MANHATTAN": "1", "NEW YORK": "1", "BRONX": "2", "BROOKLYN": "3", "KINGS": "3",
              "QUEENS": "4", "STATEN ISLAND": "5", "RICHMOND": "5"}

# Street words the shared normalizer (transform._SUFFIX) does not fold, seen in SLA, DOHMH and
# 311 address text that failed to match on 2026-11-05. Applied to both sides.
_EXTRA = {
    "EXPWY": "EXPY", "EXPRESSWY": "EXPY", "EXP": "EXPY", "EXPRESS": "EXPY",
    "TPKE": "TPKE", "TURNPIKE": "TPKE", "TNPK": "TPKE", "TPK": "TPKE",
    "PKY": "PKWY", "PARKWY": "PKWY", "PKWAY": "PKWY", "PWKY": "PKWY",
    "BLV": "BLVD", "BL": "BLVD", "BOULEVRD": "BLVD", "BOUL": "BLVD",
    "AVNUE": "AVE", "AVENU": "AVE", "AVEN": "AVE", "AVE.": "AVE",
    "STREEET": "ST", "STRET": "ST", "STEET": "ST",
    "PLC": "PL", "PLZA": "PLZ", "PLAZ": "PLZ", "SQR": "SQ", "TERR": "TER", "TERRACE": "TER",
    "CRT": "CT", "CRES": "CRES", "CRESCENT": "CRES", "CIR": "CIR", "CIRCLE": "CIR",
    "LA": "LN", "HWY": "HWY", "HIGHWY": "HWY", "RD.": "RD", "DRV": "DR", "WY": "WAY",
    "SO": "S", "NO": "N",
    "SAINT": "ST", "FT": "FORT", "MT": "MOUNT",
    "EXTENSION": "EXT", "EXTN": "EXT",
    # Misspellings seen in SLA leftovers, 2026-11-05 (#95).
    "HGWY": "HWY", "HIGWAY": "HWY", "PKW": "PKWY", "PRKWY": "PKWY", "AVEUE": "AVE", "AVENE": "AVE",
    "AVNEUE": "AVE", "BOULEARD": "BLVD", "BOULVARD": "BLVD", "BLVRD": "BLVD", "STEET": "ST",
}
# Extra folding for place names (PAD's named places with no house number, e.g. "JFK
# INTERNATIONAL ARPRT", "TAVERN ON THE GREEN"). Applied to both sides.
_PLACE = {"AIRPORT": "ARPRT", "ARPT": "ARPRT", "AIRPRT": "ARPRT", "INT'L": "INTERNATIONAL",
          "INTL": "INTERNATIONAL", "TERM": "TERMINAL", "CTR": "CENTER", "CNTR": "CENTER",
          "LAGUARDIA": "LA GUARDIA", "UNIV": "UNIVERSITY", "PK": "PARK", "THE": ""}
_BARE_TYPES = {"ST", "AVE", "BLVD", "PL", "RD", "DR", "LN", "PLZ", "PKWY", "SQ", "TER", "CT",
               "HWY", "EXPY", "TPKE", "WAY", "CIR", "CRES", "N", "S", "E", "W"}
_WORDNUM = {"ONE": "1", "TWO": "2", "THREE": "3", "FOUR": "4", "FIVE": "5", "SIX": "6",
            "SEVEN": "7", "EIGHT": "8", "NINE": "9", "TEN": "10", "ELEVEN": "11", "TWELVE": "12"}
_ORDWORD = {"FIRST": "1", "SECOND": "2", "THIRD": "3", "FOURTH": "4", "FIFTH": "5", "SIXTH": "6",
            "SEVENTH": "7", "EIGHTH": "8", "NINTH": "9", "TENTH": "10", "ELEVENTH": "11",
            "TWELFTH": "12"}


def street_key(street: str) -> str:
    """Street part of an address (house number removed), folded for matching. Used on both the
    City's file and the incoming text, so the two always agree."""
    s = _street_part("0 " + (street or ""))
    out = []
    for tok in s.split(" "):
        tok = _EXTRA.get(tok, tok)
        tok = _ORDWORD.get(tok, tok)
        out.append(tok)
    s = " ".join(out)
    s = re.sub(r"\bAVE OF THE AMERICAS\b", "6 AVE", s)
    return re.sub(r"\s+", " ", s).strip()


def place_key(name: str) -> str:
    s = re.sub(r"[^A-Z0-9' ]", " ", (name or "").upper())
    toks = [_PLACE.get(t, t) for t in s.split()]
    return re.sub(r"\s+", " ", " ".join(t for t in toks if t)).strip()


def _num(s: str) -> str:
    return re.sub(r"\s+", " ", s.upper().strip())


def candidates(text: str | None, boro: str) -> list[tuple[str, str, str]]:
    """Readings of one address worth looking up, best first: (house number, street key, rule).
    `boro` is the borough digit ('1'..'5'). Pure function; see tests for the patterns."""
    raw = re.sub(r"\s+", " ", (text or "").upper()).strip()
    if not raw:
        return []
    out: list[tuple[str, str, str]] = []
    seen = set()

    def add(num: str, street: str, rule: str):
        num, sk = _num(num), street_key(street)
        # A street key must name a street, not just a type: "AVE" alone means the reading
        # split a numbered avenue ("365 5 AVENUE") as if it were a range.
        if sk in _BARE_TYPES:
            return
        if num and sk and (num, sk) not in seen:
            seen.add((num, sk))
            out.append((num, sk, rule))

    # Floor text with its number: "50 HUDSON YARDS 7TH FL" -> "50 HUDSON YARDS" (#95).
    raw = re.sub(r"\s+\d+(?:ST|ND|RD|TH)?(?:\s*(?:AND|&|-|,)\s*\d+(?:ST|ND|RD|TH)?)*"
                 r"\s+(?:FL|FLR|FLRS|FLOOR|FLOORS)\b.*$", "", raw)
    # A bare floor number left at the end: "25 BROADWAY 9TH", "32 OLD SLIP 2ND".
    raw = re.sub(r"(?<=[A-Z]{2})\s+\d+(?:ST|ND|RD|TH)$", "", raw)
    # AKA written without spaces: "120 BROADWAY A/K/A15 NASSAU ST", "AKA251VESEYST".
    raw = re.sub(r"\s*(A/K/A|AKA)(?=\d)", r" \1 ", raw)
    texts = [(raw, "as written")]
    # Trailing text after " - ", "(", "#": "1185 BROADWAY- ZAYTINYA", "210 W 55 ST (ENTIRE BLDG)".
    cut = re.split(r"\s*-\s+(?=[A-Z])|\s+-\s*|(?<=[A-Z]{2})-(?=[A-Z]{3})|\s*\(|\s+#", raw)[0].strip()
    if cut and cut != raw:
        texts.append((cut, "trailing text removed"))
    # A corner or place note after " AT ", " BETWEEN ", or a slash that is not a fraction:
    # "80 COLUMBUS CIRCLE AT 60TH ST", "89 EAST 42ND ST/MAIN CONCOURSE" (#95).
    cut2 = re.split(r"\s+(?:AT|BETWEEN|BTWN|BET|CORNER OF|COR)\s+|(?<!\d)/|/(?!\d)", raw)[0].strip()
    if cut2 and cut2 != raw and re.match(r"^\d", cut2):
        texts.append((cut2, "text after AT or a slash removed"))
    # Unit text after a comma or a dash: "55-48 METROPOLITAN AVE, 1ST FL".
    if "," in raw:
        texts.append((raw.split(",")[0].strip(), "text before the comma"))
    # AKA: try each side. "335 BOWERY AKA 4 E 3RD ST".
    aka = re.split(r"\s+(?:AKA|A/K/A|A K A)\s+|\s*/\s*AKA\s*", raw)
    if len(aka) > 1:
        texts.append((aka[0].strip(), "address before AKA"))
        texts += [(part.strip(), "AKA address") for part in aka[1:]]
    # Two addresses joined with AND / &: try each when both start with a number.
    m = re.match(r"^(\d.*?)\s+(?:AND|&)\s+(\d.*)$", raw)
    if m:
        texts += [(m.group(1), "first of two addresses"), (m.group(2), "second of two addresses")]

    for t, base_rule in texts:
        t = re.sub(r"^(" + "|".join(_WORDNUM) + r")\b", lambda m: _WORDNUM[m.group(1)], t)
        t = re.sub(r"^NO\.?\s*(?=\d)", "", t)                       # "NO. 12 MAIN ST"
        # The address as written always comes first: "365 5 AVENUE" is 365 Fifth Avenue.
        m0 = re.match(r"^(\d+(?:-\d+)?[A-Z]?)\s+(.*)$", t)
        if m0:
            add(m0.group(1), m0.group(2), base_rule)
        # Other readings of the house number, most specific first.
        pats = [
            # A Queens number with a range on the end: 29-12-14 23RD AVE -> 29-12 (#95)
            (r"^(\d{1,3}-\d{1,3})-\d{1,3}\s+(.*)$",
             lambda m: [(m.group(1), m.group(2), "first of a hyphenated range")]),
            # A letter written apart: 92-15 B 37TH AVE -> 92-15B, then 92-15 (#95)
            (r"^(\d{1,3}-\d{1,3})\s+([A-Z])\s+(?=\S*\d|[A-Z]{2})(.*)$",
             lambda m: [(m.group(1) + m.group(2), m.group(3), "letter written apart"),
                        (m.group(1), m.group(3), "letter written apart")]),
            # Three numbers: Queens 136 20 30 ROOSEVELT -> 136-20; elsewhere a range,
            # 446 448 450 HUDSON ST -> 446 (#95)
            # (The third number must not be a numbered street: "126 12 101 AVE" is 126-12 101 Ave.)
            (r"^(\d{1,3})\s+(\d{1,3}[A-Z]?)\s+\d{1,3}[A-Z]?\s+"
             r"(?!(?:AVE|AVENUE|ST|STREET|RD|ROAD|PL|PLACE|DR|DRIVE|LN|LANE|CT|COURT|TER|TERRACE|BLVD|BOULEVARD)\b)"
             r"(?=\D|\d+(?:ST|ND|RD|TH)\b)(.*)$",
             lambda m: ([(f"{m.group(1)}-{m.group(2)}", m.group(3), "Queens number without the hyphen")]
                        if boro == "4" else [])
                       + [(m.group(1), m.group(3), "first number of a range")]),
            # Queens: two numbers then a numbered street: 126 12 101 AVE -> 126-12 101 AVE
            (r"^(\d{1,3})\s+(\d{1,3}[A-Z]?)\s+(\d+(?:ST|ND|RD|TH)?\s+[A-Z].*)$" if boro == "4" else r"(?!)",
             lambda m: [(f"{m.group(1)}-{m.group(2)}", m.group(3), "Queens number without the hyphen")]),
            (r"^(\d{2,5})(?:\s+\d{2,5}){2,}\s+(.*)$",
             lambda m: [(m.group(1), m.group(2), "first number of a range")]),
            # A letter written apart from a plain number: 169 B GARDNER AVENUE -> 169B, 169
            (r"^(\d+)\s+([A-Z])\s+(?=[A-Z]{2}|\d+(?:ST|ND|RD|TH)\b)(.*)$",
             lambda m: [(m.group(1) + m.group(2), m.group(3), "letter written apart"),
                        (m.group(1), m.group(3), "letter written apart")]),
            # A repeated Queens range: 47-31 47-33 JUNCTION BLVD -> 47-31
            (r"^(\d{1,3}-\d{1,3}[A-Z]?)\s+\d{1,3}-\d{1,3}[A-Z]?\s+(.*)$",
             lambda m: [(m.group(1), m.group(2), "first of two Queens numbers")]),
            # Queens hyphenated number written with a hyphen, optional letter: 104-30, 135-26A
            (r"^(\d{1,3})-(\d{1,3})([A-Z]?)\s+(.*)$",
             lambda m: [(f"{m.group(1)}-{m.group(2)}{m.group(3)}", m.group(4), "")]
                       + ([(f"{m.group(1)}-{m.group(2)}", m.group(4), "number without its letter")]
                          if m.group(3) else [])
                       + ([(m.group(1) + m.group(2) + m.group(3), m.group(4), "hyphen removed outside Queens"),
                           (m.group(1), m.group(4), "first number of a range"),
                           (m.group(2), m.group(4), "second number of a range")] if boro != "4" else [])),
            # Fractions: 216 1/2 GREENE AVE (the file has "216 1/2"), else the whole number
            (r"^(\d+)\s+(1/2)\s+(.*)$", lambda m: [(m.group(1) + " 1/2", m.group(3), "half number"),
                                                    (m.group(1), m.group(3), "half number as whole")]),
            # Ranges with a hyphen or slash: 113-117 W 24 ST / 64-54/56 DRY HARBOR RD
            (r"^(\d{1,3}-\d{1,3})/\d+\s+(.*)$", lambda m: [(m.group(1), m.group(2), "first of a slash range")]),
            (r"^(\d+[A-Z]?)\s*[-/]\s*(\d+[A-Z]?)\s+(.*)$",
             lambda m: [(m.group(1), m.group(3), "first number of a range"),
                        (m.group(2), m.group(3), "second number of a range")]),
            # Two numbers with a space: in Queens a hyphenated number (104 30 -> 104-30),
            # elsewhere a range (237 243 AVENUE U -> 237).
            (r"^(\d{1,3})\s+(\d{1,3}[A-Z]?)\s+(.*)$",
             lambda m: ([(m.group(1) + "-" + m.group(2), m.group(3), "Queens number without the hyphen"),
                         (m.group(1) + "-" + re.sub(r"[A-Z]$", "", m.group(2)), m.group(3),
                          "Queens number without the hyphen")]
                        if boro == "4" else [])
                       + [(m.group(1), m.group(3), "first number of a range"),
                          (m.group(2), m.group(3), "second number of a range")]),
            (r"^(\d+[A-Z]?)\s+(\d+[A-Z]?)\s+(.*)$",
             lambda m: [(m.group(1), m.group(3), "first number of a range"),
                        (m.group(2), m.group(3), "second number of a range")]),
            # Plain number with an optional letter: 238A SHERMAN AVE; also try without the letter.
            (r"^(\d+)([A-Z])\s+(.*)$", lambda m: [(m.group(1) + m.group(2), m.group(3), ""),
                                                   (m.group(1), m.group(3), "number without its letter")]),
            (r"^(\d+)\s+(.*)$", lambda m: [(m.group(1), m.group(2), "")]),
        ]
        for pat, fn in pats:
            m = re.match(pat, t)
            if m:
                for num, street, rule in fn(m):
                    add(num, street, rule or base_rule)
                break
    # Last resort: cut the street right after its last street-type word, dropping trailing words
    # ("233 BUTLER ST GROUND FL EAST" -> "233 BUTLER ST"). Only after every other reading.
    for num, sk, rule in list(out):
        toks = sk.split()
        idx = [i for i, t in enumerate(toks) if t in _BARE_TYPES - {"N", "S", "E", "W"} and i > 0]
        # Try the first street-type word first ("LINDEN BLVD ST 3" -> "LINDEN BLVD"), then the last.
        for i in dict.fromkeys(idx[:1] + idx[-1:]):
            if i < len(toks) - 1:
                short = " ".join(toks[: i + 1])
                if (num, short) not in seen:
                    seen.add((num, short))
                    out.append((num, short, "words after the street type removed"))
    return out


# Readings that can land on the wrong building (a range read the wrong way, a place name, a
# borough taken from the ZIP, words cut off the end). When the record has its own map point,
# a match from one of these must be within RISKY_MAX_FT of it, or it is skipped. Measured
# 2026-11-05 on SLA licenses: "21 37 BROADWAY" (21-37 Broadway, Queens) read as a range
# matched 21 Broadway, Manhattan, 44,844 ft from SLA's point.
RISKY_RULES = ("first number of a range", "second number of a range", "first of a slash range",
               "hyphen removed outside Queens", "nearest listed house number", "street name completed",
               "named place", "borough from the ZIP", "words after the street type removed",
               "first of two addresses", "second of two addresses")
RISKY_MAX_FT = 1000
NEAREST_NUMBER_MAX = 6  # house numbers; same side of the street (same parity)


def feet_between(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Great-circle distance in feet between two (lon, lat) points."""
    import math
    r = 20902231.0
    lo1, la1, lo2, la2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def _risky(rule: str) -> bool:
    return any(k in rule for k in RISKY_RULES)


class PadIndex:
    """The City's address file, loaded once, ready to look up (house number, street key, borough)."""

    def __init__(self, parquet: Path):
        self.con = duckdb.connect()
        self.con.execute(f"CREATE TABLE pad AS SELECT * FROM read_parquet('{parquet}')")
        streets = [r[0] for r in self.con.execute("SELECT DISTINCT street FROM pad").fetchall()]
        self.con.execute("CREATE TABLE smap (street VARCHAR, sk VARCHAR)")
        self.con.executemany("INSERT INTO smap VALUES (?, ?)", [[s, street_key(s)] for s in streets])
        self.con.execute("""CREATE TABLE padk AS
            SELECT p.num, m.sk, replace(m.sk, ' ', '') AS skn, substr(p.bbl, 1, 1) AS b, p.bin, p.bbl,
                   p.zipcode, p.lon, p.lat, p.street
            FROM pad p JOIN smap m USING (street)""")
        self.con.execute("CREATE INDEX padk_ix ON padk (num, sk, b)")
        self.con.execute("CREATE INDEX padk_skn ON padk (num, skn, b)")
        # Each ZIP's borough: the borough most of its addresses are in (#95).
        self.zip_boro = dict(self.con.execute("""
            SELECT zipcode, arg_max(b, n) FROM (SELECT zipcode, b, count(*) AS n FROM padk GROUP BY 1, 2)
            GROUP BY 1""").fetchall())
        places = parquet.with_name("places.parquet")
        self.con.execute("CREATE TABLE places (pk VARCHAR, b VARCHAR, name VARCHAR, bin VARCHAR, bbl VARCHAR, zipcode VARCHAR, lon DOUBLE, lat DOUBLE)")
        if places.exists():
            rows = self.con.execute(f"SELECT name, substr(bbl,1,1), bin, bbl, zipcode, lon, lat FROM read_parquet('{places}')").fetchall()
            self.con.executemany("INSERT INTO places VALUES (?,?,?,?,?,?,?,?)",
                                 [[place_key(r[0]), *r[1:2], r[0], *r[2:]] for r in rows])
            self.con.execute("CREATE INDEX places_ix ON places (pk, b)")
        self.version = (self.con.execute("SELECT max(version) FROM pad").fetchone() or [None])[0]
        self.rows = self.con.execute("SELECT count(*) FROM pad").fetchone()[0]

    def lookup(self, text: str | None, boro: str, zipcode: str | None = None,
               near: tuple[float, float] | None = None) -> dict | None:
        """First reading in `candidates` order that the file knows, in the given borough. Then,
        if a ZIP is given, the same readings in any borough with that ZIP (sources sometimes
        file an address under a neighboring county). Then PAD's named places. With several rows,
        prefer the given ZIP, then a real BIN, then the lowest BIN, so the answer never depends
        on row order. `near` is the record's own (lon, lat), if it has one: a risky reading
        (RISKY_RULES) must land within RISKY_MAX_FT of it. Returns None when nothing matches."""
        def ok(hit: dict | None) -> bool:
            if not hit:
                return False
            if not _risky(hit["rule"]):
                return True
            # A risky reading must agree with something the record says about itself: its own
            # point within RISKY_MAX_FT, or (when a source's point is unreliable, as data.ny.gov's
            # is for odd address text) the same ZIP. With neither to check, it is accepted. The
            # nearest-number rule always needs the point (#95).
            if near and feet_between(near, (hit["lon"], hit["lat"])) <= RISKY_MAX_FT:
                return True
            if "nearest listed house number" in hit["rule"] or "leading words only" in hit["rule"]:
                return False
            if re.fullmatch(r"\d{5}", z):
                return hit.get("zip") == z
            return not near

        cands = candidates(text, boro)
        z = (zipcode or "")[:5]
        for num, sk, rule in cands:
            rows = self.con.execute(
                "SELECT bin, bbl, zipcode, lon, lat, street FROM padk WHERE num = ? AND sk = ? AND b = ?",
                [num, sk, boro]).fetchall()
            if rows and ok(hit := self._hit(num, rows, z, rule)):
                return hit
        # The street written as one word or two: "CROSSBAY BLVD" / "CROSS BAY BOULEVARD" (#95).
        for num, sk, rule in cands:
            rows = self.con.execute(
                "SELECT bin, bbl, zipcode, lon, lat, street FROM padk WHERE num = ? AND skn = ? AND b = ?",
                [num, sk.replace(" ", ""), boro]).fetchall()
            if rows and ok(hit := self._hit(num, rows, z, f"{rule}; street spacing ignored")):
                return hit
        if re.fullmatch(r"\d{5}", z):
            # The ZIP's own borough, with that borough's readings (a Queens number filed under
            # Kings gets the Queens hyphen reading), then any borough with that ZIP.
            zb = self.zip_boro.get(z)
            if zb and zb != boro:
                for num, sk, rule in candidates(text, zb):
                    rows = self.con.execute(
                        "SELECT bin, bbl, zipcode, lon, lat, street FROM padk WHERE num = ? AND sk = ? AND b = ?",
                        [num, sk, zb]).fetchall()
                    if rows and ok(hit := self._hit(num, rows, z, f"{rule}; borough from the ZIP")):
                        return hit
            for num, sk, rule in cands:
                rows = self.con.execute(
                    "SELECT bin, bbl, zipcode, lon, lat, street FROM padk WHERE num = ? AND sk = ? AND zipcode = ?",
                    [num, sk, z]).fetchall()
                if rows and ok(hit := self._hit(num, rows, z, f"{rule}; borough from the ZIP")):
                    return hit
        # A street name missing its ending: "2269 ADAM CLAYTON POWELL" -> the one street in this
        # borough whose name starts that way and has that number (#95).
        for num, sk, rule in cands[:3]:
            if len(sk) < 4:  # too short to complete safely ("E", "AVE U")
                continue
            rows = self.con.execute(
                "SELECT bin, bbl, zipcode, lon, lat, street, sk FROM padk WHERE num = ? AND b = ? AND sk LIKE ?",
                [num, boro, sk + " %"]).fetchall()
            if not rows and len(sk) >= 5 and " " not in sk:  # a cut-off name: "381 BROADW"
                rows = self.con.execute(
                    "SELECT bin, bbl, zipcode, lon, lat, street, sk FROM padk WHERE num = ? AND b = ? AND sk LIKE ?",
                    [num, boro, sk + "%"]).fetchall()
            if rows and len({r[6] for r in rows}) == 1:
                if ok(hit := self._hit(num, [r[:6] for r in rows], z, f"{rule}; street name completed")):
                    return hit
        hit = self.place(text, boro, z)
        if ok(hit):
            return hit
        return self.nearest_number(cands, boro, z, near)

    def nearest_number(self, cands, boro: str, z: str, near) -> dict | None:
        """Last resort, point only: a house number the City does not list (311 "804 E TREMONT
        AVE", between 803 and 805) gets the nearest listed number on the same side of the same
        street, at most NEAREST_NUMBER_MAX away. It returns no BIN or BBL, because the record may
        be a different building, and it needs the record's own point to agree (RISKY_MAX_FT)."""
        if not near or not cands:
            return None
        num, sk, rule = cands[0]
        if not re.fullmatch(r"\d+", num):
            return None
        n = int(num)
        rows = self.con.execute(
            """SELECT num, lon, lat, zipcode, street FROM padk
               WHERE sk = ? AND b = ? AND regexp_full_match(num, '\\d+')
                 AND abs(CAST(num AS INTEGER) - ?) BETWEEN 1 AND ? AND CAST(num AS INTEGER) % 2 = ? % 2""",
            [sk, boro, n, NEAREST_NUMBER_MAX, n]).fetchall()
        if not rows:
            return None
        rows.sort(key=lambda r: (abs(int(r[0]) - n), r[3] != z, int(r[0])))
        rn, lon, lat, zz, street = rows[0]
        if feet_between(near, (lon, lat)) > RISKY_MAX_FT:
            return None
        return {"status": "matched", "source": "pad", "bin": None, "bbl": None, "zip": zz,
                "lon": float(lon), "lat": float(lat), "label": f"{num} {street} (near {rn})",
                "confidence": 0.5, "rule": "nearest listed house number (point only)", "bins": []}

    def place(self, text: str | None, boro: str, z: str = "") -> dict | None:
        """PAD's named places: the longest leading run of words (at least two) that names a
        place in this borough, e.g. "LAGUARDIA AIRPORT TERMINAL B" -> "LA GUARDIA ARPRT"."""
        raw = re.sub(r"^\d+[A-Z]?\s+", "", re.split(r",", (text or "").upper())[0])
        toks = place_key(raw).split()
        for n in range(len(toks), 1, -1):
            rows = self.con.execute("SELECT bin, bbl, zipcode, lon, lat, name FROM places WHERE pk = ? AND b = ?",
                                    [" ".join(toks[:n]), boro]).fetchall()
            if rows:
                rows.sort(key=lambda r: (r[2] != z, real_bin(r[0]) is None, r[0] or ""))
                b, bbl, zz, lon, lat, name = rows[0]
                rule = "named place" if n == len(toks) else "named place (leading words only)"
                return {"status": "matched", "source": "pad", "bin": real_bin(b), "bbl": bbl, "zip": zz,
                        "lon": float(lon), "lat": float(lat), "label": name, "confidence": 1.0,
                        "rule": rule, "bins": sorted({r[0] for r in rows if real_bin(r[0])})}
        return None

    def _hit(self, num: str, rows: list, z: str, rule: str) -> dict:
        rows.sort(key=lambda r: (r[2] != z, real_bin(r[0]) is None, r[0] or ""))
        b, bbl, zz, lon, lat, street = rows[0]
        return {"status": "matched", "source": "pad", "bin": real_bin(b), "bbl": bbl,
                "zip": zz, "lon": float(lon), "lat": float(lat), "label": f"{num} {street}",
                "confidence": 1.0, "rule": rule, "bins": sorted({r[0] for r in rows if real_bin(r[0])})}


def ensure_pad(cache_dir: Path, offline: bool, log=None) -> Path | None:
    """The City's file as Parquet in `cache_dir`, refreshed when the file's ETag changes.
    Offline: use the cached copy if there is one. Returns None if there is none to use."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    pq, meta_p = cache_dir / "pad.parquet", cache_dir / "pad.json"
    meta = json.loads(meta_p.read_text()) if meta_p.exists() else {}
    if offline:
        return pq if pq.exists() else None
    req = urllib.request.Request(PAD_URL, method="HEAD", headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as r:
        etag, modified = r.headers.get("ETag"), r.headers.get("Last-Modified")
    if pq.exists() and meta.get("etag") == etag:
        return pq
    csv = cache_dir / "pad.csv.part"
    req = urllib.request.Request(PAD_URL, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=600) as r, open(csv, "wb") as f:
        while chunk := r.read(1 << 20):
            f.write(chunk)
    con = duckdb.connect()
    con.execute(f"""COPY (
        SELECT upper(trim(number)) AS num, upper(trim(street)) AS street, zipcode,
               lon::DOUBLE AS lon, lat::DOUBLE AS lat,
               json_extract_string(addendum_json_pad, '$.bin') AS bin,
               json_extract_string(addendum_json_pad, '$.bbl') AS bbl,
               json_extract_string(addendum_json_pad, '$.version') AS version
        FROM read_csv('{csv}', all_varchar = true) WHERE number IS NOT NULL AND number <> ''
    ) TO '{pq}' (FORMAT parquet)""")
    con.execute(f"""COPY (
        SELECT upper(trim(name)) AS name, zipcode, lon::DOUBLE AS lon, lat::DOUBLE AS lat,
               json_extract_string(addendum_json_pad, '$.bin') AS bin,
               json_extract_string(addendum_json_pad, '$.bbl') AS bbl
        FROM read_csv('{csv}', all_varchar = true)
        WHERE (number IS NULL OR number = '') AND name IS NOT NULL AND name <> ''
    ) TO '{pq.with_name("places.parquet")}' (FORMAT parquet)""")
    csv.unlink()  # the 709 MB download this function made; the Parquet copies replace it
    meta = {"url": PAD_URL, "etag": etag, "last_modified": modified}
    meta_p.write_text(json.dumps(meta, indent=1))
    if log:
        log("pad_downloaded", last_modified=modified)
    return pq
