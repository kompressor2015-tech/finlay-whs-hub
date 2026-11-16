/**
 * Bookings: a date booked for a recurring check or a person's ticket that is due or expired.
 * A booking stays open until the work is recorded (a check logged, or a ticket issued, on or after the
 * day the booking was made) or someone cancels it.
 */

import { brisbaneDay, daysUntil } from './dates.ts';

export interface Booking {
  id: string;
  subject_type: 'check' | 'ticket';
  check_id: string | null;
  person_id: string | null;
  ticket_name: string;
  booked_for: string;
  provider: string;
  reference: string;
  notes: string;
  status: 'booked' | 'cancelled';
  created_by_name: string;
  created_at: string;
}

export type Subject = { type: 'check'; checkId: string } | { type: 'ticket'; personId: string; ticketName: string };

export function forSubject(b: Booking, s: Subject): boolean {
  return s.type === 'check'
    ? b.subject_type === 'check' && b.check_id === s.checkId
    : b.subject_type === 'ticket' && b.person_id === s.personId && b.ticket_name.trim().toLowerCase() === s.ticketName.trim().toLowerCase();
}

/**
 * The booking that is still open for a subject: not cancelled and not yet followed by the work being
 * recorded. doneDates are the dates the check was done, or the ticket issued (YYYY-MM-DD).
 * If there are several, the one booked furthest ahead.
 */
export function openBooking(bookings: Booking[], s: Subject, doneDates: (string | null | undefined)[]): Booking | null {
  const done = doneDates.filter((d): d is string => !!d);
  const open = bookings.filter(b => b.status === 'booked' && forSubject(b, s) && !done.some(d => d >= brisbaneDay(b.created_at)));
  return open.sort((a, b) => b.booked_for.localeCompare(a.booked_for))[0] ?? null;
}

export type BookingTone = 'blue' | 'amber';

/** "Booked 12 Dec" or "Booked for 12 Dec, passed" when the day has gone and nothing has been recorded. */
export function bookingLabel(b: Pick<Booking, 'booked_for' | 'provider'>, now: Date = new Date()): { text: string; tone: BookingTone; passed: boolean } {
  const left = daysUntil(b.booked_for, now);
  const day = new Date(`${b.booked_for}T00:00:00Z`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const who = b.provider ? ` (${b.provider})` : '';
  if (left < 0) return { text: `Booking for ${day} has passed, not recorded${who}`, tone: 'amber', passed: true };
  return { text: left === 0 ? `Booked today${who}` : `Booked ${day}${who}`, tone: 'blue', passed: false };
}
