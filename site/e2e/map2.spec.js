// The second district map (#134): axe with the layer panel, stats bar and feedback form open, the
// keyboard path through hiding and showing the panel and stats, a layer toggle and a year, and the
// feedback form's request, sent to a mocked endpoint (page.route) so nothing reaches beta.nyc.
import { test, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { pages, waitForMap } from './pages.js';

const map2 = pages().find((p) => p.name === 'map2');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const ENDPOINT = 'https://www.beta.nyc/wp-json/betanyc-data/v1/report';

test.beforeEach(() => test.skip(!map2, 'no Brooklyn CD 9 in this build'));

/** @param {import('@playwright/test').Page} page */
async function blocking(page) {
	const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
	return r.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? '')).map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`);
}

test('axe: map2 with the panel open, every layer on, and the feedback form open', async ({ page }) => {
	await page.goto(/** @type {any} */ (map2).path);
	await waitForMap(page);
	if (await page.locator('#show-panel').isVisible()) await page.locator('#show-panel').click();
	const off = page.locator('aside.side button.btn[aria-pressed="false"]');
	while (await off.count()) await off.first().click();
	await page.locator('details.about summary').click();
	expect(await blocking(page)).toEqual([]);
	await page.locator('#hide-panel').click(); // on a phone the panel covers the header
	await page.getByRole('button', { name: 'Send feedback' }).click();
	await expect(page.locator('dialog.fb')).toBeVisible();
	expect(await blocking(page)).toEqual([]);
});

test('keyboard: hide and show the panel and stats, toggle a layer, pick a year', async ({ page }, info) => {
	test.skip(info.project.name !== 'desktop', 'desktop keyboard only');
	await page.goto(/** @type {any} */ (map2).path);
	await waitForMap(page);
	const hidePanel = page.locator('#hide-panel');
	await hidePanel.focus();
	await page.keyboard.press('Enter');
	await expect(page.locator('aside.side')).toBeHidden();
	await expect(page.locator('#show-panel')).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(hidePanel).toBeFocused();
	await page.keyboard.press('Tab'); // the first layer: outdoor dining
	const first = page.locator('aside.side button.btn').first();
	await expect(first).toBeFocused();
	await expect(first).toHaveAttribute('aria-pressed', 'true');
	await page.keyboard.press('Space');
	await expect(first).toHaveAttribute('aria-pressed', 'false');
	await page.locator('#hide-stats').focus();
	await page.keyboard.press('Enter');
	await expect(page.locator('section.bar')).toBeHidden();
	await expect(page.locator('#show-stats')).toBeFocused();
	await page.keyboard.press('Enter');
	const year = page.locator('.cols button').first();
	await year.focus();
	await page.keyboard.press('Enter');
	await expect(year).toHaveAttribute('aria-pressed', 'true');
	await expect(page.locator('#y0')).toHaveValue(await page.locator('#y1').inputValue());
});

test('feedback: the form posts a problem report (mocked endpoint)', async ({ page }) => {
	/** @type {any[]} */
	const posts = [];
	await page.route(ENDPOINT, async (route) => {
		posts.push(route.request().postDataJSON());
		await route.fulfill({ status: 201, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{"ok":true}' });
	});
	await page.goto(/** @type {any} */ (map2).path);
	await waitForMap(page);
	await page.getByRole('button', { name: 'Send feedback' }).click();
	await page.getByLabel(/Your feedback/).fill('Test feedback from the browser test.');
	await page.getByLabel(/Your name/).fill('Test');
	await page.locator('dialog.fb button[type=submit]').click();
	await expect(page.locator('dialog.fb [role=status]')).toContainText('Thank you');
	expect(posts).toEqual([
		{ schema: 'betanyc-data-issue/1', tool: 'slam', kind: 'problem-report', page_url: 'https://slam.beta.nyc/bk-cd9/map2/', website: '', credit_ok: false, contact: { name: 'Test' }, record: 'map2-feedback', description: 'Test feedback from the browser test.' }
	]);
});
