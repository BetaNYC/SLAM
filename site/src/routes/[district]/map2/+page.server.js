import { error } from '@sveltejs/kit';
import { readData } from '#lib/server/data.js';

/** Phase 1 of #134: Brooklyn CD 9 only. Other districts come after Board 9's feedback. */
const MAP2_DISTRICTS = ['bk-cd9'];

export function entries() {
	const built = readData('manifest.json').districts;
	return MAP2_DISTRICTS.filter((d) => d in built).map((district) => ({ district }));
}

/** @param {{params: {district: string}}} e */
export function load({ params }) {
	const manifest = readData('manifest.json');
	const district = manifest.districts[params.district];
	if (!district || !MAP2_DISTRICTS.includes(params.district)) error(404, 'Unknown district');
	const { list_ft, cannabis_school_ft, cannabis_worship_ft } = manifest.schools_worship;
	// Ring radii are the manifest's own, as on the first district map (#111).
	return { slug: params.district, district, ring_ft: { list_ft, cannabis_school_ft, cannabis_worship_ft }, c311: manifest.complaints_311 };
}
