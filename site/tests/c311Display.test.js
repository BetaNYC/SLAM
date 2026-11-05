// Stacked chips vs sized circles vs dots for 311 complaints (#29 and the v1 "stacked chips").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { groupByPoint, stackChips, pointSummaries, STACK_CAP, C311_MODES } from '../src/lib/c311Display.js';
import { popup311Point } from '../src/lib/popup311.js';

const pt = (x, y, props) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [x, y] }, properties: props });
const FC = {
	type: 'FeatureCollection',
	features: [
		pt(-73.9, 40.7, { d: '2025-03-01', t: 'Noise - Commercial', s: '1 MAIN ST', aid: 'a1' }),
		pt(-73.9, 40.7, { d: '2024-01-05', t: 'Drinking', s: '1 MAIN ST', aid: 'a1' }),
		pt(-73.9, 40.7, { d: '2025-01-01', t: 'Noise - Commercial', s: '1 MAIN ST', aid: 'a1' }),
		pt(-73.8, 40.6, { d: '2024-06-01', t: 'Outdoor Dining', s: '', aid: '' })
	]
};

test('modes: stacks first (v1 default), then sized circles, then dots', () => {
	assert.deepEqual(C311_MODES.map((m) => m.key), ['stacks', 'sized', 'dots']);
});

test('groupByPoint groups by coordinates and sorts oldest first', () => {
	const g = groupByPoint(FC);
	assert.equal(g.length, 2);
	assert.deepEqual(g[0].items.map((i) => i.d), ['2024-01-05', '2025-01-01', '2025-03-01']);
});

test('stackChips numbers each chip from the bottom and stops at the cap', () => {
	const c = stackChips(FC);
	assert.deepEqual(c.features.filter((f) => f.properties.n === 3).map((f) => f.properties.i), [0, 1, 2]);
	const many = { features: Array.from({ length: STACK_CAP + 5 }, (_, i) => pt(0, 0, { d: `2025-01-${String(i + 1).padStart(2, '0')}`, t: 'Drinking' })) };
	const cm = stackChips(many);
	assert.equal(cm.features.length, STACK_CAP);
	assert.equal(cm.features[0].properties.n, STACK_CAP + 5);
});

test('pointSummaries counts, picks the most common group, keeps a shared address page', () => {
	const s = pointSummaries(FC).features;
	assert.equal(s[0].properties.n, 3); // biggest first
	assert.equal(s[0].properties.g, 'noise');
	assert.equal(s[0].properties.aid, 'a1');
	assert.equal(s[0].properties.d, '2025-03-01');
	assert.equal(s[0].properties.types, 'Noise - Commercial: 2; Drinking: 1');
	assert.equal(s[1].properties.g, 'dining');
});

test('pointSummaries leaves aid blank when complaints at one point have different pages', () => {
	const fc = { features: [pt(0, 0, { t: 'Drinking', aid: 'a' }), pt(0, 0, { t: 'Drinking', aid: 'b' })] };
	assert.equal(pointSummaries(fc).features[0].properties.aid, '');
});

test('popup311Point writes text nodes, not HTML', () => {
	if (typeof document === 'undefined') {
		const made = [];
		const el = () => ({ textContent: '', children: [], append(...k) { this.children.push(...k); } });
		const doc = { createElement: () => { const e = el(); made.push(e); return e; }, createTextNode: (t) => ({ text: t }) };
		const div = popup311Point({ n: 2, s: '<b>x</b>', d: '2025-01-01', types: 'Drinking: 2' }, /** @type {any} */ (doc));
		assert.equal(div.children.length, 4);
		assert.equal(div.children[1].children[1].text, '<b>x</b>');
	}
});

test('real data: every 311 point summary adds back up to the complaint count', () => {
	for (const slug of ['mn-cd1', 'bk-cd4']) {
		const f = `static/data/${slug}/points-311.geojson`;
		if (!existsSync(f)) continue;
		const fc = JSON.parse(readFileSync(f, 'utf8'));
		const s = pointSummaries(fc).features;
		assert.equal(s.reduce((a, x) => a + x.properties.n, 0), fc.features.length, slug);
	}
});
