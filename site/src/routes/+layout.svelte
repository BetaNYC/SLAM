<script>
	import favicon from '#lib/assets/favicon.svg';
	import { resolve } from '$app/paths';
	import { fmtStamp } from '#lib/format.js';
	import AddressSearch from '#lib/AddressSearch.svelte';
	import './app.css';

	/** @type {{children: import('svelte').Snippet, data: any}} */
	let { children, data } = $props();
	const m = $derived(data.manifest);
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
		<AddressSearch />
	</div>
</header>

<main id="main" class="wrap">
	{@render children()}
</main>

<footer class="site wrap">
	<h2>Sources</h2>
	<ul class="sources">
		{#each Object.entries(m.sources) as [key, s] (key)}
			<li>
				<a href={s.url}>{s.name}</a> ({s.domain}, <code>{s.id}</code>) — portal rows updated
				{fmtStamp(s.rowsUpdatedAtIso)}
			</li>
		{/each}
	</ul>
	<p>
		Facts only, as published by the City and State. This page does not make legal determinations.
		A <a href="https://beta.nyc/">BetaNYC</a> prototype.
	</p>
</footer>
