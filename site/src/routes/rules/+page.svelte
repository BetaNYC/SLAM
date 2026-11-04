<script>
	import { fmtStamp } from '#lib/format.js';

	/** @type {{data: any}} */
	let { data } = $props();
	const rule = $derived(data.rules);
	const m = $derived(data.manifest);
	// One entry per county; SLA spells Queens two ways ('Queens', 'QUEENS').
	const counties = $derived(
		data.license_counties.filter(
			(/** @type {string} */ c, /** @type {number} */ i, /** @type {string[]} */ all) =>
				all.findIndex((x) => x.toLowerCase() === c.toLowerCase()) === i
		)
	);
	/** @param {Record<string, string>} o */
	const classList = (o) => Object.entries(o).map(([c, l]) => `${c} (${l})`).join(', ');
</script>

<svelte:head><title>Distance rules for schools, places of worship and licenses — SLAM v2 prototype</title></svelte:head>

<h1>Schools, places of worship and the 200- and 500-foot rules</h1>

<section class="rule" aria-labelledby="law-h">
	<h2 id="law-h">What the law says</h2>
	<p><a href={rule.url}>{rule.law}</a> says, in part:</p>
	<blockquote>
		<p>“{rule.lead}</p>
		<p>(a) {rule.a} or</p>
		<p>(b) {rule.b};</p>
		<p>(c) {rule.c} …”</p>
	</blockquote>
	<p class="muted">
		Text from nysenate.gov, revision dated {rule.revision}, read {rule.read}. Similar rules:
		{#each rule.related as r, i (r.url)}<a href={r.url}>{r.label}</a>{i < rule.related.length - 1 ? ', ' : '.'}{/each}
		SLA's own explanation: <a href={rule.sla_guide.url}>{rule.sla_guide.label}</a> ({rule.sla_guide.format}). It is
		guidance from SLA's Office of Counsel, not the law.
	</p>
	<p>
		<strong>SLAM does not decide whether a rule applies.</strong> The law has exceptions, for
		example for premises licensed continuously since before the school or place of worship was
		there, and for some renewals.
		The State Liquor Authority makes that decision.
	</p>
</section>

<h2 id="measure">How SLAM measures</h2>
<p>
	The law measures between the centers of the nearest entrances. SLAM has no entrances. It measures a
	straight line between building points: the address page's point (the City's address point from
	GeoSearch when the address matched, otherwise the average of the records' own points), the school's
	point in the Facilities Database, the tax lot's point in PLUTO, and each license's point from SLA.
	Every distance is approximate, building point to building point.
</p>
<p>
	Address pages list schools, houses of worship and other religious property within about
	{data.list_ft} ft, and count other addresses with an active on-premises liquor license within about
	{data.liquor_count_ft} ft.
</p>
<ul>
	<li>
		<strong>Same street.</strong> "Same street" compares the street names written in the records, after
		removing floor, suite and unit text. A corner building fronts more than one street, and the records
		list only one address for each school or lot.
	</li>
	<li>
		<strong>Houses of worship</strong> are PLUTO tax lots in building class {classList(data.worship_classes)}.
		<strong>Other religious property</strong> is class {classList(data.religious_classes)}. PLUTO does not call
		those a place of worship. Class names from the {data.class_labels}. PLUTO has no names for these lots.
	</li>
	<li>
		<strong>Schools</strong> are the Facilities Database's K-12 schools (public, charter, non-public and
		special education). Some are listed at an office or mailing address; the address page says so where
		known.
	</li>
	<li>
		<strong>The license count</strong> uses active SLA licenses of type 1, classes 0340 to 0421 (on-premises
		liquor, from <a href={rule.sla_classes.url}>{rule.sla_classes.label}</a>, {rule.sla_classes.format}), in
		{counties.join(', ')} counties (SLA's spelling). It leaves out additional bars, wine- and beer-only licenses, and pending applications. "Active"
		is SLA's license status; it does not show that a place is operating.
	</li>
</ul>

<p class="muted">
	Sources: <a href={m.sources.schools.url}>{m.sources.schools.name}</a> (schools, data last updated
	{fmtStamp(m.sources.schools.rowsUpdatedAtIso)}); <a href={m.sources.worship.url}>{m.sources.worship.name}</a>
	(building classes M1 to M4 and M9, data last updated {fmtStamp(m.sources.worship.rowsUpdatedAtIso)});
	<a href={m.sources.liquor_active.url}>{m.sources.liquor_active.name}</a> (data last updated
	{fmtStamp(m.sources.liquor_active.rowsUpdatedAtIso)}).
</p>
