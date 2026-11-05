// The one address page (#84): query parsing, links, loading states, and the 404.html forwarder
// for old /address/<id>/ links.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import { ADDRESS_ID_RE, addressDataPath, addressPath, loadAddress, readAddressQuery, validId } from '../src/lib/addressPage.js';
import { readAddress, renderAddress } from './helpers/addressView.js';

test('readAddressQuery: id, and the nearest-page note only with both q and a whole-number m', () => {
	assert.deepEqual(readAddressQuery(new URLSearchParams('id=3071959')), { id: '3071959', raw: '3071959', near: null });
	assert.deepEqual(readAddressQuery(new URLSearchParams('id=a40aec8fce&q=44+Wilson+Ave&m=12')).near, { q: '44 Wilson Ave', m: '12' });
	assert.equal(readAddressQuery(new URLSearchParams('id=1&q=x')).near, null);
	assert.equal(readAddressQuery(new URLSearchParams('id=1&q=x&m=12;alert(1)')).near, null);
	assert.deepEqual(readAddressQuery(new URLSearchParams('')), { id: null, raw: '', near: null });
});

test('validId refuses anything that could leave data/address/', () => {
	for (const bad of ['../manifest', 'a/b', '..', 'x.json', '%2e%2e', '', ' 1', 'a'.repeat(41)]) assert.equal(validId(bad), null, bad);
	for (const ok of ['1000003', 'a40aec8fce', '10282']) assert.equal(validId(ok), ok);
	// every id the pipeline wrote is valid
	for (const { id } of JSON.parse(readFileSync('static/data/address/index.json', 'utf8'))) assert.match(id, ADDRESS_ID_RE);
});

test('addressPath always gives /address/?id=… with one slash', () => {
	assert.equal(addressPath('/address', '3071959'), '/address/?id=3071959');
	assert.equal(addressPath('/address/', '3071959'), '/address/?id=3071959');
	assert.equal(addressPath('/address', 'a40aec8fce', { q: '44 Wilson Ave, Brooklyn', m: '12' }), '/address/?id=a40aec8fce&q=44+Wilson+Ave%2C+Brooklyn&m=12');
	assert.equal(addressDataPath('3071959'), 'data/address/3071959.json');
});

/** @param {number} status @param {any} [body] @returns {typeof fetch} */
const fakeFetch = (status, body) => /** @type {any} */ (async () => ({ status, ok: status >= 200 && status < 300, json: async () => (body instanceof Error ? Promise.reject(body) : body) }));

test('loadAddress: ok, missing, and honest errors', async () => {
	const a = readAddress('1000003');
	/** @type {string[]} */
	const urls = [];
	const r = await loadAddress(/** @type {any} */ (async (/** @type {string} */ u) => { urls.push(u); return { status: 200, ok: true, json: async () => a }; }), '1000003');
	assert.equal(r.kind, 'ok');
	assert.deepEqual(urls, ['/data/address/1000003.json']);
	assert.deepEqual(await loadAddress(fakeFetch(404), '9999999'), { kind: 'missing' });
	let called = false;
	assert.deepEqual(await loadAddress(/** @type {any} */ (async () => { called = true; }), null), { kind: 'missing' });
	assert.equal(called, false, 'an invalid id is never fetched');
	const e500 = await loadAddress(fakeFetch(500), '1000003');
	assert.equal(e500.kind, 'error');
	assert.match(/** @type {any} */ (e500).message, /HTTP 500/);
	const offline = await loadAddress(/** @type {any} */ (async () => { throw new TypeError('Failed to fetch'); }), '1000003');
	assert.equal(offline.kind, 'error');
	assert.match(/** @type {any} */ (offline).message, /connection/);
	assert.equal((await loadAddress(fakeFetch(200, new SyntaxError('bad json')), '1000003')).kind, 'error');
	assert.equal((await loadAddress(fakeFetch(200, { ...a, id: 'other' }), '1000003')).kind, 'error', 'wrong file');
});

/** Run static/404.html's script against a fake location. @param {string} href */
function run404(href) {
	const html = readFileSync('static/404.html', 'utf8');
	const script = /** @type {string} */ (html.match(/<script>([\s\S]*?)<\/script>/)?.[1]);
	const u = new URL(href);
	/** @type {string[]} */
	const replaced = [];
	const window = { location: { pathname: u.pathname, search: u.search, hash: u.hash, replace: (/** @type {string} */ t) => replaced.push(t) } };
	vm.runInNewContext(script, { window, URLSearchParams });
	return replaced;
}

test('404.html forwards old /address/<id>/ links to the one address page', () => {
	assert.deepEqual(run404('https://slam.beta.nyc/address/3071959/'), ['/address/?id=3071959']);
	assert.deepEqual(run404('https://slam.beta.nyc/address/3071959'), ['/address/?id=3071959']);
	assert.deepEqual(run404('https://slam.beta.nyc/address/a40aec8fce/?q=44+Wilson+Ave&m=12#health'), ['/address/?id=a40aec8fce&q=44+Wilson+Ave&m=12#health']);
	assert.deepEqual(run404('https://slam.beta.nyc/address/3071959/?id=evil'), ['/address/?id=3071959']);
	for (const other of ['https://slam.beta.nyc/nope/', 'https://slam.beta.nyc/address/a/b/', 'https://slam.beta.nyc/address/..%2Fx/']) assert.deepEqual(run404(other), [], other);
});

test('the nearest-page note renders from ?q=&m=', async () => {
	const html = await renderAddress(readAddress('1000003'), { q: '12 South St, Manhattan', m: '18' });
	assert.match(html, /You searched for 12 South St, Manhattan\. There is no page for that building/);
	assert.match(html, /about 18 m away/);
	assert.doesNotMatch(await renderAddress(readAddress('1000003')), /You searched for/);
});

test('AddressView keeps every section, its headings and the Boundaries Map link', async () => {
	const a = readAddress('3071959');
	const html = (await renderAddress(a)).replace(/\s+/g, ' ');
	assert.match(html, new RegExp(`<h1>${a.street}</h1>`));
	for (const h of ['At this address', 'Nearby, within about', 'Schools and houses of worship nearby', '311 complaints', 'Health inspections', 'Certificate of occupancy', 'Look it up at the source'])
		assert.ok(html.includes(h), h);
	assert.ok(html.includes('https://boundaries.beta.nyc/'));
	assert.ok(html.includes('Print this page'));
	assert.ok(html.includes('<th scope="col">'));
	// links to other addresses use the one page
	assert.doesNotMatch(html, /href="\/address\/[^?"]/);
	if (a.nearby.length) assert.match(html, /href="\/address\/\?id=/);
});

test('built site: one address shell, no per-address HTML, and the 404 forwarder', { skip: !existsSync('build/address') }, () => {
	assert.deepEqual(readdirSync('build/address').sort(), ['__data.json', 'index.html']);
	const shell = readFileSync('build/address/index.html', 'utf8');
	assert.ok(shell.includes('Loading this address'));
	assert.ok(shell.includes('<noscript>'));
	assert.ok(existsSync('build/404.html'));
	assert.ok(readFileSync('build/404.html', 'utf8').includes('slamLegacyAddressTarget'));
	// district lists link to the one page
	const district = readFileSync('build/bk-cd4/index.html', 'utf8');
	// (prerendered links are relative: SvelteKit's paths.relative defaults to true)
	assert.match(district, /href="(\.\.)?\/address\/\?id=\w+"/);
	assert.doesNotMatch(district, /href="(\.\.)?\/address\/[0-9a-f]{7,10}\/?"/);
});
