<script>
	// The one address page (#84): /address/?id=<id>. Prerendered once as a shell; the browser reads
	// the id and fetches static/data/address/<id>.json (the file the map side panel also uses).
	// Old /address/<id>/ links reach this page through static/404.html. Logic: #lib/addressPage.js.
	import { asset, resolve } from '$app/paths';
	import { page } from '$app/state';
	import { tick } from 'svelte';
	import { loadAddress, readAddressQuery } from '#lib/addressPage.js';
	import AddressView from './AddressView.svelte';

	/** @type {{data: any}} */
	let { data } = $props();
	const m = $derived(data.manifest);

	// The query string does not exist while prerendering, so it is read once mounted in the browser
	// (effects never run during prerendering).
	let mounted = $state(false);
	$effect(() => {
		mounted = true;
	});
	const query = $derived(mounted ? readAddressQuery(page.url.searchParams) : null);

	/** @typedef {{kind: 'loading'} | {kind: 'none'} | {kind: 'missing', id: string} | {kind: 'error', message: string} | {kind: 'ok', a: any}} View */
	let view = $state(/** @type {View} */ ({ kind: 'loading' }));
	let attempt = $state(0);

	$effect(() => {
		const q = query;
		void attempt;
		if (!q) return;
		if (!q.raw) {
			view = { kind: 'none' };
			return;
		}
		let stale = false;
		view = { kind: 'loading' };
		loadAddress(fetch, q.id, (p) => asset(/** @type {any} */ (p))).then(async (r) => {
			if (stale) return;
			view = r.kind === 'missing' ? { kind: 'missing', id: q.raw } : r;
			// A shared link to a section (#health, #sw, ...) can only scroll once the section exists.
			if (r.kind === 'ok' && location.hash.length > 1) {
				await tick();
				document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
			}
		});
		return () => (stale = true);
	});

	const title = $derived(view.kind === 'ok' ? view.a.street : view.kind === 'loading' ? 'Address' : 'Address not found');
</script>

<svelte:head><title>{title} — SLAM v2 prototype</title></svelte:head>

{#if view.kind === 'ok'}
	{#key view.a.id}
		<AddressView a={view.a} manifest={m} sw={data.sw} district={m.districts[view.a.district]} slug={view.a.district} near={query?.near ?? null} />
	{/key}
{:else if view.kind === 'loading'}
	<h1>Address</h1>
	<p role="status">Loading this address…</p>
	<noscript>
		<p class="note">This page needs JavaScript to show an address. Every address is also listed, without
			JavaScript, on its <a href={resolve('/', {})}>district's page</a>.</p>
	</noscript>
{:else if view.kind === 'missing'}
	<h1>This address isn't in SLAM</h1>
	<p role="status">SLAM has no address page called <code>{view.id}</code>. The link may be out of date: address
		pages change when the City's data changes.</p>
	<p>Try the <strong>Find an address</strong> box above, or pick a district from the <a href={resolve('/', {})}>district list</a>.</p>
{:else if view.kind === 'none'}
	<h1>Address</h1>
	<p>No address was chosen. Use the <strong>Find an address</strong> box above, or pick a district from the
		<a href={resolve('/', {})}>district list</a>.</p>
{:else}
	<h1>Address</h1>
	<p role="alert">{view.message}</p>
	<p><button class="btn" type="button" onclick={() => attempt++}>Try again</button></p>
{/if}
