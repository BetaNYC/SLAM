import { SW_KIND } from './format.js';

/**
 * Popup body for a school or house-of-worship dot (#60). Built with DOM text nodes (not HTML)
 * so source text cannot inject markup; MapLibre's Popup.setDOMContent takes a Node.
 * @param {{k?: string, n?: string, t?: string, s?: string}} p  properties from schools-worship.geojson
 * @param {Document} [doc]
 */
export function popupSW(p, doc = document) {
	const kind = (p.k && SW_KIND[p.k]) || '';
	const div = doc.createElement('div');
	for (const [label, v] of [['Name', p.n || '(no name in the source)'], ['What', [kind, p.t].filter(Boolean).join(': ')], ['Address', p.s || '(no address)']]) {
		const line = doc.createElement('div');
		const b = doc.createElement('strong');
		b.textContent = `${label}: `;
		line.append(b, doc.createTextNode(String(v ?? '')));
		div.append(line);
	}
	return div;
}
