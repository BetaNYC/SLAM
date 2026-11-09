// Community review page (static/review/): the request body matches the BetaNYC data-issue
// intake contract v1 (kind review-answer), the data files keep their contract shape and
// invariants, and no script writes data with innerHTML or loads anything from another site.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
	ENDPOINT,
	buildRequestBody,
	checkData,
	clean,
	randomBatch,
	storageKey,
	validBatch
} from '../static/review/review-core.js';

const DIR = resolve('static/review');
const TOP_KEYS = ['schema', 'tool', 'kind', 'page_url', 'website', 'credit_ok', 'contact', 'dataset', 'batch_id', 'answers'];

test('sending is off: ENDPOINT ships empty', () => {
	assert.equal(ENDPOINT, '');
});

test('request body: contract fields, batch order, only answered items, optional parts left out', () => {
	const body = buildRequestBody({
		batchId: 'b07',
		itemIds: ['R3', 'R1', 'R2', 'R9'],
		answers: {
			R1: { choice: 'matches', page_value: '', note: '' },
			R2: { choice: 'does_not_match', page_value: ' Adult-Use Cultivator License ', note: 'ti ligature' },
			R3: { choice: 'cant_tell' },
			R9: { page_value: 'typed but no choice' }
		}
	});
	assert.deepEqual(body, {
		schema: 'betanyc-data-issue/1',
		tool: 'slam',
		kind: 'review-answer',
		page_url: 'https://slam.beta.nyc/review/?batch=b07',
		website: '',
		credit_ok: false,
		dataset: 'cannabis-decision-trail',
		batch_id: 'b07',
		answers: [
			{ item_id: 'R3', choice: 'cant_tell' },
			{ item_id: 'R1', choice: 'matches' },
			{ item_id: 'R2', choice: 'does_not_match', page_value: 'Adult-Use Cultivator License', note: 'ti ligature' }
		]
	});
	for (const k of Object.keys(body)) assert.ok(TOP_KEYS.includes(k), `unknown top-level key ${k}`);
});

test('request body: contact only when given, credit and honeypot passed through', () => {
	const b = buildRequestBody({
		batchId: 'b01',
		itemIds: ['R1'],
		answers: { R1: { choice: 'matches' } },
		contact: { name: '  Ada  ', email: '' },
		creditOk: true,
		website: 'http://spam.example'
	});
	assert.deepEqual(b.contact, { name: 'Ada' });
	assert.equal(b.credit_ok, true);
	assert.equal(b.website, 'http://spam.example');
	const c = buildRequestBody({ batchId: 'b01', itemIds: ['R1'], answers: { R1: { choice: 'matches' } }, contact: { email: 'a@b.org' } });
	assert.deepEqual(c.contact, { email: 'a@b.org' });
});

test('request body: limits, control characters and bad input', () => {
	const long = 'x'.repeat(900);
	const b = buildRequestBody({
		batchId: 'b02',
		itemIds: ['R1'],
		answers: { R1: { choice: 'does_not_match', page_value: long, note: `line one\nline\u0007 two\u0000${long}` } },
		contact: { name: long }
	});
	const a = /** @type {any} */ (b.answers)[0];
	assert.equal(a.page_value.length, 300);
	assert.equal(a.note.length, 500);
	assert.ok(a.note.startsWith('line one\nline two'));
	assert.equal(/** @type {any} */ (b.contact).name.length, 100);
	assert.equal(clean(' \t a\u001fb \n', 10), 'ab');
	assert.throws(() => buildRequestBody({ batchId: 'b01', itemIds: ['R1'], answers: {} }), /at least one/);
	assert.throws(() => buildRequestBody({ batchId: 'b01', itemIds: ['R1'], answers: { R1: { choice: 'yes' } } }), /at least one/);
	assert.throws(() => buildRequestBody({ batchId: '../x', itemIds: ['R1'], answers: { R1: { choice: 'matches' } } }), /batch/);
	assert.throws(
		() => buildRequestBody({ batchId: 'b01', itemIds: ['R1'], answers: { R1: { choice: 'matches' } }, contact: { email: 'not-an-email' } }),
		/email/
	);
	const many = Array.from({ length: 51 }, (_, i) => `R${i}`);
	assert.throws(() => buildRequestBody({ batchId: 'b01', itemIds: many, answers: Object.fromEntries(many.map((id) => [id, { choice: 'matches' }])) }), /Too many/);
});

test('batch parameter is checked against batches.json', () => {
	const batches = [{ batch_id: 'b01', item_ids: [] }, { batch_id: 'b02', item_ids: [] }];
	assert.equal(validBatch('b02', batches)?.batch_id, 'b02');
	assert.equal(validBatch('b99', batches), null);
	assert.equal(validBatch('<img src=x>', batches), null);
	assert.equal(validBatch(null, batches), null);
	assert.equal(randomBatch(batches, 0).batch_id, 'b01');
	assert.equal(randomBatch(batches, 0.9999).batch_id, 'b02');
	assert.equal(storageKey('b01'), 'slam-review:cannabis-decision-trail:b01');
});

test('checkData refuses unsafe image paths and non-https links', () => {
	const item = { item_id: 'a1', dataset: 'cannabis-decision-trail', field_label: 'x', value_read: 'y', question: 'z', image: 'img/a1.webp', source_pdf_url: 'https://cannabis.ny.gov/a.pdf', pdf_page: 2 };
	assert.equal(checkData([item], [{ batch_id: 'b01', item_ids: ['a1'] }]).size, 1);
	assert.throws(() => checkData([{ ...item, image: 'https://evil.example/a.webp' }], []));
	assert.throws(() => checkData([{ ...item, image: 'img/../../x.webp' }], []));
	assert.throws(() => checkData([{ ...item, source_pdf_url: 'javascript:alert(1)' }], []));
	assert.throws(() => checkData([item], [{ batch_id: 'b01', item_ids: ['nope'] }]));
});

test('the shipped data keeps the contract shape and batch invariants', () => {
	const items = JSON.parse(readFileSync(join(DIR, 'items.json'), 'utf8'));
	const batches = JSON.parse(readFileSync(join(DIR, 'batches.json'), 'utf8'));
	const byId = checkData(items, batches);
	const keys = ['item_id', 'dataset', 'field_label', 'value_read', 'question', 'image', 'source_pdf_url', 'pdf_page'];
	for (const it of items) {
		assert.deepEqual(Object.keys(it), keys);
		assert.equal(it.dataset, 'cannabis-decision-trail');
		assert.ok(statSync(join(DIR, it.image)).isFile(), `missing ${it.image}`);
		assert.ok(new URL(it.source_pdf_url).hostname === 'cannabis.ny.gov');
		const text = `${it.field_label} ${it.value_read} ${it.question}`;
		assert.doesNotMatch(text, /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/, `email-like text in ${it.item_id}`);
		assert.doesNotMatch(text, /\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]\d{4}\b/, `phone-like text in ${it.item_id}`);
	}
	/** @type {Record<string, number>} */
	const seen = {};
	for (const b of batches) {
		assert.equal(new Set(b.item_ids).size, b.item_ids.length, `${b.batch_id} repeats an item`);
		assert.ok(b.item_ids.length >= 10 && b.item_ids.length <= 30);
		for (const id of b.item_ids) seen[id] = (seen[id] ?? 0) + 1;
	}
	for (const id of byId.keys()) assert.equal(seen[id], 2, `${id} is not in exactly two batches`);
});

test('no innerHTML/outerHTML/insertAdjacentHTML/document.write, no inline script, no third-party URL', () => {
	const files = readdirSync(DIR).filter((f) => /\.(js|html|css)$/.test(f));
	assert.ok(files.includes('review.js') && files.includes('index.html'));
	for (const f of files) {
		const src = readFileSync(join(DIR, f), 'utf8');
		const code = f.endsWith('.js') ? src.replace(/^\s*\/\/.*$/gm, '') : src;
		assert.doesNotMatch(code, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function/, `${f} writes HTML from strings`);
		if (f.endsWith('.html')) {
			assert.doesNotMatch(src, /<script(?![^>]*\bsrc=)[^>]*>/, `${f} has an inline script`);
			assert.doesNotMatch(src, /\son[a-z]+=/i, `${f} has an inline event handler`);
			assert.doesNotMatch(src, /\sstyle=/i, `${f} has an inline style`);
			for (const m of src.matchAll(/(?:src|href)="([^"]+)"/g)) {
				assert.ok(!/^(https?:)?\/\//.test(m[1]) || m[1] === 'https://beta.nyc', `${f} loads ${m[1]}`);
			}
		}
	}
	const html = readFileSync(join(DIR, 'index.html'), 'utf8');
	const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1] ?? '';
	assert.match(csp, /default-src 'self'/);
	assert.match(csp, /script-src 'self'(;|$)/);
	assert.match(csp, /style-src 'self'(;|$)/);
	assert.match(csp, /connect-src 'self' https:\/\/www\.beta\.nyc(;|$)/);
	assert.doesNotMatch(csp, /unsafe-|\*/);
	assert.doesNotMatch(html, /googletagmanager|google-analytics|gtag\(/);
});
