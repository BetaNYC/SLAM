// #111: 200 ft and 500 ft distance rings around schools and houses of worship on the district map.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { ringSpecs, groupRingSpecs, ringSharedNote, ringLegendText, ringLine, LICENSE_GROUPS, RING_COLOR, RING_COLOR_NOTE, RING_SHARED_LINE, ringFeatures, ringLabel, ringMapText, circle, destination, ftToM, FT_TO_M, RING_STEPS, RING_LAYER_NAME, RING_NOTE, RING_NO_LIQUOR_500, RING_LIST_NOTE } from '../src/lib/rings.js';
import { haversineM } from './helpers/haversine.js';
import { EXTRA_KEYS, LEGACY_KEYS, parseHash, buildHash, loadPrefs, savePrefs } from '../src/lib/mapState.js';
import { SW_COLOR } from '../src/lib/format.js';

const manifest = JSON.parse(readFileSync('static/data/manifest.json', 'utf8'));
const SW = manifest.schools_worship;
const FT = { list_ft: SW.list_ft, cannabis_school_ft: SW.cannabis_school_ft, cannabis_worship_ft: SW.cannabis_worship_ft };
const MAP = 'src/routes/[district]/map/+page.svelte';
const BOTH = { liquor: true, cannabis: true };
const verdict = /\b(violat\w*|meets?|eligib\w*|allowed|complian\w*|prohibit\w*|illegal|legal to)\b/i;

test('the manifest radii are the laws SLAM quotes: 200 ft liquor, 500 ft cannabis school, 200 ft cannabis worship', () => {
	assert.deepEqual(FT, { list_ft: 200, cannabis_school_ft: 500, cannabis_worship_ft: 200 });
});

const shape = (/** @type {any[]} */ specs) => specs.map((r) => [r.k, r.ft, r.laws, ringLine(r)]);

test('liquor toggle: 200 ft around schools and 200 ft around houses of worship, ABC Law §64(7)(a) only', () => {
	const specs = ringSpecs(FT, { liquor: true, cannabis: false });
	assert.deepEqual(shape(specs), [
		['school', 200, ['ABC Law §64(7)(a)'], 'solid line'],
		['worship', 200, ['ABC Law §64(7)(a)'], 'solid line']
	]);
	assert.deepEqual(specs, groupRingSpecs(FT, 'liquor'));
	// The liquor 500-ft rule is about licensed premises, not schools: never a ring.
	assert.ok(specs.every((r) => !r.laws.some((l) => l.includes('§64(7)(b)')) && r.ft !== 500));
});

test('cannabis toggle: 500 ft around schools (§72(6)(a)) and 200 ft around houses of worship (§72(6)(b)) only', () => {
	const specs = ringSpecs(FT, { liquor: false, cannabis: true });
	assert.deepEqual(shape(specs), [
		['school', 500, ['Cannabis Law §72(6)(a)'], 'dashed line'],
		['worship', 200, ['Cannabis Law §72(6)(b)'], 'dashed line'] // every cannabis ring is dashed: the pattern follows the law, not the radius
	]);
	assert.deepEqual(specs, groupRingSpecs(FT, 'cannabis'));
	assert.ok(specs.every((r) => r.laws.every((l) => l.startsWith('Cannabis'))));
});

test('both on: the shared 200 ft worship ring is drawn once and names both laws; schools keep two rings', () => {
	const specs = ringSpecs(FT, BOTH);
	assert.deepEqual(shape(specs), [
		['school', 200, ['ABC Law §64(7)(a)'], 'solid line'],
		['worship', 200, ['ABC Law §64(7)(a)', 'Cannabis Law §72(6)(b)'], 'solid line with dashes over it'],
		['school', 500, ['Cannabis Law §72(6)(a)'], 'dashed line']
	]);
	assert.equal(new Set(specs.map((r) => r.key)).size, specs.length, 'no ring twice');
	assert.equal(specs[1].label, 'House of worship, about 200 ft: ABC Law §64(7)(a) and Cannabis Law §72(6)(b)');
	assert.deepEqual(specs[1].groups, ['liquor', 'cannabis']);
	assert.deepEqual(ringSpecs(FT), specs, 'default is both');
	// On the map: one worship ring feature per house of worship, one label naming both laws.
	const sw = JSON.parse(readFileSync('static/data/mn-cd1/schools-worship.geojson', 'utf8'));
	const nW = sw.features.filter((/** @type {any} */ f) => f.properties.k === 'worship').length;
	const worship = ringFeatures(sw, specs).features.filter((f) => f.properties.k === 'worship');
	assert.equal(worship.length, nW);
	assert.ok(worship.every((f) => f.properties.text === '200 ft · ABC §64(7)(a), Cannabis §72(6)(b)'));
	// Drawn by both line layers: the solid liquor line with the cannabis dashes over it.
	assert.ok(worship.every((f) => f.properties.liq === true && f.properties.can === true));
	const schools = ringFeatures(sw, specs).features.filter((f) => f.properties.k === 'school');
	assert.ok(schools.every((f) => f.properties.liq !== f.properties.can), 'school rings are one law each');
	assert.equal(ringSharedNote(specs), 'Where the liquor and cannabis distances are the same (houses of worship at about 200 ft), one ring is drawn: the solid liquor line with the cannabis dashes over it, and its label names both laws.');
	assert.ok(ringSharedNote(specs).includes(RING_SHARED_LINE));
	assert.equal(ringSharedNote(ringSpecs(FT, { liquor: true })), '');
	assert.equal(ringSharedNote(ringSpecs(FT, { cannabis: true })), '');
});

test('neither on: no rings at all', () => {
	assert.deepEqual(ringSpecs(FT, { liquor: false, cannabis: false }), []);
	assert.deepEqual(ringFeatures({ features: [{ geometry: { type: 'Point', coordinates: [-74, 40.7] }, properties: { k: 'school' } }] }, ringSpecs(FT, {})).features, []);
});

test('a ring looks the same whichever toggles are on (each group legend stays true when both are on)', () => {
	const both = ringSpecs(FT, BOTH);
	for (const g of LICENSE_GROUPS)
		for (const r of groupRingSpecs(FT, g.key)) {
			const drawn = both.find((x) => x.key === r.key);
			assert.ok(drawn, r.key);
			// The group's own line is still drawn (a shared ring adds the other law's line over it).
			assert.ok(drawn.groups.includes(g.key), `${g.key} ${r.key} line still drawn`);
			assert.ok(r.laws.every((l) => drawn.laws.includes(l)), `${g.key} ${r.key} laws`);
		}
});

test('license groups: liquor holds pending, active, inactive; cannabis holds retail and license; Dining Out is in neither', () => {
	assert.deepEqual(
		LICENSE_GROUPS.map((g) => [g.key, g.label, g.short, g.layers, g.ringKey]),
		[
			['liquor', 'Liquor (SLA)', 'Liquor', ['liquor_pending', 'liquor_active', 'liquor_inactive'], 'rings_liquor'],
			['cannabis', 'Cannabis (OCM)', 'Cannabis', ['cannabis_retail', 'cannabis_license'], 'rings_cannabis']
		]
	);
	assert.ok(LICENSE_GROUPS.every((g) => !g.layers.includes('dining_out')));
	assert.throws(() => groupRingSpecs(FT, /** @type {any} */ ('dining')), /unknown group/);
});

test('ring radii in meters: 200 ft = 60.96 m, 500 ft = 152.4 m (international foot)', () => {
	assert.equal(FT_TO_M, 0.3048);
	assert.ok(Math.abs(ftToM(200) - 60.96) < 1e-9);
	assert.ok(Math.abs(ftToM(500) - 152.4) < 1e-9);
	const center = /** @type {[number, number]} */ ([-74.012474, 40.708984]); // A School Without Walls, mn-cd1
	for (const r of ringSpecs(FT)) {
		const ring = circle(center, r.ft);
		assert.equal(ring.length, RING_STEPS + 1);
		assert.deepEqual(ring[0], ring[ring.length - 1], 'closed');
		// Every vertex sits at the radius, measured by an independent haversine, within 0.2 m
		// (coordinates are rounded to 6 decimals, about 0.1 m).
		for (const p of ring) assert.ok(Math.abs(haversineM(center, p) - ftToM(r.ft)) < 0.2, `${r.key} ${haversineM(center, p)}`);
	}
	// North is due north, east is due east.
	const n = destination(center, 152.4, 0);
	const e = destination(center, 152.4, 90);
	assert.equal(n[0], center[0]);
	assert.ok(n[1] > center[1]);
	assert.ok(e[0] > center[0] && Math.abs(e[1] - center[1]) < 1e-5);
});

test('ringSpecs refuses missing radii instead of drawing a guessed ring', () => {
	assert.throws(() => ringSpecs(/** @type {any} */ ({ list_ft: 200 })), /cannabis_school_ft/);
	assert.throws(() => ringSpecs(/** @type {any} */ ({ list_ft: 0, cannabis_school_ft: 500, cannabis_worship_ft: 200 })), /list_ft/);
	assert.throws(() => ringSpecs(/** @type {any} */ (undefined)), /list_ft/);
	assert.throws(() => groupRingSpecs(/** @type {any} */ ({ list_ft: 200, cannabis_school_ft: 500 }), 'cannabis'), /cannabis_worship_ft/);
});

test('if a law ever changes a radius, rings split or merge from the manifest, not from typed numbers', () => {
	const ft = { list_ft: 200, cannabis_school_ft: 500, cannabis_worship_ft: 300 };
	assert.deepEqual(groupRingSpecs(ft, 'cannabis').map((r) => [r.k, r.ft, ringLine(r)]), [['school', 500, 'dashed line'], ['worship', 300, 'dashed line']]);
	assert.deepEqual(ringSpecs(ft, BOTH).filter((r) => r.k === 'worship').map((r) => [r.ft, r.laws, ringLine(r)]), [
		[200, ['ABC Law §64(7)(a)'], 'solid line'],
		[300, ['Cannabis Law §72(6)(b)'], 'dashed line']
	]);
	assert.equal(ringSharedNote(ringSpecs(ft, BOTH)), '');
	const merged = ringSpecs({ list_ft: 200, cannabis_school_ft: 200, cannabis_worship_ft: 200 }, BOTH);
	assert.deepEqual(merged.filter((r) => r.k === 'school').map((r) => [r.laws, ringLine(r)]), [[['ABC Law §64(7)(a)', 'Cannabis Law §72(6)(a)'], 'solid line with dashes over it']]);
	assert.match(ringSharedNote(merged), /schools at about 200 ft and houses of worship at about 200 ft/);
	// The page servers pass the manifest's radii, so a changed manifest moves every ring.
	const wide = ringSpecs({ list_ft: 250, cannabis_school_ft: 600, cannabis_worship_ft: 250 }, BOTH);
	assert.deepEqual(wide.map((r) => r.ft), [250, 250, 600]);
});

test('which features get which rings (both on): schools 2, houses of worship 1, other religious property none', () => {
	const specs = ringSpecs(FT, BOTH);
	for (const slug of ['mn-cd1', 'bk-cd4']) {
		const sw = JSON.parse(readFileSync(`static/data/${slug}/schools-worship.geojson`, 'utf8'));
		const n = (/** @type {string} */ k) => sw.features.filter((/** @type {any} */ f) => f.properties.k === k).length;
		assert.ok(n('school') > 0 && n('worship') > 0 && n('religious') > 0, slug);
		const rings = ringFeatures(sw, specs);
		const count = (/** @type {string} */ ring) => rings.features.filter((f) => f.properties.ring === ring).length;
		assert.equal(count('school-200'), n('school'), slug);
		assert.equal(count('school-500'), n('school'), slug);
		assert.equal(count('worship-200'), n('worship'), slug);
		assert.equal(rings.features.length, 2 * n('school') + n('worship'), slug);
		assert.ok(rings.features.every((f) => f.properties.k !== 'religious'), slug);
		assert.ok(rings.features.every((f) => f.geometry.type === 'LineString' && f.geometry.coordinates.length === RING_STEPS + 1), slug);
		// Each ring is centered on its own point.
		const first = sw.features.find((/** @type {any} */ f) => f.properties.k === 'school');
		const ring = rings.features.find((f) => f.properties.ring === 'school-500' && f.properties.name === (first.properties.n || first.properties.s));
		assert.ok(ring);
		assert.ok(Math.abs(haversineM(first.geometry.coordinates, /** @type {any} */ (ring).geometry.coordinates[16]) - 152.4) < 0.2);
	}
});

test('features with no point are skipped, never placed at 0,0', () => {
	const sw = { features: [{ geometry: null, properties: { k: 'school' } }, { geometry: { type: 'Point', coordinates: [NaN, 40.7] }, properties: { k: 'worship' } }] };
	assert.equal(ringFeatures(sw, ringSpecs(FT)).features.length, 0);
	assert.equal(ringFeatures(/** @type {any} */ (null), ringSpecs(FT)).features.length, 0);
});

test('ring computing is small: no new data file, a few hundred KB of geometry in memory at most', () => {
	for (const slug of ['mn-cd1', 'bk-cd4']) {
		assert.ok(!existsSync(`static/data/${slug}/rings.geojson`), 'rings are built in the browser');
		const sw = JSON.parse(readFileSync(`static/data/${slug}/schools-worship.geojson`, 'utf8'));
		const bytes = JSON.stringify(ringFeatures(sw, ringSpecs(FT))).length;
		assert.ok(bytes < 2_000_000, `${slug}: ${bytes} bytes`);
	}
});

test('labels name each ring by distance and law; the map text is short', () => {
	assert.equal(RING_LAYER_NAME, 'Distance rings (approximate)');
	const [s200, w200] = ringSpecs(FT, BOTH);
	const s500 = ringSpecs(FT, BOTH)[2];
	assert.equal(s200.label, 'School, about 200 ft: ABC Law §64(7)(a)');
	assert.equal(s500.label, 'School, about 500 ft: Cannabis Law §72(6)(a)');
	assert.equal(w200.label, 'House of worship, about 200 ft: ABC Law §64(7)(a) and Cannabis Law §72(6)(b)');
	assert.deepEqual(groupRingSpecs(FT, 'liquor').map(ringLegendText), ['School, about 200 ft: ABC Law §64(7)(a) (solid line)', 'House of worship, about 200 ft: ABC Law §64(7)(a) (solid line)']);
	// Was "(solid line)" for the cannabis worship ring: the pattern now follows the law, so every cannabis ring is dashed.
	assert.deepEqual(groupRingSpecs(FT, 'cannabis').map(ringLegendText), ['School, about 500 ft: Cannabis Law §72(6)(a) (dashed line)', 'House of worship, about 200 ft: Cannabis Law §72(6)(b) (dashed line)']);
	assert.equal(ringLegendText(w200), 'House of worship, about 200 ft: ABC Law §64(7)(a) and Cannabis Law §72(6)(b) (solid line with dashes over it)');
	assert.equal(ringLabel(w200), w200.label);
	assert.equal(ringMapText(s500), '500 ft · Cannabis §72(6)(a)');
	assert.equal(ringMapText(w200), '200 ft · ABC §64(7)(a), Cannabis §72(6)(b)');
});

test('the one note: entrance to entrance, same street, SLAM has neither, a guide not a ruling', () => {
	assert.match(RING_NOTE, /entrance to entrance/);
	assert.match(RING_NOTE, /same street/);
	assert.match(RING_NOTE, /neither entrance locations nor street logic/);
	assert.match(RING_NOTE, /a guide, not a ruling/);
	assert.match(RING_NO_LIQUOR_500, /§64\(7\)\(b\).*no ring/);
	assert.match(RING_LIST_NOTE, /every address page lists/);
});

test('no verdict words in the ring code, labels, notes or map text', () => {
	assert.equal(readFileSync('src/lib/rings.js', 'utf8').match(verdict), null);
	for (const t of [RING_LAYER_NAME, RING_NOTE, RING_NO_LIQUOR_500, RING_LIST_NOTE, ...ringSpecs(FT).flatMap((r) => [r.label, ringMapText(r), ringLegendText(r)]), ...LICENSE_GROUPS.flatMap((g) => [g.label, ...groupRingSpecs(FT, g.key).map(ringLegendText)]), ringSharedNote(ringSpecs(FT))])
		assert.equal(t.match(verdict), null, t);
	assert.equal(readFileSync(MAP, 'utf8').match(verdict), null);
	assert.equal(readFileSync('src/routes/glossary/+page.svelte', 'utf8').match(verdict), null);
});

const KNOWN = ['liquor_pending', 'liquor_active', 'liquor_inactive', 'cannabis_retail', 'cannabis_license', 'dining_out', ...EXTRA_KEYS];
/** @param {Record<string, string>} store */
const memStorage = (store) => /** @type {any} */ ({ getItem: (/** @type {string} */ k) => store[k] ?? null, setItem: (/** @type {string} */ k, /** @type {string} */ v) => (store[k] = v) });

test('two ring toggles with their own state keys; liquor rings start on, cannabis rings off', () => {
	assert.ok(EXTRA_KEYS.includes('rings_liquor') && EXTRA_KEYS.includes('rings_cannabis'));
	assert.ok(!EXTRA_KEYS.includes('rings'), 'the one-toggle key is retired');
	const src = readFileSync(MAP, 'utf8');
	assert.match(src, /let ringsOn = \$state\(\{ liquor: true, cannabis: false \}\);/);
	assert.match(src, /for \(const g of LICENSE_GROUPS\) ringsOn\[g\.key\] = on\.includes\(g\.ringKey\);/);
	assert.match(src, /LICENSE_GROUPS\.filter\(\(g\) => ringsOn\[g\.key\]\)\.map\(\(g\) => g\.ringKey\)/);
	assert.equal(parseHash('', KNOWN).on, null); // no hash: page defaults
});

test('ring state keys round-trip through the URL hash and saved preferences, each on its own', () => {
	for (const on of [['rings_liquor'], ['rings_cannabis'], ['liquor_active', 'rings_liquor', 'rings_cannabis'], []]) {
		const h = buildHash({ view: { z: 16, lat: 40.71, lon: -74.01 }, on, c311: 'stacks' });
		assert.deepEqual(parseHash('#' + h, KNOWN).on, on, h);
		/** @type {Record<string, string>} */
		const store = {};
		savePrefs(memStorage(store), { on, c311: 'stacks' });
		assert.deepEqual(loadPrefs(memStorage(store), KNOWN)?.on, on);
	}
});

test('an old "rings" key (first preview, one toggle) turns both group toggles on, in the hash and in saved choices', () => {
	assert.deepEqual(LEGACY_KEYS.rings, ['rings_liquor', 'rings_cannabis']);
	assert.deepEqual(parseHash('#on=liquor_active,rings', KNOWN).on, ['liquor_active', 'rings_liquor', 'rings_cannabis']);
	assert.deepEqual(parseHash('#on=rings,rings_liquor', KNOWN).on, ['rings_liquor', 'rings_cannabis'], 'no repeats');
	assert.deepEqual(loadPrefs(memStorage({ 'slam.map.v1': JSON.stringify({ on: ['rings', 'sw'], c311: 'stacks' }) }), KNOWN)?.on, ['rings_liquor', 'rings_cannabis', 'sw']);
	// A page that does not know the ring keys drops the old key too, rather than passing it through.
	assert.deepEqual(parseHash('#on=rings', ['sw']).on, []);
	assert.deepEqual(loadPrefs(memStorage({ 'slam.map.v1': JSON.stringify({ on: ['rings', 7, null], c311: 'stacks' }) }), KNOWN)?.on, ['rings_liquor', 'rings_cannabis']);
});

/** The markup of one license group's fieldset on the map page. @param {string} src */
function groupBlock(src) {
	const a = src.indexOf('{#each LICENSE_GROUPS as g (g.key)}\n\t\t<fieldset class="group"');
	const b = src.indexOf('</fieldset>', a);
	assert.ok(a > 0 && b > a, 'license group fieldset');
	return src.slice(a, b);
}

test('map page: layers grouped by license type, each ring toggle inside its own group', () => {
	const src = readFileSync(MAP, 'utf8');
	const g = groupBlock(src);
	// A fieldset and legend per group, the group's layers, then its own labeled ring toggle.
	assert.match(g, /<legend>\{g\.label\}<\/legend>/);
	assert.match(g, /\{#each g\.layers as k \(k\)\}\{@render layerBox\(k\)\}\{\/each\}/);
	assert.match(g, /<input type="checkbox" bind:checked=\{ringsOn\[g\.key\]\} onchange=\{toggleRings\}/);
	// The accessible name starts with the group: "Liquor, Distance rings (approximate)".
	// (A template literal, because Svelte trims a trailing space typed inside the element.)
	assert.match(g, /<span class="sr-only">\{`\$\{g\.short\}, `\}<\/span>\{RING_LAYER_NAME\}/);
	assert.ok(g.indexOf('{@render layerBox(k)}') < g.indexOf('ringsOn[g.key]'), 'rings after the group layers');
	// The group's legend sits under its own toggle; the liquor group says why liquor has no 500 ft ring.
	assert.match(g, /\{#each GROUP_RINGS\[g\.key\] as r \(r\.key\)\}[\s\S]*?ringLegendText\(r\)/);
	assert.match(g, /id="rings-note-liquor"[^>]*>\{RING_NO_LIQUOR_500\}/);
	assert.match(g, /aria-describedby=\{g\.key === 'liquor' \? 'rings-note rings-note-liquor' : 'rings-note'\}/);
	// Group "all" box: native checkbox, mixed when some layers are on.
	assert.match(g, /bind:checked=\{\(\) => groupAll\(g\), \(v\) => setGroup\(g, v\)\} bind:indeterminate=\{\(\) => groupSome\(g\)/);
	// Every record layer is in a group or after the groups, never both; the old single toggle is gone.
	assert.ok(!/showRings|\{#each LAYERS as/.test(src));
	assert.match(src, /const OTHER_LAYERS = LAYERS\.filter\(\(k\) => !LICENSE_GROUPS\.some/);
	const after = src.slice(src.indexOf('</fieldset>', src.indexOf('<fieldset class="group"')));
	assert.ok(after.indexOf('{#each OTHER_LAYERS as k (k)}') < after.indexOf('bind:checked={show311}'), 'Dining Out, then 311');
	assert.ok(after.indexOf('bind:checked={show311}') < after.indexOf('bind:checked={showSW}'), '311, then schools and worship');
	// The shared note, once, with the dedupe sentence only when both are on.
	// One joined string, so the sentences always have a space between them (a template-block version dropped it).
	assert.match(src, /<p id="rings-note" class="rings-note" hidden=\{!anyRings\}>\{\[RING_NOTE, sharedNote, RING_LIST_NOTE\]\.filter\(Boolean\)\.join\(' '\)\}<\/p>/);
	// Drawn rings follow the toggles: one source, refilled with only what is on.
	assert.match(src, /const RINGS = \$derived\(ringSpecs\(data\.ring_ft, ringsOn\)\);/);
	assert.match(src, /map\.getSource\('rings'\)\?\.setData\(ringFeatures\(pts, RINGS\)\)/);
});

test('map page: fits and is tappable on a 360px phone', () => {
	const src = readFileSync(MAP, 'utf8');
	const css = src.slice(src.indexOf('<style>'));
	// Labels are the tap target: at least 24px (1.75rem = 28px at 16px) tall (WCAG 2.5.8).
	assert.match(css, /\.layers label \{[^}]*min-height: 1\.75rem/);
	assert.match(css, /\.layers input\[type='checkbox'\][^{]*\{[^}]*width: 1\.15rem; height: 1\.15rem/);
	// Groups are full width and stacked; long legend lines wrap instead of overflowing.
	assert.match(css, /\.layers \.group \{[^}]*width: 100%[^}]*flex-direction: column[^}]*min-width: 0/);
	assert.match(css, /overflow-wrap: anywhere/);
	// Rough width budget at 360px: page padding, outer and group fieldsets, two indents, the longest legend word.
	const remPx = 16;
	const indent = (3.2 + 0.6 + 1) * remPx; // legend list indent, group padding, outer fieldset
	assert.ok(360 - 2 * indent > 150, 'room left for wrapped legend text');
	assert.match(css, /\.sr-only \{[^}]*clip: rect\(0 0 0 0\)/);
});

test('map page: dashes as well as color, line labels, About this map, radii from the data file', () => {
	const src = readFileSync(MAP, 'utf8');
	assert.match(src, /'line-dasharray'/);
	// Rings are colored by law, not by place: a solid liquor layer, a dashed cannabis layer drawn after it.
	assert.match(src, /id: 'rings-liquor', type: 'line', source: 'rings', filter: \['==', \['get', 'liq'\], true\][^\n]*'line-color': RING_COLOR\.liquor, 'line-width': 2 \}/);
	assert.match(src, /id: 'rings-cannabis', type: 'line', source: 'rings', filter: \['==', \['get', 'can'\], true\][^\n]*'line-color': RING_COLOR\.cannabis, 'line-width': 2, 'line-dasharray': \[3, 2\] \}/);
	assert.ok(src.indexOf("id: 'rings-liquor'") < src.indexOf("id: 'rings-cannabis'"), 'cannabis dashes over the liquor line');
	assert.ok(!/SW_COLOR\.school, SW_COLOR\.worship\];/.test(src), 'rings no longer colored by place');
	// Legend swatches use the ring colors: the group's own color, dashed for cannabis.
	assert.match(src, /class:dashed=\{g\.key === 'cannabis'\} style="border-color:\{RING_COLOR\[g\.key\]\}"/);
	assert.match(src, /class:dashed=\{ringLine\(r\) === 'dashed line'\} style="border-color:\{RING_COLOR\[g\.key\]\}"/);
	assert.match(src, /id: 'rings-label'[\s\S]*?'symbol-placement': 'line'/);
	// About this map explains the per-group rings with the same note.
	const about = src.slice(src.indexOf('<summary>About this map</summary>'));
	assert.match(about, /\{RING_LAYER_NAME\}[\s\S]*\{#each LICENSE_GROUPS as g \(g\.key\)\}\{g\.label\}: \{GROUP_RINGS\[g\.key\]\.map\(ringLegendText\)[\s\S]*\{RING_NOTE\} \{RING_NO_LIQUOR_500\}/);
	// The radii come from the manifest via the page server, not typed into the page.
	assert.match(readFileSync('src/routes/[district]/map/+page.server.js', 'utf8'), /ring_ft: \{ list_ft, cannabis_school_ft, cannabis_worship_ft \}/);
	assert.match(src, /groupRingSpecs\(data\.ring_ft, g\.key\)/);
	/** Code only: comments and string literals removed. @param {string} js */
	const code = (js) => js.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '').replace(/'[^']*'|`[^`]*`/g, '');
	assert.ok(!/\b(200|500)\b/.test(code(src.slice(0, src.indexOf('</script>')))), 'no typed radii in the map script');
	assert.ok(!/\b(200|500)\b/.test(code(readFileSync('src/lib/rings.js', 'utf8'))), 'no typed radii in rings.js code');
});

/** WCAG 2 relative luminance and contrast ratio. https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio @param {string} hex */
function lum(hex) {
	const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** @param {string} a @param {string} b */
const contrast = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);

test('ring text and lines: AA contrast against their white halo and casing', () => {
	const src = readFileSync(MAP, 'utf8');
	assert.match(src, /'text-color': '#1f2937', 'text-halo-color': '#fff', 'text-halo-width': 2/);
	assert.ok(contrast('#1f2937', '#ffffff') >= 4.5); // text, AA
	for (const c of [SW_COLOR.school, SW_COLOR.worship, RING_COLOR.liquor, RING_COLOR.cannabis]) assert.ok(contrast(c, '#ffffff') >= 3, c); // non-text graphics, 1.4.11
});

test('built glossary and map explain the per-type rings in the same words', { skip: !existsSync('build/glossary/index.html') }, () => {
	const g = readFileSync('build/glossary/index.html', 'utf8').replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ');
	const entry = g.slice(g.indexOf('id="distance-rings"'), g.indexOf('</dd>', g.indexOf('id="distance-rings"')));
	assert.ok(entry.length > 0);
	assert.ok(g.includes(RING_LAYER_NAME));
	assert.ok(entry.includes(RING_NOTE.replace(/\s+/g, ' ')));
	assert.ok(entry.includes(RING_LIST_NOTE));
	for (const grp of LICENSE_GROUPS) {
		assert.ok(entry.includes(`${grp.label}:`), grp.label);
		for (const r of groupRingSpecs(FT, grp.key)) assert.ok(entry.includes(ringLegendText(r)), ringLegendText(r));
	}
	// §64(7)(b) sits with Liquor, before the Cannabis group.
	assert.ok(entry.indexOf('Liquor (SLA):') < entry.indexOf(RING_NO_LIQUOR_500) && entry.indexOf(RING_NO_LIQUOR_500) < entry.indexOf('Cannabis (OCM):'));
	const page = readFileSync('build/mn-cd1/map/index.html', 'utf8').replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ');
	assert.ok(page.includes(RING_NOTE));
	// Color and line in the same words on both pages, and how a shared ring is drawn.
	for (const t of [RING_COLOR_NOTE, RING_SHARED_LINE]) {
		assert.ok(entry.includes(t), `glossary: ${t}`);
		assert.ok(page.includes(t), `map: ${t}`);
	}
	// Prerendered Layers box, in order: Liquor group with its ring toggle, then Cannabis with its own.
	const labels = [...page.matchAll(/<legend[^>]*>([^<]+)<\/legend>|<span class="sr-only[^"]*">([^<]+)<\/span>/g)].map((m) => (m[1] ?? m[2]).trim());
	assert.deepEqual(labels.slice(0, 5), ['Layers', 'Liquor (SLA)', 'Liquor,', 'Cannabis (OCM)', 'Cannabis,']);
	// The accessible name keeps its space: "Liquor, Distance rings (approximate)".
	for (const grp of LICENSE_GROUPS) assert.match(page, new RegExp(`${grp.short}, </span>(<!---->)?${RING_LAYER_NAME.replace(/[()]/g, '\\$&')}`), grp.short);
});

test('map defaults (Noel, 2026-11-07): pending liquor, liquor rings, 311, schools and worship on; the rest off', () => {
	const src = readFileSync(MAP, 'utf8');
	const block = src.match(/let visible = \$state\(\{([^}]*)\}\);/);
	assert.ok(block, 'visible defaults block');
	const on = Object.fromEntries([...block[1].matchAll(/(\w+): (true|false)/g)].map((m) => [m[1], m[2] === 'true']));
	assert.deepEqual(on, { liquor_pending: true, liquor_active: false, liquor_inactive: false, cannabis_retail: false, cannabis_license: false, dining_out: false });
	assert.match(src, /let show311 = \$state\(true\);/);
	assert.match(src, /let showSW = \$state\(true\);/);
	assert.match(src, /let ringsOn = \$state\(\{ liquor: true, cannabis: false \}\);/);
	// Default-on layers still load when the map is ready.
	assert.match(src, /if \(show311\) toggle311\(\);/);
	assert.match(src, /if \(showSW\) toggleSW\(\);/);
	assert.match(src, /if \(anyRings\) toggleRings\(\);/);
});
