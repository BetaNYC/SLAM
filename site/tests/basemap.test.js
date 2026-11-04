// The City basemap module (#lib/basemap.js). node --test.
// Fixtures are the real files, fetched once on 2026-11-04:
//   city_basemap_root.json    = VectorTileServer/resources/styles/root.json
//   city_basemap_service.json = VectorTileServer?f=json (the fields we use)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
	absolutizeCityStyle,
	quietCityStyle,
	resolveTemplate,
	chooseBasemap,
	basemapNote,
	isUsableStyle,
	isCityError,
	basemapSwitcher,
	carryOverlays,
	cityResourceProbes,
	probeFontstack,
	CITY_SERVICE_URL,
	CITY_STYLE_URL,
	CITY_TILE_PATH,
	CITY_HIDDEN_LAYERS,
	CITY_ATTRIBUTION,
	FALLBACK_STYLE_URL
} from '../src/lib/basemap.js';

const fx = (/** @type {string} */ n) => JSON.parse(readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8'));
const root = fx('city_basemap_root.json');
const service = fx('city_basemap_service.json');
const SVC = CITY_SERVICE_URL;

test('the captured style and service are what the module was built against', () => {
	assert.equal(root.version, 8);
	assert.equal(root.sources.esri.url, '../../');
	assert.equal(root.sprite, '../sprites/sprite');
	assert.equal(root.glyphs, '../fonts/{fontstack}/{range}.pbf');
	assert.deepEqual(service.tiles, [CITY_TILE_PATH]);
	assert.equal(`${SVC}/${service.defaultStyles}/root.json`, CITY_STYLE_URL);
	assert.equal(service.copyrightText, 'SOURCE: NYC OTI');
	assert.ok(CITY_ATTRIBUTION.includes(service.copyrightText));
	assert.ok(CITY_ATTRIBUTION.includes('Powered by Esri'));
});

test('resolveTemplate keeps {placeholders} unencoded', () => {
	assert.equal(resolveTemplate('../fonts/{fontstack}/{range}.pbf', CITY_STYLE_URL), `${SVC}/resources/fonts/{fontstack}/{range}.pbf`);
	assert.equal(resolveTemplate('tile/{z}/{y}/{x}.pbf', `${SVC}/`), `${SVC}/tile/{z}/{y}/{x}.pbf`);
	assert.equal(resolveTemplate('https://example.org/{z}', CITY_STYLE_URL), 'https://example.org/{z}');
});

test('absolutizeCityStyle rewrites the real root.json to absolute URLs', () => {
	const s = absolutizeCityStyle(root);
	assert.equal(s.sources.esri.url, undefined);
	assert.deepEqual(s.sources.esri.tiles, [`${SVC}/tile/{z}/{y}/{x}.pbf`]);
	assert.equal(s.sources.esri.attribution, CITY_ATTRIBUTION);
	assert.equal(s.sources.esri.maxzoom, 23);
	assert.equal(s.sprite, `${SVC}/resources/sprites/sprite`);
	assert.equal(s.glyphs, `${SVC}/resources/fonts/{fontstack}/{range}.pbf`);
	assert.equal(s.layers.length, root.layers.length);
	// No relative URL left anywhere in the style.
	const json = JSON.stringify(s);
	assert.ok(!json.includes('"../'), 'a relative URL survived');
	// The input is left alone.
	assert.equal(root.sources.esri.url, '../../');
});

test('quietCityStyle hides exactly the listed layers and lightens buildings', () => {
	const s = quietCityStyle(absolutizeCityStyle(root));
	const ids = new Set(s.layers.map((/** @type {any} */ l) => l.id));
	for (const id of CITY_HIDDEN_LAYERS) assert.ok(ids.has(id), `${id} is not in the City style`);
	const hidden = s.layers.filter((/** @type {any} */ l) => l.layout?.visibility === 'none').map((/** @type {any} */ l) => l.id);
	const hiddenBefore = root.layers.filter((/** @type {any} */ l) => l.layout?.visibility === 'none').map((/** @type {any} */ l) => l.id);
	assert.deepEqual(new Set(hidden), new Set([...hiddenBefore, ...CITY_HIDDEN_LAYERS]));
	const bld = s.layers.filter((/** @type {any} */ l) => l.type === 'fill' && l.id.startsWith('Buildings/'));
	assert.ok(bld.length >= 4);
	for (const l of bld) assert.equal(l.paint['fill-opacity'], 0.45);
	// Subway stations and street names stay.
	for (const id of ['Mass Transit/Subway Station', 'NYC Roads/label/Streets']) {
		assert.notEqual(s.layers.find((/** @type {any} */ l) => l.id === id).layout?.visibility, 'none');
	}
});

/** A fake fetch. `routes` maps a URL prefix to a handler. @param {(url: string) => Promise<any>} h */
const fakeFetch = (h) => /** @type {any} */ ((/** @type {string} */ url) => h(url));
const res = (/** @type {number} */ status, /** @type {any} */ body) => ({ ok: status >= 200 && status < 300, status, url: '', json: async () => body });

test('chooseBasemap uses the City style when style and tile both answer', async () => {
	const urls = /** @type {string[]} */ ([]);
	const b = await chooseBasemap({ fetch: fakeFetch(async (u) => (urls.push(u), res(200, u === CITY_STYLE_URL ? root : null))) });
	assert.equal(b.kind, 'city');
	assert.deepEqual(b.style.sources.esri.tiles, [`${SVC}/tile/{z}/{y}/{x}.pbf`]);
	assert.deepEqual(urls.sort(), [
		CITY_STYLE_URL,
		`${SVC}/tile/0/0/0.pbf`,
		`${SVC}/resources/sprites/sprite.json`,
		`${SVC}/resources/fonts/${probeFontstack(root)}/0-255.pbf`
	].sort());
});

test('the glyph probe uses the font street names are drawn in', () => {
	const streets = root.layers.find((/** @type {any} */ l) => l.id === 'NYC Roads/label/Streets');
	assert.equal(probeFontstack(root), streets.layout['text-font'].join(','));
	assert.deepEqual(cityResourceProbes(absolutizeCityStyle(root)), [
		`${SVC}/resources/sprites/sprite.json`,
		`${SVC}/resources/fonts/${probeFontstack(root)}/0-255.pbf`
	]);
	assert.equal(probeFontstack({ layers: [] }), null);
});

test('chooseBasemap falls back when only the sprite or only the fonts fail', async () => {
	for (const bad of ['/resources/sprites/', '/resources/fonts/']) {
		const b = await chooseBasemap({ fetch: fakeFetch(async (u) => (u.includes(bad) ? res(404, null) : res(200, u === CITY_STYLE_URL ? root : null))) });
		assert.equal(b.kind, 'fallback', bad);
		assert.match(b.reason ?? '', /HTTP 404/);
	}
});

test('chooseBasemap aborts the pending City requests when it times out', async () => {
	/** @type {AbortSignal[]} */
	const signals = [];
	const b = await chooseBasemap({
		timeoutMs: 30,
		fetch: /** @type {any} */ ((/** @type {string} */ _u, /** @type {any} */ o) => (signals.push(o.signal), new Promise(() => {})))
	});
	assert.equal(b.kind, 'fallback');
	assert.equal(signals.length, 2);
	assert.ok(signals.every((s) => s.aborted), 'every City fetch was aborted');
});

test('chooseBasemap falls back to OpenFreeMap on a network error', async () => {
	const b = await chooseBasemap({ fetch: fakeFetch(async () => { throw new TypeError('Failed to fetch'); }) });
	assert.equal(b.kind, 'fallback');
	assert.equal(b.style, FALLBACK_STYLE_URL);
	assert.match(b.reason ?? '', /Failed to fetch/);
});

test('chooseBasemap falls back when the style or the tile returns an HTTP error', async () => {
	let b = await chooseBasemap({ fetch: fakeFetch(async (u) => (u === CITY_STYLE_URL ? res(503, null) : res(200, null))) });
	assert.equal(b.kind, 'fallback');
	assert.match(b.reason ?? '', /HTTP 503/);
	b = await chooseBasemap({ fetch: fakeFetch(async (u) => (u === CITY_STYLE_URL ? res(200, root) : res(404, null))) });
	assert.equal(b.kind, 'fallback');
	assert.match(b.reason ?? '', /HTTP 404/);
});

test('chooseBasemap falls back on a timeout', async () => {
	const b = await chooseBasemap({ timeoutMs: 30, fetch: fakeFetch(() => new Promise(() => {})) });
	assert.equal(b.kind, 'fallback');
	assert.match(b.reason ?? '', /timed out/);
});

test('chooseBasemap falls back when the style is not a usable v8 style', async () => {
	const b = await chooseBasemap({ fetch: fakeFetch(async (u) => res(200, u === CITY_STYLE_URL ? { error: { code: 499 } } : null)) });
	assert.equal(b.kind, 'fallback');
	assert.equal(isUsableStyle(root), true);
	assert.equal(isUsableStyle({ version: 8, sources: {}, layers: [] }), false);
});

test('basemapNote names the source of the street map', () => {
	assert.match(basemapNote('city'), /NYC OTI/);
	assert.match(basemapNote('fallback'), /OpenStreetMap/);
});

// After start-up: the switch from the City basemap to OpenFreeMap (QA #69, finding 1).

/** A MapLibre tile error event, shaped as TileManager fires it (ErrorEvent + evented-parent data). */
const tileError = (/** @type {string} */ sourceId, /** @type {string} */ url) => ({
	type: 'error',
	sourceId,
	error: Object.assign(new Error(`AJAXError: Failed to fetch (0): ${url}`), { url, status: 0 })
});

test('isCityError recognizes City tile, sprite and style failures and nothing else', () => {
	assert.equal(isCityError(tileError('esri', `${SVC}/tile/3/3/2.pbf`)), true);
	// A sprite error comes from the style, with no sourceId, but the AJAXError carries the URL.
	assert.equal(isCityError({ error: Object.assign(new Error('x'), { url: `${SVC}/resources/sprites/sprite@2x.json` }) }), true);
	assert.equal(isCityError({ error: new Error(`AJAXError: Not Found (404): ${CITY_STYLE_URL}`) }), true);
	assert.equal(isCityError(tileError('openmaptiles', 'https://tiles.openfreemap.org/planet/1/2/3.pbf')), false);
	assert.equal(isCityError({ error: new Error('Layer "x" already exists on this map.') }), false);
	assert.equal(isCityError(undefined), false);
});

test('basemapSwitcher switches once, on the first City error, and never flaps', () => {
	let n = 0;
	const s = basemapSwitcher('city', () => n++);
	assert.equal(s.handle({ error: new Error('unrelated') }), false);
	assert.equal(s.switched, false);
	assert.equal(s.handle(tileError('esri', `${SVC}/tile/3/3/2.pbf`)), true);
	assert.equal(s.handle(tileError('esri', `${SVC}/tile/3/3/3.pbf`)), false);
	assert.equal(s.handle(tileError('esri', `${SVC}/tile/3/2/2.pbf`)), false);
	assert.equal(n, 1);
	assert.equal(s.switched, true);
});

test('basemapSwitcher never switches a map that started on the fallback', () => {
	let n = 0;
	const s = basemapSwitcher('fallback', () => n++);
	assert.equal(s.handle(tileError('esri', `${SVC}/tile/3/3/2.pbf`)), false);
	assert.equal(n, 0);
});

test('carryOverlays keeps every overlay source and layer, in order, with its visibility', () => {
	const city = quietCityStyle(absolutizeCityStyle(root));
	const pts = { type: 'FeatureCollection', features: [] };
	const prev = {
		...city,
		sources: { ...city.sources, district: { type: 'geojson', data: pts }, points: { type: 'geojson', data: pts }, c311: { type: 'geojson', data: pts }, sw: { type: 'geojson', data: pts } },
		layers: [
			...city.layers,
			{ id: 'district-casing', type: 'line', source: 'district' },
			{ id: 'district-line', type: 'line', source: 'district' },
			{ id: 'complaints_311', type: 'circle', source: 'c311', layout: { visibility: 'visible' } },
			{ id: 'schools_worship', type: 'circle', source: 'sw', layout: { visibility: 'none' } },
			{ id: 'liquor_pending-halo', type: 'circle', source: 'points' },
			{ id: 'liquor_pending', type: 'circle', source: 'points', layout: { visibility: 'visible' } }
		]
	};
	const next = { version: 8, sources: { openmaptiles: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' } }, layers: [{ id: 'background', type: 'background' }] };
	const out = carryOverlays(Object.keys(city.sources))(prev, next);
	assert.deepEqual(Object.keys(out.sources).sort(), ['c311', 'district', 'openmaptiles', 'points', 'sw']);
	assert.equal(out.sources.esri, undefined);
	assert.deepEqual(out.layers.map((/** @type {any} */ l) => l.id), ['background', 'district-casing', 'district-line', 'complaints_311', 'schools_worship', 'liquor_pending-halo', 'liquor_pending']);
	assert.equal(out.layers.find((/** @type {any} */ l) => l.id === 'schools_worship').layout.visibility, 'none');
	assert.ok(!out.layers.some((/** @type {any} */ l) => l.source === 'esri'), 'no City layer survives');
	assert.equal(carryOverlays([])(undefined, next), next);
});
