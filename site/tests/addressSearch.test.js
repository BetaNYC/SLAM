// Address search logic (#59). Fixtures are real GeoSearch /v2/autocomplete responses
// recorded 2026-11-04 (tests/fixtures/autocomplete_*.json); none are hand-written.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

test('districtAt on the built districts.geojson finds 185 Greenwich in MN CD 1', () => {
	const d = JSON.parse(readFileSync('static/data/districts.geojson', 'utf8'));
	assert.equal(districtAt(-74.011421, 40.711541, d), 'mn-cd1');
	assert.equal(districtAt(-73.929618, 40.702633, d), 'bk-cd4');
	assert.equal(districtAt(-73.95, 40.78, d), null, 'Upper East Side is outside the pilot');
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

test('built bin-index.json: every BIN and point names a real address page', () => {
	const idx = JSON.parse(readFileSync('static/data/bin-index.json', 'utf8'));
	assert.ok(idx.radius_m > 0 && idx.radius_m <= 30);
	for (const [bin, id] of Object.entries(idx.bins)) {
		assert.equal(realBin(bin), bin);
		const a = JSON.parse(readFileSync(`static/data/address/${id}.json`, 'utf8'));
		assert.equal(a.bin, bin);
	}
	const pages = new Set(JSON.parse(readFileSync('static/data/address/index.json', 'utf8')).map((/** @type {any} */ a) => a.id));
	for (const [id] of idx.points) assert.ok(pages.has(id), id);
});
