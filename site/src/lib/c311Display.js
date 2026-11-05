/**
 * Three ways to draw 311 complaints on the map, so they can be compared side by side:
 *
 * - "stacks": v1's "stacked chips". One chip per complaint; complaints at the same point are
 *   piled straight up, oldest at the bottom, so a busy address grows a column you can see from
 *   far out. v1 stacked in map meters, so a busy address could run across several streets
 *   (issue #29). Here the step is in screen pixels and a stack stops at STACK_CAP chips, with the
 *   total written above it.
 * - "sized": one circle per point, its area growing with the number of complaints there,
 *   colored by the most common group, with the count inside (the alternative suggested in #29).
 * - "dots": one small dot per complaint (what v2 shipped first). Complaints at one point overlap.
 *
 * Pure functions on the points-311.geojson FeatureCollection (properties d, t, s, aid).
 */
import { C311_GROUPS, c311Group } from './format.js';

export const C311_MODES = [
	{ key: 'stacks', label: 'Stacked chips (like the first SLAM)' },
	{ key: 'sized', label: 'Circles sized by count' },
	{ key: 'dots', label: 'One dot per complaint' }
];
export const STACK_CAP = 12;
export const STACK_STEP_PX = 3;

/** Same point = same coordinates to 6 decimals (about 10 cm), as written by build.py. */
/** @param {number[]} c */
const pointKey = (c) => `${c[0].toFixed(6)},${c[1].toFixed(6)}`;

/**
 * Group complaints by point. Within a point, oldest first (then by type) so stacks are stable.
 * @param {{features: any[]}} fc
 * @returns {{coords: number[], items: any[]}[]}
 */
export function groupByPoint(fc) {
	/** @type {Map<string, {coords: number[], items: any[]}>} */
	const m = new Map();
	for (const f of fc.features) {
		const c = f.geometry?.coordinates;
		if (!c) continue;
		const k = pointKey(c);
		if (!m.has(k)) m.set(k, { coords: c, items: [] });
		/** @type {any} */ (m.get(k)).items.push(f.properties ?? {});
	}
	for (const g of m.values())
		g.items.sort((a, b) => String(a.d ?? '').localeCompare(String(b.d ?? '')) || String(a.t ?? '').localeCompare(String(b.t ?? '')));
	return [...m.values()];
}

/**
 * Chips for the stacked view: one feature per complaint with its stack level `i` (0 = bottom),
 * only for levels below STACK_CAP.
 * @param {{features: any[]}} fc
 */
export function stackChips(fc, cap = STACK_CAP) {
	const features = [];
	for (const p of groupByPoint(fc))
		for (let i = 0; i < Math.min(p.items.length, cap); i++)
			features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: p.coords }, properties: { ...p.items[i], i, n: p.items.length } });
	return { type: 'FeatureCollection', features };
}

/**
 * One feature per point: count `n`, most common group `g` (ties go to the earlier group in
 * C311_GROUPS), the address page id when every complaint there shares one, the street, the
 * newest date, and a readable breakdown by complaint type.
 * @param {{features: any[]}} fc
 */
export function pointSummaries(fc) {
	const features = groupByPoint(fc).map((p) => {
		/** @type {Record<string, number>} */
		const byGroup = {};
		/** @type {Record<string, number>} */
		const byType = {};
		for (const it of p.items) {
			const g = c311Group(it.t).key;
			byGroup[g] = (byGroup[g] ?? 0) + 1;
			byType[it.t ?? '(no type)'] = (byType[it.t ?? '(no type)'] ?? 0) + 1;
		}
		const g = C311_GROUPS.reduce((best, x) => ((byGroup[x.key] ?? 0) > (byGroup[best.key] ?? 0) ? x : best), C311_GROUPS[0]).key;
		const aids = new Set(p.items.map((it) => it.aid ?? ''));
		const types = Object.entries(byType).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t, n]) => `${t}: ${n}`).join('; ');
		return {
			type: 'Feature',
			geometry: { type: 'Point', coordinates: p.coords },
			properties: {
				n: p.items.length,
				g,
				aid: aids.size === 1 ? [...aids][0] : '',
				s: p.items.find((it) => it.s)?.s ?? '',
				d: p.items[p.items.length - 1].d ?? '',
				types
			}
		};
	});
	// Biggest first, so smaller circles draw on top and stay clickable.
	features.sort((a, b) => b.properties.n - a.properties.n);
	return { type: 'FeatureCollection', features };
}

/** MapLibre expression coloring a summary circle by its group key (property `g`). */
export function groupColorExpr() {
	/** @type {any[]} */
	const e = ['match', ['get', 'g']];
	for (const g of C311_GROUPS.slice(0, -1)) e.push(g.key, g.color);
	e.push(C311_GROUPS[C311_GROUPS.length - 1].color);
	return e;
}

/** Circle radius in pixels: area grows with the count (radius with its square root). */
export function sizedRadiusExpr() {
	return ['interpolate', ['linear'], ['sqrt', ['get', 'n']], 1, 4, 4, 9, 10, 18, 20, 28];
}
