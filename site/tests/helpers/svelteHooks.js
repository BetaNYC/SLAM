// Node module hooks so tests can render .svelte components with svelte/server (#84).
// The address page is now rendered in the browser, so there is no prerendered HTML per address
// to read; tests render AddressView.svelte from the real pipeline output instead.
// - `.svelte` files are compiled for the server with the project's own Svelte compiler.
// - `$app/paths` (SvelteKit-only) is replaced by appPathsStub.js, which builds the same
//   root-relative links SvelteKit does for this site (no base path).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compile } from 'svelte/compiler';

/** @type {import('node:module').ResolveHook} */
export async function resolve(specifier, context, next) {
	if (specifier === '$app/paths') return { url: new URL('./appPathsStub.js', import.meta.url).href, shortCircuit: true };
	return next(specifier, context);
}

/** @type {import('node:module').LoadHook} */
export async function load(url, context, next) {
	if (url.endsWith('.svelte')) {
		const filename = fileURLToPath(url);
		const { js } = compile(readFileSync(filename, 'utf8'), { filename, generate: 'server', runes: true });
		return { format: 'module', source: js.code, shortCircuit: true };
	}
	return next(url, context);
}
