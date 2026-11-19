/** Job Safety Analyses (JSA). */

import { supabase } from './supabase.ts';
import type { Jsa, JsaContent } from '../utils/jsa.ts';

type Result<T> = { data?: T; error?: string };

function friendly(message: string | undefined): string {
  if (!message) return 'Something went wrong. Please try again.';
  if (/row-level security|permission denied/i.test(message)) return 'You do not have permission to do that.';
  if (/whs_jsas/i.test(message) && /does not exist|schema cache/i.test(message)) return 'JSAs are not set up yet. Run whs_044_jsa.sql in Supabase.';
  return message;
}

export async function listJsas(): Promise<Result<Jsa[]>> {
  const { data, error } = await supabase.from('whs_jsas').select('*').order('created_at', { ascending: false }).limit(2000);
  return error ? { error: friendly(error.message) } : { data: (data ?? []) as Jsa[] };
}

export async function createJsa(content: JsaContent): Promise<Result<Jsa>> {
  const { data, error } = await supabase.from('whs_jsas').insert(content).select('*').single();
  return error ? { error: friendly(error.message) } : { data: data as Jsa };
}

export async function saveJsa(id: string, patch: Partial<JsaContent> & { status?: Jsa['status'] }): Promise<Result<Jsa>> {
  const { data, error } = await supabase.from('whs_jsas').update(patch).eq('id', id).select('*').single();
  return error ? { error: friendly(error.message) } : { data: data as Jsa };
}

export async function deleteJsa(id: string): Promise<Result<true>> {
  const { error } = await supabase.from('whs_jsas').delete().eq('id', id);
  return error ? { error: friendly(error.message) } : { data: true };
}
