import { test } from 'node:test';
import assert from 'node:assert/strict';
import { outstandingItems, bookingsComing, type Outstanding } from './homeOutstanding.ts';
import type { CheckJob } from './checkJobs.ts';
import type { Booking } from './bookings.ts';

const now = new Date('2026-11-16T03:00:00Z');
const job = (o: Partial<CheckJob> = {}): CheckJob => ({ id: 'j1', check_id: 'c1', title: 'Rack repairs', supplier: 'Bowen Storage', quote_ref: 'PRM56999', quote_amount: 6098.64, po_number: '', status: 'po_raised', booked_for: null, approved_by_name: '', approved_on: null, notes: '', file_path: null, file_name: null, created_by_name: '', created_at: '2026-11-10T00:00:00Z', ...o });
const base = (o: Partial<Outstanding> = {}): Outstanding => ({
  jobs: [], bookings: [], sites: [{ id: 's1', name: 'Somerton' }], log: [], people: [],
  checks: [{ id: 'c1', site_id: 's1', name: 'Racking inspection', category: '', interval_months: 12, basis: '', rule_confirmed: true, first_due: null, notes: '', active: true, created_at: '2026-01-01T00:00:00Z' }],
  ...o,
});
const booking = (o: Partial<Booking> = {}): Booking => ({ id: 'b1', subject_type: 'check', check_id: 'c1', person_id: null, ticket_name: '', booked_for: '2026-11-01', provider: 'Bowen', reference: '', notes: '', status: 'booked', created_by_name: '', created_at: '2026-10-20T00:00:00Z', ...o });

test('an open job shows with what is missing; done and cancelled do not', () => {
  const items = outstandingItems(base({ jobs: [job(), job({ id: 'j2', status: 'done' }), job({ id: 'j3', status: 'cancelled' })] }), now);
  assert.equal(items.length, 1);
  assert.match(items[0].title, /Somerton: Rack repairs, po raised/);
  assert.match(items[0].detail, /PO number not entered/);
  assert.match(items[0].detail, /no booked date/);
  assert.equal(items[0].urgency, 'review');
});

test('a job whose booked date has passed is overdue', () => {
  const [i] = outstandingItems(base({ jobs: [job({ booked_for: '2026-11-01', po_number: 'PO1' })] }), now);
  assert.equal(i.urgency, 'overdue');
});

test('a passed booking not yet recorded is overdue, and clears once the check is logged', () => {
  assert.equal(outstandingItems(base({ bookings: [booking()] }), now).length, 1);
  const log = [{ check_id: 'c1', done_on: '2026-11-02' }] as never;
  assert.equal(outstandingItems(base({ bookings: [booking()], log }), now).length, 0);
});

test('upcoming bookings and job dates go to coming up', () => {
  const items = bookingsComing(base({ bookings: [booking({ booked_for: '2026-11-20' })], jobs: [job({ booked_for: '2026-11-25' })] }), now);
  assert.equal(items.length, 2);
});
