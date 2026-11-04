import { readData } from '#lib/server/data.js';

/** The full ABC Law §64(7) quote and how SLAM measures (#60). One page, linked from every
 * address page, so the statute text is not copied into each of them (QA of #66). */
export function load() {
	const { rules, list_ft, liquor_count_ft, buffer_ft, license_counties, worship_classes, religious_classes, class_labels } =
		readData('manifest.json').schools_worship;
	return { rules, list_ft, liquor_count_ft, buffer_ft, license_counties, worship_classes, religious_classes, class_labels };
}
