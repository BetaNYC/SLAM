import { readData } from '#lib/server/data.js';

export function load() {
	// schools_worship (#60) is only needed on address pages, which load the parts they use;
	// leaving it out here keeps it out of every other page's data.
	const { schools_worship, ...manifest } = readData('manifest.json');
	void schools_worship;
	return { manifest };
}
