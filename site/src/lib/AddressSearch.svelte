<script>
	// One address search box for every page (#59). WAI-ARIA combobox, "list autocomplete
	// with manual selection": https://www.w3.org/WAI/ARIA/apg/patterns/combobox/
	// Suggestions come from GeoSearch /v2/autocomplete in the browser (keyless). Picking one
	// opens the address page for its BIN, else the nearest page within the pipeline's
	// radius, else says nothing is on file and offers the map at that spot.
	// Nothing typed or picked is stored: no localStorage, no cookies, fetches use no-store.
	import { afterNavigate, goto } from '$app/navigation';
	import { asset, resolve } from '$app/paths';
	import { addressHref } from '#lib/addressLink.js';
	import {
		DEBOUNCE_MS,
		FETCH_OPTS,
		autocompleteUrl,
		countMessage,
		districtAt,
		makeSequencer,
		nextActive,
		resolvePick,
		searchUrl,
		shouldQuery,
		toSuggestions
	} from './addressSearch.js';

	const LIST_ID = 'addr-search-list';
	/** @param {number} i */
	const optId = (i) => `addr-search-opt-${i}`;

	let text = $state('');
	/** @type {import('./addressSearch.js').Suggestion[]} */
	let options = $state([]);
	let active = $state(-1);
	let open = $state(false);
	let live = $state('');
	/** @type {{text: string, href?: string, linkText?: string} | null} */
	let result = $state(null);

	// The box lives in the header and survives page changes; start each page clean.
	afterNavigate(() => {
		text = '';
		result = null;
		options = [];
		live = '';
		close();
	});

	const seq = makeSequencer();
	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let timer;
	/** @type {AbortController | undefined} */
	let inflight;
	/** @type {Promise<[any, any]> | undefined} */
	let lookups;

	/** The site's own static lookup files, loaded once on first pick. */
	function loadLookups() {
		lookups ??= Promise.all([
			fetch(asset('data/bin-index.json')).then((r) => r.json()),
			fetch(asset('data/districts.geojson')).then((r) => r.json())
		]);
		return lookups;
	}

	function close() {
		open = false;
		active = -1;
	}

	/** @param {string} q */
	async function suggest(q) {
		const id = seq.next();
		inflight?.abort();
		if (!shouldQuery(q)) {
			options = [];
			live = '';
			close();
			return;
		}
		inflight = new AbortController();
		try {
			const res = await fetch(autocompleteUrl(q), { ...FETCH_OPTS, signal: inflight.signal });
			const list = toSuggestions(await res.json());
			if (!seq.isCurrent(id)) return; // a newer keystroke won
			options = list;
			active = -1;
			open = list.length > 0;
			live = countMessage(list.length);
		} catch (err) {
			if (/** @type {Error} */ (err).name === 'AbortError' || !seq.isCurrent(id)) return;
			options = [];
			close();
			live = 'Address suggestions are not available right now.';
		}
	}

	function oninput() {
		result = null;
		clearTimeout(timer);
		timer = setTimeout(() => suggest(text), DEBOUNCE_MS);
	}

	/** @param {import('./addressSearch.js').Suggestion} s */
	async function pick(s) {
		text = s.label;
		close();
		options = [];
		live = '';
		let index, districts;
		try {
			[index, districts] = await loadLookups();
		} catch {
			lookups = undefined;
			result = { text: 'Could not load the address list. Try again.' };
			return;
		}
		const where = resolvePick(s, index);
		if (where.kind === 'page') {
			result = null;
			goto(addressHref(where.id));
		} else if (where.kind === 'near') {
			result = null;
			goto(addressHref(where.id, { q: s.label, m: String(where.m) }));
		} else {
			const slug = districtAt(s.lon, s.lat, districts);
			result = slug
				? {
						text: `Nothing on file here yet for ${s.label}.`,
						href: `${resolve('/[district]/map', { district: slug })}/?${new URLSearchParams({ lon: s.lon.toFixed(6), lat: s.lat.toFixed(6) })}`,
						linkText: 'See this spot on the map'
					}
				: { text: `Nothing on file here yet for ${s.label}. This prototype covers only Manhattan Community District 1 and Brooklyn Community District 4.` };
		}
	}

	/** Enter with nothing highlighted: run a full /v2/search and take its top hit. */
	async function searchTyped() {
		if (!shouldQuery(text)) return;
		clearTimeout(timer);
		seq.next(); // drop any pending suggestion response
		inflight?.abort();
		try {
			const res = await fetch(searchUrl(text), FETCH_OPTS);
			const [s] = toSuggestions(await res.json());
			if (s) await pick(s);
			else result = { text: `No NYC address found for "${text.trim()}".` };
		} catch {
			result = { text: 'Address search is not available right now.' };
		}
	}

	/** @param {KeyboardEvent} e */
	function onkeydown(e) {
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			if (!open && options.length) open = true;
			active = nextActive(e.key, active, options.length);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			if (open && active >= 0) pick(options[active]);
			else searchTyped();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			if (open) close();
			else {
				text = '';
				options = [];
				result = null;
				live = '';
			}
		} else if (e.key === 'Tab') {
			close();
		}
	}
</script>

<form class="addr-search" role="search" aria-label="Address" onsubmit={(e) => e.preventDefault()}>
	<label for="addr-search-input">Find an address</label>
	<div class="box">
		<input
			id="addr-search-input"
			type="text"
			role="combobox"
			aria-autocomplete="list"
			aria-expanded={open}
			aria-controls={LIST_ID}
			aria-activedescendant={open && active >= 0 ? optId(active) : undefined}
			aria-describedby="addr-search-hint"
			autocomplete="off"
			spellcheck="false"
			placeholder="e.g. 185 Greenwich St"
			bind:value={text}
			{oninput}
			{onkeydown}
			onblur={() => setTimeout(close, 150)}
		/>
		<ul id={LIST_ID} role="listbox" aria-label="Address suggestions" hidden={!open}>
			{#each options as o, i (o.label)}
				<!-- Keyboard use is on the input (aria-activedescendant), as the APG pattern says. -->
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<li
					id={optId(i)}
					role="option"
					aria-selected={i === active}
					class:active={i === active}
					onpointerdown={(e) => e.preventDefault()}
					onclick={() => pick(o)}
				>
					{o.label}
				</li>
			{/each}
		</ul>
	</div>
	<span id="addr-search-hint" class="sr-only">Type at least 2 characters for suggestions.</span>
	<div class="sr-only" role="status" aria-live="polite">{live}</div>
	<p class="result" role="status" aria-live="polite">
		{#if result}{result.text}{#if result.href}{' '}<a href={result.href}>{result.linkText}</a>{/if}{/if}
	</p>
</form>

<style>
	.addr-search { margin: 0; flex: 1 1 22rem; max-width: 32rem; }
	label { display: block; font-size: 0.85rem; font-weight: 600; }
	.box { position: relative; }
	input { width: 100%; font: inherit; padding: 0.4rem 0.55rem; border: 1px solid var(--line); border-radius: 4px; }
	ul { position: absolute; z-index: 20; left: 0; right: 0; margin: 2px 0 0; padding: 0; list-style: none; background: #fff; color: var(--ink); border: 1px solid var(--line); border-radius: 4px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18); }
	li { padding: 0.45rem 0.6rem; cursor: pointer; }
	li:hover, li.active { background: var(--blue-dark); color: #fff; }
	.result { margin: 0.3rem 0 0; font-size: 0.9rem; min-height: 0; }
	.result a { color: var(--blue-dark); font-weight: 600; }
	.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
</style>
