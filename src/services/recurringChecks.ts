/** Recurring checks and the log of each time one was done. */

import { supabase } from './supabase.ts';
import { uploadFile, removeFiles } from './files.ts';
import { createAction } from './records.ts';
import { addDays, brisbaneDay } from '../utils/dates.ts';
import type { CheckLogLine, RecurringCheck, Template } from '../utils/recurringChecks.ts';

type Result<T> = { data?: T; error?: string };

export interface CheckSite {
  id: string;
  name: string;
  state: string;
}

function friendly(message: string | undefined): string {
  if (!message) return 'Something went wrong. Please try again.';
  if (/row-level security|permission denied/i.test(message)) return 'You do not have permission to do that.';
  if (/whs_recurring_check/i.test(message) && /does not exist|schema cache/i.test(message)) return 'The recurring checks tables are not there yet. Run whs_016_recurring_checks.sql in Supabase.';
  return message;
}

export async function loadChecks(): Promise<Result<{ sites: CheckSite[]; checks: RecurringCheck[]; log: CheckLogLine[] }>> {
  const [s, c, l] = await Promise.all([
    supabase.from('whs_sites').select('id, name, state').order('name'),
    supabase.from('whs_recurring_checks').select('*').eq('active', true).order('category').order('name').limit(2000),
    supabase.from('whs_recurring_check_log').select('*').order('done_on', { ascending: false }).limit(20000),
  ]);
  const err = s.error ?? c.error ?? l.error;
  if (err) return { error: friendly(err.message) };
  return {
    data: {
      sites: (s.data ?? []).map(x => ({ id: String(x.id), name: String(x.name), state: String(x.state ?? '') })),
      checks: (c.data ?? []) as RecurringCheck[],
      log: (l.data ?? []) as CheckLogLine[],
    },
  };
}

/** Start a site's list from the template for its state (only checks it does not have yet). */
export async function addTemplates(siteId: string, templates: Template[]): Promise<Result<RecurringCheck[]>> {
  if (!templates.length) return { data: [] };
  const rows = templates.map(t => ({ site_id: siteId, name: t.name, category: t.category, interval_months: t.interval_months, basis: t.basis, rule_confirmed: t.confirmed }));
  const { data, error } = await supabase.from('whs_recurring_checks').insert(rows).select('*');
  return error ? { error: friendly(error.message) } : { data: (data ?? []) as RecurringCheck[] };
}

export type NewCheck = Pick<RecurringCheck, 'site_id' | 'name' | 'category' | 'interval_months' | 'basis'> & { first_due?: string | null };

export async function addCheck(input: NewCheck): Promise<Result<RecurringCheck>> {
  const { data, error } = await supabase.from('whs_recurring_checks').insert({ ...input, rule_confirmed: true }).select('*').single();
  return error ? { error: friendly(error.message) } : { data: data as RecurringCheck };
}

export async function updateCheck(id: string, patch: Partial<Pick<RecurringCheck, 'name' | 'category' | 'interval_months' | 'basis' | 'rule_confirmed' | 'first_due' | 'notes' | 'active'>>): Promise<Result<RecurringCheck>> {
  const { data, error } = await supabase.from('whs_recurring_checks').update(patch).eq('id', id).select('*').single();
  return error ? { error: friendly(error.message) } : { data: data as RecurringCheck };
}

export interface RecordInput {
  done_on: string;
  done_by_kind: 'staff' | 'contractor';
  done_by_name: string;
  company: string;
  result: 'passed' | 'failed';
  notes: string;
}

/** Records that a check was done. A failed check raises an action so it gets fixed. */
export async function recordCheck(check: RecurringCheck, siteName: string, input: RecordInput, file: File | null): Promise<Result<CheckLogLine>> {
  let path: string | undefined;
  if (file) {
    const up = await uploadFile('whs-check-files', check.id, file);
    if (up.error) return { error: up.error };
    path = up.path;
  }
  let actionId: string | null = null;
  if (input.result === 'failed') {
    const a = await createAction({
      title: `Fix failed check: ${check.name}${input.notes ? ` (${input.notes.slice(0, 80)})` : ''}`,
      source_type: 'other',
      source_id: null,
      source_ref: `${check.name} · ${siteName}`,
      machine_id: null,
      unit_no: '',
      owner_id: null,
      due: addDays(brisbaneDay(new Date()), 14),
    });
    if (a.error) return { error: a.error };
    actionId = a.data?.id ?? null;
  }
  const { data, error } = await supabase
    .from('whs_recurring_check_log')
    .insert({ check_id: check.id, ...input, file_path: path ?? null, file_name: file?.name ?? null, action_id: actionId })
    .select('*')
    .single();
  if (error) {
    if (path) await removeFiles('whs-check-files', [path]);
    return { error: friendly(error.message) };
  }
  return { data: data as CheckLogLine };
}

/** Administrators only (a line entered by mistake). */
export async function removeLogLine(line: CheckLogLine): Promise<Result<true>> {
  const { error } = await supabase.from('whs_recurring_check_log').delete().eq('id', line.id);
  if (error) return { error: friendly(error.message) };
  if (line.file_path) await removeFiles('whs-check-files', [line.file_path]);
  return { data: true };
}
