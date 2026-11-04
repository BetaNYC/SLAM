<script>
	import { resolve } from '$app/paths';
	import { addressLine } from '#lib/format.js';

	/** @type {{rows: any[], caption: string, showClass?: boolean, empty?: string}} */
	let { rows, caption, showClass = true, empty = 'Nothing listed.' } = $props();
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
					<td>{r.type}{#if showClass && r.cls && r.cls !== '/'}<br /><span class="muted">{r.cls}</span>{/if}</td>
					<td>{r.status}{#if r.operational}<br /><span class="muted">{r.operational}</span>{/if}</td>
					<td class="nowrap">{#if r.date}<span class="muted">{r.date_label}</span><br />{r.date}{/if}</td>
				</tr>
			{:else}
				<tr><td colspan="5" class="muted">{empty}</td></tr>
			{/each}
		</tbody>
	</table>
</div>
