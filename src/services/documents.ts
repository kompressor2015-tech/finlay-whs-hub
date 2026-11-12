/** The Documents library: documents, their file versions, and the private file store. */

import { supabase } from './supabase.ts';
import { today, type DocType, type DocVersion, type WhsDocument } from '../utils/documents.ts';

type Result<T> = { data?: T; error?: string };

function friendly(message: string | undefined): string {
  if (!message) return 'Something went wrong. Please try again.';
  if (/row-level security|permission denied/i.test(message)) return 'You do not have permission to do that.';
  if (/does not exist|whs_documents|whs_document_versions/i.test(message)) return 'The documents tables are not there yet. Run whs_005_documents.sql in Supabase.';
  return message;
}

const BUCKET = 'whs-documents';

export async function listDocuments(): Promise<Result<WhsDocument[]>> {
  const { data, error } = await supabase.from('whs_documents').select('*').eq('active', true).order('doc_no').order('title').limit(5000);
  return error ? { error: friendly(error.message) } : { data: (data ?? []) as WhsDocument[] };
}

/** Every version of every document (small rows, no files), for the register's file and version columns. */
export async function listAllVersions(): Promise<Result<DocVersion[]>> {
  const { data, error } = await supabase.from('whs_document_versions').select('*').order('uploaded_at', { ascending: false }).limit(10000);
  return error ? { error: friendly(error.message) } : { data: (data ?? []) as DocVersion[] };
}

export async function getDocument(id: string): Promise<Result<{ doc: WhsDocument; versions: DocVersion[] }>> {
  const [d, v] = await Promise.all([
    supabase.from('whs_documents').select('*').eq('id', id).maybeSingle(),
    supabase.from('whs_document_versions').select('*').eq('document_id', id).order('uploaded_at', { ascending: false }),
  ]);
  if (d.error || v.error) return { error: friendly((d.error ?? v.error)?.message) };
  if (!d.data) return { error: 'That document was not found.' };
  return { data: { doc: d.data as WhsDocument, versions: (v.data ?? []) as DocVersion[] } };
}

export type DocumentInput = Pick<WhsDocument, 'doc_type' | 'doc_no' | 'title' | 'site_id' | 'machine_model' | 'category' | 'owner_name' | 'review_months' | 'notes'> & { reviewed_on?: string | null };

export async function createDocument(input: DocumentInput): Promise<Result<WhsDocument>> {
  const { data, error } = await supabase.from('whs_documents').insert(input).select('*').single();
  return error ? { error: friendly(error.message) } : { data: data as WhsDocument };
}

export async function updateDocument(id: string, patch: Partial<DocumentInput>): Promise<Result<WhsDocument>> {
  const { data, error } = await supabase.from('whs_documents').update(patch).eq('id', id).select('*').single();
  return error ? { error: friendly(error.message) } : { data: data as WhsDocument };
}

/** Someone has read it through and it is still right: the review clock restarts today. */
export function markReviewed(id: string): Promise<Result<WhsDocument>> {
  return updateDocument(id, { reviewed_on: today() });
}

export async function deleteDocument(id: string, filePaths: string[]): Promise<Result<true>> {
  const { error } = await supabase.from('whs_documents').delete().eq('id', id);
  if (error) return { error: friendly(error.message) };
  if (filePaths.length) await supabase.storage.from(BUCKET).remove(filePaths);
  return { data: true };
}

/** Upload a file as a new version of a document. Older versions are kept. */
export async function uploadVersion(documentId: string, file: File, version: string): Promise<Result<DocVersion>> {
  const safe = file.name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80);
  const path = `${documentId}/${Date.now()}_${crypto.randomUUID().slice(0, 8)}_${safe}`;
  const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'application/octet-stream' });
  if (up.error) return { error: `Could not upload ${file.name}: ${friendly(up.error.message)}` };
  const { data, error } = await supabase.from('whs_document_versions').insert({ document_id: documentId, version, file_path: path, file_name: file.name }).select('*').single();
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    return { error: friendly(error.message) };
  }
  return { data: data as DocVersion };
}

export async function documentLink(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

export async function openDocumentFile(path: string): Promise<void> {
  // Open the tab straight away (phones block pop-ups opened after a wait), then point it at the file.
  const tab = window.open('', '_blank');
  const url = await documentLink(path);
  if (url && tab) tab.location.href = url;
  else if (url) window.location.href = url;
  else tab?.close();
}

export type { DocType };
