// Stacked chips vs sized circles vs dots for 311 complaints (#29 and the v1 "stacked chips").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { groupByPoint, stackChips, pointSummaries, STACK_CAP, STACK_STEP_PX, C311_MODES } from '../src/lib/c311Display.js';
import * as D from '../src/lib/c311Display.js';
import { C311_GROUPS } from '../src/lib/format.js';
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

// ---- 3D chips when the map is tilted (#132, ported from BetaNYC/crash-mapper-nyc#77)

test('tilt: 3D at TILT_ON and above, flat at TILT_OFF and below, no flicker in between', () => {
	assert.equal(D.chipView(0), 'flat');
	assert.equal(D.chipView(D.TILT_ON), '3d');
	assert.equal(D.chipView(60), '3d');
	assert.equal(D.chipView(D.TILT_OFF, '3d'), 'flat');
	const mid = (D.TILT_ON + D.TILT_OFF) / 2;
	assert.equal(D.chipView(mid, '3d'), '3d'); // tilting back down: stays up until TILT_OFF
	assert.equal(D.chipView(mid, 'flat'), 'flat'); // tilting up: stays flat until TILT_ON
	assert.deepEqual([D.TILT_ON, D.TILT_OFF], [10, 5], 'the same lines as Crash Mapper');
});

test('discs: sizes follow the zoom, so a tilted column looks about as tall as a flat stack', () => {
	// MapLibre's world is 512 px at zoom 0: at zoom 15 in New York one pixel is about 1.81 m
	assert.ok(Math.abs(D.metersPerPixel(15) - 1.81) < 0.01);
	assert.ok(Math.abs(D.metersPerPixel(16) * 2 - D.metersPerPixel(15)) < 1e-9);
	const d = D.discSize(16);
	assert.ok(Math.abs(d.r * 2 - 9.05) < 0.1, `disc ${d.r * 2} m across at zoom 16`);
	assert.ok(Math.abs(d.step - (d.h + d.gap)) < 1e-9);
	// A full column in screen pixels: a little taller than the flat stack, since tilting shortens it
	// (sin 55° = 0.82), so on screen the two come out about the same.
	const columnPx = (STACK_CAP * d.step) / D.metersPerPixel(16);
	assert.equal(Math.round(columnPx), STACK_CAP * (D.DISC_HEIGHT_PX + D.DISC_GAP_PX));
	const flat = STACK_CAP * STACK_STEP_PX;
	assert.ok(columnPx >= flat && columnPx * Math.sin((55 * Math.PI) / 180) <= flat * 1.05, `${columnPx} px`);
	assert.ok(D.columnTop(16) > STACK_CAP * d.step, 'the total sits above the top disc');
	assert.ok(Math.abs(D.columnTop(15) - 2 * D.columnTop(16)) < 0.02, 'and scales with the zoom');
});

test('discRing: a closed circle of DISC_SIDES points, r meters from the point', () => {
	const ring = D.discRing(-73.9565, 40.7185, 10);
	assert.equal(ring.length, D.DISC_SIDES + 1);
	assert.deepEqual(ring[0], ring.at(-1));
	const m = (/** @type {number[]} */ a) => Math.hypot((a[0] + 73.9565) * 111320 * Math.cos((40.7185 * Math.PI) / 180), (a[1] - 40.7185) * 111320);
	for (const p of ring) assert.ok(Math.abs(m(p) - 10) < 0.01, `${m(p)} m`);
});

test('stackDiscs: the same chips as stackChips, from the street up, with gaps, stopping at the cap', () => {
	const fc = D.stackDiscs(FC, 16);
	const chips = stackChips(FC);
	assert.equal(fc.features.length, chips.features.length);
	// Same complaints in the same order (oldest at the bottom), same level and total.
	for (const [k, f] of fc.features.entries()) {
		const c = chips.features[k].properties;
		for (const key of ['d', 't', 's', 'aid', 'i', 'n']) assert.equal(f.properties[key], c[key], key);
		assert.equal(f.geometry.type, 'Polygon');
		assert.deepEqual([f.properties.lon, f.properties.lat], chips.features[k].geometry.coordinates, 'the point, for the side panel ring');
	}
	const { h, step } = D.discSize(16);
	const col = fc.features.filter((f) => f.properties.n === 3);
	col.forEach((f, i) => {
		assert.ok(Math.abs(f.properties.b - i * step) < 0.01);
		assert.ok(Math.abs(f.properties.h - (i * step + h)) < 0.01);
		if (i) assert.ok(f.properties.b > col[i - 1].properties.h, 'a gap, so the discs read apart');
	});
	const many = { features: Array.from({ length: STACK_CAP + 5 }, (_, i) => pt(0, 0, { d: `2025-01-${String(i + 1).padStart(2, '0')}`, t: 'Drinking' })) };
	assert.equal(D.stackDiscs(many, 16).features.length, STACK_CAP);
	assert.equal(D.stackDiscs({ features: [] }, 16).features.length, 0);
});

test('shade: the port of MapLibre 6.16 fill-extrusion lighting, worked by hand', () => {
	// mid gray (0.502, 3% ambient added): facing away, (0.502 + 0.03) * (1 - 0.5) = 0.266 -> 0x44;
	// facing the light square on, * max(1 - 0.502 + 0.5, 1) = 1 -> 0x88
	assert.equal(D.shade('#808080', 0), '#444444');
	assert.equal(D.shade('#808080', 1), '#888888');
	// the default light [1.15, 210, 30]: a top meets it at 1.15 cos 30°, a side at most 1.15 sin 30°
	assert.ok(Math.abs(D.TOP_DOT - 0.996) < 0.001);
	assert.ok(Math.abs(D.SIDE_DOT_MAX - 0.575) < 0.001);
});

test('discColor: every group has a darker disc than its chip, and its lit top comes out as the chip color', () => {
	const ch = (/** @type {string} */ h) => /** @type {string[]} */ (h.match(/\w\w/g)).map((x) => parseInt(x, 16));
	for (const g of C311_GROUPS) {
		const disc = D.discColor(g.color);
		const top = ch(D.shade(disc, D.TOP_DOT));
		ch(g.color).forEach((x, k) => {
			// Within 2 of 255 per channel; drinking's blue (3) cannot go under the shader's 3% ambient (8).
			const floor = Math.round(0.03 * D.TOP_DOT * 255);
			assert.ok(Math.abs(top[k] - Math.max(x, floor)) <= 2, `${g.key} channel ${k}: top ${top[k]} vs chip ${x}`);
			assert.ok(ch(disc)[k] <= x, `${g.key} disc darker than its chip`);
		});
	}
	const expr = D.c311DiscColorExpr();
	assert.equal(expr[0], 'match');
	assert.equal(expr.at(-1), D.discColor(C311_GROUPS.at(-1).color), 'other is the fallback, as for the chips');
	assert.equal(expr[expr.indexOf('Drinking') + 1], D.discColor(C311_GROUPS.find((g) => g.key === 'drinking').color));
});
