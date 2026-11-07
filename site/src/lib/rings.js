/**
 * Distance rings around schools and houses of worship on the district map (#111).
 *
 * The rings are grouped by license type, the way the Layers box is (Noel, 2026-11-07): each
 * group has its own ring toggle, and each toggle draws only its own law's rings. The laws are the
 * ones SLAM quotes on /rules/:
 * - Liquor (SLA): about 200 ft around schools and about 200 ft around houses of worship,
 *   ABC Law §64(7)(a).
 * - Cannabis (OCM): about 500 ft around schools (Cannabis Law §72(6)(a)) and about 200 ft around
 *   houses of worship (Cannabis Law §72(6)(b)).
 * - Houses of worship are PLUTO class M1. Other religious property (M2, M3, M4, M9) gets no ring:
 *   PLUTO does not say it is a place of worship, and the address page's cannabis list leaves it
 *   out for the same reason.
 * - The liquor 500-ft rule (§64(7)(b)) is about three or more licensed premises, not schools, so it
 *   is not a ring. It stays as the address page's count.
 *
 * When both toggles are on, a ring the two laws share (same kind of place, same radius: houses of
 * worship at 200 ft today) is drawn once, and its label names both laws. Drawing it twice would put
 * two identical lines and two labels on top of each other.
 *
 * Color and line pattern follow the law, not the place (Noel, 2026-11-07: "make sure that the
 * colors are not overlapping"): liquor rings are a solid navy line (RING_COLOR.liquor, in the
 * liquor family), cannabis rings a dashed green line (RING_COLOR.cannabis, in the cannabis
 * family). A shared ring is drawn as the solid liquor line with the cannabis dashes over it, so it
 * shows both: navy and green alternate along it. Each group's own line is still there with both
 * toggles on, so each group's legend stays true. The pattern, the legend words and the label say
 * the law as well as the color does.
 *
 * The radii are not typed here: the map page passes the manifest's own values (list_ft,
 * cannabis_school_ft, cannabis_worship_ft), the same numbers the address and rules pages use.
 *
 * Circles are computed in the browser from the schools-worship.geojson points the map already
 * loads, so no new data file is needed. Each vertex is a geodesic destination point on a sphere
 * with the mean Earth radius (6,371,008.8 m), the same sphere as #lib/addressSearch.js. At 500 ft
 * the sphere differs from the WGS 84 ellipsoid by well under 1 ft, far less than the
 * building-point error the note warns about.
 */

/** One international foot, exactly. */
export const FT_TO_M = 0.3048;
/** Mean Earth radius, meters (IUGG), as in #lib/addressSearch.js. */
export const EARTH_R_M = 6371008.8;
/** Vertices per circle: smooth at street zooms, small to draw. */
export const RING_STEPS = 64;

/**
 * Ring line colors by license group. Checked against every other map color in
 * tests/mapPalette.test.js; neither matches the school or worship point it surrounds.
 * @type {Record<'liquor' | 'cannabis', string>}
 */
export const RING_COLOR = { liquor: '#14225a', cannabis: '#14947b' };

/** The ring toggle's name in each group of the Layers box. */
export const RING_LAYER_NAME = 'Distance rings (approximate)';

/**
 * The one note for the rings, used on the map (layer and About this map) and in the Glossary.
 * Kept in one place so all three say the same words.
 */
export const RING_NOTE =
	'The laws measure from entrance to entrance, on the same street. SLAM has neither entrance locations nor street logic: each ring is a straight-line circle around a school or house of worship point. A ring is a guide, not a ruling.';

/** Why there is no 500-ft ring for liquor. */
export const RING_NO_LIQUOR_500 =
	'The liquor 500-foot rule (ABC Law §64(7)(b)) is about three or more licensed premises, not schools, so it has no ring. Address pages count those licenses instead.';

/** Where to get the distance without the rings. */
export const RING_LIST_NOTE =
	'Rings are not the only way to see a distance: every address page lists the schools and houses of worship near it, with distances.';

/**
 * The license groups of the Layers box, in order. `layers` are the record sources in the group;
 * `ringKey` is the group's ring toggle in the URL hash and saved preferences (#lib/mapState.js);
 * `short` starts the ring toggle's accessible name, so a screen reader hears
 * "Liquor, Distance rings (approximate)" and "Cannabis, Distance rings (approximate)".
 * @type {readonly {key: 'liquor' | 'cannabis', label: string, short: string, layers: string[], ringKey: string}[]}
 */
export const LICENSE_GROUPS = [
	{ key: 'liquor', label: 'Liquor (SLA)', short: 'Liquor', layers: ['liquor_pending', 'liquor_active', 'liquor_inactive'], ringKey: 'rings_liquor' },
	{ key: 'cannabis', label: 'Cannabis (OCM)', short: 'Cannabis', layers: ['cannabis_retail', 'cannabis_license'], ringKey: 'rings_cannabis' }
];

/**
 * @typedef {{list_ft: number, cannabis_school_ft: number, cannabis_worship_ft: number}} RingFt
 * @typedef {{key: string, k: 'school' | 'worship', ft: number, laws: string[], groups: ('liquor' | 'cannabis')[], label: string}} RingSpec
 */

/** @param {RingFt} ft */
function checkFt(ft) {
	for (const [k, v] of Object.entries({ list_ft: ft?.list_ft, cannabis_school_ft: ft?.cannabis_school_ft, cannabis_worship_ft: ft?.cannabis_worship_ft }))
		if (!(Number.isFinite(v) && /** @type {number} */ (v) > 0)) throw new Error(`ringSpecs: ${k} must be a positive number of feet`);
}

/**
 * One group's own rings, from the manifest's radii, before any merging.
 * @param {RingFt} ft
 * @param {'liquor' | 'cannabis'} group
 * @returns {RingSpec[]}
 */
export function groupRingSpecs(ft, group) {
	checkFt(ft);
	/** @type {Omit<RingSpec, 'label'>[]} */
	let raw;
	if (group === 'liquor')
		raw = [
			{ key: `school-${ft.list_ft}`, k: 'school', ft: ft.list_ft, laws: ['ABC Law §64(7)(a)'], groups: ['liquor'] },
			{ key: `worship-${ft.list_ft}`, k: 'worship', ft: ft.list_ft, laws: ['ABC Law §64(7)(a)'], groups: ['liquor'] }
		];
	else if (group === 'cannabis')
		raw = [
			{ key: `school-${ft.cannabis_school_ft}`, k: 'school', ft: ft.cannabis_school_ft, laws: ['Cannabis Law §72(6)(a)'], groups: ['cannabis'] },
			{ key: `worship-${ft.cannabis_worship_ft}`, k: 'worship', ft: ft.cannabis_worship_ft, laws: ['Cannabis Law §72(6)(b)'], groups: ['cannabis'] }
		];
	else throw new Error(`groupRingSpecs: unknown group ${group}`);
	return raw.map((r) => ({ ...r, label: ringLabel(r) }));
}

/**
 * The rings to draw for the toggles that are on. A ring two groups share (same kind of place,
 * same radius) becomes one ring whose laws and label name both. Liquor comes first.
 * @param {RingFt} ft
 * @param {{liquor?: boolean, cannabis?: boolean}} [on]  default: both
 * @returns {RingSpec[]}
 */
export function ringSpecs(ft, on = { liquor: true, cannabis: true }) {
	checkFt(ft);
	/** @type {Map<string, Omit<RingSpec, 'label'>>} */
	const byKey = new Map();
	for (const g of LICENSE_GROUPS) {
		if (!on?.[g.key]) continue;
		for (const r of groupRingSpecs(ft, g.key)) {
			const had = byKey.get(r.key);
			if (had) byKey.set(r.key, { ...had, laws: [...had.laws, ...r.laws], groups: [...had.groups, ...r.groups] });
			else byKey.set(r.key, { key: r.key, k: r.k, ft: r.ft, laws: r.laws, groups: r.groups });
		}
	}
	return [...byKey.values()].map((r) => ({ ...r, label: ringLabel(r) }));
}

/**
 * One sentence for when both toggles are on and some rings are shared, else ''.
 * @param {RingSpec[]} specs  from ringSpecs
 */
export function ringSharedNote(specs) {
	const shared = specs.filter((r) => r.groups.length > 1);
	if (!shared.length) return '';
	const what = shared.map((r) => `${r.k === 'school' ? 'schools' : 'houses of worship'} at about ${r.ft} ft`).join(' and ');
	return `Where the liquor and cannabis distances are the same (${what}), one ring is drawn: ${RING_SHARED_LINE}, and its label names both laws.`;
}

/** e.g. "School, about 500 ft: Cannabis Law §72(6)(a)". @param {{k: string, ft: number, laws: string[]}} r */
export function ringLabel(r) {
	return `${r.k === 'school' ? 'School' : 'House of worship'}, about ${r.ft} ft: ${r.laws.join(' and ')}`;
}

/** The ring colors and lines in words, the same on the map (About this map) and in the Glossary. */
export const RING_COLOR_NOTE = "A ring's color and line say which law: liquor rings are solid navy lines, cannabis rings are dashed green lines.";

/** How a ring both laws share is drawn, in words. */
export const RING_SHARED_LINE = 'the solid liquor line with the cannabis dashes over it';

/**
 * A ring's line, in words: liquor solid, cannabis dashed, a shared ring both.
 * @param {{groups: string[]}} r
 */
export function ringLine(r) {
	const liq = r.groups.includes('liquor');
	const can = r.groups.includes('cannabis');
	if (liq && can) return 'solid line with dashes over it';
	return can ? 'dashed line' : 'solid line';
}

/** A legend line, e.g. "School, about 500 ft: Cannabis Law §72(6)(a) (dashed line)". @param {RingSpec} r */
export function ringLegendText(r) {
	return `${r.label} (${ringLine(r)})`;
}

/** The short text drawn along a ring on the map, e.g. "500 ft · Cannabis §72(6)(a)". @param {RingSpec} r */
export function ringMapText(r) {
	return `${r.ft} ft · ${r.laws.map((l) => l.replace(/ Law /, ' ')).join(', ')}`;
}

/** Feet to meters. @param {number} ft */
export function ftToM(ft) {
	return ft * FT_TO_M;
}

/**
 * The point `meters` away from [lon, lat] along compass bearing `deg` (great circle, on a sphere).
 * https://www.movable-type.co.uk/scripts/latlong.html ("Destination point given distance and bearing").
 * @param {[number, number]} lonLat @param {number} meters @param {number} deg
 * @returns {[number, number]}
 */
export function destination(lonLat, meters, deg) {
	const toRad = Math.PI / 180;
	const [lon, lat] = lonLat;
	const d = meters / EARTH_R_M;
	const b = deg * toRad;
	const p1 = lat * toRad;
	const l1 = lon * toRad;
	const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
	const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
	return [round6(l2 / toRad), round6(p2 / toRad)];
}

/** @param {number} x */
const round6 = (x) => Math.round(x * 1e6) / 1e6;

/**
 * A closed ring of RING_STEPS vertices, `ft` feet from the center.
 * @param {[number, number]} center @param {number} ft @param {number} [steps]
 * @returns {[number, number][]}
 */
export function circle(center, ft, steps = RING_STEPS) {
	const m = ftToM(ft);
	/** @type {[number, number][]} */
	const pts = [];
	for (let i = 0; i < steps; i++) pts.push(destination(center, m, (360 * i) / steps));
	pts.push(pts[0]);
	return pts;
}

/**
 * One LineString per ring per school or house of worship point. Other religious property and
 * features without a point get none.
 * @param {{features: any[]}} sw  the district's schools-worship.geojson
 * @param {RingSpec[]} specs
 */
export function ringFeatures(sw, specs) {
	const features = [];
	for (const f of sw?.features ?? []) {
		const c = f?.geometry?.type === 'Point' ? f.geometry.coordinates : null;
		if (!Array.isArray(c) || !c.every(Number.isFinite)) continue;
		for (const r of specs) {
			if (r.k !== f.properties?.k) continue;
			features.push({
				type: 'Feature',
				geometry: { type: 'LineString', coordinates: circle(/** @type {[number, number]} */ (c), r.ft) },
				// liq / can pick the line layers: a shared ring has both, so it is drawn solid with dashes over it.
				properties: { k: r.k, ft: r.ft, ring: r.key, liq: r.groups.includes('liquor'), can: r.groups.includes('cannabis'), text: ringMapText(r), name: f.properties.n || f.properties.s || '' }
			});
		}
	}
	return { type: 'FeatureCollection', features };
}
