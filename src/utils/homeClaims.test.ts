import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withClaims } from './homeClaims.ts';
import { emptyHomeData } from './homeData.ts';
import type { Appointment, Certificate, Claim } from './claims.ts';

const now = new Date('2026-11-14T04:00:00Z');
const claim = (id: string, o: Partial<Claim> = {}) => ({ id, incident_id: 'i' + id, person_id: 'p' + id, state: 'QLD', status: 'accepted', steps: { notified: true }, injury_date: '2026-10-01', off_work_from: '2026-10-02', returned_on: null, rtw_next_review: null, rtw_status: 'none', insurer_notified_at: '2026-10-02T00:00:00Z', created_at: '2026-10-01T00:00:00Z', ...o }) as unknown as Claim;
const cert = (claim_id: string, to_date: string) => ({ id: claim_id + to_date, claim_id, from_date: '2026-10-02', to_date, capacity: 'unfit', next_appointment_on: null, no_further_visits: false }) as unknown as Certificate;
const names = new Map([['p1', 'Sam Jones'], ['p2', 'Alex Lee'], ['p3', 'Pat Kim']]);

test('open claims with something to do show on the home screen, worst first per claim', () => {
  const claims = [
    claim('1'),                                   // certificate ends in 2 days -> red
    claim('2'),                                   // certificate ends in 6 days -> amber
    claim('3'),                                   // certificate good for weeks -> nothing
    claim('4', { status: 'closed' }),             // closed -> nothing
  ];
  const certs = [cert('1', '2026-11-16'), cert('2', '2026-11-20'), cert('3', '2026-12-30'), cert('4', '2026-11-15')];
  const home = withClaims(emptyHomeData(), claims, certs, [] as Appointment[], names, now);
  assert.equal(home.attention.length, 2);
  const a = home.attention.find(x => x.id === 'claim-1');
  assert.equal(a?.urgency, 'overdue');
  assert.ok(a?.title.startsWith('Sam Jones:'));
  assert.equal(a?.href, '#/people/p1');
  assert.equal(home.attention.find(x => x.id === 'claim-2')?.urgency, 'due_soon');
  assert.equal(home.navCounts.people, 2);
});

test('no claims, no alerts', () => {
  const home = withClaims(emptyHomeData(), [], [], [], names, now);
  assert.equal(home.attention.length, 0);
  assert.equal(home.navCounts.people, undefined);
});
