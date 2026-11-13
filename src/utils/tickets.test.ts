import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentTickets, expiryFromIssue, ticketPill, ticketState, ticketsNeedingAction, type Ticket } from './tickets.ts';

const now = new Date('2026-11-14T08:00:00+10:00');
const t = (over: Partial<Ticket>): Ticket => ({ id: 'x', person_id: 'p', name: 'Provide First Aid', number: '', issued_on: '2024-01-01', expires_on: '2027-01-01', provider: '', file_path: '', file_name: '', notes: '', created_by_name: '', created_at: '2026-01-01T00:00:00Z', ...over });

test('expiry is worked out from the issue date by ticket type', () => {
  assert.equal(expiryFromIssue('Provide First Aid', '2024-03-15'), '2027-03-15');
  assert.equal(expiryFromIssue('cpr refresher', '2026-02-28'), '2027-02-28');
  assert.equal(expiryFromIssue('White card', '2020-01-01'), null);
  assert.equal(expiryFromIssue('Something else', '2024-01-01'), null);
});

test('state and wording', () => {
  assert.equal(ticketState(t({ expires_on: null }), now), 'no_expiry');
  assert.equal(ticketState(t({ expires_on: '2026-11-13' }), now), 'expired');
  assert.equal(ticketState(t({ expires_on: '2026-12-20' }), now), 'due_soon');
  assert.equal(ticketState(t({ expires_on: '2027-03-01' }), now), 'ok');
  assert.equal(ticketPill(t({ expires_on: '2026-11-13' }), now).label, 'Expired yesterday');
  assert.equal(ticketPill(t({ expires_on: '2026-11-04' }), now).label, 'Expired 10 days ago');
  assert.equal(ticketPill(t({ expires_on: '2026-11-26' }), now).label, '12 days');
  assert.equal(ticketPill(t({ expires_on: '2026-11-14' }), now).label, 'Expires today');
});

test('a renewal replaces the older ticket of the same name', () => {
  const old = t({ id: 'old', issued_on: '2021-01-01', expires_on: '2024-01-01' });
  const renewed = t({ id: 'new', issued_on: '2024-06-05', expires_on: '2027-06-05' });
  const cpr = t({ id: 'cpr', name: 'CPR refresher', issued_on: '2025-01-01', expires_on: '2026-01-01' });
  const cur = currentTickets([old, renewed, cpr]);
  assert.deepEqual(cur.map(x => x.id).sort(), ['cpr', 'new']);
  assert.deepEqual(ticketsNeedingAction([old, renewed, cpr], now).map(x => x.id), ['cpr']);
});
