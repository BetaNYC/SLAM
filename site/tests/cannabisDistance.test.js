// Cannabis Law §72(6) distances on address pages, and the "approximate, not door to door" note.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const built = existsSync('build/address');
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

test('every built page that shows a distance carries the approximate, not-door-to-door note', { skip: !built }, () => {
	const files = readdirSync('build/address', { recursive: true }).filter((f) => String(f).endsWith('index.html'));
	let checked = 0;
	for (const f of files) {
		const html = readFileSync(`build/address/${f}`, 'utf8');
		if (!html.includes('Approx. distance') && !html.includes('id="sw"')) continue;
		checked++;
		assert.ok(html.includes('Distances are approximate.') && html.includes('cannot measure door to door'), String(f));
	}
	assert.ok(checked > 100);
	const rules = readFileSync('build/rules/index.html', 'utf8');
	assert.ok(rules.includes('within five hundred feet of a building containing a school'));
	assert.ok(rules.includes('cannot measure door to door'));
	assert.ok(readFileSync('build/glossary/index.html', 'utf8').includes('cannot measure door to door'));
});

test('a cannabis page with a school nearby shows the cannabis section', { skip: !built }, () => {
	for (const f of pages()) {
		const a = JSON.parse(readFileSync(`static/data/address/${f}`, 'utf8'));
		if (!a.cannabis_sw?.some((/** @type {any} */ x) => x.kind === 'school')) continue;
		const html = readFileSync(`build/address/${a.id}/index.html`, 'utf8');
		assert.ok(html.includes('id="sw-cannabis"'), a.id);
		assert.ok(html.includes('Cannabis Law §72(6)'), a.id);
		return;
	}
	assert.fail('no cannabis page with a school within 500 ft');
});
