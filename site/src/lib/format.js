/** Display metadata per record source. Keys match pipeline/slam_pipeline/sources.py. */
/** @type {Record<string, string>} */
export const SOURCE_LABEL = {
	liquor_pending: 'Liquor license application (pending)',
	liquor_active: 'Liquor license (active)',
	liquor_inactive: 'Liquor license (inactive)',
	cannabis_retail: 'Cannabis retail dealer (registered)',
	cannabis_license: 'Cannabis license (OCM)',
	dining_out: 'Dining Out NYC (outdoor dining)',
	street_events: 'Permitted street event'
};

/** @type {Record<string, string>} */
export const SOURCE_SHORT = {
	liquor_pending: 'Liquor, pending',
	liquor_active: 'Liquor, active',
	liquor_inactive: 'Liquor, inactive',
	cannabis_retail: 'Cannabis retail',
	cannabis_license: 'Cannabis license',
	dining_out: 'Dining Out',
	street_events: 'Street event'
};

/** Colors chosen for >= 3:1 contrast against the light basemap. */
/** @type {Record<string, string>} */
export const SOURCE_COLOR = {
	liquor_pending: '#c2410c',
	liquor_active: '#1a5ccf',
	liquor_inactive: '#6b7280',
	cannabis_retail: '#15803d',
	cannabis_license: '#4d7c0f',
	dining_out: '#7e22ce'
};

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
