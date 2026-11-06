// Stand-in for SvelteKit's $app/paths in Node tests (see svelteHooks.js). Site served at the root.
/** @param {string} route @param {Record<string, string>} [params] */
export function resolve(route, params = {}) {
	return route.replace(/\[(\w+)\]/g, (_, k) => encodeURIComponent(params[k] ?? ''));
}
/** @param {string} p */
export function asset(p) {
	return `/${p.replace(/^\//, '')}`;
}
