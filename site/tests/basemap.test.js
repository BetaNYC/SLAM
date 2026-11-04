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
	assert.deepEqual(urls.sort(), [CITY_STYLE_URL, `${SVC}/tile/0/0/0.pbf`].sort());
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
