import { readData } from '#lib/server/data.js';

/** The one address page (#84) is prerendered once, as a shell. Each address's own data is
 * fetched in the browser (static/data/address/<id>.json); this load carries only what is the
 * same on every address page: what the "Schools and houses of worship nearby" section reads
 * (#60). The full statute text is on /rules/ only (QA of #66). */
export function load() {
	const { rules, cannabis_rules, cannabis_school_ft, cannabis_worship_ft, list_ft, liquor_count_ft, on_premises_classes } = readData('manifest.json').schools_worship;
	const rule = { law: rules.law, url: rules.url };
	return {
		sw: {
			rule,
			list_ft,
			liquor_count_ft,
			on_premises_classes,
			cannabis: { rule: { law: cannabis_rules.law, url: cannabis_rules.url }, school_ft: cannabis_school_ft, worship_ft: cannabis_worship_ft }
		}
	};
}
