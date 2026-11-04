<script>
	// MapLibre GL JS + OpenFreeMap, following https://openfreemap.org/quick_start/
	// (npm maplibre-gl, Vite worker via setWorkerUrl, style URL .../styles/liberty).
	// Points and outline are this site's own static files; only tiles come from OpenFreeMap.
	import { onMount } from 'svelte';
	import { resolve, asset } from '$app/paths';
	import { goto } from '$app/navigation';
	import { SOURCE_SHORT, SOURCE_COLOR } from '#lib/format.js';
	import 'maplibre-gl/dist/maplibre-gl.css';

	/** @type {{data: any}} */
	let { data } = $props();

	const LAYERS = ['liquor_pending', 'liquor_active', 'liquor_inactive', 'cannabis_retail', 'cannabis_license', 'dining_out'];
	/** @type {Record<string, boolean>} */
	let visible = $state({
		liquor_pending: true,
		liquor_active: true,
		liquor_inactive: false,
		cannabis_retail: true,
		cannabis_license: true,
		dining_out: true
	});
	/** @type {Record<string, number>} */
	let counts = $state({});
	let status = $state('Loading map…');
	/** @type {any} */
	let map;
	/** @type {HTMLDivElement} */
	let container;

	onMount(() => {
		let cancelled = false;
		(async () => {
			const [{ Map, NavigationControl, setWorkerUrl }, { default: workerUrl }] = await Promise.all([
				import('maplibre-gl'),
				import('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url')
			]);
			if (cancelled) return;
			setWorkerUrl(workerUrl);
			const [outline, points] = await Promise.all([
				fetch(asset('data/districts.geojson')).then((r) => r.json()),
				fetch(asset(/** @type {any} */ (`data/${data.slug}/points.geojson`))).then((r) => r.json())
			]);
			for (const k of LAYERS) counts[k] = points.features.filter((/** @type {any} */ f) => f.properties.source === k).length;
			const mine = { ...outline, features: outline.features.filter((/** @type {any} */ f) => f.properties.slug === data.slug) };

			map = new Map({
				container,
				style: 'https://tiles.openfreemap.org/styles/liberty',
				center: [-73.98, 40.71],
				zoom: 13
			});
			map.addControl(new NavigationControl({}), 'top-right');
			map.on('error', (/** @type {any} */ e) => (status = `Map error: ${e?.error?.message ?? 'unknown'} (the list view still works)`));
			map.on('load', () => {
				map.addSource('district', { type: 'geojson', data: mine });
				map.addLayer({ id: 'district-line', type: 'line', source: 'district', paint: { 'line-color': '#1a5ccf', 'line-width': 3 } });
				map.addSource('points', { type: 'geojson', data: points });
				for (const k of LAYERS) {
					map.addLayer({
						id: k,
						type: 'circle',
						source: 'points',
						filter: ['==', ['get', 'source'], k],
						layout: { visibility: visible[k] ? 'visible' : 'none' },
						paint: { 'circle-radius': 5, 'circle-color': SOURCE_COLOR[k], 'circle-stroke-color': '#fff', 'circle-stroke-width': 1 }
					});
					map.on('click', k, (/** @type {any} */ e) => {
						const aid = e.features?.[0]?.properties?.aid;
						if (aid) goto(resolve('/address/[id]', { id: aid }));
					});
					map.on('mouseenter', k, () => (map.getCanvas().style.cursor = 'pointer'));
					map.on('mouseleave', k, () => (map.getCanvas().style.cursor = ''));
				}
				const b = mine.features[0].geometry.coordinates.flat(2);
				const xs = b.map((/** @type {number[]} */ c) => c[0]);
				const ys = b.map((/** @type {number[]} */ c) => c[1]);
				map.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: 20 });
				status = 'Map loaded. Select a point to open its address page.';
			});
		})().catch((err) => (status = `Map could not load: ${err.message}. Use the list view.`));
		return () => {
			cancelled = true;
			map?.remove();
		};
	});

	/** @param {string} k */
	function toggle(k) {
		if (map?.getLayer(k)) map.setLayoutProperty(k, 'visibility', visible[k] ? 'visible' : 'none');
	}
</script>

<svelte:head><title>Map: {data.district.label} — SLAM v2 prototype</title></svelte:head>

<p class="no-print"><a href={resolve('/', {})}>All districts</a></p>
<h1>Map: {data.district.label}</h1>
<p><a class="btn secondary" href={resolve('/[district]', { district: data.slug })}>View as list</a></p>

<fieldset class="layers">
	<legend>Layers</legend>
	{#each LAYERS as k (k)}
		<label>
			<input type="checkbox" bind:checked={visible[k]} onchange={() => toggle(k)} />
			<span class="swatch" style="background:{SOURCE_COLOR[k]}"></span>
			{SOURCE_SHORT[k]} {#if counts[k] !== undefined}<span class="muted">({counts[k]})</span>{/if}
		</label>
	{/each}
</fieldset>
<p class="muted" role="status">{status}</p>
<div class="map" bind:this={container} role="region" aria-label="Map of {data.district.label}"></div>
<p class="note">Street events have no coordinates in the source and are not on the map. Every point is also in the list view, which is the accessible equivalent of this map.</p>

<style>
	.map { height: 70vh; min-height: 320px; border: 1px solid var(--line); }
	.layers { border: 1px solid var(--line); display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; margin: 0.5rem 0; }
	.layers label { display: inline-flex; align-items: center; gap: 0.35rem; }
	.swatch { width: 0.8rem; height: 0.8rem; border-radius: 50%; display: inline-block; border: 1px solid #fff; outline: 1px solid #999; }
</style>
