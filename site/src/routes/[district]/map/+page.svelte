<script>
	// MapLibre GL JS on the City's own vector basemap (NYC OTI), with OpenFreeMap as the
	// fallback: see #lib/basemap.js. Vite worker via setWorkerUrl, per
	// https://openfreemap.org/quick_start/. Points and outline are this site's own static files.
	import { onMount, tick } from 'svelte';
	import { resolve, asset } from '$app/paths';
	import { replaceState } from '$app/navigation';
	import MapPanel from '#lib/MapPanel.svelte';
	import { parseHash, buildHash, loadPrefs, storePrefs, clearPrefs, layerToggles, prefsGate, MAP_DEFAULTS, EXTRA_KEYS } from '#lib/mapState.js';
	import { SOURCE_SHORT, SOURCE_COLOR, SOURCE_HOLLOW, SW_COLOR, C311_GROUPS, c311ColorExpr } from '#lib/format.js';
		import { C311_MODES, STACK_CAP, STACK_STEP_PX, c311DotPaint, stackChips, pointSummaries, groupColorExpr, sizedRadiusExpr } from '#lib/c311Display.js';
	import { chooseBasemap, basemapNote, basemapSwitcher, carryOverlays, SWITCH_NOTE, FALLBACK_STYLE_URL } from '#lib/basemap.js';
	import { ringSpecs, groupRingSpecs, ringFeatures, ringLegendText, ringLine, ringSharedNote, LICENSE_GROUPS, RING_COLOR, RING_SHARED_LINE, RING_COLOR_NOTE, RING_LAYER_NAME, RING_NOTE, RING_NO_LIQUOR_500, RING_LIST_NOTE } from '#lib/rings.js';
	import 'maplibre-gl/dist/maplibre-gl.css';

	/** @type {{data: any}} */
	let { data } = $props();

	const HALO = '-halo';
	/** The dark edge around each record dot: 5.8:1 on the City's park green, 5.9:1 on its water blue. */
	const DOT_EDGE = '#1f2937';
	const LAYERS = ['liquor_pending', 'liquor_active', 'liquor_inactive', 'cannabis_retail', 'cannabis_license', 'dining_out'];
	/** How the map first opens, from the one list of defaults that "Reset to default" also uses (#114). */
	const INITIAL = layerToggles(MAP_DEFAULTS.on, LAYERS, LICENSE_GROUPS);
	/** @type {Record<string, boolean>} */
	let visible = $state({ ...INITIAL.visible });
	/** @type {Record<string, number>} */
	let counts = $state({});
	let status = $state('Loading map…');
	// 311 complaints: ON by default (MAP_DEFAULTS), fetched when the map loads.
	let show311 = $state(INITIAL.show311);
	/** @type {'idle' | 'loading' | 'ready'} */
	let state311 = 'idle';
	/** How 311 complaints are drawn: stacked chips, sized circles or plain dots (#29, compare). */
	let mode311 = $state(MAP_DEFAULTS.c311);
	/** Label font for 311 counts; each basemap serves its own fonts. */
	let labelFont = ['Source Sans Pro Bold'];
	const STACK_LAYERS = Array.from({ length: STACK_CAP }, (_, i) => `c311-stack-${i}`);
	/** @type {Record<string, string[]>} */
	const MODE_LAYERS = {
		dots: ['complaints_311'],
		stacks: [...STACK_LAYERS, 'c311-stack-label'],
		sized: ['c311-sized', 'c311-sized-label']
	};
	// Schools and houses of worship (#60): ON by default (MAP_DEFAULTS), fetched when the map loads.
	let showSW = $state(INITIAL.showSW);
	/** @type {'idle' | 'loading' | 'ready'} */
	let stateSW = 'idle';
	/** @type {Promise<any> | null} The district's schools-worship.geojson, fetched once for points and rings. */
	let swData = null;
	// Distance rings around schools and houses of worship (#111): one toggle per license group, each
	// drawing only its own law's rings; liquor on and cannabis off by default (MAP_DEFAULTS), built when first on.
	let ringsOn = $state(/** @type {{liquor: boolean, cannabis: boolean}} */ ({ ...INITIAL.ringsOn }));
	const anyRings = $derived(ringsOn.liquor || ringsOn.cannabis);
	/** @type {'idle' | 'loading' | 'ready'} */
	let stateRings = 'idle';
	/** What is drawn: the groups' rings, a shared ring once (#lib/rings.js). */
	const RINGS = $derived(ringSpecs(data.ring_ft, ringsOn));
	/** Each group's own legend, the same whichever toggles are on. */
	const GROUP_RINGS = $derived(Object.fromEntries(LICENSE_GROUPS.map((g) => [g.key, groupRingSpecs(data.ring_ft, g.key)])));
	const sharedNote = $derived(ringSharedNote(RINGS));
	/** Record layers outside the license groups (Dining Out). */
	const OTHER_LAYERS = LAYERS.filter((k) => !LICENSE_GROUPS.some((g) => g.layers.includes(k)));
	const RING_LINE_LAYERS = ['rings-casing', 'rings-liquor', 'rings-cannabis', 'rings-label'];
	let mapReady = false;
	/** What the side panel shows (#75). @type {{aid?: string, kind: 'address' | 'c311' | 'c311point' | 'sw', props?: any} | null} */
	let sel = $state(null);
	/** The Layers box is an accordion; its open state is remembered (#77). */
	let layersOpen = $state(MAP_DEFAULTS.open);
	const KNOWN = [...LAYERS, ...EXTRA_KEYS];
	/** Layers from a link are shown, not saved, until the person changes something (#118). */
	let gate = prefsGate(null);

	/** Layer keys that are on, for the URL and saved preferences. */
	function onKeys() {
		return [...LAYERS.filter((k) => visible[k]), ...(show311 ? ['c311'] : []), ...(showSW ? ['sw'] : []), ...LICENSE_GROUPS.filter((g) => ringsOn[g.key]).map((g) => g.ringKey)];
	}

	/** Put the view, layers, 311 style and selection in the URL hash, and save layer choices (#75). */
	function writeState() {
		if (!mapReady || !map) return;
		const c = map.getCenter();
		const on = onKeys();
		const hash = buildHash({ view: { z: map.getZoom(), lat: c.lat, lon: c.lng }, on, c311: mode311, sel: sel?.aid ?? null });
		if (window.location.hash.slice(1) !== hash) replaceState(`${window.location.pathname}${window.location.search}#${hash}`, {});
		if (gate.open) storePrefs(window.localStorage, { on, c311: mode311, open: layersOpen });
	}

	/**
	 * Show something in the side panel and ring it on the map.
	 * @param {{aid?: string, kind: 'address' | 'c311' | 'c311point' | 'sw', props?: any} | null} next
	 * @param {number[]} [coords]
	 */
	async function select(next, coords) {
		sel = next;
		const src = map?.getSource('selected');
		if (src) src.setData({ type: 'FeatureCollection', features: next && coords ? [{ type: 'Feature', geometry: { type: 'Point', coordinates: coords }, properties: {} }] : [] });
		await tick();
		map?.resize();
		writeState();
	}
	// Set while the map swaps from the City basemap to OpenFreeMap (at most once per page view).
	/** @type {Promise<void> | null} */
	let swapping = null;
	/** @type {any} */
	let Popup;
	/** @type {any} */
	let map;
	/** @type {HTMLDivElement} */
	let container;

	onMount(() => {
		let cancelled = false;
		// Restore layers and the 311 style: URL hash first, then saved choices, then defaults (#75).
		const hs = parseHash(window.location.hash, KNOWN);
		const prefs = loadPrefs(window.localStorage, KNOWN);
		gate = prefsGate(hs.on);
		const on = hs.on ?? prefs?.on;
		if (on) setToggles(on);
		mode311 = hs.c311 ?? prefs?.c311 ?? mode311;
		if (prefs) layersOpen = prefs.open;
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
			/** @type {ReturnType<typeof basemapSwitcher>} */
			let switcher;
			const note = () => basemapNote(switcher?.switched ? 'fallback' : basemap.kind);
			if (basemap.kind === 'fallback') labelFont = ['Noto Sans Bold'];
			for (const k of LAYERS) counts[k] = points.features.filter((/** @type {any} */ f) => f.properties.source === k).length;
			const mine = { ...outline, features: outline.features.filter((/** @type {any} */ f) => f.properties.slug === data.slug) };

			map = new Map({
				container,
				style: basemap.style,
				center: [-73.98, 40.71],
				zoom: 13
			});
			map.addControl(new NavigationControl({}), 'top-right');
			// The City can fail after start-up (tiles, sprite, style). On its first error, swap once to
			// OpenFreeMap, carrying our overlay sources and layers over (MapLibre's setStyle
			// transformStyle). Layer click handlers are bound by layer id on the map, so they keep working.
			switcher = basemapSwitcher(basemap.kind, () => {
				console.warn('SLAM: City basemap failed after load, switching to OpenFreeMap.');
				status = SWITCH_NOTE;
				labelFont = ['Noto Sans Bold'];
				swapping = new Promise((done) => {
					const onStyle = () => {
						if (map.getSource('esri')) return; // the City style's own style.load
						map.off('style.load', onStyle);
						reapplyVisibility();
						swapping = null;
						done();
					};
					map.on('style.load', onStyle);
				});
				map.setStyle(FALLBACK_STYLE_URL, { diff: false, transformStyle: carryOverlays(Object.keys(basemap.style.sources)) });
			});
			// Errors go to the console, not the live region; the switch announces itself once.
			map.on('error', (/** @type {any} */ e) => {
				console.warn('SLAM map error:', e?.error?.message ?? e);
				switcher.handle(e);
			});
			map.on('load', () => {
				map.addSource('district', { type: 'geojson', data: mine });
				// A white casing under the outline keeps it readable over the City basemap's streets and parks.
				map.addLayer({ id: 'district-casing', type: 'line', source: 'district', paint: { 'line-color': '#fff', 'line-width': 6, 'line-opacity': 0.85 } });
				map.addLayer({ id: 'district-line', type: 'line', source: 'district', paint: { 'line-color': '#2359a8', 'line-width': 3 } });
				map.addSource('points', { type: 'geojson', data: points });
				// Each record dot has a white ring and, under it, a thin dark edge (a "halo" layer), so it
				// stands out on the City's park green and water blue as well as on land (QA #69, finding 4).
				for (const k of LAYERS) {
					map.addLayer({
						id: `${k}${HALO}`,
						type: 'circle',
						source: 'points',
						filter: ['==', ['get', 'source'], k],
						layout: { visibility: visible[k] ? 'visible' : 'none' },
						paint: { 'circle-radius': 7.5, 'circle-color': DOT_EDGE }
					});
				}
				for (const k of LAYERS) {
					map.addLayer({
						id: k,
						type: 'circle',
						source: 'points',
						filter: ['==', ['get', 'source'], k],
						layout: { visibility: visible[k] ? 'visible' : 'none' },
						// Pending liquor is an open circle (white center, colored edge), the same outer size:
						// a shape cue as well as color (format.js SOURCE_HOLLOW).
						paint: SOURCE_HOLLOW.includes(k)
							? { 'circle-radius': 4, 'circle-color': '#fff', 'circle-stroke-color': SOURCE_COLOR[k], 'circle-stroke-width': 2.5 }
							: { 'circle-radius': 5, 'circle-color': SOURCE_COLOR[k], 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 }
					});
					map.on('click', k, (/** @type {any} */ e) => {
						const f = e.features?.[0];
						if (f?.properties?.aid) select({ aid: f.properties.aid, kind: 'address' }, f.geometry.coordinates);
					});
					map.on('mouseenter', k, () => (map.getCanvas().style.cursor = 'pointer'));
					map.on('mouseleave', k, () => (map.getCanvas().style.cursor = ''));
				}
				// A ring around whatever is shown in the side panel.
				map.addSource('selected', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
				map.addLayer({ id: 'selected-ring', type: 'circle', source: 'selected', paint: { 'circle-radius': 11, 'circle-opacity': 0, 'circle-stroke-color': '#000', 'circle-stroke-width': 3 } });
				const b = mine.features[0].geometry.coordinates.flat(2);
				const xs = b.map((/** @type {number[]} */ c) => c[0]);
				const ys = b.map((/** @type {number[]} */ c) => c[1]);
				// ?lon=&lat= (from the address search, #59): center on that spot and mark it.
				const qs = new URLSearchParams(window.location.search);
				const at = /** @type {[number, number]} */ ([Number(qs.get('lon')), Number(qs.get('lat'))]);
				const valid = qs.has('lon') && qs.has('lat') && at.every(Number.isFinite) && Math.abs(at[0] + 74) < 1 && Math.abs(at[1] - 40.7) < 1;
				if (valid) new Marker({ color: '#b45309' }).setLngLat(at).addTo(map);
				if (hs.view) {
					// Back/Forward or a shared link: the exact view the user left (#75).
					map.jumpTo({ center: [hs.view.lon, hs.view.lat], zoom: hs.view.z });
					status = `Map loaded where you left it. Select a point to see its details beside the map. ${note()}`;
				} else if (valid) {
					map.jumpTo({ center: at, zoom: 17 });
					status = `Map loaded, centered on the address you searched for (orange marker). Select a point to see its details beside the map. ${note()}`;
				} else {
					map.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: 20 });
					status = `Map loaded. Select a point to see its details beside the map. ${note()}`;
				}
				mapReady = true;
				if (hs.sel) {
					const f = points.features.find((/** @type {any} */ x) => x.properties.aid === hs.sel);
					select({ aid: hs.sel, kind: 'address' }, f?.geometry.coordinates);
				}
				map.on('moveend', writeState);
				writeState();
				if (show311) toggle311();
				if (showSW) toggleSW();
				if (anyRings) toggleRings();
			});
		})().catch((err) => (status = `Map could not load: ${err.message}. Use the list view.`));
		return () => {
			cancelled = true;
			map?.remove();
		};
	});

	/**
	 * Set every layer toggle from a list of layer keys that are on (the page's state only; the map
	 * catches up through the toggle functions).
	 * @param {readonly string[]} on
	 */
	function setToggles(on) {
		const t = layerToggles(on, LAYERS, LICENSE_GROUPS);
		for (const k of LAYERS) visible[k] = t.visible[k];
		show311 = t.show311;
		showSW = t.showSW;
		for (const g of LICENSE_GROUPS) ringsOn[g.key] = t.ringsOn[g.key];
	}

	const RESET_STATUS = 'Layers reset to default.';

	/**
	 * "Reset to default" (#114): every layer toggle, both ring toggles, 311 and its style back to
	 * MAP_DEFAULTS, drawn on the map by the same toggle functions the checkboxes use (a default-on
	 * layer not yet loaded loads now). The saved choices are forgotten, and the hash keeps the view
	 * and selection but carries the default layers. No reload.
	 */
	async function resetLayers() {
		gate.touch();
		setToggles(MAP_DEFAULTS.on);
		mode311 = MAP_DEFAULTS.c311;
		clearPrefs(window.localStorage);
		for (const k of LAYERS) toggle(k);
		await Promise.all([toggle311(), toggleSW(), toggleRings()]);
		writeState();
		// Clear first so pressing it twice is announced twice.
		status = '';
		await tick();
		status = RESET_STATUS;
	}

	/** After a basemap swap, set every overlay's visibility from the checkboxes again. */
	function reapplyVisibility() {
		for (const k of LAYERS) toggle(k);
		set311Visibility();
		for (const id of ['c311-stack-label', 'c311-sized-label']) if (map.getLayer(id)) map.setLayoutProperty(id, 'text-font', labelFont);
		if (map.getLayer('schools_worship')) map.setLayoutProperty('schools_worship', 'visibility', showSW ? 'visible' : 'none');
		if (map.getLayer('rings-label')) map.setLayoutProperty('rings-label', 'text-font', labelFont);
		setRingsVisibility();
	}

	/** Show only the current mode's 311 layers, and only while 311 is switched on. */
	function set311Visibility() {
		writeState();
		for (const [mode, ids] of Object.entries(MODE_LAYERS))
			for (const id of ids)
				if (map?.getLayer(id)) map.setLayoutProperty(id, 'visibility', show311 && mode === mode311 ? 'visible' : 'none');
	}

	/** A 311 complaint (dot or chip) was selected. @param {any} e */
	function click311(e) {
		// A license dot under the cursor wins; its own handler opens the address page.
		const on = LAYERS.filter((k) => visible[k] && map.getLayer(k));
		if (on.length && map.queryRenderedFeatures(e.point, { layers: on }).length) return;
		const f = e.features?.[0];
		if (!f) return;
		const aid = f.properties?.aid;
		select(aid ? { aid, kind: 'c311', props: f.properties } : { kind: 'c311', props: f.properties }, f.geometry.coordinates);
	}

	/** A sized circle was selected. @param {any} e */
	function clickPoint311(e) {
		const on = LAYERS.filter((k) => visible[k] && map.getLayer(k));
		if (on.length && map.queryRenderedFeatures(e.point, { layers: on }).length) return;
		const f = e.features?.[0];
		if (!f) return;
		const aid = f.properties?.aid;
		select(aid ? { aid, kind: 'c311point', props: f.properties } : { kind: 'c311point', props: f.properties }, f.geometry.coordinates);
	}

	/** @param {string | string[]} id  one layer id, or several sharing one listener @param {(e: any) => void} handler */
	function clickable(id, handler) {
		map.on('click', id, handler);
		map.on('mouseenter', id, () => (map.getCanvas().style.cursor = 'pointer'));
		map.on('mouseleave', id, () => (map.getCanvas().style.cursor = ''));
	}

	async function toggle311() {
		writeState();
		if (!mapReady) return; // the map's load handler calls this again if the box is ticked
		if (swapping) await swapping;
		if (state311 === 'ready') {
			set311Visibility();
			return;
		}
		if (state311 === 'loading' || !show311) return;
		state311 = 'loading';
		status = 'Loading 311 complaints…';
		try {
			const pts = await fetch(asset(/** @type {any} */ (`data/${data.slug}/points-311.geojson`))).then((r) => r.json());
			if (swapping) await swapping;
			const chips = stackChips(pts);
			const summaries = pointSummaries(pts);
			map.addSource('c311', { type: 'geojson', data: pts });
			map.addSource('c311-chips', { type: 'geojson', data: chips });
			map.addSource('c311-points', { type: 'geojson', data: summaries });
			// All drawn under the license layers so their larger dots stay on top and clickable.
			const below = `${LAYERS[0]}${HALO}`;
			const vis = (/** @type {string} */ mode) => (show311 && mode === mode311 ? 'visible' : 'none');
			map.addLayer(
				{
					id: 'complaints_311',
					type: 'circle',
					source: 'c311',
					layout: { visibility: vis('dots') },
					paint: c311DotPaint()
				},
				below
			);
			// Stacked chips: one circle layer per level, each nudged up a fixed number of screen
			// pixels, so a stack keeps its size at every zoom (unlike v1's map-meter stacks, #29).
			STACK_LAYERS.forEach((id, i) =>
				map.addLayer(
					{
						id,
						type: 'circle',
						source: 'c311-chips',
						filter: ['==', ['get', 'i'], i],
						layout: { visibility: vis('stacks') },
						paint: {
							'circle-radius': 3.5,
							'circle-color': c311ColorExpr(),
							'circle-stroke-color': '#fff',
							'circle-stroke-width': 0.75,
							'circle-translate': [0, -i * STACK_STEP_PX],
							'circle-translate-anchor': 'viewport'
						}
					},
					below
				)
			);
			// Total written above stacks that hit the cap.
			map.addLayer(
				{
					id: 'c311-stack-label',
					type: 'symbol',
					source: 'c311-points',
					filter: ['>', ['get', 'n'], STACK_CAP],
					layout: { visibility: vis('stacks'), 'text-field': ['to-string', ['get', 'n']], 'text-font': labelFont, 'text-size': 11, 'text-allow-overlap': true, 'text-ignore-placement': true },
					paint: { 'text-color': '#1f2937', 'text-halo-color': '#fff', 'text-halo-width': 1.5, 'text-translate': [0, -(STACK_CAP * STACK_STEP_PX + 8)], 'text-translate-anchor': 'viewport' }
				},
				below
			);
			map.addLayer(
				{
					id: 'c311-sized',
					type: 'circle',
					source: 'c311-points',
					layout: { visibility: vis('sized') },
					paint: { 'circle-radius': sizedRadiusExpr(), 'circle-color': groupColorExpr(), 'circle-opacity': 0.8, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1 }
				},
				below
			);
			map.addLayer(
				{
					id: 'c311-sized-label',
					type: 'symbol',
					source: 'c311-points',
					filter: ['>=', ['get', 'n'], 5],
					layout: { visibility: vis('sized'), 'text-field': ['to-string', ['get', 'n']], 'text-font': labelFont, 'text-size': 11, 'text-allow-overlap': true, 'text-ignore-placement': true },
					paint: { 'text-color': '#fff', 'text-halo-color': '#1f2937', 'text-halo-width': 1.2 }
				},
				below
			);
			clickable('complaints_311', click311);
			// One listener for all chip layers: neighboring chips overlap, and a click must fire once (QA #74).
			clickable(STACK_LAYERS, click311);
			clickable('c311-sized', clickPoint311);
			state311 = 'ready';
			const busiest = summaries.features[0]?.properties;
			status = `311 complaints shown (${pts.features.length} at ${summaries.features.length} points${busiest ? `; the most at one point: ${busiest.n}, ${busiest.s || 'no address'}` : ''}).`;
		} catch (err) {
			state311 = 'idle';
			status = `311 complaints could not load: ${/** @type {Error} */ (err).message}`;
		}
	}

	async function toggleSW() {
		writeState();
		if (!mapReady) return; // the map's load handler calls this again if the box is ticked
		if (swapping) await swapping;
		if (stateSW === 'ready') {
			map.setLayoutProperty('schools_worship', 'visibility', showSW ? 'visible' : 'none');
			return;
		}
		if (stateSW === 'loading' || !showSW) return;
		stateSW = 'loading';
		status = 'Loading schools and houses of worship…';
		try {
			const pts = await loadSW();
			if (swapping) await swapping;
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
				`${LAYERS[0]}${HALO}`
			);
			map.on('click', 'schools_worship', (/** @type {any} */ e) => {
				const on = LAYERS.filter((k) => visible[k] && map.getLayer(k));
				if (on.length && map.queryRenderedFeatures(e.point, { layers: on }).length) return;
				const f = e.features?.[0];
				if (f) select({ kind: 'sw', props: f.properties }, f.geometry.coordinates);
			});
			map.on('mouseenter', 'schools_worship', () => (map.getCanvas().style.cursor = 'pointer'));
			map.on('mouseleave', 'schools_worship', () => (map.getCanvas().style.cursor = ''));
			stateSW = 'ready';
			/** @param {string} k */
			const nk = (k) => pts.features.filter((/** @type {any} */ f) => f.properties.k === k).length;
			status = `Schools and houses of worship shown (${nk('school')} schools, ${nk('worship')} houses of worship, ${nk('religious')} other religious properties, inside the district or within ${data.sw_buffer_ft} ft of its line).`;
		} catch (err) {
			stateSW = 'idle';
			swData = null;
			status = `Schools and houses of worship could not load: ${/** @type {Error} */ (err).message}`;
		}
	}

	/** The district's schools and houses of worship, fetched once for both the points and the rings. */
	function loadSW() {
		swData ??= fetch(asset(`data/${data.slug}/schools-worship.geojson`)).then((r) => r.json());
		return swData;
	}

	function setRingsVisibility() {
		for (const id of RING_LINE_LAYERS) if (map?.getLayer(id)) map.setLayoutProperty(id, 'visibility', anyRings ? 'visible' : 'none');
	}

	/** Add the rings source and layers once, empty; toggleRings fills them. */
	function addRingLayers() {
		map.addSource('rings', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
		// Under the school and worship dots (or the license dots if those are off) so dots stay clickable.
		const below = map.getLayer('schools_worship') ? 'schools_worship' : `${LAYERS[0]}${HALO}`;
		const vis = anyRings ? 'visible' : 'none';
		// Color and pattern say the law (#lib/rings.js): liquor a solid navy line, cannabis a dashed green
		// line. A ring both laws share has both flags, so its cannabis dashes are drawn over its liquor
		// line and navy and green alternate along it. A white casing keeps each line readable on the basemap.
		map.addLayer({ id: 'rings-casing', type: 'line', source: 'rings', layout: { visibility: vis }, paint: { 'line-color': '#fff', 'line-width': 4, 'line-opacity': 0.8 } }, below);
		map.addLayer(
			{ id: 'rings-liquor', type: 'line', source: 'rings', filter: ['==', ['get', 'liq'], true], layout: { visibility: vis }, paint: { 'line-color': RING_COLOR.liquor, 'line-width': 2 } },
			below
		);
		map.addLayer(
			{ id: 'rings-cannabis', type: 'line', source: 'rings', filter: ['==', ['get', 'can'], true], layout: { visibility: vis }, paint: { 'line-color': RING_COLOR.cannabis, 'line-width': 2, 'line-dasharray': [3, 2] } },
			below
		);
		// Each ring says its distance and law along the line, dark text on a white halo, once zoomed in.
		map.addLayer(
			{
				id: 'rings-label',
				type: 'symbol',
				source: 'rings',
				minzoom: 16,
				layout: { visibility: vis, 'symbol-placement': 'line', 'symbol-spacing': 600, 'text-field': ['get', 'text'], 'text-font': labelFont, 'text-size': 11, 'text-keep-upright': true },
				paint: { 'text-color': '#1f2937', 'text-halo-color': '#fff', 'text-halo-width': 2 }
			},
			below
		);
	}

	/** Either group's ring toggle changed: redraw just the rings that are on (a shared ring once). */
	async function toggleRings() {
		writeState();
		if (!mapReady) return; // the map's load handler calls this again if a box is ticked
		if (swapping) await swapping;
		if (stateRings === 'loading') return; // the load in progress draws whatever is on when it ends
		if (stateRings === 'idle') {
			if (!anyRings) return;
			stateRings = 'loading';
			status = 'Drawing distance rings…';
			try {
				await loadSW();
				if (swapping) await swapping;
				addRingLayers();
				stateRings = 'ready';
			} catch (err) {
				stateRings = 'idle';
				swData = null;
				status = `Distance rings could not load: ${/** @type {Error} */ (err).message}`;
				return;
			}
		}
		const pts = await loadSW();
		map.getSource('rings')?.setData(ringFeatures(pts, RINGS));
		setRingsVisibility();
		if (!anyRings) {
			status = 'Distance rings hidden.';
			return;
		}
		/** @param {string} k */
		const nk = (k) => pts.features.filter((/** @type {any} */ f) => f.properties.k === k).length;
		const which = LICENSE_GROUPS.filter((g) => ringsOn[g.key]).map((g, i) => (i ? g.short.toLowerCase() : g.short)).join(' and ');
		status = `${which} distance rings shown around ${nk('school')} schools and ${nk('worship')} houses of worship. ${sharedNote ? `${sharedNote} ` : ''}${RING_NOTE}`;
	}

	/**
	 * A group's "all" box: checked when every layer in it is on, mixed when some are.
	 * @param {typeof LICENSE_GROUPS[number]} g
	 */
	const groupAll = (g) => g.layers.every((k) => visible[k]);
	/** @param {typeof LICENSE_GROUPS[number]} g */
	const groupSome = (g) => g.layers.some((k) => visible[k]) && !groupAll(g);
	/** @param {typeof LICENSE_GROUPS[number]} g @param {boolean} on */
	function setGroup(g, on) {
		for (const k of g.layers) {
			visible[k] = on;
			toggle(k);
		}
	}

	/** @param {string} k */
	function toggle(k) {
		writeState();
		for (const id of [k, `${k}${HALO}`]) if (map?.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible[k] ? 'visible' : 'none');
	}
</script>

<svelte:head><title>Map: {data.district.label} — SLAM v2 prototype</title></svelte:head>

<p class="no-print"><a href={resolve('/', {})}>All districts</a></p>
<h1>Map: {data.district.label}</h1>
<p><a class="btn secondary" href={resolve('/[district]', { district: data.slug })}>View as list</a></p>

<details class="layers-acc" open={layersOpen} ontoggle={(e) => { if (e.currentTarget.open !== layersOpen) gate.touch(); layersOpen = e.currentTarget.open; writeState(); }}>
	<summary>Layers <span class="muted">({onKeys().length} on{show311 ? `, 311 as ${C311_MODES.find((x) => x.key === mode311)?.label.toLowerCase()}` : ''})</span></summary>
<!-- Any change in the box is the person's own; capture runs before the control's handler saves (#118). -->
<fieldset class="layers" onchangecapture={() => gate.touch()}>
	<legend>Layers</legend>
	<p class="reset-row">
		<button type="button" class="btn secondary reset" onclick={resetLayers} aria-describedby="reset-hint">Reset to default</button>
		<span id="reset-hint" class="sr-only">Turns layers back to how the map first opens.</span>
	</p>
	{#snippet layerBox(/** @type {string} */ k)}
		<label>
			<input type="checkbox" bind:checked={visible[k]} onchange={() => toggle(k)} />
			<span class="swatch" class:hollow={SOURCE_HOLLOW.includes(k)} style="--c:{SOURCE_COLOR[k]}"></span>
			{SOURCE_SHORT[k]} {#if counts[k] !== undefined}<span class="muted">({counts[k]})</span>{/if}
		</label>
	{/snippet}
	<!-- One group per license type (Noel, 2026-11-07): its layers, then its own distance rings (#111). -->
	{#each LICENSE_GROUPS as g (g.key)}
		<fieldset class="group" data-group={g.key}>
			<legend>{g.label}</legend>
			<label class="all">
				<input type="checkbox" bind:checked={() => groupAll(g), (v) => setGroup(g, v)} bind:indeterminate={() => groupSome(g), () => {}} />
				All {g.short.toLowerCase()} layers
			</label>
			{#each g.layers as k (k)}{@render layerBox(k)}{/each}
			<label class="ring-toggle">
				<input type="checkbox" bind:checked={ringsOn[g.key]} onchange={toggleRings} aria-describedby={g.key === 'liquor' ? 'rings-note rings-note-liquor' : 'rings-note'} />
				<span class="ring-swatch" class:dashed={g.key === 'cannabis'} style="border-color:{RING_COLOR[g.key]}"></span>
				<span><span class="sr-only">{`${g.short}, `}</span>{RING_LAYER_NAME}</span>
			</label>
			{#if ringsOn[g.key]}
				<ul class="legend-rings" aria-label="{g.short} distance rings">
					{#each GROUP_RINGS[g.key] as r (r.key)}
						<li><span class="ring-swatch" class:dashed={ringLine(r) === 'dashed line'} style="border-color:{RING_COLOR[g.key]}"></span><span>{ringLegendText(r)}</span></li>
					{/each}
				</ul>
			{/if}
			{#if g.key === 'liquor'}
				<p id="rings-note-liquor" class="rings-note" hidden={!ringsOn.liquor}>{RING_NO_LIQUOR_500}</p>
			{/if}
		</fieldset>
	{/each}
	<p id="rings-note" class="rings-note" hidden={!anyRings}>{[RING_NOTE, sharedNote, RING_LIST_NOTE].filter(Boolean).join(' ')}</p>
	{#each OTHER_LAYERS as k (k)}{@render layerBox(k)}{/each}
	<label>
		<input type="checkbox" bind:checked={show311} onchange={toggle311} />
		<span class="swatch small" style="--c:{C311_GROUPS[0].color}"></span>
		{SOURCE_SHORT.complaints_311} <span class="muted">({data.district.counts.complaints_311}, since {data.manifest.complaints_311.start})</span>
	</label>
	{#if show311}
		<fieldset class="mode311">
			<legend>Show 311 complaints as</legend>
			{#each C311_MODES as mo (mo.key)}
				<label><input type="radio" name="mode311" value={mo.key} bind:group={mode311} onchange={() => queueMicrotask(set311Visibility)} /> {mo.label}</label>
			{/each}
		</fieldset>
		<ul class="legend311" aria-label="311 dot colors">
			{#each C311_GROUPS as g (g.key)}
				<li><span class="swatch" style="--c:{g.color}"></span>{g.label}</li>
			{/each}
		</ul>
	{/if}
	<label>
		<input type="checkbox" bind:checked={showSW} onchange={toggleSW} />
		<span class="swatch" style="--c:{SW_COLOR.school}"></span><span class="swatch" style="--c:{SW_COLOR.worship}"></span><span class="swatch" style="--c:{SW_COLOR.religious}"></span>
		Schools / houses of worship / other religious property <span class="muted">({data.district.counts.schools} / {data.district.counts.worship} / {data.district.counts.religious} in the district)</span>
	</label>
</fieldset>
</details>
<p class="muted" role="status">{status}</p>
<div class="map-wrap" class:has-panel={sel}>
	<div class="map" bind:this={container} role="region" aria-label="Map of {data.district.label}"></div>
	<MapPanel {sel} onclose={() => select(null)} />
</div>
<details class="map-about">
	<summary>About this map</summary>
<p class="note">When the map first opens, it shows pending liquor applications, the liquor distance rings, 311
	complaints, and the schools and houses of worship the rings are drawn around. Every other layer is in the
	Layers box. 311 complaints are colored by type, based on
	the first SLAM's layers: commercial noise, drinking, outdoor dining, and other. "Stacked chips" piles the
	complaints at one point into a column, as the first SLAM did, so busy addresses stand out; a stack
	stops at {STACK_CAP} chips and shows the total above it. "Circles sized by count" draws one circle
	per point, larger for more complaints, colored by the most common type, with the count inside. Selecting any point shows its details in a
	panel beside the map (under it on a phone), with a link to its full address page. The map keeps your
	view, layers and selection in its web address, so Back returns you here; your layer choices are also
	remembered in this browser for next time. "Reset to default" at the top of the Layers box turns the
	layers back to how the map first opens, forgets the saved choices and keeps the view.
	Colors follow the Layers box groups: liquor layers are blue, violet and gray (pending applications are open
	circles), cannabis layers are green, Dining Out is raspberry, and 311 complaints are orange, red, brown
	and gray-green.
	Schools (dark gray), houses of worship (light purple) and other religious property (tan)
	show where the rings are drawn from; selecting one shows its name, type and address in the panel. Schools come from the City's Facilities Database; houses
	of worship are PLUTO tax lots in building class M1, and other religious property is class M2, M3, M4 or M9
	(PLUTO has no names). The layers are grouped by license type, and each group has its own
	{RING_LAYER_NAME}, showing only that law's rings (the liquor rings start on, the cannabis rings start off). {RING_COLOR_NOTE}
	{#each LICENSE_GROUPS as g (g.key)}{g.label}: {GROUP_RINGS[g.key].map(ringLegendText).join('; ')}. {/each}
	With both on, a ring the two laws share is drawn once, as {RING_SHARED_LINE}, and its label names both laws. Other religious
	property has no ring. {RING_NOTE} {RING_NO_LIQUOR_500} {RING_LIST_NOTE} Street events have no coordinates in the source and are not on the map.
	The street map is the City's own basemap, from NYC's Office of Technology and Innovation; if it
	does not load, or stops loading while you use the map, OpenFreeMap (OpenStreetMap data) is used instead.
	The list view is the accessible equivalent of this map: every license, cannabis, Dining Out, school and
	religious-property point is in it, and its 311 tab counts every complaint and lists the most recent ones.</p>
</details>

<style>
	.layers-acc { margin: 0.5rem 0; }
	.layers-acc > summary, .map-about > summary { cursor: pointer; font-weight: 600; padding: 0.35rem 0; }
	.layers-acc .layers { margin-top: 0.25rem; }
	.map-about { margin-top: 0.75rem; }
	.map-wrap.has-panel { display: grid; grid-template-columns: minmax(0, 2fr) minmax(16rem, 1fr); gap: 0.75rem; align-items: start; }
	@media (max-width: 52rem) { .map-wrap.has-panel { display: block; } .map-wrap.has-panel :global(.panel) { margin-top: 0.75rem; } }
	.map { height: 70vh; min-height: 320px; border: 1px solid var(--line); }
	.layers { border: 1px solid var(--line); display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; margin: 0.5rem 0; }
	.layers label { display: inline-flex; align-items: center; gap: 0.35rem; min-height: 1.75rem; }
	/* Checkboxes and radios at least 24px tall with their label (WCAG 2.5.8); the label is the target. */
	.layers input[type='checkbox'], .layers input[type='radio'] { width: 1.15rem; height: 1.15rem; margin: 0; flex: none; }
	/* A license group: its own box, full width, items stacked so it fits a 360px phone. */
	.layers .group { width: 100%; border: 1px solid var(--line); margin: 0; padding: 0.25rem 0.6rem 0.4rem; display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }
	.layers .group legend { font-weight: 600; padding: 0 0.25rem; }
	.layers .group > label:not(.all) { padding-left: 1.6rem; }
	.layers .group .legend-rings, .layers .group .rings-note { padding-left: 3.2rem; }
	.layers .group label > span:last-child, .legend-rings li > span:last-child, .rings-note { overflow-wrap: anywhere; min-width: 0; }
	/* Reset to default (#114): a plain secondary button at the top of the box, at least 24px tall. */
	.reset-row { width: 100%; margin: 0; }
	.layers .reset { min-height: 2rem; padding: 0.3rem 0.8rem; font-size: 0.9rem; }
	.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
	.mode311 { border: 0; padding: 0 0 0 1.6rem; margin: 0; width: 100%; display: flex; flex-wrap: wrap; gap: 0.25rem 1rem; font-size: 0.9rem; }
	.mode311 legend { font-weight: 600; padding: 0; float: left; margin-right: 0.5rem; }
	.legend311 { list-style: none; display: flex; flex-wrap: wrap; gap: 0.25rem 0.9rem; margin: 0; padding: 0 0 0 1.6rem; font-size: 0.85rem; width: 100%; }
	.legend311 li { display: inline-flex; align-items: center; gap: 0.35rem; }
	.swatch.small { width: 0.55rem; height: 0.55rem; }
	.ring-swatch { width: 0.85rem; height: 0.85rem; border-radius: 50%; display: inline-block; border: 2px solid; background: transparent; box-sizing: border-box; }
	.ring-swatch.dashed { border-style: dashed; }
	.legend-rings { list-style: none; display: flex; flex-direction: column; gap: 0.2rem; margin: 0; padding: 0 0 0 1.6rem; font-size: 0.85rem; width: 100%; }
	.legend-rings li { display: flex; align-items: center; gap: 0.35rem; }
	.ring-swatch { flex: none; }
	.rings-note { margin: 0; padding: 0 0 0 1.6rem; font-size: 0.85rem; width: 100%; }
	.swatch { width: 0.8rem; height: 0.8rem; border-radius: 50%; display: inline-block; border: 1px solid #fff; outline: 1px solid #949494; background: var(--c); }
	/* Pending liquor: an open circle, as on the map. */
	.swatch.hollow { background: #fff; border: 2.5px solid var(--c); box-sizing: border-box; }
</style>
