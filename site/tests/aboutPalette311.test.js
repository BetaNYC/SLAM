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

test('about and glossary pages: no verdict words; built pages list every source and every glossary anchor', () => {
	const verdict = /\b(violat\w*|meets?|eligib\w*|allowed|complian\w*|prohibit\w*|illegal|legal to)\b/i;
	const glossarySrc = readFileSync('src/routes/glossary/+page.svelte', 'utf8');
	for (const f of ['src/routes/about/+page.svelte', 'src/routes/glossary/+page.svelte'])
		assert.equal(readFileSync(f, 'utf8').match(verdict), null, f);
	// Glossary numbers come from the manifest, not typed into the page.
	assert.match(glossarySrc, /m\.nearby_m/);
	assert.match(glossarySrc, /c311\.start/);
	assert.doesNotMatch(glossarySrc, /2024-01-01|\b150 m(eters)?\b/);
	if (!existsSync('build/about/index.html')) return; // site not built yet (npm test runs before build in CI)
	const html = readFileSync('build/about/index.html', 'utf8');
	const m = JSON.parse(readFileSync('static/data/manifest.json', 'utf8'));
	for (const s of Object.values(m.sources)) assert.ok(html.includes(/** @type {any} */ (s).id), s.id);
	for (const id of ['data-h', 'history-h', 'ai-h', 'tools-h', 'open-data']) assert.ok(html.includes(`id="${id}"`), id);
	assert.match(html.replace(/\s+/g, ' '), /Deepgram is an online speech-to-text service/, 'Deepgram named as an online service');
	assert.ok(existsSync('build/glossary/index.html'), 'glossary page built');
	const g = readFileSync('build/glossary/index.html', 'utf8');
	const ids = [...glossarySrc.matchAll(/<dt id="([^"]+)"/g)].map((x) => x[1]);
	assert.ok(ids.length >= 40, `glossary has ${ids.length} terms`);
	for (const id of ids) assert.ok(g.includes(`id="${id}"`), id);
	for (const id of ['sla', 'lamp', 'bin', 'location-type', 'outdoor-dining', 'c311-at-address', 'c311-nearby', 'count-200', 'count-500', 'same-street'])
		assert.ok(ids.includes(id), id);
	// Every in-page link on the glossary points at an anchor that exists.
	for (const [, id] of g.matchAll(/href="#([^"]+)"/g)) assert.ok(g.includes(`id="${id}"`), `#${id}`);
	assert.ok(g.includes(`${m.nearby_m} meters`), 'nearby distance from the manifest');
	assert.ok(g.includes(m.complaints_311.start), '311 start date from the manifest');
});
