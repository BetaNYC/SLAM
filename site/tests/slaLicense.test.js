// SLA license record (#63): LAMP link, license ID and class, where hours live. node --test.
import { test } from 'node:test';
import { renderAddress } from './helpers/addressView.js';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { lampUrl, SLA_SOURCES } from '../src/lib/format.js';

test('lampUrl puts longitude first, as Esri center=x,y expects', () => {
	// OL'DAYS, 73 Warren St (0240-24-104108): georeference [-74.01011, 40.71513]
	assert.equal(lampUrl(-74.01011, 40.71513), 'https://lamp.sla.ny.gov/?center=-74.01011,40.71513&level=18');
	assert.equal(lampUrl(-73.92944, 40.70281, 17), 'https://lamp.sla.ny.gov/?center=-73.92944,40.70281&level=17');
});

test('lampUrl rounds to 5 decimals and drops trailing zeros', () => {
	assert.equal(lampUrl(-74.0101149, 40.7151351), 'https://lamp.sla.ny.gov/?center=-74.01011,40.71514&level=18');
	assert.equal(lampUrl(-74.1, 40.7), 'https://lamp.sla.ny.gov/?center=-74.1,40.7&level=18');
});

test('lampUrl gives no link without a usable point', () => {
	for (const [lon, lat] of [[null, 40.7], [-74, undefined], [undefined, undefined], ['', ''], ['-74', '40.7'], [NaN, 40.7], [-74, Infinity], [40.7, -200], [-74, 95], [0, 0]]) {
		assert.equal(lampUrl(/** @type {any} */ (lon), /** @type {any} */ (lat)), null, `${lon},${lat}`);
	}
});

test('lampUrl keeps the zoom level it is given', () => {
	assert.match(lampUrl(-74.01011, 40.71513) ?? '', /&level=18$/);
	assert.match(lampUrl(-74.01011, 40.71513, 16) ?? '', /&level=16$/);
});

test('no query= links and no verdict words in the license code', () => {
	const verdict = /\b(violat\w*|meets?|eligib\w*|allowed|complian\w*|prohibit\w*|illegal|legal to)\b/i;
	for (const f of ['src/lib/SlaLicenseNote.svelte', 'src/routes/[district]/RecordTable.svelte', 'src/routes/address/AddressView.svelte', 'src/lib/format.js']) {
		const s = readFileSync(f, 'utf8');
		assert.equal(s.match(verdict), null, f);
		assert.equal(/lamp\.sla\.ny\.gov\/\?query=/.test(s), false, f);
	}
});

test('built data: manifest names the SLA fields, the minutes page and LAMP level 18', () => {
	const m = JSON.parse(readFileSync('static/data/manifest.json', 'utf8'));
	const S = m.sla_license;
	assert.equal(S.lamp.level, 18);
	assert.equal(S.fields.liquor_active.id, 'licensepermitid');
	assert.equal(S.fields.liquor_inactive.id, 'license_permit_id');
	assert.equal(S.fields.liquor_pending.id, 'application_id');
	assert.equal(S.full_board.url, 'https://sla.ny.gov/full-board-meetings');
	for (const k of SLA_SOURCES) assert.ok(m.sources[k].rowsUpdatedAtIso, k);
});

test('built data: every SLA record on an address page has its type, class and ID', () => {
	let n = 0;
	let withPoint = 0;
	for (const f of readdirSync('static/data/address')) {
		if (f === 'index.json') continue;
		const a = JSON.parse(readFileSync(`static/data/address/${f}`, 'utf8'));
		for (const r of a.records.filter((/** @type {any} */ r) => SLA_SOURCES.includes(r.source))) {
			n++;
			assert.ok(r.rid && r.ltype && r.lclass, `${f} ${r.rid}`);
			if (lampUrl(r.lon, r.lat)) withPoint++;
		}
	}
	assert.ok(n > 1000, `SLA records on pages: ${n}`);
	assert.ok(withPoint === n, `with a LAMP link: ${withPoint} of ${n}`);
});

test('an address page links LAMP at the license point and the Full Board page', async () => {
	const id = JSON.parse(readFileSync('static/data/lookup/bins-3.json', 'utf8')).bins['3071959']; // 44 Wilson Ave, Brooklyn (GOLDSOUNDS, 0370-22-104616)
	const a = JSON.parse(readFileSync(`static/data/address/${id}.json`, 'utf8'));
	const html = (await renderAddress(a)).replace(/\s+/g, ' ');
	assert.ok(html.includes('https://lamp.sla.ny.gov/?center=-73.92944,40.70281&amp;level=18'));
	assert.ok(html.includes('https://sla.ny.gov/full-board-meetings'));
	assert.ok(html.includes('does not include method of operation or hours'));
	assert.ok(!html.includes('?query='));
});
