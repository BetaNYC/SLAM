<script>
	import { scrollRegion } from '#lib/scrollRegion.js';
	import { resolve } from '$app/paths';
	import { fmtStamp } from '#lib/format.js';

	/** @type {{data: any}} */
	let { data } = $props();
	const m = $derived(data.manifest);
	const sla = $derived(m.sla_license);
	const c311 = $derived(m.complaints_311);
	const districts = $derived(Object.values(m.districts).map((/** @type {any} */ d) => d.label));

	/** What each dataset is used for on this site. Keys match pipeline/slam_pipeline/sources.py. */
	/** @type {Record<string, string>} */
	const USED_FOR = $derived({
		districts: 'Community district and Joint Interest Area boundaries. A record is in a district when its point falls inside the line; an address whose City point is within ' + (m.district_lines?.boundary_ft ?? 100) + ' feet of a line is listed in both districts.',
		liquor_pending: 'Liquor license applications SLA has received and not yet decided.',
		liquor_active: 'Liquor licenses in effect now, with the dates and IDs SLA publishes for each. SLA publishes no hours or method of operation.',
		liquor_inactive: 'Liquor licenses that have ended (shown on request).',
		cannabis_retail: 'Registered adult-use cannabis retail dealers.',
		cannabis_license: 'Cannabis licenses from the Office of Cannabis Management, plus applicants that hold proximity protection for a proposed dispensary.',
		dining_out: 'Restaurants with outdoor dining approved under Dining Out NYC.',
		street_events: 'Street fairs, block parties and other permitted events.',
		complaints_311: '311 complaints at bars, clubs and restaurants, and outdoor dining complaints.',
		restaurant_inspections: 'Health inspection results and letter grades.',
		co_dobnow: 'Certificates of occupancy filed in DOB NOW.',
		schools: 'Schools (K-12), for the 200-foot distance list.',
		worship: 'Houses of worship and other religious property, for the 200-foot distance list.'
	});

	const GH = 'https://github.com/BetaNYC/SLAM';
	/** @param {number} n */
	const issue = (n) => `${GH}/issues/${n}`;
	/** @param {number} n */
	const pr = (n) => `${GH}/pull/${n}`;
</script>

<svelte:head><title>About — SLAM v2 prototype</title></svelte:head>

<h1>About SLAM</h1>
<p class="lede">
	SLAM, the Street License and Activity Map, shows what is licensed, pending and permitted around an
	address in a community district. It was built for community boards, to help them review liquor
	license applications. It began in 2018 as the SLA Mapper, named for the State Liquor Authority; the
	new name covers what it shows now.
</p>

<nav class="toc" aria-label="On this page">
	<ul>
		<li><a href="#data-h">Where the data comes from</a></li>
		<li><a href="#history-h">History</a></li>
		<li><a href="#ai-h">How we used AI tools</a></li>
		<li><a href="#tools-h">Open-source tools</a></li>
	</ul>
</nav>

<section aria-labelledby="data-h">
	<h2 id="data-h">Where the data comes from</h2>
	<p>
		Data last updated <time datetime={m.data_fetched}>{fmtStamp(m.data_fetched)}</time>. 311
		complaints run from {c311.start} through {c311.through}. This prototype covers
		{districts.join(' and ')}.
	</p>
	<p>
		SLAM shows facts as the City and State publish them. It does not decide whether a law or rule
		applies. Every term and how each number is counted are in the
		<a href={resolve('/glossary', {})}>Glossary</a>.
	</p>

	<h3 id="open-data">Open data</h3>
	<div class="table-scroll" use:scrollRegion>
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

	<h3 id="other-sources">Other sources</h3>
	<ul>
		<li><a href={sla.classes.url}>{sla.classes.label}</a>, from SLA.</li>
		<li><a href={sla.lamp.url}>SLA LAMP</a>, linked from each liquor license.</li>
		<li><a href={sla.full_board.url}>{sla.full_board.label}</a> and <a href={sla.event_calendar.url}>{sla.event_calendar.label}</a>.</li>
		<li>The text of the 200- and 500-foot rules, from nysenate.gov: see <a href={resolve('/rules', {})}>the rules page</a>.</li>
		<li>Each address links to BetaNYC's <a href="https://boundaries.beta.nyc/">Boundaries Map</a>, which lists every district that contains the address's point.</li>
		<li>Address points and BINs: the City's own address file (the Property Address Directory, as prepared by NYC Planning Labs for <a href="https://geosearch.planninglabs.nyc/">GeoSearch</a>), matched inside SLAM's build. GeoSearch itself is asked only about addresses the file cannot match.</li>
		<li>Restaurant pages link to the Health Department's <a href="https://a816-health.nyc.gov/ABCEatsRestaurants/">ABC Eats</a> and to DOB's certificate of occupancy records.</li>
	</ul>
	<p>
		SLAM is a folder of web pages and data files. Nothing you type is sent anywhere except address
		searches, which go to the City's GeoSearch service.
	</p>
</section>

<section aria-labelledby="history-h">
	<h2 id="history-h">History</h2>
	<p>
		This history comes from SLAM's public <a href={GH}>GitHub repository</a>: its README, commits,
		issues and pull requests since 2018. Issue numbers link to the original discussion.
	</p>

	<h3>2018: Built with and for community boards</h3>
	<p>
		Lindsay Poirier of BetaNYC made the first commit on June 29, 2018. New York City has 59
		community boards, each with up to 50 appointed volunteers. For every liquor license
		application, a board gathers the license history, noise and underage drinking complaints,
		health inspections, the certificate of occupancy and sidewalk cafe information. These datasets
		share no common ID, so SLAM used location to bring them together.
	</p>
	<p>
		The first issues, filed that summer, asked for a color-coded legend (<a href={issue(1)}>#1</a>),
		more liquor license filters (<a href={issue(2)}>#2</a>), a location search bar
		(<a href={issue(3)}>#3</a>), license types (<a href={issue(6)}>#6</a>), certificates of
		occupancy (<a href={issue(8)}>#8</a>) and a mobile-friendly layout (<a href={issue(17)}>#17</a>).
		In November 2018, an issue asked for the shapes of schools and churches on the map
		(<a href={issue(22)}>#22</a>).
	</p>
	<p>
		On October 12, 2018, Lindsay Poirier presented "Helping District Offices Streamline License
		Reviews with SLAM" at CARTO's Spatial Data Science Conference. The talk described a tool built
		"using just very lightweight tools like Carto.js and Chart.js." Stacked noise complaints showed
		hotspots, and licenses expiring soon were colored differently.
	</p>

	<h3>2019: Keeping up with the data</h3>
	<p>
		SLA changed its dataset's column names, and SLAM's queries were updated to match
		(<a href={pr(27)}>#27</a>, August 2019). New issues asked for a point on the map for a searched
		address (<a href={issue(28)}>#28</a>) and for political and administrative boundaries
		(<a href={issue(30)}>#30</a>).
	</p>

	<h3>2020: A rebuild, and outdoor dining</h3>
	<p>
		Zhi Keng He rebuilt SLAM in Svelte (version 0.10e, <a href={pr(32)}>#32</a>, merged
		February 13, 2020). That month, community district and City Council district layers were added.
		In June and July 2020, SLAM added the City's Open Restaurants dataset and a layer of 311
		complaints about open restaurants: NYPD social distancing and face covering complaints, DCA
		sidewalk cafe complaints and DOT outdoor dining complaints.
	</p>

	<h3>2021–2023: Upkeep</h3>
	<p>
		SLAM added links to SLA's LAMP map (October 2021). It was fixed after an SLA schema change and a
		change to the City's Geoclient service (January 2022), and moved to Vite and GeoSearch version 2
		(January 2023).
	</p>
	<p>
		Some ideas stayed open: where sidewalk cafes can and can't be (<a href={issue(23)}>#23</a>),
		addresses with large stacks of complaints (<a href={issue(29)}>#29</a>), a list of noisy
		locations (<a href={issue(31)}>#31</a>), a download of expired licenses
		(<a href={issue(34)}>#34</a>), an error message when one layer fails
		(<a href={issue(41)}>#41</a>), and zoning districts and use groups (<a href={issue(46)}>#46</a>).
	</p>

	<h3>November 2026: The map goes blank</h3>
	<p>
		By November 3, 2026, the first SLAM showed no data. BetaNYC's account with CARTO, the map
		service it ran on, was no longer available. The data requests failed and the street map showed "API KEY
		REQUIRED."
	</p>

	<h3>November 2026: SLAM v2</h3>
	<p>
		SLAM v2 is a rebuild with no hosted database and no API keys in the browser
		(<a href={issue(56)}>#56</a>). A small program downloads the data from NYC Open Data and
		data.ny.gov, places each record in today's community district lines, and saves it as web pages
		and data files. It is hosted on GitHub Pages and is rebuilt from open data each time it is published. It is also rebuilt every night. It brings back
		what boards used in the first SLAM (<a href={issue(58)}>#58</a>). It is a prototype: it is live
		at slam.beta.nyc, and we are testing it with three districts: Manhattan Community District 1,
		Brooklyn Community District 4 and Brooklyn Community District 9. An address on a district line is listed in both districts
		(<a href={issue(88)}>#88</a>), and the pipeline knows the 12 Joint Interest Areas, the parks and
		airports outside every community district, so each can be listed as its own district when SLAM
		covers the whole city (<a href={issue(87)}>#87</a>, <a href={issue(93)}>#93</a>).
	</p>
</section>

<section aria-labelledby="ai-h">
	<h2 id="ai-h">How we used AI tools</h2>
	<p>We are telling you this under <a href="https://beta.nyc/about/ai-policy">BetaNYC's AI policy</a>.</p>
	<p>
		<strong>Writing code.</strong> BetaNYC staff built SLAM v2 with the help of Claude, an AI coding
		assistant made by Anthropic. BetaNYC staff set the goals, made the design decisions and decided
		what to merge. The AI tool drafted the code, tests and documentation, including this page.
		Changes were checked by automated tests and by a second, separate AI review. BetaNYC staff reviewed
		the published site on November 5, 2026, as BetaNYC's AI policy asks for anything AI helped make.
	</p>
	<p>
		<strong>Learning from the first SLAM.</strong> To bring back what boards used, Claude read the
		first SLAM's code, README and GitHub issues. We transcribed the 2018 Spatial Data Science
		Conference talk, which is public on CARTO's YouTube channel, with Deepgram. Deepgram is an online
		speech-to-text service, so the talk's audio was sent to Deepgram. We also reviewed frames from
		that talk and from a 2020 BetaNYC "Open Data Journeys" training video. Claude summarized all of
		this into a list of features.
	</p>
	<p>
		<strong>No AI on this site.</strong> Every record and count you see comes directly from open
		data, put together by ordinary code. Nothing here is generated, guessed or predicted by AI.
		Nothing you type is sent to an AI service.
	</p>
	<p>The full code, and the record of how it changed, is public on <a href={`${GH}/tree/v2`}>GitHub</a>.</p>
</section>

<section aria-labelledby="tools-h">
	<h2 id="tools-h">Open-source tools</h2>
	<p>
		SLAM v2 is built on <a href="https://duckdb.org/">DuckDB</a> (MIT),
		<a href="https://svelte.dev/">Svelte and SvelteKit</a> (MIT) and
		<a href="https://maplibre.org/">MapLibre GL</a> (BSD-3-Clause). The data program is written in
		Python and run with <a href="https://docs.astral.sh/uv/">uv</a>. The site is hosted on GitHub
		Pages.
	</p>
	<p>
		Street map: the City's own vector basemap,
		<a href="https://nyc.maps.arcgis.com/home/item.html?id=df7862bfd7984baab51ff9df8e214278">NYC Basemap</a>
		(SOURCE: NYC OTI, powered by Esri). If it can't load, the map switches to
		<a href="https://openfreemap.org/">OpenFreeMap</a>, built from
		<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap</a> contributors data.
	</p>
</section>

<style>
	.lede { font-size: 1.05rem; max-width: 48rem; }
	.toc ul { list-style: none; padding: 0.5rem 0.75rem; margin: 0.75rem 0; display: flex; flex-wrap: wrap; gap: 0.25rem 1.25rem; background: var(--bg-soft); }
	section { max-width: 60rem; }
	section p { max-width: 48rem; }
	h3 { font-size: 1.05rem; margin: 1rem 0 0.35rem; }
	tbody th { font-weight: normal; }
</style>
