// Traffic measurement (src/lib/analytics.js): no address, search, coordinates or fragment ever
// reaches the Google tag, and the tag runs only on slam.beta.nyc. Ported from BoardStat 2.0's
// v2/tests-js/analytics.test.cjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeUrl, sanitizeReferrer, sanitizeTitle, cleanPage, startAnalytics, isActiveHost, TAG_ID, ADDRESS_TITLE } from '../src/lib/analytics.js';

const SITE = 'https://slam.beta.nyc';
const HOST = 'slam.beta.nyc';
const STREET = '44 WILSON AVENUE';

test('home and glossary: kept as they are, fragment dropped', () => {
	assert.equal(sanitizeUrl(`${SITE}/`), `${SITE}/`);
	assert.equal(sanitizeUrl(`${SITE}/glossary/#buffer`), `${SITE}/glossary/`);
	assert.equal(sanitizeTitle('Glossary — SLAM v2 prototype', `${SITE}/glossary/`), 'Glossary — SLAM v2 prototype');
});

test('district page: the district in the path is kept, any query is dropped', () => {
	assert.equal(sanitizeUrl(`${SITE}/mn-cd1/?utm_source=x&q=${encodeURIComponent(STREET)}`), `${SITE}/mn-cd1/`);
	assert.equal(sanitizeTitle('Manhattan CD 1 — SLAM v2 prototype', `${SITE}/mn-cd1/`), 'Manhattan CD 1 — SLAM v2 prototype');
});

test('address page: the id, the search note and the fragment are dropped; the title is fixed', () => {
	const href = `${SITE}/address/?id=a40aec8fce&q=${encodeURIComponent(STREET + ', Brooklyn')}&m=12#nearby`;
	const out = sanitizeUrl(href);
	assert.equal(out, `${SITE}/address/`);
	for (const bad of ['a40aec8fce', 'WILSON', 'Wilson', '#', '?']) assert.ok(!out.includes(bad), `${bad} in ${out}`);
	assert.equal(sanitizeTitle(`${STREET} — SLAM v2 prototype`, href), ADDRESS_TITLE);
	assert.equal(ADDRESS_TITLE, 'Address — SLAM v2 prototype');
});

test('old /address/<id>/ links collapse to /address/ too', () => {
	assert.equal(sanitizeUrl(`${SITE}/address/3071959/`), `${SITE}/address/`);
	assert.equal(sanitizeTitle('Page not found', `${SITE}/address/3071959/index.html`), ADDRESS_TITLE);
});

test('map page: coordinates and the selected address in the hash or query never get through', () => {
	const href = `${SITE}/bk-cd4/map/?lon=-73.921309&lat=40.704123#v=15.23/40.70412/-73.92131&on=liquor_active,c311&c311=sized&sel=a40aec8fce`;
	const out = sanitizeUrl(href);
	assert.equal(out, `${SITE}/bk-cd4/map/`);
	assert.ok(!/40\.70|73\.92|a40aec8fce/.test(out), out);
	assert.equal(sanitizeTitle('Map: Brooklyn CD 4 — SLAM v2 prototype', href), 'Map: Brooklyn CD 4 — SLAM v2 prototype');
});

test('a base path is respected', () => {
	assert.equal(sanitizeUrl('https://slam.beta.nyc/slam/address/?id=a40aec8fce', '/slam'), 'https://slam.beta.nyc/slam/address/');
	assert.equal(sanitizeTitle('X', 'https://slam.beta.nyc/slam/address/?id=1', '/slam'), ADDRESS_TITLE);
	assert.equal(sanitizeTitle('X', 'https://slam.beta.nyc/address/?id=1', '/slam'), 'X');
});

test('referrers: same-site cleaned, other sites cut to their origin, junk dropped', () => {
	assert.equal(sanitizeReferrer(`${SITE}/address/?id=a40aec8fce&q=44+Wilson+Ave`, HOST), `${SITE}/address/`);
	assert.equal(sanitizeReferrer(`${SITE}/bk-cd4/map/#v=15/40.7/-73.9&sel=a40aec8fce`, HOST), `${SITE}/bk-cd4/map/`);
	assert.equal(sanitizeReferrer('https://www.google.com/search?q=44+wilson+avenue', HOST), 'https://www.google.com/');
	assert.equal(sanitizeReferrer('https://boundaries.beta.nyc/?lng=-73.92&lat=40.70', HOST), 'https://boundaries.beta.nyc/');
	assert.equal(sanitizeReferrer('', HOST), '');
	assert.equal(sanitizeReferrer(null, HOST), '');
	assert.equal(sanitizeReferrer('not a url', HOST), '');
	assert.equal(sanitizeReferrer('android-app://com.google.android.gm/x?addr=1', HOST), '');
});

test('cleanPage: all three fields at once', () => {
	assert.deepEqual(
		cleanPage({ href: `${SITE}/address/?id=a40aec8fce`, title: `${STREET} — SLAM v2 prototype`, referrer: `${SITE}/bk-cd4/map/#sel=a40aec8fce`, host: HOST }),
		{ page_location: `${SITE}/address/`, page_referrer: `${SITE}/bk-cd4/map/`, page_title: ADDRESS_TITLE }
	);
});

/** A stand-in window: enough for startAnalytics. @param {string} hostname */
function fakeWindow(hostname) {
	/** @type {any[]} */
	const scripts = [];
	return {
		scripts,
		location: { hostname },
		document: { createElement: () => ({}), head: { appendChild: (/** @type {any} */ s) => scripts.push(s) } }
	};
}

test('host gate: nothing at all happens on localhost, a preview or any other host', () => {
	for (const h of ['localhost', '127.0.0.1', 'betanyc.github.io', 'slam.beta.nyc.example.com', 'beta.nyc', 'www.beta.nyc']) {
		const w = /** @type {any} */ (fakeWindow(h));
		assert.equal(startAnalytics(w), null, h);
		assert.equal(w.dataLayer, undefined, h);
		assert.equal(w.scripts.length, 0, h);
		assert.equal(isActiveHost(h), false, h);
	}
	assert.equal(isActiveHost('slam.beta.nyc'), true);
});

test('on slam.beta.nyc: cleaned fields are set before the tag loads, no automatic page view, one cleaned page view per call', () => {
	const w = /** @type {any} */ (fakeWindow(HOST));
	const send = startAnalytics(w);
	assert.ok(send);
	assert.equal(w.scripts.length, 0, 'the tag loads only after the first page view is queued');
	send({ href: `${SITE}/address/?id=a40aec8fce&q=44+Wilson+Ave&m=12#nearby`, title: `${STREET} — SLAM v2 prototype`, referrer: 'https://www.google.com/search?q=44+wilson' });
	const calls = w.dataLayer.map((/** @type {IArguments} */ a) => Array.from(a));
	assert.deepEqual(calls.map((/** @type {any[]} */ c) => c[0]), ['js', 'set', 'config', 'event']);
	const clean = { page_location: `${SITE}/address/`, page_referrer: 'https://www.google.com/', page_title: ADDRESS_TITLE };
	assert.deepEqual(calls[1][1], clean);
	assert.deepEqual(calls[2], ['config', TAG_ID, { send_page_view: false }]);
	assert.deepEqual(calls[3], ['event', 'page_view', clean]);
	assert.equal(w.scripts.length, 1);
	assert.equal(w.scripts[0].src, 'https://www.googletagmanager.com/gtag/js?id=GT-MQ7Q7VP');
	assert.equal(w.scripts[0].async, true);

	// A client-side navigation: the fields are set again, then one page view; the tag is not reloaded.
	send({ href: `${SITE}/bk-cd4/map/#v=15/40.7/-73.9&sel=a40aec8fce`, title: 'Map: Brooklyn CD 4 — SLAM v2 prototype', referrer: `${SITE}/address/?id=a40aec8fce` });
	const next = w.dataLayer.slice(4).map((/** @type {IArguments} */ a) => Array.from(a));
	const clean2 = { page_location: `${SITE}/bk-cd4/map/`, page_referrer: `${SITE}/address/`, page_title: 'Map: Brooklyn CD 4 — SLAM v2 prototype' };
	assert.deepEqual(next, [['set', clean2], ['event', 'page_view', clean2]]);
	assert.equal(w.scripts.length, 1);
	assert.equal(startAnalytics(w), send, 'starting twice reuses the same tag');

	// Nothing anywhere in what was queued carries the street, the id, a search or a coordinate.
	const all = JSON.stringify(w.dataLayer.map((/** @type {IArguments} */ a) => Array.from(a)));
	for (const bad of ['WILSON', 'Wilson', 'wilson', 'a40aec8fce', '40.7', '73.9', '#', 'nearby']) assert.ok(!all.includes(bad), `${bad} reached the tag`);
});

test('the tag id is the beta.nyc Google tag', () => {
	assert.equal(TAG_ID, 'GT-MQ7Q7VP');
});
