/** Reads and writes for Reports: hours worked, and everything the numbers are worked out from. */

import { supabase } from './supabase.ts';
import { listIncidents, listHazards, listActions } from './records.ts';
import { listClaims } from './claims.ts';
import type { Check } from '../utils/checks.ts';
import type { ReportData, HourRow } from '../utils/reports.ts';
import type { ImportLine } from '../utils/payroll.ts';

type Result<T> = { data?: T; error?: string };

function friendly(message: string | undefined): string {
  if (!message) return 'Something went wrong. Please try again.';
  if (/row-level security|permission denied/i.test(message)) return 'Only the WHS officer and admins can change hours.';
  if (/whs_hours/i.test(message) && /does not exist|schema cache/i.test(message)) return 'Hours are not set up yet. Run whs_020_hours.sql in Supabase.';
  return message;
}

export interface HoursRecord extends HourRow { id: string; note: string; entered_by_name: string; updated_at: string }
export interface HoursLogLine { id: number; site_id: string; month: string; old_hours: number | null; new_hours: number; source: string; actor_name: string; occurred_at: string }
export interface SiteWithCode { id: string; name: string; code: string }

export async function listHours(): Promise<Result<HoursRecord[]>> {
  const { data, error } = await supabase.from('whs_hours').select('*').order('month', { ascending: false }).limit(5000);
  return error ? { error: friendly(error.message) } : { data: (data ?? []) as HoursRecord[] };
}

export async function listHoursLog(limit = 100): Promise<Result<HoursLogLine[]>> {
  const { data, error } = await supabase.from('whs_hours_log').select('*').order('occurred_at', { ascending: false }).limit(limit);
  return error ? { error: friendly(error.message) } : { data: (data ?? []) as HoursLogLine[] };
}

export async function listSitesWithCode(): Promise<SiteWithCode[]> {
  const { data } = await supabase.from('whs_sites').select('id, name, code').order('name');
  return (data ?? []).map(s => ({ id: String(s.id), name: String(s.name), code: String(s.code ?? '') }));
}

/** Save hours for site and month (YYYY-MM). Callers confirm before replacing a different saved figure. */
export async function saveHours(lines: { site_id: string; month: string; hours: number }[], source: 'typed' | 'payroll', actor: string): Promise<Result<number>> {
  if (!lines.length) return { data: 0 };
  const rows = lines.map(l => ({ site_id: l.site_id, month: `${l.month}-01`, hours: l.hours, source, entered_by_name: actor, updated_at: new Date().toISOString() }));
  const { error } = await supabase.from('whs_hours').upsert(rows, { onConflict: 'site_id,month' });
  return error ? { error: friendly(error.message) } : { data: rows.length };
}

export function toSaveLines(lines: ImportLine[]) {
  return lines.map(l => ({ site_id: l.site.id, month: l.month, hours: l.hours }));
}

/** All the pre-starts, Take 5s and inspections of the last 13 months, counted a page at a time. */
async function listCheckStamps(): Promise<Pick<Check, 'id' | 'kind' | 'site_id' | 'site_name' | 'done_at'>[]> {
  const since = new Date(Date.now() - 400 * 86_400_000).toISOString();
  const out: Pick<Check, 'id' | 'kind' | 'site_id' | 'site_name' | 'done_at'>[] = [];
  for (let from = 0; from < 50_000; from += 1000) {
    const { data, error } = await supabase.from('whs_checks').select('id, kind, site_id, site_name, done_at').gte('done_at', since).order('done_at').range(from, from + 999);
    if (error || !data) break;
    out.push(...(data as never[]));
    if (data.length < 1000) break;
  }
  return out;
}

export async function loadReportData(isOfficer: boolean): Promise<Result<ReportData>> {
  const [inc, haz, act, checks, injured, hours, claims] = await Promise.all([
    listIncidents(), listHazards(), listActions(), listCheckStamps(),
    supabase.from('whs_incident_people').select('incident_id, person_id, treatment').eq('role', 'injured').limit(20000),
    listHours(),
    isOfficer ? listClaims() : Promise.resolve({ data: null } as Result<null>),
  ]);
  const err = inc.error ?? haz.error ?? act.error ?? injured.error?.message ?? hours.error;
  if (err) return { error: err };
  return {
    data: {
      incidents: inc.data ?? [], hazards: haz.data ?? [], actions: act.data ?? [],
      checks: checks as never, injured: (injured.data ?? []) as never,
      claims: isOfficer && !claims.error ? ((claims.data ?? []) as never) : null,
      hours: hours.data ?? [],
    },
  };
}

/** One line per check in a date range, for the audit pack (a page at a time so nothing is cut off). */
export async function listChecksForPack(from: string, to: string) {
  const out: Record<string, unknown>[] = [];
  const end = new Date(`${to}T00:00:00+10:00`).getTime() + 86_400_000;
  for (let i = 0; i < 100_000; i += 1000) {
    const { data, error } = await supabase.from('whs_checks')
      .select('id, kind, checklist_name, unit_no, site_id, site_name, done_by_name, done_at, result, issue_count')
      .gte('done_at', `${from}T00:00:00+10:00`).lt('done_at', new Date(end).toISOString()).order('done_at').range(i, i + 999);
    if (error || !data) break;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}
