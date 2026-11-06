// Render a .svelte file to HTML in Node (see svelteHooks.js).
import { register } from 'node:module';

register('./svelteHooks.js', import.meta.url);
const { render } = await import('svelte/server');

/** @param {string} file path from the site folder @param {Record<string, any>} props */
export async function renderFile(file, props) {
	const mod = await import(new URL(`../../${file}`, import.meta.url).href);
	return render(mod.default, { props }).body;
}
