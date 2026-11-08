import { readData } from '#lib/server/data.js';

/** Ring radii for the "Distance rings" entry (#111): the manifest's own, as on the map page. */
export function load() {
	const { list_ft, cannabis_school_ft, cannabis_worship_ft } = readData('manifest.json').schools_worship;
	return { ring_ft: { list_ft, cannabis_school_ft, cannabis_worship_ft } };
}
