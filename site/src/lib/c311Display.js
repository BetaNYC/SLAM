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
import { C311_GROUPS, c311Group, c311ColorExpr } from './format.js';

export const C311_MODES = [
	{ key: 'stacks', label: 'Stacked chips (like the first SLAM)' },
	{ key: 'sized', label: 'Circles sized by count' },
	{ key: 'dots', label: 'One dot per complaint' }
];
export const STACK_CAP = 12;
export const STACK_STEP_PX = 3;

/**
 * How the "dots" mode draws each complaint (#116). Solid, with a thin dark edge like the record
 * dots: at 70% opacity and no edge, noise and other dots came out at 2.3 to 2.5:1 on the City
 * basemap's land, under the 3:1 that WCAG 2.2 SC 1.4.11 asks of graphical objects. The fill
 * carries the contrast on land; the edge carries it on park green and water blue, where no
 * warm 311 color can. The edge stays a full 1 px at every zoom (thinner strokes are
 * anti-aliased toward the basemap and lose the edge on the darker park fields); dense blocks stay
 * readable because the dot itself shrinks when zoomed out, so the dots do not merge into a blob.
 * `radius` is [zoom, px] stops, interpolated linearly and held flat beyond the ends.
 */
export const C311_DOT = {
	edge: '#1f2937',
	edgeWidth: 1,
	opacity: 1,
	radius: /** @type {[number, number][]} */ ([
		[11, 1.75],
		[13, 2.25],
		[16, 3]
	])
};

/** MapLibre paint for the "dots" mode. */
export function c311DotPaint() {
	return {
		'circle-radius': ['interpolate', ['linear'], ['zoom'], ...C311_DOT.radius.flat()],
		'circle-color': c311ColorExpr(),
		'circle-opacity': C311_DOT.opacity,
		'circle-stroke-color': C311_DOT.edge,
		'circle-stroke-width': C311_DOT.edgeWidth
	};
}

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
	return ['interpolate', ['linear'], ['sqrt', ['get', 'n']], 1, 4, 4, 9, 10, 18, 20, 28, 30, 36];
}

// ---- 3D chips when the map is tilted (#132), ported from Crash Mapper (BetaNYC/crash-mapper-nyc#77,
// site/src/lib/parking.js at 418a40c). Looking straight down, the flat chips above stay as they are.
// Tilted, each chip becomes a short disc standing up off the street (a MapLibre fill-extrusion layer),
// one on top of the other with a small gap, so a busy point grows a column that leans and turns with
// the map. Same chips, same order (oldest at the bottom), same colors, same STACK_CAP.
// Read from the MapLibre style spec and GL JS 6.16.0 (SLAM's version, node_modules, 2026-11-20):
// fill-extrusion-base, -height and -color are data-driven, base and height in meters, and the layer
// draws Polygons, so each disc is a small polygon. symbol-height-offset (a layout property, meters)
// lifts the total above a full column. The map fires pitchstart / pitch / pitchend while it tilts;
// getPitch() is in degrees, 0 = straight down, 60 at most by default.

/** Tilt (degrees) at or above which chips stand up as 3D discs, and at or below which they lie flat
 * again. Two numbers, so a map held near the line does not flicker between the two. */
export const TILT_ON = 10;
export const TILT_OFF = 5;

/**
 * '3d' or 'flat' for a pitch, given what is shown now.
 * @param {number} pitch  degrees @param {'3d' | 'flat'} [now]
 * @returns {'3d' | 'flat'}
 */
export function chipView(pitch, now = 'flat') {
	if (pitch >= TILT_ON) return '3d';
	if (pitch <= TILT_OFF) return 'flat';
	return now;
}

/** New York's latitude, for meters per pixel. */
const COS_NYC = Math.cos((40.7 * Math.PI) / 180);

/** Meters per screen pixel at a zoom, in New York: MapLibre's world is 512 px wide at zoom 0. @param {number} zoom */
export function metersPerPixel(zoom) {
	return (40075016.686 * COS_NYC) / (512 * 2 ** zoom);
}

/**
 * Disc sizes, in screen pixels at the zoom they are built for, turned into meters, so a column looks
 * about as big as a flat stack at every zoom (a fixed size in meters would be 2 px wide zoomed out
 * and 70 px zoomed in). Crash Mapper's sizes, chosen in Chrome: a disc 10 px across and 2 px thick
 * with a 1.5 px gap, so 12 discs make a column 42 px tall, a little taller than the flat stack
 * (36 px) because a tilted map shortens anything standing up. With 1 px gaps the discs read as one
 * solid post. The discs are rebuilt when the zoom moves by DISC_REBUILD_ZOOM.
 */
export const DISC_RADIUS_PX = 5;
export const DISC_HEIGHT_PX = 2;
export const DISC_GAP_PX = 1.5;
export const DISC_SIDES = 16;
export const DISC_REBUILD_ZOOM = 0.5;

/** {r, h, gap, step} in meters for discs built at `zoom`. @param {number} zoom */
export function discSize(zoom) {
	const m = metersPerPixel(zoom);
	return { r: DISC_RADIUS_PX * m, h: DISC_HEIGHT_PX * m, gap: DISC_GAP_PX * m, step: (DISC_HEIGHT_PX + DISC_GAP_PX) * m };
}

/**
 * A closed ring of `sides` points, `r` meters around [lon, lat].
 * @param {number} lon @param {number} lat @param {number} r @param {number} [sides]
 */
export function discRing(lon, lat, r, sides = DISC_SIDES) {
	const dLat = r / 111320; // meters in a degree of latitude
	const dLon = dLat / Math.cos((lat * Math.PI) / 180);
	const ring = [];
	for (let j = 0; j < sides; j++) {
		const a = (2 * Math.PI * j) / sides;
		ring.push([lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)]);
	}
	ring.push(ring[0]);
	return ring;
}

/** @param {number} v */
const round2 = (v) => Math.round(v * 100) / 100;

/**
 * The 3D stacks: the same chips as stackChips, one disc per complaint, from the street up, up to
 * the cap. Each disc keeps its complaint's properties (d, t, s, aid) and stack level `i` and the
 * point's total `n`, as a chip does, plus its base `b` and top `h` in meters and the point itself
 * (`lon`, `lat`), since a disc is a polygon and the side panel's ring goes on the point.
 * @param {{features: any[]}} fc @param {number} zoom
 */
export function stackDiscs(fc, zoom, cap = STACK_CAP) {
	const { r, h, step } = discSize(zoom);
	const features = [];
	for (const p of groupByPoint(fc)) {
		const [lon, lat] = p.coords;
		const ring = discRing(lon, lat, r);
		for (let i = 0; i < Math.min(p.items.length, cap); i++) {
			const b = i * step;
			features.push({
				type: 'Feature',
				geometry: { type: 'Polygon', coordinates: [ring] },
				properties: { ...p.items[i], i, n: p.items.length, b: round2(b), h: round2(b + h), lon, lat }
			});
		}
	}
	return { type: 'FeatureCollection', features };
}

/** Height in meters of the total above a full column: just over its top disc. @param {number} zoom */
export const columnTop = (zoom, cap = STACK_CAP) => round2(cap * discSize(zoom).step + 8 * metersPerPixel(zoom));

/** How squarely the top of a disc meets MapLibre's default light: the light sits at [1.15, 210, 30]
 * (radius, azimuth, polar angle), so its height is 1.15 x cos 30° = 0.996, whatever the bearing. A
 * side meets it at 0 (facing away) to 1.15 x sin 30° = 0.575 (facing it). */
export const TOP_DOT = 1.15 * Math.cos((30 * Math.PI) / 180);
export const SIDE_DOT_MAX = 1.15 * Math.sin((30 * Math.PI) / 180);

/** @param {string} hex */
const rgb = (hex) => /** @type {string[]} */ (hex.match(/\w\w/g)).map((x) => parseInt(x, 16) / 255);
/** @param {number[]} c */
const toHex = (c) => '#' + c.map((x) => Math.round(Math.min(1, Math.max(0, x)) * 255).toString(16).padStart(2, '0')).join('');
/** The shader's brightness for a color, before its ambient light is added. @param {number[]} c */
const lum = (c) => c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;

/**
 * The color a disc face is drawn in, as MapLibre GL JS 6.16.0's fill-extrusion vertex shader computes
 * it (read from node_modules/maplibre-gl/dist/maplibre-gl-dev.mjs, 2026-11-20) with the default
 * light: intensity 0.5, white, position [1.15, 210, 30]; neither SLAM basemap sets a light. `dot` is
 * how squarely the face meets the light (TOP_DOT for a top, 0 to SIDE_DOT_MAX for a side). The
 * shader also darkens sides toward the ground (fill-extrusion-vertical-gradient), which only makes
 * them darker than this; the tests check the darkest case too.
 * @param {string} hex @param {number} dot @param {number} [intensity]
 */
export function shade(hex, dot, intensity = 0.5) {
	const c = rgb(hex);
	const value = lum(c);
	const lo = 1 - intensity;
	const hi = Math.max(1 - value + intensity, 1);
	const d = lo + (hi - lo) * dot;
	return toHex(c.map((x) => (x + 0.03) * d));
}

/**
 * The color to give a disc so that its lit top comes out as `hex` (shade() run backwards). The
 * light brightens a top by up to about a quarter, more for a darker color, so each 311 group's disc
 * starts darker than its chip and its top reads as the same color the flat chip has.
 * @param {string} hex
 */
export function discColor(hex) {
	const t = rgb(hex);
	let c = t;
	for (let k = 0; k < 20; k++) {
		const hi = Math.max(1.5 - lum(c), 1);
		const d = 0.5 + (hi - 0.5) * TOP_DOT;
		c = t.map((x) => Math.min(1, Math.max(0, x / d - 0.03)));
	}
	return toHex(c);
}

/** MapLibre expression coloring a disc by its complaint type (property `t`), as c311ColorExpr colors a chip. */
export function c311DiscColorExpr() {
	/** @type {any[]} */
	const e = ['match', ['get', 't']];
	for (const g of C311_GROUPS) for (const t of g.types) e.push(t, discColor(g.color));
	e.push(discColor(C311_GROUPS[C311_GROUPS.length - 1].color));
	return e;
}
