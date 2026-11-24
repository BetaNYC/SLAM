/**
 * Data helpers for the second district map (#134).
 *
 * The map's record dots come from the district's list.json, not points.geojson, so a license
 * popup can show its type and its date (Expires / Received / Expiration date). points.geojson is
 * built from the same rows with the same coordinates (pipeline/build.py: plon/plat when present,
 * else lon/lat; rows without lon are left out), so the dots land where they do on the first map.
 */

export const RECORD_SOURCES = ['liquor_active', 'liquor_pending', 'liquor_inactive', 'cannabis_retail', 'cannabis_license', 'dining_out'];

/**
 * One point per record with coordinates, as points.geojson has, plus the fields a popup shows.
 * @param {Record<string, any[]>} list  the district's list.json
 */
export function recordPoints(list) {
	const features = [];
	for (const source of RECORD_SOURCES)
		for (const r of list[source] ?? []) {
			if (r.lon == null) continue;
			features.push({
				type: 'Feature',
				geometry: { type: 'Point', coordinates: [r.plon ?? r.lon, r.plat ?? r.lat] },
				properties: { source, name: r.name ?? '', aid: r.aid ?? '', street: r.street ?? '', status: r.status ?? '', type: r.type ?? '', date: r.date ?? '', date_label: r.date_label ?? '', rid: r.rid ?? '' }
			});
		}
	return { type: 'FeatureCollection', features };
}

/** Today in New York, YYYY-MM-DD. @param {Date} [now] */
export const nycToday = (now = new Date()) => now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

/** A YYYY-MM-DD date `months` later (the day is kept, or the month's last day). @param {string} ymd @param {number} months */
export function addMonths(ymd, months) {
	const [y, m, d] = ymd.split('-').map(Number);
	const last = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
	return new Date(Date.UTC(y, m - 1 + months, Math.min(d, last))).toISOString().slice(0, 10);
}

/**
 * Active liquor licenses whose expiration date is from today through six months from today.
 * @param {any[]} active  list.json liquor_active rows @param {string} today  YYYY-MM-DD
 */
export function expiringSoon(active, today, months = 6) {
	const until = addMonths(today, months);
	return active.filter((r) => r.date_label === 'Expires' && r.date >= today && r.date <= until).length;
}

/** The deepest pile: the most complaints at one point, so map2 can draw one chip layer per level. @param {{features: any[]}} fc */
export function maxPile(fc) {
	/** @type {Map<string, number>} */
	const n = new Map();
	let max = 0;
	for (const f of fc.features) {
		const c = f.geometry?.coordinates;
		if (!c) continue;
		const k = `${c[0].toFixed(6)},${c[1].toFixed(6)}`;
		const v = (n.get(k) ?? 0) + 1;
		n.set(k, v);
		if (v > max) max = v;
	}
	return max;
}
