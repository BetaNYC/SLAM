// #71 About page, #72 BetaNYC palette, #73 311 types aligned with v1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { C311_GROUPS, c311Group, c311ColorExpr, SOURCE_COLOR } from '../src/lib/format.js';

test('311 groups follow v1: commercial noise, drinking, outdoor dining, then other', () => {
	assert.deepEqual(C311_GROUPS.map((g) => g.key), ['noise', 'drinking', 'dining', 'other']);
	assert.equal(c311Group('Noise - Commercial').key, 'noise');
	assert.equal(c311Group('Drinking').key, 'drinking');
	assert.equal(c311Group('Outdoor Dining').key, 'dining');
	assert.equal(c311Group('Food Poisoning').key, 'other');
	assert.equal(c311Group(undefined).key, 'other');
	assert.equal(new Set(C311_GROUPS.map((g) => g.color)).size, C311_GROUPS.length);
});

test('311 map color expression maps each type and falls back to "other"', () => {
	const e = c311ColorExpr();
	assert.deepEqual(e.slice(0, 2), ['match', ['get', 't']]);
	assert.equal(e[e.indexOf('Drinking') + 1], c311Group('Drinking').color);
	assert.equal(e[e.length - 1], C311_GROUPS[3].color);
});

test('site chrome uses BetaNYC Blue #2359a8, not the old brighter blue', () => {
	const css = readFileSync('src/routes/app.css', 'utf8').toLowerCase();
	assert.match(css, /--blue:\s*#2359a8/);
	assert.match(css, /--ink:\s*#414141/);
	assert.equal(SOURCE_COLOR.liquor_active.toLowerCase(), '#2359a8');
	for (const f of ['src/routes/app.css', 'src/lib/format.js', 'src/routes/[district]/map/+page.svelte'])
		assert.doesNotMatch(readFileSync(f, 'utf8').toLowerCase(), /#1a5ccf|#0f3f94/, f);
});

test('about page: no verdict words; the built page lists every source and the glossary', () => {
	const src = readFileSync('src/routes/about/+page.svelte', 'utf8');
	const verdict = /\b(violat\w*|meets?|eligib\w*|allowed|complian\w*|prohibit\w*|illegal|legal to)\b/i;
	assert.equal(src.match(verdict), null);
	if (!existsSync('build/about/index.html')) return; // site not built yet (npm test runs before build in CI)
	const html = readFileSync('build/about/index.html', 'utf8');
	const m = JSON.parse(readFileSync('static/data/manifest.json', 'utf8'));
	for (const s of Object.values(m.sources)) assert.ok(html.includes(/** @type {any} */ (s).id), s.id);
	for (const id of ['glossary', 'sla', 'lamp', 'bin', 'location-type', 'outdoor-dining']) assert.ok(html.includes(`id="${id}"`), id);
});
