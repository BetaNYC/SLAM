// The basemap every SLAM map uses: the City's own vector basemap (NYC OTI's NYC_Basemap_v3 on
// ArcGIS Online), with OpenFreeMap as the fallback so a map never goes blank.
//
// Built against what the service itself publishes (read 2026-11-04):
// - VectorTileServer?f=json: copyrightText "SOURCE: NYC OTI", tiles ["tile/{z}/{y}/{x}.pbf"],
//   defaultStyles "resources/styles".
// - resources/styles/root.json: a version-8 style whose `sources.esri.url` ("../../"), `sprite`
//   ("../sprites/sprite") and `glyphs` ("../fonts/{fontstack}/{range}.pbf") are relative to the
//   style file. MapLibre needs absolute URLs, and the source URL points at the Esri service JSON,
//   which is not TileJSON, so the source gets an explicit `tiles` array instead.
// - Esri's attribution page (developers.arcgis.com/documentation/esri-and-data-attribution/):
//   "Powered by Esri" must be shown when using ArcGIS services from an open source library.
// Captured copies of both files are in tests/fixtures/city_basemap_*.json.

export const CITY_SERVICE_URL =
	'https://tiles.arcgis.com/tiles/yG5s3afENB5iO9fj/arcgis/rest/services/NYC_Basemap_v3/VectorTileServer';
export const CITY_STYLE_URL = `${CITY_SERVICE_URL}/resources/styles/root.json`;
/** From the service JSON's `tiles`, relative to the service root. */
export const CITY_TILE_PATH = 'tile/{z}/{y}/{x}.pbf';
/** One low-zoom tile, fetched alongside the style to prove the tiles answer too. */
export const CITY_PROBE_TILE = 'tile/0/0/0.pbf';
export const FALLBACK_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
/** Shown by MapLibre's attribution control. The OTI text is the service's own copyrightText. */
export const CITY_ATTRIBUTION =
	'<a href="https://www.nyc.gov/content/oti/pages/">SOURCE: NYC OTI</a> | <a href="https://www.esri.com/">Powered by Esri</a>';
export const DEFAULT_TIMEOUT_MS = 8000;

/**
 * City-style layers hidden so our dots, outline and popups stay readable. Address numbers and
 * building names sit right where license points are; one-way arrows repeat on every street.
 */
export const CITY_HIDDEN_LAYERS = [
	'Addresses/label/Default',
	'Buildings/label/Buildings',
	'Buildings/label/Landmark Building',
	'Traffic Direction/With',
	'Traffic Direction/Against',
	'Traffic Direction/Two-Way/1',
	'Traffic Direction/Two-Way/0'
];
/** Building footprints are drawn this transparent (City default: opaque fills). */
export const CITY_BUILDING_OPACITY = 0.45;

/**
 * Resolve a URL relative to `base`, keeping `{z}`-style placeholders intact. `new URL()` would
 * percent-encode the braces, which breaks MapLibre's template substitution.
 * @param {string} rel
 * @param {string} base
 */
export function resolveTemplate(rel, base) {
	/** @type {string[]} */
	const keys = [];
	const masked = rel.replace(/\{([^}]+)\}/g, (_, k) => {
		keys.push(k);
		return `__slamtpl${keys.length - 1}__`;
	});
	return new URL(masked, base).href.replace(/__slamtpl(\d+)__/g, (_, i) => `{${keys[Number(i)]}}`);
}

/**
 * Make the City style's relative URLs absolute. Returns a new object; the input is not changed.
 * @param {any} style the parsed root.json
 * @param {string} [styleUrl] where root.json was fetched from
 * @param {string} [tilePath] the service JSON's `tiles` entry
 */
export function absolutizeCityStyle(style, styleUrl = CITY_STYLE_URL, tilePath = CITY_TILE_PATH) {
	const out = structuredClone(style);
	for (const [id, src] of Object.entries(out.sources ?? {})) {
		const s = /** @type {any} */ (src);
		if (s.type !== 'vector') continue;
		if (typeof s.url === 'string') {
			// The url names the service root; make it end in "/" so the tile path resolves inside it.
			const root = resolveTemplate(s.url, styleUrl).replace(/\/?$/, '/');
			delete s.url;
			s.tiles = [resolveTemplate(tilePath, root)];
		} else if (Array.isArray(s.tiles)) {
			s.tiles = s.tiles.map((/** @type {string} */ t) => resolveTemplate(t, styleUrl));
		} else {
			throw new Error(`City basemap source ${id} has neither url nor tiles`);
		}
		if (id === 'esri') s.attribution = CITY_ATTRIBUTION;
	}
	if (typeof out.sprite === 'string') out.sprite = resolveTemplate(out.sprite, styleUrl);
	if (typeof out.glyphs === 'string') out.glyphs = resolveTemplate(out.glyphs, styleUrl);
	return out;
}

/**
 * Hide the busiest City layers and lighten buildings (see CITY_HIDDEN_LAYERS). Mutates `style`.
 * @param {any} style
 */
export function quietCityStyle(style) {
	for (const l of style.layers ?? []) {
		if (CITY_HIDDEN_LAYERS.includes(l.id)) l.layout = { ...(l.layout ?? {}), visibility: 'none' };
		else if (l.type === 'fill' && l.id.startsWith('Buildings/')) l.paint = { ...(l.paint ?? {}), 'fill-opacity': CITY_BUILDING_OPACITY };
	}
	return style;
}

/** True if `s` looks like a usable MapLibre style. @param {any} s */
export function isUsableStyle(s) {
	return !!s && s.version === 8 && s.sources && typeof s.sources === 'object' && Array.isArray(s.layers) && s.layers.length > 0;
}

/**
 * @template T
 * @param {Promise<T>} p
 * @param {number} ms
 * @returns {Promise<T>}
 */
function withTimeout(p, ms) {
	return new Promise((res, rej) => {
		const t = setTimeout(() => rej(new Error(`timed out after ${ms} ms`)), ms);
		p.then(
			(v) => (clearTimeout(t), res(v)),
			(e) => (clearTimeout(t), rej(e))
		);
	});
}

/**
 * Pick the basemap. Fetches the City style and one City tile in parallel; if either fails, times
 * out or the style is not a usable v8 style, returns the OpenFreeMap style URL instead.
 * @param {{ fetch?: typeof fetch, timeoutMs?: number }} [opts]
 * @returns {Promise<{ kind: 'city' | 'fallback', style: any, reason?: string }>}
 */
export async function chooseBasemap({ fetch: f = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
	try {
		const ok = (/** @type {Response} */ r) => {
			if (!r.ok) throw new Error(`HTTP ${r.status} from ${r.url || 'the City basemap'}`);
			return r;
		};
		const [style] = await withTimeout(
			Promise.all([
				f(CITY_STYLE_URL).then(ok).then((r) => r.json()),
				f(`${CITY_SERVICE_URL}/${CITY_PROBE_TILE}`).then(ok)
			]),
			timeoutMs
		);
		if (!isUsableStyle(style)) throw new Error('the City style is not a usable MapLibre style');
		return { kind: 'city', style: quietCityStyle(absolutizeCityStyle(style)) };
	} catch (err) {
		return { kind: 'fallback', style: FALLBACK_STYLE_URL, reason: /** @type {Error} */ (err).message };
	}
}

/** One sentence for the map page's status line. @param {'city' | 'fallback'} kind */
export function basemapNote(kind) {
	return kind === 'city'
		? "Street map: the City's own basemap (NYC OTI)."
		: "The City's basemap did not load, so this map uses OpenFreeMap (OpenStreetMap data) instead.";
}
