import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchEmails, validEmail } from './emailMatch.ts';
import type { Person } from './incidentFile.ts';

const person = (id: string, name: string, o: Partial<Person> = {}): Person => ({ id, name, position: '', site_id: null, phone: '', email: '', emergency_contact: '', profile_id: null, start_date: null, notes: '', active: true, is_first_aider: false, is_fire_warden: false, warden_role: '', not_required: [], left_on: null, archived_at: null, archived_by_name: '', created_at: '', updated_at: '', ...o });
const people = [person('1', 'John SMITH'), person('2', 'Mary JONES'), person('3', 'Sam LEE'), person('4', 'Sam LEE'), person('5', 'Old PERSON', { active: false })];

test('matches name then email, email then name, and Surname, First', () => {
  const r = matchEmails('John Smith, john.s@finlay.com.au\nmary@finlay.com.au\tJones, Mary\n', people);
  assert.deepEqual(r.map(x => [x.person?.id, x.email]), [['1', 'john.s@finlay.com.au'], ['2', 'mary@finlay.com.au']]);
});
test('falls back to the name in the email address', () => {
  assert.equal(matchEmails('john.smith@finlay.com.au', people)[0].person?.id, '1');
});
test('flags duplicates, unknown names, archived people and lines without an email', () => {
  const r = matchEmails('Sam Lee sam@x.com\nNobody Here n@x.com\nOld Person o@x.com\nJohn Smith', people);
  assert.deepEqual(r.map(x => x.person), [null, null, null, null]);
  assert.match(r[0].note, /More than one/);
  assert.match(r[3].note, /No email/);
});
test('says when it replaces an email already on file', () => {
  const r = matchEmails('Mary Jones new@x.com', [person('2', 'Mary JONES', { email: 'old@x.com' })]);
  assert.equal(r[0].note, 'Replaces old@x.com');
});
test('validEmail', () => { assert.ok(validEmail('a@b.co')); assert.ok(!validEmail('a@b')); assert.ok(!validEmail('')); });
