/** The risk register: risks, their controls and their review log. */

import { supabase } from './supabase.ts';
import type { ControlLevel } from '../utils/incidentFile.ts';
import type { Risk, RiskControl, RiskReview } from '../utils/risks.ts';

type Result<T> = { data?: T; error?: string };

function friendly(message: string | undefined): string {
  if (!message) return 'Something went wrong. Please try again.';
  if (/row-level security|permission denied/i.test(message)) return 'You do not have permission to do that.';
  if (/whs_risk/i.test(message) && /does not exist|schema cache/i.test(message)) return 'The risk register tables are not there yet. Run whs_017_risks.sql in Supabase.';
  return message;
}

export async function loadRisks(): Promise<Result<{ risks: Risk[]; controls: RiskControl[]; reviews: RiskReview[] }>> {
  const [r, c, v] = await Promise.all([
    supabase.from('whs_risks').select('*').order('ref').limit(5000),
    supabase.from('whs_risk_controls').select('*').order('created_at').limit(20000),
    supabase.from('whs_risk_reviews').select('*').order('reviewed_on', { ascending: false }).limit(20000),
  ]);
  const err = r.error ?? c.error ?? v.error;
  if (err) return { error: friendly(err.message) };
  return { data: { risks: (r.data ?? []) as Risk[], controls: (c.data ?? []) as RiskControl[], reviews: (v.data ?? []) as RiskReview[] } };
}

export type RiskInput = Pick<Risk, 'title' | 'category' | 'site_id' | 'description' | 'before_likelihood' | 'before_consequence' | 'after_likelihood' | 'after_consequence' | 'owner_name' | 'review_months'>;

export async function createRisk(input: RiskInput, controls: { control_level: ControlLevel; what: string }[]): Promise<Result<Risk>> {
  const { data, error } = await supabase.from('whs_risks').insert(input).select('*').single();
  if (error) return { error: friendly(error.message) };
  const risk = data as Risk;
  if (controls.length) {
    const c = await supabase.from('whs_risk_controls').insert(controls.map(x => ({ ...x, risk_id: risk.id })));
    if (c.error) return { data: risk, error: `The risk was saved, but its controls were not: ${friendly(c.error.message)}` };
  }
  return { data: risk };
}

export async function updateRisk(id: string, patch: Partial<RiskInput & Pick<Risk, 'notes' | 'status'>>): Promise<Result<Risk>> {
  const { data, error } = await supabase.from('whs_risks').update(patch).eq('id', id).select('*').single();
  return error ? { error: friendly(error.message) } : { data: data as Risk };
}

export async function addControl(riskId: string, level: ControlLevel, what: string): Promise<Result<RiskControl>> {
  const { data, error } = await supabase.from('whs_risk_controls').insert({ risk_id: riskId, control_level: level, what }).select('*').single();
  return error ? { error: friendly(error.message) } : { data: data as RiskControl };
}

export async function removeControl(id: string): Promise<Result<true>> {
  const { error } = await supabase.from('whs_risk_controls').delete().eq('id', id);
  return error ? { error: friendly(error.message) } : { data: true };
}

export async function addReview(riskId: string, reviewedOn: string, note: string): Promise<Result<RiskReview>> {
  const { data, error } = await supabase.from('whs_risk_reviews').insert({ risk_id: riskId, reviewed_on: reviewedOn, note }).select('*').single();
  return error ? { error: friendly(error.message) } : { data: data as RiskReview };
}

/** Administrators only (a line entered by mistake). */
export async function removeReview(id: string): Promise<Result<true>> {
  const { error } = await supabase.from('whs_risk_reviews').delete().eq('id', id);
  return error ? { error: friendly(error.message) } : { data: true };
}

export async function deleteRisk(id: string): Promise<Result<true>> {
  const { error } = await supabase.from('whs_risks').delete().eq('id', id);
  return error ? { error: friendly(error.message) } : { data: true };
}
