/** Repair and follow-up jobs from checks. */

import { supabase } from './supabase.ts';
import { removeFiles, uploadFile } from './files.ts';
import type { CheckJob, JobStatus } from '../utils/checkJobs.ts';

type Result<T> = { data?: T; error?: string };

function friendly(message: string | undefined): string {
  if (!message) return 'Something went wrong. Please try again.';
  if (/Only a WHS officer/i.test(message)) return 'Only a WHS officer can approve a quote.';
  if (/row-level security|permission denied/i.test(message)) return 'You do not have permission to do that.';
  if (/whs_check_jobs/i.test(message) && /does not exist|schema cache/i.test(message)) return 'Jobs are not set up yet. Run whs_027_check_jobs.sql in Supabase.';
  return message;
}

export async function listCheckJobs(): Promise<Result<CheckJob[]>> {
  const { data, error } = await supabase.from('whs_check_jobs').select('*').order('created_at', { ascending: false }).limit(2000);
  return error ? { error: friendly(error.message) } : { data: (data ?? []) as CheckJob[] };
}

export interface JobInput { title: string; supplier: string; quote_ref: string; quote_amount: number | null; po_number: string; booked_for: string | null; notes: string }

export async function addCheckJob(checkId: string, input: JobInput, file: File | null): Promise<Result<CheckJob>> {
  let path: string | undefined;
  if (file) {
    const up = await uploadFile('whs-check-files', checkId, file);
    if (up.error) return { error: up.error };
    path = up.path;
  }
  const { data, error } = await supabase
    .from('whs_check_jobs')
    .insert({ check_id: checkId, ...input, file_path: path ?? null, file_name: file?.name ?? null })
    .select('*')
    .single();
  if (error) {
    if (path) await removeFiles('whs-check-files', [path]);
    return { error: friendly(error.message) };
  }
  return { data: data as CheckJob };
}

export async function updateCheckJob(id: string, patch: Partial<Pick<JobInput, 'po_number' | 'booked_for' | 'notes'>> & { status?: JobStatus }): Promise<Result<CheckJob>> {
  const { data, error } = await supabase.from('whs_check_jobs').update(patch).eq('id', id).select('*').single();
  return error ? { error: friendly(error.message) } : { data: data as CheckJob };
}

/** Attach or replace the quote file on a job. */
export async function attachJobFile(job: CheckJob, file: File): Promise<Result<CheckJob>> {
  const up = await uploadFile('whs-check-files', job.check_id, file);
  if (up.error) return { error: up.error };
  const { data, error } = await supabase.from('whs_check_jobs').update({ file_path: up.path, file_name: file.name }).eq('id', job.id).select('*').single();
  if (error) {
    await removeFiles('whs-check-files', [up.path as string]);
    return { error: friendly(error.message) };
  }
  if (job.file_path) await removeFiles('whs-check-files', [job.file_path]);
  return { data: data as CheckJob };
}
