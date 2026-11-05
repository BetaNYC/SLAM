<script>
	import { resolve } from '$app/paths';
	import { fmtStamp } from '#lib/format.js';

	/** @type {{data: any}} */
	let { data } = $props();
	const m = $derived(data.manifest);
	const sla = $derived(m.sla_license);

	/** What each dataset is used for on this site. Keys match pipeline/slam_pipeline/sources.py. */
	/** @type {Record<string, string>} */
	const USED_FOR = {
		districts: 'Community district boundaries. A record is in a district when its point falls inside the line.',
		liquor_pending: 'Liquor license applications SLA has received and not yet decided.',
		liquor_active: 'Liquor licenses in effect now.',
		liquor_inactive: 'Liquor licenses that have ended (shown on request).',
		cannabis_retail: 'Registered adult-use cannabis retail dealers.',
		cannabis_license: 'Cannabis licenses issued by the Office of Cannabis Management.',
		dining_out: 'Restaurants with outdoor dining approved under Dining Out NYC.',
		street_events: 'Street fairs, block parties and other permitted events.',
		complaints_311: '311 complaints at bars, clubs and restaurants, and outdoor dining complaints.',
		restaurant_inspections: 'Health inspection results and letter grades.',
		co_dobnow: 'Certificates of occupancy filed in DOB NOW.',
		schools: 'Schools (K-12), for the 200-foot rule.',
		worship: 'Houses of worship and other religious property, for the 200-foot rule.'
	};

	/** @type {{term: string, id: string, def: string}[]} */
	const GLOSSARY = [
		{ id: 'community-board', term: 'Community board / community district', def: 'New York City has 59 community districts. Each has a community board of up to 50 volunteer members appointed by the Borough President, half of them nominated by the district\'s Council members. Boards give advice on liquor licenses, land use and city services in their district. SLAM shows one district at a time.' },
		{ id: 'sla', term: 'SLA (State Liquor Authority)', def: 'The New York State agency that issues and enforces liquor licenses. Its decisions are made by a board at Full Board meetings.' },
		{ id: 'lamp', term: 'LAMP', def: 'SLA\'s public map of licenses and applications (lamp.sla.ny.gov). SLAM links to it so you can see SLA\'s own record for a place.' },
		{ id: 'pending', term: 'Pending application', def: 'A liquor license application SLA has received and not yet decided.' },
		{ id: 'active', term: 'Active / inactive license', def: 'An active license is in effect now. An inactive license is no longer in effect. SLA\'s inactive list gives the status for each one.' },
		{ id: 'on-premises', term: 'On-premises / off-premises', def: 'An on-premises license is for drinks served and drunk where they are sold, like a bar or restaurant. An off-premises license is for sealed bottles to take away, like a liquor or grocery store. The 200- and 500-foot rules apply to on-premises licenses.' },
		{ id: 'license-class', term: 'License type and class', def: 'SLA\'s codes for what a license allows. SLAM shows the code and SLA\'s own description. SLA publishes the full list as an Excel file (linked under Sources).' },
		{ id: 'ocm', term: 'OCM (Office of Cannabis Management)', def: 'The New York State agency that licenses cannabis businesses, including adult-use retail dispensaries.' },
		{ id: 'dining-out', term: 'Dining Out NYC', def: 'The City\'s outdoor dining program, run by the Department of Transportation (DOT). It covers sidewalk seating and seasonal roadway seating. It replaced the pandemic-era Open Restaurants program.' },
		{ id: 'street-event', term: 'Permitted street event', def: 'A street fair, block party or similar event with a City permit. The source has no map points, so these appear in the list only.' },
		{ id: '311', term: '311 service request (complaint)', def: 'A report someone made to 311. It is not a finding that anything happened. Each one has a complaint type, a descriptor and a location type.' },
		{ id: 'complaint-type', term: 'Complaint type and descriptor', def: 'The category 311 gives a report, with a more specific descriptor. For example, complaint type "Noise - Commercial" with descriptor "Loud Music/Party", or "Drinking" with "Underage - Licensed Est".' },
		{ id: 'location-type', term: 'Location type', def: 'Where 311 says the problem is, chosen when the report is made. SLAM keeps reports with location type "Club/Bar/Restaurant" or "Restaurant/Bar/Deli/Bakery", the same filter the first SLAM used, plus every "Outdoor Dining" complaint, whose location type is the sidewalk or street.' },
		{ id: 'noise-commercial', term: 'Noise - Commercial', def: 'The 311 complaint type for noise from a business, such as loud music or a crowd. NYPD handles it.' },
		{ id: 'drinking', term: 'Drinking', def: 'The 311 complaint type for drinking in public, or a licensed place serving after hours or to people under 21. NYPD handles it.' },
		{ id: 'outdoor-dining', term: 'Outdoor Dining (311)', def: 'The 311 complaint type about outdoor dining setups, such as a blocked sidewalk or a seating area set up without approval. DOT handles it.' },
		{ id: 'dohmh', term: 'Health inspection and letter grade', def: 'The Department of Health and Mental Hygiene (DOHMH) inspects restaurants and scores each problem it finds in points. Fewer points is better: A is 0 to 13 points, B is 14 to 27, C is 28 or more. "Grade pending" means the restaurant may contest the result.' },
		{ id: 'bin', term: 'BIN (Building Identification Number)', def: 'A number the City gives each building. SLAM uses it to put records for the same building on one address page.' },
		{ id: 'bbl', term: 'BBL (borough, block and lot)', def: 'The City\'s number for a tax lot, the piece of land a building stands on. One lot can hold several buildings.' },
		{ id: 'co', term: 'Certificate of occupancy (CO)', def: 'A Department of Buildings (DOB) document that says how a building may legally be used and how many people may occupy it. Newer COs are in DOB NOW; older ones are in DOB\'s Buildings Information System (BIS).' },
		{ id: 'rule-200', term: '200-foot rule', def: 'State law (ABC Law §64(7)(a)) about on-premises licenses on the same street or avenue as, and within 200 feet of, a building used only as a school or place of worship. See the rules page.' },
		{ id: 'rule-500', term: '500-foot rule', def: 'State law (ABC Law §64(7)(b)) about on-premises licenses within 500 feet of three or more existing on-premises licenses. See the rules page.' },
		{ id: 'building-point', term: 'Building point and distance', def: 'SLAM places each address at one map point and measures straight lines between points. SLA measures between entrances, so SLAM\'s distances are approximate.' },
		{ id: 'geosearch', term: 'GeoSearch', def: 'The City\'s address search service. SLAM uses it to turn addresses into map points and to find a building\'s BIN.' },
		{ id: 'pluto', term: 'PLUTO and building class', def: 'PLUTO is the City Planning dataset of every tax lot. Its building class codes M1 to M9 mark religious property; SLAM treats M1 (church, synagogue, chapel) as a house of worship.' },
		{ id: 'facdb', term: 'Facilities Database (FacDB)', def: 'City Planning\'s list of public and private facilities. SLAM takes its K-12 schools.' }
	];
</script>

<svelte:head><title>About, sources and glossary — SLAM v2 prototype</title></svelte:head>

<h1>About SLAM</h1>
<p>
	SLAM (State Liquor Authority Map) shows what is licensed, pending and permitted in a community
	district: liquor and cannabis licenses, outdoor dining, street events, 311 complaints, health
	inspections, certificates of occupancy, and nearby schools and houses of worship. It is built for
	community board members and staff who review license applications. It is a
	<a href="https://beta.nyc/">BetaNYC</a> prototype; the code is on
	<a href="https://github.com/BetaNYC/SLAM/tree/v2">GitHub</a>.
</p>
<p>
	SLAM shows facts as the City and State publish them. It does not decide whether a law or rule
	applies. Data updated <time datetime={m.data_fetched}>{fmtStamp(m.data_fetched)}</time>.
</p>

<nav aria-label="On this page">
	<a href="#sources">Sources</a> · <a href="#glossary">Glossary</a>
</nav>

<h2 id="sources">Sources</h2>
<h3>Open data</h3>
<div class="table-scroll">
	<table>
		<caption>Datasets SLAM reads, and when each was last updated at its source</caption>
		<thead>
			<tr><th scope="col">Dataset</th><th scope="col">Used for</th><th scope="col">Portal</th><th scope="col">Rows updated</th></tr>
		</thead>
		<tbody>
			{#each Object.entries(m.sources) as [key, s] (key)}
				<tr>
					<th scope="row"><a href={s.url}>{s.name}</a> <code>{s.id}</code></th>
					<td>{USED_FOR[key] ?? ''}</td>
					<td>{s.domain}</td>
					<td class="nowrap">{fmtStamp(s.rowsUpdatedAtIso)}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<h3>Other sources</h3>
<ul>
	<li><a href={sla.classes.url}>{sla.classes.label}</a>, from SLA.</li>
	<li><a href={sla.lamp.url}>SLA LAMP</a>, linked from each liquor license.</li>
	<li><a href={sla.full_board.url}>{sla.full_board.label}</a> and <a href={sla.event_calendar.url}>{sla.event_calendar.label}</a>.</li>
	<li>The text of the 200- and 500-foot rules, from nysenate.gov: see <a href={resolve('/rules', {})}>the rules page</a>.</li>
	<li>Address points and BINs: the City's <a href="https://geosearch.planninglabs.nyc/">GeoSearch</a> service.</li>
	<li>
		Street map: the City's own vector basemap,
		<a href="https://nyc.maps.arcgis.com/home/item.html?id=df7862bfd7984baab51ff9df8e214278">NYC Basemap</a>
		(SOURCE: NYC OTI, powered by Esri). If it does not load, the map uses
		<a href="https://openfreemap.org/">OpenFreeMap</a> (<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap</a> contributors).
	</li>
	<li>Restaurant pages link to the Health Department's <a href="https://a816-health.nyc.gov/ABCEatsRestaurants/">ABC Eats</a> and to DOB's certificate of occupancy records.</li>
</ul>

<h2 id="glossary">Glossary</h2>
<dl class="glossary">
	{#each GLOSSARY as g (g.id)}
		<dt id={g.id}>{g.term}</dt>
		<dd>{g.def}</dd>
	{/each}
</dl>

<style>
	.glossary dt { font-weight: 600; margin-top: 0.9rem; }
	.glossary dd { margin: 0.2rem 0 0 0; max-width: 48rem; }
	tbody th { font-weight: normal; }
</style>
