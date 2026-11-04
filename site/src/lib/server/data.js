// Build-time reader for the pipeline's output in static/data/.
// Server-only (lives under a `server` directory), runs during prerender.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve('static/data');

/** @param {string} rel */
export function readData(rel) {
	try {
		return JSON.parse(readFileSync(resolve(ROOT, rel), 'utf8'));
	} catch (err) {
		throw new Error(
			`Missing or unreadable pipeline output static/data/${rel}. ` +
				`Run the pipeline first: cd ../pipeline && uv run python build.py (${err})`
		);
	}
}
