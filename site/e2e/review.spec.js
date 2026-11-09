// Community review page (/review/): axe on each screen, keyboard use, the downloaded answers
// file, the batch parameter, saved answers, and no request to any other site.
// API: https://playwright.dev/docs/api/class-page and
// https://github.com/dequelabs/axe-core-npm/tree/develop/packages/playwright
import { test, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const BLOCKING = ['serious', 'critical'];
const batches = JSON.parse(readFileSync(resolve('build/review/batches.json'), 'utf8'));
const first = batches[0];

/** @param {import('@playwright/test').Page} page */
async function blocking(page) {
	const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
	const lines = r.violations.map((v) => `[${v.impact}] ${v.id}: ${v.help} ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
	if (lines.length) console.log(`${page.url()}\n  ${lines.join('\n  ')}`);
	return r.violations.filter((v) => BLOCKING.includes(v.impact ?? '')).map((v) => `${v.id} (${v.impact})`);
}

/** Fail the test on any request that leaves this server. */
function sameOriginOnly(/** @type {import('@playwright/test').Page} */ page) {
	/** @type {string[]} */
	const foreign = [];
	page.on('request', (req) => {
		const u = new URL(req.url());
		if (!['127.0.0.1:4173'].includes(u.host) && !['data:', 'blob:'].includes(u.protocol)) foreign.push(req.url());
	});
	return foreign;
}

test('axe on the intro, an item and the finish screen; nothing from another site', async ({ page }) => {
	const foreign = sameOriginOnly(page);
	/** @type {string[]} */
	const cspErrors = [];
	page.on('console', (m) => {
		if (/Content Security Policy/i.test(m.text())) cspErrors.push(m.text());
	});
	await page.goto(`/review/?batch=${first.batch_id}`);
	await expect(page.getByRole('heading', { level: 1, name: /Help check/ })).toBeVisible();
	await expect(page.locator('#batch-line')).toContainText(first.batch_id);
	expect(await blocking(page)).toEqual([]);
	await page.getByRole('button', { name: 'Start' }).click();
	await expect(page.locator('#item-img')).toHaveJSProperty('complete', true);
	await expect(page.locator('#progress-text')).toContainText(`Item 1 of ${first.item_ids.length}`);
	expect(await blocking(page)).toEqual([]);
	await page.getByRole('button', { name: 'Show larger' }).click();
	expect(await blocking(page)).toEqual([]);
	for (let i = 0; i < first.item_ids.length; i++) await page.locator('#next').click();
	await expect(page.getByRole('heading', { level: 1, name: 'Thank you' })).toBeVisible();
	expect(await blocking(page)).toEqual([]);
	expect(foreign).toEqual([]);
	expect(cspErrors).toEqual([]);
});

test('keyboard only: answer an item, move on, and download a file that matches the contract', async ({ page }, info) => {
	test.skip(info.project.name !== 'desktop', 'desktop keyboard only');
	await page.goto(`/review/?batch=${first.batch_id}`);
	await page.getByRole('button', { name: 'Start' }).focus();
	await page.keyboard.press('Enter');
	await expect(page.locator('#item-h')).toBeFocused();
	// Tab to the first radio button, then arrow to "Doesn't match".
	for (let i = 0; i < 12; i++) {
		await page.keyboard.press('Tab');
		if (await page.locator('input[value=matches]').evaluate((el) => el === document.activeElement)) break;
	}
	await page.keyboard.press('ArrowDown');
	await expect(page.locator('input[value=does_not_match]')).toBeChecked();
	await page.keyboard.press('Tab');
	await page.keyboard.type('Adult-Use Cultivator License');
	await page.keyboard.press('Tab');
	await page.keyboard.type('Second line\nof a note');
	await page.locator('#next').focus();
	await page.keyboard.press('Enter');
	await expect(page.locator('#progress-text')).toContainText('Item 2 of');
	await page.getByLabel('Matches').check();
	for (let i = 1; i < first.item_ids.length; i++) await page.locator('#next').click();
	await page.getByLabel('Your name (optional)').fill('Test Person');
	await page.getByLabel(/thank me by name/).check();
	const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download my answers' }).click()]);
	expect(dl.suggestedFilename()).toBe(`slam-review-cannabis-decision-trail-${first.batch_id}.json`);
	const body = JSON.parse(readFileSync(/** @type {string} */ (await dl.path()), 'utf8'));
	expect(Object.keys(body)).toEqual(['schema', 'tool', 'kind', 'page_url', 'website', 'credit_ok', 'contact', 'dataset', 'batch_id', 'answers']);
	expect(body).toMatchObject({
		schema: 'betanyc-data-issue/1',
		tool: 'slam',
		kind: 'review-answer',
		page_url: `https://slam.beta.nyc/review/?batch=${first.batch_id}`,
		website: '',
		credit_ok: true,
		contact: { name: 'Test Person' },
		dataset: 'cannabis-decision-trail',
		batch_id: first.batch_id
	});
	expect(body.answers).toEqual([
		{ item_id: first.item_ids[0], choice: 'does_not_match', page_value: 'Adult-Use Cultivator License', note: 'Second line\nof a note' },
		{ item_id: first.item_ids[1], choice: 'matches' }
	]);
	await expect(page.getByRole('button', { name: 'Send my answers' })).toBeHidden();
});

test('answers survive a reload; an unknown batch falls back to a real one', async ({ page }) => {
	await page.goto(`/review/?batch=${first.batch_id}`);
	await page.getByRole('button', { name: 'Start' }).click();
	await page.getByLabel("Can't tell").check();
	await page.reload();
	await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page.getByLabel("Can't tell")).toBeChecked();

	await page.goto('/review/?batch=%3Cimg%20src%3Dx%3E');
	await expect(page.getByRole('status')).toContainText('could not find batch');
	const shown = new URL(page.url()).searchParams.get('batch');
	expect(batches.map((/** @type {any} */ b) => b.batch_id)).toContain(shown);
	await expect(page.locator('img[src="x"]')).toHaveCount(0);
});

// ---------------------------------------------------------------- sending (endpoint mocked)
// ENDPOINT ships empty. These tests rewrite it in review-core.js as served, then answer the
// endpoint with Playwright routes (https://playwright.dev/docs/network#modify-responses), so
// nothing real is ever contacted. Responses follow the intake contract: 201 {"ok": true}, 429.
const MOCK_ENDPOINT = 'https://www.beta.nyc/wp-json/betanyc-data/v1/report';
// The endpoint must expose Retry-After to the page (Access-Control-Expose-Headers), or a
// cross-origin fetch cannot read it and the page falls back to "about an hour".
const CORS = { 'Access-Control-Allow-Origin': 'http://127.0.0.1:4173', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Expose-Headers': 'Retry-After' };

/**
 * @param {import('@playwright/test').Page} page
 * @param {(n: number) => {status: number, headers?: Record<string, string>, body: string}} reply
 */
async function mockEndpoint(page, reply) {
	/** @type {any[]} */
	const posts = [];
	await page.route('**/review/review-core.js', async (route) => {
		const res = await route.fetch();
		const body = (await res.text()).replace("export const ENDPOINT = '';", `export const ENDPOINT = '${MOCK_ENDPOINT}';`);
		await route.fulfill({ response: res, body });
	});
	await page.route(MOCK_ENDPOINT, async (route) => {
		const req = route.request();
		if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
		posts.push({ body: req.postDataJSON() });
		const r = reply(posts.length);
		await route.fulfill({ status: r.status, headers: { ...CORS, 'Content-Type': 'application/json', ...(r.headers ?? {}) }, body: r.body });
	});
	return posts;
}

/** Press Next until the finish screen shows (Continue resumes where the person left off). */
async function walkToFinish(/** @type {import('@playwright/test').Page} */ page) {
	const finish = page.locator('#finish');
	for (let i = 0; i < 60 && !(await finish.isVisible()); i++) await page.locator('#next').click();
	await expect(page.getByRole('heading', { level: 1, name: 'Thank you' })).toBeVisible();
}

/** Answer the first item, then go to the finish screen. */
async function answerAndFinish(/** @type {import('@playwright/test').Page} */ page, choice = 'Matches') {
	await page.goto(`/review/?batch=${first.batch_id}`);
	await page.getByRole('button', { name: /Start|Continue/ }).click();
	await page.getByLabel(choice, { exact: true }).check();
	await walkToFinish(page);
}

test('send: one POST, then Send is gone until an answer changes; "Send again" after a change', async ({ page }) => {
	// Walks the whole batch twice (about 45 clicks) plus two axe scans.
	test.setTimeout(90_000);
	const posts = await mockEndpoint(page, () => ({ status: 201, body: '{"ok": true}' }));
	await answerAndFinish(page);
	await expect(page.getByRole('button', { name: 'Download my answers' })).toBeVisible();
	expect(await blocking(page)).toEqual([]);
	await page.getByRole('button', { name: 'Send my answers' }).click();
	await expect(page.locator('#sent-text')).toHaveText('Thanks — your answers for this batch were sent.');
	await expect(page.locator('#sent-text')).toBeFocused();
	await expect(page.getByRole('button', { name: /Send/ })).toHaveCount(0);
	const another = page.getByRole('link', { name: 'Start another batch' });
	await expect(another).toHaveAttribute('href', /^\?batch=b\d\d$/);
	expect(await another.getAttribute('href')).not.toBe(`?batch=${first.batch_id}`);
	expect(await blocking(page)).toEqual([]);
	expect(posts).toHaveLength(1);
	expect(posts[0].body).toMatchObject({ schema: 'betanyc-data-issue/1', tool: 'slam', kind: 'review-answer', batch_id: first.batch_id });
	expect(posts[0].body.answers).toEqual([{ item_id: first.item_ids[0], choice: 'matches' }]);

	// Reloading keeps it marked as sent; going back without changing anything keeps Send hidden.
	await page.reload();
	await page.getByRole('button', { name: 'Continue' }).click();
	await walkToFinish(page);
	await expect(page.locator('#sent-text')).toHaveText('Thanks — your answers for this batch were sent.');
	await expect(page.getByRole('button', { name: /Send/ })).toHaveCount(0);

	// Change an answer: "Send again" appears, and sends the new answers.
	await page.getByRole('button', { name: 'Go back to the items' }).click();
	await page.getByLabel("Can't tell").check();
	await walkToFinish(page);
	await page.getByRole('button', { name: 'Send again' }).click();
	await expect(page.locator('#sent-text')).toHaveText('Thanks — your answers for this batch were sent.');
	expect(posts).toHaveLength(2);
	expect(posts[1].body.answers).toEqual([{ item_id: first.item_ids[0], choice: 'cant_tell' }]);
});

test('send: a 429 says how long to wait from Retry-After, or an hour without it', async ({ page }) => {
	const posts = await mockEndpoint(page, (n) => (n === 1 ? { status: 429, headers: { 'Retry-After': '1200' }, body: '{"ok": false}' } : { status: 429, body: '{"ok": false}' }));
	await answerAndFinish(page);
	await page.getByRole('button', { name: 'Send my answers' }).click();
	await expect(page.getByRole('status')).toContainText('Please try again in 20 minutes.');
	await expect(page.getByRole('status')).toContainText('nothing was sent');
	await expect(page.getByRole('button', { name: 'Send my answers' })).toBeEnabled();
	await expect(page.locator('#sent-box')).toBeHidden();
	await page.getByRole('button', { name: 'Send my answers' }).click();
	await expect(page.getByRole('status')).toContainText('Please try again in about an hour.');
	await expect(page.getByRole('status')).not.toContainText('few minutes');
	expect(posts).toHaveLength(2);
});

test('framed by another site: nothing to click, a plain message instead', async ({ page }) => {
	// The guard reacts to any framing (window.top !== window.self), whatever the origin.
	// Chromium's local network access checks block a test page on another origin from framing
	// 127.0.0.1, so the framing page is mocked on the same server.
	await page.route('http://127.0.0.1:4173/framer.html', (route) =>
		route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>x</title><iframe title="framed" src="http://127.0.0.1:4173/review/?batch=b01" width="800" height="600"></iframe>' })
	);
	await page.goto('/framer.html');
	const frame = page.frameLocator('iframe');
	await expect(frame.getByRole('status')).toContainText('only works when opened directly');
	await expect(frame.locator('#intro')).toBeHidden();
	await expect(frame.locator('#item')).toBeHidden();
	await expect(frame.locator('#finish')).toBeHidden();
	await expect(frame.getByRole('button')).toHaveCount(0);
});
