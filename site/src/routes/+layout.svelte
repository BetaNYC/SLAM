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
	/** @param {string} id */
	const current = (id) => (page.route.id === id ? 'page' : undefined);
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<a class="skip" href="#main">Skip to content</a>
<header class="site">
	<div class="wrap">
		<a class="brand" href={resolve('/', {})}>SLAM <span>v2 prototype</span></a>
		<p class="banner">
			<strong>Prototype</strong> — data from
			<a href="https://data.cityofnewyork.us/">NYC Open Data</a> and
			<a href="https://data.ny.gov/">data.ny.gov</a>, updated
			<time datetime={m.data_fetched}>{fmtStamp(m.data_fetched)}</time>.
		</p>
		<nav class="site-nav" aria-label="Site">
			<a href={resolve('/', {})} aria-current={current('/')}>Districts</a>
			<a href={resolve('/about', {})} aria-current={current('/about')}>About</a>
			<a href={resolve('/glossary', {})} aria-current={current('/glossary')}>Glossary</a>
			<a href={resolve('/rules', {})} aria-current={current('/rules')}>Rules</a>
		</nav>
		<AddressSearch />
	</div>
</header>

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
</footer>

<style>
	.site-nav { flex-wrap: wrap; }
	.site-nav a[aria-current='page'] { font-weight: 700; text-decoration-thickness: 2px; }
</style>
