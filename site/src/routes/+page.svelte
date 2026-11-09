<script>
	import { resolve } from '$app/paths';
	import { fmtStamp } from '#lib/format.js';

	/** @type {{data: any}} */
	let { data } = $props();
	const m = $derived(data.manifest);
</script>

<svelte:head><title>SLAM v2 prototype</title></svelte:head>

<h1>What is licensed, pending, and permitted in your district</h1>
<p>
	Liquor licenses, cannabis licenses, outdoor dining, and permitted street events, from New York City
	and New York State open data. Pick a community district.
</p>

<ul class="cards">
	{#each Object.entries(m.districts) as [slug, d] (slug)}
		<li>
			<h2><a href={resolve('/[district]', { district: slug })}>{d.label}</a></h2>
			<p class="muted">
				{d.counts.liquor_pending} pending liquor applications · {d.counts.liquor_active} active liquor
				licenses · {d.counts.cannabis_retail + d.counts.cannabis_license} cannabis ·
				{d.counts.dining_out} Dining Out · {d.counts.street_events} street-event rows
			</p>
			<p>
				<a href={resolve('/[district]', { district: slug })}>List</a> ·
				<a href={resolve('/[district]/map', { district: slug })}>Map</a>
			</p>
		</li>
	{/each}
</ul>

<p class="muted">
	Data updated <time datetime={m.data_fetched}>{fmtStamp(m.data_fetched)}</time>. Only six districts
	are in this prototype. Maps use the City's own street basemap, from NYC's Office of Technology and
	Innovation, when it is available.
</p>
