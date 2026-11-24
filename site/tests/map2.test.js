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

// ---- Follow-ups (#134): license dates from list.json, the six-month count, and no pile cap.
import { existsSync } from 'node:fs';
import { recordPoints, expiringSoon, addMonths, maxPile, nycToday } from '../src/lib/map2.js';
import { stackChips, stackDiscs, STACK_CAP } from '../src/lib/c311Display.js';

const DATA = 'static/data/bk-cd9';
const built = existsSync(`${DATA}/list.json`) && existsSync(`${DATA}/points.geojson`);

test('built data: list.json gives the same dots as points.geojson, plus type and date', { skip: !built && 'no built data' }, () => {
	const list = JSON.parse(readFileSync(`${DATA}/list.json`, 'utf8'));
	const pts = JSON.parse(readFileSync(`${DATA}/points.geojson`, 'utf8'));
	const key = (/** @type {any} */ f) => JSON.stringify([f.properties.source, f.properties.aid, f.properties.name, f.properties.street, f.properties.status, f.geometry.coordinates]);
	const mine = recordPoints(list).features;
	assert.deepEqual(mine.map(key).sort(), pts.features.map(key).sort());
	// Every liquor dot has its date label; an active license always has its expiration date (one
	// pending application in the 2026-11-24 data has no received date, and its popup leaves the line out).
	for (const f of mine.filter((x) => x.properties.source.startsWith('liquor_'))) assert.ok(f.properties.date_label, f.properties.rid);
	for (const f of mine.filter((x) => x.properties.source === 'liquor_active')) assert.ok(f.properties.date_label === 'Expires' && /^\d{4}-\d{2}-\d{2}$/.test(f.properties.date), f.properties.rid);
});

test('addMonths keeps the day, or the last day of a shorter month', () => {
	assert.equal(addMonths('2026-11-24', 6), '2027-05-24');
	assert.equal(addMonths('2026-08-31', 6), '2027-02-28');
	assert.equal(addMonths('2026-12-31', 2), '2027-02-28');
});

test('expiringSoon counts active licenses expiring today through six months out', () => {
	const rows = [
		{ date_label: 'Expires', date: '2026-11-23' }, // yesterday: no
		{ date_label: 'Expires', date: '2026-11-24' }, // today: yes
		{ date_label: 'Expires', date: '2026-12-31' }, // yes
		{ date_label: 'Expires', date: '2027-05-24' }, // six months: yes
		{ date_label: 'Expires', date: '2027-05-25' }, // no
		{ date_label: 'Received', date: '2026-12-01' } // not an expiration: no
	];
	assert.equal(expiringSoon(rows, '2026-11-24'), 3);
	assert.match(nycToday(new Date('2026-11-25T03:00:00Z')), /^2026-11-24$/); // 10 pm in New York
});

test('no pile cap on map2: every complaint is a chip and a disc', () => {
	const fc = { type: 'FeatureCollection', features: Array.from({ length: 130 }, (_, i) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [-73.95, 40.66] }, properties: { d: `2024-01-${String((i % 28) + 1).padStart(2, '0')}`, t: 'Noise - Commercial' } })) };
	assert.equal(maxPile(fc), 130);
	assert.equal(stackChips(fc, Infinity).features.length, 130);
	assert.equal(stackDiscs(fc, 17, Infinity).features.length, 130);
	assert.equal(stackChips(fc).features.length, STACK_CAP); // the first map's cap is unchanged
	const src = readFileSync('src/routes/[district]/map2/+page.svelte', 'utf8');
	assert.match(src, /stackChips\(shown311, Infinity\)/);
	assert.match(src, /stackDiscs\(shown311, z, Infinity\)/);
});
