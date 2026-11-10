import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  actionCounts, actionPill, actionState, buildHome, canClose, dueWords, hazardFixBy, incidentSteps,
  keepRecordUntil, notifiableSummary, riskFor, sortActions,
  type Hazard, type Incident, type WhsAction,
} from './records.ts';

const now = new Date('2026-11-10T00:53:00Z'); // 10/11/2026 10:53 Brisbane

function incident(over: Partial<Incident> = {}): Incident {
  return {
    id: 'i1', ref: 'INC-0001', type: 'injury', occurred_at: '2026-11-02T23:40:00Z', site_id: null, site_name: 'Narangba',
    location_detail: '', machine_id: null, unit_no: '', people: '', description: 'Hand caught in roller', immediate_action: '',
    photos: [], notifiable_reasons: [], notifiable: false, whsq_called_at: null, whsq_called_by: '', whsq_reference: '',
    site_released_at: null, site_released_by: '', status: 'new', investigation_lead: null, investigation_due: null,
    why_chain: [], factors: [], closed_at: null, reported_by: 'u1', reporter_name: 'Field', created_at: '2026-11-02T23:52:00Z',
    ...over,
  };
}

function action(over: Partial<WhsAction> = {}): WhsAction {
  return {
    id: 'a1', title: 'Fit guard', source_type: 'incident', source_id: 'i1', source_ref: 'INC-0001', machine_id: null,
    unit_no: '', owner_id: 'u1', owner_name: 'Field', due: '2026-11-07', status: 'not_started', done_note: '', done_at: null,
    created_at: '2026-11-05T00:00:00Z', ...over,
  };
}

function hazard(over: Partial<Hazard> = {}): Hazard {
  return {
    id: 'h1', ref: 'HAZ-0001', description: 'Broken drain cover', site_id: null, site_name: 'Pinkenba', location_detail: '',
    machine_id: null, unit_no: '', photos: [], severity: 'injury', made_safe: 'partly', made_safe_note: '', status: 'new',
    closed_at: null, reported_by: 'u1', reporter_name: 'Field', created_at: '2026-11-09T22:00:00Z', ...over,
  };
}

test('notifiable records are kept 5 years from when WHSQ was told', () => {
  assert.equal(keepRecordUntil({ whsq_called_at: '2026-11-03T00:05:00Z', occurred_at: '2026-11-02T23:40:00Z' }), '2031-11-03');
  // Not yet called: count from the incident (09:40 on 03/11 in Brisbane)
  assert.equal(keepRecordUntil({ whsq_called_at: null, occurred_at: '2026-11-02T23:40:00Z' }), '2031-11-03');
  assert.equal(notifiableSummary(['serious', 'dangerous']), 'Serious injury or illness, Dangerous incident');
});

test('hazard risk and fix-by date', () => {
  assert.equal(riskFor('injury').label, 'Medium');
  assert.equal(riskFor('fatal').days, 0);
  // Reported 08:00 on 10/11 Brisbane
  assert.equal(hazardFixBy(hazard({ severity: 'injury' })), '2026-11-17');
  assert.equal(hazardFixBy(hazard({ severity: 'serious' })), '2026-11-11');
  assert.equal(hazardFixBy(hazard({ severity: 'fatal' })), '2026-11-10');
  assert.equal(hazardFixBy(hazard({ severity: 'minor' })), '2026-12-10');
});

test('action state, pill and order', () => {
  assert.equal(actionState(action(), now), 'overdue');
  assert.equal(actionState(action({ due: '2026-11-12' }), now), 'due_soon');
  assert.equal(actionState(action({ due: null }), now), 'open');
  assert.equal(actionState(action({ status: 'done' }), now), 'done');
  assert.deepEqual(actionPill(action({ due: '2026-12-01', status: 'in_progress' }), now), { label: 'In progress', tone: 'blue' });
  assert.deepEqual(actionPill(action(), now), { label: 'Overdue', tone: 'red' });

  const sorted = sortActions([
    action({ id: 'done', title: 'd', status: 'done', done_at: '2026-11-09T00:00:00Z' }),
    action({ id: 'later', title: 'l', due: '2026-12-01' }),
    action({ id: 'none', title: 'n', due: null }),
    action({ id: 'late2', title: 'b', due: '2026-11-08' }),
    action({ id: 'late1', title: 'a', due: '2026-11-05' }),
  ], now);
  assert.deepEqual(sorted.map(a => a.id), ['late1', 'late2', 'later', 'none', 'done']);
});

test('action counts', () => {
  const c = actionCounts([
    action(),
    action({ due: '2026-11-12' }),
    action({ due: '2026-12-20' }),
    action({ status: 'done', done_at: '2026-11-02T00:00:00Z' }),
    action({ status: 'done', done_at: '2026-10-02T00:00:00Z' }),
  ], now);
  assert.deepEqual(c, { overdue: 1, dueSoon: 1, open: 3, doneThisMonth: 1 });
});

test('incident progress and closing', () => {
  const inv = incident({ status: 'investigating', investigation_due: '2026-11-13' });
  const steps = incidentSteps(inv, [action(), action({ status: 'done' })]);
  assert.deepEqual(steps.map(s => s.state), ['done', 'now', 'todo', 'todo']);
  assert.equal(steps[1].sub, 'Due 13/11/2026');
  assert.equal(steps[2].sub, '1 of 2 done');
  assert.deepEqual(incidentSteps(incident({ status: 'closed', closed_at: '2026-11-09T00:00:00Z' }), []).map(s => s.state), ['done', 'done', 'done', 'done']);
  assert.equal(canClose(inv, [action()]), false);
  assert.equal(canClose(inv, [action({ status: 'done' })]), true);
  assert.equal(canClose(inv, []), true);
  assert.equal(canClose(incident({ status: 'closed' }), []), false);
});

test('home screen from real records', () => {
  const home = buildHome(
    [incident({ notifiable_reasons: ['serious'], notifiable: true }), incident({ id: 'i2', ref: 'INC-0002', status: 'closed' })],
    [hazard()],
    [action(), action({ id: 'a2', due: '2026-12-20', owner_id: 'someone-else' })],
    'u1',
    now
  );
  assert.equal(home.summary[0].value, 1);
  assert.equal(home.summary[0].sub, '1 notifiable this year');
  assert.equal(home.summary[1].value, 1);
  assert.equal(home.summary[2].value, 1);
  assert.deepEqual(home.attention.map(a => a.urgency).sort(), ['overdue', 'review', 'review']);
  assert.equal(home.latest[0].type, 'Hazard');
  assert.equal(home.phoneToday.length, 1);
  assert.equal(home.phoneToday[0].pill, 'Overdue');
  assert.deepEqual(home.navCounts, { incidents: 1, hazards: 1, actions: 2 });
});

test('due words', () => {
  assert.equal(dueWords('2026-11-10', now), 'Due today');
  assert.equal(dueWords('2026-11-13', now), 'Due in 3 days');
  assert.equal(dueWords('2026-11-09', now), '1 day late');
  assert.equal(dueWords('2026-11-05', now), '5 days late');
  assert.equal(dueWords(null, now), 'No due date');
});
