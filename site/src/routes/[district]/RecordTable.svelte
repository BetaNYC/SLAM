<script>
	import { resolve } from '$app/paths';
	import { addressLine, lampUrl } from '#lib/format.js';

	/** `lampLevel` set = SLA liquor rows (#63): show the license ID and a LAMP link.
	 * @type {{rows: any[], caption: string, showClass?: boolean, empty?: string, lampLevel?: number}} */
	let { rows, caption, showClass = true, empty = 'Nothing listed.', lampLevel } = $props();
	const sla = $derived(lampLevel != null);
	const ncols = $derived(sla ? 6 : 5);
</script>

<div class="table-scroll">
	<table>
		<caption>{caption} <span class="muted">({rows.length})</span></caption>
		<thead>
			<tr>
				<th scope="col">Name / DBA</th>
				<th scope="col">Address</th>
				<th scope="col">Type{showClass ? ' / class' : ''}</th>
				<th scope="col">Status</th>
				<th scope="col">Date</th>
				{#if sla}<th scope="col">License ID / LAMP</th>{/if}
			</tr>
		</thead>
		<tbody>
			{#each rows as r, i (r.source + r.rid + i)}
				<tr>
					<td>
						{r.name}
						{#if r.dba && r.legal_name && r.dba !== r.legal_name}<br /><span class="muted"
								>{r.legal_name}</span
							>{/if}
					</td>
					<td>
						{#if r.aid}<a href={resolve('/address/[id]', { id: r.aid })}>{addressLine(r)}</a>{:else}{addressLine(
								r
							)}{/if}
						{#if !r.lon}<br /><span class="muted">(not mapped)</span>{/if}
					</td>
					<td>{r.type}{#if sla}<br /><span class="muted">Type {r.ltype ?? '?'} · Class {r.lclass ?? '?'}</span>{:else if showClass && r.cls && r.cls !== '/'}<br /><span class="muted">{r.cls}</span>{/if}</td>
					<td>{r.status}{#if r.operational}<br /><span class="muted">{r.operational}</span>{/if}</td>
					<td class="nowrap">{#if r.date}<span class="muted">{r.date_label}</span><br />{r.date}{/if}</td>
					{#if sla}
						{@const lamp = lampUrl(r.plon ?? r.lon, r.plat ?? r.lat, lampLevel)}
						<td><code>{r.rid}</code><br />{#if lamp}<a href={lamp} aria-label="Show on the SLA's LAMP map: {r.name}, {r.rid}">Show on the SLA's LAMP map</a>{:else}<span class="muted">No point, no LAMP link</span>{/if}</td>
					{/if}
				</tr>
			{:else}
				<tr><td colspan={ncols} class="muted">{empty}</td></tr>
			{/each}
		</tbody>
	</table>
</div>
