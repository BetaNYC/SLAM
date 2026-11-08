// #53: accessibility helpers that run without a browser. The browser checks (axe, keyboard,
// phone sizes) are in e2e/ and run with `npm run test:a11y` after a build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { scrollRegionLabel, syncScrollRegion } from '../src/lib/scrollRegion.js';
import { initialLayersOpen, NARROW_QUERY, MAP_DEFAULTS } from '../src/lib/mapState.js';

/** A stand-in for a `.table-scroll` box. */
function box(/** @type {{scrollWidth: number, clientWidth: number, caption?: string}} */ o) {
	/** @type {Record<string, string>} */
	const attrs = {};
	return {
		attrs,
		scrollWidth: o.scrollWidth,
		clientWidth: o.clientWidth,
		querySelector: (/** @type {string} */ s) => (s === 'caption' && o.caption !== undefined ? { textContent: o.caption } : null),
		setAttribute: (/** @type {string} */ k, /** @type {string} */ v) => (attrs[k] = v),
		removeAttribute: (/** @type {string} */ k) => delete attrs[k]
	};
}

test('a table box that scrolls sideways gets a tab stop, a region role and a name', () => {
	const b = box({ scrollWidth: 700, clientWidth: 328, caption: ' Pending applications (SLA)\n\t (43) ' });
	assert.equal(syncScrollRegion(b), true);
	assert.deepEqual(b.attrs, { tabindex: '0', role: 'region', 'aria-label': 'Pending applications (SLA) (43) (scrolls sideways)' });
});

test('a table box that fits gets no tab stop, and loses one it had', () => {
	const b = box({ scrollWidth: 700, clientWidth: 328, caption: 'x' });
	syncScrollRegion(b);
	b.clientWidth = 700;
	assert.equal(syncScrollRegion(b), false);
	assert.deepEqual(b.attrs, {});
});

test('the name falls back to a given label, then to "Table"', () => {
	assert.equal(scrollRegionLabel(box({ scrollWidth: 0, clientWidth: 0 }), 'Records at this address'), 'Records at this address (scrolls sideways)');
	assert.equal(scrollRegionLabel(box({ scrollWidth: 0, clientWidth: 0 })), 'Table (scrolls sideways)');
});

test('every scrolling table box in the site uses the scrollRegion action', () => {
	/** @param {string} dir @returns {string[]} */
	const walk = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
	const bare = [];
	for (const f of walk('src').filter((f) => f.endsWith('.svelte'))) {
		for (const m of readFileSync(f, 'utf8').matchAll(/<div class="table-scroll"[^>]*>/g)) if (!m[0].includes('use:scrollRegion')) bare.push(`${f}: ${m[0]}`);
	}
	assert.deepEqual(bare, []);
});

test('the Layers box starts closed on a phone, open on a wide screen, and a saved choice wins', () => {
	assert.equal(initialLayersOpen(null, false), MAP_DEFAULTS.open);
	assert.equal(initialLayersOpen(null, true), false);
	assert.equal(initialLayersOpen({ open: true }, true), true);
	assert.equal(initialLayersOpen({ open: false }, false), false);
	assert.match(NARROW_QUERY, /max-width/);
	const src = readFileSync('src/routes/[district]/map/+page.svelte', 'utf8');
	assert.match(src, /layersOpen = initialLayersOpen\(prefs, window\.matchMedia\?\.\(NARROW_QUERY\)\.matches \?\? false\);/);
});
