/**
 * Popup body for a 311 dot that has no address page. Built with DOM text nodes (not HTML)
 * so source text cannot inject markup; MapLibre's Popup.setDOMContent takes a Node.
 * @param {{d?: string, t?: string, s?: string}} p  properties from points-311.geojson
 * @param {Document} [doc]
 */
export function popup311(p, doc = document) {
	const div = doc.createElement('div');
	for (const [label, v] of [['Date', p.d], ['Complaint', p.t], ['Address', p.s || '(no address)']]) {
		const line = doc.createElement('div');
		const b = doc.createElement('strong');
		b.textContent = `${label}: `;
		line.append(b, doc.createTextNode(String(v ?? '')));
		div.append(line);
	}
	return div;
}
