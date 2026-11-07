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
	// QA of #66: PLUTO M2, M3 (parsonage, rectory), M4 (convents) and M9 are not called worship.
	assert.equal(SW_KIND.religious, 'Other religious property');
});

test('popupSW builds text nodes, never HTML', () => {
	const el = (/** @type {string} */ tag) => ({ tag, children: /** @type {any[]} */ ([]), textContent: '', append(/** @type {any[]} */ ...c) { this.children.push(...c); } });
	const doc = /** @type {any} */ ({ createElement: el, createTextNode: (/** @type {string} */ t) => ({ text: t }) });
	const div = /** @type {any} */ (popupSW({ k: 'worship', n: '', t: 'Church, Synagogue, Chapel', s: '<b>75 BROADWAY</b>' }, doc));
	assert.equal(div.children.length, 3);
	assert.equal(div.children[1].children[1].text, 'House of worship: Church, Synagogue, Chapel');
	assert.equal(div.children[2].children[1].text, '<b>75 BROADWAY</b>');
	assert.equal(div.children[0].children[1].text, '(no name in the source)');
	const r = /** @type {any} */ (popupSW({ k: 'religious', n: '', t: 'Parsonage, Rectory', s: '18 VESEY STREET' }, doc));
	assert.equal(r.children[1].children[1].text, 'Other religious property: Parsonage, Rectory');
});

// "permitted" is left out: the street-events dataset is called "NYC Permitted Event Information".
test('no verdict words in the address page, the map page or the rule data', () => {
	const verdict = /\b(violat\w*|meets?|eligib\w*|allowed|complian\w*|prohibit\w*|illegal|legal to)\b/i;
	for (const f of ['src/routes/address/AddressView.svelte', 'src/routes/address/+page.svelte', 'static/404.html', 'src/routes/[district]/map/+page.svelte', 'src/routes/rules/+page.svelte', 'src/lib/format.js', 'src/lib/popupSW.js', 'src/lib/rings.js']) {
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

test('built page: 17 State St lists the M1 lot at 7 State St, same street, about 137 ft from the GeoSearch point', () => {
	// QA of #66 measured 137 ft by haversine from the GeoSearch point (194 ft from SLA's point).
	const a = JSON.parse(readFileSync('static/data/address/1000020.json', 'utf8'));
	assert.equal(a.point.source, 'geosearch');
	const t = a.sw.near.find((/** @type {any} */ n) => n.street === '7 STATE STREET');
	assert.ok(t);
	assert.equal(t.kind, 'worship');
	assert.equal(t.type, 'Church, Synagogue, Chapel');
	assert.equal(t.same_street, true);
	assert.ok(Math.abs(t.ft - 137) <= 1, String(t.ft));
});

test('page points: GeoSearch when matched, records otherwise; far-off pages are not measured', () => {
	const m = JSON.parse(readFileSync('static/data/manifest.json', 'utf8'));
	const pp = m.page_points;
	assert.equal(pp.geosearch + pp.records + pp.no_point, m.addresses);
	// 377 and 378 Greenwich St shared one SLA point; now about 53 m (174 ft) apart.
	const a = JSON.parse(readFileSync('static/data/address/1087575.json', 'utf8'));
	const near = a.nearby.find((/** @type {any} */ n) => n.id === '1083705');
	assert.ok(near && near.m > 40 && near.m < 65, String(near?.m));
	// 7 WEST 51ST ST: GeoSearch puts it in Midtown, outside the pulled area. Kept as published,
	// with no proximity facts.
	const w = JSON.parse(readFileSync('static/data/address/1034514.json', 'utf8'));
	assert.equal(w.district, 'mn-cd1');
	assert.equal(w.point.outside_districts, true);
	assert.equal(w.point.measured, false);
	assert.ok(w.lat > 40.75);
	assert.equal(w.nearby.length + w.sw.near.length + w.sw.liq.licenses + w.c311_near.n, 0);
});

test('500-ft count includes Queens: 894 Wyckoff Ave counts the licenses across the county line', () => {
	const m = JSON.parse(readFileSync('static/data/manifest.json', 'utf8'));
	assert.ok(m.schools_worship.on_premises_licenses_in_box_by_county.Queens > 0);
	const a = JSON.parse(readFileSync('static/data/address/3393935.json', 'utf8'));
	const streets = a.sw.liq.rows.map((/** @type {any} */ r) => r.street).sort();
	assert.deepEqual(streets, ['859 Wyckoff Ave', '9-15 WYCKOFF AVE']);
});

test('map layer and list view hold the same schools and worship points (the map note says so)', () => {
	for (const slug of ['mn-cd1', 'bk-cd4']) {
		const geo = JSON.parse(readFileSync(`static/data/${slug}/schools-worship.geojson`, 'utf8'));
		const list = JSON.parse(readFileSync(`static/data/${slug}/list.json`, 'utf8')).schools_worship;
		const key = (/** @type {any} */ r) => [r.kind ?? r.k, r.name ?? r.n, r.type ?? r.t, r.street ?? r.s].join('|');
		assert.deepEqual(geo.features.map((/** @type {any} */ f) => key(f.properties)).sort(), list.rows.map(key).sort(), slug);
		assert.ok(list.rows.every((/** @type {any} */ r) => r.ft_outside <= list.buffer_ft));
	}
	const page = readFileSync('src/routes/[district]/+page.svelte', 'utf8');
	assert.match(page, /tab === 'sw'/);
});

test('the full statute text is on /rules only, not on every address page', () => {
	const addr = readFileSync('src/routes/address/AddressView.svelte', 'utf8');
	const server = readFileSync('src/routes/address/+page.server.js', 'utf8');
	assert.doesNotMatch(addr, /rule\.(lead|a|b|c)\b/);
	assert.match(server, /rule = \{ law: rules\.law, url: rules\.url \}/);
	assert.match(addr, /resolve\('\/rules'/);
	const rules = readFileSync('src/routes/rules/+page.svelte', 'utf8');
	for (const k of ['lead', 'a', 'b', 'c']) assert.match(rules, new RegExp(`rule\\.${k}\\b`));
	assert.match(rules, /sla_classes\.format/);
	assert.match(rules, /sla_guide\.format/);
});

test('Harbor School carries its note on the 10 South St page', () => {
	const a = JSON.parse(readFileSync('static/data/address/1000003.json', 'utf8'));
	const h = a.sw.near.find((/** @type {any} */ n) => n.name === 'URBAN ASSEMBLY NEW YORK HARBOR SCHOOL');
	assert.ok(h && /Governors Island/.test(h.note));
});
