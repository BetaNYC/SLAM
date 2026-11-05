<script>
	import { resolve } from '$app/paths';
	import { SOURCE_LABEL, SOURCE_SHORT, SOURCE_COLOR, addressLine, coBisUrl, abcEatsUrl, DOB_NOW_PORTAL, GRADE_LABEL, fmtStamp, SW_KIND, sameStreetLabel, swName, SLA_SOURCES, lampUrl, lampRecordUrl, boundariesUrl } from '#lib/format.js';
	import SlaLicenseNote from '#lib/SlaLicenseNote.svelte';
	import DistanceNote from '#lib/DistanceNote.svelte';
	import CountTable311 from '#lib/CountTable311.svelte';
	import Complaints311Table from '#lib/Complaints311Table.svelte';

	/** @type {{data: any}} */
	let { data } = $props();
	const a = $derived(data.a);
	const m = $derived(data.manifest);
	const usedSources = $derived([
		...new Set([
			...a.records.map((/** @type {any} */ r) => r.source),
			...a.nearby.flatMap((/** @type {any} */ n) => n.records.map((/** @type {any} */ r) => r.source)),
			...(a.c311.n || a.c311_near.n ? ['complaints_311'] : []),
			...(a.restaurants?.length ? ['restaurant_inspections'] : []),
			...(a.co?.records?.length ? ['co_dobnow'] : [])
		])
	]);
	// SLA license record (#63): which SLA sources are at this address, and LAMP's zoom level
	const slaKeys = $derived(SLA_SOURCES.filter((k) => a.records.some((/** @type {any} */ r) => r.source === k)));
	const lampLevel = $derived(m.sla_license.lamp.level);
	const lampQuery = $derived(m.sla_license.lamp_query);
	// Schools and houses of worship (#60)
	const sw = $derived(data.sw);
	const rule = $derived(sw.rule);
	const pt = $derived(a.point ?? {});
	const near = $derived(a.sw?.near ?? []);
	const liq = $derived(a.sw?.liq ?? { premises: 0, licenses: 0, rows: [] });
	const cann = $derived(a.cannabis_sw ?? null);
	let liqOpen = $state(false);
	const rsrc = $derived(m.sources.restaurant_inspections);
	const cosrc = $derived(m.sources.co_dobnow);
	const coUrl = $derived(coBisUrl(a.co?.bin));
	const c311Start = $derived(m.complaints_311.start);
	// Set by the search box when it fell back to the nearest page (#59). Read in the
	// browser only: pages are prerendered, so the query string does not exist at build time.
	/** @type {{q: string, m: string} | null} */
	let nearNote = $state(null);
	$effect(() => {
		void a.id;
		const p = new URLSearchParams(window.location.search);
		nearNote = p.get('q') && p.get('m') ? { q: p.get('q') ?? '', m: p.get('m') ?? '' } : null;
	});
</script>

<svelte:head><title>{a.street} — SLAM v2 prototype</title></svelte:head>

<p class="no-print">
	<a href={resolve('/[district]', { district: data.slug })}>{data.district.label}</a> ·
	<a href={resolve('/[district]/map', { district: data.slug })}>Map</a>
</p>

<h1>{a.street}</h1>
<p class="muted">{a.city} {a.zip} · {data.district.label} · {#if a.co?.bin}Building (BIN) <code>{a.co.bin}</code>{:else}No BIN found{/if}</p>
{#if boundariesUrl(a.lon, a.lat)}
	<p class="no-print"><a href={boundariesUrl(a.lon, a.lat)}>See every district this address is in on Boundaries Map</a>
		<span class="muted">(BetaNYC's map of NYC's political and administrative districts)</span></p>
{/if}
{#if nearNote}
	<p class="note" role="status">You searched for {nearNote.q}. There is no page for that building, so this is the
		nearest address page on file, about {nearNote.m} m away.</p>
{/if}
{#if a.listed_as?.length > 1}
	<p class="muted">The sources list this building as: {a.listed_as.join('; ')}.</p>
{/if}
{#if pt.outside_districts && !pt.measured}
	<p class="note" role="note">The City's address point for this building is outside both prototype
		districts and outside the area this prototype pulls data for. The licensing records place it in
		{data.district.label}, so it is listed here as published, but SLAM does not show what is nearby: the
		distance sections below are left empty on purpose.</p>
{:else if pt.outside_districts}
	<p class="note" role="note">The City's address point for this building is just outside
		{data.district.label}, across the district line. The licensing records place it inside, so it is listed
		here as published. Distances are measured from the City's address point.</p>
{/if}

<h2>At this address ({a.records.length})</h2>
<div class="table-scroll">
	<table>
		<thead>
			<tr>
				<th scope="col">What</th>
				<th scope="col">Name</th>
				<th scope="col">Type / class</th>
				<th scope="col">Status</th>
				<th scope="col">Date</th>
				<th scope="col">ID</th>
			</tr>
		</thead>
		<tbody>
			{#each a.records as r, i (r.source + r.rid + i)}
				<tr>
					<td><span class="badge" style="background:{SOURCE_COLOR[r.source]}">{SOURCE_SHORT[r.source]}</span></td>
					<td>{r.name}{#if r.dba && r.legal_name && r.dba !== r.legal_name}<br /><span class="muted">{r.legal_name}</span>{/if}
						{#if r.street2}<br /><span class="muted">{addressLine(r)}</span>{/if}</td>
					<td>{r.type}{#if SLA_SOURCES.includes(r.source)}<br /><span class="muted">Type {r.ltype ?? '?'} · Class {r.lclass ?? '?'}</span>{:else if r.cls && r.cls !== '/'}<br /><span class="muted">{r.cls}</span>{/if}</td>
					<td>{r.status}</td>
					<td class="nowrap">{#if r.date}{r.date_label} {r.date}{/if}{#if r.issued}<br /><span class="muted">First issued {r.issued}</span>{/if}</td>
					<td><code>{r.rid}</code>{#if SLA_SOURCES.includes(r.source)}{@const lamp = lampUrl(r.plon ?? r.lon, r.plat ?? r.lat, lampLevel)}{@const rec = lampRecordUrl(r.source, r.rid, lampQuery)}{#if rec}<br /><a href={rec} aria-label="Open this license in LAMP: {r.name}, {r.rid}">Open this license in LAMP</a>{/if}<br />{#if lamp}<a href={lamp} aria-label="Show on the SLA's LAMP map: {r.name}, {r.rid}">Show on the SLA's LAMP map</a>{:else}<span class="muted">No point in the SLA data, so no LAMP link</span>{/if}{/if}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

{#if slaKeys.length}
	<SlaLicenseNote manifest={m} keys={slaKeys} />
{/if}

<h2>Nearby, within about {m.nearby_m} m ({a.nearby.length} addresses)</h2>
{#if a.nearby.length}
	<div class="table-scroll">
		<table>
			<thead>
				<tr>
					<th scope="col">Address</th>
					<th scope="col">Distance</th>
					<th scope="col">What is there</th>
				</tr>
			</thead>
			<tbody>
				{#each a.nearby as n (n.id)}
					<tr>
						<td><a href={resolve('/address/[id]', { id: n.id })}>{n.street}</a></td>
						<td>{n.m} m</td>
						<td>
							{#each n.records as r, i (i)}
								<div><span class="muted">{SOURCE_SHORT[r.source]}:</span> {r.name}{r.status ? ` (${r.status})` : ''}</div>
							{/each}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{:else}
	<p class="muted">{pt.measured === false ? 'Not measured for this address (see the note at the top).' : `No other listed addresses within ${m.nearby_m} m in this district's data.`}</p>
{/if}
<p class="note">
	Distances are straight-line between points, rounded to the meter. {#if pt.source === 'geosearch'}This
	page's point is the City's address point for the building, from the City's own address file.{#if pt.matched_by === 'pad-nearest'} This house number is not in the City's address file, so the point is the City's point for the nearest listed number on the same side of the street.{/if}{:else}This page's point is the
	average of its records' own points, because the City's address file did not match this address.{/if}
	Nearby only covers records
	inside the two prototype districts. This page lists facts from the sources; it does not apply any
	distance rule or make legal determinations.
</p>

<h2 id="sw">Schools and houses of worship nearby</h2>
<DistanceNote />
{#if near.length}
	<div class="table-scroll">
		<table>
			<caption>Schools, houses of worship and other religious property within about {sw.list_ft} ft of this address, building point to building point, nearest first ({near.length})</caption>
			<thead>
				<tr>
					<th scope="col">Name</th>
					<th scope="col">Type</th>
					<th scope="col">Approx. distance</th>
					<th scope="col">Same street?</th>
				</tr>
			</thead>
			<tbody>
				{#each near as f, i (f.kind + f.street + f.name + i)}
					<tr>
						<td>{swName(f)}{#if f.name && f.street}<br /><span class="muted">{f.street}</span>{/if}{#if f.note}<br /><span class="muted">Note: {f.note}</span>{/if}</td>
						<td>{SW_KIND[f.kind]}<br /><span class="muted">{f.type}</span></td>
						<td class="nowrap">about {f.ft} ft</td>
						<td>{sameStreetLabel(f.same_street)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{:else}
	<p class="muted">{pt.measured === false ? 'Not measured for this address (see the note at the top).' : `No schools or houses of worship in the data within about ${sw.list_ft} ft of this address.`}</p>
{/if}
<p class="muted">"Other religious property" is a tax lot in PLUTO building class M2, M3, M4 or M9 (mission
	house, parsonage or rectory, convent, miscellaneous). PLUTO does not say it is a place of worship.</p>

<h3 id="sw-liq">On-premises liquor licenses within about {sw.liquor_count_ft} ft</h3>
<p>
	{#if pt.measured === false}Not measured for this address (see the note at the top).{:else}
	<strong>{liq.premises}</strong> other address{liq.premises === 1 ? '' : 'es'} with an active on-premises
	liquor license within about {sw.liquor_count_ft} ft ({liq.licenses} license{liq.licenses === 1 ? '' : 's'}),
	not counting licenses at this address. Licenses in Manhattan, Brooklyn and Queens are counted.
	{#if liq.licenses}<a href="#sw-liq-list" onclick={() => (liqOpen = true)}>See the list</a>.{/if}{/if}
</p>
{#if liq.licenses}
	<details id="sw-liq-list" bind:open={liqOpen}>
		<summary>List of the {liq.licenses} license{liq.licenses === 1 ? '' : 's'}</summary>
		<div class="table-scroll">
			<table>
				<caption>Active on-premises liquor licenses within about {sw.liquor_count_ft} ft, nearest first</caption>
				<thead><tr><th scope="col">Name</th><th scope="col">Address</th><th scope="col">SLA class</th><th scope="col">Approx. distance</th></tr></thead>
				<tbody>
					{#each liq.rows as r, i (r.name + r.street + r.code + i)}
						<tr>
							<td>{r.name}</td>
							<td>{#if r.aid}<a href={resolve('/address/[id]', { id: r.aid })}>{r.street}</a>{:else}{r.street}{/if}</td>
							<td>{sw.on_premises_classes[r.code] ?? ''} <span class="muted">({r.code})</span></td>
							<td class="nowrap">about {r.ft} ft</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</details>
{/if}

{#if cann && sw.cannabis}
	<h3 id="sw-cannabis">For the cannabis records at this address</h3>
	<p>
		<a href={sw.cannabis.rule.url}>{sw.cannabis.rule.law}</a> uses different distances for cannabis
		dispensaries: about {sw.cannabis.school_ft} ft from a building containing a school, and about
		{sw.cannabis.worship_ft} ft from a building used only as a house of worship, both on the same street.
		{#if pt.measured === false}Not measured for this address (see the note at the top).{/if}
	</p>
	{#if cann.length}
		<div class="table-scroll">
			<table>
				<caption>Schools within about {sw.cannabis.school_ft} ft and houses of worship within about {sw.cannabis.worship_ft} ft, building point to building point, nearest first ({cann.length})</caption>
				<thead><tr><th scope="col">Name</th><th scope="col">Type</th><th scope="col">Approx. distance</th><th scope="col">Same street?</th></tr></thead>
				<tbody>
					{#each cann as f, i (f.kind + f.street + f.name + i)}
						<tr>
							<td>{swName(f)}{#if f.name && f.street}<br /><span class="muted">{f.street}</span>{/if}{#if f.note}<br /><span class="muted">Note: {f.note}</span>{/if}</td>
							<td>{SW_KIND[f.kind]}<br /><span class="muted">{f.type}</span></td>
							<td class="nowrap">about {f.ft} ft</td>
							<td>{sameStreetLabel(f.same_street)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else if pt.measured !== false}
		<p class="muted">No schools within about {sw.cannabis.school_ft} ft and no houses of worship within about {sw.cannabis.worship_ft} ft in the data.</p>
	{/if}
{/if}

<aside class="rule" aria-labelledby="rule-h">
	<h3 id="rule-h">The rules these distances relate to</h3>
	<p>
		<a href={rule.url}>{rule.law}</a> sets a 200-foot rule about schools and places of worship and a
		500-foot rule about three or more existing on-premises licensed premises, measured entrance to entrance. SLAM measures
		building point to building point, so every distance here is approximate. {#if cann}For cannabis,
		<a href={sw.cannabis?.rule.url}>Cannabis Law §72(6)</a> sets about {sw.cannabis?.school_ft} ft for
		schools and {sw.cannabis?.worship_ft} ft for houses of worship, also entrance to entrance.{/if}
		<strong>This page does not decide whether a rule applies</strong>; the State Liquor Authority (liquor)
		or the Cannabis Control Board (cannabis) makes that decision.
		<a href={resolve('/rules', {})}>The law's text, how SLAM measures, and the sources</a>.
	</p>
</aside>

<h2 id="c311">311 complaints</h2>
<p class="muted">
	Complaints to 311 at bar, club and restaurant location types, plus outdoor dining complaints, created
	on or after {c311Start}. A
	complaint is a report made to 311, not a finding.
</p>
<h3>At this address ({a.c311.n})</h3>
{#if a.c311.n}
	<CountTable311 rows={a.c311.by_type_year} years={a.c311.years} through={a.c311.through} caption="311 complaints at this address, by type and year" />
	<Complaints311Table rows={a.c311.recent} caption="Most recent at this address" />
{:else}
	<p class="muted">No 311 complaints matched to this address.</p>
{/if}
<h3>311 complaints nearby, within about {m.nearby_m} m ({a.c311_near.n})</h3>
{#if a.c311_near.n}
	<div class="table-scroll">
		<table>
			<caption>311 complaints within about {m.nearby_m} m, not counting this address, by type</caption>
			<thead><tr><th scope="col">Complaint type</th><th scope="col">Count</th></tr></thead>
			<tbody>
				{#each a.c311_near.by_type as t (t.type)}
					<tr><td>{t.type}</td><td>{t.n}</td></tr>
				{/each}
			</tbody>
		</table>
	</div>
{:else}
	<p class="muted">{pt.measured === false ? 'Not measured for this address (see the note at the top).' : `No other 311 complaints of these types within ${m.nearby_m} m.`}</p>
{/if}
<p class="note">
	"At this address" means the complaint's incident address and ZIP, normalized the same way as the
	license addresses (upper case, street suffixes and directions unified), equal this page's address.
	Complaints logged at an intersection or with a different spelling are not matched; they still count
	in "nearby" if their point is within {m.nearby_m} m.
</p>

<h2 id="health">Health inspections ({a.restaurants.length})</h2>
{#if a.restaurants.length}
	{#each a.restaurants as r (r.camis)}
		<section class="restaurant" aria-labelledby="rest-{r.camis}">
			<h3 id="rest-{r.camis}">{r.dba}</h3>
			<p class="muted">{r.street} {r.zip} · DOHMH record (CAMIS) <code>{r.camis}</code>{#if r.placed === 'point'} · placed on this page by location, about {r.m} m away{/if}</p>
			{#if r.not_inspected}
				<p><strong>Not yet inspected.</strong> The Health Department lists this restaurant with no inspection yet.</p>
			{:else if r.latest}
				<p><strong>Latest grade: {GRADE_LABEL[r.latest.grade] ?? r.latest.grade}</strong>{#if r.latest.grade_date}, graded {r.latest.grade_date}{/if}. Last inspected {r.last_inspected}.</p>
			{:else}
				<p><strong>No grade yet.</strong> Last inspected {r.last_inspected} ({r.n_inspections} inspection{r.n_inspections === 1 ? '' : 's'}, none graded).</p>
			{/if}
			{#if r.history.length}
				<div class="table-scroll">
					<table>
						<caption>Grade history for {r.dba}, newest first ({r.history.length} graded inspection{r.history.length === 1 ? '' : 's'})</caption>
						<thead><tr><th scope="col">Inspection date</th><th scope="col">Grade</th><th scope="col">Grade date</th><th scope="col">Score</th><th scope="col">Inspection type</th></tr></thead>
						<tbody>
							{#each r.history as h (h.date + h.type)}
								<tr><td class="nowrap">{h.date}</td><td>{GRADE_LABEL[h.grade] ?? h.grade}</td><td class="nowrap">{h.grade_date}</td><td>{h.score}</td><td>{h.type}</td></tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
			{#if abcEatsUrl(r.camis)}<p><a href={abcEatsUrl(r.camis)}>{r.dba} on ABC Eats (Health Department)</a></p>{/if}
		</section>
	{/each}
	<p class="note">
		From <a href={rsrc.url}>{rsrc.name}</a>, data last updated {fmtStamp(rsrc.rowsUpdatedAtIso)}. The
		dataset covers inspections up to three years before each restaurant's latest one, for restaurants
		that are active now. Grade history lists only inspections that gave a grade (A, B, C or grade
		pending); a lower score is better. A restaurant is on this page when its BIN matches this page's,
		or, without a match, when it is the closest page within about {m.address_geocode.nearest_page_m} m
		that lists the restaurant's own street address.
	</p>
{:else}
	<p class="muted">No restaurant inspection records matched to this address in <a href={rsrc.url}>{rsrc.name}</a>, data last updated {fmtStamp(rsrc.rowsUpdatedAtIso)}.</p>
{/if}

<h2 id="co">Certificate of occupancy</h2>
{#if a.co?.bin && coUrl}
	<p>
		Building (BIN) <code>{a.co.bin}</code>{#if a.co.bin_source === 'dohmh'} <span class="muted">(this address has no BIN of its own here; this BIN comes from the Health Department's record for a restaurant at the same street address)</span>{/if}.
		<a href={coUrl}>Certificates of occupancy for BIN {a.co.bin} (DOB BIS)</a>
	</p>
	<p class="muted">
		BIS lists COs issued before DOB NOW. For COs requested on or after March 1, 2021, search BIN
		{a.co.bin} in the <a href={DOB_NOW_PORTAL}>DOB NOW public portal</a> (its search has no direct link).
	</p>
	{#if a.co.records.length}
		<div class="table-scroll">
			<table>
				<caption>DOB NOW certificates of occupancy for BIN {a.co.bin} ({a.co.records.length})</caption>
				<thead><tr><th scope="col">Issued</th><th scope="col">Application number</th><th scope="col">CO record number</th><th scope="col">Filing type</th><th scope="col">Job type</th><th scope="col">Filing sequence</th></tr></thead>
				<tbody>
					{#each a.co.records as c (c.application + c.number)}
						<tr><td class="nowrap">{c.issued}</td><td><code>{c.application}</code></td><td><code>{c.number}</code></td><td>{c.filing_type}</td><td>{c.job_type}</td><td><code>{c.job}</code></td></tr>
					{/each}
				</tbody>
			</table>
		</div>
		<p class="note">From <a href={cosrc.url}>{cosrc.name}</a>, data last updated {fmtStamp(cosrc.rowsUpdatedAtIso)}.
			"Application number" is the dataset's <code>application_number</code>, which the portal describes as the CO number. "CO record number" is <code>c_of_o_number</code>, which the portal does not describe. "Filing sequence" is <code>job_filing_name</code>. One building can have several rows: a renewal or a later filing is its own row.</p>
	{:else}
		<p class="muted">No DOB NOW certificates for this BIN in <a href={cosrc.url}>{cosrc.name}</a>, data last updated {fmtStamp(cosrc.rowsUpdatedAtIso)}.</p>
	{/if}
{:else}
	<p><strong>No BIN found.</strong> This address could not be matched to one building, so there is no
		certificate of occupancy link. You can search by address in <a href="https://a810-bisweb.nyc.gov/bisweb/bispi00.jsp">DOB BIS</a>
		or the <a href={DOB_NOW_PORTAL}>DOB NOW public portal</a>. (Checked against <a href={cosrc.url}>{cosrc.name}</a>, data last updated {fmtStamp(cosrc.rowsUpdatedAtIso)}.)</p>
{/if}

<h2>Look it up at the source</h2>
<ul>
	<li><a href="https://lamp.sla.ny.gov/">NYS Liquor Authority — LAMP (license lookup)</a></li>
	<li><a href="https://www.diningoutnyc.info/">NYC DOT — Dining Out NYC</a></li>
	{#each usedSources as k (k)}
		<li><a href={m.sources[k].url}>{SOURCE_LABEL[k]}: {m.sources[k].name}</a> ({m.sources[k].domain})</li>
	{/each}
</ul>

<p class="no-print"><button class="btn secondary" type="button" onclick={() => window.print()}>Print this page</button></p>
