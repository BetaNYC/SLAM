<script>
	// The second district map (#134, Phase 1): SLAM's district files in the layout of BetaNYC's
	// Manhattan POPS map (BetaNYC/pops-map, code/map_template_v2.html): a blue layer panel on the
	// right, a stats bar along the bottom, every layer on its own toggle. Same data, basemap, colors,
	// rings and 311 chips as the first district map ([district]/map); only the layout is new.
	// MapLibre GL JS 6.16 API used: Map, NavigationControl, Popup.setDOMContent, setFilter,
	// setLayoutProperty, GeoJSONSource.setData, easeTo, resize (https://maplibre.org/maplibre-gl-js/docs/API/).
	import { onMount, tick } from 'svelte';
	import { resolve, asset } from '$app/paths';
	import logo from '#lib/assets/betanyc-logo.svg';
	import { SOURCE_COLOR, SOURCE_HOLLOW, SOURCE_LABEL, SW_COLOR, SW_KIND, C311_GROUPS, c311Group, c311ColorExpr, fmtStamp } from '#lib/format.js';
	import { STACK_CAP, STACK_STEP_PX, stackChips, pointSummaries, groupColorExpr, sizedRadiusExpr, chipView, stackDiscs, columnTop, c311DiscColorExpr, DISC_REBUILD_ZOOM, TILT_ON } from '#lib/c311Display.js';
	import { chooseBasemap, basemapNote, basemapSwitcher, carryOverlays, SWITCH_NOTE, FALLBACK_STYLE_URL } from '#lib/basemap.js';
	import { ringSpecs, ringFeatures, RING_COLOR, RING_NOTE } from '#lib/rings.js';
	import { popupSW } from '#lib/popupSW.js';
	import { popup311Point } from '#lib/popup311.js';
	import { feedbackBody, sendFeedback, FEEDBACK_COPY as FB, LIMITS } from '#lib/feedback.js';
	import 'maplibre-gl/dist/maplibre-gl.css';

	/** @type {{data: any}} */
	let { data } = $props();

	/** Panel order (Noel, 2026-11-24): Dining Out, Cannabis, Liquor. */
	const RECORD_GROUPS = [
		{ h: 'Dining Out', items: [['dining_out', 'Outdoor dining permits']] },
		{ h: 'Cannabis', small: 'Office of Cannabis Management', items: [['cannabis_retail', 'Registered retail dealers'], ['cannabis_license', 'Licenses, including in process']] },
		{ h: 'Liquor', small: 'State Liquor Authority', items: [['liquor_active', 'Active licenses'], ['liquor_pending', 'Pending applications'], ['liquor_inactive', 'Past (inactive) licenses']] }
	];
	/** Drawn bottom to top: outdoor dining over cannabis over liquor. */
	const RECORD_ORDER = ['liquor_inactive', 'liquor_pending', 'liquor_active', 'cannabis_license', 'cannabis_retail', 'dining_out'];
	const SW_KINDS = /** @type {const} */ (['school', 'worship', 'religious']);
	const SW_LABEL = { school: 'Schools (K-12)', worship: 'Houses of worship', religious: 'Other religious property' };
	/** The dark edge around each record dot, as on the first map. */
	const DOT_EDGE = '#1f2937';
	const HALO = '-halo';
	/** Below this zoom, one circle per address; at or above it, one chip per complaint (from the prototype). */
	const CHIP_ZOOM = 15.5;
	/** Piles of this many complaints or more show their total. */
	const LABEL_MIN = 10;
	const STACK_LAYERS = Array.from({ length: STACK_CAP }, (_, i) => `c311-stack-${i}`);
	/** @type {Record<'circles' | 'flat' | '3d', string[]>} */
	const VIEW_LAYERS = { circles: ['c311-sized', 'c311-sized-label'], flat: [...STACK_LAYERS, 'c311-stack-label'], '3d': ['c311-discs', 'c311-col-label'] };
	const LABEL_LAYERS = ['c311-sized-label', 'c311-stack-label', 'c311-col-label'];
	const EMPTY = { type: 'FeatureCollection', features: [] };

	// What is on. Defaults: what SLAM shows first, minus past licenses and other religious property;
	// rings off (#134).
	/** @type {Record<string, boolean>} */
	let rec = $state({ dining_out: true, cannabis_retail: true, cannabis_license: true, liquor_active: true, liquor_pending: true, liquor_inactive: false });
	/** @type {Record<string, boolean>} */
	let sw = $state({ school: true, worship: true, religious: false });
	let rings = $state({ liquor: false, cannabis: false });
	/** @type {Record<string, boolean>} */
	let c311On = $state(Object.fromEntries(C311_GROUPS.map((g) => [g.key, true])));
	/** @type {number[]} */
	let years = $state([]);
	let y0 = $state(0);
	let y1 = $state(0);

	/** @type {Record<string, number>} */
	let counts = $state({});
	/** @type {any} */
	let pts311 = $state.raw(null);
	/** @type {any} */
	let swData = $state.raw(null);
	let status = $state('Loading map…');
	let failed = $state(false);
	let panelShown = $state(true);
	let statsShown = $state(true);
	let tilted = $state(false);
	let loaded = $state(false);
	let basemapLine = $state('');

	const inRange = (/** @type {any} */ p) => {
		const y = +String(p.d ?? '').slice(0, 4);
		return y >= y0 && y <= y1;
	};
	/** The 311 complaints the year range and type toggles let through. */
	const shown311 = $derived(pts311 ? { type: 'FeatureCollection', features: pts311.features.filter((/** @type {any} */ f) => inRange(f.properties) && c311On[c311Group(f.properties.t).key]) } : EMPTY);
	/** Per year, per type, for the chart (type toggles applied, every year shown). */
	const byYear = $derived(
		years.map((y) => {
			/** @type {Record<string, number>} */
			const n = Object.fromEntries(C311_GROUPS.map((g) => [g.key, 0]));
			for (const f of pts311?.features ?? []) {
				const g = c311Group(f.properties.t).key;
				if (c311On[g] && String(f.properties.d).startsWith(String(y))) n[g]++;
			}
			return { y, n, total: Object.values(n).reduce((a, b) => a + b, 0) };
		})
	);
	const maxYear = $derived(Math.max(1, ...byYear.map((b) => b.total)));
	/** 311 counts per type in the year range, for the panel. */
	const typeCounts = $derived(
		Object.fromEntries(C311_GROUPS.map((g) => [g.key, (pts311?.features ?? []).filter((/** @type {any} */ f) => inRange(f.properties) && c311Group(f.properties.t).key === g.key).length]))
	);
	const rangeLabel = $derived(y0 === y1 ? String(y0) : `${y0}–${y1}`);
	const place = $derived(`${data.district.borough} CD ${data.district.cb}`);

	/** @type {any} */
	let map;
	/** @type {any} */
	let Popup;
	/** @type {HTMLDivElement} */
	let container;
	let ready = false;
	/** @type {'circles' | 'flat' | '3d' | null} */
	let view = null;
	/** @type {'flat' | '3d'} */
	let tiltView = 'flat';
	let discZoom = -1;
	let labelFont = ['Source Sans Pro Bold'];
	/** @type {Map<string, any>} 311 summaries by point, for popups. */
	let summaryAt = new Map();
	const key = (/** @type {number[]} */ c) => `${c[0].toFixed(6)},${c[1].toFixed(6)}`;

	onMount(() => {
		let cancelled = false;
		if (window.matchMedia?.('(max-width: 760px)').matches) panelShown = false;
		(async () => {
			const [{ Map, NavigationControl, setWorkerUrl, Popup: P }, { default: workerUrl }] = await Promise.all([
				import('maplibre-gl'),
				import('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url')
			]);
			if (cancelled) return;
			setWorkerUrl(workerUrl);
			Popup = P;
			const get = (/** @type {string} */ f) => fetch(asset(/** @type {any} */ (`data/${f}`))).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status} for ${f}`))));
			const [outline, points, c311, swPts, basemap] = await Promise.all([
				get('districts.geojson'),
				get(`${data.slug}/points.geojson`),
				get(`${data.slug}/points-311.geojson`),
				get(`${data.slug}/schools-worship.geojson`),
				chooseBasemap()
			]);
			if (cancelled) return;
			for (const k of RECORD_ORDER) counts[k] = points.features.filter((/** @type {any} */ f) => f.properties.source === k).length;
			for (const k of SW_KINDS) counts[k] = swPts.features.filter((/** @type {any} */ f) => f.properties.k === k).length;
			const ys = c311.features.map((/** @type {any} */ f) => +String(f.properties.d).slice(0, 4)).filter(Number.isFinite);
			const lo = Math.min(...ys);
			const hi = Math.max(...ys);
			years = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
			y0 = lo;
			y1 = hi;
			pts311 = c311;
			swData = swPts;
			if (basemap.kind === 'fallback') labelFont = ['Noto Sans Bold'];
			basemapLine = basemapNote(basemap.kind);
			const mine = { ...outline, features: outline.features.filter((/** @type {any} */ f) => f.properties.slug === data.slug) };
			const b = mine.features[0].geometry.coordinates.flat(2);
			const xs = b.map((/** @type {number[]} */ c) => c[0]);
			const yy = b.map((/** @type {number[]} */ c) => c[1]);

			map = new Map({
				container,
				style: basemap.style,
				bounds: [[Math.min(...xs), Math.min(...yy)], [Math.max(...xs), Math.max(...yy)]],
				fitBoundsOptions: { padding: { top: 90, bottom: 20, left: 50, right: 20 } }
			});
			map.addControl(new NavigationControl({ visualizePitch: true }), 'top-left');
			// The City basemap can fail after start-up: swap once to OpenFreeMap, keeping our layers (#lib/basemap.js).
			const switcher = basemapSwitcher(basemap.kind, () => {
				status = SWITCH_NOTE;
				basemapLine = basemapNote('fallback');
				labelFont = ['Noto Sans Bold'];
				map.once('style.load', () => LABEL_LAYERS.forEach((id) => map.getLayer(id) && map.setLayoutProperty(id, 'text-font', labelFont)));
				map.setStyle(FALLBACK_STYLE_URL, { diff: false, transformStyle: carryOverlays(Object.keys(basemap.style.sources)) });
			});
			map.on('error', (/** @type {any} */ e) => {
				console.warn('SLAM map error:', e?.error?.message ?? e);
				switcher.handle(e);
			});
			map.on('load', () => {
				addLayers(mine, points);
				ready = true;
				loaded = true;
				update();
				map.on('zoomend', drawView);
				map.on('pitch', drawView);
				map.on('click', clicked);
				status = `Map loaded. ${basemapNote(basemap.kind)}`;
			});
		})().catch((err) => {
			failed = true;
			status = `Map could not load: ${err.message}. The first map of this district has a list view.`;
		});
		return () => {
			cancelled = true;
			map?.remove();
		};
	});

	/** @param {any} mine @param {any} points */
	function addLayers(mine, points) {
		map.addSource('district', { type: 'geojson', data: mine });
		map.addLayer({ id: 'district-casing', type: 'line', source: 'district', paint: { 'line-color': '#fff', 'line-width': 6, 'line-opacity': 0.85 } });
		map.addLayer({ id: 'district-line', type: 'line', source: 'district', paint: { 'line-color': '#2359a8', 'line-width': 3 } });
		// Distance rings: their own layer, drawn from the school and worship points whether or not those are shown.
		map.addSource('rings', { type: 'geojson', data: EMPTY });
		map.addLayer({ id: 'rings-casing', type: 'line', source: 'rings', paint: { 'line-color': '#fff', 'line-width': 4, 'line-opacity': 0.8 } });
		map.addLayer({ id: 'rings-liquor', type: 'line', source: 'rings', filter: ['==', ['get', 'liq'], true], paint: { 'line-color': RING_COLOR.liquor, 'line-width': 2 } });
		map.addLayer({ id: 'rings-cannabis', type: 'line', source: 'rings', filter: ['==', ['get', 'can'], true], paint: { 'line-color': RING_COLOR.cannabis, 'line-width': 2, 'line-dasharray': [3, 2] } });
		map.addLayer({
			id: 'rings-label',
			type: 'symbol',
			source: 'rings',
			minzoom: 16,
			layout: { 'symbol-placement': 'line', 'symbol-spacing': 600, 'text-field': ['get', 'text'], 'text-font': labelFont, 'text-size': 11, 'text-keep-upright': true },
			paint: { 'text-color': '#1f2937', 'text-halo-color': '#fff', 'text-halo-width': 2 }
		});
		// 311 complaints, three views (#lib/c311Display.js): circles zoomed out, stacked chips zoomed in, 3D discs tilted.
		for (const id of ['c311-points', 'c311-chips', 'c311-discs']) map.addSource(id, { type: 'geojson', data: EMPTY });
		const none = { visibility: 'none' };
		const label = { 'text-field': ['to-string', ['get', 'n']], 'text-font': labelFont, 'text-size': 11, 'text-allow-overlap': true, 'text-ignore-placement': true };
		const dark = { 'text-color': '#1f2937', 'text-halo-color': '#fff', 'text-halo-width': 1.5 };
		const pile = ['>=', ['get', 'n'], LABEL_MIN];
		map.addLayer({ id: 'c311-sized', type: 'circle', source: 'c311-points', layout: none, paint: { 'circle-radius': sizedRadiusExpr(), 'circle-color': groupColorExpr(), 'circle-opacity': 0.8, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1 } });
		map.addLayer({ id: 'c311-sized-label', type: 'symbol', source: 'c311-points', filter: pile, layout: { ...none, ...label }, paint: { 'text-color': '#fff', 'text-halo-color': '#1f2937', 'text-halo-width': 1.2 } });
		STACK_LAYERS.forEach((id, i) =>
			map.addLayer({
				id,
				type: 'circle',
				source: 'c311-chips',
				filter: ['==', ['get', 'i'], i],
				layout: none,
				paint: { 'circle-radius': 3.5, 'circle-color': c311ColorExpr(), 'circle-stroke-color': '#fff', 'circle-stroke-width': 0.75, 'circle-translate': [0, -i * STACK_STEP_PX], 'circle-translate-anchor': 'viewport' }
			})
		);
		map.addLayer({ id: 'c311-stack-label', type: 'symbol', source: 'c311-points', filter: pile, layout: { ...none, ...label }, paint: { ...dark, 'text-translate': [0, -(STACK_CAP * STACK_STEP_PX + 8)], 'text-translate-anchor': 'viewport' } });
		map.addLayer({ id: 'c311-discs', type: 'fill-extrusion', source: 'c311-discs', layout: none, paint: { 'fill-extrusion-color': c311DiscColorExpr(), 'fill-extrusion-base': ['get', 'b'], 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-opacity': 1 } });
		map.addLayer({ id: 'c311-col-label', type: 'symbol', source: 'c311-points', filter: pile, layout: { ...none, ...label, 'symbol-height-offset': columnTop(map.getZoom()) }, paint: dark });
		map.addSource('sw', { type: 'geojson', data: swData });
		map.addLayer({
			id: 'schools_worship',
			type: 'circle',
			source: 'sw',
			paint: { 'circle-radius': 6, 'circle-color': ['match', ['get', 'k'], 'school', SW_COLOR.school, 'worship', SW_COLOR.worship, SW_COLOR.religious], 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 }
		});
		// Record dots, as on the first map: a dark edge (halo) under a white ring; pending liquor is an open circle.
		map.addSource('points', { type: 'geojson', data: points });
		for (const k of RECORD_ORDER)
			map.addLayer({ id: `${k}${HALO}`, type: 'circle', source: 'points', filter: ['==', ['get', 'source'], k], paint: { 'circle-radius': 7.5, 'circle-color': DOT_EDGE } });
		for (const k of RECORD_ORDER)
			map.addLayer({
				id: k,
				type: 'circle',
				source: 'points',
				filter: ['==', ['get', 'source'], k],
				paint: SOURCE_HOLLOW.includes(k)
					? { 'circle-radius': 4, 'circle-color': '#fff', 'circle-stroke-color': SOURCE_COLOR[k], 'circle-stroke-width': 2.5 }
					: { 'circle-radius': 5, 'circle-color': SOURCE_COLOR[k], 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 }
			});
		const hit = [...RECORD_ORDER, 'schools_worship', 'c311-sized', ...STACK_LAYERS, 'c311-discs'];
		for (const id of hit) {
			map.on('mouseenter', id, () => (map.getCanvas().style.cursor = 'pointer'));
			map.on('mouseleave', id, () => (map.getCanvas().style.cursor = ''));
		}
	}

	/** Push every toggle and filter to the map. */
	function update() {
		if (!ready) return;
		for (const k of RECORD_ORDER) for (const id of [k, `${k}${HALO}`]) map.setLayoutProperty(id, 'visibility', rec[k] ? 'visible' : 'none');
		map.setFilter('schools_worship', ['in', ['get', 'k'], ['literal', SW_KINDS.filter((k) => sw[k])]]);
		map.getSource('rings').setData(ringFeatures(swData, ringSpecs(data.ring_ft, rings)));
		const sums = pointSummaries(shown311);
		summaryAt = new Map(sums.features.map((f) => [key(f.geometry.coordinates), f.properties]));
		map.getSource('c311-points').setData(sums);
		map.getSource('c311-chips').setData(stackChips(shown311));
		discZoom = -1;
		view = null;
		drawView();
	}

	/** Show the 311 view this zoom and tilt call for; rebuild the 3D discs when the zoom moved enough. */
	function drawView() {
		if (!ready) return;
		const z = map.getZoom();
		tiltView = chipView(map.getPitch(), tiltView);
		tilted = tiltView === '3d';
		const v = z < CHIP_ZOOM ? 'circles' : tiltView;
		if (v === '3d' && (discZoom === -1 || Math.abs(z - discZoom) >= DISC_REBUILD_ZOOM)) {
			map.getSource('c311-discs').setData(stackDiscs(shown311, z));
			map.setLayoutProperty('c311-col-label', 'symbol-height-offset', columnTop(z));
			discZoom = z;
		} else if (v !== '3d' && discZoom !== -1) {
			map.getSource('c311-discs').setData(EMPTY);
			discZoom = -1;
		}
		if (v === view) return;
		view = v;
		for (const [k, ids] of Object.entries(VIEW_LAYERS)) for (const id of ids) map.setLayoutProperty(id, 'visibility', k === v ? 'visible' : 'none');
	}

	/** A map click: a popup for the top-most thing under the pointer (records draw on top). @param {any} e */
	function clicked(e) {
		const box = [[e.point.x - 6, e.point.y - 6], [e.point.x + 6, e.point.y + 6]];
		const layers = [...RECORD_ORDER, 'schools_worship', ...VIEW_LAYERS[view ?? 'circles']].filter((id) => map.getLayoutProperty(id, 'visibility') !== 'none');
		const f = map.queryRenderedFeatures(box, { layers })[0];
		if (!f) return;
		const id = f.layer.id;
		const p = f.properties;
		let node;
		if (RECORD_ORDER.includes(id)) node = recordPopup(p);
		else if (id === 'schools_worship') node = popupSW(p);
		else {
			const at = f.geometry.type === 'Point' ? f.geometry.coordinates : [p.lon, p.lat];
			node = popup311Point(summaryAt.get(key(at)) ?? p);
		}
		new Popup({ maxWidth: '320px' }).setLngLat(e.lngLat).setDOMContent(node).addTo(map);
	}

	/** Popup body for a record dot, built from text nodes so source text cannot inject markup. @param {any} p */
	function recordPopup(p) {
		const div = document.createElement('div');
		for (const [label, v] of [['Name', p.name || '(no name in the source)'], ['What', SOURCE_LABEL[p.source] ?? p.source], ['Address', p.street || '(no address)'], ['Status', p.status]]) {
			if (!v) continue;
			const line = document.createElement('div');
			const b = document.createElement('strong');
			b.textContent = `${label}: `;
			line.append(b, document.createTextNode(String(v)));
			div.append(line);
		}
		return div;
	}

	/** @param {Record<string, boolean>} obj @param {string} k */
	function flip(obj, k) {
		obj[k] = !obj[k];
		update();
	}

	/** @param {number} from @param {number} to */
	function setYears(from, to) {
		y0 = from;
		y1 = to;
		update();
	}

	/** Select a year: show only that year; select it again: every year. @param {number} y */
	function pickYear(y) {
		if (y0 === y && y1 === y) setYears(years[0], years[years.length - 1]);
		else setYears(y, y);
	}

	function setTilt() {
		const up = map.getPitch() < TILT_ON;
		map.easeTo({ pitch: up ? 55 : 0, bearing: up ? -20 : 0, zoom: up ? Math.max(map.getZoom(), 16.5) : map.getZoom(), duration: 900 });
	}

	/** Hide or show the panel or the stats bar; the map grows into the space. @param {'panel' | 'stats'} which */
	async function collapse(which) {
		if (which === 'panel') panelShown = !panelShown;
		else statsShown = !statsShown;
		await tick();
		map?.resize();
		const shown = which === 'panel' ? panelShown : statsShown;
		document.getElementById(`${shown ? 'hide' : 'show'}-${which}`)?.focus();
	}

	// Feedback (#134): POSTs to BetaNYC's data-issue intake (#lib/feedback.js).
	/** @type {HTMLDialogElement} */
	let dlg;
	let fb = $state({ description: '', name: '', email: '', website: '' });
	/** @type {'' | 'sending' | 'sent' | 'busy' | 'failed'} */
	let fbState = $state('');
	function openFeedback() {
		if (fbState === 'sent') fbState = '';
		dlg.showModal();
	}
	/** @param {SubmitEvent} e */
	async function submitFeedback(e) {
		e.preventDefault();
		fbState = 'sending';
		fbState = await sendFeedback(feedbackBody({ slug: data.slug, ...fb }));
		if (fbState === 'sent') fb = { description: '', name: '', email: '', website: '' };
	}
</script>

<svelte:head>
	<title>{place} map, second layout (prototype) — SLAM</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="app" class:noside={!panelShown} class:nobar={!statsShown}>
	<header class="head">
		<a class="brand" href="https://beta.nyc"><img src={logo} alt="BetaNYC" width="89" height="30" /></a>
		<span class="sep"></span>
		<h1>{place} · Street Licenses &amp; Activity</h1>
		<button type="button" class="fb-open" onclick={openFeedback}>{FB.button}</button>
	</header>
	<p class="proto">Prototype</p>

	<main id="main">
		<div class="map" bind:this={container} role="region" aria-label="Map of {data.district.label}"></div>
		<p class="status" class:shown={failed} role="status">{status}</p>
		<button type="button" class="tilt" aria-pressed={tilted} onclick={setTilt} disabled={!loaded} title="Tilt the map to see the 311 piles in 3D">3D</button>
		{#if !panelShown}<button type="button" class="show show-panel" id="show-panel" aria-controls="panel" onclick={() => collapse('panel')}>« Layers</button>{/if}
		{#if !statsShown}<button type="button" class="show show-stats" id="show-stats" aria-controls="stats" onclick={() => collapse('stats')}>Show stats</button>{/if}

		<dialog bind:this={dlg} aria-labelledby="fb-h" class="fb">
			<h2 id="fb-h">{FB.title}</h2>
			{#if fbState === 'sent'}
				<p role="status">{FB.sent}</p>
				<button type="button" onclick={() => dlg.close()}>Close</button>
			{:else}
				<form onsubmit={submitFeedback}>
					<p>{FB.intro}</p>
					<label for="fb-text">{FB.description}</label>
					<textarea id="fb-text" required maxlength={LIMITS.description} rows="5" bind:value={fb.description}></textarea>
					<label for="fb-name">{FB.name}</label>
					<input id="fb-name" maxlength={LIMITS.name} autocomplete="name" bind:value={fb.name} />
					<label for="fb-email">{FB.email}</label>
					<input id="fb-email" type="email" maxlength={LIMITS.email} autocomplete="email" bind:value={fb.email} />
					<!-- Honeypot: people never see or reach it; the endpoint drops any report that fills it. -->
					<div class="hp" aria-hidden="true">
						<label for="fb-website">Website</label>
						<input id="fb-website" tabindex="-1" autocomplete="off" bind:value={fb.website} />
					</div>
					<p role="status" class="fb-msg">{fbState === 'sending' ? FB.sending : fbState === 'busy' ? FB.busy : fbState === 'failed' ? FB.failed : ''}</p>
					<div class="fb-buttons">
						<button type="submit" disabled={fbState === 'sending'}>{FB.send}</button>
						<button type="button" class="secondary" onclick={() => dlg.close()}>{FB.cancel}</button>
					</div>
				</form>
			{/if}
		</dialog>
	</main>

	<aside class="side" id="panel" aria-label="Map layers" hidden={!panelShown}>
		<button type="button" class="hide" id="hide-panel" aria-controls="panel" onclick={() => collapse('panel')}>Hide panel »</button>
		{#each RECORD_GROUPS as g (g.h)}
			<h2>{g.h}{#if g.small}{' '}<small>({g.small})</small>{/if}</h2>
			{#each g.items as [k, label] (k)}
				<button type="button" class="btn" aria-pressed={rec[k]} onclick={() => flip(rec, k)}>
					<span class="sw" class:hollow={SOURCE_HOLLOW.includes(k)} style="--c:{SOURCE_COLOR[k]}"></span>{label}<span class="n">{counts[k] ?? ''}</span>
				</button>
			{/each}
		{/each}

		<h2>Schools &amp; houses of worship</h2>
		{#each SW_KINDS as k (k)}
			<button type="button" class="btn" aria-pressed={sw[k]} onclick={() => flip(sw, k)}>
				<span class="sw" style="--c:{SW_COLOR[k]}"></span>{SW_LABEL[k]}<span class="n">{counts[k] ?? ''}</span>
			</button>
		{/each}

		<h2>Distance rings <small>(approximate)</small></h2>
		<button type="button" class="btn" aria-pressed={rings.liquor} onclick={() => flip(rings, 'liquor')}>
			<span class="sw ring" style="--c:{RING_COLOR.liquor}"></span>Liquor: {data.ring_ft.list_ft} ft<span class="n">schools, worship</span>
		</button>
		<button type="button" class="btn" aria-pressed={rings.cannabis} onclick={() => flip(rings, 'cannabis')}>
			<span class="sw ring dashed" style="--c:{RING_COLOR.cannabis}"></span>Cannabis: {data.ring_ft.cannabis_school_ft} / {data.ring_ft.cannabis_worship_ft} ft<span class="n">schools / worship</span>
		</button>
		<p class="note">Rings show whether or not the school and worship points are on. Other religious property has no ring. {RING_NOTE}</p>

		<h2>311 complaints <small>(at bars, clubs, restaurants)</small></h2>
		<div class="row2">
			<div>
				<label for="y0">From</label>
				<select id="y0" value={y0} onchange={(e) => setYears(+e.currentTarget.value, Math.max(y1, +e.currentTarget.value))}>
					{#each years as y (y)}<option value={y}>{y}</option>{/each}
				</select>
			</div>
			<div>
				<label for="y1">To</label>
				<select id="y1" value={y1} onchange={(e) => setYears(Math.min(y0, +e.currentTarget.value), +e.currentTarget.value)}>
					{#each years as y (y)}<option value={y}>{y}</option>{/each}
				</select>
			</div>
		</div>
		{#each C311_GROUPS as g (g.key)}
			<button type="button" class="btn" aria-pressed={c311On[g.key]} onclick={() => flip(c311On, g.key)}>
				<span class="sw sq" style="--c:{g.color}"></span>{g.label}<span class="n">{typeCounts[g.key] ?? ''}</span>
			</button>
		{/each}
		<p class="note">Zoomed out, each address is one circle, larger for more complaints, in the color of its most common type. Zoomed in, each complaint is a chip, piled at its address; piles of {LABEL_MIN} or more show their total. Press 3D to stand the piles up.</p>

		<details class="about">
			<summary>About this map</summary>
			<p class="note">A second layout of SLAM's map of {data.district.label}, after BetaNYC's map of Manhattan's privately owned public spaces. Every layer turns on and off by itself. On the map, outdoor dining is drawn over cannabis, and cannabis over liquor. The years apply to 311 complaints only.</p>
			<p class="note">Data: SLAM's nightly files for this district, from State Liquor Authority licenses and applications (data.ny.gov f8i8-k2gm, 9s3h-dpkz, 6dg3-2z7i), the Office of Cannabis Management (gttd-5u6y, jskf-tt3q), Dining Out NYC (fpeh-f7ci), 311 Service Requests (erm2-nwe9), the Facilities Database (ji82-xba5) and PLUTO (64uk-42ks). BetaNYC placed and grouped the records, so this is not an official City or State record. Updated {fmtStamp(data.manifest.data_fetched)}. {basemapLine}</p>
			<p class="note"><a href={resolve('/[district]/map', { district: data.slug })}>The first map of this district</a> · <a href={resolve('/[district]', { district: data.slug })}>List view</a> · <a href={resolve('/about', {})}>About SLAM</a> · <a href={resolve('/whats-changed', {})} data-sveltekit-reload>What's changed</a></p>
		</details>
	</aside>

	<section class="bar" id="stats" aria-label="Totals and chart" hidden={!statsShown}>
		<button type="button" class="hide" id="hide-stats" aria-controls="stats" onclick={() => collapse('stats')}>Hide stats</button>
		<div>
			<h2>{place} · 311 {rangeLabel}</h2>
			<div class="counts">
				<div><b>{data.district.counts.liquor_active}</b><span>active liquor licenses</span></div>
				<div><b>{data.district.counts.liquor_pending}</b><span>pending applications</span></div>
				<div><b>{shown311.features.length.toLocaleString('en-US')}</b><span>311 complaints</span></div>
			</div>
			<p class="sub">311 data through {data.c311?.through ?? '—'}.</p>
		</div>
		<div class="chart">
			<h2 id="chart-h">311 complaints per year (select a year; * = to date)</h2>
			<div class="cols" role="group" aria-labelledby="chart-h">
				{#each byYear as b (b.y)}
					<button type="button" class="col" class:out={b.y < y0 || b.y > y1} aria-pressed={y0 === b.y && y1 === b.y} onclick={() => pickYear(b.y)}>
						<span class="num">{b.total.toLocaleString('en-US')}</span>
						<span class="stack" style="height:calc((100% - 32px) * {b.total / maxYear})">
							{#each C311_GROUPS as g (g.key)}<span style="flex-grow:{b.n[g.key]};background:{g.color}"></span>{/each}
						</span>
						<span class="sr-only">complaints in</span>
						<span class="yr">{b.y}{b.y === years[years.length - 1] ? '*' : ''}</span>
					</button>
				{/each}
			</div>
		</div>
		<div class="legend">
			<h2>Legend</h2>
			<ul>
				{#each RECORD_GROUPS.flatMap((g) => g.items) as [k, label] (k)}<li><span class="sw" class:hollow={SOURCE_HOLLOW.includes(k)} style="--c:{SOURCE_COLOR[k]}"></span>{label}</li>{/each}
				{#each SW_KINDS as k (k)}<li><span class="sw" style="--c:{SW_COLOR[k]}"></span>{SW_KIND[k]}</li>{/each}
				{#each C311_GROUPS as g (g.key)}<li><span class="sw sq" style="--c:{g.color}"></span>311: {g.label}</li>{/each}
			</ul>
		</div>
	</section>
</div>

<style>
	/* Layout after pops-map map_template_v2.html; colors from SLAM's app.css and format.js. */
	.app { --side: 310px; --bar: 150px; --panel: #2359a8; }
	.app.noside { --side: 0px; }
	.app.nobar { --bar: 0px; }
	.side[hidden], .bar[hidden] { display: none; }
	.map { position: fixed; inset: 0 var(--side) var(--bar) 0; }
	main { padding: 0; }
	h1, h2 { margin: 0; }
	.head { position: fixed; top: 8px; left: 10px; z-index: 4; display: flex; align-items: center; gap: 12px; min-height: 48px; padding: 4px 12px; max-width: calc(100vw - var(--side) - 30px); background: #fff; border-radius: 4px; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25); }
	.brand { display: flex; line-height: 0; }
	.brand img { height: 30px; width: auto; }
	.head h1 { font-size: clamp(14px, 1.6vw, 20px); font-weight: 400; color: var(--blue); text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
	.sep { width: 1px; height: 26px; background: var(--line); flex: none; }
	.fb-open { flex: none; min-height: 32px; padding: 0 12px; border: 1px solid var(--blue); border-radius: 16px; background: var(--blue); color: #fff; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
	.proto { position: fixed; top: 64px; left: 52px; z-index: 4; margin: 0; background: #fff4cc; color: #5c4300; font-size: 12px; font-weight: 600; padding: 4px 8px; border-radius: 3px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2); }
	:global(.maplibregl-ctrl-top-left) { top: 64px; }
	.tilt { position: fixed; top: 172px; left: 10px; z-index: 2; width: 29px; height: 29px; border: 0; border-radius: 4px; background: #fff; box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.1); font-size: 11px; font-weight: 700; color: var(--blue); cursor: pointer; padding: 0; }
	.tilt[aria-pressed='true'] { background: var(--blue); color: #fff; }
	.status { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; margin: -1px; }
	.status.shown { position: fixed; z-index: 5; top: 110px; left: 50px; right: calc(var(--side) + 20px); width: auto; height: auto; clip: auto; white-space: normal; margin: 0; padding: 8px 12px; background: #fff; border-left: 4px solid #b71a03; }
	.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }

	.side { position: fixed; top: 0; right: 0; bottom: 0; width: var(--side); z-index: 3; background: var(--panel); color: #fff; overflow-y: auto; padding: 8px 12px 20px; }
	.side h2 { font-size: 14px; font-weight: 600; text-transform: uppercase; padding: 12px 0 6px; border-bottom: 1px solid var(--blue-secondary); margin-bottom: 8px; }
	.side h2 small { font-weight: 400; text-transform: none; }
	.side label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px; }
	.side :global(a) { color: #fff; }
	.row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px; }
	select { width: 100%; height: 32px; border: 0; border-radius: 3px; padding: 0 6px; font: inherit; font-size: 14px; color: var(--blue); background: #fff; }
	select:focus-visible { outline: 3px solid #f59e0b; outline-offset: 2px; }
	.btn { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 32px; margin: 0 0 6px; padding: 5px 10px; border: 1px solid #fff; border-radius: 3px; background: transparent; color: #fff; font: inherit; font-size: 13.5px; text-align: left; cursor: pointer; }
	.btn .n { margin-left: auto; }
	.btn[aria-pressed='true'] { background: #fff; color: var(--blue); }
	.btn:hover { background: var(--blue-secondary); color: var(--blue); }
	.sw { display: inline-block; width: 12px; height: 12px; border-radius: 50%; flex: none; background: var(--c); border: 1.5px solid #fff; box-shadow: 0 0 0 1px #949494; }
	.sw.hollow { background: #fff; border: 2.5px solid var(--c); }
	.sw.sq { border-radius: 2px; }
	.sw.ring { background: #fff; border: 2px solid var(--c); }
	.sw.dashed { border-style: dashed; }
	.note { font-size: 12.5px; line-height: 1.45; margin: 4px 0 6px; color: inherit; background: none; border: 0; padding: 0; }
	.about summary { cursor: pointer; font-size: 14px; font-weight: 600; text-transform: uppercase; padding: 12px 0 6px; border-bottom: 1px solid var(--blue-secondary); }
	.hide { min-height: 26px; padding: 0 10px; border-radius: 13px; font: inherit; font-size: 12px; cursor: pointer; }
	.side .hide { display: block; margin: 0 0 0 auto; border: 1px solid #fff; background: transparent; color: #fff; }
	.bar .hide { position: absolute; top: 6px; right: 10px; z-index: 1; border: 1px solid var(--blue); background: #fff; color: var(--blue); }
	.show { position: fixed; z-index: 5; min-height: 34px; padding: 0 14px; border: 0; border-radius: 17px; background: var(--blue); color: #fff; font: inherit; font-size: 13px; font-weight: 700; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35); cursor: pointer; }
	.show-panel { top: 12px; right: 12px; }
	.show-stats { bottom: 28px; left: 50%; transform: translateX(-50%); }

	.bar { position: fixed; left: 0; right: var(--side); bottom: 0; height: var(--bar); z-index: 3; background: #fff; border-top: 3px solid var(--blue); display: grid; grid-template-columns: minmax(250px, 2fr) 3fr minmax(340px, 2.2fr); grid-template-rows: minmax(0, 1fr); gap: 0 18px; padding: 8px 14px; }
	.bar h2 { font-size: 13px; font-weight: 600; text-transform: uppercase; color: var(--blue); margin-bottom: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.counts { display: grid; grid-template-columns: repeat(3, 1fr); text-align: center; border-top: 1px solid var(--line); padding-top: 6px; }
	.counts b { display: block; font-size: 22px; color: var(--blue); }
	.counts span { font-size: 12px; }
	.sub { font-size: 12px; margin: 6px 0 0; }
	.chart { min-width: 0; min-height: 0; display: flex; flex-direction: column; }
	.cols { flex: 1; display: flex; gap: 4px; min-height: 0; }
	.col { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; min-width: 0; padding: 0 2px; border: 0; border-radius: 3px; background: transparent; color: var(--ink); font: inherit; font-size: 11px; cursor: pointer; }
	.col:hover { background: var(--bg-soft); }
	.col[aria-pressed='true'] { outline: 2px solid var(--blue); }
	.stack { display: flex; flex-direction: column-reverse; width: 70%; min-height: 1px; }
	.col.out .stack { opacity: 0.3; }
	.legend { font-size: 11px; line-height: 1.3; overflow: hidden; }
	.legend h2 { margin-right: 90px; }
	.legend ul { list-style: none; margin: 0; padding: 0; columns: 2; }
	.legend li { display: flex; align-items: center; gap: 5px; margin-bottom: 1px; break-inside: avoid; }
	.legend .sw { width: 10px; height: 10px; }

	.fb { max-width: min(30rem, calc(100vw - 2rem)); border: 0; border-top: 4px solid var(--blue); border-radius: 4px; padding: 1rem 1.25rem; }
	.fb::backdrop { background: rgba(0, 0, 0, 0.4); }
	.fb h2 { font-size: 1.1rem; color: var(--blue); margin-bottom: 0.5rem; }
	.fb label { display: block; font-weight: 600; margin: 0.6rem 0 0.2rem; }
	.fb textarea, .fb input { width: 100%; font: inherit; padding: 0.4rem; border: 1px solid var(--line); border-radius: 3px; }
	.fb textarea:focus-visible { outline: 3px solid #f59e0b; outline-offset: 2px; }
	.fb button { min-height: 2.25rem; padding: 0 1rem; border: 1px solid var(--blue); border-radius: 3px; background: var(--blue); color: #fff; font: inherit; cursor: pointer; }
	.fb button.secondary { background: #fff; color: var(--blue); }
	.fb-buttons { display: flex; gap: 0.5rem; }
	.fb-msg:empty { display: none; }
	.hp { position: absolute; left: -10000px; width: 1px; height: 1px; overflow: hidden; }

	/* A phone: the panel opens over the map from the "Layers" button; the bar stacks; no legend. */
	@media (max-width: 760px) {
		.app, .app.noside { --side: 0px; --bar: 150px; }
		.app.nobar { --bar: 0px; }
		.side { width: 100%; z-index: 6; }
		.head { min-height: 40px; gap: 8px; padding: 4px 8px; max-width: calc(100vw - 20px); }
		.brand img { height: 20px; }
		.head h1 { font-size: 13px; }
		.proto { top: 58px; left: 10px; }
		:global(.maplibregl-ctrl-top-left) { top: 84px; }
		.tilt { top: 192px; }
		.show-panel { top: auto; right: auto; left: 12px; bottom: calc(var(--bar) + 12px); }
		.bar { grid-template-columns: 1fr; overflow-y: auto; }
		.legend { display: none; }
	}
</style>
