<script>
	import favicon from '#lib/assets/favicon.svg';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { afterNavigate } from '$app/navigation';
	import { startAnalytics } from '#lib/analytics.js';
	import { fmtStamp } from '#lib/format.js';
	import AddressSearch from '#lib/AddressSearch.svelte';
	import './app.css';

	/** @type {{children: import('svelte').Snippet, data: any}} */
	let { children, data } = $props();
	const m = $derived(data.manifest);
	/** @param {string} id */
	const current = (id) => (page.route.id === id ? 'page' : undefined);

	// Traffic measurement (README, "Traffic measurement"; About, "What we measure about visits"):
	// one cleaned page view on the first load and on each client-side navigation, only on
	// slam.beta.nyc. No address, search, coordinates or fragment ever reaches Google.
	afterNavigate((nav) => {
		const send = startAnalytics(window);
		if (!send || !nav.to) return;
		// The base path ('' at slam.beta.nyc). $app/paths has no `base` export in SvelteKit 3, and
		// resolve() can be relative, so it is made absolute against the page first.
		const base = new URL(resolve('/', {}), window.location.href).pathname.replace(/\/$/, '');
		// A change of the #hash alone (the map's view, an in-page link) is not a new page.
		if (nav.from && nav.from.url.pathname === nav.to.url.pathname && nav.from.url.search === nav.to.url.search) return;
		send({ href: nav.to.url.href, title: document.title, referrer: nav.from ? nav.from.url.href : document.referrer, base });
	});
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
<section class="subbar no-print" aria-label="Find an address and data date">
	<div class="wrap">
		<AddressSearch />
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
</footer>

<style>
	.subbar { background: var(--bg-soft); border-bottom: 1px solid var(--line); padding: 0.6rem 0; }
	.subbar .wrap { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: 0.25rem 1.5rem; }
	.updated { margin: 0; font-size: 0.875rem; }
</style>
