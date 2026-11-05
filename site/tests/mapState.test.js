// #75: the map keeps its view, layers, 311 style and selection across Back/Forward and visits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHash, buildHash, loadPrefs, savePrefs, PREFS_KEY } from '../src/lib/mapState.js';

const KNOWN = ['liquor_pending', 'liquor_active', 'liquor_inactive', 'cannabis_retail', 'cannabis_license', 'dining_out', 'c311', 'sw'];

test('hash round-trips view, layers, 311 style and selection', () => {
	const h = buildHash({ view: { z: 15.234, lat: 40.704123456, lon: -73.921309 }, on: ['liquor_active', 'c311'], c311: 'sized', sel: '3072409' });
	assert.equal(h, 'v=15.23/40.70412/-73.92131&on=liquor_active,c311&c311=sized&sel=3072409');
	assert.deepEqual(parseHash('#' + h, KNOWN), { view: { z: 15.23, lat: 40.70412, lon: -73.92131 }, on: ['liquor_active', 'c311'], c311: 'sized', sel: '3072409' });
});

test('an empty "on" means every layer off, which is different from no "on" at all', () => {
	assert.deepEqual(parseHash('#on=', KNOWN).on, []);
	assert.equal(parseHash('', KNOWN).on, null);
});

test('bad or hostile hashes are ignored, not thrown', () => {
	const s = parseHash('#v=99/0/0&on=liquor_active,<script>&c311=boom&sel=../../etc', KNOWN);
	assert.equal(s.view, null); // zoom out of range and not near NYC
	assert.deepEqual(s.on, ['liquor_active']);
	assert.equal(s.c311, null);
	assert.equal(s.sel, null);
	assert.equal(parseHash('#v=a/b/c', KNOWN).view, null);
});

test('preferences save and load, and survive broken storage', () => {
	/** @type {Record<string, string>} */
	const store = {};
	const storage = /** @type {any} */ ({ getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = v) });
	savePrefs(storage, { on: ['dining_out', 'sw', 'nope'], c311: 'dots' });
	assert.deepEqual(loadPrefs(storage, KNOWN), { on: ['dining_out', 'sw'], c311: 'dots', open: true });
	savePrefs(storage, { on: [], c311: 'stacks', open: false });
	assert.equal(loadPrefs(storage, KNOWN)?.open, false);
	store[PREFS_KEY] = '{not json';
	assert.equal(loadPrefs(storage, KNOWN), null);
	const broken = /** @type {any} */ ({ getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); } });
	assert.equal(loadPrefs(broken, KNOWN), null);
	assert.doesNotThrow(() => savePrefs(broken, { on: [], c311: 'stacks' }));
	assert.equal(loadPrefs(undefined, KNOWN), null);
});

test('boundariesUrl: Boundaries Map reads ?lng=&lat= (#77); no point, no link', async () => {
	const { boundariesUrl } = await import('../src/lib/format.js');
	assert.equal(boundariesUrl(-73.936314, 40.697876), 'https://boundaries.beta.nyc/?lng=-73.936314&lat=40.697876');
	assert.equal(boundariesUrl(-73.93631449, 40.6978761), 'https://boundaries.beta.nyc/?lng=-73.936314&lat=40.697876');
	assert.equal(boundariesUrl(0, 0), null);
	assert.equal(boundariesUrl(null, 40.7), null);
	assert.equal(boundariesUrl(-200, 40.7), null);
});
