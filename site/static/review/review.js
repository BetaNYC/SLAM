// Community review page (slam.beta.nyc/review/). Vanilla JS, no third-party code.
// Every piece of data is written with textContent or attributes; never innerHTML
// (tests/communityReview.test.js checks this file for it).
import {
	ENDPOINT,
	answersFingerprint,
	buildRequestBody,
	canSend,
	getClientId,
	checkData,
	downloadName,
	randomBatch,
	retryAfterMessage,
	storageKey,
	validBatch
} from './review-core.js';

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));

/** @type {Map<string, any>} */
let items = new Map();
/** @type {{batch_id: string, item_ids: string[]}[]} */
let batches = [];
/** @type {{batch_id: string, item_ids: string[]} | null} */
let batch = null;
/** @typedef {{at: string, fingerprint: string}} Sent */
/** @type {{answers: Record<string, {choice?: string, page_value?: string, note?: string}>, pos: number, sent?: Sent | null}} */
let state = { answers: {}, pos: 0, sent: null };

function say(/** @type {string} */ msg) {
	$('status').textContent = msg;
}

function show(/** @type {'intro' | 'item' | 'finish'} */ which) {
	for (const id of ['intro', 'item', 'finish']) $(id).hidden = id !== which;
	const h = $(`${which}-h`);
	h.focus();
}

function load() {
	if (!batch) return;
	try {
		const raw = localStorage.getItem(storageKey(batch.batch_id));
		const s = raw ? JSON.parse(raw) : null;
		if (s && typeof s === 'object' && s.answers && typeof s.answers === 'object') {
			const sent = s.sent && typeof s.sent.fingerprint === 'string' ? { at: String(s.sent.at ?? ''), fingerprint: s.sent.fingerprint } : null;
			state = { answers: s.answers, pos: Number.isInteger(s.pos) ? s.pos : 0, sent };
			return;
		}
	} catch {
		/* storage off or unreadable: start fresh */
	}
	state = { answers: {}, pos: 0, sent: null };
}

function save() {
	if (!batch) return;
	try {
		localStorage.setItem(storageKey(batch.batch_id), JSON.stringify(state));
	} catch {
		say('This browser is not saving answers. Finish the batch before you close the page.');
	}
}

function answeredCount() {
	if (!batch) return 0;
	return batch.item_ids.filter((id) => state.answers[id]?.choice).length;
}

function chooseBatch(/** @type {string | null} */ param) {
	const found = validBatch(param, batches);
	if (param && !found) say(`We could not find batch "${param.slice(0, 40)}", so here is another one.`);
	const rand = crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
	batch = found ?? randomBatch(batches, rand);
	const url = new URL(location.href);
	url.searchParams.set('batch', batch.batch_id);
	history.replaceState(null, '', url.pathname + url.search);
	load();
	const n = batch.item_ids.length;
	const done = answeredCount();
	$('batch-line').textContent =
		`Batch ${batch.batch_id}: ${n} items, about ${Math.max(5, Math.round(n / 2))} minutes.` +
		(done ? ` You have answered ${done} so far.` : '');
	$('start').textContent = done ? 'Continue' : 'Start';
}

function readForm() {
	if (!batch) return;
	const id = batch.item_ids[state.pos];
	const checked = /** @type {HTMLInputElement | null} */ (document.querySelector('input[name=choice]:checked'));
	const pv = /** @type {HTMLInputElement} */ ($('page-value')).value;
	const note = /** @type {HTMLTextAreaElement} */ ($('note')).value;
	if (checked || pv || note) state.answers[id] = { choice: checked?.value, page_value: pv, note };
	save();
	$('progress-text').textContent = `Item ${state.pos + 1} of ${batch.item_ids.length} (${answeredCount()} answered)`;
}

function renderItem() {
	if (!batch) return;
	const n = batch.item_ids.length;
	state.pos = Math.min(Math.max(state.pos, 0), n - 1);
	const it = items.get(batch.item_ids[state.pos]);
	$('progress-text').textContent = `Item ${state.pos + 1} of ${n} (${answeredCount()} answered)`;
	const bar = /** @type {HTMLProgressElement} */ ($('progress'));
	bar.max = n;
	bar.value = state.pos + 1;
	$('item-h').textContent = it.field_label;
	const img = /** @type {HTMLImageElement} */ ($('item-img'));
	img.src = it.image;
	img.alt = `Part of page ${it.pdf_page} of the State's PDF. The part to check is inside the red box.`;
	const link = /** @type {HTMLAnchorElement} */ ($('pdf-link'));
	link.href = it.source_pdf_url;
	link.textContent = `Open the State's PDF (page ${it.pdf_page}, opens in a new tab)`;
	$('value-read').textContent = it.value_read;
	$('question').textContent = it.question;
	const a = state.answers[it.item_id] ?? {};
	for (const r of /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll('input[name=choice]'))) {
		r.checked = r.value === a.choice;
	}
	/** @type {HTMLInputElement} */ ($('page-value')).value = a.page_value ?? '';
	/** @type {HTMLTextAreaElement} */ ($('note')).value = a.note ?? '';
	/** @type {HTMLButtonElement} */ ($('back')).disabled = state.pos === 0;
	$('next').textContent = state.pos === n - 1 ? 'Finish' : 'Next';
	save();
}

/** A batch other than the current one, for the "start another batch" link. */
function anotherBatchHref() {
	const others = batches.filter((b) => b.batch_id !== batch?.batch_id);
	if (!others.length) return '?';
	const rand = crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
	return `?batch=${encodeURIComponent(randomBatch(others, rand).batch_id)}`;
}

function renderFinish() {
	if (!batch) return;
	const n = batch.item_ids.length;
	$('answered-line').textContent = `You answered ${answeredCount()} of ${n} items in batch ${batch.batch_id}.`;
	const sending = ENDPOINT !== '';
	const current = answersFingerprint(batch.item_ids, state.answers);
	const sent = !!state.sent;
	const allowed = sending && canSend(current, state.sent);
	const btn = /** @type {HTMLButtonElement} */ ($('send'));
	btn.hidden = !allowed;
	btn.disabled = !allowed;
	btn.textContent = sent ? 'Send again' : 'Send my answers';
	$('sent-box').hidden = !(sending && sent);
	$('sent-text').textContent = allowed
		? 'Your answers for this batch were sent. You changed an answer since then; you can send again.'
		: 'Thanks — your answers for this batch were sent.';
	/** @type {HTMLAnchorElement} */ ($('another-batch')).href = anotherBatchHref();
	$('send-help').textContent = sending
		? 'Sending shares your answers, and your name and email if you gave them, with BetaNYC staff.'
		: 'Sending from this page is not switched on yet. Download your answers and keep the file; whoever invited you to help will tell you where to send it.';
}

let cachedClientId = '';
/** Made on first use and kept in localStorage; never displayed. */
function clientId() {
	if (!cachedClientId) {
		let storage = null;
		try {
			storage = window.localStorage;
		} catch {
			/* storage blocked */
		}
		cachedClientId = getClientId(storage, window.crypto);
	}
	return cachedClientId;
}

function body() {
	if (!batch) throw new Error('No batch.');
	return buildRequestBody({
		batchId: batch.batch_id,
		itemIds: batch.item_ids,
		answers: state.answers,
		contact: {
			name: /** @type {HTMLInputElement} */ ($('contact-name')).value,
			email: /** @type {HTMLInputElement} */ ($('contact-email')).value
		},
		creditOk: /** @type {HTMLInputElement} */ ($('credit-ok')).checked,
		clientId: clientId(),
		website: /** @type {HTMLInputElement} */ ($('website')).value
	});
}

function download() {
	let b;
	try {
		b = body();
	} catch (e) {
		return say(/** @type {Error} */ (e).message);
	}
	const blob = new Blob([JSON.stringify(b, null, 2)], { type: 'application/json' });
	const a = document.createElement('a');
	a.href = URL.createObjectURL(blob);
	a.download = downloadName(/** @type {any} */ (batch).batch_id);
	document.body.append(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
	say('Your answers file was downloaded.');
}

async function send() {
	let b;
	try {
		b = body();
	} catch (e) {
		return say(/** @type {Error} */ (e).message);
	}
	const btn = /** @type {HTMLButtonElement} */ ($('send'));
	btn.disabled = true;
	say('Sending…');
	try {
		const res = await fetch(ENDPOINT, {
			method: 'POST',
			mode: 'cors',
			credentials: 'omit',
			cache: 'no-store',
			referrerPolicy: 'no-referrer',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(b)
		});
		if (res.status === 201) {
			state.sent = { at: new Date().toISOString(), fingerprint: answersFingerprint(/** @type {any} */ (batch).item_ids, state.answers) };
			save();
			say('');
			renderFinish();
			$('sent-text').focus();
			return;
		} else if (res.status === 429) say(retryAfterMessage(res.headers.get('Retry-After')));
		else say('Something went wrong and your answers were not sent. They are still saved here. Try again later, or download them.');
	} catch {
		say('Your answers could not be sent (no connection?). They are still saved here. Try again later, or download them.');
	} finally {
		// A visible button is usable again after a failure; after a send it is hidden and stays off.
		btn.disabled = btn.hidden;
	}
}

function wire() {
	$('start').addEventListener('click', () => {
		say('');
		renderItem();
		show('item');
	});
	$('other-batch').addEventListener('click', () => {
		const others = batches.filter((b) => b.batch_id !== batch?.batch_id);
		const rand = crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
		chooseBatch(randomBatch(others, rand).batch_id);
		say(`Now showing batch ${batch?.batch_id}.`);
	});
	$('back').addEventListener('click', () => {
		readForm();
		state.pos -= 1;
		renderItem();
		$('item-h').focus();
	});
	$('next').addEventListener('click', () => {
		readForm();
		if (!batch) return;
		if (state.pos >= batch.item_ids.length - 1) {
			renderFinish();
			show('finish');
			return;
		}
		state.pos += 1;
		renderItem();
		$('item-h').focus();
	});
	$('answer-form').addEventListener('change', readForm);
	$('answer-form').addEventListener('submit', (e) => e.preventDefault());
	$('send-form').addEventListener('submit', (e) => e.preventDefault());
	$('zoom').addEventListener('click', () => {
		const box = $('image-box');
		const on = box.classList.toggle('larger');
		$('zoom').setAttribute('aria-pressed', String(on));
		$('zoom').textContent = on ? 'Fit to screen' : 'Show larger';
	});
	$('download').addEventListener('click', download);
	$('send').addEventListener('click', send);
	$('review-again').addEventListener('click', () => {
		if (!batch) return;
		state.pos = 0;
		renderItem();
		show('item');
	});
	$('clear').addEventListener('click', () => {
		if (!batch || !confirm('Clear every answer for this batch from this browser?')) return;
		try {
			localStorage.removeItem(storageKey(batch.batch_id));
		} catch {
			/* nothing stored */
		}
		state = { answers: {}, pos: 0, sent: null };
		chooseBatch(batch.batch_id);
		show('intro');
		say('Your answers for this batch were cleared from this browser.');
	});
}

/**
 * A meta Content-Security-Policy cannot set frame-ancestors, and GitHub Pages cannot send the
 * header, so another site could put this page in a frame. When framed, show nothing to click.
 * Reading window.top is allowed across origins; comparing it does not throw.
 */
function framed() {
	let top = true;
	try {
		top = window.top === window.self;
	} catch {
		top = false;
	}
	if (top) return false;
	for (const id of ['intro', 'item', 'finish']) $(id).hidden = true;
	say('This page only works when opened directly. Open slam.beta.nyc/review/ in its own tab.');
	return true;
}

async function main() {
	if (framed()) return;
	say('Loading…');
	try {
		const [i, b] = await Promise.all(
			['items.json', 'batches.json'].map((f) =>
				fetch(f, { credentials: 'same-origin' }).then((r) => {
					if (!r.ok) throw new Error(f);
					return r.json();
				})
			)
		);
		items = checkData(i, b);
		batches = b;
	} catch {
		say('The review items could not be loaded. Please try again later.');
		return;
	}
	if (!batches.length) {
		say('There is nothing to review right now.');
		return;
	}
	say('');
	wire();
	chooseBatch(new URLSearchParams(location.search).get('batch'));
	$('intro').hidden = false;
}

main();
