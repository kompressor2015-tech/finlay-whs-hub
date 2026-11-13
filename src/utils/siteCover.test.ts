import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coverFor, requiredFirstAiders, sitesShort } from './siteCover.ts';
import { withTickets } from './homeTickets.ts';
import { emptyHomeData } from './homeData.ts';
import type { Person } from './incidentFile.ts';
import type { Ticket } from './tickets.ts';

const now = new Date('2026-11-14T04:00:00Z');
const person = (id: string, o: Partial<Person> = {}): Person => ({ id, name: id, position: '', site_id: 's1', phone: '', emergency_contact: '', profile_id: null, start_date: null, notes: '', active: true, is_first_aider: false, is_fire_warden: false, warden_role: '', left_on: null, archived_at: null, archived_by_name: '', created_at: '', updated_at: '', ...o });
const ticket = (person_id: string, name: string, expires_on: string | null): Ticket => ({ id: person_id + name, person_id, name, number: '', issued_on: '2026-01-01', expires_on, provider: '', file_path: '', file_name: '', notes: '', created_by_name: '', created_at: '2026-01-01' });

test('one first aider for every 25 workers', () => {
  assert.equal(requiredFirstAiders(0), 0);
  assert.equal(requiredFirstAiders(1), 1);
  assert.equal(requiredFirstAiders(25), 1);
  assert.equal(requiredFirstAiders(26), 2);
});

test('cover counts only active people at the site with current tickets', () => {
  const people = [
    ...Array.from({ length: 30 }, (_, i) => person('w' + i)),
    person('fa1', { is_first_aider: true }), person('fa2', { is_first_aider: true }),
    person('fw', { is_fire_warden: true, warden_role: 'chief' }),
    person('gone', { is_first_aider: true, active: false }),
    person('other', { site_id: 's2', is_first_aider: true }),
  ];
  const tickets = [ticket('fa1', 'Provide First Aid', '2027-06-01'), ticket('fa2', 'Provide First Aid', '2026-10-01'), ticket('fw', 'Fire warden', '2027-03-01')];
  const c = coverFor('s1', people, tickets, now);
  assert.equal(c.headcount, 33);
  assert.equal(c.required, 2);
  assert.equal(c.validFirstAiders, 1);
  assert.equal(c.validWardens, 1);
  assert.equal(c.chiefWarden?.person.id, 'fw');
  assert.ok(c.gaps.some(g => g.startsWith('Needs 2')));
  assert.ok(c.gaps.some(g => g.includes('without a current first aid ticket')));
  assert.deepEqual(sitesShort(['s1', 's2'], people, tickets, now), ['s1', 's2']);
});

test('a site with no people has no gaps, and a warden with no chief is flagged', () => {
  assert.deepEqual(coverFor('s9', [], [], now).gaps, []);
  const c = coverFor('s1', [person('a', { is_first_aider: true }), person('b', { is_fire_warden: true })], [ticket('a', 'Provide First Aid', '2027-01-01'), ticket('b', 'Fire warden', '2027-01-01')], now);
  assert.deepEqual(c.gaps, ['No chief warden named']);
});

test('home shows expired, due soon and short sites', () => {
  const people = [person('a', { is_first_aider: true })];
  const tickets = [ticket('a', 'Provide First Aid', '2026-11-01'), ticket('a', 'CPR refresher', '2026-12-10')];
  const home = withTickets(emptyHomeData(), people, tickets, ['s1'], now);
  assert.deepEqual(home.attention.map(a => a.id).sort(), ['cover-short', 'tickets-expired', 'tickets-soon']);
  assert.equal(home.navCounts.training, 3);
});
