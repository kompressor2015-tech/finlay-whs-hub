/** Reads and writes the people, evidence, statements and timeline of an incident file. */

import { supabase } from './supabase.ts';
import { removeFiles, uploadFile } from './files.ts';
import type { Evidence, EvidenceKind, IncidentPerson, Person, PersonRole, Statement, StatementStatus, TimelineEntry, Treatment } from '../utils/incidentFile.ts';

type Result<T> = { data?: T; error?: string };

function friendly(message: string | undefined): string {
  if (!message) return 'Something went wrong. Please try again.';
  if (/^(Only|Finish|Close)/.test(message)) return message;
  if (/row-level security|permission denied/i.test(message)) return 'You do not have permission to do that.';
  if (/does not exist/i.test(message)) return 'The incident file tables are not set up yet. Run the step 6 SQL in Supabase.';
  return message;
}

const BUCKET = 'whs-incident-files' as const;

// People ------------------------------------------------------------------------------

export async function listPeople(): Promise<Result<Person[]>> {
  const { data, error } = await supabase.from('whs_people').select('*').order('name');
  return error ? { error: friendly(error.message) } : { data: (data ?? []) as Person[] };
}

export type PersonInput = Pick<Person, 'name'> & Partial<Pick<Person, 'position' | 'site_id' | 'phone' | 'emergency_contact' | 'start_date' | 'notes' | 'active'>>;

export async function createPerson(input: PersonInput): Promise<Result<Person>> {
  const { data, error } = await supabase.from('whs_people').insert(input).select('*').single();
  return error ? { error: friendly(error.message) } : { data: data as Person };
}

export async function updatePerson(id: string, patch: Partial<PersonInput>): Promise<Result<Person>> {
  const { data, error } = await supabase.from('whs_people').update(patch).eq('id', id).select('*').single();
  return error ? { error: friendly(error.message) } : { data: data as Person };
}

export async function getPerson(id: string): Promise<Result<Person>> {
  const { data, error } = await supabase.from('whs_people').select('*').eq('id', id).maybeSingle();
  if (error) return { error: friendly(error.message) };
  return data ? { data: data as Person } : { error: 'Person not found, or you do not have access.' };
}

// People on an incident -----------------------------------------------------------------

export async function listIncidentPeople(incidentId: string): Promise<Result<IncidentPerson[]>> {
  const { data, error } = await supabase.from('whs_incident_people').select('*').eq('incident_id', incidentId).order('created_at');
  return error ? { error: friendly(error.message) } : { data: (data ?? []) as IncidentPerson[] };
}

/** Every incident a person is on, any role. */
export async function listPersonIncidents(personId: string): Promise<Result<IncidentPerson[]>> {
  const { data, error } = await supabase.from('whs_incident_people').select('*').eq('person_id', personId).order('created_at', { ascending: false });
  return error ? { error: friendly(error.message) } : { data: (data ?? []) as IncidentPerson[] };
}

export interface IncidentPersonInput {
  incident_id: string;
  person_id: string | null;
  name: string;
  role: PersonRole;
  employer?: string;
  phone?: string;
  notes?: string;
  body_part?: string;
  injury_nature?: string;
  mechanism?: string;
  treatment?: Treatment;
  off_work_from?: string | null;
  returned_on?: string | null;
}

export async function addIncidentPerson(input: IncidentPersonInput): Promise<Result<IncidentPerson>> {
  const { data, error } = await supabase.from('whs_incident_people').insert(input).select('*').single();
  return error ? { error: friendly(error.message) } : { data: data as IncidentPerson };
}

export async function updateIncidentPerson(id: string, patch: Partial<IncidentPersonInput>): Promise<Result<IncidentPerson>> {
  const { data, error } = await supabase.from('whs_incident_people').update(patch).eq('id', id).select('*').single();
  return error ? { error: friendly(error.message) } : { data: data as IncidentPerson };
}

export async function removeIncidentPerson(id: string): Promise<Result<true>> {
  const { error } = await supabase.from('whs_incident_people').delete().eq('id', id);
  return error ? { error: friendly(error.message) } : { data: true };
}

// Evidence ---------------------------------------------------------------------------------

export async function listEvidence(incidentId: string): Promise<Result<Evidence[]>> {
  const { data, error } = await supabase.from('whs_incident_evidence').select('*').eq('incident_id', incidentId).order('created_at');
  return error ? { error: friendly(error.message) } : { data: (data ?? []) as Evidence[] };
}

export async function addEvidence(incidentId: string, kind: EvidenceKind, description: string, file: File | null): Promise<Result<Evidence>> {
  let file_path = '';
  let file_name = '';
  if (file) {
    const up = await uploadFile(BUCKET, incidentId, file);
    if (up.error || !up.path) return { error: up.error ?? 'Upload failed.' };
    file_path = up.path;
    file_name = file.name;
  }
  const { data, error } = await supabase.from('whs_incident_evidence').insert({ incident_id: incidentId, kind, description, file_path, file_name }).select('*').single();
  if (error) {
    await removeFiles(BUCKET, [file_path]);
    return { error: friendly(error.message) };
  }
  return { data: data as Evidence };
}

export async function removeEvidence(item: Evidence): Promise<Result<true>> {
  const { error } = await supabase.from('whs_incident_evidence').delete().eq('id', item.id);
  if (error) return { error: friendly(error.message) };
  await removeFiles(BUCKET, [item.file_path]);
  return { data: true };
}

// Statements --------------------------------------------------------------------------------

export async function listStatements(incidentId: string): Promise<Result<Statement[]>> {
  const { data, error } = await supabase.from('whs_incident_statements').select('*').eq('incident_id', incidentId).order('created_at');
  return error ? { error: friendly(error.message) } : { data: (data ?? []) as Statement[] };
}

export async function requestStatement(incidentId: string, name: string, role: string, personId: string | null): Promise<Result<Statement>> {
  const { data, error } = await supabase.from('whs_incident_statements').insert({ incident_id: incidentId, name, role, person_id: personId }).select('*').single();
  return error ? { error: friendly(error.message) } : { data: data as Statement };
}

export async function updateStatement(s: Statement, patch: { status?: StatementStatus; notes?: string }, file: File | null): Promise<Result<Statement>> {
  const change: Record<string, unknown> = { ...patch };
  if (file) {
    const up = await uploadFile(BUCKET, s.incident_id, file);
    if (up.error || !up.path) return { error: up.error ?? 'Upload failed.' };
    change.file_path = up.path;
    change.file_name = file.name;
    if (!patch.status && s.status === 'requested') change.status = 'received';
  }
  const { data, error } = await supabase.from('whs_incident_statements').update(change).eq('id', s.id).select('*').single();
  if (error) return { error: friendly(error.message) };
  if (file && s.file_path) await removeFiles(BUCKET, [s.file_path]);
  return { data: data as Statement };
}

export async function removeStatement(s: Statement): Promise<Result<true>> {
  const { error } = await supabase.from('whs_incident_statements').delete().eq('id', s.id);
  if (error) return { error: friendly(error.message) };
  await removeFiles(BUCKET, [s.file_path]);
  return { data: true };
}

// Timeline ---------------------------------------------------------------------------------

export async function listTimeline(incidentId: string): Promise<Result<TimelineEntry[]>> {
  const { data, error } = await supabase.from('whs_incident_timeline').select('*').eq('incident_id', incidentId).order('happened_at');
  return error ? { error: friendly(error.message) } : { data: (data ?? []) as TimelineEntry[] };
}

export async function addTimeline(incidentId: string, happenedAt: string, what: string): Promise<Result<TimelineEntry>> {
  const { data, error } = await supabase.from('whs_incident_timeline').insert({ incident_id: incidentId, happened_at: happenedAt, what }).select('*').single();
  return error ? { error: friendly(error.message) } : { data: data as TimelineEntry };
}

export async function removeTimeline(id: string): Promise<Result<true>> {
  const { error } = await supabase.from('whs_incident_timeline').delete().eq('id', id);
  return error ? { error: friendly(error.message) } : { data: true };
}
