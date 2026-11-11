import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actionSplit, brisbaneMonth, chemicalHealth, lastMonths, monthlyCounts } from './homeCharts.ts';
import type { Chemical, Sds } from './chemicals.ts';

const now = new Date('2026-11-10T00:53:00Z'); // 10:53 on 10/11/2026 in Brisbane

test('months run oldest to newest in Brisbane time and cross the year end', () => {
  assert.deepEqual(lastMonths(new Date('2027-01-15T00:00:00Z'), 4).map(m => m.key), ['2026-10', '2026-11', '2026-12', '2027-01']);
  // 14:30 UTC on 31/10 is already 1 November in Brisbane
  assert.equal(brisbaneMonth('2026-10-31T14:30:00Z'), '2026-11');
});

test('hazards and incidents are counted into their month, older ones are left out', () => {
  const m = monthlyCounts(
    [{ created_at: '2026-11-02T00:00:00Z' }, { created_at: '2026-11-03T00:00:00Z' }, { created_at: '2026-10-05T00:00:00Z' }, { created_at: '2025-01-01T00:00:00Z' }],
    [{ occurred_at: '2026-10-31T14:30:00Z' }],
    now,
  );
  assert.equal(m.length, 6);
  assert.deepEqual(m.slice(-2).map(x => [x.label, x.hazards, x.incidents]), [['Oct', 1, 0], ['Nov', 2, 1]]);
});

test('actions split into done, overdue, due soon and open', () => {
  const s = actionSplit(
    [
      { status: 'done', due: '2026-11-01' },
      { status: 'not_started', due: '2026-11-01' },
      { status: 'in_progress', due: '2026-11-11' },
      { status: 'not_started', due: null },
    ],
    now,
  );
  assert.equal(s.done, 1);
  assert.equal(s.overdue, 1);
  assert.equal(s.dueSoon + s.open, 2);
});

test('chemical health counts checked classes and in-date SDS against all active products', () => {
  const chem = (id: string, confirmed: boolean, active = true) => ({ id, class_confirmed: confirmed, active }) as Chemical;
  const sds = (id: string, issue: string): Sds => ({ id: `s${id}`, chemical_id: id, file_path: '', file_name: '', issue_date: issue, uploaded_at: '', uploaded_by_name: '' });
  const h = chemicalHealth([chem('a', true), chem('b', false), chem('c', true, false)], [sds('a', '2025-01-01'), sds('b', '2019-01-01')], now);
  assert.deepEqual(h.map(x => [x.id, x.good, x.total]), [['class', 1, 2], ['sds', 1, 2]]);
  assert.deepEqual(chemicalHealth([], [], now), []);
});
