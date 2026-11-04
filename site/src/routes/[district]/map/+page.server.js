import { error } from '@sveltejs/kit';
import { readData } from '#lib/server/data.js';

export function entries() {
	return Object.keys(readData('manifest.json').districts).map((district) => ({ district }));
}

/** @param {{params: {district: string}}} e */
export function load({ params }) {
	const manifest = readData('manifest.json');
	const district = manifest.districts[params.district];
	if (!district) error(404, 'Unknown district');
	return { slug: params.district, district, sw_buffer_ft: manifest.schools_worship.buffer_ft };
}
