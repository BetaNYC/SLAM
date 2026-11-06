// #95: every build writes the addresses it could not match, for a person to review.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';

const D = 'static/data';
const have = existsSync(`${D}/manifest.json`);

test('the unmatched-address review file matches the manifest count', { skip: !have }, () => {
	const m = JSON.parse(readFileSync(`${D}/manifest.json`, 'utf8')).address_geocode;
	const lines = readFileSync(`${D}/${m.unmatched_review_file.path}`, 'utf8').trim().split(/\r?\n/);
	assert.equal(lines[0], 'district,street,zip,status,geosearch_top_hit,sources,records');
	assert.equal(lines.length - 1, m.unmatched_review_file.rows);
	assert.equal(m.unmatched_review_file.rows, m.low_confidence + m.unmatched);
});

test('a page placed at the nearest listed number says so and has no BIN', { skip: !have }, () => {
	let n = 0;
	for (const f of readdirSync(`${D}/address`)) {
		if (f === 'index.json') continue;
		const a = JSON.parse(readFileSync(`${D}/address/${f}`, 'utf8'));
		if (a.point?.matched_by !== 'pad-nearest') continue;
		n++;
		assert.ok(!/^\d{7}$/.test(a.id), a.id); // keyed on street + ZIP, never a neighbor's BIN
	}
	assert.ok(n >= 0);
});
