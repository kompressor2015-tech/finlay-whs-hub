import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBoard } from './homeBoard.ts';
import type { Chemical, Sds, Site, Stock } from './chemicals.ts';
import type { Checklist } from './checks.ts';

const now = new Date('2026-11-10T00:53:00Z');
const bur: Site = { id: 'bur', name: 'Burpengary Yard', state: 'QLD', code: 'BUR', stocktake_days: 90 };
const som: Site = { id: 'som', name: 'Somerton Workshop', state: 'VIC', code: 'SOM', stocktake_days: 90 };
const line = (id: string, site: string, at: string | null): Stock => ({
  id, chemical_id: 'a', site_id: site, location: 'Shed', container: '', container_size: 20, unit: 'L', count: 1, max_count: null, last_counted_at: at, last_counted_by_name: '',
});
const chem = { id: 'a', active: true } as Chemical;
const sds = (issue: string): Sds => ({ id: 's', chemical_id: 'a', file_path: '', file_name: '', issue_date: issue, uploaded_at: '', uploaded_by_name: '' });
const list = (id: string, freq: number | null): Checklist => ({
  id, kind: 'site', name: 'Monthly inspection', site_id: 'bur', site_name: 'Burpengary Yard', frequency_days: freq, version: 1, items: [], active: true, updated_by_name: '', updated_at: '',
});

test('sites show their stocktake state and the board counts what is due', () => {
  const b = buildBoard([bur, som], [chem], [line('1', 'bur', '2026-11-09T00:00:00Z'), line('2', 'som', null)], [sds('2021-12-01')], [], [], now);
  assert.deepEqual(b.sites.map(s => [s.name, s.pill]), [['Burpengary Yard', 'Up to date'], ['Somerton Workshop', 'Not counted']]);
  assert.equal(b.stocktakesDue, 1);
  assert.deepEqual(b.stocktakeSites, ['Somerton']);
  assert.equal(b.sdsToReview, 1); // valid to 01/12/2026, inside the 90-day review window
  assert.ok(b.coming.some(c => c.what.includes('1 SDS reach 5 years')), JSON.stringify(b.coming));
});

test('an SDS over 5 years old, or missing, needs review', () => {
  const old = buildBoard([bur], [chem], [], [sds('2019-01-01')], [], [], now);
  assert.equal(old.sdsToReview, 1);
  assert.equal(buildBoard([bur], [chem], [], [], [], [], now).sdsToReview, 1);
});

test('inspections with no schedule are left out, and never-done ones count as due', () => {
  const b = buildBoard([], [], [], [], [list('x', 30), list('y', null)], [], now);
  assert.equal(b.inspectionsDue, 1);
  assert.deepEqual(b.inspections, { ok: 1, total: 1 });
});
