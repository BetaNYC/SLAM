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
