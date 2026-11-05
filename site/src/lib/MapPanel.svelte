<script>
	// Side panel for the map (#75): what was selected, without leaving the map. An address shows a
	// summary of its page (fetched from the same static file the page uses) and a link to the page.
	import { resolve, asset } from '$app/paths';
	import { SOURCE_SHORT, SOURCE_COLOR, GRADE_LABEL, SW_KIND, swName, c311Group, boundariesUrl } from '#lib/format.js';
	import DistanceNote from '#lib/DistanceNote.svelte';

	/**
	 * @type {{
	 *   sel: {aid?: string, kind: 'address' | 'c311' | 'c311point' | 'sw', props?: any} | null,
	 *   onclose: () => void
	 * }}
	 */
	let { sel, onclose } = $props();

	/** @type {any} */
	let a = $state(null);
	let loading = $state(false);
	let error = $state('');
	/** @type {HTMLElement | undefined} */
	let heading = $state();

	$effect(() => {
		const aid = sel?.aid;
		a = null;
		error = '';
		if (!aid) return;
		let stale = false;
		loading = true;
		fetch(asset(/** @type {any} */ (`data/address/${aid}.json`)))
			.then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
			.then((j) => { if (!stale) a = j; })
			.catch((e) => { if (!stale) error = `Could not load this address: ${e.message}.`; })
			.finally(() => { if (!stale) loading = false; });
		return () => (stale = true);
	});

	// Move focus to the panel's heading when something new is selected, for keyboard and screen-reader users.
	$effect(() => {
		void sel;
		void a;
		heading?.focus();
	});

	/** Top 311 complaint types at the address, all years. */
	const top311 = $derived((a?.c311?.by_type_year ?? []).slice(0, 4));
</script>

{#if sel}
	<aside class="panel" aria-labelledby="panel-h">
		<button class="close" type="button" onclick={onclose} aria-label="Close details">×</button>
		{#if sel.aid}
			{#if loading}
				<h2 id="panel-h" tabindex="-1" bind:this={heading}>Loading…</h2>
			{:else if error}
				<h2 id="panel-h" tabindex="-1" bind:this={heading}>Address</h2>
				<p>{error}</p>
			{:else if a}
				<h2 id="panel-h" tabindex="-1" bind:this={heading}>{a.street}</h2>
				<p class="muted">{a.city ?? ''} {a.zip ?? ''}{#if a.bin}{` · BIN ${a.bin}`}{/if}</p>
				<p><a class="btn" href={resolve('/address/[id]', { id: a.id })}>Open the full address page</a></p>
				{#if boundariesUrl(a.lon, a.lat)}<p><a href={boundariesUrl(a.lon, a.lat)}>Districts for this address on Boundaries Map</a></p>{/if}

				{#if sel.kind === 'c311' && sel.props}
					<p class="sel-note">You selected a 311 complaint: <strong>{sel.props.t}</strong>, {sel.props.d}.</p>
				{:else if sel.kind === 'c311point' && sel.props}
					<p class="sel-note">You selected {sel.props.n} 311 complaints at this point.</p>
				{/if}

				<h3>At this address ({a.records.length})</h3>
				<ul class="recs">
					{#each a.records as r, i (r.source + (r.rid ?? '') + i)}
						<li>
							<span class="badge" style="background:{SOURCE_COLOR[r.source] ?? '#414141'}">{SOURCE_SHORT[r.source] ?? r.source}</span>
							{r.name}{#if r.type}<span class="muted">{` · ${r.type}`}</span>{/if}{#if r.status}<span class="muted">{` · ${r.status}`}</span>{/if}
						</li>
					{/each}
				</ul>

				<h3>311 complaints at this address ({a.c311?.n ?? 0})</h3>
				{#if top311.length}
					<ul class="plain">
						{#each top311 as t (t.type)}
							<li><span class="dot" style="background:{c311Group(t.type).color}"></span>{t.type}: {t.total}</li>
						{/each}
					</ul>
				{/if}
				{#if a.c311_near?.n}<p class="muted">{a.c311_near.n} more within about 150 m.</p>{/if}

				{#if a.restaurants?.length}
					<h3>Health grades</h3>
					<ul class="plain">
						{#each a.restaurants as r (r.camis)}
							<li>{r.dba}: {#if r.not_inspected}not yet inspected{:else if r.latest}{GRADE_LABEL[r.latest.grade] ?? r.latest.grade}{#if r.latest.grade_date} ({r.latest.grade_date}){/if}{:else}no grade yet{/if}</li>
						{/each}
					</ul>
				{/if}

				{#if a.point?.measured !== false}
					<h3>Nearby, approximate</h3>
					<ul class="plain">
						<li>Schools, houses of worship or other religious property within about 200 ft: {a.sw?.near?.length ?? 0}</li>
						<li>Other addresses with an on-premises liquor license within about 500 ft: {a.sw?.liq?.premises ?? 0}</li>
						{#if a.cannabis_sw}
							<li>For the cannabis records here, schools within about 500 ft or houses of worship within about 200 ft: {a.cannabis_sw.length}</li>
						{/if}
					</ul>
					<DistanceNote compact />
				{/if}
			{/if}
		{:else if sel.kind === 'sw' && sel.props}
			<h2 id="panel-h" tabindex="-1" bind:this={heading}>{swName({ name: sel.props.n, kind: sel.props.k, street: sel.props.s })}</h2>
			<p>{SW_KIND[sel.props.k] ?? ''}{#if sel.props.t}: {sel.props.t}{/if}</p>
			<p class="muted">{sel.props.s || '(no address)'}</p>
		{:else if sel.kind === 'c311' && sel.props}
			<h2 id="panel-h" tabindex="-1" bind:this={heading}>311 complaint</h2>
			<p><strong>{sel.props.t}</strong>, {sel.props.d}</p>
			<p class="muted">{sel.props.s || '(no address)'}. No SLAM address page matches this complaint.</p>
		{:else if sel.kind === 'c311point' && sel.props}
			<h2 id="panel-h" tabindex="-1" bind:this={heading}>{sel.props.n} 311 complaints here</h2>
			<p class="muted">{sel.props.s || '(no address)'} · newest {sel.props.d}</p>
			<p>{sel.props.types}</p>
		{/if}
	</aside>
{/if}

<style>
	.panel { position: relative; border: 1px solid var(--line); padding: 0.75rem 1rem; overflow-y: auto; max-height: 70vh; background: #fff; }
	.panel h2 { font-size: 1.15rem; margin: 0 2rem 0.25rem 0; }
	.panel h2:focus { outline: none; }
	.panel h3 { font-size: 1rem; margin: 0.9rem 0 0.3rem; }
	.close { position: absolute; top: 0.4rem; right: 0.5rem; font-size: 1.4rem; line-height: 1; background: none; border: 0; cursor: pointer; color: var(--ink); padding: 0.2rem 0.4rem; }
	.recs, .plain { list-style: none; padding: 0; margin: 0; font-size: 0.9rem; }
	.recs li, .plain li { padding: 0.2rem 0; border-bottom: 1px solid #f1f1f1; }
	.dot { display: inline-block; width: 0.6rem; height: 0.6rem; border-radius: 50%; margin-right: 0.35rem; }
	.sel-note { background: var(--bg-soft); padding: 0.35rem 0.5rem; font-size: 0.9rem; }
	@media (max-width: 52rem) { .panel { max-height: none; } }
</style>
