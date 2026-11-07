/**
 * Map state that survives Back/Forward and return visits (#75).
 *
 * - The view (zoom, center), the layers that are on, the 311 style and the selected address
 *   live in the URL hash, e.g. #v=15.20/40.70412/-73.92131&on=liquor_pending,liquor_active&c311=stacks&sel=3072409
 *   so Back from an address page lands on the same view, and a view can be shared as a link.
 * - Layer choices (not the view) are also remembered in localStorage for the next visit.
 *
 * Order on load: URL hash, then saved preferences, then the page's defaults.
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
