// SLAM traffic measurement: the beta.nyc Google tag (GT-MQ7Q7VP), with addresses removed.
// Ported from BoardStat 2.0 (BetaNYC/BoardStat v2/site/js/analytics.js); unit-tested in
// tests/analytics.test.js. Started from src/routes/+layout.svelte (afterNavigate).
//
// Privacy rules (Noel, 2026-11-06 for BoardStat, 2026-11-08 for SLAM; About page, "What we measure
// about visits"):
// - It runs only on the production host, slam.beta.nyc. Never on localhost, `vite preview`, the
//   Playwright server or a fork's preview.
// - Google never sees a street address, a search, or coordinates. Before the tag loads, and again
//   before every page view, page_location, page_referrer and page_title are replaced with cleaned
//   copies, set globally so every event the tag sends uses them
//   (https://developers.google.com/analytics/devguides/collection/ga4/reference/config).
//   * Every query parameter is dropped: the address page's ?id= (an opaque key, but it maps to a
//     street address through the site's public data files) and its search note, and the map
//     page's ?lon=&lat=. SLAM has no query parameter that is safe and useful to keep.
//   * The fragment is dropped: the map page keeps its view (coordinates) and the selected address
//     id in the hash (mapState.js).
//   * Address pages get a fixed title, because their <title> is the street.
//   * Referrers from other sites are cut to their origin.
// - The automatic page view is off (send_page_view: false). One cleaned page_view is sent by hand
//   on the first load and on each client-side navigation
//   (https://developers.google.com/analytics/devguides/collection/ga4/views?client_type=gtag).
// - "Page changes based on browser history events" (Enhanced Measurement) sends page views
//   "independently of the send_page_view parameter" and can only be turned off in the GA
//   property, not from code (same page). See README, "Traffic measurement".
// - SLAM sends no events of its own.

export const TAG_ID = 'GT-MQ7Q7VP';
export const HOSTS = ['slam.beta.nyc'];
export const ADDRESS_TITLE = 'Address — SLAM v2 prototype';
const SCRIPT_SRC = `https://www.googletagmanager.com/gtag/js?id=${TAG_ID}`;

/** @param {string} hostname */
export function isActiveHost(hostname) {
	return HOSTS.includes(hostname);
}

/** @param {string} href */
function parse(href) {
	try {
		return new URL(href);
	} catch {
		return null;
	}
}

/**
 * Is this path the address page? `base` is SvelteKit's base path ('' at slam.beta.nyc).
 * Also matches old /address/<id>/ links.
 * @param {string} pathname
 * @param {string} [base]
 */
export function isAddressPath(pathname, base = '') {
	return pathname.startsWith(`${base}/address/`) || pathname === `${base}/address`;
}

/**
 * The page URL with every query parameter and the fragment removed. Every address page,
 * including old /address/<id>/ links, becomes /address/.
 * @param {string} href
 * @param {string} [base]
 */
export function sanitizeUrl(href, base = '') {
	const u = parse(href);
	if (!u) return '';
	const path = isAddressPath(u.pathname, base) ? `${base}/address/` : u.pathname;
	return `${u.origin}${path}`;
}

/**
 * Same-site referrers are cleaned like page URLs; other sites are cut to their origin.
 * @param {string | null | undefined} ref
 * @param {string} host the page's own hostname
 * @param {string} [base]
 */
export function sanitizeReferrer(ref, host, base = '') {
	if (!ref) return '';
	const u = parse(ref);
	if (!u || (u.protocol !== 'https:' && u.protocol !== 'http:')) return '';
	if (u.hostname === host || HOSTS.includes(u.hostname)) return sanitizeUrl(ref, base);
	return `${u.origin}/`;
}

/**
 * Address pages get a fixed title (their <title> is the street). Other titles carry only a
 * district name or a fixed page name, and are kept.
 * @param {string} title
 * @param {string} href
 * @param {string} [base]
 */
export function sanitizeTitle(title, href, base = '') {
	const u = parse(href);
	if (!u) return '';
	if (isAddressPath(u.pathname, base)) return ADDRESS_TITLE;
	return String(title || '');
}

/**
 * The three cleaned fields for one page view.
 * @param {{href: string, title: string, referrer: string | null | undefined, host: string, base?: string}} p
 */
export function cleanPage({ href, title, referrer, host, base = '' }) {
	return {
		page_location: sanitizeUrl(href, base),
		page_referrer: sanitizeReferrer(referrer, host, base),
		page_title: sanitizeTitle(title, href, base)
	};
}

/**
 * Start the Google tag, once, and return a function that sends one cleaned page view. Off the
 * production host it does nothing at all (no dataLayer, no script) and returns null.
 * @param {any} win window, or a stand-in in tests
 */
export function startAnalytics(win) {
	if (!win || !isActiveHost(win.location.hostname)) return null;
	if (win.__slamPageView) return win.__slamPageView;
	win.dataLayer = win.dataLayer || [];
	// gtag() must push the arguments object itself, as Google's snippet does.
	function gtag() {
		// eslint-disable-next-line prefer-rest-params
		win.dataLayer.push(arguments);
	}
	const g = /** @type {(...args: any[]) => void} */ (gtag);
	let configured = false;

	/** @param {{href: string, title: string, referrer: string | null | undefined, base?: string}} p */
	function pageView(p) {
		const fields = cleanPage({ ...p, host: win.location.hostname });
		if (!configured) g('js', new Date());
		g('set', fields);
		if (!configured) g('config', TAG_ID, { send_page_view: false });
		g('event', 'page_view', fields);
		if (!configured) {
			configured = true;
			// The tag loads only after the cleaned fields are queued.
			const s = win.document.createElement('script');
			s.async = true;
			s.src = SCRIPT_SRC;
			win.document.head.appendChild(s);
		}
	}

	win.__slamPageView = pageView;
	return pageView;
}
