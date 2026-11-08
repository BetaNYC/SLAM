<script>
	import { scrollRegion } from '#lib/scrollRegion.js';
	import { yearHeaders, yearTotals } from '#lib/format.js';

	/** @type {{rows: {type: string, by_year: Record<string, number>, total: number}[], years: number[], through: string, caption: string}} */
	let { rows, years, through, caption } = $props();
	const heads = $derived(yearHeaders(years, through));
	const totals = $derived(yearTotals(rows, years));
</script>

<div class="table-scroll" use:scrollRegion>
	<table>
		<caption>{caption}</caption>
		<thead>
			<tr>
				<th scope="col">Complaint type</th>
				{#each heads as h (h.key)}<th scope="col" class="num">{h.label}{#if h.sub}<br /><span class="muted sub">{h.sub}</span>{/if}</th>{/each}
				<th scope="col" class="num">Total</th>
			</tr>
		</thead>
		<tbody>
			{#each rows as r (r.type)}
				<tr>
					<th scope="row">{r.type}</th>
					{#each heads as h (h.key)}<td class="num">{r.by_year[h.key] ?? 0}</td>{/each}
					<td class="num">{r.total}</td>
				</tr>
			{:else}
				<tr><td colspan={heads.length + 2} class="muted">No complaints in this window.</td></tr>
			{/each}
		</tbody>
		{#if rows.length > 1}
			<tfoot>
				<tr>
					<th scope="row">All types</th>
					{#each heads as h (h.key)}<td class="num">{totals[h.key]}</td>{/each}
					<td class="num">{totals.total}</td>
				</tr>
			</tfoot>
		{/if}
	</table>
</div>

<style>
	.sub { font-weight: normal; font-size: 0.8rem; }
	.num { text-align: right; font-variant-numeric: tabular-nums; }
	tbody th { font-weight: normal; text-align: left; }
	tfoot th, tfoot td { font-weight: 600; border-top: 2px solid var(--line); }
</style>
