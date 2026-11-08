// An address on a district line (#88): what its page says. Pure logic, unit-tested in
// tests/districtLine.test.js; AddressView.svelte renders it.
//
// The pipeline lists an address in every district SLAM builds whose line is within
// manifest.district_lines.boundary_ft of the City's address point for it
// (pipeline/slam_pipeline/districts.py, BOUNDARY_FT). The address file then has:
//   listed_in: the built districts it is listed in, its own district first
//   line: {note: 'On the line between Brooklyn CD 3 and CD 4', districts: [{slug, label, built}]}

/**
 * @param {any} a an address/<id>.json file
 * @param {Record<string, {label: string}>} built manifest.districts (the districts SLAM builds)
 * @returns {{note: string, listed: {slug: string, label: string}[], notBuilt: string[]} | null}
 *   null when the address is not on a district line
 */
export function districtLine(a, built) {
	if (!a?.line?.note) return null;
	const listed = (a.listed_in ?? [a.district])
		.filter((/** @type {string} */ s) => built[s])
		.map((/** @type {string} */ s) => ({ slug: s, label: built[s].label }));
	const notBuilt = (a.line.districts ?? [])
		.filter((/** @type {any} */ d) => !d.built)
		.map((/** @type {any} */ d) => d.label);
	return { note: a.line.note, listed, notBuilt };
}

/** 'A', 'A and B', 'A, B and C'
 * @param {string[]} xs */
export function joinAnd(xs) {
	return xs.length < 3 ? xs.join(' and ') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}
