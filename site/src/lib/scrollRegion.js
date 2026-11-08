// Tables that scroll sideways (#53). A box that scrolls must be reachable by keyboard, or a
// keyboard user cannot see the hidden columns (WCAG 2.1.1; axe rule scrollable-region-focusable).
// Only a box that actually overflows gets a tab stop, so wide screens get no extra stops.

/**
 * The name a screen reader reads for the scrolling box: the label given, else the table's
 * caption, else "Table".
 * @param {{querySelector: (s: string) => {textContent: string | null} | null}} node
 * @param {string} [label]
 */
export function scrollRegionLabel(node, label) {
	const text = (label || node.querySelector('caption')?.textContent || '').replace(/\s+/g, ' ').trim();
	return `${text || 'Table'} (scrolls sideways)`;
}

/**
 * Give the box a tab stop and a name while it overflows; take them away when it does not.
 * @param {{scrollWidth: number, clientWidth: number, querySelector: any,
 *   setAttribute: (k: string, v: string) => void, removeAttribute: (k: string) => void}} node
 * @param {string} [label]
 * @returns {boolean} whether the box overflows
 */
export function syncScrollRegion(node, label) {
	const overflows = node.scrollWidth > node.clientWidth + 1;
	if (overflows) {
		node.setAttribute('tabindex', '0');
		node.setAttribute('role', 'region');
		node.setAttribute('aria-label', scrollRegionLabel(node, label));
	} else {
		for (const k of ['tabindex', 'role', 'aria-label']) node.removeAttribute(k);
	}
	return overflows;
}

/**
 * Svelte action: `<div class="table-scroll" use:scrollRegion>`, or `use:scrollRegion={'Name'}`
 * for a table with no caption. Re-checks when the box or its table changes size (a phone turned
 * sideways, a filter that shortens a column).
 * @param {HTMLElement} node
 * @param {string} [label]
 */
export function scrollRegion(node, label) {
	let name = label;
	syncScrollRegion(node, name);
	if (typeof ResizeObserver === 'undefined') return {};
	const ro = new ResizeObserver(() => syncScrollRegion(node, name));
	ro.observe(node);
	const table = node.querySelector('table');
	if (table) ro.observe(table);
	return {
		/** @param {string} [next] */
		update(next) {
			name = next;
			syncScrollRegion(node, name);
		},
		destroy: () => ro.disconnect()
	};
}
