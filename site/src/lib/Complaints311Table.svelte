<script>
	import { scrollRegion } from '#lib/scrollRegion.js';
	/** @type {{rows: {rid: string, date: string, type: string, descriptor?: string, street?: string, zip?: string, agency?: string, status?: string}[], caption: string}} */
	let { rows, caption } = $props();
</script>

<div class="table-scroll" use:scrollRegion>
	<table>
		<caption>{caption} <span class="muted">({rows.length})</span></caption>
		<thead>
			<tr>
				<th scope="col">Date</th>
				<th scope="col">Complaint type</th>
				<th scope="col">Descriptor</th>
				<th scope="col">Address</th>
				<th scope="col">Agency</th>
				<th scope="col">Status</th>
			</tr>
		</thead>
		<tbody>
			{#each rows as r (r.rid)}
				<tr>
					<td class="nowrap">{r.date}</td>
					<td>{r.type}</td>
					<td>{r.descriptor ?? ''}</td>
					<td>{r.street || '(no address)'}{#if r.zip}{', '}<span class="muted">{r.zip}</span>{/if}</td>
					<td>{r.agency ?? ''}</td>
					<td>{r.status ?? ''}</td>
				</tr>
			{:else}
				<tr><td colspan="6" class="muted">None listed.</td></tr>
			{/each}
		</tbody>
	</table>
</div>
