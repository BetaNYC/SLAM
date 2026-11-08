/**
 * Map state that survives Back/Forward and return visits (#75).
 *
 * - The view (zoom, center), the layers that are on, the 311 style and the selected address
 *   live in the URL hash, e.g. #v=15.20/40.70412/-73.92131&on=liquor_pending,liquor_active&c311=stacks&sel=3072409
 *   so Back from an address page lands on the same view, and a view can be shared as a link.
 * - Layer choices (not the view) are also remembered in localStorage for the next visit.
 *
 * Order on load: URL hash, then saved preferences, then MAP_DEFAULTS.
 * "Reset to default" (#114) puts MAP_DEFAULTS back, forgets the saved choices and keeps the view.
 */

export const PREFS_KEY = 'slam.map.v1';
/** Extra layer keys besides the record sources. */
export const EXTRA_KEYS = ['c311', 'sw', 'rings_liquor', 'rings_cannabis'];
/**
 * Keys an earlier build wrote, and what they mean now. `rings` was one toggle for every distance
 * ring (#111, first preview); it is now one toggle per license group, so an old `rings` turns both
 * on and the map looks as it did when that link or choice was saved.
 * @type {Record<string, string[]>}
 */
export const LEGACY_KEYS = { rings: ['rings_liquor', 'rings_cannabis'] };
export const C311_MODE_KEYS = ['stacks', 'sized', 'dots'];

/**
 * How the map first opens (Noel, 2026-11-07, #113), written once and used both for the first load
 * and by the Layers box's "Reset to default" button (#114), so the two cannot drift apart:
 * pending liquor applications, the liquor distance rings, 311 complaints as stacked chips, and
 * schools and houses of worship on; every other layer off; the Layers box open.
 * @type {Readonly<{on: readonly string[], c311: string, open: boolean}>}
 */
export const MAP_DEFAULTS = Object.freeze({
	on: Object.freeze(['liquor_pending', 'c311', 'sw', 'rings_liquor']),
	c311: 'stacks',
	open: true
});

/**
 * Every toggle in the Layers box, from a list of layer keys that are on.
 * @param {readonly string[]} on  layer keys, as in the hash or saved choices
 * @param {readonly string[]} layers  the record layers the page draws
 * @param {readonly {key: string, ringKey: string}[]} groups  the license groups (#lib/rings.js LICENSE_GROUPS)
 * @returns {{visible: Record<string, boolean>, show311: boolean, showSW: boolean, ringsOn: Record<string, boolean>}}
 */
export function layerToggles(on, layers, groups) {
	return {
		visible: Object.fromEntries(layers.map((k) => [k, on.includes(k)])),
		show311: on.includes('c311'),
		showSW: on.includes('sw'),
		ringsOn: Object.fromEntries(groups.map((g) => [g.key, on.includes(g.ringKey)]))
	};
}

/**
 * True when these choices are the defaults (same layers in any order, same 311 style, box open).
 * @param {{on: readonly string[], c311: string | null, open?: boolean}} prefs
 */
export function isDefaultPrefs(prefs) {
	const on = new Set(prefs.on);
	return (
		on.size === MAP_DEFAULTS.on.length &&
		MAP_DEFAULTS.on.every((k) => on.has(k)) &&
		prefs.c311 === MAP_DEFAULTS.c311 &&
		prefs.open !== false
	);
}

/**
 * Layer keys from a hash or saved choices: legacy keys expanded, unknown keys dropped, no repeats.
 * @param {unknown[]} keys @param {string[]} known
 * @returns {string[]}
 */
export function knownKeys(keys, known) {
	/** @type {string[]} */
	const out = [];
	for (const k of keys) for (const x of typeof k === 'string' ? (LEGACY_KEYS[k] ?? [k]) : []) if (known.includes(x) && !out.includes(x)) out.push(x);
	return out;
}

/**
 * @typedef {{z: number, lat: number, lon: number}} View
 * @typedef {{view: View | null, on: string[] | null, c311: string | null, sel: string | null}} MapState
 */

/**
 * Read the hash. Anything malformed is ignored, never thrown.
 * @param {string} hash  location.hash, with or without the leading #
 * @param {string[]} known  every layer key the page knows (record sources plus EXTRA_KEYS)
 * @returns {MapState}
 */
export function parseHash(hash, known) {
	const p = new URLSearchParams(String(hash ?? '').replace(/^#/, ''));
	/** @type {View | null} */
	let view = null;
	const v = (p.get('v') ?? '').split('/').map(Number);
	if (v.length === 3 && v.every(Number.isFinite)) {
		const [z, lat, lon] = v;
		// Only views near New York City, at sensible zooms.
		if (z >= 8 && z <= 22 && Math.abs(lat - 40.7) < 1 && Math.abs(lon + 74) < 1) view = { z, lat, lon };
	}
	const onRaw = p.get('on');
	const on = onRaw === null ? null : knownKeys(onRaw.split(','), known);
	const c = p.get('c311');
	const sel = p.get('sel');
	return {
		view,
		on,
		c311: c && C311_MODE_KEYS.includes(c) ? c : null,
		sel: sel && /^[A-Za-z0-9_-]{1,40}$/.test(sel) ? sel : null
	};
}

/**
 * Write the hash (no leading #). Commas and slashes are kept readable.
 * @param {{view: View, on: string[], c311: string, sel?: string | null}} s
 */
export function buildHash(s) {
	const parts = [
		`v=${s.view.z.toFixed(2)}/${s.view.lat.toFixed(5)}/${s.view.lon.toFixed(5)}`,
		`on=${s.on.join(',')}`,
		`c311=${s.c311}`
	];
	if (s.sel) parts.push(`sel=${s.sel}`);
	return parts.join('&');
}

/**
 * Saved layer choices, or null. Never throws (private mode, blocked storage, bad JSON).
 * @param {Storage | undefined} storage
 * @param {string[]} known
 * @returns {{on: string[], c311: string | null, open: boolean} | null}
 */
export function loadPrefs(storage, known) {
	try {
		const raw = storage?.getItem(PREFS_KEY);
		if (!raw) return null;
		const o = JSON.parse(raw);
		if (!Array.isArray(o?.on)) return null;
		return {
			on: knownKeys(o.on, known),
			c311: C311_MODE_KEYS.includes(o.c311) ? o.c311 : null,
			open: o.open !== false // the Layers box; open unless the user closed it (#77)
		};
	} catch {
		return null;
	}
}

/**
 * @param {Storage | undefined} storage
 * @param {{on: string[], c311: string, open?: boolean}} prefs
 */
export function savePrefs(storage, prefs) {
	try {
		storage?.setItem(PREFS_KEY, JSON.stringify({ on: prefs.on, c311: prefs.c311, open: prefs.open !== false }));
	} catch {
		// Storage can be full or blocked; preferences are a convenience, not required.
	}
}

/**
 * Forget the saved layer choices: removes only SLAM's own key. Never throws.
 * @param {Storage | undefined} storage
 */
export function clearPrefs(storage) {
	try {
		storage?.removeItem(PREFS_KEY);
	} catch {
		// Blocked storage: nothing was saved there either.
	}
}

/**
 * Save choices that differ from the defaults; forget them when they match (#114). A browser that
 * has nothing saved follows the defaults, so a later change to the defaults reaches it, and a
 * reset stays reset while the map keeps writing its state on every pan and toggle.
 * @param {Storage | undefined} storage
 * @param {{on: string[], c311: string, open?: boolean}} prefs
 */
export function storePrefs(storage, prefs) {
	if (isDefaultPrefs(prefs)) clearPrefs(storage);
	else savePrefs(storage, prefs);
}
