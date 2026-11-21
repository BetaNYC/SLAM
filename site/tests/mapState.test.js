// #75: the map keeps its view, layers, 311 style and selection across Back/Forward and visits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHash, buildHash, loadPrefs, savePrefs, PREFS_KEY, parseTilt, MAX_PITCH } from '../src/lib/mapState.js';

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

test('tilt and turn (#132): in the hash only when not zero, whole degrees, in range', () => {
	const view = { z: 16, lat: 40.7185, lon: -73.9565 };
	// A flat map's link is what it always was.
	assert.equal(buildHash({ view: { ...view, pitch: 0.3, bearing: -0.4 } }), buildHash({ view }));
	assert.doesNotMatch(buildHash({ view: { ...view, pitch: 0, bearing: 0 } }), /pitch|bearing/);
	const h = buildHash({ view: { ...view, pitch: 54.6, bearing: -19.7 }, on: ['c311'], c311: 'stacks' });
	assert.equal(h, 'v=16.00/40.71850/-73.95650&pitch=55&bearing=-20&on=c311&c311=stacks');
	assert.deepEqual(parseHash('#' + h, KNOWN).view, { ...view, pitch: 55, bearing: -20 });
	assert.deepEqual(parseHash('#' + buildHash({ view: { ...view, bearing: 30 } }), KNOWN).view, { ...view, bearing: 30 });
	// Old links, and links with junk, still open flat and facing north.
	assert.deepEqual(parseHash('#v=16.00/40.71850/-73.95650', KNOWN).view, view);
	assert.deepEqual(parseHash('#v=16.00/40.71850/-73.95650&pitch=abc&bearing=', KNOWN).view, view);
	// No view, no tilt.
	assert.equal(parseHash('#pitch=40', KNOWN).view, null);
	assert.deepEqual(parseTilt('90', '190'), { pitch: MAX_PITCH, bearing: -170 });
	assert.deepEqual(parseTilt('-5', '-190'), { pitch: 0, bearing: 170 });
	assert.deepEqual(parseTilt('180', '180'), { pitch: MAX_PITCH, bearing: -180 });
	assert.deepEqual(parseTilt(null, null), { pitch: 0, bearing: 0 });
});
