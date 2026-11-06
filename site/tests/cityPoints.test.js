// #96: map dots, LAMP links and the 500-ft count use the City's address point when SLAM matched
// the address, not data.ny.gov's generated point (blocks off for unhyphenated Queens numbers).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { lampUrl } from '../src/lib/format.js';

const D = 'static/data';
const have = existsSync(`${D}/manifest.json`);
const pages = () => readdirSync(`${D}/address`).filter((f) => f.endsWith('.json') && f !== 'index.json');

test('records on a matched page carry the page point as plon/plat', { skip: !have }, () => {
	let n = 0;
	for (const f of pages()) {
		const a = JSON.parse(readFileSync(`${D}/address/${f}`, 'utf8'));
		for (const r of a.records) {
			if (a.point?.source === 'geosearch' && a.lon != null) {
				assert.equal(r.plon, a.lon, `${a.id} ${r.rid}`);
				assert.equal(r.plat, a.lat, `${a.id} ${r.rid}`);
				n++;
			} else assert.equal(r.plon, undefined, `${a.id} ${r.rid}`);
		}
	}
	assert.ok(n > 1000);
});

test('map dots for records on a matched page sit at the page point', { skip: !have }, () => {
	const pt = {};
	for (const f of pages()) {
		const a = JSON.parse(readFileSync(`${D}/address/${f}`, 'utf8'));
		if (a.point?.source === 'geosearch') pt[a.id] = [a.lon, a.lat];
	}
	for (const slug of ['mn-cd1', 'bk-cd4']) {
		const fc = JSON.parse(readFileSync(`${D}/${slug}/points.geojson`, 'utf8'));
		for (const f of fc.features) {
			if (f.properties.aid && pt[f.properties.aid]) assert.deepEqual(f.geometry.coordinates, pt[f.properties.aid], f.properties.aid);
		}
	}
});

test('the LAMP link prefers the City point', () => {
	const r = { lon: -73.89107, lat: 40.74903, plon: -73.876588, plat: 40.7505 }; // 90 28 37TH AVENUE, Queens
	assert.equal(lampUrl(r.plon ?? r.lon, r.plat ?? r.lat), 'https://lamp.sla.ny.gov/?center=-73.87659,40.7505&level=18');
	assert.equal(lampUrl(undefined ?? r.lon, undefined ?? r.lat), 'https://lamp.sla.ny.gov/?center=-73.89107,40.74903&level=18');
});

test('the manifest says where each counted license was measured from', { skip: !have }, () => {
	const m = JSON.parse(readFileSync(`${D}/manifest.json`, 'utf8'));
	const p = m.schools_worship.on_premises_license_points;
	assert.deepEqual(Object.keys(p).sort(), ['address_page', 'city_address_file', 'sla_point']);
	const total = p.address_page + p.city_address_file + p.sla_point;
	assert.ok(total > 1000, `${total}`);
	assert.ok(p.sla_point / total < 0.05, `${p.sla_point} of ${total} measured from SLA's own point`);
});
