// The second district map (#134): its feedback request, checked against the intake snippet's
// contract (beta.nyc Code Snippet #21, betanyc_data_issue_validate) with a mocked fetch only.
// Nothing here reaches the live endpoint. Also: the page draws only colors from the tested palette.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ENDPOINT, feedbackBody, sendFeedback, pageUrl, LIMITS } from '../src/lib/feedback.js';
import { SOURCE_COLOR, C311_GROUPS, SW_COLOR } from '../src/lib/format.js';
import { RING_COLOR } from '../src/lib/rings.js';
import { discColor } from '../src/lib/c311Display.js';

// The snippet's own rules, restated: allowed keys, and page_url under https://slam.beta.nyc.
const ALLOWED = ['schema', 'tool', 'kind', 'page_url', 'website', 'credit_ok', 'contact', 'client_id', 'dataset', 'batch_id', 'answers', 'record', 'description'];
const underSlam = (/** @type {string} */ u) => u === 'https://slam.beta.nyc' || /^https:\/\/slam\.beta\.nyc[/?#]/.test(u);

test('feedback body follows contract v1 for a problem report', () => {
	const b = feedbackBody({ slug: 'bk-cd9', description: '  The 311 chart is great.  ' });
	assert.deepEqual(b, {
		schema: 'betanyc-data-issue/1',
		tool: 'slam',
		kind: 'problem-report',
		page_url: 'https://slam.beta.nyc/bk-cd9/map2/',
		website: '',
		credit_ok: false,
		record: 'map2-feedback',
		description: 'The 311 chart is great.'
	});
	for (const k of Object.keys(b)) assert.ok(ALLOWED.includes(k), k);
	assert.ok(underSlam(b.page_url) && b.page_url.length <= LIMITS.page_url);
	assert.ok(!/\/boardstat/.test(b.page_url), 'tool slam must not report from a BoardStat page');
	assert.equal(typeof b.credit_ok, 'boolean');
	assert.ok(b.record.length <= 300);
});

test('contact is sent only when given, with only name and email', () => {
	assert.equal('contact' in feedbackBody({ slug: 'bk-cd9', description: 'x', name: ' ', email: '' }), false);
	assert.deepEqual(feedbackBody({ slug: 'bk-cd9', description: 'x', name: ' Ana ', email: 'ana@example.org' }).contact, { name: 'Ana', email: 'ana@example.org' });
	assert.deepEqual(feedbackBody({ slug: 'bk-cd9', description: 'x', email: 'ana@example.org' }).contact, { email: 'ana@example.org' });
	assert.equal(feedbackBody({ slug: 'bk-cd9', description: 'x', name: 'n'.repeat(150) }).contact?.name?.length, LIMITS.name);
});

test('the honeypot is passed through as given', () => {
	assert.equal(feedbackBody({ slug: 'bk-cd9', description: 'x', website: 'spam.example' }).website, 'spam.example');
});

test('feedback text is required and capped at 2000 characters', () => {
	assert.throws(() => feedbackBody({ slug: 'bk-cd9', description: '   ' }), /required/);
	assert.throws(() => feedbackBody({ slug: 'bk-cd9', description: 'x'.repeat(2001) }), /2000/);
	assert.equal(feedbackBody({ slug: 'bk-cd9', description: 'x'.repeat(2000) }).description.length, 2000);
});

test('endpoint and page URL are the snippet route and the public page', () => {
	assert.equal(ENDPOINT, 'https://www.beta.nyc/wp-json/betanyc-data/v1/report');
	assert.equal(pageUrl('bk-cd9'), 'https://slam.beta.nyc/bk-cd9/map2/');
});

test('sendFeedback POSTs JSON without credentials (mocked fetch) and reads the status', async () => {
	/** @type {any[]} */
	const calls = [];
	const mock = (/** @type {number} */ status) => /** @type {any} */ (async (/** @type {any} */ url, /** @type {any} */ init) => (calls.push([url, init]), { status }));
	const body = feedbackBody({ slug: 'bk-cd9', description: 'hello' });
	assert.equal(await sendFeedback(body, mock(201)), 'sent');
	const [url, init] = calls[0];
	assert.equal(url, ENDPOINT);
	assert.equal(init.method, 'POST');
	assert.equal(init.credentials, 'omit');
	assert.equal(init.headers['Content-Type'], 'application/json');
	assert.deepEqual(JSON.parse(init.body), body);
	assert.equal(await sendFeedback(body, mock(429)), 'busy');
	assert.equal(await sendFeedback(body, mock(400)), 'failed');
	assert.equal(await sendFeedback(body, mock(503)), 'failed');
	assert.equal(await sendFeedback(body, /** @type {any} */ (async () => { throw new TypeError('offline'); })), 'failed');
});

test('map2 draws only colors from the tested map palette (tests/mapPalette.test.js)', () => {
	const src = readFileSync('src/routes/[district]/map2/+page.svelte', 'utf8');
	const script = src.slice(0, src.indexOf('</script>'));
	const palette = new Set(
		[...Object.values(SOURCE_COLOR), ...C311_GROUPS.map((g) => g.color), ...C311_GROUPS.map((g) => discColor(g.color)), ...Object.values(SW_COLOR), ...Object.values(RING_COLOR), '#2359a8', '#1f2937', '#fff', '#ffffff'].map((c) => c.toLowerCase())
	);
	const used = [...script.matchAll(/'(#[0-9a-f]{3,6})'/gi)].map((m) => m[1].toLowerCase());
	for (const c of used) assert.ok(palette.has(c), `${c} is not in the tested palette`);
});
