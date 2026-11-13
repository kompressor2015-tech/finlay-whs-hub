/** Uploading to and opening files from the private WHS storage buckets. */

import { supabase } from './supabase.ts';

export type FileBucket = 'whs-incident-files' | 'whs-claim-files' | 'whs-check-files';

export async function uploadFile(bucket: FileBucket, folder: string, file: File): Promise<{ path?: string; error?: string }> {
  const safe = file.name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80);
  const path = `${folder}/${Date.now()}_${crypto.randomUUID().slice(0, 8)}_${safe}`;
  const up = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type || 'application/octet-stream' });
  if (up.error) {
    const denied = /row-level security|permission|not allowed/i.test(up.error.message);
    return { error: denied ? `You do not have permission to upload ${file.name}.` : `Could not upload ${file.name}: ${up.error.message}` };
  }
  return { path };
}

export async function removeFiles(bucket: FileBucket, paths: string[]): Promise<void> {
  const list = paths.filter(Boolean);
  if (list.length) await supabase.storage.from(bucket).remove(list);
}

export async function fileLink(bucket: FileBucket, path: string): Promise<string | null> {
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

/** Open a file in a new tab. The tab opens first (phones block pop-ups opened after a wait). */
export async function openFile(bucket: FileBucket, path: string): Promise<void> {
  const tab = window.open('', '_blank');
  const url = await fileLink(bucket, path);
  if (url && tab) tab.location.href = url;
  else if (url) window.location.href = url;
  else tab?.close();
}
