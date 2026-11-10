import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  answerText, flagByUnit, isProblem, missingAnswers, newItemId, openFlags, resultFor, resultPill, sections, siteInspectionsDue,
  type Checklist, type ChecklistItem, type PlantFlag,
} from './checks.ts';

const guards: ChecklistItem = { id: 'guards', section: 'Checks', type: 'pass_fail', text: 'Guards in place', critical: true };
const leaks: ChecklistItem = { id: 'leaks', section: 'Checks', type: 'pass_fail', text: 'No leaks' };
const crib: ChecklistItem = { id: 'crib', section: 'Yard', type: 'yes_no', text: 'Crib room tidy?', bad: 'no' };
const racking: ChecklistItem = { id: 'racking', section: 'Yard', type: 'tick_list', text: 'Racking', options: ['A', 'B', 'C'] };
const photos: ChecklistItem = { id: 'p', section: 'Grounds', type: 'photo', text: 'Photos', min_photos: 2 };

test('what counts as a problem (same as the database)', () => {
  assert.equal(isProblem(guards, { v: 'fail' }), true);
  assert.equal(isProblem(guards, { v: 'na' }), false);
  assert.equal(isProblem(crib, { v: 'no' }), true);
  assert.equal(isProblem(crib, { v: 'yes' }), false);
  assert.equal(isProblem(racking, { v: ['A', 'B'] }), true);
  assert.equal(isProblem(racking, { v: ['A', 'B', 'C'] }), false);
  assert.equal(isProblem(photos, { photos: [] }), false);
  assert.equal(isProblem(guards, undefined), false);
});

test('pre-start and site results', () => {
  assert.deepEqual(resultFor('prestart', [guards, leaks], { guards: { v: 'fail' }, leaks: { v: 'pass' } }), { result: 'stop', issues: 1 });
  assert.deepEqual(resultFor('prestart', [guards, leaks], { guards: { v: 'pass' }, leaks: { v: 'fail' } }), { result: 'fault', issues: 1 });
  assert.deepEqual(resultFor('prestart', [guards, leaks], { guards: { v: 'pass' }, leaks: { v: 'na' } }), { result: 'ok', issues: 0 });
  assert.deepEqual(resultFor('site', [crib, racking], { crib: { v: 'no' }, racking: { v: ['A'] } }), { result: 'issues', issues: 2 });
  assert.equal(resultFor('take5', [], {}, false).result, 'stop');
  assert.deepEqual(resultPill('prestart', 'stop'), { label: 'Do not operate', tone: 'red' });
  assert.deepEqual(resultPill('site', 'issues', 2), { label: '2 issues', tone: 'amber' });
  assert.deepEqual(resultPill('take5', 'ok'), { label: 'Safe to start', tone: 'green' });
});

test('missing answers block submitting; a fail needs a note', () => {
  const items = [guards, crib, racking, photos];
  assert.deepEqual(missingAnswers(items, {}), ['Guards in place', 'Crib room tidy?', 'Racking', 'Photos (2 photos)']);
  assert.deepEqual(
    missingAnswers(items, { guards: { v: 'fail' }, crib: { v: 'yes' }, racking: { v: [] }, p: { photos: ['a', 'b'] } }),
    ["Guards in place: say what's wrong"]
  );
  assert.deepEqual(missingAnswers(items, { guards: { v: 'fail', note: 'Missing' }, crib: { v: 'yes' }, racking: { v: [] }, p: { photos: ['a', 'b'] } }), []);
});

test('sections keep their order', () => {
  assert.deepEqual(sections([guards, crib, racking, photos]).map(s => [s.name, s.items.length]), [['Checks', 1], ['Yard', 2], ['Grounds', 1]]);
  assert.equal(answerText(racking, { v: ['A'] }), '1 of 3 ticked');
  assert.equal(answerText(crib, { v: 'no' }), 'No');
});

test('site inspections due', () => {
  const now = new Date('2026-11-10T00:53:00Z');
  const cl = (id: string, freq: number | null): Checklist => ({
    id, kind: 'site', name: id, site_id: null, site_name: '', frequency_days: freq, version: 1, items: [], active: true, updated_by_name: '', updated_at: '',
  });
  const due = siteInspectionsDue(
    [cl('a', 30), cl('b', 30), cl('c', 30), cl('d', null)],
    [
      { kind: 'site', checklist_id: 'a', done_at: '2026-10-05T00:00:00Z' },
      { kind: 'site', checklist_id: 'b', done_at: '2026-10-14T00:00:00Z' },
      { kind: 'site', checklist_id: 'b', done_at: '2026-09-14T00:00:00Z' },
    ],
    now
  );
  assert.deepEqual(due.map(d => [d.checklist.id, d.state, d.due]), [['a', 'overdue', '2026-11-04'], ['b', 'due_soon', '2026-11-13'], ['c', 'never', null], ['d', 'ok', null]]);
});

test('flags', () => {
  const f = (id: string, unit: string, level: 'stop' | 'fault', raised: string, cleared: string | null = null): PlantFlag => ({
    id, machine_id: null, unit_no: unit, level, reason: '', check_id: null, incident_id: null, action_id: null, raised_by_name: '', raised_at: raised,
    cleared_at: cleared, cleared_by_name: '', clear_note: '',
  });
  const flags = [f('1', '2417', 'fault', '2026-11-10'), f('2', '1988', 'stop', '2026-11-09'), f('3', '2417', 'stop', '2026-11-08'), f('4', '3102', 'stop', '2026-11-01', '2026-11-02')];
  assert.deepEqual(openFlags(flags).map(x => x.id), ['2', '3', '1']);
  assert.equal(flagByUnit(flags).get('2417')?.level, 'stop');
  assert.equal(flagByUnit(flags).has('3102'), false);
});

test('new question ids are unique', () => {
  assert.equal(newItemId([], 'Fire extinguisher OK?'), 'fire_extinguisher_ok');
  assert.equal(newItemId([{ ...guards, id: 'fire_extinguisher_ok' }], 'Fire extinguisher OK?'), 'fire_extinguisher_ok_2');
});
