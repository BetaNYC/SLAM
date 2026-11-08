// Traffic measurement (src/lib/analytics.js; README, "Traffic measurement"). Two checks against the
// built site:
// 1. On the test server (127.0.0.1) the Google tag never loads: no request to Google at all.
// 2. Served as slam.beta.nyc (requests to that host are answered from the test server, and the tag
//    itself is replaced by an empty script, so nothing reaches Google), what is queued for the tag
//    never carries an address, its id, a search or coordinates.
// API: https://playwright.dev/docs/network
import { test, expect } from '@playwright/test';
import { pages, ready, busiestAddress, districts } from './pages.js';

const GOOGLE = /googletagmanager\.com|google-analytics\.com|analytics\.google\.com/;

test('on the test server no request goes to Google, on any page', async ({ page }) => {
	/** @type {string[]} */
	const hits = [];
	page.on('request', (r) => {
		if (GOOGLE.test(r.url())) hits.push(r.url());
	});
	for (const p of pages()) {
		await page.goto(p.path);
		await ready(page, p);
	}
	expect(hits).toEqual([]);
	expect(await page.evaluate(() => /** @type {any} */ (window).dataLayer)).toBeUndefined();
});

test('as slam.beta.nyc: page views are cleaned, and the map hash and address never reach the tag', async ({ page, baseURL }) => {
	/** @type {string[]} */
	const tagLoads = [];
	await page.route(GOOGLE, (route) => {
		tagLoads.push(route.request().url());
		return route.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
	});
	await page.route('https://slam.beta.nyc/**', async (route) => {
		const url = route.request().url().replace('https://slam.beta.nyc', String(baseURL));
		const response = await route.fetch({ url });
		return route.fulfill({ response });
	});

	const id = busiestAddress();
	const d = districts()[0];
	await page.goto(`https://slam.beta.nyc/address/?id=${id}&q=44+Wilson+Ave&m=12#nearby`);
	await ready(page, { address: true });
	const street = (await page.locator('main h1').textContent())?.trim() ?? '';
	expect(street.length).toBeGreaterThan(2);
	expect(await page.title()).toContain(street); // the real title is the street

	// A client-side navigation to the map, which then writes coordinates into its hash.
	await page.evaluate((href) => {
		const a = document.createElement('a');
		a.href = href;
		document.body.appendChild(a);
		a.click();
	}, `/${d}/map/`);
	await page.waitForURL(/\/map\/#v=/, { timeout: 30_000 });

	const queued = await page.evaluate(() => JSON.stringify((/** @type {any} */ (window).dataLayer ?? []).map((/** @type {any} */ a) => Array.from(a))));
	const calls = JSON.parse(queued);
	const views = calls.filter((/** @type {any[]} */ c) => c[0] === 'event' && c[1] === 'page_view').map((/** @type {any[]} */ c) => c[2]);
	expect(views).toEqual([
		{ page_location: 'https://slam.beta.nyc/address/', page_referrer: '', page_title: 'Address — SLAM v2 prototype' },
		{ page_location: `https://slam.beta.nyc/${d}/map/`, page_referrer: 'https://slam.beta.nyc/address/', page_title: expect.stringMatching(/^Map: .+ — SLAM v2 prototype$/) }
	]);
	expect(calls.find((/** @type {any[]} */ c) => c[0] === 'config')).toEqual(['config', 'GT-MQ7Q7VP', { send_page_view: false }]);
	expect(tagLoads).toEqual(['https://www.googletagmanager.com/gtag/js?id=GT-MQ7Q7VP']);
	for (const bad of [id, street, 'Wilson', '#', 'v=']) expect(queued).not.toContain(bad);
});
