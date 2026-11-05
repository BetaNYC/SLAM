import { readData } from '#lib/server/data.js';

/** One page per grouped address in the pipeline's index. */
export function entries() {
	return readData('address/index.json').map((/** @type {{id: string}} */ a) => ({ id: a.id }));
}

/** @param {{params: {id: string}}} e */
export function load({ params }) {
	const manifest = readData('manifest.json');
	const a = readData(`address/${params.id}.json`);
	// Only what the "Schools and houses of worship nearby" section reads (#60). The full statute
	// text is on /rules/ only (QA of #66: it was copied into all 1,169 address pages).
	const { rules, cannabis_rules, cannabis_school_ft, cannabis_worship_ft, list_ft, liquor_count_ft, on_premises_classes } = manifest.schools_worship;
	/** @type {Record<string, string>} */
	const classes = {};
	for (const r of a.sw?.liq?.rows ?? []) classes[r.code] = on_premises_classes[r.code];
	const rule = { law: rules.law, url: rules.url };
	return { a, district: manifest.districts[a.district], slug: a.district, sw: { rule, list_ft, liquor_count_ft, on_premises_classes: classes, cannabis: a.cannabis_sw ? { rule: { law: cannabis_rules.law, url: cannabis_rules.url }, school_ft: cannabis_school_ft, worship_ft: cannabis_worship_ft } : null } };
}
