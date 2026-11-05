// Render the address page body (AddressView.svelte) for one address from the real pipeline output,
// with the same props src/routes/address/+page.svelte passes it in the browser (#84).
import { readFileSync } from 'node:fs';
import { renderFile } from './renderSvelte.js';
import { load } from '../../src/routes/address/+page.server.js';

const manifest = JSON.parse(readFileSync('static/data/manifest.json', 'utf8'));
const { sw } = load();

/** @param {any} a an address/<id>.json file @param {{q: string, m: string} | null} [near] */
export function renderAddress(a, near = null) {
	return renderFile('src/routes/address/AddressView.svelte', { a, manifest, sw, district: manifest.districts[a.district], slug: a.district, near });
}

/** @param {string} id */
export function readAddress(id) {
	return JSON.parse(readFileSync(`static/data/address/${id}.json`, 'utf8'));
}
