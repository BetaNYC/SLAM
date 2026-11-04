// Address search (#59): pure logic behind AddressSearch.svelte, unit-tested in
// tests/addressSearch.test.js against recorded real GeoSearch responses.
//
// GeoSearch v2 is keyless. Endpoints, the `text` parameter and the GeoJSON response
// (features[].properties.label, geometry [lon, lat]) are from the official docs source,
// https://github.com/NYCPlanning/labs-geosearch-docs (src/pages/docs.js). The BIN is PAD's
// `properties.addendum.pad.bin`, seen in every recorded response (tests/fixtures/).
// The docs ask clients to throttle typing and to expect out-of-order responses; both
// are handled here (debounce in the component, `makeSequencer` for ordering).

export const GEOSEARCH = 'https://geosearch.planninglabs.nyc/v2';
export const MIN_CHARS = 2;
export const MAX_SUGGESTIONS = 5;
export const DEBOUNCE_MS = 250;

/** Fetch options for every GeoSearch call: nothing typed is kept by the browser cache,
 * no cookies, no referrer (so GeoSearch does not learn which page you were on). */
export const FETCH_OPTS = /** @type {RequestInit} */ ({ cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });

/** @param {string} text */
export function autocompleteUrl(text) {
	return `${GEOSEARCH}/autocomplete?` + new URLSearchParams({ text: text.trim() });
}

/** Full-text search, used when Enter is pressed with no suggestion highlighted.
 * @param {string} text */
export function searchUrl(text) {
	return `${GEOSEARCH}/search?` + new URLSearchParams({ text: text.trim(), size: '1' });
}

/** @param {string} text */
export function shouldQuery(text) {
	return text.trim().length >= MIN_CHARS;
}

/** Same rule as the pipeline's transform.real_bin: 7 digits, borough 1-5, and not a
 * placeholder "million BIN" (x000000).
 * @param {unknown} b */
export function realBin(b) {
	const s = String(b ?? '').trim();
	return /^[1-5]\d{6}$/.test(s) && s.slice(1) !== '000000' ? s : null;
}

/**
 * @typedef {{label: string, bin: string | null, lon: number, lat: number}} Suggestion
 * @param {any} geojson a GeoSearch /v2/autocomplete or /v2/search response
 * @returns {Suggestion[]}
 */
export function toSuggestions(geojson) {
	/** @type {Suggestion[]} */
	const out = [];
	const seen = new Set();
	for (const f of geojson?.features ?? []) {
		const p = f?.properties ?? {};
		const c = f?.geometry?.coordinates;
		if (!p.label || !Array.isArray(c)) continue;
		const label = String(p.label).replace(/, USA$/, '');
		if (seen.has(label)) continue;
		seen.add(label);
		out.push({ label, bin: realBin(p.addendum?.pad?.bin), lon: Number(c[0]), lat: Number(c[1]) });
		if (out.length === MAX_SUGGESTIONS) break;
	}
	return out;
}

/** Great-circle distance in metres (haversine, mean Earth radius 6,371,008.8 m).
 * @param {number} lon1 @param {number} lat1 @param {number} lon2 @param {number} lat2 */
export function distanceM(lon1, lat1, lon2, lat2) {
	const r = Math.PI / 180;
	const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
	return 2 * 6371008.8 * Math.asin(Math.sqrt(a));
}

/**
 * Where a picked suggestion goes. `index` is the pipeline's static/data/bin-index.json:
 * {radius_m, bins: {bin: pageId}, points: [[pageId, lon, lat], ...]}.
 * 1. The page for its BIN, if there is one.
 * 2. Otherwise the nearest page point within index.radius_m.
 * 3. Otherwise nothing.
 * @param {Suggestion} s
 * @param {{radius_m: number, bins: Record<string, string>, points: [string, number, number][]}} index
 * @returns {{kind: 'page', id: string} | {kind: 'near', id: string, m: number} | {kind: 'none'}}
 */
export function resolvePick(s, index) {
	if (s.bin && index.bins[s.bin]) return { kind: 'page', id: index.bins[s.bin] };
	let best = null;
	let bestM = Infinity;
	for (const [id, lon, lat] of index.points) {
		if (Math.abs(lat - s.lat) > 0.001 || Math.abs(lon - s.lon) > 0.0015) continue; // ~110 m prefilter
		const m = distanceM(s.lon, s.lat, lon, lat);
		if (m < bestM) [best, bestM] = [id, m];
	}
	if (best !== null && bestM <= index.radius_m) return { kind: 'near', id: best, m: Math.round(bestM) };
	return { kind: 'none' };
}

/** Ray casting on one ring of [lon, lat] pairs.
 * @param {number} x @param {number} y @param {number[][]} ring */
function inRing(x, y, ring) {
	let inside = false;
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
		const [xi, yi] = ring[i];
		const [xj, yj] = ring[j];
		if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
	}
	return inside;
}

/** Which pilot district a point falls in, from static/data/districts.geojson; null if none.
 * @param {number} lon @param {number} lat @param {any} districts */
export function districtAt(lon, lat, districts) {
	for (const f of districts?.features ?? []) {
		const g = f.geometry;
		const polys = g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' ? g.coordinates : [];
		for (const [outer, ...holes] of polys) {
			if (inRing(lon, lat, outer) && !holes.some((/** @type {number[][]} */ h) => inRing(lon, lat, h))) return f.properties.slug;
		}
	}
	return null;
}

/**
 * Keyboard model for the WAI-ARIA combobox pattern (list autocomplete, manual selection):
 * https://www.w3.org/WAI/ARIA/apg/patterns/combobox/
 * Returns the next highlighted option index (-1 = none, focus stays in the input).
 * @param {string} key @param {number} active @param {number} count
 */
export function nextActive(key, active, count) {
	if (count === 0) return -1;
	if (key === 'ArrowDown') return active < 0 || active >= count - 1 ? 0 : active + 1;
	if (key === 'ArrowUp') return active <= 0 ? count - 1 : active - 1;
	return active;
}

/** Text for the polite live region after suggestions arrive.
 * @param {number} n */
export function countMessage(n) {
	if (n === 0) return 'No suggestions.';
	return `${n} suggestion${n === 1 ? '' : 's'}. Use up and down arrows to choose, Enter to open.`;
}

/** Guards against out-of-order responses: only the latest request may update the list. */
export function makeSequencer() {
	let n = 0;
	return {
		next: () => ++n,
		/** @param {number} id */
		isCurrent: (id) => id === n
	};
}
