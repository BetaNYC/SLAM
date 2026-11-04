"""Source definitions for the SLAM v2 prototype pipeline.

Every dataset id and field name below was read from the portal's own
metadata endpoint, `https://<domain>/api/views/<id>.json` (`columns[].fieldName`),
on 2026-11-04. Recorded copies of those column lists live in
`tests/fixtures/views_<id>.json`, and `check.py` re-verifies them on every run.

Query language: Socrata SoQL, https://dev.socrata.com/docs/queries/
  - `$select`, `$where`, `$order`, `$limit`, `$offset`. Paging: `$offset` with `$limit`
    (https://dev.socrata.com/docs/queries/offset.html) and an explicit `$order`, because
    results are not implicitly ordered (https://dev.socrata.com/docs/queries/order.html).
    (The older docs/paging.html page now returns "You look lost", checked 2026-11-04.)
"""

from __future__ import annotations

from dataclasses import dataclass, field

NYC = "data.cityofnewyork.us"
NYS = "data.ny.gov"

# The two prototype districts. `boro_cd` is the field on NYC 5crt-au7u.
DISTRICTS = {
    "mn-cd1": {"boro_cd": 101, "label": "Manhattan Community District 1", "short": "MN CD 1",
               "borough": "Manhattan", "cb": 1},
    "bk-cd4": {"boro_cd": 304, "label": "Brooklyn Community District 4", "short": "BK CD 4",
               "borough": "Brooklyn", "cb": 4},
}

DISTRICT_SOURCE = {
    "key": "districts",
    "domain": NYC,
    "id": "5crt-au7u",
    "fields": ["boro_cd", "the_geom"],
}

COUNTIES = "('New York','Kings')"  # SLA / OCM spell counties this way (checked via $group)

# ---- 311 complaints (NYC erm2-nwe9, "311 Service Requests from 2020 to Present")
# One line to change the window. created_date is a floating timestamp; SoQL compares it
# to an ISO date string. 2010-2019 is a separate dataset (76ig-c548), not used here.
COMPLAINTS_311_START = "2024-01-01"
# location_type values that mean a bar, club or restaurant (exact strings, checked via $group).
COMPLAINTS_311_LOCATION_TYPES = ("Club/Bar/Restaurant", "Restaurant/Bar/Deli/Bakery")
# 311's own community_board text ("01 MANHATTAN"), used only to keep the pull small.
# Districts are still assigned by point-in-polygon, like every other layer.
COMPLAINTS_311_BOARDS = tuple(f"{d['cb']:02d} {d['borough'].upper()}" for d in DISTRICTS.values())


# ---- schools and houses of worship (#60)
# FacDB ji82-xba5 school categories, read from the dataset's own data dictionary
# (facilities_data_dictionary.xlsx, sheet "Categorization", attached to the dataset; recorded
# 2026-11-04) and confirmed with $group over cd in (101,304). Group "SCHOOLS (K-12)"; its
# subgroup "GED AND ALTERNATIVE HIGH SCHOOL EQUIVALENCY" is programs, not schools, so it is left
# out. Day care, pre-K, colleges, after-school and proprietary schools are other groups and are
# not pulled. FacDB has no house-of-worship category at all (checked in the same sheet).
SCHOOL_FACGROUP = "SCHOOLS (K-12)"
SCHOOL_SUBGROUPS = ("PUBLIC K-12 SCHOOLS", "CHARTER K-12 SCHOOLS", "NON-PUBLIC K-12 SCHOOLS",
                    "PUBLIC AND PRIVATE SPECIAL EDUCATION SCHOOLS")
# PLUTO 64uk-42ks building classes for houses of worship, as v1 used (M1-M4, M9). Labels are
# PLUTO's own data dictionary (pluto_datadictionary.pdf, August 2026, 26v2, class "M. CHURCHES,
# SYNAGOGUES, ETC.").
WORSHIP_CLASSES = {"M1": "Church, Synagogue, Chapel", "M2": "Mission House (Non-Residential)",
                   "M3": "Parsonage, Rectory", "M4": "Convents",
                   "M9": "Miscellaneous (churches, synagogues, etc.)"}

# DOHMH 43nn-pn8j community_board text for the two districts ('101', '304').
RESTAURANT_BOARDS = tuple(str(d["boro_cd"]) for d in DISTRICTS.values())


def _sql_list(values) -> str:
    return "(" + ",".join("'" + v.replace("'", "''") + "'" for v in values) + ")"


@dataclass(frozen=True)
class Source:
    key: str
    domain: str
    id: str
    title: str
    fields: list[str]
    where: str
    order: str
    has_point: str | None = None  # name of a Socrata `point` column, if any
    lat_lon: tuple[str, str] | None = None  # separate numeric lat/lon columns
    page_size: int = 50000
    # (latitude field, longitude field): build.py ANDs a bounding box around the two
    # districts, widened by SW_BUFFER_FT, onto `where` (sources with no district field).
    bbox: tuple[str, str] | None = None
    notes: str = ""
    extra: dict = field(default_factory=dict)

    @property
    def dataset_url(self) -> str:
        return f"https://{self.domain}/d/{self.id}"


SOURCES: list[Source] = [
    Source(
        key="liquor_pending",
        domain=NYS,
        id="f8i8-k2gm",
        title="SLA Pending Licenses",
        fields=["application_id", "premises_county", "type", "class", "description", "legalname",
                "dba", "actual_address_of_premises", "additional_address_information", "city",
                "state_name", "zip_code", "received_date", "status", "aka_address", "georeference"],
        where=f"premises_county in {COUNTIES}",
        order="application_id",
        has_point="georeference",
    ),
    Source(
        key="liquor_active",
        domain=NYS,
        id="9s3h-dpkz",
        title="SLA Active Licenses",
        fields=["licensepermitid", "premisescounty", "type", "class", "description", "legalname",
                "dba", "actualaddressofpremises", "additionaladdressinformation", "city",
                "statename", "zipcode", "originalissuedate", "lastissuedate", "effectivedate",
                "expirationdate", "parentlicenseid", "legacyserialnumber", "akaaddress",
                "georeference"],
        where=f"premisescounty in {COUNTIES}",
        order="licensepermitid",
        has_point="georeference",
    ),
    Source(
        key="liquor_inactive",
        domain=NYS,
        id="6dg3-2z7i",
        title="SLA Inactive Licenses",
        # Columns read from https://data.ny.gov/api/views/6dg3-2z7i.json on 2026-11-04.
        fields=["license_permit_id", "premises_county", "type", "class", "description", "legalname",
                "dba", "actual_address_of_premises", "additional_address_information", "city",
                "state_name", "zip_code", "original_issue_date", "last_issue_date",
                "effective_date", "expiration_date", "legacy_serial_number", "aka_address",
                "georeference"],
        where=f"premises_county in {COUNTIES}",
        order="license_permit_id",
        has_point="georeference",
    ),
    Source(
        key="cannabis_retail",
        domain=NYS,
        id="gttd-5u6y",
        title="NYS Registered Retail Dealers of Adult-use Cannabis Products",
        fields=["external_tpid", "legal_name", "dba_name", "ocm_license_number", "physical_county",
                "physical_address", "physical_city", "physical_state", "physical_zip",
                "georeference"],
        # This dataset spells counties in upper case (checked via $group on physical_county).
        where="physical_county in ('NEW YORK','KINGS')",
        order="external_tpid",
        has_point="georeference",
    ),
    Source(
        key="cannabis_license",
        domain=NYS,
        id="jskf-tt3q",
        title="Current OCM Licenses",
        # primary_contact_name exists in the dataset and is deliberately NOT selected
        # (personal data; prototype keeps business fields only).
        fields=["license_number", "application_number", "license_type", "license_status", "issued_date",
                "effective_date", "expiration_date", "entity_name", "dba", "address_line_1",
                "address_line_2", "city", "zip_code", "county", "operational_status"],
        where=f"county in {COUNTIES}",
        order="license_number",
        notes="No coordinates in source; geocoded with NYC GeoSearch v2.",
    ),
    Source(
        key="dining_out",
        domain=NYC,
        id="fpeh-f7ci",
        title="Dining Out NYC Locations",
        fields=["business_legal_name", "assumed_name_s", "street", "city", "borough", "postcode",
                "license_type", "license_status", "license_issue_date", "license_expiration_date",
                "latitude", "longitude", "council_district", "community_board", "bin", "bbl",
                "ct2020", "nta2020", "location"],
        where="community_board in (101,304)",
        order="business_legal_name",
        lat_lon=("latitude", "longitude"),
    ),
    Source(
        key="street_events",
        domain=NYC,
        id="tvpp-9vvx",
        title="NYC Permitted Event Information",
        fields=["event_id", "event_name", "start_date_time", "end_date_time", "event_agency",
                "event_type", "event_borough", "event_location", "event_street_side",
                "street_closure_type", "community_board", "police_precinct", "cemsid"],
        where="event_borough in ('Manhattan','Brooklyn')",
        order="event_id",
        notes="No coordinates; community_board is a comma list like '01,' or '04, 05,'.",
    ),
    Source(
        key="complaints_311",
        domain=NYC,
        id="erm2-nwe9",
        title="311 Service Requests from 2020 to Present",
        # Only fields that are displayed, plus community_board (agreement check only,
        # never written to the site). Columns read from
        # https://data.cityofnewyork.us/api/views/erm2-nwe9.json on 2026-11-04.
        fields=["unique_key", "created_date", "agency", "complaint_type", "descriptor",
                "incident_address", "incident_zip", "status", "community_board",
                "latitude", "longitude"],
        where=(f"location_type in {_sql_list(COMPLAINTS_311_LOCATION_TYPES)}"
               f" AND created_date >= '{COMPLAINTS_311_START}'"
               f" AND community_board in {_sql_list(COMPLAINTS_311_BOARDS)}"),
        order="unique_key",
        lat_lon=("latitude", "longitude"),
        notes="Bar/club/restaurant location types only, created on or after COMPLAINTS_311_START.",
    ),
    Source(
        key="restaurant_inspections",
        domain=NYC,
        id="43nn-pn8j",
        title="DOHMH New York City Restaurant Inspection Results",
        # One row per violation (the dataset description says values repeat for each
        # additional violation), reduced to one row per inspection in transform.py.
        # Columns read from https://data.cityofnewyork.us/api/views/43nn-pn8j.json on
        # 2026-11-04. community_board is text here ('101', '304'), checked via $group.
        fields=["camis", "dba", "boro", "building", "street", "zipcode", "inspection_date",
                "action", "violation_code", "score", "grade", "grade_date", "inspection_type",
                "latitude", "longitude", "community_board", "bin", "bbl"],
        where=f"community_board in {_sql_list(RESTAURANT_BOARDS)}",
        order="camis,inspection_date,violation_code",
        lat_lon=("latitude", "longitude"),
        notes="Inspection date 1900-01-01 = not yet inspected (dataset description).",
    ),
    Source(
        key="co_dobnow",
        domain=NYC,
        id="pkdm-hqz6",
        title="DOB NOW: Certificate of Occupancy",
        # COs requested through DOB NOW, March 2021 on (dataset description). Older COs are
        # PDFs in BIS, which the address page links by BIN. Columns read from
        # https://data.cityofnewyork.us/api/views/pkdm-hqz6.json on 2026-11-04;
        # community_board is a number here (101, 304), checked via $group.
        fields=["bin", "job_filing_name", "job_type", "house_no", "street_name", "borough",
                "c_of_o_status", "c_of_o_filing_type", "c_of_o_issuance_date", "c_of_o_number",
                "application_number", "community_board"],
        where="community_board in (" + ",".join(str(d["boro_cd"]) for d in DISTRICTS.values()) + ")",
        order="application_number",
        notes="Joined to address pages by BIN only.",
    ),

    Source(
        key="schools",
        domain=NYC,
        id="ji82-xba5",
        title="Facilities Database (schools, K-12)",
        # Columns read from https://data.cityofnewyork.us/api/views/ji82-xba5.json on
        # 2026-11-04. xcoord/ycoord are DCP's own State Plane feet; build.py checks its own
        # projection of latitude/longitude against them (axis-order guard).
        fields=["uid", "facname", "addressnum", "streetname", "address", "boro", "zipcode",
                "latitude", "longitude", "xcoord", "ycoord", "bin", "bbl", "cd", "facgroup",
                "facsubgrp", "factype"],
        where=(f"facgroup = '{SCHOOL_FACGROUP}' AND facsubgrp in {_sql_list(SCHOOL_SUBGROUPS)}"),
        order="uid",
        lat_lon=("latitude", "longitude"),
        bbox=("latitude", "longitude"),
        notes="School facilities in and within SW_BUFFER_FT of the two districts.",
    ),
    Source(
        key="worship",
        domain=NYC,
        id="64uk-42ks",
        title="PLUTO (houses of worship, building class M1-M4, M9)",
        # Columns read from https://data.cityofnewyork.us/api/views/64uk-42ks.json on
        # 2026-11-04. latitude/longitude: "the approximate location of the tax lot".
        # ownername is deliberately NOT selected. PLUTO carries no facility name.
        fields=["bbl", "address", "borough", "zipcode", "bldgclass", "latitude", "longitude",
                "xcoord", "ycoord", "cd", "numbldgs", "version"],
        where=f"bldgclass in {_sql_list(WORSHIP_CLASSES)}",
        order="bbl",
        lat_lon=("latitude", "longitude"),
        bbox=("latitude", "longitude"),
        notes="Tax lots with a house-of-worship building class, in and near the two districts.",
    ),
]

SOURCES_BY_KEY = {s.key: s for s in SOURCES}

# ---- the rule text shown on address pages (#60). Quoted from ABC Law §64(7) as published on
# https://www.nysenate.gov/legislation/laws/ABC/64, "VIEWING MOST RECENT REVISION (FROM
# 2026-07-31)", read 2026-11-04 in a browser. Paragraphs (a) to (c) are word for word the same
# as the 2025-08-29 text in the local nys-openlegislation corpus. Facts only; the site never
# says whether a rule applies.
SLA_RULES = {
    "law": "New York Alcoholic Beverage Control Law §64(7)",
    "url": "https://www.nysenate.gov/legislation/laws/ABC/64",
    "revision": "2026-07-31",
    "read": "2026-11-04",
    "lead": "No retail license for on-premises consumption shall be granted for any premises "
            "which shall be",
    "a": "on the same street or avenue and within two hundred feet of a building occupied "
         "exclusively as a school, church, synagogue or other place of worship",
    "b": "in a city, town or village having a population of twenty thousand or more within five "
         "hundred feet of three or more existing premises licensed and operating pursuant to "
         "this section and sections sixty-four-a, sixty-four-b, sixty-four-c, and/or "
         "sixty-four-d of this article",
    "c": "the measurements in paragraphs (a) and (b) of this subdivision are to be taken in "
         "straight lines from the center of the nearest entrance of the premises sought to be "
         "licensed to the center of the nearest entrance of such school, church, synagogue or "
         "other place of worship or to the center of the nearest entrance of each such premises "
         "licensed and operating pursuant to this section and sections sixty-four-a, "
         "sixty-four-b, sixty-four-c, and/or sixty-four-d of this article",
    "related": [
        {"label": "§64-a (special on-premises licenses)",
         "url": "https://www.nysenate.gov/legislation/laws/ABC/64-A"},
        {"label": "§105 (off-premises liquor and wine stores)",
         "url": "https://www.nysenate.gov/legislation/laws/ABC/105"},
    ],
    "sla_guide": {"label": "SLA, “Measuring the Distance: The 200 and 500 Foot Rules”",
                  "url": "https://sla.ny.gov/200-and-500-foot-laws"},
    "sla_classes": {"label": "SLA license type and class definitions",
                    "url": "https://sla.ny.gov/leap-license-type-and-class-definitions"},
}
