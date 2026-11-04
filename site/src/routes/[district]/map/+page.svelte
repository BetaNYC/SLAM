<script>
	// MapLibre GL JS on the City's own vector basemap (NYC OTI), with OpenFreeMap as the
	// fallback: see #lib/basemap.js. Vite worker via setWorkerUrl, per
	// https://openfreemap.org/quick_start/. Points and outline are this site's own static files.
	import { onMount } from 'svelte';
	import { resolve, asset } from '$app/paths';
	import { goto } from '$app/navigation';
	import { SOURCE_SHORT, SOURCE_COLOR, SW_COLOR } from '#lib/format.js';
	import { popup311 } from '#lib/popup311.js';
	import { popupSW } from '#lib/popupSW.js';
	import { chooseBasemap, basemapNote } from '#lib/basemap.js';
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
	// 311 complaints: dense, so OFF by default and fetched only when first switched on.
	let show311 = $state(false);
	/** @type {'idle' | 'loading' | 'ready'} */
	let state311 = 'idle';
	// Schools and houses of worship (#60): OFF by default, fetched on first switch-on.
	let showSW = $state(false);
	/** @type {'idle' | 'loading' | 'ready'} */
	let stateSW = 'idle';
	let mapReady = false;
	/** @type {any} */
	let Popup;
	/** @type {any} */
	let map;
	/** @type {HTMLDivElement} */
	let container;

	onMount(() => {
		let cancelled = false;
		(async () => {
			const [{ Map, NavigationControl, setWorkerUrl, Popup: P, Marker }, { default: workerUrl }] = await Promise.all([
				import('maplibre-gl'),
				import('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url')
			]);
			if (cancelled) return;
			setWorkerUrl(workerUrl);
			Popup = P;
			const [outline, points, basemap] = await Promise.all([
				fetch(asset('data/districts.geojson')).then((r) => r.json()),
				fetch(asset(/** @type {any} */ (`data/${data.slug}/points.geojson`))).then((r) => r.json()),
				chooseBasemap()
			]);
			if (cancelled) return;
			if (basemap.kind === 'fallback') console.warn('SLAM: City basemap unavailable, using OpenFreeMap:', basemap.reason);
			const note = basemapNote(basemap.kind);
			for (const k of LAYERS) counts[k] = points.features.filter((/** @type {any} */ f) => f.properties.source === k).length;
			const mine = { ...outline, features: outline.features.filter((/** @type {any} */ f) => f.properties.slug === data.slug) };

			map = new Map({
				container,
				style: basemap.style,
				center: [-73.98, 40.71],
				zoom: 13
			});
			map.addControl(new NavigationControl({}), 'top-right');
			map.on('error', (/** @type {any} */ e) => (status = `Map error: ${e?.error?.message ?? 'unknown'} (the list view still works)`));
			map.on('load', () => {
				map.addSource('district', { type: 'geojson', data: mine });
				// A white casing under the outline keeps it readable over the City basemap's streets and parks.
				map.addLayer({ id: 'district-casing', type: 'line', source: 'district', paint: { 'line-color': '#fff', 'line-width': 6, 'line-opacity': 0.85 } });
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
				// ?lon=&lat= (from the address search, #59): center on that spot and mark it.
				const qs = new URLSearchParams(window.location.search);
				const at = /** @type {[number, number]} */ ([Number(qs.get('lon')), Number(qs.get('lat'))]);
				const valid = qs.has('lon') && qs.has('lat') && at.every(Number.isFinite) && Math.abs(at[0] + 74) < 1 && Math.abs(at[1] - 40.7) < 1;
				if (valid) {
					map.jumpTo({ center: at, zoom: 17 });
					new Marker({ color: '#b45309' }).setLngLat(at).addTo(map);
					status = `Map loaded, centered on the address you searched for (orange marker). Select a point to open its address page. ${note}`;
				} else {
					map.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: 20 });
					status = `Map loaded. Select a point to open its address page. ${note}`;
				}
				mapReady = true;
				if (show311) toggle311();
				if (showSW) toggleSW();
			});
		})().catch((err) => (status = `Map could not load: ${err.message}. Use the list view.`));
		return () => {
			cancelled = true;
			map?.remove();
		};
	});

	async function toggle311() {
		if (!mapReady) return; // the map's load handler calls this again if the box is ticked
		if (state311 === 'ready') {
			map.setLayoutProperty('complaints_311', 'visibility', show311 ? 'visible' : 'none');
			return;
		}
		if (state311 === 'loading' || !show311) return;
		state311 = 'loading';
		status = 'Loading 311 complaints…';
		try {
			const pts = await fetch(asset(/** @type {any} */ (`data/${data.slug}/points-311.geojson`))).then((r) => r.json());
			map.addSource('c311', { type: 'geojson', data: pts });
			// Drawn under the license layers so their larger dots stay on top and clickable.
			map.addLayer(
				{
					id: 'complaints_311',
					type: 'circle',
					source: 'c311',
					layout: { visibility: show311 ? 'visible' : 'none' },
					paint: { 'circle-radius': 2.5, 'circle-color': SOURCE_COLOR.complaints_311, 'circle-opacity': 0.55 }
				},
				LAYERS[0]
			);
			map.on('click', 'complaints_311', (/** @type {any} */ e) => {
				// A license dot under the cursor wins; its own handler opens the address page.
				const on = LAYERS.filter((k) => visible[k] && map.getLayer(k));
				if (on.length && map.queryRenderedFeatures(e.point, { layers: on }).length) return;
				const f = e.features?.[0];
				if (!f) return;
				const aid = f.properties?.aid;
				if (aid) goto(resolve('/address/[id]', { id: aid }));
				else new Popup({ closeButton: true }).setLngLat(f.geometry.coordinates).setDOMContent(popup311(f.properties)).addTo(map);
			});
			map.on('mouseenter', 'complaints_311', () => (map.getCanvas().style.cursor = 'pointer'));
			map.on('mouseleave', 'complaints_311', () => (map.getCanvas().style.cursor = ''));
			state311 = 'ready';
			status = `311 complaints shown (${pts.features.length}).`;
		} catch (err) {
			state311 = 'idle';
			status = `311 complaints could not load: ${/** @type {Error} */ (err).message}`;
		}
	}

	async function toggleSW() {
		if (!mapReady) return; // the map's load handler calls this again if the box is ticked
		if (stateSW === 'ready') {
			map.setLayoutProperty('schools_worship', 'visibility', showSW ? 'visible' : 'none');
			return;
		}
		if (stateSW === 'loading' || !showSW) return;
		stateSW = 'loading';
		status = 'Loading schools and houses of worship…';
		try {
			const pts = await fetch(asset(`data/${data.slug}/schools-worship.geojson`)).then((r) => r.json());
			map.addSource('sw', { type: 'geojson', data: pts });
			// Drawn under the license layers so license dots stay on top and clickable.
			map.addLayer(
				{
					id: 'schools_worship',
					type: 'circle',
					source: 'sw',
					layout: { visibility: showSW ? 'visible' : 'none' },
					paint: {
						'circle-radius': 6,
						'circle-color': ['match', ['get', 'k'], 'school', SW_COLOR.school, 'worship', SW_COLOR.worship, SW_COLOR.religious],
						'circle-stroke-color': '#fff',
						'circle-stroke-width': 2
					}
				},
				LAYERS[0]
			);
			map.on('click', 'schools_worship', (/** @type {any} */ e) => {
				const on = LAYERS.filter((k) => visible[k] && map.getLayer(k));
				if (on.length && map.queryRenderedFeatures(e.point, { layers: on }).length) return;
				const f = e.features?.[0];
				if (f) new Popup({ closeButton: true }).setLngLat(f.geometry.coordinates).setDOMContent(popupSW(f.properties)).addTo(map);
			});
			map.on('mouseenter', 'schools_worship', () => (map.getCanvas().style.cursor = 'pointer'));
			map.on('mouseleave', 'schools_worship', () => (map.getCanvas().style.cursor = ''));
			stateSW = 'ready';
			/** @param {string} k */
			const nk = (k) => pts.features.filter((/** @type {any} */ f) => f.properties.k === k).length;
			status = `Schools and houses of worship shown (${nk('school')} schools, ${nk('worship')} houses of worship, ${nk('religious')} other religious properties, inside the district or within ${data.sw_buffer_ft} ft of its line).`;
		} catch (err) {
			stateSW = 'idle';
			status = `Schools and houses of worship could not load: ${/** @type {Error} */ (err).message}`;
		}
	}

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
	<label>
		<input type="checkbox" bind:checked={show311} onchange={toggle311} />
		<span class="swatch small" style="background:{SOURCE_COLOR.complaints_311}"></span>
		{SOURCE_SHORT.complaints_311} <span class="muted">({data.district.counts.complaints_311}, since {data.manifest.complaints_311.start})</span>
	</label>
	<label>
		<input type="checkbox" bind:checked={showSW} onchange={toggleSW} />
		<span class="swatch" style="background:{SW_COLOR.school}"></span><span class="swatch" style="background:{SW_COLOR.worship}"></span><span class="swatch" style="background:{SW_COLOR.religious}"></span>
		Schools / houses of worship / other religious property <span class="muted">({data.district.counts.schools} / {data.district.counts.worship} / {data.district.counts.religious} in the district)</span>
	</label>
</fieldset>
<p class="muted" role="status">{status}</p>
<div class="map" bind:this={container} role="region" aria-label="Map of {data.district.label}"></div>
<p class="note">311 complaints are off by default because they are dense. Selecting a 311 dot opens the
	address page it is matched to, if there is one; otherwise it shows the date, type and address.
	Schools (teal), houses of worship (dark pink) and other religious property (violet) are off by default;
	selecting one shows its name, type and address. Schools come from the City's Facilities Database; houses
	of worship are PLUTO tax lots in building class M1, and other religious property is class M2, M3, M4 or M9
	(PLUTO has no names). Street events have no coordinates in the source and are not on the map.
	The street map is the City's own basemap, from NYC's Office of Technology and Innovation; if it
	does not load, OpenFreeMap (OpenStreetMap data) is used instead.
	The list view is the accessible equivalent of this map: every license, cannabis, Dining Out, school and
	religious-property point is in it, and its 311 tab counts every complaint and lists the most recent ones.</p>

<style>
	.map { height: 70vh; min-height: 320px; border: 1px solid var(--line); }
	.layers { border: 1px solid var(--line); display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; margin: 0.5rem 0; }
	.layers label { display: inline-flex; align-items: center; gap: 0.35rem; }
	.swatch.small { width: 0.55rem; height: 0.55rem; opacity: 0.7; }
	.swatch { width: 0.8rem; height: 0.8rem; border-radius: 50%; display: inline-block; border: 1px solid #fff; outline: 1px solid #999; }
</style>
