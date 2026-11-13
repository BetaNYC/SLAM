// The "What's changed" page (BetaNYC What's changed standard, SvelteKit recipe).
// csr = false ships it as plain HTML with no SvelteKit client: links to it are full page loads,
// and the fragment's own filter script runs on load. A <script> that {@html} inserts during
// client-side navigation would not run. https://svelte.dev/docs/kit/page-options
// e2e/whats-changed.spec.js checks that the filter appears and works.
export const prerender = true;
export const csr = false;
