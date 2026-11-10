import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  amountOf, classLabel, issueDateFromName, matchSdsFile, rulesFor, sdsPill, sdsState, sdsValidUntil, segregation, siteTotals, stocktakeDue,
  worstLine, type Chemical, type Stock,
} from './chemicals.ts';

const now = new Date('2026-11-10T00:53:00Z');

function chem(id: string, over: Partial<Chemical> = {}): Chemical {
  return {
    id, name: id, manufacturer: '', dg_class: null, subsidiary: '', packing_group: null, un_number: null, aerosol: false, combustible: null,
    ghs_hazardous: null, hazard_summary: '', h_statements: [], ppe: [], first_aid: '', spill: '', supplier_phone: '', section: '', notes: '', active: true,
    ...over,
  };
}
function stock(chemical_id: string, count: number | null, size: number | null, site = 'tomago'): Stock {
  return { id: `${chemical_id}-${site}-${count}-${size}`, chemical_id, site_id: site, location: 'Store', container: '', container_size: size, unit: 'L', count, max_count: null, last_counted_at: null, last_counted_by_name: '' };
}

const meths = chem('meths', { dg_class: '3', packing_group: 'II' });
const turps = chem('turps', { dg_class: '3', packing_group: 'III' });
const hardener = chem('hardener', { dg_class: '3', packing_group: null });
const acetylene = chem('acetylene', { dg_class: '2.1' });
const oxygen = chem('oxygen', { dg_class: '2.2', subsidiary: '5.1' });
const lpg = chem('lpg', { dg_class: '2.1' });
const brakleen = chem('brakleen', { dg_class: '2.1', aerosol: true });
const diesel = chem('diesel', { combustible: 'C1' });
const oil = chem('oil', { combustible: 'C2' });
const resin = chem('resin', { dg_class: '9', packing_group: 'III' });
const corrosive = chem('corrosive', { dg_class: '8', packing_group: 'II' });
const all = new Map([meths, turps, hardener, acetylene, oxygen, lpg, brakleen, diesel, oil, resin, corrosive].map(c => [c.id, c]));

test('amount is containers × size; unknown until counted and sized', () => {
  assert.equal(amountOf({ count: 4, container_size: 20 }), 80);
  assert.equal(amountOf({ count: 3, container_size: 0.4 }), 1.2);
  assert.equal(amountOf({ count: null, container_size: 20 }), null);
  assert.equal(amountOf({ count: 2, container_size: null }), null);
});

test('Schedule 11 figures (QLD/NSW)', () => {
  const r = Object.fromEntries(rulesFor('NSW').map(x => [x.key, x]));
  assert.deepEqual([r['2.1'].placard, r['2.1'].manifest], [200, 5000]);
  assert.deepEqual([r['2.2'].placard, r['2.2'].manifest], [1000, 10000]);
  assert.deepEqual([r['2.3'].placard, r['2.3'].manifest], [50, 500]);
  assert.deepEqual([r.aerosol.placard, r.aerosol.manifest], [5000, 10000]);
  assert.deepEqual([r['3-I'].placard, r['3-I'].manifest], [50, 500]);
  assert.deepEqual([r['3-II'].placard, r['3-II'].manifest], [250, 2500]);
  assert.deepEqual([r['3-III'].placard, r['3-III'].manifest], [1000, 10000]);
  assert.deepEqual([r['3-all'].placard, r['3-all'].manifest], [1000, 10000]);
  assert.deepEqual([r['8-II'].placard, r['8-II'].manifest], [250, 2500]);
  assert.deepEqual([r.C1.placard, r.C1.manifest], [10000, 100000]);
  assert.equal(r['9'], undefined, 'Class 9 is not in Schedule 11');
  assert.equal(r.mixed, undefined);
});

test('Victorian Schedule 2 manifest figures (no placard figures)', () => {
  const r = Object.fromEntries(rulesFor('VIC').map(x => [x.key, x]));
  assert.equal(r['2.1'].manifest, 5000);
  assert.equal(r['2.2'].manifest, 10000);
  assert.equal(r['2.3'].manifest, 500);
  assert.equal(r.aerosol.manifest, 10000);
  assert.equal(r['3-I'].manifest, 500);
  assert.equal(r['3-II'].manifest, 2500);
  assert.equal(r['3-III'].manifest, 10000);
  assert.equal(r['9'].manifest, 10000);
  assert.equal(r.mixed.manifest, 10000);
  assert.equal(r.C1.manifest, 100000);
  assert.ok(rulesFor('VIC').every(x => x.placard === null));
});

test('site totals add up by class, flag unknowns and warn at 80% of the manifest quantity', () => {
  const lines = siteTotals('NSW', [
    stock('meths', 10, 20), // 200 L PG II
    stock('meths', 50, 20, 'tomago'), // +1000 L → 1200 L PG II (manifest 2500: 48%)
    stock('turps', 5, 20), // 100 L PG III
    stock('hardener', 2, 5), // 10 L, PG unknown → counted as PG I
    stock('acetylene', 6, 40), // 240 L water capacity
    stock('lpg', null, 108), // not counted yet
    stock('brakleen', 24, 0.4), // 9.6 L aerosol
    stock('diesel', 1, 6200),
    stock('oil', 2, 205), // C2: not counted anywhere
    stock('resin', 3, 5), // Class 9: no Schedule 11 line
  ], all);
  const by = Object.fromEntries(lines.map(l => [l.key, l]));
  assert.equal(by['3-II'].total, 1200);
  assert.equal(by['3-II'].status, 'ok');
  assert.equal(by['3-I'].total, 10);
  assert.equal(by['3-I'].assumedPg, 1);
  assert.equal(by['3-all'].total, 1310);
  assert.equal(by['3-all'].overPlacard, true, '1310 L of mixed flammable liquids is over the 1000 L placard quantity');
  assert.equal(by['2.1'].total, 240);
  assert.equal(by['2.1'].unknown, 1);
  assert.equal(by['2.1'].overPlacard, true);
  assert.equal(by.aerosol.total, 9.6);
  assert.equal(by.C1.total, 6200);
  assert.equal(by['9'], undefined);
  assert.ok(!lines.some(l => l.key.startsWith('C2')));
  assert.equal(worstLine(lines)?.key, '3-II');

  const close = siteTotals('NSW', [stock('meths', 101, 20)], all); // 2020 L of 2500 = 81%
  assert.equal(close.find(l => l.key === '3-II')?.status, 'close');
  const over = siteTotals('VIC', [stock('meths', 125, 20)], all); // 2500 L = manifest
  assert.equal(over.find(l => l.key === '3-II')?.status, 'over');
});

test('Victoria adds every dangerous good into one mixed total', () => {
  const lines = siteTotals('VIC', [stock('meths', 10, 20), stock('acetylene', 2, 40), stock('resin', 2, 5), stock('diesel', 1, 1000)], all);
  const mixed = lines.find(l => l.key === 'mixed');
  assert.equal(mixed?.total, 200 + 80 + 10, 'diesel (C1) is not a dangerous good class here');
  assert.equal(lines.find(l => l.key === 'C1')?.manifest, 100000);
});

test('SDS age', () => {
  assert.equal(sdsValidUntil('2023-01-05'), '2028-01-05');
  assert.equal(sdsState(null, now), 'missing');
  assert.equal(sdsState({ issue_date: '2021-11-01' }, now), 'expired');
  assert.equal(sdsState({ issue_date: '2021-12-20' }, now), 'due_soon');
  assert.equal(sdsState({ issue_date: '2024-01-25' }, now), 'ok');
  assert.deepEqual(sdsPill({ issue_date: '2024-01-25' }, now), { label: 'Valid to 01/2029', tone: 'green' });
  assert.deepEqual(sdsPill(null, now), { label: 'No SDS', tone: 'red' });
});

test('segregation rules', () => {
  assert.equal(segregation(oxygen, lpg).verdict, 'apart');
  assert.equal(segregation(oxygen, diesel).verdict, 'apart');
  assert.equal(segregation(meths, oxygen).verdict, 'apart');
  assert.equal(segregation(acetylene, chem('x', { dg_class: '2.3' })).verdict, 'apart');
  assert.equal(segregation(chem('w', { dg_class: '4.3' }), corrosive).verdict, 'apart');
  assert.equal(segregation(corrosive, chem('c2', { dg_class: '8' })).verdict, 'check');
  assert.equal(segregation(meths, turps).verdict, 'ok');
  assert.equal(segregation(oil, chem('grease')).verdict, 'ok');
});

test('class labels', () => {
  assert.equal(classLabel(meths), 'Class 3 · PG II');
  assert.equal(classLabel(oxygen), 'Class 2.2 · sub 5.1');
  assert.equal(classLabel(brakleen), 'Class 2.1 Aerosol');
  assert.equal(classLabel(diesel), 'C1 Combustible');
  assert.equal(classLabel(chem('g')), 'Non-DG');
});

test('stocktake every 90 days from the oldest count', () => {
  const site = { stocktake_days: 90 };
  assert.equal(stocktakeDue(site, [{ last_counted_at: null }], now).state, 'never');
  const d = stocktakeDue(site, [{ last_counted_at: '2026-08-04T00:00:00Z' }, { last_counted_at: '2026-10-01T00:00:00Z' }], now);
  assert.deepEqual([d.due, d.state], ['2026-11-02', 'overdue']);
  assert.equal(stocktakeDue(site, [{ last_counted_at: '2026-08-20T00:00:00Z' }], now).state, 'due_soon');
  assert.equal(stocktakeDue(site, [{ last_counted_at: '2026-11-01T00:00:00Z' }], now).state, 'ok');
});

test('SDS file names match products (from your folders)', () => {
  const products = [
    'CRC Brakleen Parts Cleaner', 'Castrol Hyspin AWS 68 Hydraulic Oil', 'Castrol Hyspin AWS 46 Hydraulic Oil', 'Megapoxy HICB – Part B (Hardener)',
    'Megapoxy HICB – Part A (Resin)', 'BOC Acetylene (Dissolved)', 'Methylated Spirits v10', 'CAT DEO 15W-40 Diesel Engine Oil', 'Tip Top Cement SC 4000 (White/Green)',
    'Tip Top Verstärker RE (Hardener)', '462-Line Metalshield Etch Primer', '466-Line Metalshield Etch Primer',
  ].map(name => ({ id: name, name }));
  const m = (f: string) => matchSdsFile(f, products)?.id;
  assert.equal(m('CRC Brakleen.pdf'), 'CRC Brakleen Parts Cleaner');
  assert.equal(m('Hyspin AWS 68 - 3134871.pdf'), 'Castrol Hyspin AWS 68 Hydraulic Oil');
  assert.equal(m('Castrol - Hyspin AWS 68 MSDS.pdf'), 'Castrol Hyspin AWS 68 Hydraulic Oil');
  assert.equal(m('Megapoxy HCIB Part B SDS.pdf'), 'Megapoxy HICB – Part B (Hardener)');
  assert.equal(m('sds-hicb-part-b-version-2.1.pdf'), 'Megapoxy HICB – Part B (Hardener)');
  assert.equal(m('BOC Acetylene SDS.pdf'), 'BOC Acetylene (Dissolved)');
  assert.equal(m('Methylated Spirits v10.pdf'), 'Methylated Spirits v10');
  assert.equal(m('CAT DEO 15W-40 SDS.pdf'), 'CAT DEO 15W-40 Diesel Engine Oil');
  assert.equal(m('Verstarker RE.pdf'), 'Tip Top Verstärker RE (Hardener)');
  assert.equal(m('462-LINE_METALSHIELD_ETCH_PRIMER_-AUS_GHS.pdf'), '462-Line Metalshield Etch Primer');
  assert.ok((matchSdsFile('CRC Brakleen.pdf', products)?.score ?? 0) >= 0.5);
});

test('issue date guesses from file names', () => {
  assert.equal(issueDateFromName('Casteol - Clearedge-EP-69 0-20-ltr (1) 30.05.2015.pdf'), '2015-05-30');
  assert.equal(issueDateFromName('INOX-MX3-Aerosol-July-2025.pdf'), '2025-07-01');
  assert.equal(issueDateFromName('Chemtools Isopropyl Alcohol SDS 2023.pdf'), '2023-01-01');
  assert.equal(issueDateFromName('Small_Engine_Hi-Per_Two_Stroke_Engine_Oil-GHS_SDS_2021_08_16.pdf'), '2021-08-16');
  assert.equal(issueDateFromName('CRC Brakleen.pdf'), null);
});
