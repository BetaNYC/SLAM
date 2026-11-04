<script>
	import { resolve } from '$app/paths';
	import { SOURCE_LABEL, SOURCE_SHORT, SOURCE_COLOR, addressLine } from '#lib/format.js';
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
			...(a.c311.n || a.c311_near.n ? ['complaints_311'] : [])
		])
	]);
	const c311Start = $derived(m.complaints_311.start);
</script>

<svelte:head><title>{a.street} — SLAM v2 prototype</title></svelte:head>

<p class="no-print">
	<a href={resolve('/[district]', { district: data.slug })}>{data.district.label}</a> ·
	<a href={resolve('/[district]/map', { district: data.slug })}>Map</a>
</p>

<h1>{a.street}</h1>
<p class="muted">{a.city} {a.zip} · {data.district.label}</p>

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

<h2>Look it up at the source</h2>
<ul>
	<li><a href="https://lamp.sla.ny.gov/">NYS Liquor Authority — LAMP (license lookup)</a></li>
	<li><a href="https://www.diningoutnyc.info/">NYC DOT — Dining Out NYC</a></li>
	{#each usedSources as k (k)}
		<li><a href={m.sources[k].url}>{SOURCE_LABEL[k]}: {m.sources[k].name}</a> ({m.sources[k].domain})</li>
	{/each}
</ul>

<p class="no-print"><button class="btn secondary" type="button" onclick={() => window.print()}>Print this page</button></p>
