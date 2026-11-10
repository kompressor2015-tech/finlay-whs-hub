import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withChecks } from './homeChecks.ts';
import { emptyHomeData } from './homeData.ts';
import type { Check, Checklist, PlantFlag } from './checks.ts';

const now = new Date('2026-11-10T00:53:00Z');

test('flags, overdue site inspections and unsafe Take 5s reach the home screen', () => {
  const flag: PlantFlag = {
    id: 'f1', machine_id: null, unit_no: '1988', level: 'stop', reason: 'Guard missing', check_id: 'c1', incident_id: null, action_id: null,
    raised_by_name: 'Field', raised_at: '2026-11-09T20:30:00Z', cleared_at: null, cleared_by_name: '', clear_note: '',
  };
  const site: Checklist = {
    id: 'cl1', kind: 'site', name: 'Site inspection: Burpengary Yard', site_id: null, site_name: 'Burpengary Yard', frequency_days: 30, version: 1,
    items: [], active: true, updated_by_name: '', updated_at: '',
  };
  const take5 = { id: 't1', kind: 'take5', result: 'stop', task: 'Change mesh', unit_no: '', done_by_name: 'Field', site_name: '', done_at: '2026-11-09T22:00:00Z', checklist_id: null, issue_count: 0, checklist_name: '' } as unknown as Check;
  const home = withChecks(emptyHomeData(), [flag], [site], [take5], now);
  const plant = home.summary.find(s => s.id === 'plant');
  assert.equal(plant?.value, 1);
  assert.equal(plant?.sub, '1 do not use');
  assert.deepEqual(home.attention.map(a => [a.urgency, a.unit ?? '', a.href]), [
    ['overdue', '1988', '#/m/plant'],
    ['review', '', '#/checks/new-site-cl1'],
    ['review', '', '#/checks/t1'],
  ]);
  assert.equal(home.latest[0].type, 'Take 5');
  assert.equal(home.navCounts.plant, 1);
});
