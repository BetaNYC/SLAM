import { readData } from '#lib/server/data.js';

/** One page per grouped address in the pipeline's index. */
export function entries() {
	return readData('address/index.json').map((/** @type {{id: string}} */ a) => ({ id: a.id }));
}

/** @param {{params: {id: string}}} e */
export function load({ params }) {
	const manifest = readData('manifest.json');
	const a = readData(`address/${params.id}.json`);
	return { a, district: manifest.districts[a.district], slug: a.district };
}
