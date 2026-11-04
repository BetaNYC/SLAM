import { readData } from '#lib/server/data.js';

export function load() {
	return { manifest: readData('manifest.json') };
}
