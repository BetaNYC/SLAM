// node --test (built-in runner, https://nodejs.org/api/test.html)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCsv, addressLine } from '../src/lib/format.js';

test('toCsv quotes commas, quotes and newlines (RFC 4180)', () => {
	const csv = toCsv([{ name: 'Mesa Bar, LLC', note: 'say "hi"', boards: [4, 5] }], ['name', 'note', 'boards', 'missing']);
	assert.equal(csv, 'name,note,boards,missing\r\n"Mesa Bar, LLC","say ""hi""",4;5,');
});

test('addressLine joins street and street2, skipping blanks', () => {
	assert.equal(addressLine({ street: '4 South Street Space 203', street2: 'Whitehall Terminal' }), '4 South Street Space 203, Whitehall Terminal');
	assert.equal(addressLine({ street: '28 Water St' }), '28 Water St');
});

test('every built district page has its data file', async () => {
	const { readFileSync, existsSync } = await import('node:fs');
	const m = JSON.parse(readFileSync('static/data/manifest.json', 'utf8'));
	for (const slug of Object.keys(m.districts)) {
		assert.ok(existsSync(`static/data/${slug}/list.json`), slug);
		assert.ok(existsSync(`static/data/${slug}/points.geojson`), slug);
	}
});

test('yearHeaders marks only the current, partial year as to date', async () => {
	const { yearHeaders, yearTotals } = await import('../src/lib/format.js');
	assert.deepEqual(yearHeaders([2024, 2025, 2026], '2026-11-01').map((h) => h.sub), ['', '', 'to date (through 2026-11-01)']);
	assert.deepEqual(yearHeaders([2024, 2025], '2026-01-02').map((h) => h.sub), ['', '']);
	const rows = [
		{ type: 'Noise - Commercial', by_year: { 2024: 3, 2025: 1 }, total: 4 },
		{ type: 'Food Establishment', by_year: { 2024: 0, 2025: 2 }, total: 2 }
	];
	assert.deepEqual(yearTotals(rows, [2024, 2025]), { total: 6, 2024: 3, 2025: 3 });
});

test('built 311 data: district tab, map dots and address sections are consistent', async () => {
	const { readFileSync, existsSync } = await import('node:fs');
	const m = JSON.parse(readFileSync('static/data/manifest.json', 'utf8'));
	assert.ok(m.sources.complaints_311.rowsUpdatedAt, 'manifest carries rowsUpdatedAt for 311');
	for (const slug of Object.keys(m.districts)) {
		const c = JSON.parse(readFileSync(`static/data/${slug}/list.json`, 'utf8')).complaints_311;
		const sum = c.by_type_year.reduce((/** @type {number} */ n, /** @type {any} */ r) => n + r.total, 0);
		assert.equal(sum, c.total, `${slug}: count table adds up to the district total`);
		assert.equal(c.total, m.districts[slug].counts.complaints_311);
		assert.ok(c.recent.length <= 200);
		for (const r of c.recent) assert.deepEqual(Object.keys(r).filter((k) => !['rid', 'date', 'type', 'descriptor', 'street', 'zip', 'agency', 'status'].includes(k)), [], 'only displayed fields');
		assert.ok(existsSync(`static/data/${slug}/points-311.geojson`));
		const pts = JSON.parse(readFileSync(`static/data/${slug}/points-311.geojson`, 'utf8'));
		assert.equal(pts.features.length, c.total, `${slug}: one dot per complaint`);
		for (const f of pts.features) if (f.properties.aid) assert.ok(existsSync(`static/data/address/${f.properties.aid}.json`), 'dot links to a real address page');
	}
	const idx = JSON.parse(readFileSync('static/data/address/index.json', 'utf8'));
	const top = idx.reduce((/** @type {any} */ a, /** @type {any} */ b) => (b.n311 > a.n311 ? b : a));
	const a = JSON.parse(readFileSync(`static/data/address/${top.id}.json`, 'utf8'));
	assert.equal(a.c311.n, top.n311);
	assert.ok(a.c311.recent.length <= 10);
});

test('popup311 builds text nodes, never HTML', async () => {
	const { popup311 } = await import('../src/lib/popup311.js');
	// Minimal stand-in for the three DOM calls popup311 uses.
	/** @param {string} tag */
	const el = (tag) => ({ tag, children: /** @type {any[]} */ ([]), textContent: '', append(/** @type {any[]} */ ...c) { this.children.push(...c); } });
	const doc = /** @type {any} */ ({ createElement: el, createTextNode: (/** @type {string} */ t) => ({ text: t }) });
	const div = /** @type {any} */ (popup311({ d: '2026-10-31', t: 'Noise - Commercial', s: '<b>44 WILSON AVENUE</b>' }, doc));
	assert.equal(div.children.length, 3);
	assert.equal(div.children[2].children[1].text, '<b>44 WILSON AVENUE</b>');
	assert.equal(popup311({ d: '2026-10-31', t: 'x' }, doc).children[2].children[1].text, '(no address)');
});

test('coBisUrl builds the confirmed BIS pattern and refuses non-BINs', async () => {
	const { coBisUrl } = await import('../src/lib/format.js');
	assert.equal(coBisUrl('1089309'), 'https://a810-bisweb.nyc.gov/bisweb/COsByLocationServlet?requestid=1&allbin=1089309');
	assert.equal(coBisUrl('3071959'), 'https://a810-bisweb.nyc.gov/bisweb/COsByLocationServlet?requestid=1&allbin=3071959');
	assert.equal(coBisUrl(''), null);
	assert.equal(coBisUrl(null), null);
	assert.equal(coBisUrl('6000001'), null);
	assert.equal(coBisUrl('1089309&x=1'), null);
});

test('abcEatsUrl uses the #!/Search/<camis> pattern', async () => {
	const { abcEatsUrl } = await import('../src/lib/format.js');
	assert.equal(abcEatsUrl('50036043'), 'https://a816-health.nyc.gov/ABCEatsRestaurants/#!/Search/50036043');
	assert.equal(abcEatsUrl('abc'), null);
	assert.equal(abcEatsUrl(undefined), null);
});

test('built restaurant data: district buckets add up and address pages agree', async () => {
	const { readFileSync, existsSync } = await import('node:fs');
	const m = JSON.parse(readFileSync('static/data/manifest.json', 'utf8'));
	const idx = JSON.parse(readFileSync('static/data/address/index.json', 'utf8'));
	let onPages = 0;
	for (const slug of Object.keys(m.districts)) {
		const R = JSON.parse(readFileSync(`static/data/${slug}/list.json`, 'utf8')).restaurants;
		assert.equal(R.buckets.reduce((/** @type {number} */ n, /** @type {any} */ b) => n + b.n, 0), R.total, `${slug}: buckets add up`);
		assert.equal(R.rows.length, R.total);
		const st = m.restaurant_inspections.by_district[slug];
		assert.equal(st.on_page_by_bin + st.on_page_by_point + st.not_on_a_page, st.restaurants, `${slug}: every restaurant counted once`);
		for (const r of R.rows) if (r.aid) assert.ok(existsSync(`static/data/address/${r.aid}.json`), 'row links to a real page');
		onPages += st.on_page_by_bin + st.on_page_by_point;
	}
	assert.equal(idx.reduce((/** @type {number} */ n, /** @type {any} */ a) => n + a.nrest, 0), onPages);
});

test('built address pages: 185 Greenwich and 44 Wilson carry BIN, CO block and restaurants', async () => {
	const { readFileSync } = await import('node:fs');
	for (const [bin, camis] of [['1089309', '50162301'], ['3071959', '50048523']]) {
		const a = JSON.parse(readFileSync(`static/data/address/${bin}.json`, 'utf8'));
		assert.equal(a.co.bin, bin);
		assert.equal(a.co.bin_source, 'geosearch');
		const r = a.restaurants.find((/** @type {any} */ x) => x.camis === camis);
		assert.ok(r, `${camis} at ${bin}`);
		assert.equal(r.placed, 'bin');
		for (let i = 1; i < r.history.length; i++) assert.ok(r.history[i - 1].date >= r.history[i].date, 'newest first');
	}
});
