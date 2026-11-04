// Schools and houses of worship near an address (#60). node --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { sameStreetLabel, swName, SW_KIND } from '../src/lib/format.js';
import { popupSW } from '../src/lib/popupSW.js';

test('sameStreetLabel never turns "different in the records" into a no', () => {
	assert.equal(sameStreetLabel(true), 'Same street name');
	assert.equal(sameStreetLabel(false), 'Different street name in the records');
	assert.equal(sameStreetLabel(null), 'Not known');
	assert.equal(sameStreetLabel(undefined), 'Not known');
});

test('swName falls back to the address for PLUTO lots, which have no name', () => {
	assert.equal(swName({ kind: 'school', name: 'MILLENNIUM HIGH SCHOOL', street: '75 BROAD STREET' }), 'MILLENNIUM HIGH SCHOOL');
	assert.equal(swName({ kind: 'worship', name: '', street: '75 BROADWAY' }), '75 BROADWAY (no name in PLUTO)');
	assert.equal(SW_KIND.worship, 'House of worship');
});

test('popupSW builds text nodes, never HTML', () => {
	const el = (/** @type {string} */ tag) => ({ tag, children: /** @type {any[]} */ ([]), textContent: '', append(/** @type {any[]} */ ...c) { this.children.push(...c); } });
	const doc = /** @type {any} */ ({ createElement: el, createTextNode: (/** @type {string} */ t) => ({ text: t }) });
	const div = /** @type {any} */ (popupSW({ k: 'worship', n: '', t: 'Church, Synagogue, Chapel', s: '<b>75 BROADWAY</b>' }, doc));
	assert.equal(div.children.length, 3);
	assert.equal(div.children[1].children[1].text, 'House of worship: Church, Synagogue, Chapel');
	assert.equal(div.children[2].children[1].text, '<b>75 BROADWAY</b>');
	assert.equal(div.children[0].children[1].text, '(no name in the source)');
});

// "permitted" is left out: the street-events dataset is called "NYC Permitted Event Information".
test('no verdict words in the address page, the map page or the rule data', () => {
	const verdict = /\b(violat\w*|meets?|eligib\w*|allowed|complian\w*|prohibit\w*|illegal|legal to)\b/i;
	for (const f of ['src/routes/address/[id]/+page.svelte', 'src/routes/[district]/map/+page.svelte', 'src/lib/format.js', 'src/lib/popupSW.js']) {
		const m = readFileSync(f, 'utf8').match(verdict);
		assert.equal(m, null, `${f}: ${m?.[0]}`);
	}
	const m = JSON.parse(readFileSync('static/data/manifest.json', 'utf8'));
	assert.equal(JSON.stringify(m.schools_worship.rules).match(verdict), null);
});

test('built data: distances stay inside their radius, sorted, and exclude the page itself', () => {
	const m = JSON.parse(readFileSync('static/data/manifest.json', 'utf8'));
	const sw = m.schools_worship;
	assert.equal(sw.list_ft, 200);
	assert.equal(sw.liquor_count_ft, 500);
	assert.ok(sw.buffer_ft > sw.liquor_count_ft);
	assert.equal(sw.rules.revision, '2026-07-31');
	assert.ok(sw.axis_check_median_gap_ft.schools < 5 && sw.axis_check_median_gap_ft.worship < 5);
	for (const slug of Object.keys(m.districts)) {
		assert.equal(typeof m.districts[slug].counts.schools, 'number');
		assert.equal(typeof m.districts[slug].counts.worship, 'number');
	}
	const files = readdirSync('static/data/address').filter((f) => f !== 'index.json');
	let withNear = 0;
	for (const f of files) {
		const a = JSON.parse(readFileSync(`static/data/address/${f}`, 'utf8'));
		assert.ok(a.sw, f);
		const ft = a.sw.near.map((/** @type {any} */ n) => n.ft);
		assert.ok(ft.every((/** @type {number} */ d) => d <= sw.list_ft), f);
		assert.deepEqual(ft, [...ft].sort((x, y) => x - y), f);
		withNear += a.sw.near.length > 0;
		const liq = a.sw.liq;
		assert.equal(liq.licenses, liq.rows.length, f);
		assert.ok(liq.premises <= liq.licenses, f);
		assert.ok(liq.rows.every((/** @type {any} */ r) => r.ft <= sw.liquor_count_ft && r.aid !== a.id), f);
		assert.ok(liq.rows.every((/** @type {any} */ r) => r.code in sw.on_premises_classes), f);
	}
	const total = Object.values(sw.by_district).reduce((/** @type {number} */ s, /** @type {any} */ d) => s + d.pages_with_sw_within_200ft, 0);
	assert.equal(withNear, total);
});

test('built page: 111 Broadway lists the M1 lot at 75 Broadway, same street, about 188 ft', () => {
	const a = JSON.parse(readFileSync('static/data/address/1001029.json', 'utf8'));
	const t = a.sw.near.find((/** @type {any} */ n) => n.street === '75 BROADWAY');
	assert.ok(t);
	assert.equal(t.kind, 'worship');
	assert.equal(t.type, 'Church, Synagogue, Chapel');
	assert.equal(t.same_street, true);
	assert.ok(Math.abs(t.ft - 188) <= 1, String(t.ft));
});
