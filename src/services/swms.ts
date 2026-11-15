/** SWMS: the statements, their versions, approval and review log. */

import { supabase } from './supabase.ts';
import { uploadPhotos } from './records.ts';
import { EMPTY_CONTENT, type Swms, type SwmsReview, type SwmsStep, type SwmsVersion, type VersionContent } from '../utils/swms.ts';

type Result<T> = { data?: T; error?: string };

function friendly(message: string | undefined): string {
  if (!message) return 'Something went wrong. Please try again.';
  if (/row-level security|permission denied/i.test(message)) return 'You do not have permission to do that.';
  if (/whs_swms/i.test(message) && /does not exist|schema cache/i.test(message)) return 'The SWMS tables are not there yet. Run whs_018_swms.sql in Supabase.';
  return message.replace(/^.*?(An approved version|Approval needs|Only the WHS|Add at least)/, '$1');
}

export async function loadSwms(): Promise<Result<{ swms: Swms[]; versions: SwmsVersion[]; reviews: SwmsReview[] }>> {
  const [s, v, r] = await Promise.all([
    supabase.from('whs_swms').select('*').order('ref').limit(5000),
    supabase.from('whs_swms_versions').select('*').order('version', { ascending: false }).limit(20000),
    supabase.from('whs_swms_reviews').select('*').order('reviewed_on', { ascending: false }).limit(20000),
  ]);
  const err = s.error ?? v.error ?? r.error;
  if (err) return { error: friendly(err.message) };
  return { data: { swms: (s.data ?? []) as Swms[], versions: (v.data ?? []) as SwmsVersion[], reviews: (r.data ?? []) as SwmsReview[] } };
}

export type SwmsInput = Pick<Swms, 'title' | 'site_id' | 'owner_name' | 'review_months' | 'document_id' | 'swms_number' | 'risk_register_ref'>;
export type { VersionContent };

export async function createSwms(input: SwmsInput, content: VersionContent = EMPTY_CONTENT): Promise<Result<Swms>> {
  const { data, error } = await supabase.from('whs_swms').insert(input).select('*').single();
  if (error) return { error: friendly(error.message) };
  const swms = data as Swms;
  const v = await supabase.from('whs_swms_versions').insert({ swms_id: swms.id, ...content });
  if (v.error) return { data: swms, error: `The SWMS was saved, but its first draft was not: ${friendly(v.error.message)}` };
  return { data: swms };
}

export async function updateSwms(id: string, patch: Partial<SwmsInput & Pick<Swms, 'status'>>): Promise<Result<Swms>> {
  const { data, error } = await supabase.from('whs_swms').update(patch).eq('id', id).select('*').single();
  return error ? { error: friendly(error.message) } : { data: data as Swms };
}

export async function deleteSwms(id: string): Promise<Result<true>> {
  const { error } = await supabase.from('whs_swms').delete().eq('id', id);
  return error ? { error: friendly(error.message) } : { data: true };
}

/** A new draft, starting from the content of an earlier version if given. */
export async function startVersion(swmsId: string, from?: VersionContent): Promise<Result<SwmsVersion>> {
  const { data, error } = await supabase.from('whs_swms_versions').insert({ swms_id: swmsId, ...(from ?? EMPTY_CONTENT) }).select('*').single();
  return error ? { error: friendly(error.message) } : { data: data as SwmsVersion };
}

export async function saveDraft(versionId: string, content: VersionContent): Promise<Result<SwmsVersion>> {
  const { data, error } = await supabase.from('whs_swms_versions').update(content).eq('id', versionId).eq('status', 'draft').select('*').single();
  return error ? { error: friendly(error.message) } : { data: data as SwmsVersion };
}

export async function submitVersion(versionId: string): Promise<Result<SwmsVersion>> {
  const { data, error } = await supabase.from('whs_swms_versions').update({ status: 'awaiting' }).eq('id', versionId).eq('status', 'draft').select('*').single();
  return error ? { error: friendly(error.message) } : { data: data as SwmsVersion };
}

export async function sendBack(versionId: string, note: string): Promise<Result<SwmsVersion>> {
  const { data, error } = await supabase.from('whs_swms_versions').update({ status: 'draft', decision_note: note }).eq('id', versionId).eq('status', 'awaiting').select('*').single();
  return error ? { error: friendly(error.message) } : { data: data as SwmsVersion };
}

export async function approveVersion(versionId: string, signature: File, position: string): Promise<Result<SwmsVersion>> {
  const up = await uploadPhotos([signature]);
  if (up.error || !up.data?.[0]) return { error: up.error ?? 'The signature could not be saved.' };
  const { data, error } = await supabase.from('whs_swms_versions').update({ status: 'approved', signature_path: up.data[0], approver_position: position }).eq('id', versionId).eq('status', 'awaiting').select('*').single();
  return error ? { error: friendly(error.message) } : { data: data as SwmsVersion };
}

export async function discardDraft(versionId: string): Promise<Result<true>> {
  const { error } = await supabase.from('whs_swms_versions').delete().eq('id', versionId).eq('status', 'draft');
  return error ? { error: friendly(error.message) } : { data: true };
}

export async function addSwmsReview(swmsId: string, reviewedOn: string, note: string): Promise<Result<SwmsReview>> {
  const { data, error } = await supabase.from('whs_swms_reviews').insert({ swms_id: swmsId, reviewed_on: reviewedOn, note }).select('*').single();
  return error ? { error: friendly(error.message) } : { data: data as SwmsReview };
}

export async function removeSwmsReview(id: string): Promise<Result<true>> {
  const { error } = await supabase.from('whs_swms_reviews').delete().eq('id', id);
  return error ? { error: friendly(error.message) } : { data: true };
}

export { EMPTY_CONTENT };
export type { SwmsStep };
