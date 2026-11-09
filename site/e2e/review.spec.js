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
