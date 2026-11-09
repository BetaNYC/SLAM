// Community review page: the pure parts (no DOM), so they can be tested with `node --test`.
// The request body is the BetaNYC data-issue intake contract v1 (schema betanyc-data-issue/1,
// kind review-answer). Field names, limits and patterns below are copied from that contract;
// do not change one without changing the contract and the receiving endpoint.

/** Where answers are sent. Empty: sending is off and the page offers a download instead. */
export const ENDPOINT = '';

export const SCHEMA = 'betanyc-data-issue/1';
export const TOOL = 'slam';
export const KIND = 'review-answer';
export const DATASET = 'cannabis-decision-trail';
/** The page's public address. page_url must start with an allowed origin, so it is fixed. */
export const PAGE_BASE = 'https://slam.beta.nyc/review/';

export const CHOICES = /** @type {const} */ (['matches', 'does_not_match', 'cant_tell']);
export const LIMITS = { page_value: 300, note: 500, name: 100, email: 200, page_url: 500, answers: 50 };
export const BATCH_ID = /^[A-Za-z0-9_-]{1,64}$/;
export const ITEM_ID = /^[A-Za-z0-9_.:-]{1,64}$/;
export const IMAGE = /^img\/[A-Za-z0-9_.:-]{1,64}\.webp$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Trim and drop control characters except newline (the contract's normalization), then cut to
 * `max` characters.
 * @param {unknown} v
 * @param {number} max
 */
export function clean(v, max) {
	// eslint-disable-next-line no-control-regex
	const s = String(v ?? '').replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '').trim();
	return Array.from(s).slice(0, max).join('');
}

/** @param {string} email */
export function looksLikeEmail(email) {
	return EMAIL.test(email);
}

/**
 * The batch to show: the `?batch=` value if batches.json has it, else null.
 * @param {string | null} param
 * @param {{batch_id: string}[]} batches
 */
export function validBatch(param, batches) {
	if (!param || !BATCH_ID.test(param)) return null;
	return batches.find((b) => b.batch_id === param) ?? null;
}

/**
 * A random batch, using `rand` (a number in [0, 1)).
 * @template T
 * @param {T[]} batches
 * @param {number} rand
 */
export function randomBatch(batches, rand) {
	return batches[Math.min(batches.length - 1, Math.floor(rand * batches.length))];
}

/** @param {string} batchId */
export function storageKey(batchId) {
	return `slam-review:${DATASET}:${batchId}`;
}

/**
 * @typedef {{choice?: string, page_value?: string, note?: string}} Answer
 * @typedef {{name?: string, email?: string}} Contact
 */

/**
 * The request body for the answers given so far, in the batch's item order.
 * Throws an Error with a plain-language message when the body would be invalid.
 * @param {{batchId: string, itemIds: string[], answers: Record<string, Answer>,
 *   contact?: Contact, creditOk?: boolean, website?: string}} input
 */
export function buildRequestBody({ batchId, itemIds, answers, contact = {}, creditOk = false, website = '' }) {
	if (!BATCH_ID.test(batchId)) throw new Error('This batch name is not valid.');
	const list = [];
	for (const id of itemIds) {
		const a = answers[id];
		if (!a || !CHOICES.includes(/** @type {any} */ (a.choice))) continue;
		if (!ITEM_ID.test(id)) continue;
		/** @type {{item_id: string, choice: string, page_value?: string, note?: string}} */
		const out = { item_id: id, choice: /** @type {string} */ (a.choice) };
		const pv = clean(a.page_value, LIMITS.page_value);
		const note = clean(a.note, LIMITS.note);
		if (pv) out.page_value = pv;
		if (note) out.note = note;
		list.push(out);
	}
	if (list.length === 0) throw new Error('Answer at least one item first.');
	if (list.length > LIMITS.answers) throw new Error('Too many answers for one batch.');
	const name = clean(contact.name, LIMITS.name);
	const email = clean(contact.email, LIMITS.email);
	if (email && !looksLikeEmail(email)) throw new Error('That email address does not look right. Fix it or leave it empty.');
	/** @type {Record<string, unknown>} */
	const body = {
		schema: SCHEMA,
		tool: TOOL,
		kind: KIND,
		page_url: `${PAGE_BASE}?batch=${encodeURIComponent(batchId)}`.slice(0, LIMITS.page_url),
		website: String(website ?? ''),
		credit_ok: creditOk === true
	};
	if (name || email) {
		/** @type {Contact} */
		const c = {};
		if (name) c.name = name;
		if (email) c.email = email;
		body.contact = c;
	}
	body.dataset = DATASET;
	body.batch_id = batchId;
	body.answers = list;
	return body;
}

/**
 * Check items.json and batches.json before using them: known shapes only, safe image paths,
 * https links. Returns the items keyed by id; throws on anything unexpected.
 * @param {unknown} items
 * @param {unknown} batches
 */
export function checkData(items, batches) {
	if (!Array.isArray(items) || !Array.isArray(batches)) throw new Error('The review data did not load.');
	/** @type {Map<string, any>} */
	const byId = new Map();
	for (const it of items) {
		if (!it || typeof it !== 'object' || !ITEM_ID.test(it.item_id)) throw new Error('Bad item in the review data.');
		if (!IMAGE.test(it.image)) throw new Error('Bad image path in the review data.');
		const url = new URL(it.source_pdf_url);
		if (url.protocol !== 'https:') throw new Error('Bad link in the review data.');
		for (const k of ['field_label', 'value_read', 'question']) {
			if (typeof it[k] !== 'string') throw new Error('Bad text in the review data.');
		}
		if (!Number.isInteger(it.pdf_page) || it.pdf_page < 1) throw new Error('Bad page number in the review data.');
		byId.set(it.item_id, it);
	}
	for (const b of batches) {
		if (!b || !BATCH_ID.test(b.batch_id) || !Array.isArray(b.item_ids)) throw new Error('Bad batch in the review data.');
		if (b.item_ids.length > LIMITS.answers) throw new Error('A batch is too long.');
		for (const id of b.item_ids) if (!byId.has(id)) throw new Error('A batch names an unknown item.');
	}
	return byId;
}

/** @param {string} batchId */
export function downloadName(batchId) {
	return `slam-review-${DATASET}-${batchId}.json`;
}
