/** Reads and writes tickets and training (first aid, CPR, fire warden, licences) for each person. */

import { supabase } from './supabase.ts';
import { removeFiles, uploadFile } from './files.ts';
import type { Ticket } from '../utils/tickets.ts';

type Result<T> = { data?: T; error?: string };

const BUCKET = 'whs-training-files' as const;

function friendly(message: string | undefined): string {
  if (!message) return 'Something went wrong. Please try again.';
  if (/^Only/.test(message)) return message;
  if (/row-level security|permission denied/i.test(message)) return 'You do not have permission to do that.';
  if (/does not exist/i.test(message)) return 'Tickets are not set up yet. Run the whs_015 SQL in Supabase.';
  return message;
}

export async function listTickets(personId?: string): Promise<Result<Ticket[]>> {
  let q = supabase.from('whs_person_tickets').select('*').order('expires_on', { ascending: true, nullsFirst: false });
  if (personId) q = q.eq('person_id', personId);
  const { data, error } = await q;
  return error ? { error: friendly(error.message) } : { data: (data ?? []) as Ticket[] };
}

export interface TicketInput {
  name: string;
  number: string;
  issued_on: string | null;
  expires_on: string | null;
  provider: string;
  notes: string;
}

export async function addTicket(personId: string, input: TicketInput, file: File | null): Promise<Result<Ticket>> {
  let file_path = '';
  let file_name = '';
  if (file) {
    const up = await uploadFile(BUCKET, personId, file);
    if (up.error || !up.path) return { error: up.error ?? 'Upload failed.' };
    file_path = up.path;
    file_name = file.name;
  }
  const { data, error } = await supabase.from('whs_person_tickets').insert({ person_id: personId, ...input, file_path, file_name }).select('*').single();
  if (error) {
    await removeFiles(BUCKET, [file_path]);
    return { error: friendly(error.message) };
  }
  return { data: data as Ticket };
}

/** Attach (or replace) the certificate on a ticket. */
export async function attachCertificate(t: Ticket, file: File): Promise<Result<Ticket>> {
  const up = await uploadFile(BUCKET, t.person_id, file);
  if (up.error || !up.path) return { error: up.error ?? 'Upload failed.' };
  const { data, error } = await supabase.from('whs_person_tickets').update({ file_path: up.path, file_name: file.name }).eq('id', t.id).select('*').single();
  if (error) {
    await removeFiles(BUCKET, [up.path]);
    return { error: friendly(error.message) };
  }
  await removeFiles(BUCKET, [t.file_path]);
  return { data: data as Ticket };
}

export async function updateTicket(id: string, patch: Partial<TicketInput>): Promise<Result<Ticket>> {
  const { data, error } = await supabase.from('whs_person_tickets').update(patch).eq('id', id).select('*').single();
  return error ? { error: friendly(error.message) } : { data: data as Ticket };
}

export async function removeTicket(t: Ticket): Promise<Result<true>> {
  const { error } = await supabase.from('whs_person_tickets').delete().eq('id', t.id);
  if (error) return { error: friendly(error.message) };
  await removeFiles(BUCKET, [t.file_path]);
  return { data: true };
}
