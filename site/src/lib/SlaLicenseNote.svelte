<script>
	import { fmtStamp, SLA_RECORD_LABEL } from '#lib/format.js';

	/** What the SLA license columns mean and where hours and conditions live (#63). Facts only.
	 * @type {{manifest: any, keys: string[]}} */
	let { manifest, keys } = $props();
	const S = $derived(manifest.sla_license);
	// The extra columns (#63) that at least one of the datasets on this page publishes.
	const recordKeys = $derived(Object.keys(S.record ?? {}).filter((rk) => keys.some((k) => S.fields[k][rk])));
	const ID_LABEL = /** @type {Record<string, string>} */ ({
		liquor_active: 'active',
		liquor_inactive: 'inactive',
		liquor_pending: 'pending'
	});
</script>

<div class="note sla-note">
	<p>
		<strong>Liquor license fields.</strong> The ID is SLA's own:
		{#each keys as k, i (k)}<code>{S.fields[k].id}</code> ({ID_LABEL[k]}){i < keys.length - 1 ? ', ' : ''}{/each}.
		Type and class are the datasets' <code>type</code> and <code>class</code> columns, shown as
		the dataset has them; the words are <code>description</code>. The active-license dataset writes
		classes with a leading zero (<code>0370</code>); the pending and inactive datasets, SLA's class
		sheet and LAMP write the same class without it (<code>370</code>). See <a href={S.classes.url}>{S.classes.label}</a>.
	</p>
	<p>
		<strong>Dates and other IDs.</strong> Each is a column of SLA's open data, shown as published
		when the license has a value. {#each recordKeys as rk, i (rk)}{SLA_RECORD_LABEL[rk]} is
		{#each keys.filter((k) => S.fields[k][rk]) as k, j (k)}<code>{S.fields[k][rk]}</code>{j < keys.filter((k) => S.fields[k][rk]).length - 1 ? ', ' : ''}{/each}
		("{S.record[rk].name}"{S.record[rk].description !== S.record[rk].name ? `, described as "${S.record[rk].description}"` : ''}){i < recordKeys.length - 1 ? '; ' : '.'}{/each}
		Pending applications have none of these except the AKA address; the inactive-license dataset
		has no parent license column. In the active list on 2026-11-07, the parent license ID was
		filled in only for additional bar permits (all 1,842 of them), and names another license.
	</p>
	{#if Object.keys(S.lamp_query ?? {}).length}<p>
		<strong>Open this license in LAMP.</strong> This link opens SLA's LAMP map on the license's own
		record, found by its ID. It uses a setting inside LAMP's map that SLA could change; each SLAM
		build checks that setting and leaves the link out if it no longer holds. It worked for an
		active, a pending and an inactive license on 2026-11-05.
	</p>{/if}
	<p>
		<strong>LAMP map link.</strong> "Show on the SLA's LAMP map" opens SLA's LAMP map centered on the
		City's address point for the building when SLAM matched the address, otherwise on the point in
		SLA's open data, at zoom {S.lamp.level}. (The open data's points come from data.ny.gov's own
		geocoding and can be blocks off for Queens addresses written without the hyphen; LAMP's own
		pins were within about 200 ft of the City's point when we checked on 2026-11-05.) It opens a map location, not the license record. LAMP
		first shows a welcome box; close it. LAMP places each license at its own point, which can differ
		from the link's center. Against SLA's open-data points (2026-11-04), most LAMP pins were within about
		13 m, but 145 of 2,344 were more than 50 m away; against the City's address point we have checked
		only four Queens licenses (2026-11-05), whose LAMP pins were 92 to 203 ft away. LAMP shows no pin
		for "Additional Bar" permits. Check that the pin you
		click has the same license ID. When we checked
		(2026-11-04), SLA's LAMP popup listed premises and license details, principals and disciplinary
		history, and several licenses at one spot are paged ("1 of 6"). The point is the dataset's <code>georeference</code>,
		which the data.ny.gov platform geocodes from the address ("{S.point_description}"). It is not
		SLAM's geocode. A license with no point has no link.
	</p>
	<p>
		<strong>Hours and method of operation.</strong> The State does not publish them. None of SLA's
		three open datasets (active, pending and inactive licenses) has a column for method of
		operation or hours (column lists checked on 2026-11-07), and neither did the LAMP popup when we
		checked (2026-11-04). SLAM does not copy them from other pages. Approval conditions for contested applications, which can include closing
		hours and community board stipulations, appear in the minutes of SLA's
		<a href={S.full_board.url}>Full Board meetings</a>; each meeting's page in the
		<a href={S.event_calendar.url}>{S.event_calendar.label}</a> links its minutes once they are posted
		after the meeting.
	</p>
	<p class="muted">
		Sources:
		{#each keys as k, i (k)}<a href={manifest.sources[k].url}>{manifest.sources[k].name}</a> (data last
			updated {fmtStamp(manifest.sources[k].rowsUpdatedAtIso)}){i < keys.length - 1 ? '; ' : '.'}{/each}
	</p>
</div>
