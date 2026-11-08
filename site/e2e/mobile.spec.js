// Phone layout (#53), at 360 x 800 and 390 x 844: nothing wider than the screen, wide tables
// scroll inside their own box, and the map is on the first screen with a way to open the Layers box.
import { test, expect } from '@playwright/test';
import { pages, ready } from './pages.js';

test.beforeEach(({}, info) => test.skip(info.project.name === 'desktop', 'phone sizes only'));

for (const p of pages()) {
	test(`phone: ${p.name} page is no wider than the screen`, async ({ page }) => {
		await page.goto(p.path);
		await ready(page, p);
		const { scroll, width } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth }));
		expect(scroll).toBeLessThanOrEqual(width);
	});
}

test('phone: wide tables scroll in a box that the keyboard can reach', async ({ page }) => {
	await page.goto(pages().find((p) => p.name === 'district')?.path ?? '/');
	const box = page.locator('.table-scroll').first();
	const { scroll, client } = await box.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
	expect(scroll).toBeGreaterThan(client);
	await expect(box).toHaveAttribute('tabindex', '0');
	await expect(box).toHaveAttribute('role', 'region');
	await expect(box).toHaveAttribute('aria-label', /scrolls sideways/);
});

test('phone: the map starts with the Layers box closed and the map on the first screen', async ({ page }) => {
	const map = pages().find((p) => p.map);
	await page.goto(/** @type {any} */ (map).path);
	await ready(page, map);
	const layers = page.locator('details.layers-acc');
	await expect(layers).not.toHaveAttribute('open');
	const top = await page.locator('.map').evaluate((el) => el.getBoundingClientRect().top);
	expect(top).toBeLessThan(page.viewportSize()?.height ?? 0);
	await layers.locator('summary').click();
	await expect(layers).toHaveAttribute('open');
	await expect(page.getByRole('button', { name: 'Reset to default' })).toBeVisible();
});

test('phone: the side panel sits under the map and can be closed', async ({ page }) => {
	const map = pages().find((p) => p.map);
	const { busiestAddress } = await import('./pages.js');
	await page.goto(`${/** @type {any} */ (map).path}#sel=${busiestAddress()}`);
	await ready(page, map);
	const panel = page.locator('aside.panel');
	await expect(panel).toBeVisible();
	const [mapBox, panelBox] = await Promise.all([page.locator('.map').boundingBox(), panel.boundingBox()]);
	expect(panelBox?.y ?? 0).toBeGreaterThanOrEqual((mapBox?.y ?? 0) + (mapBox?.height ?? 0) - 1);
	await page.getByRole('button', { name: 'Close details' }).click();
	await expect(panel).toHaveCount(0);
});
