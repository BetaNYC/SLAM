import { readData } from '#lib/server/data.js';

/** One page per grouped address in the pipeline's index. */
export function entries() {
	return readData('address/index.json').map((/** @type {{id: string}} */ a) => ({ id: a.id }));
}

/** @param {{params: {id: string}}} e */
export function load({ params }) {
	const manifest = readData('manifest.json');
	const a = readData(`address/${params.id}.json`);
	// Only what the "Schools and houses of worship nearby" section reads (#60).
	const { rules, list_ft, liquor_count_ft, on_premises_classes } = manifest.schools_worship;
	/** @type {Record<string, string>} */
	const classes = {};
	for (const r of a.sw?.liq?.rows ?? []) classes[r.code] = on_premises_classes[r.code];
	return { a, district: manifest.districts[a.district], slug: a.district, sw: { rules, list_ft, liquor_count_ft, on_premises_classes: classes } };
}
