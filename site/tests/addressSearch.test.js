// Address search logic (#59). Fixtures are real GeoSearch /v2/autocomplete responses
// recorded 2026-11-04 (tests/fixtures/autocomplete_*.json); none are hand-written.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
	MAX_SUGGESTIONS,
	autocompleteUrl,
	countMessage,
	districtAt,
	distanceM,
	makeSequencer,
	nextActive,
	realBin,
	resolvePick,
	locate,
	districtFor,
	districtsCovering,
	cachedLoader,
	districtsNear,
	searchUrl,
	shouldQuery,
	toSuggestions
} from '../src/lib/addressSearch.js';

/** @param {string} n */
const fx = (n) => JSON.parse(readFileSync(new URL(`fixtures/${n}`, import.meta.url), 'utf8'));

test('queries start at 2 characters and go to the keyless v2 endpoints', () => {
	assert.equal(shouldQuery('1'), false);
	assert.equal(shouldQuery(' 1 '), false);
	assert.equal(shouldQuery('18'), true);
	assert.equal(autocompleteUrl(' 185 Greenwich '), 'https://geosearch.planninglabs.nyc/v2/autocomplete?text=185+Greenwich');
	assert.equal(searchUrl('44 Wilson Ave'), 'https://geosearch.planninglabs.nyc/v2/search?text=44+Wilson+Ave&size=1');
	assert.doesNotMatch(autocompleteUrl('x y') + searchUrl('x y'), /key|token/i);
});

test('toSuggestions reads label, BIN and [lon, lat] from a real response', () => {
	const [s] = toSuggestions(fx('autocomplete_185_greenwich.json'));
	assert.deepEqual(s, { label: '185 GREENWICH STREET, New York, NY', bin: '1089309', lon: -74.011421, lat: 40.711541 });
	assert.equal(toSuggestions(fx('autocomplete_44_wilson.json'))[0].bin, '3071959');
});

test('at most 5 suggestions, placeholder million BINs become null', () => {
	const raw = fx('autocomplete_bbp.json');
	assert.ok(raw.features.length > MAX_SUGGESTIONS, 'fixture has more than 5 hits');
	const list = toSuggestions(raw);
	assert.equal(list.length, MAX_SUGGESTIONS);
	assert.equal(list[0].bin, null, 'Brooklyn Bridge Park carries BIN 3000000');
	assert.equal(realBin('3000000'), null);
	assert.equal(realBin('1089309'), '1089309');
	assert.deepEqual(toSuggestions({}), []);
});

const INDEX = {
	radius_m: 30,
	bins: { 1089309: '1089309' },
	points: /** @type {[string, number, number][]} */ ([
		['1089309', -74.0114, 40.71154],
		['abc123def0', -73.92944, 40.70281]
	])
};

test('resolvePick: BIN page first, then nearest page within the radius, else none', () => {
	const [greenwich] = toSuggestions(fx('autocomplete_185_greenwich.json'));
	assert.deepEqual(resolvePick(greenwich, INDEX), { kind: 'page', id: '1089309' });
	const [wilson] = toSuggestions(fx('autocomplete_44_wilson.json')); // BIN 3071959 not in INDEX.bins
	const m = distanceM(wilson.lon, wilson.lat, -73.92944, 40.70281);
	assert.ok(m < 30, `fixture point is ${m} m from the page point`);
	assert.deepEqual(resolvePick(wilson, INDEX), { kind: 'near', id: 'abc123def0', m: Math.round(m) });
	assert.deepEqual(resolvePick({ ...wilson, lat: wilson.lat + 0.0005 }, INDEX), { kind: 'none' }, '~55 m away is too far');
});

test('distanceM: 0.001 degrees of latitude is about 111 m', () => {
	const m = distanceM(-74, 40.7, -74, 40.701);
	assert.ok(m > 110 && m < 112, String(m));
});

test('districtAt uses the polygons, with holes', () => {
	const sq = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
	const hole = [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]];
	const gj = { features: [{ properties: { slug: 'a' }, geometry: { type: 'Polygon', coordinates: [sq, hole] } }] };
	assert.equal(districtAt(1, 1, gj), 'a');
	assert.equal(districtAt(5, 5, gj), null);
	assert.equal(districtAt(11, 1, gj), null);
});

test('districtFor on the built outline files: one outline per miss, none outside every district (#104)', async () => {
	const cases = [
		[-74.011421, 40.711541, 'mn-cd1', ['data/lookup/index.json', 'data/lookup/outline-mn-cd1.json']], // 185 Greenwich
		// 44 Wilson Ave: BK CD 1's outline box also reaches it (#126), so that outline is read and missed first
		[-73.929618, 40.702633, 'bk-cd4', ['data/lookup/index.json', 'data/lookup/outline-bk-cd1.json', 'data/lookup/outline-bk-cd4.json']],
		[-74.15, 40.58, null, ['data/lookup/index.json']] // Staten Island: no outline loaded at all
	];
	for (const [lon, lat, want, files] of cases) {
		const { asked, load } = realLoader();
		assert.equal(await districtFor(lon, lat, load), want);
		assert.deepEqual(asked, files);
	}
	// Upper East Side: may load an outline whose bbox reaches it, but is in no pilot district
	assert.equal(await districtFor(-73.95, 40.78, realLoader().load), null);
	// same answers as the full districts.geojson the map still uses
	const d = JSON.parse(readFileSync('static/data/districts.geojson', 'utf8'));
	for (const [lon, lat] of [[-74.011421, 40.711541], [-73.929618, 40.702633], [-73.95, 40.78], [-74.15, 40.58]]) {
		assert.equal(await districtFor(lon, lat, realLoader().load), districtAt(lon, lat, d));
	}
});

test('districtsCovering uses the outline bbox, and skips districts without one', () => {
	const index = { districts: { a: { area: [-74, 40.7, -73.99, 40.71], bbox: [0, 0, 0, 0] }, b: { bbox: [-74, 40.7, -73.99, 40.71] } } };
	assert.deepEqual(districtsCovering(-73.995, 40.705, index), ['a']);
	assert.deepEqual(districtsCovering(-73.98, 40.705, index), []);
});

test('nextActive: arrows wrap, nothing to move through stays -1', () => {
	assert.equal(nextActive('ArrowDown', -1, 3), 0);
	assert.equal(nextActive('ArrowDown', 2, 3), 0);
	assert.equal(nextActive('ArrowUp', -1, 3), 2);
	assert.equal(nextActive('ArrowUp', 0, 3), 2);
	assert.equal(nextActive('ArrowUp', 2, 3), 1);
	assert.equal(nextActive('ArrowDown', -1, 0), -1);
	assert.equal(nextActive('Home', 1, 3), 1);
});

test('countMessage for the live region', () => {
	assert.equal(countMessage(0), 'No suggestions.');
	assert.match(countMessage(1), /^1 suggestion\./);
	assert.match(countMessage(5), /^5 suggestions\./);
});

test('makeSequencer drops out-of-order responses', () => {
	const s = makeSequencer();
	const a = s.next();
	const b = s.next();
	assert.equal(s.isCurrent(a), false);
	assert.equal(s.isCurrent(b), true);
});

// The split lookup files (#85): one bins file per borough, one points file per district.
const L = 'static/data/lookup';
const readL = (/** @type {string} */ n) => JSON.parse(readFileSync(`${L}/${n}`, 'utf8'));

test('built lookup files: every BIN and point names a real address page, in the right file', () => {
	const pages = new Map(JSON.parse(readFileSync('static/data/address/index.json', 'utf8')).map((/** @type {any} */ a) => [a.id, a]));
	const index = readL('index.json');
	assert.ok(index.radius_m > 0 && index.radius_m <= 30);
	let nBins = 0;
	for (const b of '12345') {
		const { bins } = readL(`bins-${b}.json`);
		for (const [bin, id] of Object.entries(bins)) {
			assert.equal(realBin(bin), bin);
			assert.equal(bin[0], b, 'BIN in its borough file');
			assert.equal(pages.get(id)?.bin, bin);
			nBins++;
		}
	}
	assert.equal(nBins, [...pages.values()].filter((a) => a.bin).length, 'every page BIN is in a bins file');
	let nPts = 0;
	for (const [slug, d] of Object.entries(index.districts)) {
		const pts = readL(`points-${slug}.json`);
		assert.equal(pts.length, /** @type {any} */ (d).n);
		const [x0, y0, x1, y1] = /** @type {any} */ (d).bbox;
		for (const [id, lon, lat] of pts) {
			// A page on a line between two built districts is in each one's points file (#88).
			const p = pages.get(id);
			assert.ok((p?.listed_in ?? [p?.district]).includes(slug), id);
			assert.ok(lon >= x0 && lon <= x1 && lat >= y0 && lat <= y1, `${id} inside its bbox`);
			nPts++;
		}
	}
	assert.ok(nPts > 1000);
	assert.ok(!existsSync('static/data/bin-index.json'), 'the single old file is gone');
});

/** A loader over the real built files that records what was asked for. */
function realLoader() {
	/** @type {string[]} */
	const asked = [];
	const load = cachedLoader(async (path) => {
		asked.push(path);
		return JSON.parse(readFileSync(`static/${path}`, 'utf8'));
	});
	return { asked, load };
}

test('locate: a BIN with a page loads one borough file only', async () => {
	const { asked, load } = realLoader();
	const [greenwich] = toSuggestions(fx('autocomplete_185_greenwich.json'));
	const r = await locate(greenwich, load);
	assert.equal(r.kind, 'page');
	assert.deepEqual(asked, ['data/lookup/bins-1.json']);
	// the same answer as resolving against everything at once
	const all = { radius_m: readL('index.json').radius_m, bins: Object.assign({}, ...'12345'.split('').map((b) => readL(`bins-${b}.json`).bins)), points: Object.keys(readL('index.json').districts).flatMap((s) => readL(`points-${s}.json`)) };
	assert.deepEqual(r, resolvePick(greenwich, all));
});

test('locate: no page for the BIN falls back to the nearest page, loading only nearby districts', async () => {
	const { asked, load } = realLoader();
	const [id, lon, lat] = readL('points-mn-cd1.json')[0];
	const s = { label: 'test', bin: '1999998', lon, lat: lat + 0.00009 }; // about 10 m north
	const r = await locate(s, load);
	assert.equal(r.kind, 'near');
	assert.equal(/** @type {any} */ (r).m, 10);
	assert.ok(/** @type {any} */ (r).id === id || /** @type {any} */ (r).m <= 10);
	assert.deepEqual(asked, ['data/lookup/bins-1.json', 'data/lookup/index.json', 'data/lookup/points-mn-cd1.json']);
});

test('locate: far from every page loads no points file and says none', async () => {
	const { asked, load } = realLoader();
	const r = await locate({ label: 'Staten Island', bin: '5000123', lon: -74.15, lat: 40.58 }, load);
	assert.deepEqual(r, { kind: 'none' });
	assert.deepEqual(asked, ['data/lookup/bins-5.json', 'data/lookup/index.json']);
});

test('districtsNear pads the bbox by the radius', () => {
	const index = { radius_m: 30, districts: { a: { bbox: [-74, 40.7, -73.99, 40.71] }, b: { bbox: [-73.9, 40.6, -73.8, 40.65] } } };
	assert.deepEqual(districtsNear(-73.995, 40.705, index), ['a']);
	assert.deepEqual(districtsNear(-74.0003, 40.705, index), ['a'], '25 m west of the bbox');
	assert.deepEqual(districtsNear(-74.001, 40.705, index), [], '84 m west');
	assert.deepEqual(districtsNear(-73.5, 40.5, index), []);
});

test('cachedLoader fetches each file once, and again after a failure', async () => {
	let n = 0;
	const load = cachedLoader(async (p) => {
		n++;
		if (p === 'bad' && n < 3) throw new Error('offline');
		return p;
	});
	assert.equal(await load('x'), 'x');
	assert.equal(await load('x'), 'x');
	assert.equal(n, 1);
	await assert.rejects(load('bad'));
	await new Promise((r) => setTimeout(r));
	assert.equal(await load('bad'), 'bad');
	assert.equal(n, 3);
});

