<script>
	import { resolve } from '$app/paths';
	import RecordTable from './RecordTable.svelte';
	import CountTable311 from '#lib/CountTable311.svelte';
	import Complaints311Table from '#lib/Complaints311Table.svelte';
	import SlaLicenseNote from '#lib/SlaLicenseNote.svelte';
	import { toCsv, downloadText, fmtStamp, SW_KIND, swName } from '#lib/format.js';

	/** @type {{data: any}} */
	let { data } = $props();

	const TABS = [
		{ id: 'liquor', label: 'Liquor' },
		{ id: 'cannabis', label: 'Cannabis' },
		{ id: 'dining', label: 'Dining Out' },
		{ id: 'events', label: 'Street events' },
		{ id: 'c311', label: '311 complaints' },
		{ id: 'health', label: 'Health grades' },
		{ id: 'sw', label: 'Schools and worship' }
	];
	let tab = $state('liquor');
	let q = $state('');
	let showSports = $state(false);
	let showInactive = $state(false);

	/** @param {any[]} rows */
	function filt(rows) {
		const needle = q.trim().toLowerCase();
		if (!needle) return rows;
		return rows.filter((r) =>
			Object.values(r).some((v) => typeof v === 'string' && v.toLowerCase().includes(needle))
		);
	}

	const L = $derived(data.lists);
	const lampLevel = $derived(data.manifest.sla_license.lamp.level);
	const pending = $derived(filt(L.liquor_pending));
	const active = $derived(filt(L.liquor_active));
	const inactive = $derived(filt(L.liquor_inactive));
	const cannabis = $derived(filt([...L.cannabis_retail, ...L.cannabis_license]));
	const dining = $derived(filt(L.dining_out));
	const events = $derived(filt(L.street_events.filter((/** @type {any} */ e) => showSports || !e.sport)));
	const C = $derived(L.complaints_311);
	const c311 = $derived(filt(C.recent));
	const src311 = $derived(data.manifest.sources.complaints_311);
	const R = $derived(L.restaurants);
	let gradeFilter = $state('');
	const rest = $derived(filt(R.rows.filter((/** @type {any} */ r) => !gradeFilter || r.grade === gradeFilter)));
	const srcRest = $derived(data.manifest.sources.restaurant_inspections);
	const REST_COLS = ['camis', 'dba', 'street', 'zip', 'grade', 'grade_date', 'last_inspected', 'bin', 'aid', 'placed'];

	const SWL = $derived(L.schools_worship);
	const swRows = $derived(filt(SWL.rows.map((/** @type {any} */ r) => ({ ...r, kind_label: SW_KIND[r.kind] }))));
	const SW_COLS = ['kind_label', 'name', 'type', 'street', 'ft_outside', 'note'];
	const REC_COLS = ['source', 'rid', 'name', 'legal_name', 'dba', 'street', 'street2', 'city', 'zip', 'type', 'cls', 'ltype', 'lclass', 'status', 'date_label', 'date', 'lat', 'lon'];
	const C311_COLS = ['rid', 'date', 'type', 'descriptor', 'street', 'zip', 'agency', 'status'];
	const EV_COLS = ['rid', 'name', 'start', 'end', 'agency', 'type', 'location', 'street_side', 'closure', 'boards'];

	function downloadCsv() {
		const name = `slam-${data.slug}-${tab}.csv`;
		if (tab === 'liquor') downloadText(name, toCsv([...pending, ...active, ...(showInactive ? inactive : [])], REC_COLS));
		else if (tab === 'cannabis') downloadText(name, toCsv(cannabis, REC_COLS));
		else if (tab === 'dining') downloadText(name, toCsv(dining, REC_COLS));
		else if (tab === 'c311') downloadText(name, toCsv(c311, C311_COLS));
		else if (tab === 'health') downloadText(name, toCsv(rest, REST_COLS));
		else if (tab === 'sw') downloadText(name, toCsv(swRows, SW_COLS));
		else downloadText(name, toCsv(events, EV_COLS));
	}

	/** @param {KeyboardEvent} e @param {number} i */
	function tabKey(e, i) {
		const n = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
		if (!n) return;
		const next = TABS[(i + n + TABS.length) % TABS.length];
		tab = next.id;
		document.getElementById(`tab-${next.id}`)?.focus();
	}
</script>

<svelte:head><title>{data.district.label} — SLAM v2 prototype</title></svelte:head>

<p class="no-print"><a href={resolve('/', {})}>All districts</a></p>
<h1>My district: {data.district.label}</h1>
<p>
	<a class="btn secondary" href={resolve('/[district]/map', { district: data.slug })}>View on map</a>
</p>

<div class="tabs" role="tablist" aria-label="Record types">
	{#each TABS as t, i (t.id)}
		<button
			role="tab"
			id="tab-{t.id}"
			aria-selected={tab === t.id}
			aria-controls="panel"
			tabindex={tab === t.id ? 0 : -1}
			onclick={() => (tab = t.id)}
			onkeydown={(e) => tabKey(e, i)}>{t.label}</button
		>
	{/each}
</div>

<div class="toolbar">
	<label>
		Filter this tab
		<input type="search" bind:value={q} placeholder="name, address, type…" />
	</label>
	<button class="btn" type="button" onclick={downloadCsv}>Download CSV of this tab</button>
</div>

<div id="panel" role="tabpanel" aria-labelledby="tab-{tab}">
	{#if tab === 'liquor'}
		<RecordTable rows={pending} caption="Pending applications (SLA)" {lampLevel} />
		<RecordTable rows={active} caption="Active licenses (SLA)" {lampLevel} />
		<label class="no-print"><input type="checkbox" bind:checked={showInactive} /> Show inactive licenses ({L.liquor_inactive.length})</label>
		{#if showInactive}
			<RecordTable rows={inactive} caption="Inactive licenses (SLA)" {lampLevel} />
		{/if}
		<SlaLicenseNote manifest={data.manifest} keys={showInactive ? ['liquor_pending', 'liquor_active', 'liquor_inactive'] : ['liquor_pending', 'liquor_active']} />
		<p class="note">No "new this week" badge yet: the prototype keeps no history between runs.</p>
	{:else if tab === 'cannabis'}
		<RecordTable rows={cannabis} caption="Cannabis (OCM retail dealers and licenses)" showClass={false} />
		<p class="note">
			OCM license rows have no coordinates in the source; they are geocoded with NYC GeoSearch and
			shown only when the match is exact. Licenses with status "In-Process" are the closest thing to
			pending cannabis data in these datasets.
		</p>
	{:else if tab === 'dining'}
		<RecordTable rows={dining} caption="Dining Out NYC locations" showClass={false} />
	{:else if tab === 'c311'}
		<CountTable311
			rows={C.by_type_year}
			years={C.years}
			through={C.through}
			caption="311 complaints at bar, club and restaurant locations, and outdoor dining complaints, by type and year ({C.total} since {C.start})"
		/>
		<Complaints311Table rows={c311} caption="Most recent {C.recent.length} complaints" />
		<p class="note">
			311 service requests whose location type is "Club/Bar/Restaurant" or "Restaurant/Bar/Deli/Bakery",
			plus every "Outdoor Dining" complaint (handled by DOT; its location type is the sidewalk or street),
			created on or after {C.start}, from <a href={src311.url}>{src311.name}</a>. A complaint is a
			report made to 311, not a finding. Counted in this district when its point falls inside the
			district boundary. The count table covers every complaint; the list shows the most recent
			{C.recent.length}, and the filter and CSV apply to that list. The full set is at the source.
		</p>
	{:else if tab === 'health'}
		<div class="table-scroll">
			<table>
				<caption>Restaurants by current health grade ({R.total})</caption>
				<thead><tr><th scope="col">Current grade</th><th scope="col">Restaurants</th></tr></thead>
				<tbody>
					{#each R.buckets as b (b.bucket)}
						<tr><td>{b.bucket}</td><td>{b.n}</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
		<label class="no-print">
			Show grade
			<select bind:value={gradeFilter}>
				<option value="">All</option>
				{#each R.buckets as b (b.bucket)}<option value={b.bucket}>{b.bucket} ({b.n})</option>{/each}
			</select>
		</label>
		<div class="table-scroll">
			<table>
				<caption>Restaurants <span class="muted">({rest.length} rows)</span></caption>
				<thead>
					<tr>
						<th scope="col">Restaurant</th>
						<th scope="col">Address</th>
						<th scope="col">Current grade</th>
						<th scope="col">Grade date</th>
						<th scope="col">Last inspected</th>
					</tr>
				</thead>
				<tbody>
					{#each rest as r (r.camis)}
						<tr>
							<td>{r.dba}<br /><span class="muted">CAMIS {r.camis}</span></td>
							<td>{#if r.aid}<a href={resolve('/address/[id]', { id: r.aid })}>{r.street}</a>{:else}{r.street}<br /><span class="muted">not on an address page</span>{/if}</td>
							<td>{r.grade}</td>
							<td class="nowrap">{r.grade_date}</td>
							<td class="nowrap">{r.last_inspected}</td>
						</tr>
					{:else}
						<tr><td colspan="5" class="muted">No restaurants.</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
		<p class="note">
			From <a href={srcRest.url}>{srcRest.name}</a>, data last updated {fmtStamp(srcRest.rowsUpdatedAtIso)}.
			One row per restaurant (CAMIS), in this district by the Health Department's own community board.
			"Current grade" is the grade from the newest graded inspection; "Not yet inspected" means the
			Health Department lists the restaurant with no inspection yet. {R.stats.on_page_by_bin + R.stats.on_page_by_point}
			of {R.total} are on an address page ({R.stats.on_page_by_bin} by BIN, {R.stats.on_page_by_point} by location);
			the other {R.stats.not_on_a_page} are listed here only, because no address page in this
			prototype shares their BIN or lists their street address within about {data.manifest.address_geocode.nearest_page_m} m.
		</p>
	{:else if tab === 'sw'}
		<div class="table-scroll">
			<table>
				<caption>Schools, houses of worship and other religious property in or near this district <span class="muted">({swRows.length} rows)</span></caption>
				<thead>
					<tr>
						<th scope="col">Name</th>
						<th scope="col">Kind / type</th>
						<th scope="col">Where</th>
					</tr>
				</thead>
				<tbody>
					{#each swRows as r, i (r.kind + r.street + r.name + i)}
						<tr>
							<td>{swName(r)}{#if r.name && r.street}<br /><span class="muted">{r.street}</span>{/if}{#if r.note}<br /><span class="muted">Note: {r.note}</span>{/if}</td>
							<td>{r.kind_label}<br /><span class="muted">{r.type}</span></td>
							<td>{r.ft_outside ? `Outside the district, about ${r.ft_outside} ft from its line` : 'Inside the district'}</td>
						</tr>
					{:else}
						<tr><td colspan="3" class="muted">None.</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
		<p class="note">
			The same points as the map's schools and houses of worship layer: everything inside the district or
			within about {SWL.buffer_ft} ft of its line, because a school across the line can be near an address
			inside. Schools are K-12 schools from <a href={data.manifest.sources.schools.url}>{data.manifest.sources.schools.name}</a>.
			Houses of worship are PLUTO tax lots in building class M1; other religious property is class M2, M3, M4
			or M9, which PLUTO does not call a place of worship (<a href={data.manifest.sources.worship.url}>{data.manifest.sources.worship.name}</a>).
			PLUTO has no names, so lots are listed by address. Distances to each address are on the address pages;
			<a href={resolve('/rules', {})}>how they are measured</a>.
		</p>
	{:else}
		<label class="no-print"><input type="checkbox" bind:checked={showSports} /> Include youth and adult sports permits</label>
		<div class="table-scroll">
			<table>
				<caption>Permitted events (approved permits only) <span class="muted">({events.length} rows)</span></caption>
				<thead>
					<tr>
						<th scope="col">Event</th>
						<th scope="col">When</th>
						<th scope="col">Where</th>
						<th scope="col">Type / agency</th>
						<th scope="col">Closure</th>
					</tr>
				</thead>
				<tbody>
					{#each events as e, i (e.rid + e.start + i)}
						<tr>
							<td>{e.name}</td>
							<td>{e.start}<br /><span class="muted">to {e.end}</span></td>
							<td>{e.location}{#if e.street_side}<br /><span class="muted">{e.street_side}</span>{/if}</td>
							<td>{e.type}<br /><span class="muted">{e.agency}</span></td>
							<td>{e.closure}</td>
						</tr>
					{:else}
						<tr><td colspan="5" class="muted">No events.</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
		<p class="note">Street events have no coordinates in the source, so they are list-only. Each row is one occurrence; one permit can have many dates.</p>
	{/if}
</div>
