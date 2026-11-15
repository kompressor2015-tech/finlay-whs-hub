import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daysLost, hoursIn, injuryCounts, isLostTime, missingHours, monthlySeries, monthsEnding, monthSummary, rate, type ReportData } from './reports.ts';

const now = new Date('2026-11-10T10:00:00+10:00');
const inc = (o: object) => ({ id: 'i1', type: 'injury', occurred_at: '2026-10-05T08:00:00+10:00', site_id: 's1', site_name: '', notifiable: false, status: 'new', closed_at: null, investigation_due: null, ...o }) as never;
const claim = (o: object) => ({ id: 'c1', incident_id: 'i1', person_id: 'p1', injury_date: '2026-10-05', off_work_from: '2026-10-06', returned_on: '2026-10-09', ...o }) as never;
const data = (o: Partial<ReportData> = {}): ReportData => ({ incidents: [], injured: [], claims: [], hazards: [], actions: [], checks: [], hours: [], ...o });

test('months ending runs oldest first across a year end', () => {
  assert.deepEqual(monthsEnding('2026-02', 4), ['2025-11', '2025-12', '2026-01', '2026-02']);
});
test('days lost and lost time', () => {
  assert.equal(daysLost({ off_work_from: '2026-10-06', returned_on: '2026-10-09' }, now), 3);
  assert.equal(daysLost({ off_work_from: '2026-10-06', returned_on: '2026-10-06' }, now), 0);
  assert.equal(isLostTime({ off_work_from: '2026-10-06', returned_on: '2026-10-06' }, now), false);
  assert.equal(daysLost({ off_work_from: '2026-11-08', returned_on: null }, now), 2);
  assert.equal(daysLost({ off_work_from: null, returned_on: null }, now), 0);
});
test('rate is per million hours and null with no hours', () => {
  assert.equal(rate(1, 250_000), 4);
  assert.equal(rate(2, 0), null);
});
test('lost time and recordable counts', () => {
  const d = data({
    incidents: [inc({}), inc({ id: 'i2', occurred_at: '2026-10-07T08:00:00+10:00' }), inc({ id: 'i3', type: 'near_miss' })],
    injured: [{ incident_id: 'i1', person_id: 'p1', treatment: 'first_aid' }, { incident_id: 'i2', person_id: 'p2', treatment: 'hospital' }],
    claims: [claim({})],
  });
  const c = injuryCounts(d, ['2026-10'], null, now);
  assert.equal(c.injuries, 2);
  assert.equal(c.lostTime, 1);
  assert.equal(c.lostDays, 3);
  assert.equal(c.medical, 1);
  assert.equal(c.recordable, 2); // the lost time worker plus the hospital one
});
test('without claims lost time is unknown, not zero', () => {
  const c = injuryCounts(data({ incidents: [inc({})], claims: null }), ['2026-10'], null, now);
  assert.equal(c.lostTimeKnown, false);
  const s = monthSummary(data({ incidents: [inc({})], claims: null, hours: [{ site_id: 's1', month: '2026-10-01', hours: 1000, source: 'typed' }] }), '2026-10', null, now);
  assert.equal(s.ltifr12, null);
});
test('rolling 12 month LTIFR uses the hours in the window', () => {
  const d = data({
    incidents: [inc({})], injured: [{ incident_id: 'i1', person_id: 'p1', treatment: 'doctor' }], claims: [claim({})],
    hours: [{ site_id: 's1', month: '2026-10-01', hours: 100_000, source: 'payroll' }, { site_id: 's1', month: '2026-09-01', hours: 150_000, source: 'payroll' }, { site_id: 's2', month: '2026-10-01', hours: 50_000, source: 'payroll' }],
  });
  assert.equal(monthSummary(d, '2026-10', null, now).ltifr12, 3.3);
  assert.equal(monthSummary(d, '2026-10', { id: 's1', name: 'x' }, now).ltifr12, 4);
});
test('series covers n months with a rate once hours exist', () => {
  const s = monthlySeries(data({ hours: [{ site_id: 's1', month: '2026-10-01', hours: 100_000, source: 'typed' }] }), '2026-10', 3, null, now);
  assert.equal(s.length, 3);
  assert.equal(s[2].hasHours, true);
  assert.equal(s[0].hasHours, false);
});
test('hours and missing sites', () => {
  const rows = [{ site_id: 's1', month: '2026-10-01', hours: 10, source: 'typed' }];
  assert.equal(hoursIn(rows, null, ['2026-10']), 10);
  assert.deepEqual(missingHours(rows, ['s1', 's2'], '2026-10'), ['s2']);
});
test('actions and hazards in a month', () => {
  const d = data({
    actions: [
      { id: 'a1', status: 'done', created_at: '2026-10-01T08:00:00+10:00', done_at: '2026-10-11T08:00:00+10:00', due: '2026-10-20', source_id: null },
      { id: 'a2', status: 'not_started', created_at: '2026-10-02T08:00:00+10:00', done_at: null, due: '2026-10-30', source_id: null },
    ] as never,
    hazards: [{ id: 'h1', created_at: '2026-10-03T08:00:00+10:00', status: 'closed', closed_at: '2026-10-05T08:00:00+10:00', site_id: null, site_name: '' }] as never,
  });
  const s = monthSummary(d, '2026-10', null, now);
  assert.equal(s.actionsOpened, 2);
  assert.equal(s.actionsClosed, 1);
  assert.equal(s.actionsOverdue, 1);
  assert.equal(s.avgDaysToClose, 10);
  assert.equal(s.hazardsReported, 1);
  assert.equal(s.hazardsClosed, 1);
});
