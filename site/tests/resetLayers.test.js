// #114: a "Reset to default" button in the map's Layers box. The defaults are written once
// (MAP_DEFAULTS) and used both for the first load and by the button.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { MAP_DEFAULTS, EXTRA_KEYS, PREFS_KEY, layerToggles, isDefaultPrefs, clearPrefs, storePrefs, savePrefs, loadPrefs, parseHash, buildHash } from '../src/lib/mapState.js';
import { LICENSE_GROUPS } from '../src/lib/rings.js';

const MAP = 'src/routes/[district]/map/+page.svelte';
const src = readFileSync(MAP, 'utf8');
const LAYERS = JSON.parse(src.match(/const LAYERS = (\[[^\]]*\]);/)?.[1].replaceAll("'", '"') ?? 'null');
const KNOWN = [...LAYERS, ...EXTRA_KEYS];
const verdict = /\b(violat\w*|meets?|eligib\w*|allowed|complian\w*|prohibit\w*|illegal|legal to)\b/i;

/** A localStorage stand-in that also holds another site's key. */
function fakeStorage() {
	/** @type {Record<string, string>} */
	const store = { 'other.app': 'keep me' };
	const storage = /** @type {any} */ ({
		getItem: (/** @type {string} */ k) => store[k] ?? null,
		setItem: (/** @type {string} */ k, /** @type {string} */ v) => (store[k] = v),
		removeItem: (/** @type {string} */ k) => delete store[k]
	});
	return { store, storage };
}

/** The body of a function in the map page. @param {string} name */
function fnBody(name) {
	const start = src.indexOf(`function ${name}(`);
	assert.ok(start > -1, name);
	const open = src.indexOf('{', src.indexOf(')', start));
	let depth = 0;
	for (let i = open; i < src.length; i++) {
		if (src[i] === '{') depth++;
		else if (src[i] === '}' && --depth === 0) return src.slice(open, i + 1);
	}
	throw new Error(`unclosed ${name}`);
}

test('the defaults: pending liquor, liquor rings, 311 as stacked chips, schools and worship on; the rest off; box open', () => {
	assert.deepEqual([...MAP_DEFAULTS.on].sort(), ['c311', 'liquor_pending', 'rings_liquor', 'sw']);
	assert.equal(MAP_DEFAULTS.c311, 'stacks');
	assert.equal(MAP_DEFAULTS.open, true);
	assert.ok(Object.isFrozen(MAP_DEFAULTS) && Object.isFrozen(MAP_DEFAULTS.on), 'nothing can change the defaults at run time');
	for (const k of MAP_DEFAULTS.on) assert.ok(KNOWN.includes(k), k);
	assert.deepEqual(layerToggles(MAP_DEFAULTS.on, LAYERS, LICENSE_GROUPS), {
		visible: { liquor_pending: true, liquor_active: false, liquor_inactive: false, cannabis_retail: false, cannabis_license: false, dining_out: false },
		show311: true,
		showSW: true,
		ringsOn: { liquor: true, cannabis: false }
	});
});

test('defaults are written once: the first load and the reset button both read MAP_DEFAULTS', () => {
	// No other copy of the default values in the page.
	assert.doesNotMatch(src, /liquor_pending: (true|false)/);
	assert.doesNotMatch(src, /let (show311|showSW) = \$state\((true|false)\)/);
	assert.doesNotMatch(src, /let ringsOn = \$state\(\{ liquor:/);
	assert.doesNotMatch(src, /let mode311 = \$state\('/);
	// First load.
	assert.match(src, /const INITIAL = layerToggles\(MAP_DEFAULTS\.on, LAYERS, LICENSE_GROUPS\);/);
	assert.match(src, /let visible = \$state\(\{ \.\.\.INITIAL\.visible \}\);/);
	assert.match(src, /let show311 = \$state\(INITIAL\.show311\);/);
	assert.match(src, /let showSW = \$state\(INITIAL\.showSW\);/);
	assert.match(src, /let ringsOn = \$state\([^\n]*INITIAL\.ringsOn/);
	assert.match(src, /let mode311 = \$state\(MAP_DEFAULTS\.c311\);/);
	assert.match(src, /let layersOpen = \$state\(MAP_DEFAULTS\.open\);/);
	// Reset.
	const reset = fnBody('resetLayers');
	assert.match(reset, /setToggles\(MAP_DEFAULTS\.on\)/);
	assert.match(reset, /mode311 = MAP_DEFAULTS\.c311/);
	// MAP_DEFAULTS is defined in one place in the whole site.
	/** @param {string} d @returns {string[]} */
	const files = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? files(join(d, f)) : [join(d, f)]));
	const defs = files('src').filter((f) => /MAP_DEFAULTS\s*=/.test(readFileSync(f, 'utf8')));
	assert.deepEqual(defs, [join('src', 'lib', 'mapState.js')]);
});

test('reset puts back every toggle, both rings and the 311 style, from any earlier state', () => {
	const everythingElse = [...LAYERS.filter((k) => !MAP_DEFAULTS.on.includes(k)), 'rings_cannabis'];
	for (const before of [[], KNOWN, everythingElse, ['dining_out', 'c311']]) {
		const t = layerToggles(MAP_DEFAULTS.on, LAYERS, LICENSE_GROUPS);
		assert.notDeepEqual(layerToggles(before, LAYERS, LICENSE_GROUPS), t, 'a real change to reset');
	}
	// The page sets each piece of state through setToggles, then draws it with the same functions
	// the checkboxes use (no second copy of the layer logic), and the 311 style too.
	const set = fnBody('setToggles');
	assert.match(set, /for \(const k of LAYERS\) visible\[k\] = t\.visible\[k\];/);
	assert.match(set, /show311 = t\.show311;/);
	assert.match(set, /showSW = t\.showSW;/);
	assert.match(set, /for \(const g of LICENSE_GROUPS\) ringsOn\[g\.key\] = t\.ringsOn\[g\.key\];/);
	const reset = fnBody('resetLayers');
	assert.match(reset, /for \(const k of LAYERS\) toggle\(k\);/);
	assert.match(reset, /await Promise\.all\(\[toggle311\(\), toggleSW\(\), toggleRings\(\)\]\);/);
	assert.doesNotMatch(reset, /addLayer|addSource|setLayoutProperty/);
	// toggle311 shows only the current style's layers once loaded.
	assert.match(fnBody('toggle311'), /set311Visibility\(\)/);
	// The first load restores saved state through the same setToggles.
	assert.match(src, /if \(on\) setToggles\(on\);/);
});

test('reset forgets the saved choices: only SLAM\'s own key, and a default state is never re-saved', () => {
	const { store, storage } = fakeStorage();
	savePrefs(storage, { on: ['dining_out', 'rings_cannabis'], c311: 'dots', open: true });
	assert.ok(store[PREFS_KEY]);
	clearPrefs(storage);
	assert.equal(store[PREFS_KEY], undefined);
	assert.equal(store['other.app'], 'keep me');
	assert.equal(loadPrefs(storage, KNOWN), null);
	// After the reset the map keeps writing its state on every pan and toggle: the defaults are not saved.
	storePrefs(storage, { on: [...MAP_DEFAULTS.on].reverse(), c311: MAP_DEFAULTS.c311, open: true });
	assert.equal(store[PREFS_KEY], undefined);
	// A real change is saved again.
	storePrefs(storage, { on: ['dining_out'], c311: 'stacks', open: true });
	assert.deepEqual(loadPrefs(storage, KNOWN)?.on, ['dining_out']);
	// Returning to the defaults by hand forgets them too.
	storePrefs(storage, { on: [...MAP_DEFAULTS.on], c311: 'stacks' });
	assert.equal(store[PREFS_KEY], undefined);
	assert.equal(store['other.app'], 'keep me');
	// Default layers with the box closed, or another 311 style, are a real choice.
	assert.equal(isDefaultPrefs({ on: [...MAP_DEFAULTS.on], c311: 'stacks', open: false }), false);
	assert.equal(isDefaultPrefs({ on: [...MAP_DEFAULTS.on], c311: 'dots' }), false);
	assert.equal(isDefaultPrefs({ on: [...MAP_DEFAULTS.on, 'dining_out'], c311: 'stacks' }), false);
	// Broken or missing storage never throws.
	const broken = /** @type {any} */ ({ removeItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); } });
	assert.doesNotThrow(() => clearPrefs(broken));
	assert.doesNotThrow(() => storePrefs(broken, { on: [], c311: 'stacks' }));
	assert.doesNotThrow(() => clearPrefs(undefined));
	// The page writes through storePrefs and the reset clears explicitly (also before the map is ready).
	assert.match(fnBody('writeState'), /storePrefs\(window\.localStorage,/);
	assert.doesNotMatch(src, /\bsavePrefs\(/);
	assert.match(fnBody('resetLayers'), /clearPrefs\(window\.localStorage\)/);
	assert.doesNotMatch(src, /localStorage\.clear\(\)/);
});

test('reset keeps the view and selection in the link but carries the default layers', () => {
	const before = parseHash('#v=17.10/40.71234/-73.95678&on=dining_out,cannabis_retail,rings_cannabis&c311=dots&sel=3072409', KNOWN);
	// writeState rebuilds the hash from the live view and selection, with the reset toggles.
	const t = layerToggles(MAP_DEFAULTS.on, LAYERS, LICENSE_GROUPS);
	const on = [...LAYERS.filter((k) => t.visible[k]), ...(t.show311 ? ['c311'] : []), ...(t.showSW ? ['sw'] : []), ...LICENSE_GROUPS.filter((g) => t.ringsOn[g.key]).map((g) => g.ringKey)];
	const after = parseHash(buildHash({ view: /** @type {any} */ (before.view), on, c311: MAP_DEFAULTS.c311, sel: before.sel }), KNOWN);
	assert.deepEqual(after.view, before.view);
	assert.equal(after.sel, '3072409');
	assert.equal(after.c311, 'stacks');
	assert.deepEqual([...(after.on ?? [])].sort(), [...MAP_DEFAULTS.on].sort());
	// The page's onKeys is that same mapping, and the reset rewrites the hash with replaceState (no reload).
	assert.match(fnBody('onKeys'), /LAYERS\.filter\(\(k\) => visible\[k\]\), \.\.\.\(show311 \? \['c311'\] : \[\]\), \.\.\.\(showSW \? \['sw'\] : \[\]\), \.\.\.LICENSE_GROUPS\.filter\(\(g\) => ringsOn\[g\.key\]\)\.map\(\(g\) => g\.ringKey\)/);
	assert.match(fnBody('resetLayers'), /writeState\(\);/);
	assert.match(fnBody('writeState'), /replaceState\(/);
	assert.match(fnBody('writeState'), /sel: sel\?\.aid \?\? null/);
	assert.doesNotMatch(fnBody('resetLayers'), /location\.(reload|assign|href)|goto\(|jumpTo|fitBounds|flyTo|easeTo/);
});

test('the button: a real, keyboard-reachable button in the Layers box, plain secondary style, announced', () => {
	const fieldset = src.slice(src.indexOf('<fieldset class="layers">'), src.indexOf('</details>'));
	const m = fieldset.match(/<button([^>]*)>([^<]*)<\/button>/);
	assert.ok(m, 'a <button> inside the Layers fieldset');
	const [, attrs, label] = m;
	assert.equal(label, 'Reset to default');
	assert.match(attrs, /type="button"/);
	assert.match(attrs, /onclick=\{resetLayers\}/);
	assert.match(attrs, /class="btn secondary reset"/);
	assert.doesNotMatch(attrs, /tabindex|disabled|danger|red/);
	const hint = attrs.match(/aria-describedby="([^"]+)"/)?.[1];
	assert.ok(hint && fieldset.includes(`id="${hint}"`), 'hint is in the box');
	assert.match(fieldset, /id="reset-hint"[^>]*>Turns layers back to how the map first opens\.</);
	// At least 24px tall on a phone (WCAG 2.5.8): 2rem = 32px.
	const h = src.match(/\.layers \.reset \{[^}]*min-height: ([\d.]+)rem/);
	assert.ok(h && Number(h[1]) * 16 >= 24, 'min-height ≥ 24px');
	// Announced through the page's one status region.
	assert.match(src, /const RESET_STATUS = 'Layers reset to default\.';/);
	assert.match(fnBody('resetLayers'), /status = RESET_STATUS;/);
	assert.match(src, /<p class="muted" role="status">\{status\}<\/p>/);
});

test('no verdict words in the reset code or the state helpers', () => {
	assert.equal(readFileSync('src/lib/mapState.js', 'utf8').match(verdict), null);
	assert.equal(fnBody('resetLayers').match(verdict), null);
	assert.equal(src.match(verdict), null);
});
