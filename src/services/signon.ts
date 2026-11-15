/** Jobs and SWMS sign-on. */

import { supabase } from './supabase.ts';
import { uploadPhotos } from './records.ts';
import type { Job, JobPerson, JobSwms, SignOn } from '../utils/signon.ts';

type Result<T> = { data?: T; error?: string };

function friendly(message: string | undefined): string {
  if (!message) return 'Something went wrong. Please try again.';
  if (/whs_swms_signons_once|duplicate key/i.test(message)) return 'Already signed on to this version.';
  if (/row-level security|permission denied/i.test(message)) return 'You do not have permission to do that.';
  if (/(whs_jobs|whs_swms_signons|whs_job_)/i.test(message) && /does not exist|schema cache/i.test(message)) return 'Jobs and sign-on are not set up yet. Run whs_019_jobs_signon.sql in Supabase.';
  return message.replace(/^.*?(That SWMS version|This SWMS has|Signing on needs|Add the|That person)/, '$1');
}

export async function loadJobs(): Promise<Result<{ jobs: Job[]; jobSwms: JobSwms[]; jobPeople: JobPerson[] }>> {
  const [j, s, p] = await Promise.all([
    supabase.from('whs_jobs').select('*').order('created_at', { ascending: false }).limit(5000),
    supabase.from('whs_job_swms').select('*').limit(20000),
    supabase.from('whs_job_people').select('*').limit(20000),
  ]);
  const err = j.error ?? s.error ?? p.error;
  if (err) return { error: friendly(err.message) };
  return { data: { jobs: (j.data ?? []) as Job[], jobSwms: (s.data ?? []) as JobSwms[], jobPeople: (p.data ?? []) as JobPerson[] } };
}

export type JobInput = Pick<Job, 'name' | 'site_id' | 'client' | 'location' | 'supervisor_name' | 'starts_on' | 'ends_on' | 'notes'>;

export async function createJob(input: JobInput): Promise<Result<Job>> {
  const { data, error } = await supabase.from('whs_jobs').insert(input).select('*').single();
  return error ? { error: friendly(error.message) } : { data: data as Job };
}

export async function updateJob(id: string, patch: Partial<JobInput & Pick<Job, 'status'>>): Promise<Result<Job>> {
  const { data, error } = await supabase.from('whs_jobs').update(patch).eq('id', id).select('*').single();
  return error ? { error: friendly(error.message) } : { data: data as Job };
}

export async function deleteJob(id: string): Promise<Result<true>> {
  const { error } = await supabase.from('whs_jobs').delete().eq('id', id);
  return error ? { error: friendly(error.message) } : { data: true };
}

/** Make the job's linked SWMS exactly this list. */
export async function setJobSwms(jobId: string, swmsIds: string[], current: string[]): Promise<Result<true>> {
  const add = swmsIds.filter(id => !current.includes(id));
  const drop = current.filter(id => !swmsIds.includes(id));
  if (add.length) { const r = await supabase.from('whs_job_swms').insert(add.map(swms_id => ({ job_id: jobId, swms_id }))); if (r.error) return { error: friendly(r.error.message) }; }
  if (drop.length) { const r = await supabase.from('whs_job_swms').delete().eq('job_id', jobId).in('swms_id', drop); if (r.error) return { error: friendly(r.error.message) }; }
  return { data: true };
}

/** Make the job's crew exactly this list. */
export async function setJobPeople(jobId: string, personIds: string[], current: string[]): Promise<Result<true>> {
  const add = personIds.filter(id => !current.includes(id));
  const drop = current.filter(id => !personIds.includes(id));
  if (add.length) { const r = await supabase.from('whs_job_people').insert(add.map(person_id => ({ job_id: jobId, person_id }))); if (r.error) return { error: friendly(r.error.message) }; }
  if (drop.length) { const r = await supabase.from('whs_job_people').delete().eq('job_id', jobId).in('person_id', drop); if (r.error) return { error: friendly(r.error.message) }; }
  return { data: true };
}

export async function loadSignOns(): Promise<Result<SignOn[]>> {
  const { data, error } = await supabase.from('whs_swms_signons').select('*').order('signed_at', { ascending: false }).limit(50000);
  return error ? { error: friendly(error.message) } : { data: (data ?? []) as SignOn[] };
}

export interface SignOnInput {
  swms_id: string;
  version_id: string;
  job_id: string | null;
  person_id: string | null;
  signer_name?: string;
  company?: string;
}

export async function signOn(input: SignOnInput, signature: File): Promise<Result<SignOn>> {
  const up = await uploadPhotos([signature]);
  if (up.error || !up.data?.[0]) return { error: up.error ?? 'The signature could not be saved.' };
  const { data, error } = await supabase.from('whs_swms_signons').insert({ ...input, signature_path: up.data[0] }).select('*').single();
  return error ? { error: friendly(error.message) } : { data: data as SignOn };
}

export async function removeSignOn(id: string): Promise<Result<true>> {
  const { error } = await supabase.from('whs_swms_signons').delete().eq('id', id);
  return error ? { error: friendly(error.message) } : { data: true };
}

/** The worker record linked to the person logged in, or null if none is linked. */
export async function myPersonId(): Promise<string | null> {
  const { data, error } = await supabase.rpc('whs_my_person_id');
  return error || !data ? null : (data as string);
}
