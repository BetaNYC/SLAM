/** Display metadata per record source. Keys match pipeline/slam_pipeline/sources.py. */
/** @type {Record<string, string>} */
export const SOURCE_LABEL = {
	liquor_pending: 'Liquor license application (pending)',
	liquor_active: 'Liquor license (active)',
	liquor_inactive: 'Liquor license (inactive)',
	cannabis_retail: 'Cannabis retail dealer (registered)',
	cannabis_license: 'Cannabis license (OCM)',
	dining_out: 'Dining Out NYC (outdoor dining)',
	street_events: 'Permitted street event',
	complaints_311: '311 complaints (bar, club, restaurant locations, and outdoor dining)',
	restaurant_inspections: 'Restaurant health inspections (DOHMH)',
	co_dobnow: 'Certificates of occupancy (DOB NOW)'
};

/** @type {Record<string, string>} */
export const SOURCE_SHORT = {
	liquor_pending: 'Liquor, pending',
	liquor_active: 'Liquor, active',
	liquor_inactive: 'Liquor, inactive',
	cannabis_retail: 'Cannabis retail',
	cannabis_license: 'Cannabis license',
	dining_out: 'Dining Out',
	street_events: 'Street event',
	complaints_311: '311 complaints'
};

/**
 * Map and badge colors per record source. One palette with the 311 groups (C311_GROUPS), the
 * schools and worship points (SW_COLOR) and the distance rings (RING_COLOR in #lib/rings.js),
 * checked together in tests/mapPalette.test.js (#111 color revision, 2026-11-07): every pair that
 * can be on the map at once is at least CIEDE2000 15 apart, and look-alike marks stay apart under
 * simulated protanopia, deuteranopia and tritanopia too. Groups share a hue family: liquor is
 * blue and violet (active is BetaNYC Blue), cannabis is green, 311 is warm. Record colors carry
 * white badge text, so each is >= 4.5:1 against white.
 */
/** @type {Record<string, string>} */
export const SOURCE_COLOR = {
	liquor_pending: '#5a0393',
	liquor_active: '#2359a8', // BetaNYC Blue
	liquor_inactive: '#74758b',
	cannabis_retail: '#578313',
	cannabis_license: '#2b5b37',
	dining_out: '#bd1b64',
	complaints_311: '#c06e39' // the 311 "noise" color, the group's first
};

/**
 * Record sources drawn as an open circle (white center, colored edge) on the map, a shape cue as
 * well as color: pending and active liquor are both in the liquor family and are the one pair
 * that stays close under red-green color blindness.
 */
export const SOURCE_HOLLOW = ['liquor_pending'];

/**
 * 311 complaint groups on the map, in v1's order (#73). v1 colored its bar/club/restaurant layer
 * by "Noise - Commercial" and "Drinking", and had a separate Open Restaurants layer; "Outdoor
 * Dining" (DOT) is the one Open Restaurants type that still occurs. Everything else is "Other".
 * Keys are exact erm2-nwe9 complaint_type strings.
 * @type {{key: string, types: string[], label: string, color: string}[]}
 */
export const C311_GROUPS = [
	{ key: 'noise', types: ['Noise - Commercial'], label: 'Noise (commercial)', color: '#c06e39' },
	{ key: 'drinking', types: ['Drinking'], label: 'Drinking', color: '#b71a03' },
	{ key: 'dining', types: ['Outdoor Dining'], label: 'Outdoor dining', color: '#583321' },
	{ key: 'other', types: [], label: 'Other (health, smoking and more)', color: '#617876' }
];

/** @param {string | undefined} type  a 311 complaint_type */
export function c311Group(type) {
	return C311_GROUPS.find((g) => g.types.includes(type ?? '')) ?? C311_GROUPS[C311_GROUPS.length - 1];
}

/** MapLibre expression coloring a 311 dot by its complaint type (property `t`). */
export function c311ColorExpr() {
	/** @type {any[]} */
	const e = ['match', ['get', 't']];
	for (const g of C311_GROUPS) for (const t of g.types) e.push(t, g.color);
	e.push(C311_GROUPS[C311_GROUPS.length - 1].color);
	return e;
}

/**
 * Column headers for a 311 count table: one per year, the last marked "to date".
 * @param {number[]} years
 * @param {string} through  newest complaint date in the data, YYYY-MM-DD
 */
export function yearHeaders(years, through) {
	const last = years[years.length - 1];
	return years.map((y) => ({
		key: String(y),
		label: String(y),
		sub: y === last && through && through.startsWith(String(y)) ? `to date (through ${through})` : ''
	}));
}

/**
 * Column totals for a 311 count table.
 * @param {{by_year: Record<string, number>, total: number}[]} rows
 * @param {number[]} years
 */
export function yearTotals(rows, years) {
	/** @type {Record<string, number>} */
	const t = { total: 0 };
	for (const y of years) t[String(y)] = 0;
	for (const r of rows) {
		for (const y of years) t[String(y)] += r.by_year[String(y)] ?? 0;
		t.total += r.total;
	}
	return t;
}

/** @param {string | undefined} s */
export function fmtDate(s) {
	return s ? s.slice(0, 10) : '';
}

/** @param {Record<string, any>} r */
export function addressLine(r) {
	return [r.street, r.street2].filter(Boolean).join(', ');
}

/**
 * RFC 4180 CSV.
 * @param {Record<string, any>[]} rows
 * @param {string[]} cols
 */
export function toCsv(rows, cols) {
	/** @param {any} v */
	const esc = (v) => {
		const s = v == null ? '' : Array.isArray(v) ? v.join(';') : String(v);
		return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
	};
	return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\r\n');
}

/**
 * @param {string} filename
 * @param {string} text
 */
export function downloadText(filename, text) {
	const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
}

/** @param {string} iso */
export function fmtStamp(iso) {
	if (!iso) return 'unknown';
	return new Date(iso).toLocaleString('en-US', {
		timeZone: 'America/New_York',
		dateStyle: 'medium',
		timeStyle: 'short'
	});
}

/**
 * DOB BIS "C of O PDF Listing for Property" for a building. URL pattern from v1
 * (Layer_SLA.svelte), opened and confirmed on 2026-11-04 for BIN 1089309 (185 Greenwich St:
 * "no certificates of occupancy on file") and BIN 3071959 (44 Wilson Ave: one CO PDF).
 * The page itself says COs requested on or after March 1, 2021 are in DOB NOW.
 * @param {string | null | undefined} bin
 */
export function coBisUrl(bin) {
	return bin && /^[1-5]\d{6}$/.test(bin)
		? `https://a810-bisweb.nyc.gov/bisweb/COsByLocationServlet?requestid=1&allbin=${bin}`
		: null;
}

/** DOB NOW public portal. Its BIN search is a form with no URL of its own, so we link the portal. */
export const DOB_NOW_PORTAL = 'https://a810-dobnow.nyc.gov/publish/Index.html#!/';

/**
 * ABC Eats page for one restaurant. Pattern is the one ABC Eats' own search results link to
 * (`#!/Search/<camis>`), opened cold and confirmed on 2026-11-04 for camis 50036043 (The Malt
 * House) and 50165612 (La Cafeteria). v1's `#/Search/<camis>` now falls back to the search form.
 * @param {string | null | undefined} camis
 */
export function abcEatsUrl(camis) {
	return camis && /^\d{1,10}$/.test(camis)
		? `https://a816-health.nyc.gov/ABCEatsRestaurants/#!/Search/${camis}`
		: null;
}

/** DOHMH grade codes, from the 43nn-pn8j `grade` column description. */
/** @type {Record<string, string>} */
export const GRADE_LABEL = {
	A: 'A',
	B: 'B',
	C: 'C',
	Z: 'Grade pending',
	P: 'Grade pending (re-opening)',
	N: 'Not yet graded'
};

/** Schools and houses of worship (#60). */
/** @type {Record<string, string>} */
// worship = PLUTO class M1 ("Church, Synagogue, Chapel"). religious = M2, M3, M4, M9, which PLUTO
// does not call a place of worship (M3 is "Parsonage, Rectory", M4 "Convents").
export const SW_KIND = { school: 'School', worship: 'House of worship', religious: 'Other religious property' };

/**
 * Map colors, >= 3:1 against the light basemap. School is BetaNYC Dark Gray (bnyc-dark-gray).
 * Checked with the rest of the palette in tests/mapPalette.test.js.
 */
/** @type {Record<string, string>} */
export const SW_COLOR = { school: '#414141', worship: '#c75bd3', religious: '#918267' };

/**
 * The "same street" cell. `true` / `false` / `null` from the pipeline's `same_street`. False only
 * says the records list different street names: a corner building fronts two streets.
 * @param {boolean | null | undefined} v
 */
export function sameStreetLabel(v) {
	if (v === true) return 'Same street name';
	if (v === false) return 'Different street name in the records';
	return 'Not known';
}

/**
 * Display name of a school or house of worship. PLUTO lots have no name, so a house of worship
 * is named by its address.
 * @param {{kind: string, name?: string, street?: string}} f
 */
export function swName(f) {
	return f.name || (f.street ? `${f.street} (no name in PLUTO)` : '(no name in PLUTO)');
}

/** SLA liquor record sources (#63). */
export const SLA_SOURCES = ['liquor_pending', 'liquor_active', 'liquor_inactive'];

/**
 * LAMP opened on one license's own record (#63), with the Web AppBuilder `query` URL parameter
 * ("<layer id>,<field>,<value>"). `lampQuery` is the manifest's `sla_license.lamp_query`, which
 * the build fills only for layer ids it found in LAMP's web map; without it there is no link.
 * @param {string} source  liquor_active | liquor_pending | liquor_inactive
 * @param {string | undefined} id  license or application ID
 * @param {Record<string, {layer_id: string, field: string}> | undefined} lampQuery
 */
export function lampRecordUrl(source, id, lampQuery) {
	const q = lampQuery?.[source];
	if (!q || !id) return null;
	return `https://lamp.sla.ny.gov/?query=${q.layer_id},${q.field},${encodeURIComponent(id)}`;
}

/**
 * BetaNYC's Boundaries Map with a pin at a point (#77). Boundaries Map reads ?lng=&lat= on load
 * (BetaNYC/nyc-boundaries frontend/src/stores.ts, selectedCoordinates) and lists every district
 * that contains the point (components/Sidebar/CoordinateDetails.svelte).
 * @param {number | null | undefined} lon
 * @param {number | null | undefined} lat
 */
export function boundariesUrl(lon, lat) {
	if (typeof lon !== 'number' || typeof lat !== 'number') return null;
	if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon) > 180 || Math.abs(lat) > 90) return null;
	if (lon === 0 && lat === 0) return null;
	const r = (/** @type {number} */ v) => String(Number(v.toFixed(6)));
	return `https://boundaries.beta.nyc/?lng=${r(lon)}&lat=${r(lat)}`;
}

/**
 * LAMP, SLA's map, centered on a license's point (#63). Esri Web AppBuilder's documented
 * `center` (geographic x,y: longitude first) and `level` parameters,
 * https://doc.arcgis.com/en/web-appbuilder/latest/manage-apps/app-url-parameters.htm
 * (read 2026-11-04); v1 used the same pattern. It opens a map location, not the license
 * record. The `query=<layer id>,...` form is not used: it depends on an internal layer id.
 * Coordinates are rounded to 5 decimals (about 1 m), the precision of the SLA georeference.
 * No point, or a point outside the valid range, gives no link.
 * @param {number | null | undefined} lon
 * @param {number | null | undefined} lat
 * @param {number} [level]
 */
export function lampUrl(lon, lat, level = 18) {
	if (typeof lon !== 'number' || typeof lat !== 'number') return null;
	if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon) > 180 || Math.abs(lat) > 90) return null;
	if (lon === 0 && lat === 0) return null; // 0,0 is a missing point, not a place
	const r = (/** @type {number} */ v) => String(Number(v.toFixed(5)));
	return `https://lamp.sla.ny.gov/?center=${r(lon)},${r(lat)}&level=${level}`;
}
