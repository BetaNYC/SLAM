<script>
	/** The one caveat for every distance SLAM shows. Shown wherever a distance appears. */
	/** @type {{compact?: boolean}} */
	let { compact = false } = $props();
</script>

<p class="distance-note" class:compact>
	<strong>Distances are approximate.</strong> The law measures from the center of the nearest entrance
	of one building to the center of the nearest entrance of the other. SLAM cannot measure door to door:
	it has no entrance locations. It measures a straight line between approximate building points, from
	the City's address search or from each dataset's own map point.{#if !compact}{' '}Those points can sit
	away from the door, so a SLAM distance can differ from an entrance-to-entrance measurement by tens
	of feet or more, especially for large or corner buildings. Treat a distance near a limit as close,
	not as over or under it.{/if}
</p>

<style>
	.distance-note { background: var(--bg-soft); border-left: 4px solid var(--blue); padding: 0.5rem 0.75rem; font-size: 0.9rem; }
	.distance-note.compact { font-size: 0.85rem; }
</style>
