import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bookingLabel, openBooking, type Booking } from './bookings.ts';

const now = new Date('2026-11-16T10:00:00+10:00');
const b = (o: Partial<Booking> = {}): Booking => ({ id: 'b1', subject_type: 'check', check_id: 'c1', person_id: null, ticket_name: '', booked_for: '2026-12-10', provider: 'Bowen', reference: '', notes: '', status: 'booked', created_by_name: '', created_at: '2026-11-16T09:00:00+10:00', ...o });

test('a booking is open until the work is recorded on or after the day it was made', () => {
  const s = { type: 'check', checkId: 'c1' } as const;
  assert.equal(openBooking([b()], s, ['2026-10-06'])?.id, 'b1');
  assert.equal(openBooking([b()], s, ['2026-12-10']), null);
  assert.equal(openBooking([b()], s, ['2026-11-16']), null);
});
test('cancelled and other subjects are ignored; ticket names match ignoring case', () => {
  const s = { type: 'check', checkId: 'c1' } as const;
  assert.equal(openBooking([b({ status: 'cancelled' })], s, []), null);
  assert.equal(openBooking([b({ check_id: 'c2' })], s, []), null);
  const t = b({ subject_type: 'ticket', check_id: null, person_id: 'p1', ticket_name: 'Provide First Aid' });
  assert.ok(openBooking([t], { type: 'ticket', personId: 'p1', ticketName: 'provide first aid' }, []));
  assert.equal(openBooking([t], { type: 'ticket', personId: 'p2', ticketName: 'Provide First Aid' }, []), null);
});
test('the booking furthest ahead wins', () => {
  assert.equal(openBooking([b({ id: 'x', booked_for: '2026-12-01' }), b({ id: 'y', booked_for: '2026-12-20' })], { type: 'check', checkId: 'c1' }, [])?.id, 'y');
});
test('labels', () => {
  assert.equal(bookingLabel({ booked_for: '2026-12-10', provider: 'Bowen' }, now).text, 'Booked 10 Dec (Bowen)');
  assert.equal(bookingLabel({ booked_for: '2026-11-16', provider: '' }, now).text, 'Booked today');
  const p = bookingLabel({ booked_for: '2026-11-10', provider: '' }, now);
  assert.equal(p.passed, true);
  assert.equal(p.tone, 'amber');
});
