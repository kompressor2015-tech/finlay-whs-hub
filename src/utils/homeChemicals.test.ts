import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withChemicals } from './homeChemicals.ts';
import { emptyHomeData } from './homeData.ts';
import type { Chemical, Site, Stock } from './chemicals.ts';

const now = new Date('2026-11-10T00:53:00Z');

test('manifest warnings, stocktakes and SDS gaps reach the home screen', () => {
  const site: Site = { id: 'tomago', name: 'Tomago Site', state: 'NSW', code: 'TOM', stocktake_days: 90 };
  const meths = { id: 'm', name: 'Meths', dg_class: '3', packing_group: 'II', aerosol: false, combustible: null, active: true, subsidiary: '' } as Chemical;
  const s = (id: string, count: number | null, at: string | null): Stock => ({
    id, chemical_id: 'm', site_id: 'tomago', location: 'Cabinet', container: '20 L', container_size: 20, unit: 'L', count, max_count: null, last_counted_at: at, last_counted_by_name: '',
  });
  const home = withChemicals(emptyHomeData(), [site], [meths], [s('a', 105, '2026-11-01T00:00:00Z')], [], now); // 2100 L of 2500 = 84%
  const titles = home.attention.map(a => a.title);
  assert.ok(titles.some(t => t.includes('84% of the manifest quantity')), titles.join(' | '));
  assert.ok(titles.some(t => t.includes('no SDS')));
  assert.equal(home.navCounts.chemicals, 1);

  const first = withChemicals(emptyHomeData(), [site], [meths], [s('a', null, null)], [{ id: 'x', chemical_id: 'm', file_path: '', file_name: '', issue_date: '2025-01-01', uploaded_at: '', uploaded_by_name: '' }], now);
  assert.deepEqual(first.attention.map(a => a.title), ['First chemical stocktake: Tomago Site']);
});
