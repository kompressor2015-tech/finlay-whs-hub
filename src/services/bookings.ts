/** Bookings for recurring checks and people's tickets. */

import { supabase } from './supabase.ts';
import type { Booking, Subject } from '../utils/bookings.ts';

type Result<T> = { data?: T; error?: string };

function friendly(message: string | undefined): string {
  if (!message) return 'Something went wrong. Please try again.';
  if (/row-level security|permission denied/i.test(message)) return 'You do not have permission to do that.';
  if (/whs_bookings/i.test(message) && /does not exist|schema cache/i.test(message)) return 'Bookings are not set up yet. Run whs_024_bookings.sql in Supabase.';
  return message;
}

/** Bookings that are not cancelled. */
export async function listBookings(): Promise<Result<Booking[]>> {
  const { data, error } = await supabase.from('whs_bookings').select('*').eq('status', 'booked').order('booked_for').limit(5000);
  return error ? { error: friendly(error.message) } : { data: (data ?? []) as Booking[] };
}

export interface BookingInput { booked_for: string; provider: string; reference: string; notes: string }

export async function addBooking(s: Subject, input: BookingInput): Promise<Result<Booking>> {
  const row: Record<string, unknown> = s.type === 'check'
    ? { subject_type: 'check', check_id: s.checkId, ...input }
    : { subject_type: 'ticket', person_id: s.personId, ticket_name: s.ticketName, ...input };
  const { data, error } = await supabase.from('whs_bookings').insert(row).select('*').single();
  return error ? { error: friendly(error.message) } : { data: data as Booking };
}

export async function updateBooking(id: string, patch: Partial<BookingInput> & { status?: 'booked' | 'cancelled' }): Promise<Result<Booking>> {
  const { data, error } = await supabase.from('whs_bookings').update(patch).eq('id', id).select('*').single();
  return error ? { error: friendly(error.message) } : { data: data as Booking };
}
