<script>
	import { resolve } from '$app/paths';
	import { SOURCE_LABEL, SOURCE_SHORT, SOURCE_COLOR, addressLine, coBisUrl, abcEatsUrl, DOB_NOW_PORTAL, GRADE_LABEL, fmtStamp } from '#lib/format.js';
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
{#if nearNote}
	<p class="note" role="status">You searched for {nearNote.q}. There is no page for that building, so this is the
		nearest address page on file, about {nearNote.m} m away.</p>
{/if}
{#if a.listed_as?.length > 1}
	<p class="muted">The sources list this building as: {a.listed_as.join('; ')}.</p>
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
					<td>{r.type}{#if r.cls && r.cls !== '/'}<br /><span class="muted">{r.cls}</span>{/if}</td>
					<td>{r.status}</td>
					<td class="nowrap">{#if r.date}{r.date_label} {r.date}{/if}{#if r.issued}<br /><span class="muted">First issued {r.issued}</span>{/if}</td>
					<td><code>{r.rid}</code></td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

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
	<p class="muted">No other listed addresses within {m.nearby_m} m in this district's data.</p>
{/if}
<p class="note">
	Distances are straight-line between geocoded points, rounded to the meter. Nearby only covers records
	inside the two prototype districts. This page lists facts from the sources; it does not apply any
	distance rule or make legal determinations.
</p>

<h2 id="c311">311 complaints</h2>
<p class="muted">
	Complaints to 311 at bar, club and restaurant location types, created on or after {c311Start}. A
	complaint is a report made to 311, not a finding.
</p>
<h3>At this address ({a.c311.n})</h3>
{#if a.c311.n}
	<CountTable311 rows={a.c311.by_type_year} years={a.c311.years} through={a.c311.through} caption="311 complaints at this address, by type and year" />
	<Complaints311Table rows={a.c311.recent} caption="Most recent at this address" />
{:else}
	<p class="muted">No 311 complaints matched to this address.</p>
{/if}
<h3>311 complaints nearby, within {m.nearby_m} m ({a.c311_near.n})</h3>
{#if a.c311_near.n}
	<div class="table-scroll">
		<table>
			<caption>311 complaints within {m.nearby_m} m, not counting this address, by type</caption>
			<thead><tr><th scope="col">Complaint type</th><th scope="col">Count</th></tr></thead>
			<tbody>
				{#each a.c311_near.by_type as t (t.type)}
					<tr><td>{t.type}</td><td>{t.n}</td></tr>
				{/each}
			</tbody>
		</table>
	</div>
{:else}
	<p class="muted">No other 311 complaints of these types within {m.nearby_m} m.</p>
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
