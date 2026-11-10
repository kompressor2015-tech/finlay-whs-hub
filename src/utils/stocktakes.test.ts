import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Chemical, Stock } from './chemicals.ts';
import {
  buildSheet, classToConfirm, countedThisRound, frequencyLabel, roundProgress, sheetTotals, snapshotLines, stocktakeRef,
} from './stocktakes.ts';
import { brisbaneDay } from './dates.ts';

const chem = (id: string, name: string, extra: Partial<Chemical> = {}): Chemical => ({
  id, name, manufacturer: '', dg_class: null, subsidiary: '', packing_group: null, un_number: null, aerosol: false, combustible: null, ghs_hazardous: null,
  hazard_summary: '', h_statements: [], ppe: [], first_aid: '', spill: '', supplier_phone: '', section: 'Oils, hydraulic fluids & greases',
  class_confirmed: true, notes: '', active: true, ...extra,
});
const stock = (id: string, chemical_id: string, size: number | null, count: number | null, at: string | null, location = 'Oil Store'): Stock => ({
  id, chemical_id, site_id: 'burpengary', location, container: '', container_size: size, unit: 'L', count, max_count: null, last_counted_at: at, last_counted_by_name: '',
});

const wasteOil = chem('wo', 'Waste Oil', { class_confirmed: false });
const thinners = chem('th', 'Thinners', { section: 'Paints, coatings & bonding', dg_class: '3', packing_group: 'II' });
const old = chem('old', 'Old stuff', { active: false });
const byId = new Map([wasteOil, thinners, old].map(c => [c.id, c]));

const stockRows = [
  stock('a', 'wo', 20, 0, '2026-11-01T00:00:00Z'),
  stock('b', 'wo', 500, 1, '2026-11-01T00:00:00Z', 'Bunded area'),
  stock('c', 'wo', 10, null, null),
  stock('d', 'th', 20, 3, '2026-08-01T00:00:00Z', 'Paint Store'),
  stock('e', 'old', 20, 1, '2026-11-01T00:00:00Z'),
];

test('class to confirm is only an explicit false', () => {
  assert.equal(classToConfirm(wasteOil), true);
  assert.equal(classToConfirm(thinners), false);
  assert.equal(classToConfirm({} as Chemical), false);
});

test('snapshot copies every active item with its class', () => {
  const lines = snapshotLines(stockRows, byId);
  assert.equal(lines.length, 4);
  assert.deepEqual(lines.map(l => l.name), ['Thinners', 'Waste Oil', 'Waste Oil', 'Waste Oil']);
  assert.equal(lines[0].class_label, 'Class 3 · PG II');
  assert.equal(lines[1].class_confirmed, false);
});

test('the sheet groups container sizes per product, like the paper audit', () => {
  const sheet = buildSheet(snapshotLines(stockRows, byId));
  assert.deepEqual(sheet.sections.map(s => `${s.letter}. ${s.section}`), ['A. Paints, coatings & bonding', 'B. Oils, hydraulic fluids & greases']);
  const wo = sheet.sections[1].rows[0];
  assert.deepEqual(wo.groups.map(g => [g.size, g.qty, g.subtotal]), [[500, 1, 500], [20, 0, 0], [10, null, null]]);
  assert.equal(wo.total, 500);
  assert.equal(wo.incomplete, true);
  assert.equal(sheet.columns, 3);
  assert.deepEqual(sheet.columnTotals, [560, 0, 0]);
  assert.equal(sheet.grandTotal, 560);
  assert.equal(sheet.incomplete, 1);
  assert.equal(sheet.toConfirm, 1);
  assert.equal(sheet.items, 4);
});

test('more than three container sizes widens the sheet', () => {
  const rows = [5, 10, 20, 205].map((size, i) => stock(`s${i}`, 'th', size, 1, null));
  assert.equal(buildSheet(snapshotLines(rows, byId)).columns, 4);
});

test('the threshold check on the sheet uses the stocktake figures', () => {
  const lines = sheetTotals('QLD', snapshotLines(stockRows, byId));
  const pg2 = lines.find(l => l.key === '3-II');
  assert.equal(pg2?.total, 60);
  assert.equal(pg2?.manifest, 2500);
});

test('counted this round means since the last finished stocktake', () => {
  assert.equal(countedThisRound({ last_counted_at: null }, null), false);
  assert.equal(countedThisRound({ last_counted_at: '2026-08-01T00:00:00Z' }, null), true);
  assert.equal(countedThisRound({ last_counted_at: '2026-08-01T00:00:00Z' }, '2026-09-01T00:00:00Z'), false);
  const p = roundProgress(stockRows, '2026-09-01T00:00:00Z');
  assert.equal(p.counted, 3);
  assert.deepEqual(p.left.map(s => s.id), ['c', 'd']);
});

test('frequency labels and the sheet reference', () => {
  assert.equal(frequencyLabel(90), 'Every 3 months');
  assert.equal(frequencyLabel(30), 'Monthly');
  assert.equal(frequencyLabel(45), 'Every 45 days');
  assert.equal(stocktakeRef('BUR', '2026-11-09T20:00:00Z', brisbaneDay), 'STK-BUR-20261110');
});
