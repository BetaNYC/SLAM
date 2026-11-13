// The "What's changed" page (BetaNYC What's changed standard, SvelteKit recipe; accessibility
// rules in its section 6). axe and the phone-width check cover it through pages.js; this file
// checks what axe cannot: the page is plain HTML with no SvelteKit client (csr = false), the
// filter script inside the {@html} fragment still runs, the filter works by keyboard and is
// announced, nothing is lost with JavaScript off, and every page links here from its footer.
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { test, expect } from '@playwright/test';
import { pages, ready } from './pages.js';

const PATH = '/whats-changed/';

// Expected counts come from the file's own parse, so adding an entry, an Update line or an
// Unreleased entry never breaks these tests.
const parsed = JSON.parse(
	execFileSync('python3', [resolve('../scripts/whats_changed.py'), 'json', resolve('../WHATS-CHANGED.md')], { encoding: 'utf8' })
);
const ENTRIES = parsed.entries.filter((/** @type {any} */ e) => e.valid);
const CORRECTIONS = ENTRIES.filter((/** @type {any} */ e) => e.tags.includes('Correction')).length;
// Module 1.2.2 leaves the filter out when fewer than two choices remain.
const TAGS_IN_USE = new Set(ENTRIES.flatMap((/** @type {any} */ e) => e.tags.filter((/** @type {string} */ t) => t !== 'Correction')));
const HAS_FILTER = TAGS_IN_USE.size + (CORRECTIONS > 0 ? 1 : 0) >= 2;

test('whats-changed: one h1, landmarks, skip link, dates as <time>', async ({ page }) => {
	await page.goto(PATH);
	await expect(page.locator('h1')).toHaveCount(1);
	await expect(page.locator('h1')).toHaveText("What's changed");
	for (const role of /** @type {const} */ (['banner', 'navigation', 'main', 'contentinfo'])) {
		await expect(page.getByRole(role).first()).toBeAttached();
	}
	await expect(page.locator('a.skip[href="#main"]')).toBeAttached();
	const entries = page.locator('main article.wc-entry');
	await expect(entries).toHaveCount(ENTRIES.length);
	// Every dated entry has a <time> for its date, with the month spelled out. (Update lines may
	// add more; an Unreleased entry has none.)
	for (const e of ENTRIES.filter((/** @type {any} */ e) => !e.unreleased)) {
		const t = page.locator(`[id="${e.anchor}"] time[datetime="${e.date}"]`).first();
		await expect(t).toHaveText(/^[A-Z][a-z]+ \d{1,2}, \d{4}$/);
	}
	// No h2 without an h1 above it, and no skipped level inside an entry.
	await expect(page.locator('main article.wc-entry h3, main article.wc-entry h4')).toHaveCount(0);
});

test('whats-changed: ships with no SvelteKit client, and the fragment script runs', async ({ page }) => {
	await page.goto(PATH);
	// csr = false: no SvelteKit client script on the page.
	expect(await page.locator('script[src], script[type=module]').count()).toBe(0);
	if (HAS_FILTER) {
		// The only script is the fragment's filter script. The filter starts hidden; only that
		// script reveals it, so visible means the script ran.
		await expect(page.locator('script')).toHaveCount(1);
		await expect(page.getByRole('group', { name: 'Show changes to' })).toBeVisible();
		await expect(page.getByRole('status')).toHaveText(`Showing all ${ENTRIES.length} changes.`);
	}
	// The address search needs the client, so it is left out here rather than shown dead.
	await expect(page.getByRole('search')).toHaveCount(0);
});

test('whats-changed: the filter works by keyboard and the live region says what is shown', async ({ page }, info) => {
	test.skip(info.project.name !== 'desktop', 'desktop keyboard only');
	await page.goto(PATH);
	test.skip(!HAS_FILTER || CORRECTIONS === 0, 'no filter, or no "Corrections only" box');
	const total = ENTRIES.length;
	const corrections = CORRECTIONS;
	// One box per tag in use, plus "Corrections only" (module 1.2.2).
	await expect(page.getByRole('group', { name: 'Show changes to' }).getByRole('checkbox')).toHaveCount(TAGS_IN_USE.size + 1);
	const only = page.getByRole('checkbox', { name: 'Corrections only' });
	// Tab from the top until the checkbox has focus, then Space toggles it.
	for (let i = 0; i < 40 && !(await only.evaluate((el) => el === document.activeElement)); i++) {
		await page.keyboard.press('Tab');
	}
	await expect(only).toBeFocused();
	await page.keyboard.press('Space');
	await expect(only).toBeChecked();
	const status = page.getByRole('status');
	await expect(status).toHaveAttribute('aria-live', 'polite');
	await expect(status).toHaveText(`Showing ${corrections} of ${total} changes.`);
	await expect(page.locator('article.wc-entry:visible')).toHaveCount(corrections);
	// Following a link to an entry the filter hides resets the filter and shows it.
	const hiddenId = await page.locator('article.wc-entry[hidden]').first().getAttribute('id');
	await page.evaluate((id) => { location.hash = id; }, /** @type {string} */ (hiddenId));
	await expect(page.locator(`[id="${hiddenId}"]`)).toBeVisible();
	await expect(only).not.toBeChecked();
	await expect(status).toHaveText(`Showing all ${total} changes.`);
});

test('whats-changed: with JavaScript off, every entry shows and there is no dead filter', async ({ browser, baseURL }) => {
	const context = await browser.newContext({ javaScriptEnabled: false });
	const page = await context.newPage();
	await page.goto(`${baseURL}${PATH}`);
	await expect(page.getByRole('group', { name: 'Show changes to' })).toBeHidden();
	await expect(page.locator('article.wc-entry:visible')).toHaveCount(ENTRIES.length);
	await context.close();
});

test('whats-changed: filter controls and permalinks are at least 44px tall', async ({ page }) => {
	await page.goto(PATH);
	for (const el of await page.locator('a.skip, .wc-option, .wc-permalink a').all()) {
		const box = await el.boundingBox();
		expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
	}
});

test('whats-changed: no sideways scroll at 320px wide', async ({ page }) => {
	await page.setViewportSize({ width: 320, height: 800 });
	await page.goto(PATH);
	const { scroll, width } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth }));
	expect(scroll).toBeLessThanOrEqual(width);
});

for (const p of pages()) {
	test(`footer: ${p.name} page links to What's changed`, async ({ page }) => {
		await page.goto(p.path);
		await ready(page, p);
		const link = page.getByRole('contentinfo').getByRole('link', { name: "What's changed" });
		await expect(link).toHaveAttribute('href', /\/whats-changed\/?$/);
	});
}

test('whats-changed: reached from a footer link and by Back, the filter still runs', async ({ page }) => {
	test.skip(!HAS_FILTER, 'no filter: fewer than two choices');
	await page.goto('/about/');
	await page.getByRole('contentinfo').getByRole('link', { name: "What's changed" }).click();
	await expect(page).toHaveURL(/\/whats-changed\/$/);
	await expect(page.getByRole('group', { name: 'Show changes to' })).toBeVisible();
	await page.getByRole('navigation', { name: 'Site' }).getByRole('link', { name: 'Glossary' }).click();
	await expect(page.locator('h1')).toHaveText('Glossary');
	await page.goBack();
	await expect(page).toHaveURL(/\/whats-changed\/$/);
	await expect(page.getByRole('group', { name: 'Show changes to' })).toBeVisible();
	await expect(page.getByRole('status')).toHaveText(/^Showing all \d+ changes\.$/);
});
