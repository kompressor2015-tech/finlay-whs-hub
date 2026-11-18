import { test } from 'node:test';
import assert from 'node:assert/strict';
import { courseStatus, outstanding, reminderCounts, reminderFor, type CourseReminder } from './companyCourses.ts';
import type { Person } from './incidentFile.ts';
import type { Ticket } from './tickets.ts';

const now = new Date('2026-11-16T00:00:00+10:00');
const person = (id: string, o: Partial<Person> = {}): Person => ({ id, name: id, position: '', site_id: 's1', phone: '', email: '', emergency_contact: '', profile_id: null, start_date: null, notes: '', active: true, is_first_aider: false, is_fire_warden: false, warden_role: '', not_required: [], left_on: null, archived_at: null, archived_by_name: '', created_at: '', updated_at: '', ...o });
const ticket = (person_id: string, expires_on: string, name = 'Fire extinguisher training'): Ticket => ({ id: person_id + expires_on, person_id, name, number: '', issued_on: '2026-01-01', expires_on, provider: '', file_path: '', file_name: '', notes: '', created_by_name: '', created_at: '2026-01-01' });

test('counts current, due soon, expired and none, leaving out archived and not-required people', () => {
  const people = [person('a'), person('b'), person('c'), person('d'), person('gone', { active: false }), person('sales', { not_required: ['Fire extinguisher training'] })];
  const tickets = [ticket('a', '2027-06-01'), ticket('b', '2026-12-01'), ticket('c', '2026-10-01'), ticket('sales', '2027-06-01'), ticket('gone', '2027-06-01')];
  const s = courseStatus('Fire extinguisher training', people, tickets, now);
  assert.deepEqual([s.current, s.dueSoon, s.expired, s.none, s.excused], [1, 1, 1, 1, 1]);
  assert.deepEqual(outstanding(s).map(r => r.person.id), ['d', 'c', 'b']);
});
test('only the newest ticket counts and other courses are ignored', () => {
  const s = courseStatus('Fire extinguisher training', [person('a')], [ticket('a', '2026-01-01'), { ...ticket('a', '2027-06-01'), issued_on: '2026-06-01', created_at: '2026-06-01' }, ticket('a', '2020-01-01', 'White card')], now);
  assert.equal(s.current, 1);
});

const rem = (person_id: string, sent_at: string, course = 'Fire extinguisher training'): CourseReminder => ({ id: person_id + sent_at, person_id, course, sent_at, sent_by_name: 'Gary' });
test('a reminder counts for someone who never did it, and is matched by course', () => {
  const s = courseStatus('Fire extinguisher training', [person('a'), person('b')], [], now);
  const rs = [rem('a', '2026-11-18T01:00:00Z'), rem('b', '2026-11-18T01:00:00Z', 'White card')];
  assert.equal(reminderFor(s.rows[0], s.course, rs)?.person_id, 'a');
  assert.equal(reminderFor(s.rows[1], s.course, rs), null);
  assert.deepEqual(reminderCounts(s.rows, s.course, rs), { sent: 1, notSent: 1 });
});
test('a reminder from an earlier round is ignored once the new ticket is nearly due again', () => {
  const s = courseStatus('Fire extinguisher training', [person('a')], [ticket('a', '2027-10-01')], now);
  assert.equal(reminderFor(s.rows[0], s.course, [rem('a', '2026-11-18T01:00:00Z')]), null);
  assert.ok(reminderFor(s.rows[0], s.course, [rem('a', '2027-09-20T01:00:00Z')]));
});
