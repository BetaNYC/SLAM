// axe-core checks (#53) on every kind of page, against WCAG 2.0, 2.1 and 2.2 A and AA rules.
// Fails on any serious or critical violation; prints minor and moderate ones as a warning.
// API: https://github.com/dequelabs/axe-core-npm/tree/develop/packages/playwright
import { test, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { pages, ready, waitForMap } from './pages.js';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const BLOCKING = ['serious', 'critical'];

/** @param {import('@playwright/test').Page} page */
async function scan(page) {
	const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
	const lines = results.violations.map(
		(v) => `[${v.impact}] ${v.id}: ${v.help} (${v.nodes.length}) ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`
	);
	if (lines.length) console.log(`${page.url()}\n  ${lines.join('\n  ')}`);
	return results.violations.filter((v) => BLOCKING.includes(v.impact ?? ''));
}

for (const p of pages()) {
	test(`axe: ${p.name} page`, async ({ page }) => {
		await page.goto(p.path);
		await ready(page, p);
		const blocking = await scan(page);
		expect(blocking.map((v) => `${v.id} (${v.impact})`)).toEqual([]);
	});
}

test('axe: map page with the Layers box open, every layer on', async ({ page }) => {
	const map = pages().find((p) => p.map);
	await page.goto(/** @type {any} */ (map).path);
	await waitForMap(page);
	const layers = page.locator('details.layers-acc');
	if (!(await layers.evaluate((d) => /** @type {HTMLDetailsElement} */ (d).open))) await layers.locator('summary').click();
	for (const box of await page.locator('fieldset.layers input[type=checkbox]').all()) {
		if (!(await box.isChecked())) await box.check();
	}
	await page.locator('details.map-about summary').click();
	const blocking = await scan(page);
	expect(blocking.map((v) => `${v.id} (${v.impact})`)).toEqual([]);
});
