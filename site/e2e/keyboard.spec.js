// The map page by keyboard alone (#53, from #51): every control is reached with Tab and shows a
// visible focus ring (WCAG 2.1.1, 2.4.7), the Layers box opens and its controls work, and the
// list view is one link away.
import { test, expect } from '@playwright/test';
import { pages, ready, busiestAddress } from './pages.js';

const map = /** @type {any} */ (pages().find((p) => p.map));

/** Press Tab until `match` has focus, checking each stop has a visible ring and is on screen. */
async function tabTo(/** @type {import('@playwright/test').Page} */ page, /** @type {RegExp} */ match, max = 80) {
	for (let i = 0; i < max; i++) {
		await page.keyboard.press('Tab');
		const f = await page.evaluate(() => {
			const el = /** @type {HTMLElement} */ (document.activeElement);
			const s = getComputedStyle(el);
			const b = el.getBoundingClientRect();
			const name = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim();
			const ring = (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== 'none';
			// WCAG 2.4.11: the focused control is not entirely hidden by something drawn over it.
			const top = document.elementFromPoint(Math.min(Math.max(b.left + b.width / 2, 0), innerWidth - 1), Math.min(Math.max(b.top + b.height / 2, 0), innerHeight - 1));
			const shown = !!top && (top === el || el.contains(top) || top.contains(el) || !!el.closest('label')?.contains(top));
			return { name, ring, shown, tag: el.tagName };
		});
		if (f.tag === 'BODY') continue;
		expect.soft(f.ring, `focus ring on "${f.name}"`).toBe(true);
		expect.soft(f.shown, `"${f.name}" is not covered when focused`).toBe(true);
		if (match.test(f.name)) return;
	}
	throw new Error(`Tab never reached ${match}`);
}

test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'desktop keyboard only'));

test('keyboard: map page, from the top to the Layers box, Reset and a layer', async ({ page }) => {
	await page.goto(map.path);
	await ready(page, map);
	await tabTo(page, /^View as list$/);
	await tabTo(page, /^Layers/);
	const layers = page.locator('details.layers-acc');
	if ((await layers.getAttribute('open')) === null) await page.keyboard.press('Enter');
	await expect(layers).toHaveAttribute('open');
	await tabTo(page, /^Reset to default$/);
	await tabTo(page, /^$/); // the first checkbox in the box, "All liquor layers"
	const before = await page.evaluate(() => /** @type {HTMLInputElement} */ (document.activeElement).checked);
	await page.keyboard.press('Space');
	expect(await page.evaluate(() => /** @type {HTMLInputElement} */ (document.activeElement).checked)).toBe(!before);
	await tabTo(page, /^Map$/); // MapLibre's canvas: arrow keys pan the map
	await tabTo(page, /^Zoom in$/);
});

test('keyboard: the side panel takes focus and its Close button works', async ({ page }) => {
	await page.goto(`${map.path}#sel=${busiestAddress()}`);
	await ready(page, map);
	// Wait for the address to load: the "Loading…" heading is replaced by the real one.
	await expect(page.locator('#panel-h')).not.toHaveText('Loading…');
	await expect(page.locator('#panel-h')).toBeFocused();
	await page.keyboard.press('Shift+Tab');
	await expect(page.getByRole('button', { name: 'Close details' })).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(page.locator('aside.panel')).toHaveCount(0);
});
