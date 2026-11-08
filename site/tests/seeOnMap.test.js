// #118: "See on map" from an address page opens the district map at the address, with the rings
// that fit its records, through the map's own link format, without overwriting saved layer choices.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { mapLinkFor, mapLinkState, mapLinkNote, ADDRESS_ZOOM } from '../src/lib/mapLink.js';
import { parseHash, buildHash, loadPrefs, storePrefs, prefsGate, EXTRA_KEYS, PREFS_KEY, MAP_DEFAULTS } from '../src/lib/mapState.js';
import { readAddress, renderAddress } from './helpers/addressView.js';

const MAP = 'src/routes/[district]/map/+page.svelte';
const mapSrc = readFileSync(MAP, 'utf8');
const LAYERS = JSON.parse(mapSrc.match(/const LAYERS = (\[[^\]]*\]);/)?.[1].replaceAll("'", '"') ?? 'null');
const KNOWN = [...LAYERS, ...EXTRA_KEYS];
const DISTRICTS = Object.keys(JSON.parse(readFileSync('static/data/manifest.json', 'utf8')).districts);
const verdict = /\b(violat\w*|meets?|eligib\w*|allowed|complian\w*|prohibit\w*|illegal|legal to)\b/i;

/** A made-up address with these record sources. @param {string[]} sources @param {Record<string, any>} [extra] */
const addr = (sources, extra = {}) => ({
	id: '1000001',
	district: 'mn-cd1',
	lat: 40.711541242137,
	lon: -74.011421076206,
	point: { measured: true, outside_districts: false },
	records: sources.map((source) => ({ source })),
	...extra
});
/** The hash of a link. @param {string | null} href */
const hashOf = (href) => parseHash(String(href).split('#')[1] ?? '', KNOWN);

function fakeStorage() {
	/** @type {Record<string, string>} */
	const store = {};
	const storage = /** @type {any} */ ({
		getItem: (/** @type {string} */ k) => store[k] ?? null,
		setItem: (/** @type {string} */ k, /** @type {string} */ v) => (store[k] = v),
		removeItem: (/** @type {string} */ k) => delete store[k]
	});
	return { store, storage };
}

test('liquor only: liquor layers present, schools and worship, liquor rings', () => {
	const h = hashOf(mapLinkFor(addr(['liquor_pending', 'liquor_active', 'liquor_inactive']), DISTRICTS));
	assert.deepEqual(h.on, ['liquor_pending', 'liquor_active', 'sw', 'rings_liquor']);
	assert.deepEqual(hashOf(mapLinkFor(addr(['liquor_active']), DISTRICTS)).on, ['liquor_active', 'sw', 'rings_liquor']);
	assert.deepEqual(hashOf(mapLinkFor(addr(['liquor_pending']), DISTRICTS)).on, ['liquor_pending', 'sw', 'rings_liquor']);
});

test('cannabis only, including a license that is only In-Process: cannabis layers and cannabis rings', () => {
	const inProcess = addr([]);
	inProcess.records = [{ source: 'cannabis_license', status: 'In-Process' }];
	assert.deepEqual(hashOf(mapLinkFor(inProcess, DISTRICTS)).on, ['cannabis_license', 'sw', 'rings_cannabis']);
	assert.deepEqual(hashOf(mapLinkFor(addr(['cannabis_retail']), DISTRICTS)).on, ['cannabis_retail', 'sw', 'rings_cannabis']);
	assert.deepEqual(hashOf(mapLinkFor(addr(['cannabis_retail', 'cannabis_license']), DISTRICTS)).on, ['cannabis_retail', 'cannabis_license', 'sw', 'rings_cannabis']);
});

test('both: both groups\' layers and both rings', () => {
	const h = hashOf(mapLinkFor(addr(['cannabis_retail', 'liquor_active', 'liquor_inactive']), DISTRICTS));
	assert.deepEqual(h.on, ['liquor_active', 'cannabis_retail', 'sw', 'rings_liquor', 'rings_cannabis']);
	assert.deepEqual(mapLinkState(addr(['cannabis_license', 'liquor_pending'])).groups, ['liquor', 'cannabis']);
});

test('neither (inactive liquor only, Dining Out only, nothing): no layer list, so saved layers or the defaults apply', () => {
	for (const sources of [['liquor_inactive'], ['dining_out'], []]) {
		const href = mapLinkFor(addr(sources), DISTRICTS);
		assert.ok(href, sources.join());
		assert.doesNotMatch(href, /[#&]on=|c311=/, sources.join());
		const h = hashOf(href);
		assert.equal(h.on, null);
		assert.equal(h.c311, null);
		assert.ok(h.view);
		assert.equal(h.sel, '1000001');
	}
	assert.equal(mapLinkNote([]), 'the district map, with its usual layers');
});

test('the link: district map path, address point at street zoom, address selected; round-trips through parseHash', () => {
	const a = addr(['liquor_pending']);
	const href = mapLinkFor(a, DISTRICTS);
	assert.equal(href, '/mn-cd1/map/#v=17.00/40.71154/-74.01142&on=liquor_pending,sw,rings_liquor&sel=1000001');
	const h = hashOf(href);
	assert.deepEqual(h.view, { z: ADDRESS_ZOOM, lat: 40.71154, lon: -74.01142 });
	assert.equal(h.sel, a.id);
	// Built only through buildHash: the same state gives the same hash, and parsing it back gives it again.
	const s = mapLinkState(a);
	assert.equal(href.split('#')[1], buildHash({ view: s.view, on: s.on, sel: s.sel }));
	assert.equal(buildHash({ view: /** @type {any} */ (h.view), on: h.on, sel: h.sel }), href.split('#')[1]);
	// One copy of the format: mapLink.js has no hash keys of its own.
	const lib = readFileSync('src/lib/mapLink.js', 'utf8');
	assert.match(lib, /buildHash\(/);
	assert.doesNotMatch(lib, /['`](v|on|sel|c311)=/);
	// The zoom is the one the map already uses for an address from the search box.
	assert.match(mapSrc, /map\.jumpTo\(\{ center: at, zoom: 17 \}\)/);
	assert.equal(ADDRESS_ZOOM, 17);
	// A path that already ends in / is not doubled; a custom base path is kept.
	assert.equal(mapLinkFor(a, DISTRICTS, (d) => `/slam/${d}/map/`)?.startsWith('/slam/mn-cd1/map/#v='), true);
});

test('buildHash still writes every part when given, so the map\'s own links are unchanged', () => {
	assert.equal(buildHash({ view: { z: 15.2, lat: 40.70412, lon: -73.92131 }, on: ['liquor_pending', 'liquor_active'], c311: 'stacks', sel: '3072409' }), 'v=15.20/40.70412/-73.92131&on=liquor_pending,liquor_active&c311=stacks&sel=3072409');
	// An empty list still means "every layer off", unlike a missing one.
	assert.deepEqual(parseHash(buildHash({ view: { z: 15, lat: 40.7, lon: -73.9 }, on: [], c311: 'dots' }), KNOWN).on, []);
});

test('no link without a usable point or outside the pilot districts', () => {
	assert.equal(mapLinkFor(addr(['liquor_active'], { district: 'qn-cd1' }), DISTRICTS), null);
	assert.equal(mapLinkFor(addr(['liquor_active'], { lat: null }), DISTRICTS), null);
	assert.equal(mapLinkFor(addr(['liquor_active'], { lon: undefined }), DISTRICTS), null);
	assert.equal(mapLinkFor(addr(['liquor_active'], { lat: 42.65, lon: -73.75 }), DISTRICTS), null); // a point the map would drop
	assert.equal(mapLinkFor(addr(['liquor_active'], { point: { measured: false, outside_districts: true } }), DISTRICTS), null);
	assert.equal(mapLinkFor(null, DISTRICTS), null);
	// Just across the district line but measured: still on the map, so still linked.
	assert.ok(mapLinkFor(addr(['liquor_active'], { point: { measured: true, outside_districts: true } }), DISTRICTS));
});

test('built data: the link is on address pages in each district, with the right rings', async () => {
	const cases = [
		// 185 Greenwich St (Manhattan CB1): pending, active and inactive liquor.
		['1089309', '185 Greenwich St', 'mn-cd1', ['liquor_pending', 'liquor_active', 'sw', 'rings_liquor'], 'liquor distance rings on'],
		// 44 Wilson Ave (Brooklyn CB4): active and inactive liquor.
		['3071959', '44 WILSON AVE', 'bk-cd4', ['liquor_active', 'sw', 'rings_liquor'], 'liquor distance rings on'],
		// 412 Knickerbocker Ave (Brooklyn CB4): one cannabis license, In-Process.
		['3074784', '412 Knickerbocker Ave', 'bk-cd4', ['cannabis_license', 'sw', 'rings_cannabis'], 'cannabis distance rings on'],
		// 111 Fulton St (Manhattan CB1): cannabis and liquor.
		['1001263', '111 FULTON ST', 'mn-cd1', ['liquor_active', 'cannabis_retail', 'sw', 'rings_liquor', 'rings_cannabis'], 'liquor and cannabis distance rings on']
	];
	for (const [id, street, slug, on, note] of cases) {
		const a = readAddress(/** @type {string} */ (id));
		assert.equal(a.street, street);
		const html = await renderAddress(a);
		const m = html.match(/<a href="([^"]+)">See ([^<]+) on the map<\/a>/);
		assert.ok(m, `${id}: link present`);
		assert.equal(m[2], street);
		const href = m[1].replaceAll('&amp;', '&');
		assert.ok(href.startsWith(`/${slug}/map/#`), href);
		const h = hashOf(href);
		assert.deepEqual(h.on, on, id);
		assert.equal(h.sel, id);
		assert.ok(h.view && Math.abs(h.view.lat - a.lat) < 1e-5 && Math.abs(h.view.lon - a.lon) < 1e-5, id);
		assert.ok(html.includes(note), `${id}: ${note}`);
		// Near the top, with the other address actions: after the heading, before the records table.
		const at = html.indexOf('on the map</a>');
		assert.ok(at > html.indexOf('</h1>') && at < html.indexOf('At this address ('), `${id}: placement`);
	}
});

test('built data: every address page has the link, except the two whose point is outside the data area', async () => {
	const ids = readdirSync('static/data/address').filter((f) => f !== 'index.json').map((f) => f.replace(/\.json$/, ''));
	const without = [];
	for (const id of ids) {
		const a = readAddress(id);
		if (!mapLinkFor(a, DISTRICTS)) without.push(id);
	}
	for (const id of without) assert.equal(readAddress(id).point.measured, false, id);
	assert.ok(without.length < 5, `few addresses without a link (${without.length})`);
	// Such a page renders no link and no broken anchor.
	if (without.length) assert.doesNotMatch(await renderAddress(readAddress(without[0])), /on the map<\/a>/);
});

test('a link with layers does not overwrite saved choices until the person changes something', () => {
	const { store, storage } = fakeStorage();
	storePrefs(storage, { on: ['dining_out', 'c311'], c311: 'dots', open: true });
	const saved = store[PREFS_KEY];
	// The map opened from "See on map": layers in the link.
	const hs = parseHash(mapLinkFor(addr(['cannabis_license']), DISTRICTS)?.split('#')[1] ?? '', KNOWN);
	const gate = prefsGate(hs.on);
	// What writeState does on load, on every pan and on the selection: only saves once the gate is open.
	for (let i = 0; i < 3; i++) if (gate.open) storePrefs(storage, { on: hs.on ?? [], c311: 'stacks', open: true });
	assert.equal(store[PREFS_KEY], saved, 'saved choices untouched by a hash-driven load');
	assert.deepEqual(loadPrefs(storage, KNOWN)?.on, ['dining_out', 'c311']);
	// The person turns something on: from then on the map saves as before.
	gate.touch();
	if (gate.open) storePrefs(storage, { on: ['cannabis_license', 'sw', 'rings_cannabis', 'dining_out'], c311: 'stacks', open: true });
	assert.deepEqual(loadPrefs(storage, KNOWN)?.on, ['cannabis_license', 'sw', 'rings_cannabis', 'dining_out']);
	// A load without layers in the link saves straight away, as before #118.
	assert.equal(prefsGate(null).open, true);
	assert.equal(prefsGate(parseHash('#v=17/40.7/-74', KNOWN).on).open, true);
	assert.equal(prefsGate([]).open, false);
});

test('the map page: gated saving, opened by a change in the Layers box, a real toggle of the box, or Reset', () => {
	/** @param {string} name */
	const fnBody = (name) => {
		const start = mapSrc.indexOf(`function ${name}(`);
		const open = mapSrc.indexOf('{', mapSrc.indexOf(')', start));
		let depth = 0;
		for (let i = open; i < mapSrc.length; i++) {
			if (mapSrc[i] === '{') depth++;
			else if (mapSrc[i] === '}' && --depth === 0) return mapSrc.slice(open, i + 1);
		}
		throw new Error(name);
	};
	assert.match(fnBody('writeState'), /if \(gate\.open\) storePrefs\(window\.localStorage,/);
	assert.match(mapSrc, /gate = prefsGate\(hs\.on\);/);
	// Capture runs before any control's own change handler writes the state.
	assert.match(mapSrc, /<fieldset class="layers" onchangecapture=\{\(\) => gate\.touch\(\)\}>/);
	assert.match(mapSrc, /if \(e\.currentTarget\.open !== layersOpen\) gate\.touch\(\);/);
	// Reset still forgets the saved choices, and counts as a change.
	const reset = fnBody('resetLayers');
	assert.match(reset, /gate\.touch\(\);/);
	assert.match(reset, /clearPrefs\(window\.localStorage\)/);
	// Defaults are still never re-saved once the gate is open.
	const { store, storage } = fakeStorage();
	storePrefs(storage, { on: [...MAP_DEFAULTS.on], c311: MAP_DEFAULTS.c311, open: true });
	assert.equal(store[PREFS_KEY], undefined);
});

test('no verdict words in the link, its note or the helper', async () => {
	assert.equal(readFileSync('src/lib/mapLink.js', 'utf8').match(verdict), null);
	for (const g of [[], ['liquor'], ['cannabis'], ['liquor', 'cannabis']]) assert.equal(mapLinkNote(/** @type {any} */ (g)).match(verdict), null);
	const html = await renderAddress(readAddress('1001263'));
	const line = html.slice(html.indexOf('see-on-map'), html.indexOf('</p>', html.indexOf('see-on-map')));
	assert.equal(line.match(verdict), null);
});
