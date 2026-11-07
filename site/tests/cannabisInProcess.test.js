// OCM "In-Process" cannabis rows are labeled as not yet issued (#110). The label comes only from
// the State's own `license_status` field (data.ny.gov jskf-tt3q), matched exactly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
	CANNABIS_IN_PROCESS,
	CANNABIS_IN_PROCESS_LABEL,
	isCannabisInProcess,
	statusLabel,
	splitCannabisInProcess
} from '../src/lib/format.js';
import { renderFile } from './helpers/renderSvelte.js';
import { readAddress, renderAddress } from './helpers/addressView.js';

const manifest = JSON.parse(readFileSync('static/data/manifest.json', 'utf8'));
const slugs = Object.keys(manifest.districts);
/** @param {string} slug */
const lists = (slug) => JSON.parse(readFileSync(`static/data/${slug}/list.json`, 'utf8'));
/** @param {string} html */
const count = (html, s) => html.split(s).length - 1;

test('statusLabel: only an OCM license row with status exactly "In-Process" gets the label', () => {
	assert.equal(CANNABIS_IN_PROCESS, 'In-Process');
	assert.equal(CANNABIS_IN_PROCESS_LABEL, 'In process (not yet issued)');
	assert.equal(statusLabel({ source: 'cannabis_license', status: 'In-Process' }), 'In process (not yet issued)');
	// every other OCM status is shown as OCM writes it
	for (const s of ['Active', 'Inactive', 'Amendment Under Review'])
		assert.equal(statusLabel({ source: 'cannabis_license', status: s }), s);
	// no guessing: near-misses, other sources and missing fields keep their own value
	for (const s of ['In Process', 'in-process', 'In-Process ', 'Pending'])
		assert.equal(statusLabel({ source: 'cannabis_license', status: s }), s, s);
	assert.equal(statusLabel({ source: 'cannabis_retail', status: 'In-Process' }), 'In-Process');
	assert.equal(statusLabel({ source: 'liquor_pending', status: 'Under Review' }), 'Under Review');
	assert.equal(statusLabel({ source: 'cannabis_license' }), '');
	assert.equal(statusLabel(null), '');
	// the label is decided by status, not by the missing license number or issue date
	assert.equal(isCannabisInProcess({ source: 'cannabis_license', status: 'Active', rid: 'OCMRETL-2023-002086', date: '' }), false);
});

test('splitCannabisInProcess keeps each group in its original order', () => {
	const rows = [
		{ source: 'cannabis_retail', status: 'Registered', rid: 'a' },
		{ source: 'cannabis_license', status: 'In-Process', rid: 'b' },
		{ source: 'cannabis_license', status: 'Active', rid: 'c' },
		{ source: 'cannabis_license', status: 'In-Process', rid: 'd' }
	];
	const { inProcess, other } = splitCannabisInProcess(rows);
	assert.deepEqual(inProcess.map((r) => r.rid), ['b', 'd']);
	assert.deepEqual(other.map((r) => r.rid), ['a', 'c']);
});

test('built data: the label count on the cannabis tab equals the In-Process count in license_status', async () => {
	let seen = 0;
	for (const slug of slugs) {
		const L = lists(slug);
		const rows = [...L.cannabis_retail, ...L.cannabis_license];
		const want = L.cannabis_license.filter((/** @type {any} */ r) => r.status === 'In-Process').length;
		seen += want;
		const { inProcess, other } = splitCannabisInProcess(rows);
		assert.equal(inProcess.length, want, slug);
		assert.equal(inProcess.length + other.length, rows.length, slug);
		const first = await renderFile('src/routes/[district]/RecordTable.svelte', { rows: inProcess, caption: 'In process, not yet issued (OCM)', showClass: false });
		const rest = await renderFile('src/routes/[district]/RecordTable.svelte', { rows: other, caption: 'Cannabis retail dealers and licenses (OCM)', showClass: false });
		assert.equal(count(first, CANNABIS_IN_PROCESS_LABEL), want, slug);
		assert.equal(count(rest, CANNABIS_IN_PROCESS_LABEL), 0, slug);
		// the raw value never shows on its own in the table
		assert.equal(count(first + rest, '>In-Process'), 0, slug);
	}
	assert.ok(seen > 0, 'the built data has at least one In-Process row to test against');
});

test('cannabis tab lists In-Process first and links the Glossary entry', () => {
	const src = readFileSync('src/routes/[district]/+page.svelte', 'utf8');
	const a = src.indexOf('rows={cannabisSplit.inProcess}');
	const b = src.indexOf('rows={cannabisSplit.other}');
	assert.ok(a > 0 && b > a, 'In-Process table comes before the other cannabis table');
	assert.match(src, /\[\.\.\.cannabisSplit\.inProcess, \.\.\.cannabisSplit\.other\]/, 'CSV keeps the same order');
	assert.match(src, /#cannabis-in-process/);
});

test('address pages show the label for In-Process records, at the address and nearby', async () => {
	const ids = readdirSync('static/data/address').filter((f) => f !== 'index.json').map((f) => f.replace(/\.json$/, ''));
	let at = 0;
	let near = 0;
	for (const id of ids) {
		const a = readAddress(id);
		const here = a.records.filter(isCannabisInProcess).length;
		const nearby = a.nearby.flatMap((/** @type {any} */ n) => n.records).filter(isCannabisInProcess).length;
		if (!here && !nearby) continue;
		const html = await renderAddress(a);
		assert.equal(count(html, CANNABIS_IN_PROCESS_LABEL), here + nearby, id);
		at += here;
		near += nearby;
	}
	assert.ok(at > 0, 'some address page has an In-Process record');
	assert.ok(near > 0, 'some address page has an In-Process record nearby');
});

test('the map panel uses the same label', () => {
	const src = readFileSync('src/lib/MapPanel.svelte', 'utf8');
	assert.match(src, /` · \$\{statusLabel\(r\)\}`/);
	assert.doesNotMatch(src, /` · \$\{r\.status\}`/);
});

test('Glossary: In process entry, its source, the open-data gap, and Cannabis Law §76', () => {
	const g = readFileSync('src/routes/glossary/+page.svelte', 'utf8');
	const i = g.indexOf('<dt id="cannabis-in-process">');
	assert.ok(i > 0, 'glossary has the entry');
	const dd = g.slice(i, g.indexOf('</dd>', i)).replace(/\s+/g, ' ');
	assert.match(dd, /"In-Process"/);
	assert.match(dd, /jskf-tt3q/);
	assert.match(dd, /proximity protection/);
	assert.match(dd, /not in any open dataset/);
	assert.match(dd, /href="https:\/\/www\.nysenate\.gov\/legislation\/laws\/CAN\/76"/);
	assert.match(dd, /does not say whether a license will be issued/);
});
