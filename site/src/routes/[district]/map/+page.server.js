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
	const { buffer_ft, list_ft, cannabis_school_ft, cannabis_worship_ft } = manifest.schools_worship;
	// Ring radii for #111 are the manifest's own, the same numbers the address and rules pages use.
	return { slug: params.district, district, sw_buffer_ft: buffer_ft, ring_ft: { list_ft, cannabis_school_ft, cannabis_worship_ft } };
}
