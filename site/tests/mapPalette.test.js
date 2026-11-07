// #111 color revision (Noel, 2026-11-07, on the map preview: "make sure that the colors are not
// overlapping, so that way it's not confusing"). One palette for everything the district map can
// show at once: record dots, 311 dots, school and worship points, distance rings, district line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SOURCE_COLOR, SOURCE_HOLLOW, C311_GROUPS, SW_COLOR } from '../src/lib/format.js';
import { RING_COLOR, RING_COLOR_NOTE, LICENSE_GROUPS } from '../src/lib/rings.js';
import { ciede2000, deltaE, contrast, simulate, hexToOklch, hexToLab, VISIONS, CVD_MATRICES } from './helpers/colorMetrics.js';

const MAP = 'src/routes/[district]/map/+page.svelte';
const mapSrc = readFileSync(MAP, 'utf8');

/**
 * Every color that can be on the map at the same time, with the kind of mark it is drawn as.
 * Marks of one kind look alike apart from color, so they must stay apart under color-vision
 * deficiency too. Marks of different kinds already differ by shape or size:
 * - `dot`: record dots (r 5, white ring, dark edge) and school / worship points (r 6, white ring);
 * - `small`: 311 complaints, 3 to 3.5 px dots or count circles;
 * - `line`: distance rings and the district outline.
 * @type {{name: string, color: string, mark: 'dot' | 'small' | 'line'}[]}
 */
const RECORD_LAYERS = ['liquor_pending', 'liquor_active', 'liquor_inactive', 'cannabis_retail', 'cannabis_license', 'dining_out'];
const DISTRICT_LINE = '#2359a8';
const ON_TOGETHER = [
	...RECORD_LAYERS.map((k) => ({ name: k, color: SOURCE_COLOR[k], mark: /** @type {const} */ ('dot') })),
	...Object.entries(SW_COLOR).map(([k, c]) => ({ name: `sw_${k}`, color: c, mark: /** @type {const} */ ('dot') })),
	...C311_GROUPS.map((g) => ({ name: `c311_${g.key}`, color: g.color, mark: /** @type {const} */ ('small') })),
	...Object.entries(RING_COLOR).map(([k, c]) => ({ name: `ring_${k}`, color: c, mark: /** @type {const} */ ('line') })),
	{ name: 'district_line', color: DISTRICT_LINE, mark: /** @type {const} */ ('line') }
];

/** Thresholds, CIEDE2000. */
const ALL_PAIRS_NORMAL = 15; // any two colors on the map at once, normal vision
const SAME_MARK_NORMAL = 18; // look-alike marks, normal vision
const SAME_MARK_CVD = 10; // look-alike marks, each simulated deficiency
// The one look-alike pair allowed below SAME_MARK_CVD: pending vs active liquor (same family by
// design). Pending is an open circle on the map, so shape carries it; the floor still applies.
const SHAPE_CUE_PAIRS = { 'liquor_pending|liquor_active': 8 };

/** Basemap surfaces a mark can sit on, from the styles' own paint values. */
const SURFACES = {
	white: '#ffffff', // every mark's casing or ring
	city_land: '#F5F0EA', // tests/fixtures/city_basemap_root.json, Land/Land_NYC
	city_roadbed: '#EDECEB', // same file, Roadbeds/Roadbed/0
	openfreemap_background: '#f8f4f0' // https://tiles.openfreemap.org/styles/liberty, layer "background" (read 2026-11-07)
};

/** Pruned BetaNYC colors, archive/betanyc/brand.md § Pruned (do not use). */
const PRUNED = ['#717171', '#3a57e8', '#0693e3', '#9261c6', '#27808c', '#25d6a2', '#30b4da', '#7d6043', '#fcb900', '#ff6900', '#f78550', '#c74a73', '#cf2e2e', '#9b51e0'];

function pairs() {
	const out = [];
	for (let i = 0; i < ON_TOGETHER.length; i++) for (let j = i + 1; j < ON_TOGETHER.length; j++) out.push([ON_TOGETHER[i], ON_TOGETHER[j]]);
	return out;
}

test('CIEDE2000 helper reproduces Sharma, Wu and Dalal (2005) Table 1', () => {
	/** @type {[[number, number, number], [number, number, number], number][]} pairs 1, 2, 3, 7, 17-20, 25 */
	const rows = [
		[[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
		[[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
		[[50, 2.8361, -74.02], [50, 0, -82.7485], 3.4412],
		[[50, 0, 0], [50, -1, 2], 2.3669],
		[[50, 2.5, 0], [73, 25, -18], 27.1492],
		[[50, 2.5, 0], [61, -5, 29], 22.8977],
		[[50, 2.5, 0], [56, -27, -3], 31.903],
		[[50, 2.5, 0], [58, 24, 15], 19.4535],
		[[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644]
	];
	for (const [a, b, want] of rows) {
		assert.ok(Math.abs(ciede2000(a, b) - want) < 1e-4, `${a} ${b}: ${ciede2000(a, b)} vs ${want}`);
		assert.ok(Math.abs(ciede2000(b, a) - want) < 1e-4, 'symmetric');
	}
	// sRGB white is L* 100, a* = b* = 0 under D65.
	const [L, a, b] = hexToLab('#ffffff');
	assert.ok(Math.abs(L - 100) < 0.01 && Math.abs(a) < 0.01 && Math.abs(b) < 0.01);
});

test('CVD simulation: Machado 2009 matrices keep grays gray and collapse red and green', () => {
	for (const [v, m] of Object.entries(CVD_MATRICES)) for (const row of m) assert.ok(Math.abs(row[0] + row[1] + row[2] - 1) < 0.002, `${v} row sums to 1`);
	for (const v of VISIONS) assert.deepEqual(simulate('#808080', v).map((x) => x.toFixed(3)), simulate('#808080', 'normal').map((x) => x.toFixed(3)), v);
	// Pure red and pure green: far apart normally, much closer for protanopia and deuteranopia.
	assert.ok(deltaE('#ff0000', '#00ff00') > 80);
	assert.ok(deltaE('#ff0000', '#00ff00', 'deuteranopia') < deltaE('#ff0000', '#00ff00') / 2);
	assert.ok(deltaE('#ff0000', '#00ff00', 'protanopia') < deltaE('#ff0000', '#00ff00') / 2);
});

test('palette: every pair on the map at once is CIEDE2000 >= 15 apart (normal vision)', (t) => {
	let worst = { d: Infinity, pair: '' };
	for (const [a, b] of pairs()) {
		// The one deliberate repeat: BetaNYC Blue is the active-liquor dot and the district outline,
		// a dot and a long boundary line, never mistaken for each other.
		if (a.name === 'liquor_active' && b.name === 'district_line') continue;
		const d = deltaE(a.color, b.color);
		if (d < worst.d) worst = { d, pair: `${a.name} / ${b.name}` };
		assert.ok(d >= ALL_PAIRS_NORMAL, `${a.name} ${a.color} vs ${b.name} ${b.color}: ${d.toFixed(1)}`);
	}
	t.diagnostic(`min all-pairs normal ΔE00 ${worst.d.toFixed(1)} (${worst.pair})`);
});

test('palette: look-alike marks stay apart normally and under protanopia, deuteranopia and tritanopia', (t) => {
	for (const v of VISIONS) {
		let worst = { d: Infinity, pair: '' };
		for (const [a, b] of pairs()) {
			if (a.mark !== b.mark) continue;
			const d = deltaE(a.color, b.color, v);
			if (d < worst.d) worst = { d, pair: `${a.name} / ${b.name}` };
			const key = `${a.name}|${b.name}`;
			const floor = v === 'normal' ? SAME_MARK_NORMAL : (SHAPE_CUE_PAIRS[/** @type {keyof typeof SHAPE_CUE_PAIRS} */ (key)] ?? SAME_MARK_CVD);
			assert.ok(d >= floor, `${v}: ${a.name} ${a.color} vs ${b.name} ${b.color}: ${d.toFixed(1)} < ${floor}`);
		}
		t.diagnostic(`min same-mark ${v} ΔE00 ${worst.d.toFixed(1)} (${worst.pair})`);
	}
});

test('the pair kept close by design has a shape cue: pending liquor is an open circle on the map and in the legend', () => {
	assert.deepEqual(SOURCE_HOLLOW, ['liquor_pending']);
	assert.match(mapSrc, /paint: SOURCE_HOLLOW\.includes\(k\)\s*\? \{ 'circle-radius': 4, 'circle-color': '#fff', 'circle-stroke-color': SOURCE_COLOR\[k\], 'circle-stroke-width': 2\.5 \}/);
	assert.match(mapSrc, /class:hollow=\{SOURCE_HOLLOW\.includes\(k\)\}/);
	assert.match(mapSrc, /\.swatch\.hollow \{ background: #fff; border: 2\.5px solid var\(--c\)/);
	// Open circle: same outer size as a filled dot (radius + stroke).
	assert.equal(4 + 2.5, 5 + 1.5);
});

test('contrast: every mark >= 3:1 on white and the light basemaps; record colors carry white badge text at >= 4.5:1', () => {
	for (const m of ON_TOGETHER)
		for (const [s, bg] of Object.entries(SURFACES)) assert.ok(contrast(m.color, bg) >= 3, `${m.name} ${m.color} on ${s}: ${contrast(m.color, bg).toFixed(2)}`);
	for (const k of RECORD_LAYERS) assert.ok(contrast(SOURCE_COLOR[k], '#ffffff') >= 4.5, `${k} badge text`);
	assert.match(readFileSync('src/routes/app.css', 'utf8'), /\.badge \{[^}]*color: #fff/);
});

test('group logic: liquor is blue to violet (or a cool gray), cannabis is green, 311 is warm; rings follow their law', () => {
	/** @param {string} hex @param {[number, number]} range */
	const inHue = (hex, [lo, hi]) => {
		const [, C, h] = hexToOklch(hex);
		return C >= 0.05 && h >= lo && h <= hi;
	};
	/** @param {string} hex */
	const coolGray = (hex) => {
		const [, C, h] = hexToOklch(hex);
		return C < 0.05 && h >= 220 && h <= 300;
	};
	const LIQUOR = /** @type {[number, number]} */ ([240, 310]);
	const CANNABIS = /** @type {[number, number]} */ ([120, 175]);
	const WARM = /** @type {[number, number]} */ ([20, 80]);
	assert.equal(SOURCE_COLOR.liquor_active.toLowerCase(), '#2359a8', 'BetaNYC Blue');
	for (const k of LICENSE_GROUPS[0].layers) assert.ok(inHue(SOURCE_COLOR[k], LIQUOR) || coolGray(SOURCE_COLOR[k]), k);
	for (const k of LICENSE_GROUPS[1].layers) assert.ok(inHue(SOURCE_COLOR[k], CANNABIS), k);
	for (const g of C311_GROUPS.slice(0, -1)) assert.ok(inHue(g.color, WARM), g.key);
	assert.ok(hexToOklch(C311_GROUPS[C311_GROUPS.length - 1].color)[1] < 0.05, '311 other is a gray');
	assert.equal(SOURCE_COLOR.complaints_311, C311_GROUPS[0].color);
	assert.ok(inHue(RING_COLOR.liquor, LIQUOR), 'liquor ring');
	assert.ok(inHue(RING_COLOR.cannabis, CANNABIS), 'cannabis ring');
	// Nothing outside the liquor group is liquor-blue, nothing outside cannabis is cannabis-green.
	const notLiquor = [SOURCE_COLOR.dining_out, ...Object.values(SW_COLOR), ...C311_GROUPS.map((g) => g.color), ...LICENSE_GROUPS[1].layers.map((k) => SOURCE_COLOR[k]), RING_COLOR.cannabis];
	for (const c of notLiquor) assert.ok(!inHue(c, LIQUOR), `${c} is not in the liquor hues`);
	const notCannabis = [SOURCE_COLOR.dining_out, ...Object.values(SW_COLOR), ...C311_GROUPS.map((g) => g.color), ...LICENSE_GROUPS[0].layers.map((k) => SOURCE_COLOR[k]), RING_COLOR.liquor];
	for (const c of notCannabis) assert.ok(!inHue(c, CANNABIS), `${c} is not in the cannabis hues`);
	// The district outline is BetaNYC Blue, and the liquor ring is not the same line.
	assert.match(mapSrc, /id: 'district-line', type: 'line', source: 'district', paint: \{ 'line-color': '#2359a8'/);
	assert.ok(deltaE(RING_COLOR.liquor, DISTRICT_LINE) >= SAME_MARK_NORMAL);
});

test('rings are colored by license type, never by the place they surround', () => {
	for (const ring of Object.values(RING_COLOR))
		for (const place of [SW_COLOR.school, SW_COLOR.worship]) assert.ok(deltaE(ring, place) >= ALL_PAIRS_NORMAL, `${ring} vs ${place}`);
	assert.doesNotMatch(mapSrc, /'line-color': \['match', \['get', 'k'\]/);
});

test('brand: BetaNYC Blue and Dark Gray where they fit, no pruned colors, no repeated colors', () => {
	assert.equal(SW_COLOR.school.toLowerCase(), '#414141', 'bnyc-dark-gray');
	const all = ON_TOGETHER.map((m) => m.color.toLowerCase());
	for (const c of all) assert.ok(!PRUNED.includes(c), `${c} is pruned in brand.md`);
	assert.equal(new Set(all).size, all.length - 1, 'only BetaNYC Blue repeats (active liquor dot and district line)');
});

test('the words match the colors: About this map, the ring note and the legends', () => {
	const about = mapSrc.slice(mapSrc.indexOf('<summary>About this map</summary>'));
	assert.match(about, /Schools \(dark gray\), houses of worship \(light purple\) and other religious property \(tan\)/);
	assert.match(about, /liquor layers are blue, violet and gray \(pending applications are open\s+circles\), cannabis layers are green, Dining Out is raspberry, and 311 complaints are orange, red, brown\s+and gray-green/);
	assert.match(about, /\{RING_COLOR_NOTE\}/);
	assert.doesNotMatch(about, /\(teal\)|dark pink|\(violet\)/, 'old color words gone');
	// The words describe the actual colors.
	const lch = (/** @type {string} */ c) => hexToOklch(c);
	assert.ok(lch(SW_COLOR.school)[1] < 0.02 && lch(SW_COLOR.school)[0] < 0.45, 'school is dark gray');
	assert.ok(lch(SW_COLOR.worship)[2] > 290 && lch(SW_COLOR.worship)[2] < 340 && lch(SW_COLOR.worship)[0] > 0.6, 'worship is light purple');
	assert.ok(lch(SW_COLOR.religious)[2] > 60 && lch(SW_COLOR.religious)[2] < 100 && lch(SW_COLOR.religious)[1] < 0.08, 'religious is tan');
	assert.ok(lch(SOURCE_COLOR.dining_out)[2] > 340 || lch(SOURCE_COLOR.dining_out)[2] < 10, 'Dining Out is raspberry');
	assert.equal(RING_COLOR_NOTE, "A ring's color and line say which law: liquor rings are solid navy lines, cannabis rings are dashed green lines.");
	assert.ok(lch(RING_COLOR.liquor)[0] < 0.35 && lch(RING_COLOR.liquor)[2] > 240 && lch(RING_COLOR.liquor)[2] < 290, 'liquor ring is navy');
	// Every legend swatch reads its color from the palette constants, none typed in.
	const legend = mapSrc.slice(mapSrc.indexOf('<fieldset class="layers">'), mapSrc.indexOf('</details>'));
	assert.doesNotMatch(legend, /#[0-9a-f]{6}/i, 'no typed hex in the Layers box');
	for (const re of [/--c:\{SOURCE_COLOR\[k\]\}/, /--c:\{g\.color\}/, /--c:\{SW_COLOR\.school\}/, /border-color:\{RING_COLOR\[g\.key\]\}/]) assert.match(legend, re);
});
