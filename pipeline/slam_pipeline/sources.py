"""Source definitions for the SLAM v2 prototype pipeline.

Every dataset id and field name below was read from the portal's own
metadata endpoint, `https://<domain>/api/views/<id>.json` (`columns[].fieldName`),
on 2026-11-04. Recorded copies of those column lists live in
`tests/fixtures/views_<id>.json`, and `check.py` re-verifies them on every run.

Query language: Socrata SoQL, https://dev.socrata.com/docs/queries/
  - `$select`, `$where`, `$order`, `$limit`, `$offset` (paging:
    https://dev.socrata.com/docs/paging.html)
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
]

SOURCES_BY_KEY = {s.key: s for s in SOURCES}
