// The pages the browser tests visit (#53). Address ids change with each data run, so the
// address page uses the address with the most records in the built data.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect } from '@playwright/test';

const DATA = resolve('build/data');

/** The district slugs in this build, from the manifest. */
export function districts() {
	const m = JSON.parse(readFileSync(resolve(DATA, 'manifest.json'), 'utf8'));
	return Object.keys(m.districts);
}

/** The address id with the largest JSON file: the busiest page, so the most to check. */
export function busiestAddress() {
	const dir = resolve(DATA, 'address');
	let best = '';
	let size = -1;
	for (const f of readdirSync(dir)) {
		if (!f.endsWith('.json') || f === 'index.json') continue;
		const s = statSync(resolve(dir, f)).size;
		if (s > size) [best, size] = [f.replace(/\.json$/, ''), s];
	}
	return best;
}

/** Wait until the map page's status line says the map loaded (or could not). */
export async function waitForMap(/** @type {import('@playwright/test').Page} */ page) {
	// The status line changes as layers load; wait until nothing says "Loading", then for quiet.
	await expect(page.getByRole('status').first()).not.toHaveText(/^\s*Loading/, { timeout: 30_000 });
	await page.waitForLoadState('networkidle');
}

/** Wait until the address page has fetched its address and drawn it. */
export async function waitForAddress(/** @type {import('@playwright/test').Page} */ page) {
	await expect(page.getByText('Loading this address…')).toHaveCount(0, { timeout: 15_000 });
	await expect(page.locator('main h1')).not.toHaveText(/^Address$/);
}

/** Wait for whatever the page loads after it opens. */
export async function ready(/** @type {import('@playwright/test').Page} */ page, /** @type {any} */ p) {
	if (p.map) await waitForMap(page);
	else if (p.address) await waitForAddress(page);
	else await page.waitForLoadState('networkidle');
}

export function pages() {
	const d = districts()[0];
	return [
		{ name: 'home', path: '/' },
		{ name: 'district', path: `/${d}/` },
		{ name: 'address', path: `/address/?id=${busiestAddress()}`, address: true },
		{ name: 'map', path: `/${d}/map/`, map: true },
		{ name: 'about', path: '/about/' },
		{ name: 'glossary', path: '/glossary/' },
		{ name: 'rules', path: '/rules/' }
	];
}
