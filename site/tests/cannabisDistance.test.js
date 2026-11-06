// Cannabis Law §72(6) distances on address pages, and the "approximate, not door to door" note.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { renderAddress } from './helpers/addressView.js';

const built = existsSync('build/rules');
const pages = () => readdirSync('static/data/address').filter((f) => f.endsWith('.json') && f !== 'index.json');

test('cannabis pages: schools within 500 ft and houses of worship within 200 ft only', () => {
	let n = 0;
	for (const f of pages()) {
		const a = JSON.parse(readFileSync(`static/data/address/${f}`, 'utf8'));
		const hasCannabis = a.records.some((/** @type {any} */ r) => r.source === 'cannabis_retail' || r.source === 'cannabis_license');
		assert.equal('cannabis_sw' in a, hasCannabis, a.id);
		if (!hasCannabis) continue;
		n++;
		for (const x of a.cannabis_sw) {
			assert.ok(x.kind === 'school' || x.kind === 'worship', `${a.id} ${x.kind}`);
			assert.ok(x.ft <= (x.kind === 'school' ? 500 : 200), `${a.id} ${x.kind} ${x.ft}`);
		}
	}
	assert.ok(n > 0, 'some address pages have a cannabis record');
});

// Address pages are rendered in the browser since #84, so every page is rendered here from its
// data file with the same component (AddressView.svelte) instead of read from prerendered HTML.
test('every address page that shows a distance carries the approximate, not-door-to-door note', async () => {
	let checked = 0;
	for (const f of pages()) {
		const html = await renderAddress(JSON.parse(readFileSync(`static/data/address/${f}`, 'utf8')));
		if (!html.includes('Approx. distance') && !html.includes('id="sw"')) continue;
		checked++;
		assert.ok(html.includes('Distances are approximate.') && html.includes('cannot measure door to door'), String(f));
	}
	assert.ok(checked > 100);
});

test('the rules and glossary pages carry the note', { skip: !built }, () => {
	const rules = readFileSync('build/rules/index.html', 'utf8');
	assert.ok(rules.includes('within five hundred feet of a building containing a school'));
	assert.ok(rules.includes('cannot measure door to door'));
	assert.ok(readFileSync('build/glossary/index.html', 'utf8').includes('cannot measure door to door'));
});

test('a cannabis page with a school nearby shows the cannabis section', async () => {
	for (const f of pages()) {
		const a = JSON.parse(readFileSync(`static/data/address/${f}`, 'utf8'));
		if (!a.cannabis_sw?.some((/** @type {any} */ x) => x.kind === 'school')) continue;
		const html = await renderAddress(a);
		assert.ok(html.includes('id="sw-cannabis"'), a.id);
		assert.ok(html.includes('Cannabis Law §72(6)'), a.id);
		return;
	}
	assert.fail('no cannabis page with a school within 500 ft');
});

test('a page without cannabis records has no cannabis section', async () => {
	for (const f of pages()) {
		const a = JSON.parse(readFileSync(`static/data/address/${f}`, 'utf8'));
		if (a.cannabis_sw) continue;
		assert.doesNotMatch(await renderAddress(a), /id="sw-cannabis"|Cannabis Law/);
		return;
	}
});
