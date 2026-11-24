/**
 * "Send feedback" on the second district map (#134): a problem report to BetaNYC's data-issue
 * intake, beta.nyc Code Snippet #21 (BetaNYC/betanyc-ai-workspace#1594), which files it as an
 * issue in the private BetaNYC/data-inbox repo. Field names, limits and rules are copied from
 * that snippet's betanyc_data_issue_validate() (contract v1, schema betanyc-data-issue/1,
 * kind problem-report); change one only with the snippet. The route is its register_rest_route
 * call, POST /wp-json/betanyc-data/v1/report, on www.beta.nyc.
 */

export const ENDPOINT = 'https://www.beta.nyc/wp-json/betanyc-data/v1/report';
export const LIMITS = { description: 2000, name: 100, email: 200, page_url: 500 };

/**
 * page_url must be under https://slam.beta.nyc (the snippet's page list), so the public address
 * is sent, not the one the page happens to be served from (a preview or localhost would fail).
 * @param {string} slug
 */
export const pageUrl = (slug) => `https://slam.beta.nyc/${slug}/map2/`;

/**
 * The request body. Name and email are optional and sent only when given; `website` is the
 * honeypot (a person leaves it empty; the snippet quietly drops a report that fills it).
 * credit_ok is false: the form does not ask for permission to credit anyone.
 * @param {{slug: string, description: string, name?: string, email?: string, website?: string}} f
 */
export function feedbackBody({ slug, description, name = '', email = '', website = '' }) {
	const text = description.trim();
	if (!text) throw new Error('Feedback is required.');
	if (text.length > LIMITS.description) throw new Error(`Feedback can be at most ${LIMITS.description} characters.`);
	/** @type {{name?: string, email?: string}} */
	const contact = {};
	if (name.trim()) contact.name = name.trim().slice(0, LIMITS.name);
	if (email.trim()) contact.email = email.trim().slice(0, LIMITS.email);
	return {
		schema: 'betanyc-data-issue/1',
		tool: 'slam',
		kind: 'problem-report',
		page_url: pageUrl(slug),
		website,
		credit_ok: false,
		...(Object.keys(contact).length ? { contact } : {}),
		record: 'map2-feedback',
		description: text
	};
}

/**
 * POST the report. Returns 'sent' (201, which is also what the snippet answers for the honeypot
 * and for spam), 'busy' (429), or 'failed' (anything else, or no connection).
 * @param {ReturnType<typeof feedbackBody>} body
 * @param {typeof fetch} [f]
 * @returns {Promise<'sent' | 'busy' | 'failed'>}
 */
export async function sendFeedback(body, f = globalThis.fetch) {
	try {
		const res = await f(ENDPOINT, {
			method: 'POST',
			mode: 'cors',
			credentials: 'omit',
			cache: 'no-store',
			referrerPolicy: 'no-referrer',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		if (res.status === 201) return 'sent';
		return res.status === 429 ? 'busy' : 'failed';
	} catch {
		return 'failed';
	}
}

// Final wording: people/noel/work/2026-11-24-slam-map2-feedback-copy.md, section 1, in the BetaNYC
// workspace (2026-11-24). `cancel`, `close` and `sending` are not in that file: the form needs them.
// A busy endpoint (429) shows the same error message, which already says to try again in a minute.
export const FEEDBACK_COPY = {
	button: 'Send feedback',
	title: 'Tell us what you think of this map',
	intro: "This map is a prototype. Tell us what works for you and what doesn't.",
	description: 'Your feedback',
	hint: "What was confusing? What's missing? What would you use this map for at the board or in your neighborhood? If something on the map looks wrong, tell us the address.",
	name: 'Name (optional)',
	email: 'Email (optional)',
	privacy: 'Your feedback goes to a private BetaNYC system that only our staff read. Name and email are optional, and we use them only if we need to follow up with you.',
	send: 'Send',
	cancel: 'Cancel',
	close: 'Close',
	sending: 'Sending…',
	sent: 'Thank you. Your feedback reached BetaNYC, and our staff read every message.',
	failed: "Your feedback didn't send. Please try again in a minute, or email it to lab@beta.nyc."
};
