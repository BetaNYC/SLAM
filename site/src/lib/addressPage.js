// One address page for every address (#84): pure logic behind src/routes/address/+page.svelte,
// unit-tested in tests/addressPage.test.js.
//
// The page is /address/?id=<id>. It is prerendered once as an empty shell; the browser reads the
// id from the query string and fetches the pipeline's static/data/address/<id>.json, the same file
// the map side panel uses (MapPanel.svelte). Old /address/<id>/ links are forwarded to it by
// static/404.html, which GitHub Pages serves for any path that has no file.

/** Page ids are a 7-digit BIN or the pipeline's 10-character address key. Anything else is refused
 * before a fetch, so an id can never become a path outside data/address/. */
export const ADDRESS_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

/** @param {unknown} id */
export function validId(id) {
	return typeof id === 'string' && ADDRESS_ID_RE.test(id) ? id : null;
}

/**
 * What the address page was asked for. `near` is set by the search box when it fell back to the
 * nearest page (#59): the searched label `q` and the distance `m` in metres.
 * @param {{get(name: string): string | null}} params URLSearchParams, or SvelteKit's read-only page.url.searchParams
 * @returns {{id: string | null, raw: string, near: {q: string, m: string} | null}}
 */
export function readAddressQuery(params) {
	const raw = params.get('id') ?? '';
	const q = params.get('q') ?? '';
	const m = params.get('m') ?? '';
	return { id: validId(raw), raw, near: q && /^\d{1,4}$/.test(m) ? { q, m } : null };
}

/**
 * Link to an address page. `root` is resolve('/address') from $app/paths (with or without its
 * trailing slash); the result always has one, as the site's trailingSlash = 'always' wants.
 * @param {string} root
 * @param {string} id
 * @param {Record<string, string>} [extra] e.g. {q, m} from the search box
 */
export function addressPath(root, id, extra = {}) {
	const dir = root.endsWith('/') ? root : `${root}/`;
	return `${dir}?${new URLSearchParams({ id, ...extra })}`;
}

/** Path of an address's data file, relative to the site root (pass it through asset()).
 * @param {string} id */
export function addressDataPath(id) {
	return `data/address/${id}.json`;
}

/**
 * Fetch one address's data file and say plainly what happened.
 * - ok: the file loaded and is the address asked for.
 * - missing: the site has no file for that id (HTTP 404), or the id is not a valid page id.
 * - error: anything else (offline, a server error, a broken file); worth a retry.
 * @param {typeof fetch} fetchFn
 * @param {string | null} id a validId() result
 * @param {(path: string) => string} [toUrl] maps addressDataPath() to a URL, e.g. asset()
 * @returns {Promise<{kind: 'ok', a: any} | {kind: 'missing'} | {kind: 'error', message: string}>}
 */
export async function loadAddress(fetchFn, id, toUrl = (p) => `/${p}`) {
	if (!id) return { kind: 'missing' };
	let res;
	try {
		res = await fetchFn(toUrl(addressDataPath(id)));
	} catch {
		return { kind: 'error', message: 'The address data could not be downloaded. Check your connection and try again.' };
	}
	if (res.status === 404) return { kind: 'missing' };
	if (!res.ok) return { kind: 'error', message: `The address data could not be downloaded (HTTP ${res.status}). Try again.` };
	try {
		const a = await res.json();
		if (!a || a.id !== id || !Array.isArray(a.records)) throw new Error('unexpected file');
		return { kind: 'ok', a };
	} catch {
		return { kind: 'error', message: 'The address data file could not be read. Try again.' };
	}
}
