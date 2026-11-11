/**
 * Reads and writes injury management claims. Only the WHS officer and admins can reach these
 * tables; the database refuses everyone else, so an empty result for a supervisor is expected.
 */

import { supabase } from './supabase.ts';
import { removeFiles, uploadFile } from './files.ts';
import type { Appointment, Certificate, Claim, ClaimContact, ClaimDoc, DocCategory, LogEntry, LogKind, RtwStage, State } from '../utils/claims.ts';
import { STATES } from '../utils/claims.ts';

type Result<T> = { data?: T; error?: string };

function friendly(message: string | undefined): string {
  if (!message) return 'Something went wrong. Please try again.';
  if (/^(Only|Finish|Close)/.test(message)) return message;
  if (/duplicate key.*whs_claims/i.test(message)) return 'This person already has a claim on this incident.';
  if (/violates check constraint.*certificates/i.test(message)) return 'The end date can\'t be before the start date.';
  if (/row-level security|permission denied/i.test(message)) return 'Only the WHS officer and admins can use claim files.';
  if (/does not exist/i.test(message)) return 'The claim tables are not set up yet. Run the step 6 SQL in Supabase.';
  return message;
}

const BUCKET = 'whs-claim-files' as const;

export async function listClaims(filter?: { incidentId?: string; personId?: string }): Promise<Result<Claim[]>> {
  let q = supabase.from('whs_claims').select('*');
  if (filter?.incidentId) q = q.eq('incident_id', filter.incidentId);
  if (filter?.personId) q = q.eq('person_id', filter.personId);
  const { data, error } = await q.order('created_at', { ascending: false });
  return error ? { error: friendly(error.message) } : { data: (data ?? []) as Claim[] };
}

export interface ClaimInput {
  incident_id: string;
  person_id: string;
  state: State;
  injury_date: string | null;
  off_work_from?: string | null;
}

export async function createClaim(input: ClaimInput): Promise<Result<Claim>> {
  const { data, error } = await supabase.from('whs_claims').insert({ ...input, insurer: STATES[input.state].insurer }).select('*').single();
  return error ? { error: friendly(error.message) } : { data: data as Claim };
}

export async function updateClaim(id: string, patch: Partial<Omit<Claim, 'id' | 'created_at' | 'updated_at' | 'created_by_name'>>): Promise<Result<Claim>> {
  const { data, error } = await supabase.from('whs_claims').update(patch).eq('id', id).select('*').single();
  return error ? { error: friendly(error.message) } : { data: data as Claim };
}

/** Tick or untick one of the state's steps. The database does not stamp this, so the name comes from the caller. */
export function toggleStep(claim: Claim, stepId: string, by: string): Promise<Result<Claim>> {
  const steps = { ...(claim.steps ?? {}) };
  if (steps[stepId]) delete steps[stepId];
  else steps[stepId] = { at: new Date().toISOString(), by };
  return updateClaim(claim.id, { steps });
}

async function many<T>(table: string, claimId: string, order: string, ascending = true): Promise<Result<T[]>> {
  const { data, error } = await supabase.from(table).select('*').eq('claim_id', claimId).order(order, { ascending });
  return error ? { error: friendly(error.message) } : { data: (data ?? []) as T[] };
}

// Certificates -------------------------------------------------------------------------------

export const listCertificates = (claimId: string) => many<Certificate>('whs_claim_certificates', claimId, 'from_date', false);

export async function addCertificate(
  claimId: string,
  input: { from_date: string; to_date: string; doctor_name: string; capacity: Certificate['capacity']; restrictions: string; next_appointment_on?: string | null },
  file: File | null
): Promise<Result<Certificate>> {
  let file_path = '';
  let file_name = '';
  if (file) {
    const up = await uploadFile(BUCKET, claimId, file);
    if (up.error || !up.path) return { error: up.error ?? 'Upload failed.' };
    file_path = up.path;
    file_name = file.name;
  }
  const { data, error } = await supabase.from('whs_claim_certificates').insert({ claim_id: claimId, ...input, file_path, file_name }).select('*').single();
  if (error) {
    await removeFiles(BUCKET, [file_path]);
    return { error: friendly(error.message) };
  }
  return { data: data as Certificate };
}

export async function removeCertificate(c: Certificate): Promise<Result<true>> {
  const { error } = await supabase.from('whs_claim_certificates').delete().eq('id', c.id);
  if (error) return { error: friendly(error.message) };
  await removeFiles(BUCKET, [c.file_path]);
  return { data: true };
}

// Return to work stages ---------------------------------------------------------------------------

export const listStages = (claimId: string) => many<RtwStage>('whs_claim_rtw_stages', claimId, 'stage_no');

export async function saveStage(claimId: string, stage: { stage_no: number; duties: string; hours: string; starts_on: string | null; status: RtwStage['status'] }): Promise<Result<RtwStage>> {
  const { data, error } = await supabase.from('whs_claim_rtw_stages').upsert({ claim_id: claimId, ...stage }, { onConflict: 'claim_id,stage_no' }).select('*').single();
  return error ? { error: friendly(error.message) } : { data: data as RtwStage };
}

export async function removeStage(id: string): Promise<Result<true>> {
  const { error } = await supabase.from('whs_claim_rtw_stages').delete().eq('id', id);
  return error ? { error: friendly(error.message) } : { data: true };
}

// Appointments ------------------------------------------------------------------------------------

export const listAppointments = (claimId: string) => many<Appointment>('whs_claim_appointments', claimId, 'on_date');

export async function listAppointmentsFor(claimIds: string[]): Promise<Result<Appointment[]>> {
  if (!claimIds.length) return { data: [] };
  const { data, error } = await supabase.from('whs_claim_appointments').select('*').in('claim_id', claimIds).order('on_date');
  return error ? { error: friendly(error.message) } : { data: (data ?? []) as Appointment[] };
}

export type AppointmentInput = Pick<Appointment, 'kind' | 'with_whom' | 'on_date' | 'at_time' | 'place'> & { follow_up_on?: string | null };

export async function addAppointment(claimId: string, input: AppointmentInput): Promise<Result<Appointment>> {
  const { data, error } = await supabase.from('whs_claim_appointments').insert({ claim_id: claimId, ...input }).select('*').single();
  return error ? { error: friendly(error.message) } : { data: data as Appointment };
}

export async function updateAppointment(id: string, patch: Partial<Pick<Appointment, 'status' | 'outcome' | 'on_date' | 'at_time' | 'place' | 'follow_up_on' | 'follow_up_note' | 'followed_up_at' | 'followed_up_by_name'>>): Promise<Result<Appointment>> {
  const { data, error } = await supabase.from('whs_claim_appointments').update(patch).eq('id', id).select('*').single();
  return error ? { error: friendly(error.message) } : { data: data as Appointment };
}

export async function removeAppointment(id: string): Promise<Result<true>> {
  const { error } = await supabase.from('whs_claim_appointments').delete().eq('id', id);
  return error ? { error: friendly(error.message) } : { data: true };
}

// Contacts ---------------------------------------------------------------------------------------

export const listContacts = (claimId: string) => many<ClaimContact>('whs_claim_contacts', claimId, 'created_at');

export async function addContact(claimId: string, input: Pick<ClaimContact, 'name' | 'role' | 'org' | 'phone' | 'email'>): Promise<Result<ClaimContact>> {
  const { data, error } = await supabase.from('whs_claim_contacts').insert({ claim_id: claimId, ...input }).select('*').single();
  return error ? { error: friendly(error.message) } : { data: data as ClaimContact };
}

export async function removeContact(id: string): Promise<Result<true>> {
  const { error } = await supabase.from('whs_claim_contacts').delete().eq('id', id);
  return error ? { error: friendly(error.message) } : { data: true };
}

// Correspondence log -------------------------------------------------------------------------------

export const listLog = (claimId: string) => many<LogEntry>('whs_claim_log', claimId, 'happened_at', false);

export async function addLog(claimId: string, input: { kind: LogKind; with_whom: string; what: string; happened_at: string }, file: File | null): Promise<Result<LogEntry>> {
  let file_path = '';
  let file_name = '';
  if (file) {
    const up = await uploadFile(BUCKET, claimId, file);
    if (up.error || !up.path) return { error: up.error ?? 'Upload failed.' };
    file_path = up.path;
    file_name = file.name;
  }
  const { data, error } = await supabase.from('whs_claim_log').insert({ claim_id: claimId, ...input, file_path, file_name }).select('*').single();
  if (error) {
    await removeFiles(BUCKET, [file_path]);
    return { error: friendly(error.message) };
  }
  return { data: data as LogEntry };
}

export async function removeLog(e: LogEntry): Promise<Result<true>> {
  const { error } = await supabase.from('whs_claim_log').delete().eq('id', e.id);
  if (error) return { error: friendly(error.message) };
  await removeFiles(BUCKET, [e.file_path]);
  return { data: true };
}

// Documents ---------------------------------------------------------------------------------------------

export const listClaimDocs = (claimId: string) => many<ClaimDoc>('whs_claim_documents', claimId, 'created_at', false);

export async function addClaimDoc(claimId: string, category: DocCategory, title: string, file: File): Promise<Result<ClaimDoc>> {
  const up = await uploadFile(BUCKET, claimId, file);
  if (up.error || !up.path) return { error: up.error ?? 'Upload failed.' };
  const { data, error } = await supabase.from('whs_claim_documents').insert({ claim_id: claimId, category, title, file_path: up.path, file_name: file.name }).select('*').single();
  if (error) {
    await removeFiles(BUCKET, [up.path]);
    return { error: friendly(error.message) };
  }
  return { data: data as ClaimDoc };
}

export async function removeClaimDoc(d: ClaimDoc): Promise<Result<true>> {
  const { error } = await supabase.from('whs_claim_documents').delete().eq('id', d.id);
  if (error) return { error: friendly(error.message) };
  await removeFiles(BUCKET, [d.file_path]);
  return { data: true };
}

// Who opened the file -------------------------------------------------------------------------------------

export interface AccessEntry {
  id: number;
  person_id: string | null;
  claim_id: string | null;
  what: string;
  actor_name: string;
  at: string;
}

/** Record that the claim file was opened. Failing to log never blocks the screen. */
export async function logAccess(personId: string | null, claimId: string | null, what: string): Promise<void> {
  await supabase.from('whs_claim_access_log').insert({ person_id: personId, claim_id: claimId, what });
}

export async function listAccess(personId: string): Promise<Result<AccessEntry[]>> {
  const { data, error } = await supabase.from('whs_claim_access_log').select('*').eq('person_id', personId).order('at', { ascending: false }).limit(50);
  return error ? { error: friendly(error.message) } : { data: (data ?? []) as AccessEntry[] };
}

export async function listClaimHistory(claimId: string): Promise<{ id: number; occurred_at: string; actor_name: string; what: string }[]> {
  const { data } = await supabase.from('whs_history').select('id, occurred_at, actor_name, what').eq('record_type', 'claim').eq('record_id', claimId).order('occurred_at', { ascending: false });
  return (data ?? []) as { id: number; occurred_at: string; actor_name: string; what: string }[];
}
