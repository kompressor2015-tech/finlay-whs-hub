import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  STATES, STATE_LIST, certificateStatus, claimAttention, daysOffWork, isOffWork, isOpen, notifyDeadline, stepsDone, type Claim,
} from './claims.ts';

const NOW = new Date('2026-11-12T08:00:00+10:00');
const base: Pick<Claim, 'state' | 'status' | 'steps' | 'off_work_from' | 'returned_on' | 'rtw_next_review' | 'rtw_status' | 'insurer_notified_at'> = {
  state: 'QLD', status: 'accepted', steps: {}, off_work_from: '2026-11-10', returned_on: null, rtw_next_review: null, rtw_status: 'none', insurer_notified_at: null,
};

test('each state has its own steps, certificate name and a source', () => {
  assert.deepEqual(STATE_LIST, ['QLD', 'VIC', 'NSW']);
  assert.equal(STATES.QLD.certificate, 'Medical certificate');
  assert.equal(STATES.VIC.certificate, 'Certificate of Capacity');
  assert.equal(STATES.NSW.certificate, 'Certificate of capacity');
  for (const s of STATE_LIST) {
    assert.ok(STATES[s].steps.length >= 7);
    assert.ok(STATES[s].source.url.startsWith('https://'));
    assert.equal(new Set(STATES[s].steps.map(x => x.id)).size, STATES[s].steps.length);
  }
});

test('steps done counts ticked steps for the claim\'s state only', () => {
  assert.deepEqual(stepsDone({ state: 'QLD', steps: { notified: { at: 'x', by: 'y' }, lodged: { at: 'x', by: 'y' }, bogus: { at: 'x', by: 'y' } } }), { done: 2, total: 8 });
  assert.deepEqual(stepsDone({ state: 'NSW', steps: {} }), { done: 0, total: 7 });
});

test('only NSW has a notification deadline: 48 hours', () => {
  assert.equal(notifyDeadline('QLD', '2026-11-10T07:40:00+10:00'), null);
  assert.equal(notifyDeadline('VIC', '2026-11-10T07:40:00+10:00'), null);
  assert.equal(notifyDeadline('NSW', '2026-11-10T07:40:00+10:00'), new Date('2026-11-12T07:40:00+10:00').toISOString());
});

test('certificate status: current, ends in, gaps and lapsed', () => {
  const certs = [
    { from_date: '2026-11-10', to_date: '2026-11-14', capacity: 'unfit' as const },
    { from_date: '2026-11-18', to_date: '2026-11-24', capacity: 'partial' as const },
  ];
  const s = certificateStatus(certs, NOW);
  assert.equal(s.current?.to_date, '2026-11-14');
  assert.equal(s.endsInDays, 2);
  assert.deepEqual(s.gaps, [{ from: '2026-11-15', to: '2026-11-17' }]);
  assert.equal(s.lapsedSince, null);
  const later = certificateStatus(certs, new Date('2026-11-30T08:00:00+10:00'));
  assert.equal(later.current, null);
  assert.equal(later.lapsedSince, '2026-11-24');
  const none = certificateStatus([], NOW);
  assert.equal(none.current, null);
  assert.equal(none.lapsedSince, null);
  // back to back certificates have no gap
  assert.deepEqual(certificateStatus([{ from_date: '2026-11-01', to_date: '2026-11-05', capacity: 'unfit' }, { from_date: '2026-11-06', to_date: '2026-11-10', capacity: 'unfit' }], NOW).gaps, []);
});

test('days off work run to the return date, or today', () => {
  assert.equal(daysOffWork({ off_work_from: '2026-11-10', returned_on: null }, NOW), 2);
  assert.equal(daysOffWork({ off_work_from: '2026-11-10', returned_on: '2026-11-11' }, NOW), 1);
  assert.equal(daysOffWork({ off_work_from: null, returned_on: null }, NOW), null);
  assert.equal(isOffWork({ off_work_from: '2026-11-10', returned_on: null, status: 'accepted' }), true);
  assert.equal(isOffWork({ off_work_from: '2026-11-10', returned_on: '2026-11-12', status: 'accepted' }), false);
  assert.equal(isOpen({ status: 'rejected' }), false);
  assert.equal(isOpen({ status: 'lodged' }), true);
});

test('claim attention: certificate ending, none on file, return to work review, NSW 48 hours', () => {
  const ends = claimAttention(base, [{ from_date: '2026-11-10', to_date: '2026-11-14', capacity: 'unfit' }], '2026-11-10T07:40:00+10:00', NOW);
  assert.deepEqual(ends.map(a => [a.id, a.tone, a.when]), [['cert-ends', 'red', 'In 2 days']]);
  const week = claimAttention(base, [{ from_date: '2026-11-10', to_date: '2026-11-17', capacity: 'unfit' }], '2026-11-10T07:40:00+10:00', NOW);
  assert.deepEqual(week.map(a => [a.tone, a.when]), [['amber', 'In 5 days']]);
  assert.equal(claimAttention(base, [{ from_date: '2026-11-10', to_date: '2026-11-30', capacity: 'unfit' }], '2026-11-10T07:40:00+10:00', NOW).length, 0);
  const none = claimAttention(base, [], '2026-11-10T07:40:00+10:00', NOW);
  assert.equal(none[0].id, 'cert-none');
  assert.match(none[0].what, /No medical certificate on file yet/);
  const lapsed = claimAttention(base, [{ from_date: '2026-11-01', to_date: '2026-11-05', capacity: 'unfit' }], '2026-11-01T07:40:00+10:00', NOW);
  assert.match(lapsed[0].what, /since 05\/11\/2026/);
  const review = claimAttention({ ...base, off_work_from: null, rtw_next_review: '2026-11-16' }, [], '2026-11-10T07:40:00+10:00', NOW);
  assert.deepEqual(review.map(a => [a.id, a.tone]), [['rtw-due', 'amber']]);
  assert.equal(claimAttention({ ...base, off_work_from: null, rtw_next_review: '2026-11-10' }, [], '2026-11-10T07:40:00+10:00', NOW)[0].tone, 'red');
  // NSW: not told the insurer yet
  const nsw = claimAttention({ ...base, state: 'NSW', off_work_from: null }, [], '2026-11-10T07:40:00+10:00', NOW);
  assert.deepEqual(nsw.map(a => [a.id, a.tone]), [['notify', 'red']]);
  assert.equal(claimAttention({ ...base, state: 'NSW', off_work_from: null }, [], '2026-11-12T07:40:00+10:00', NOW)[0].tone, 'amber');
  assert.equal(claimAttention({ ...base, state: 'NSW', off_work_from: null, steps: { notified: { at: 'x', by: 'y' } } }, [], '2026-11-10T07:40:00+10:00', NOW).length, 0);
  // closed claims need nothing
  assert.equal(claimAttention({ ...base, status: 'closed' }, [], '2026-11-10T07:40:00+10:00', NOW).length, 0);
});

test('appointments: doctor booked before the certificate ends, upcoming, overdue and follow-ups', () => {
  const cert = [{ from_date: '2026-11-10', to_date: '2026-11-14', capacity: 'unfit' as const, next_appointment_on: null }];
  const inc = '2026-11-10T07:40:00+10:00';
  const noAppt = claimAttention(base, cert, inc, NOW, []);
  assert.match(noAppt[0].what, /No doctor appointment is recorded/);
  const withNext = claimAttention(base, [{ ...cert[0], next_appointment_on: '2026-11-13' }], inc, NOW, []);
  assert.match(withNext[0].what, /Back to the doctor on 13\/11\/2026/);
  const appt = (o: object) => ({ id: 'a1', kind: 'physio' as const, with_whom: 'Sam', on_date: '2026-11-13', status: 'booked' as const, follow_up_on: null, followed_up_at: null, ...o });
  const booked = claimAttention(base, cert, inc, NOW, [appt({ kind: 'doctor' })]);
  assert.match(booked[0].what, /Doctor appointment booked for 13\/11\/2026/);
  assert.deepEqual(claimAttention(base, [{ ...cert[0], to_date: '2026-11-30' }], inc, NOW, [appt({ on_date: '2026-11-13' })]).map(a => [a.id, a.tone, a.when]), [['appt-a1', 'amber', 'Tomorrow']]);
  assert.deepEqual(claimAttention(base, [{ ...cert[0], to_date: '2026-11-30' }], inc, NOW, [appt({ on_date: '2026-11-16' })]).map(a => [a.tone, a.when]), [['grey', 'In 4 days']]);
  const overdue = claimAttention(base, [{ ...cert[0], to_date: '2026-11-30' }], inc, NOW, [appt({ on_date: '2026-11-10' })]);
  assert.deepEqual(overdue.map(a => [a.tone, a.when]), [['amber', 'Overdue']]);
  const fu = claimAttention(base, [{ ...cert[0], to_date: '2026-11-30' }], inc, NOW, [appt({ on_date: '2026-11-10', status: 'attended', follow_up_on: '2026-11-11' })]);
  assert.deepEqual(fu.map(a => [a.id, a.tone]), [['fu-a1', 'red']]);
  assert.equal(claimAttention(base, [{ ...cert[0], to_date: '2026-11-30' }], inc, NOW, [appt({ status: 'cancelled' })]).length, 0);
});
