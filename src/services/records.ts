/**
 * Reads and writes incidents, hazards and actions in the shared Supabase database.
 * The database stamps references (INC-0001), reporters, dates and history itself,
 * and its access rules decide who sees what, so this file stays simple.
 */

import { supabase } from './supabase.ts';
import type { Hazard, HistoryEntry, Incident, WhsAction } from '../utils/records.ts';

type Result<T> = { data?: T; error?: string };

function friendly(message: string | undefined): string {
  if (!message) return 'Something went wrong. Please try again.';
  // Messages raised by the database's own rules are already plain English.
  if (/^(Only|Finish)/.test(message)) return message;
  if (/row-level security|permission denied/i.test(message)) return 'You do not have permission to do that.';
  if (/does not exist/i.test(message)) return 'The WHS tables are not set up yet. Run the step 2 SQL in Supabase.';
  return message;
}

// ---------------------------------------------------------------------------------
// Shared lists from the fleet app
// ---------------------------------------------------------------------------------

export interface MachineOption {
  id: string;
  unitNo: string;
  model: string;
}

export interface SiteOption {
  id: string;
  name: string;
}

export interface PersonOption {
  id: string;
  name: string;
}

export async function listMachines(): Promise<MachineOption[]> {
  const { data, error } = await supabase
    .from('stock_machines')
    .select('id, model, data')
    .is('archived_at', null)
    .limit(2000);
  if (error || !data) return [];
  return data
    .map(row => ({ id: String(row.id), unitNo: String((row.data as { unitNo?: string } | null)?.unitNo || ''), model: String(row.model || '') }))
    .filter(m => m.unitNo)
    .sort((a, b) => a.unitNo.localeCompare(b.unitNo, undefined, { numeric: true }));
}

export async function listSites(): Promise<SiteOption[]> {
  const { data, error } = await supabase.from('depot_sites').select('id, name').order('name');
  if (error || !data) return [];
  return data.map(s => ({ id: String(s.id), name: String(s.name) }));
}

/** People who can be given actions or lead investigations: fleet admins and anyone with a WHS role. */
export async function listPeople(): Promise<PersonOption[]> {
  const { data, error } = await supabase.from('profiles').select('id, name, email, role, whs_role, status').order('name');
  if (error || !data) return [];
  return data
    .filter(p => p.status !== 'SUSPENDED' && (p.role === 'admin' || p.whs_role))
    .map(p => ({ id: String(p.id), name: String(p.name || p.email) }));
}

// ---------------------------------------------------------------------------------
// Photos (private bucket; shown through short-lived links)
// ---------------------------------------------------------------------------------

export async function uploadPhotos(files: File[]): Promise<Result<string[]>> {
  const paths: string[] = [];
  for (const file of files) {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const path = `${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from('whs-photos').upload(path, file, { contentType: file.type || 'image/jpeg' });
    if (error) return { error: `Could not upload ${file.name}: ${friendly(error.message)}` };
    paths.push(path);
  }
  return { data: paths };
}

export async function photoLinks(paths: string[]): Promise<string[]> {
  if (!paths.length) return [];
  const { data } = await supabase.storage.from('whs-photos').createSignedUrls(paths, 3600);
  return (data ?? []).map(d => d.signedUrl).filter((u): u is string => Boolean(u));
}

// ---------------------------------------------------------------------------------
// Incidents
// ---------------------------------------------------------------------------------

export type NewIncident = Pick<
  Incident,
  'type' | 'occurred_at' | 'site_id' | 'site_name' | 'location_detail' | 'machine_id' | 'unit_no' | 'people' |
  'description' | 'immediate_action' | 'photos' | 'notifiable_reasons' | 'whsq_reference' | 'whsq_called_at' | 'whsq_called_by'
>;

export async function listIncidents(): Promise<Result<Incident[]>> {
  const { data, error } = await supabase.from('whs_incidents').select('*').order('occurred_at', { ascending: false });
  return error ? { error: friendly(error.message) } : { data: (data ?? []) as Incident[] };
}

export async function getIncident(id: string): Promise<Result<Incident>> {
  const { data, error } = await supabase.from('whs_incidents').select('*').eq('id', id).maybeSingle();
  if (error) return { error: friendly(error.message) };
  return data ? { data: data as Incident } : { error: 'Incident not found, or you do not have access to it.' };
}

export async function createIncident(input: NewIncident): Promise<Result<Incident>> {
  const { data, error } = await supabase.from('whs_incidents').insert(input).select('*').single();
  return error ? { error: friendly(error.message) } : { data: data as Incident };
}

export async function updateIncident(id: string, patch: Partial<Incident>): Promise<Result<Incident>> {
  const { data, error } = await supabase.from('whs_incidents').update(patch).eq('id', id).select('*').single();
  return error ? { error: friendly(error.message) } : { data: data as Incident };
}

// ---------------------------------------------------------------------------------
// Hazards
// ---------------------------------------------------------------------------------

export type NewHazard = Pick<
  Hazard,
  'description' | 'site_id' | 'site_name' | 'location_detail' | 'machine_id' | 'unit_no' | 'photos' | 'severity' | 'made_safe' | 'made_safe_note'
>;

export async function listHazards(): Promise<Result<Hazard[]>> {
  const { data, error } = await supabase.from('whs_hazards').select('*').order('created_at', { ascending: false });
  return error ? { error: friendly(error.message) } : { data: (data ?? []) as Hazard[] };
}

export async function getHazard(id: string): Promise<Result<Hazard>> {
  const { data, error } = await supabase.from('whs_hazards').select('*').eq('id', id).maybeSingle();
  if (error) return { error: friendly(error.message) };
  return data ? { data: data as Hazard } : { error: 'Hazard not found, or you do not have access to it.' };
}

export async function createHazard(input: NewHazard): Promise<Result<Hazard>> {
  const { data, error } = await supabase.from('whs_hazards').insert(input).select('*').single();
  return error ? { error: friendly(error.message) } : { data: data as Hazard };
}

export async function updateHazard(id: string, patch: Partial<Hazard>): Promise<Result<Hazard>> {
  const { data, error } = await supabase.from('whs_hazards').update(patch).eq('id', id).select('*').single();
  return error ? { error: friendly(error.message) } : { data: data as Hazard };
}

// ---------------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------------

export type NewAction = Pick<WhsAction, 'title' | 'source_type' | 'source_id' | 'source_ref' | 'machine_id' | 'unit_no' | 'owner_id' | 'due'>;

export async function listActions(source?: { type: string; id: string }): Promise<Result<WhsAction[]>> {
  let q = supabase.from('whs_actions').select('*');
  if (source) q = q.eq('source_type', source.type).eq('source_id', source.id);
  const { data, error } = await q.order('due', { ascending: true, nullsFirst: false });
  return error ? { error: friendly(error.message) } : { data: (data ?? []) as WhsAction[] };
}

export async function createAction(input: NewAction): Promise<Result<WhsAction>> {
  const { data, error } = await supabase.from('whs_actions').insert(input).select('*').single();
  return error ? { error: friendly(error.message) } : { data: data as WhsAction };
}

export async function updateAction(id: string, patch: Partial<WhsAction>): Promise<Result<WhsAction>> {
  const { data, error } = await supabase.from('whs_actions').update(patch).eq('id', id).select('*').single();
  return error ? { error: friendly(error.message) } : { data: data as WhsAction };
}

// ---------------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------------

export async function listHistory(type: 'incident' | 'hazard', id: string): Promise<HistoryEntry[]> {
  const { data, error } = await supabase
    .from('whs_history')
    .select('id, occurred_at, actor_name, what')
    .eq('record_type', type)
    .eq('record_id', id)
    .order('occurred_at', { ascending: false });
  return error || !data ? [] : (data as HistoryEntry[]);
}
