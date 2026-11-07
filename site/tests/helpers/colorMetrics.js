/**
 * Color math for the map palette test (#111 color revision). Test-only, no dependencies.
 *
 * - sRGB -> linear RGB -> XYZ (D65) -> CIELAB: IEC 61966-2-1 sRGB transfer function and the sRGB
 *   matrix; CIELAB with the D65 reference white (CIE 15:2004).
 * - CIEDE2000: Sharma, Wu and Dalal, "The CIEDE2000 Color-Difference Formula: Implementation
 *   Notes, Supplementary Test Data, and Mathematical Observations", Color Research & Application
 *   30(1), 2005. Equations (1)-(23) of that paper, kL = kC = kH = 1. The test checks this function
 *   against rows of the paper's Table 1.
 * - Color-vision-deficiency simulation: Machado, Oliveira and Fernandes, "A Physiologically-based
 *   Model for Simulation of Color Vision Deficiency", IEEE TVCG 15(6), 2009, severity 1.0 matrices
 *   (protanopia, deuteranopia, tritanopia), applied to linear RGB and clipped to [0, 1].
 * - WCAG 2 relative luminance and contrast ratio: https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
 */

/** @param {string} hex  #rrggbb @returns {[number, number, number]} 0..1 */
export function hexToRgb(hex) {
	const h = hex.replace('#', '');
	if (!/^[0-9a-f]{6}$/i.test(h)) throw new Error(`not a #rrggbb color: ${hex}`);
	return /** @type {[number, number, number]} */ ([0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255));
}

/** @param {number} c */
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
/** @param {number} c */
const toGamma = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** @param {string} hex @returns {[number, number, number]} */
export function hexToLinear(hex) {
	return /** @type {[number, number, number]} */ (hexToRgb(hex).map(toLinear));
}

/** @param {[number, number, number]} lin @returns {string} */
export function linearToHex(lin) {
	return '#' + lin.map((c) => Math.round(Math.min(1, Math.max(0, toGamma(Math.min(1, Math.max(0, c))))) * 255).toString(16).padStart(2, '0')).join('');
}

/** @param {[number, number, number]} lin @returns {[number, number, number]} CIELAB, D65 */
export function linearToLab(lin) {
	const [r, g, b] = lin;
	const X = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b;
	const Y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
	const Z = 0.0193339 * r + 0.119192 * g + 0.9503041 * b;
	/** @param {number} t */
	const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
	const fx = f(X / 0.95047);
	const fy = f(Y / 1.0);
	const fz = f(Z / 1.08883);
	return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** @param {string} hex */
export const hexToLab = (hex) => linearToLab(hexToLinear(hex));

/**
 * CIEDE2000 color difference between two CIELAB colors (Sharma et al. 2005).
 * @param {[number, number, number]} lab1 @param {[number, number, number]} lab2
 */
export function ciede2000(lab1, lab2) {
	const [L1, a1, b1] = lab1;
	const [L2, a2, b2] = lab2;
	const rad = Math.PI / 180;
	const C1 = Math.hypot(a1, b1);
	const C2 = Math.hypot(a2, b2);
	const Cbar = (C1 + C2) / 2;
	const G = 0.5 * (1 - Math.sqrt(Cbar ** 7 / (Cbar ** 7 + 25 ** 7)));
	const a1p = (1 + G) * a1;
	const a2p = (1 + G) * a2;
	const C1p = Math.hypot(a1p, b1);
	const C2p = Math.hypot(a2p, b2);
	/** @param {number} b @param {number} ap */
	const hp = (b, ap) => (b === 0 && ap === 0 ? 0 : ((Math.atan2(b, ap) / rad) + 360) % 360);
	const h1p = hp(b1, a1p);
	const h2p = hp(b2, a2p);
	const dLp = L2 - L1;
	const dCp = C2p - C1p;
	let dhp = 0;
	if (C1p * C2p !== 0) {
		dhp = h2p - h1p;
		if (dhp > 180) dhp -= 360;
		else if (dhp < -180) dhp += 360;
	}
	const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad);
	const Lbp = (L1 + L2) / 2;
	const Cbp = (C1p + C2p) / 2;
	let hbp = h1p + h2p;
	if (C1p * C2p !== 0) {
		if (Math.abs(h1p - h2p) <= 180) hbp = (h1p + h2p) / 2;
		else if (h1p + h2p < 360) hbp = (h1p + h2p + 360) / 2;
		else hbp = (h1p + h2p - 360) / 2;
	}
	const T = 1 - 0.17 * Math.cos((hbp - 30) * rad) + 0.24 * Math.cos(2 * hbp * rad) + 0.32 * Math.cos((3 * hbp + 6) * rad) - 0.2 * Math.cos((4 * hbp - 63) * rad);
	const dTheta = 30 * Math.exp(-(((hbp - 275) / 25) ** 2));
	const RC = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
	const SL = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2);
	const SC = 1 + 0.045 * Cbp;
	const SH = 1 + 0.015 * Cbp * T;
	const RT = -Math.sin(2 * dTheta * rad) * RC;
	return Math.sqrt((dLp / SL) ** 2 + (dCp / SC) ** 2 + (dHp / SH) ** 2 + RT * (dCp / SC) * (dHp / SH));
}

/** Machado et al. 2009, severity 1.0, for linear RGB. */
export const CVD_MATRICES = {
	protanopia: [
		[0.152286, 1.052583, -0.204868],
		[0.114503, 0.786281, 0.099216],
		[-0.003882, -0.048116, 1.051998]
	],
	deuteranopia: [
		[0.367322, 0.860646, -0.227968],
		[0.280085, 0.672501, 0.047413],
		[-0.01182, 0.04294, 0.968881]
	],
	tritanopia: [
		[1.255528, -0.076749, -0.178779],
		[-0.078411, 0.930809, 0.147602],
		[0.004733, 0.691367, 0.3039]
	]
};

/** @typedef {'normal' | keyof typeof CVD_MATRICES} Vision */
/** @type {Vision[]} */
export const VISIONS = ['normal', 'protanopia', 'deuteranopia', 'tritanopia'];

/** A color as seen with a given vision, as linear RGB clipped to [0, 1]. @param {string} hex @param {Vision} v */
export function simulate(hex, v) {
	const lin = hexToLinear(hex);
	if (v === 'normal') return lin;
	const m = CVD_MATRICES[v];
	return /** @type {[number, number, number]} */ (m.map((row) => Math.min(1, Math.max(0, row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2]))));
}

/** CIEDE2000 between two hex colors as seen with vision `v`. @param {string} a @param {string} b @param {Vision} [v] */
export function deltaE(a, b, v = 'normal') {
	return ciede2000(linearToLab(simulate(a, v)), linearToLab(simulate(b, v)));
}

/** WCAG 2 relative luminance. @param {string} hex */
export function luminance(hex) {
	const [r, g, b] = hexToLinear(hex);
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio. @param {string} a @param {string} b */
export function contrast(a, b) {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
}

/** `fg` at `alpha` over `bg`, composited in sRGB the way a browser canvas does. @param {string} fg @param {number} alpha @param {string} bg */
export function over(fg, alpha, bg) {
	const f = hexToRgb(fg);
	const b = hexToRgb(bg);
	return '#' + f.map((c, i) => Math.round((alpha * c + (1 - alpha) * b[i]) * 255).toString(16).padStart(2, '0')).join('');
}

/**
 * OKLCH from sRGB, Björn Ottosson's OKLab (https://bottosson.github.io/posts/oklab/, the
 * "linear_srgb_to_oklab" matrices). Used only to check which hue family a color sits in.
 * @param {string} hex @returns {[number, number, number]} [L 0..1, C, h degrees 0..360)
 */
export function hexToOklch(hex) {
	const [r, g, b] = hexToLinear(hex);
	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
	const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
	const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
	const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
	return [L, Math.hypot(A, B), ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360];
}
