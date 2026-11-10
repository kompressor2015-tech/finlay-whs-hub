/**
 * Checklists, completed checks and plant flags. The database copies a checklist's
 * questions into each check, works out the result, and raises flags and actions itself.
 */

import { supabase } from './supabase.ts';
import type { Check, Checklist, PlantFlag } from '../utils/checks.ts';

type Result<T> = { data?: T; error?: string };

function friendly(message: string | undefined): string {
  if (!message) return 'Something went wrong. Please try again.';
  if (/^(Only|Add a note|A pre-start|That checklist)/.test(message)) return message;
  if (/row-level security|permission denied/i.test(message)) return 'You do not have permission to do that.';
  if (/does not exist/i.test(message)) return 'The inspection tables are not set up yet. Run the step 3 SQL in Supabase.';
  return message;
}

export async function listChecklists(): Promise<Result<Checklist[]>> {
  const { data, error } = await supabase.from('whs_checklists').select('*').order('kind').order('name');
  return error ? { error: friendly(error.message) } : { data: (data ?? []) as Checklist[] };
}

export async function getChecklist(id: string): Promise<Result<Checklist>> {
  const { data, error } = await supabase.from('whs_checklists').select('*').eq('id', id).maybeSingle();
  if (error) return { error: friendly(error.message) };
  return data ? { data: data as Checklist } : { error: 'Checklist not found.' };
}

export async function saveChecklist(id: string, patch: Partial<Pick<Checklist, 'name' | 'items' | 'frequency_days' | 'site_name' | 'active'>>): Promise<Result<Checklist>> {
  const { data, error } = await supabase.from('whs_checklists').update(patch).eq('id', id).select('*').single();
  return error ? { error: friendly(error.message) } : { data: data as Checklist };
}

export async function createChecklist(input: Pick<Checklist, 'kind' | 'name' | 'site_name' | 'frequency_days' | 'items'>): Promise<Result<Checklist>> {
  const { data, error } = await supabase.from('whs_checklists').insert(input).select('*').single();
  return error ? { error: friendly(error.message) } : { data: data as Checklist };
}

export type NewCheck = Partial<Pick<Check,
  'checklist_id' | 'answers' | 'machine_id' | 'unit_no' | 'site_id' | 'site_name' | 'engine_hours' | 'task' | 'hazards' |
  'controls' | 'crew' | 'safe_to_start' | 'comments' | 'photos' | 'signed_off'>> & { kind: Check['kind'] };

export async function createCheck(input: NewCheck): Promise<Result<Check>> {
  const { data, error } = await supabase.from('whs_checks').insert(input).select('*').single();
  return error ? { error: friendly(error.message) } : { data: data as Check };
}

export async function getCheck(id: string): Promise<Result<Check>> {
  const { data, error } = await supabase.from('whs_checks').select('*').eq('id', id).maybeSingle();
  if (error) return { error: friendly(error.message) };
  return data ? { data: data as Check } : { error: 'Check not found, or you do not have access to it.' };
}

/** Recent checks (newest first). The full questions are left out to keep lists light. */
export async function listChecks(sinceDays = 90): Promise<Result<Check[]>> {
  const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from('whs_checks')
    .select('id, kind, checklist_id, checklist_name, machine_id, unit_no, site_name, engine_hours, task, crew, safe_to_start, result, issue_count, done_by, done_by_name, done_at, answers')
    .gte('done_at', since)
    .order('done_at', { ascending: false })
    .limit(1000);
  return error ? { error: friendly(error.message) } : { data: (data ?? []).map(c => ({ ...c, items: [] })) as unknown as Check[] };
}

/** The most recent pre-start for one unit (for "last pre-start" under the unit number). */
export async function lastPrestart(unitNo: string): Promise<Pick<Check, 'done_at' | 'done_by_name' | 'result' | 'engine_hours'> | null> {
  const { data } = await supabase
    .from('whs_checks')
    .select('done_at, done_by_name, result, engine_hours')
    .eq('kind', 'prestart')
    .eq('unit_no', unitNo)
    .order('done_at', { ascending: false })
    .limit(1);
  return (data?.[0] as Pick<Check, 'done_at' | 'done_by_name' | 'result' | 'engine_hours'>) ?? null;
}

export async function listFlags(): Promise<Result<PlantFlag[]>> {
  const { data, error } = await supabase.from('whs_plant_flags').select('*').order('raised_at', { ascending: false }).limit(500);
  return error ? { error: friendly(error.message) } : { data: (data ?? []) as PlantFlag[] };
}

export async function clearFlag(id: string, note: string): Promise<Result<PlantFlag>> {
  const { data, error } = await supabase.from('whs_plant_flags').update({ cleared_at: new Date().toISOString(), clear_note: note }).eq('id', id).select('*').single();
  return error ? { error: friendly(error.message) } : { data: data as PlantFlag };
}

// ---------------------------------------------------------------------------------
// From the Fleet Hub (read only)
// ---------------------------------------------------------------------------------

export interface FleetUnit {
  id: string;
  unitNo: string;
  model: string;
  status: string;
  location: string;
  client: string;
  guarding: string;
  hours: number | null;
}

export async function listFleetUnits(): Promise<FleetUnit[]> {
  const { data, error } = await supabase.from('stock_machines').select('id, model, status, hours, current_location, data').is('archived_at', null).limit(2000);
  if (error || !data) return [];
  return data
    .map(row => {
      const d = (row.data ?? {}) as { unitNo?: string; client?: string; guardingStatus?: string; location?: string };
      return {
        id: String(row.id),
        unitNo: String(d.unitNo || ''),
        model: String(row.model || ''),
        status: String(row.status || ''),
        location: String(row.current_location || d.location || ''),
        client: String(d.client || ''),
        guarding: String(d.guardingStatus || ''),
        hours: typeof row.hours === 'number' ? row.hours : null,
      };
    })
    .filter(u => u.unitNo && u.status !== 'Sold / Dispatched')
    .sort((a, b) => a.unitNo.localeCompare(b.unitNo, undefined, { numeric: true }));
}

/** Latest workshop 360° rating per unit number, from the Fleet Hub's inspections (if this login can read them). */
export async function latestFleetRatings(): Promise<Map<string, { rating: string; at: string }>> {
  const map = new Map<string, { rating: string; at: string }>();
  const { data, error } = await supabase.from('inspections').select('unit_or_serial, overall_rating, created_at').order('created_at', { ascending: false }).limit(2000);
  if (error || !data) return map;
  for (const row of data) {
    const key = String(row.unit_or_serial || '');
    if (key && !map.has(key)) map.set(key, { rating: String(row.overall_rating || ''), at: String(row.created_at || '') });
  }
  return map;
}
