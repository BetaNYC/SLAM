<script>
	import favicon from '#lib/assets/favicon.svg';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { fmtStamp } from '#lib/format.js';
	import AddressSearch from '#lib/AddressSearch.svelte';
	import './app.css';

	/** @type {{children: import('svelte').Snippet, data: any}} */
	let { children, data } = $props();
	const m = $derived(data.manifest);
	// The What's changed page ships with no SvelteKit client (csr = false in its +page.js), so the
	// address search, which needs the client, would be a dead control there. Leave it out.
	const noClient = $derived(page.route.id === '/whats-changed');
	/** @param {string} id */
	const current = (id) => (page.route.id === id ? 'page' : undefined);
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<a class="skip" href="#main">Skip to content</a>
<!-- Same structure and styles as BoardStat 2.0 (beta.nyc/boardstat/v2): brand, tag, nav on the right. -->
<header class="site">
	<a class="brand" href={resolve('/', {})}>SLAM 2.0</a><span class="tag">prototype</span>
	<nav class="site-nav" aria-label="Site">
		<a href={resolve('/', {})} aria-current={current('/')}>Districts</a>
		<a href={resolve('/about', {})} aria-current={current('/about')}>About</a>
		<a href={resolve('/glossary', {})} aria-current={current('/glossary')}>Glossary</a>
		<a href={resolve('/rules', {})} aria-current={current('/rules')}>Rules</a>
	</nav>
</header>
<!-- A named section, so the date line sits in a landmark like the rest of the page (#53, axe "region"). -->
<section class="subbar no-print" aria-label={noClient ? 'Data date' : 'Find an address and data date'}>
	<div class="wrap">
		{#if !noClient}<AddressSearch />{/if}
		<p class="updated">
			Data from <a href="https://data.cityofnewyork.us/">NYC Open Data</a> and
			<a href="https://data.ny.gov/">data.ny.gov</a>, updated
			<time datetime={m.data_fetched}>{fmtStamp(m.data_fetched)}</time>.
		</p>
	</div>
</section>

<main id="main" class="wrap">
	{@render children()}
</main>

<footer class="site wrap">
	<p>
		Data from {Object.keys(m.sources).length} City and State open datasets, updated
		<time datetime={m.data_fetched}>{fmtStamp(m.data_fetched)}</time>. See
		<a href={resolve('/about', {})}>About</a> for every source and the
		<a href={resolve('/glossary', {})}>Glossary</a> for every term.
		Street map: NYC Basemap (SOURCE: NYC OTI, powered by Esri), or
		<a href="https://openfreemap.org/">OpenFreeMap</a> (<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap</a> contributors) if it does not load.
	</p>
	<p>
		Facts only, as published by the City and State. This page does not make legal determinations.
		A <a href="https://beta.nyc/">BetaNYC</a> prototype. Not an official City of New York product.
	</p>
	<p>
		<!-- A full page load: that page runs without the SvelteKit client (whats-changed/+page.js). -->
		<a href={resolve('/whats-changed', {})} data-sveltekit-reload>What's changed</a>: new data, fixes
		and corrections, newest first.
	</p>
</footer>

<style>
	.subbar { background: var(--bg-soft); border-bottom: 1px solid var(--line); padding: 0.6rem 0; }
	.subbar .wrap { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: 0.25rem 1.5rem; }
	.updated { margin: 0; font-size: 0.875rem; }
</style>
