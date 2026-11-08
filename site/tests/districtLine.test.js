// #88: an address on a district line is listed in every district it touches, and says so.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { districtLine, joinAnd } from '../src/lib/districtLine.js';

const D = 'static/data';
const have = existsSync(`${D}/manifest.json`);
const built = { 'bk-cd4': { label: 'Brooklyn Community District 4' }, 'mn-cd1': { label: 'Manhattan Community District 1' } };

test('no note for an address that is not on a line', () => {
	assert.equal(districtLine({ district: 'bk-cd4', listed_in: ['bk-cd4'] }, built), null);
	assert.equal(districtLine({ district: 'bk-cd4' }, built), null);
});

test('a line with a district this prototype does not cover', () => {
	const a = { district: 'bk-cd4', listed_in: ['bk-cd4'], line: { note: 'On the line between Brooklyn CD 3 and CD 4',
		districts: [{ slug: 'bk-cd3', label: 'Brooklyn Community District 3', built: false },
			{ slug: 'bk-cd4', label: 'Brooklyn Community District 4', built: true }] } };
	assert.deepEqual(districtLine(a, built), { note: 'On the line between Brooklyn CD 3 and CD 4',
		listed: [{ slug: 'bk-cd4', label: 'Brooklyn Community District 4' }], notBuilt: ['Brooklyn Community District 3'] });
});

test('joinAnd', () => {
	assert.equal(joinAnd(['A']), 'A');
	assert.equal(joinAnd(['A', 'B']), 'A and B');
	assert.equal(joinAnd(['A', 'B', 'C']), 'A, B and C');
});

test('906 Broadway, Brooklyn is on the line between CD 3 and CD 4 (real build)', { skip: !have }, async () => {
	const m = JSON.parse(readFileSync(`${D}/manifest.json`, 'utf8'));
	const a = JSON.parse(readFileSync(`${D}/address/3042867.json`, 'utf8'));
	assert.equal(a.street, '906 BROADWAY');
	assert.equal(a.line.note, 'On the line between Brooklyn CD 3 and CD 4');
	assert.ok(a.listed_in.includes('bk-cd4'));
	assert.equal(m.district_lines.boundary_ft, 100);
	const { renderAddress } = await import('./helpers/addressView.js');
	const html = await renderAddress(a);
	assert.match(html, /On the line between Brooklyn CD 3 and CD 4/);
	assert.match(html, /Brooklyn Community District 3 is not in this prototype yet, so for now it is listed only in/);
	assert.doesNotMatch(html, /just outside/);
});

test('every page on a line is listed in each built district on it, and in its points file', { skip: !have }, () => {
	const m = JSON.parse(readFileSync(`${D}/manifest.json`, 'utf8'));
	const index = JSON.parse(readFileSync(`${D}/address/index.json`, 'utf8'));
	const pts = Object.fromEntries(Object.keys(m.districts).map((s) =>
		[s, new Set(JSON.parse(readFileSync(`${D}/lookup/points-${s}.json`, 'utf8')).map((/** @type {any[]} */ p) => p[0]))]));
	let onLine = 0;
	for (const row of index) {
		assert.ok(row.listed_in.length >= 1 && row.listed_in[0] === row.district, row.id);
		for (const s of row.listed_in) assert.ok(m.districts[s], `${row.id} listed in unknown ${s}`);
		const a = JSON.parse(readFileSync(`${D}/address/${row.id}.json`, 'utf8'));
		if (a.line) {
			onLine++;
			const builtOnLine = a.line.districts.filter((/** @type {any} */ d) => d.built).map((/** @type {any} */ d) => d.slug);
			for (const s of builtOnLine) assert.ok(row.listed_in.includes(s), `${row.id} not listed in ${s}`);
		}
		if (a.lon != null) for (const s of row.listed_in) assert.ok(pts[s].has(row.id), `${row.id} missing from points-${s}`);
	}
	assert.equal(onLine, m.district_lines.pages_on_a_line);
});
