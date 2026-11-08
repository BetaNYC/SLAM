// "See on map" from an address page (#118): a link to the district map, centered on the address,
// with the distance rings that fit what is at the address. Pure logic, unit-tested in
// tests/seeOnMap.test.js; AddressView.svelte renders the link.
//
// The link uses the map's own link format (buildHash in mapState.js), so there is one copy of it.

import { buildHash } from './mapState.js';
import { LICENSE_GROUPS } from './rings.js';

/**
 * The map's zoom when it centers on one address: the same zoom the map already uses for an address
 * found by the search box (`?lon=&lat=`, jumpTo zoom 17 in the map page). At 17 the ring labels
 * show (they start at zoom 16) and a 500 ft ring fits on a phone screen.
 */
export const ADDRESS_ZOOM = 17;

/**
 * Record layers that bring their group's rings with them. Liquor: pending applications and active
 * licenses. An inactive license is a past record, so it does not turn the rings on by itself.
 * Cannabis: every record, including licenses still In-Process.
 * @type {Record<'liquor' | 'cannabis', readonly string[]>}
 */
export const RING_LAYERS = Object.freeze({
	liquor: Object.freeze(['liquor_pending', 'liquor_active']),
	cannabis: Object.freeze(['cannabis_retail', 'cannabis_license'])
});

/**
 * The map state for an address: its point and zoom, the record layers that fit the rings, 311
 * complaints (on in the map's defaults too; Noel, 2026-11-07), schools and houses of worship, and
 * the matching ring toggles. `on` is null when nothing at the address
 * calls for rings, so the map keeps the person's saved layers or the defaults.
 * @param {{id: string, lat: number, lon: number, records: {source: string}[]}} a an address/<id>.json file
 * @returns {{view: {z: number, lat: number, lon: number}, on: string[] | null, sel: string, groups: ('liquor' | 'cannabis')[]}}
 */
export function mapLinkState(a) {
	const present = new Set((a.records ?? []).map((r) => r.source));
	/** @type {string[]} */
	const layers = [];
	/** @type {('liquor' | 'cannabis')[]} */
	const groups = [];
	for (const g of LICENSE_GROUPS) {
		const key = /** @type {'liquor' | 'cannabis'} */ (g.key);
		const here = RING_LAYERS[key].filter((k) => present.has(k));
		if (!here.length) continue;
		layers.push(...here);
		groups.push(key);
	}
	const on = groups.length ? [...layers, 'c311', 'sw', ...LICENSE_GROUPS.filter((g) => groups.includes(/** @type {any} */ (g.key))).map((g) => g.ringKey)] : null;
	return { view: { z: ADDRESS_ZOOM, lat: a.lat, lon: a.lon }, on, sel: a.id, groups };
}

/**
 * Link to the district map for an address, or null when the map cannot show it: no usable point,
 * a district SLAM does not cover, or a point outside the area SLAM pulls data for.
 * @param {any} a an address/<id>.json file
 * @param {readonly string[]} districts the district slugs SLAM covers (keys of manifest.districts)
 * @param {(slug: string) => string} [mapPath] the district map's path, e.g. from resolve('/[district]/map')
 * @returns {string | null}
 */
export function mapLinkFor(a, districts, mapPath = (slug) => `/${slug}/map`) {
	if (!a || typeof a.id !== 'string' || !districts.includes(a.district)) return null;
	if (!Number.isFinite(a.lat) || !Number.isFinite(a.lon)) return null;
	// The City's point is outside both districts and outside the data area (see the address page's note).
	if (a.point?.measured === false) return null;
	// The map only accepts views near New York City (parseHash); never write one it would drop.
	if (Math.abs(a.lat - 40.7) >= 1 || Math.abs(a.lon + 74) >= 1) return null;
	const s = mapLinkState(a);
	const path = mapPath(a.district);
	return `${path.endsWith('/') ? path : `${path}/`}#${buildHash({ view: s.view, on: s.on, sel: s.sel })}`;
}

/**
 * What the map will show, said after the link, e.g. "with the liquor distance rings on".
 * @param {('liquor' | 'cannabis')[]} groups from mapLinkState
 */
export function mapLinkNote(groups) {
	if (groups.length === 2) return 'the district map, with the liquor and cannabis distance rings on';
	if (groups.length === 1) return `the district map, with the ${groups[0]} distance rings on`;
	return 'the district map, with its usual layers';
}
