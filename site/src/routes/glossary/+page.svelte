<script>
	import { resolve } from '$app/paths';
	import { fmtStamp, GRADE_LABEL, sameStreetLabel } from '#lib/format.js';

	/** @type {{data: any}} */
	let { data } = $props();
	const m = $derived(data.manifest);
	const c311 = $derived(m.complaints_311);
	const nearbyFt = $derived(Math.round((m.nearby_m * 3.28084) / 10) * 10);
	const about = resolve('/about', {});
	const rules = resolve('/rules', {});
</script>

<svelte:head><title>Glossary — SLAM v2 prototype</title></svelte:head>

<h1>Glossary</h1>
<p class="lede">
	The words SLAM uses, how each number on an address page is counted, and where the data comes from.
</p>

<nav class="toc" aria-label="On this page">
	<ul>
		<li><a href="#places-h">Places and district lines</a></li>
		<li><a href="#licenses-h">Licenses and permits</a></li>
		<li><a href="#c311-h">311 complaints</a></li>
		<li><a href="#restaurants-h">Restaurants and buildings</a></li>
		<li><a href="#sw-h">Schools, houses of worship and distance rules</a></li>
		<li><a href="#calc-h">How the numbers are counted</a></li>
		<li><a href="#timing-h">Dates and how fresh the data is</a></li>
		<li><a href="#datasets-h">Datasets</a></li>
	</ul>
</nav>

<section aria-labelledby="places-h">
	<h2 id="places-h">Places and district lines</h2>
	<dl class="glossary">
		<dt id="community-board">Community board / community district</dt>
		<dd>
			New York City has 59 community districts. Each has a community board of up to 50 unpaid
			members appointed by the Borough President, at least half of them nominated by the district's
			Council members. Those Council members also sit on the board without a vote. Boards give advice on liquor licenses, land use and City services in their district.
			SLAM shows one district at a time.
		</dd>

		<dt id="district-number">District number</dt>
		<dd>
			SLAM numbers districts the way the Department of City Planning does. The first digit is the
			borough (1 Manhattan, 2 Bronx, 3 Brooklyn, 4 Queens, 5 Staten Island) and the last two are the
			district. So 101 is Manhattan Community District 1 and 304 is Brooklyn Community District 4.
		</dd>

		<dt id="placed">Placed in a district</dt>
		<dd>
			SLAM takes each record's map point and checks which community district line it falls inside.
			This is called a point-in-polygon check: "which shape is this dot inside?" The lines come from
			City Planning's Community Districts dataset.
		</dd>

		<dt id="address-page">Address page</dt>
		<dd>
			One page for each address that has a record in SLAM. Records for the same building share a
			page when the City's address file matches them to the same BIN. Otherwise a page is keyed on the street
			address and ZIP code.
		</dd>

		<dt id="address-file">The City's address file (PAD)</dt>
		<dd>
			The City Planning Department's Property Address Directory: every address in the city with
			its building (BIN), tax lot (BBL) and map point. SLAM matches addresses against the copy NYC
			Planning Labs prepares for its GeoSearch service. A match needs the same house number, street
			and borough. SLAM also tries common ways addresses are written, such as a Queens number
			without its hyphen ("104 30" for "104-30") or a range ("237-243"); readings that could land
			on the wrong building must be close to the record's own map point.
		</dd>

		<dt id="geosearch">GeoSearch</dt>
		<dd>
			The City's address search service, built from the same address file. SLAM asks it only about
			addresses the file cannot match, and the address box at the top of the site uses it. A match
			counts only when the house number, street and borough are the same, and GeoSearch's
			confidence is 0.8 or higher.
		</dd>

		<dt id="low-confidence">Low-confidence match</dt>
		<dd>
			GeoSearch answered, but no result had the same house number, street and borough with a
			confidence of 0.8 or higher. The address page stays keyed on the street address and ZIP code.
		</dd>

		<dt id="bin">BIN (Building Identification Number)</dt>
		<dd>A number the City gives each building. SLAM uses it to put records for the same building on one address page.</dd>

		<dt id="bbl">BBL (borough, block and lot)</dt>
		<dd>The City's number for a tax lot, the piece of land a building stands on. One lot can hold several buildings.</dd>
	</dl>
</section>

<section aria-labelledby="licenses-h">
	<h2 id="licenses-h">Licenses and permits</h2>
	<dl class="glossary">
		<dt id="sla">SLA (State Liquor Authority)</dt>
		<dd>The New York State agency that issues and enforces liquor licenses. Its Board holds Full Board meetings about every three weeks to decide licensing and disciplinary matters.</dd>

		<dt id="lamp">LAMP</dt>
		<dd>SLA's public map of licenses and applications (lamp.sla.ny.gov). SLAM links to it so you can see SLA's own record for a place.</dd>

		<dt id="pending">Pending application</dt>
		<dd>A liquor license application SLA has received and not yet decided.</dd>

		<dt id="active">Active / inactive license</dt>
		<dd>An active license is in effect now. An inactive license is no longer in effect. SLA's inactive list gives the status for each one.</dd>

		<dt id="on-premises">On-premises / off-premises</dt>
		<dd>
			An on-premises license is for drinks served and drunk where they are sold, like a bar or
			restaurant. An off-premises license is for sealed bottles to take away, like a liquor or
			grocery store. The 200- and 500-foot rules in ABC Law §64 are about on-premises liquor licenses.
		</dd>

		<dt id="license-class">License type and class</dt>
		<dd>
			SLA's codes for each kind of license. SLAM shows the code and SLA's own description. SLA
			publishes the full list as an Excel file (linked on the <a href={about}>About page</a>).
		</dd>

		<dt id="ocm">OCM (Office of Cannabis Management)</dt>
		<dd>The New York State agency that licenses cannabis businesses, including adult-use retail dispensaries.</dd>

		<dt id="dining-out">Dining Out NYC</dt>
		<dd>
			The City's outdoor dining program, run by the Department of Transportation (DOT). It licenses
			sidewalk seating and roadway seating, year-round or seasonal. It took the place of the temporary,
			pandemic-era Open Restaurants program.
		</dd>

		<dt id="street-event">Permitted street event</dt>
		<dd>A street fair, block party or similar event with a City permit. The source has no map points, so these appear in the list only.</dd>
	</dl>
</section>

<section aria-labelledby="c311-h">
	<h2 id="c311-h">311 complaints</h2>
	<dl class="glossary">
		<dt id="311">311 service request (complaint)</dt>
		<dd>
			A report someone made to 311. It is not a finding that anything happened. One problem can lead
			to several reports if several people report it.
		</dd>

		<dt id="complaint-type">Complaint type and descriptor</dt>
		<dd>
			The category 311 gives a report, with a more specific descriptor. For example, complaint type
			"Noise - Commercial" with descriptor "Loud Music/Party," or "Drinking" with the descriptor
			"Underage - Licensed Est" (underage drinking at a licensed place).
		</dd>

		<dt id="location-type">Location type</dt>
		<dd>
			Where 311 says the problem is, chosen when the report is made. SLAM keeps reports with
			location type {c311.location_types.map((/** @type {string} */ t) => `"${t}"`).join(' or ')},
			plus every {c311.complaint_types_any_location.map((/** @type {string} */ t) => `"${t}"`).join(' and ')}
			complaint, whose location type is the sidewalk or street. The first SLAM used the same
			location filter.
		</dd>

		<dt id="noise-commercial">Noise - Commercial</dt>
		<dd>The 311 complaint type for noise from a business, such as loud music or a crowd. NYPD handles it.</dd>

		<dt id="drinking">Drinking</dt>
		<dd>The 311 complaint type for drinking in public, or a licensed place serving after hours or to people under 21. NYPD handles it.</dd>

		<dt id="outdoor-dining">Outdoor Dining (311)</dt>
		<dd>
			The 311 complaint type about outdoor dining setups, such as a blocked sidewalk or a seating
			area set up without approval. DOT handles it.
		</dd>

		<dt id="c311-colors">Map colors for 311</dt>
		<dd>
			The map colors 311 dots in four groups, based on the first SLAM's layers: Noise - Commercial,
			Drinking, Outdoor Dining (a separate layer in the first SLAM), and Other (every other complaint
			type).
		</dd>
	</dl>
</section>

<section aria-labelledby="restaurants-h">
	<h2 id="restaurants-h">Restaurants and buildings</h2>
	<dl class="glossary">
		<dt id="dohmh">Health inspection</dt>
		<dd>
			The Department of Health and Mental Hygiene (DOHMH) inspects restaurants. It gives each
			problem it finds a number of points. Fewer points is better.
		</dd>

		<dt id="letter-grade">Letter grade</dt>
		<dd>
			<ul>
				<li><strong>{GRADE_LABEL.A}</strong>: 0 to 13 points.</li>
				<li><strong>{GRADE_LABEL.B}</strong>: 14 to 27 points.</li>
				<li><strong>{GRADE_LABEL.C}</strong>: 28 or more points.</li>
				<li><strong>{GRADE_LABEL.Z}</strong>: the restaurant may contest the result, so no letter is final yet.</li>
				<li><strong>{GRADE_LABEL.P}</strong>: a grade pending after the restaurant re-opened.</li>
				<li><strong>{GRADE_LABEL.N}</strong>: the restaurant has not been graded yet.</li>
			</ul>
		</dd>

		<dt id="co">Certificate of occupancy (CO)</dt>
		<dd>
			A Department of Buildings (DOB) document that records a building's use and how many people may
			occupy it. Newer COs are in DOB NOW. Older ones are in DOB's Buildings Information System (BIS).
		</dd>

		<dt id="pluto">PLUTO and building class</dt>
		<dd>
			PLUTO is the City Planning dataset of every tax lot. Its building class codes M1 to M9 mark
			religious property.
		</dd>

		<dt id="facdb">Facilities Database (FacDB)</dt>
		<dd>City Planning's list of public and private facilities. SLAM takes its K-12 schools.</dd>
	</dl>
</section>

<section aria-labelledby="sw-h">
	<h2 id="sw-h">Schools, houses of worship and distance rules</h2>
	<dl class="glossary">
		<dt id="school">School</dt>
		<dd>
			A K-12 school in the Facilities Database: public, charter, non-public and special education
			schools. Day care, pre-K, college and after-school programs are not included.
		</dd>

		<dt id="house-of-worship">House of worship</dt>
		<dd>A tax lot in PLUTO building class M1 (church, synagogue, chapel).</dd>

		<dt id="other-religious">Other religious property</dt>
		<dd>
			A tax lot in PLUTO building class M2, M3, M4 or M9 (mission house, parsonage or rectory,
			convent, miscellaneous). PLUTO does not say it is a place of worship.
		</dd>

		<dt id="rule-200">200-foot rule</dt>
		<dd>
			State law (ABC Law §64(7)(a)) about on-premises liquor licenses on the same street or avenue as, and
			within 200 feet of, a building used only as a school or place of worship. See
			<a href={rules}>the rules page</a>.
		</dd>

		<dt id="rule-500">500-foot rule</dt>
		<dd>
			State law (ABC Law §64(7)(b)) about on-premises liquor licenses within 500 feet of three or more
			existing on-premises licensed premises. SLA may still grant one after a hearing if, after
			consulting the community board, it finds the license is in the public interest (§64(7)(f)). See <a href={rules}>the rules page</a>.
		</dd>

		<dt id="cannabis-school">Cannabis: 500-foot school rule</dt>
		<dd>
			State law (Cannabis Law §72(6)(a)) about adult-use cannabis dispensaries on the same street as,
			and within 500 feet of, a building containing a school. It is a different law from the liquor
			rules: 500 feet for schools, not 200, and the building only has to contain a school.
			<a href="https://www.nysenate.gov/legislation/laws/CAN/72">Read §72</a>.
		</dd>

		<dt id="cannabis-worship">Cannabis: 200-foot house of worship rule</dt>
		<dd>
			State law (Cannabis Law §72(6)(b)) about adult-use cannabis dispensaries on the same street as,
			and within 200 feet of, a building used only as a house of worship. Like the liquor rules, it is
			measured from entrance to entrance (§72(6)(c)). A renewal is not denied because of these two
			rules (§72(6)(f)). Address pages with a cannabis record list schools within about 500 ft and houses of worship within
			about 200 ft, building point to building point.
		</dd>

		<dt id="cannabis-notice">Community board notice (cannabis and liquor)</dt>
		<dd>
			In New York City, an applicant must notify the community board before applying: for a liquor
			license, under ABC Law §110-b; for a cannabis dispensary or on-site consumption license, 30 to 270
			days ahead, under Cannabis Law §76. The board may send its opinion for or against, and the
			opinion becomes part of the record. For cannabis, the Cannabis Control Board must answer the
			community board in writing, explaining how its opinion was considered.
		</dd>

		<dt id="who-decides">Who decides</dt>
		<dd>
			For liquor, the State Liquor Authority decides each application, including how these rules
			apply to it. For cannabis, the Office of Cannabis Management makes a recommendation and the
			Cannabis Control Board decides. In both cases the community board's opinion becomes part of the
			record (see Community board notice). SLAM lists what is nearby and how far away it is. It does not
			make that decision.
		</dd>
	</dl>
</section>

<section aria-labelledby="calc-h">
	<h2 id="calc-h">How the numbers are counted</h2>
	<dl class="glossary">
		<dt id="building-point">Building point</dt>
		<dd>
			SLAM puts each address page at one map point. When the City's address file matches the
			address, it is the City's point for that address. Otherwise it is the average of the records' own points.
		</dd>

		<dt id="approx-distance">Approximate distance</dt>
		<dd>
			SLAM cannot measure door to door, because no dataset it uses has entrance locations. It
			measures straight lines from building point to building point. The liquor and cannabis laws
			measure from the center of the nearest entrance to the center of the nearest entrance, so every
			distance in SLAM is approximate. Building points can sit away from the door, so a SLAM distance
			can differ by tens of feet or more, especially for large or corner buildings. A distance near a
			limit is close, not over or under it.
		</dd>

		<dt id="c311-at-address">311 at this address</dt>
		<dd>
			A complaint counts at an address when its incident address and ZIP code, cleaned up the same
			way as the page's address, match the page. A complaint with only an intersection is never
			counted at an address.
		</dd>

		<dt id="c311-nearby">311 nearby</dt>
		<dd>
			Complaints whose map point is within {m.nearby_m} meters (about {nearbyFt} feet) of the address
			page's point, not counting the ones at the address. They are shown as counts by complaint type.
		</dd>

		<dt id="nearby">Nearby addresses</dt>
		<dd>Other address pages within {m.nearby_m} meters of this one, in the same district's data.</dd>

		<dt id="count-200">Within about 200 feet</dt>
		<dd>
			The schools, houses of worship and other religious property whose point is within about 200
			feet of the address page's point.
		</dd>

		<dt id="same-street">Same street</dt>
		<dd>
			SLAM compares the street name in the school's or lot's address with the street names in the
			address page's records, after removing house numbers and floor or suite text. It shows one of
			three answers:
			<ul>
				<li><strong>{sameStreetLabel(true)}</strong>: the names match.</li>
				<li><strong>{sameStreetLabel(false)}</strong>: the names differ. A corner building fronts two streets, but the records list one address each, so this is not a "no."</li>
				<li><strong>{sameStreetLabel(null)}</strong>: one side has no usable street name.</li>
			</ul>
			Spelling differences, like "Saint Nicolas" and "St Nicholas," can still be missed.
		</dd>

		<dt id="count-500">On-premises licenses within about 500 feet</dt>
		<dd>
			The number of other addresses with an active on-premises liquor license (SLA type 1, classes
			0340 to 0421) within about 500 feet of the address page's point. Licenses at the address itself,
			pending applications and inactive licenses are not counted. Licenses in Manhattan, Brooklyn and
			Queens are counted, because the Brooklyn pilot district borders Queens.
		</dd>

		<dt id="premises">Premises (for counting)</dt>
		<dd>
			One address page, or one street address and ZIP code for a license with no page. Several
			licenses at one address count as one premises.
		</dd>
	</dl>
</section>

<section aria-labelledby="timing-h">
	<h2 id="timing-h">Dates and how fresh the data is</h2>
	<dl class="glossary">
		<dt id="data-updated">Data updated</dt>
		<dd>
			When SLAM last downloaded the data: <time datetime={m.data_fetched}>{fmtStamp(m.data_fetched)}</time>.
			It is shown at the top of every page.
		</dd>

		<dt id="rows-updated">Rows updated</dt>
		<dd>
			When each dataset was last changed at its source, as the portal reports it. It is listed for
			every dataset on the <a href={about}>About page</a>.
		</dd>

		<dt id="c311-range">311 date range</dt>
		<dd>
			SLAM keeps 311 complaints created on or after {c311.start}. The latest in this build is from
			{c311.through}. Complaints from 2010 to 2019 are in a separate City dataset that SLAM does not
			read.
		</dd>

		<dt id="today-lines">Today's district lines</dt>
		<dd>Every record is placed using today's community district lines, including old records.</dd>
	</dl>
</section>

<section aria-labelledby="datasets-h">
	<h2 id="datasets-h">Datasets</h2>
	<p>
		Every dataset SLAM reads, with a link, its ID, what SLAM uses it for and when it was last
		updated, is in the table on the <a href={`${about}#open-data`}>About page</a>.
	</p>
</section>

<style>
	.lede { font-size: 1.05rem; max-width: 48rem; }
	.toc ul { list-style: none; padding: 0.5rem 0.75rem; margin: 0.75rem 0; display: flex; flex-wrap: wrap; gap: 0.25rem 1.25rem; background: var(--bg-soft); }
	section { max-width: 52rem; }
	.glossary dt { font-weight: 600; margin-top: 0.9rem; }
	.glossary dd { margin: 0.2rem 0 0 0; max-width: 48rem; }
	.glossary dd ul { margin: 0.35rem 0; padding-left: 1.25rem; }
</style>
