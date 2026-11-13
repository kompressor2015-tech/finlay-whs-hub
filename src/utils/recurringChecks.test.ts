import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPill, checkState, lastDone, missingTemplates, nextDue, templatesFor, type CheckLogLine } from './recurringChecks.ts';

const now = new Date('2026-11-14T04:00:00Z'); // 14/11/2026 in Brisbane
const chk = { interval_months: 6, first_due: null as string | null };
const line = (done_on: string, result: 'passed' | 'failed' = 'passed', created_at = done_on): CheckLogLine => ({
  id: done_on + result, check_id: 'c', done_on, done_by_kind: 'contractor', done_by_name: '', company: 'Fire Co', result, notes: '', file_path: null, file_name: null, action_id: null, recorded_by_name: '', created_at,
});

test('never done, with and without a first due date', () => {
  assert.equal(checkState(chk, [], now), 'never');
  assert.equal(checkState({ ...chk, first_due: '2026-11-01' }, [], now), 'overdue');
  assert.equal(checkPill(chk, [], now).label, 'Not done yet');
});

test('next due is the interval after the newest line', () => {
  const log = [line('2026-02-10'), line('2026-06-01')];
  assert.equal(lastDone(log)?.done_on, '2026-06-01');
  assert.equal(nextDue(chk, log), '2026-12-01');
  assert.equal(checkState(chk, log, now), 'due_soon');
  assert.equal(checkPill(chk, log, now).label, 'Due in 17 days');
});

test('up to date and overdue', () => {
  assert.equal(checkState(chk, [line('2026-10-20')], now), 'ok');
  assert.equal(checkState(chk, [line('2026-04-01')], now), 'overdue');
  assert.equal(checkPill(chk, [line('2026-04-01')], now).tone, 'red');
});

test('a failed check stays outstanding until it is done again', () => {
  const failed = [line('2026-11-10', 'failed')];
  assert.equal(checkState(chk, failed, now), 'overdue');
  assert.equal(checkPill(chk, failed, now).label, 'Failed, do again');
  assert.equal(checkState(chk, [...failed, line('2026-11-13', 'passed')], now), 'ok');
});

test('templates follow the state and flag what is not confirmed', () => {
  const qld = templatesFor('QLD');
  assert.equal(qld.find(t => t.name === 'First aid kit check')?.confirmed, true);
  assert.equal(templatesFor('NSW').find(t => t.name === 'First aid kit check')?.confirmed, false);
  assert.equal(qld.find(t => t.name === 'Fire extinguisher inspection')?.interval_months, 6);
  assert.equal(missingTemplates('QLD', [{ name: 'fire extinguisher inspection' }]).length, qld.length - 1);
});

import { withRecurring, recurringComing } from './homeRecurring.ts';
import { emptyHomeData } from './homeData.ts';

test('home shows overdue, due soon and never-recorded checks', () => {
  const mk = (id: string, first_due: string | null) => ({ id, site_id: 's1', name: id, category: '', interval_months: 6, basis: '', rule_confirmed: true, first_due, notes: '', active: true, created_at: '' });
  const checks = [mk('a', '2026-11-01'), mk('b', '2026-11-20'), mk('c', null), mk('d', '2027-06-01')];
  const home = withRecurring(emptyHomeData(), checks, [], now);
  assert.deepEqual(home.attention.map(a => a.id).sort(), ['checks-late', 'checks-never', 'checks-soon']);
  assert.equal(home.navCounts.recurring, 2);
  const coming = recurringComing(checks, [], [{ id: 's1', name: 'Brisbane Yard' }], now);
  assert.deepEqual(coming.map(c => c.what), ['b']);
});
