// An independent great-circle distance for tests, so ring vertices are not checked with the code
// that made them. Haversine on the mean Earth radius (6,371,008.8 m), as in #lib/addressSearch.js.
/** @param {number[]} a [lon, lat] @param {number[]} b [lon, lat] */
export function haversineM(a, b) {
	const r = Math.PI / 180;
	const dLat = (b[1] - a[1]) * r;
	const dLon = (b[0] - a[0]) * r;
	const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLon / 2) ** 2;
	return 2 * 6371008.8 * Math.asin(Math.sqrt(h));
}
