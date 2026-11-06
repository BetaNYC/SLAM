// Links to the one address page (#84), for components. Kept apart from addressPage.js because
// $app/paths only exists inside SvelteKit, and addressPage.js is unit-tested in plain Node.
import { resolve } from '$app/paths';
import { addressPath } from './addressPage.js';

/** @param {string} id @param {Record<string, string>} [extra] */
export function addressHref(id, extra) {
	return addressPath(resolve('/address', {}), id, extra);
}
