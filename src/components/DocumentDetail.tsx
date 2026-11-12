import { useEffect, useState, type FormEvent } from 'react';
import type { WhsUser } from '../services/auth.ts';
import { deleteDocument, getDocument, markReviewed, openDocumentFile, updateDocument, uploadVersion } from '../services/documents.ts';
import { hrefFor } from '../hooks/useRoute.ts';
import { useSiteScope } from '../hooks/useSiteScope.tsx';
import { isOfficeAccess } from '../utils/access.ts';
import { formatDay, formatWhen } from '../utils/dates.ts';
import { CATEGORY_SUGGESTIONS, DOC_TYPES, currentVersion, docTypeLabel, fileKind, reviewBy, reviewPill, type DocType, type DocVersion, type WhsDocument } from '../utils/documents.ts';
import { ErrorNote, Field, inputClass, textareaClass } from './Form.tsx';
import { Pill } from './Pill.tsx';

const btn = 'min-h-10 px-3.5 rounded-lg border border-[#D6D2CC] bg-white text-sm font-semibold cursor-pointer';
const primary = 'min-h-10 px-4 rounded-lg bg-finlay hover:bg-finlay-dark text-white text-sm font-semibold cursor-pointer border-0 disabled:opacity-60';

/** One document: details, the review date, and every version of the file. Used in the side panel and as a full page. */
export function DocumentDetail({ id, user, embedded, onChanged }: { id: string; user: WhsUser; embedded?: boolean; onChanged?: () => void }) {
  const office = isOfficeAccess(user.access);
  const officer = user.access === 'admin' || user.access === 'whs_officer';
  const { sites } = useSiteScope();
  const [doc, setDoc] = useState<WhsDocument | null>(null);
  const [versions, setVersions] = useState<DocVersion[]>([]);
  const [form, setForm] = useState<WhsDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [versionLabel, setVersionLabel] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleted, setDeleted] = useState(false);

  async function load() {
    const res = await getDocument(id);
    if (res.error || !res.data) {
      setError(res.error ?? 'That document was not found.');
      return;
    }
    setDoc(res.data.doc);
    setForm(res.data.doc);
    setVersions(res.data.versions);
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const dirty = !!doc && !!form && (['doc_type', 'doc_no', 'title', 'site_id', 'machine_model', 'category', 'owner_name', 'review_months', 'notes'] as const).some(k => doc[k] !== form[k]);

  async function save(e?: FormEvent) {
    e?.preventDefault();
    if (!form) return;
    if (!form.title.trim()) return setError('The document needs a title.');
    setBusy(true);
    setError(null);
    const res = await updateDocument(form.id, {
      doc_type: form.doc_type, doc_no: form.doc_no.trim(), title: form.title.trim(), site_id: form.site_id, machine_model: form.machine_model.trim(), category: form.category.trim(),
      owner_name: form.owner_name.trim(), review_months: Math.max(1, Math.round(Number(form.review_months) || 12)), notes: form.notes,
    });
    setBusy(false);
    if (res.error) return setError(res.error);
    await load();
    onChanged?.();
  }

  async function reviewedToday() {
    if (!doc) return;
    setBusy(true);
    setError(null);
    const res = await markReviewed(doc.id);
    setBusy(false);
    if (res.error) return setError(res.error);
    await load();
    onChanged?.();
  }

  async function addVersion(e: FormEvent) {
    e.preventDefault();
    if (!doc || !file) return;
    setBusy(true);
    setError(null);
    const res = await uploadVersion(doc.id, file, versionLabel.trim());
    setBusy(false);
    if (res.error) return setError(res.error);
    setFile(null);
    setVersionLabel('');
    await load();
    onChanged?.();
  }

  async function remove() {
    if (!doc) return;
    setBusy(true);
    const res = await deleteDocument(doc.id, versions.map(v => v.file_path));
    setBusy(false);
    if (res.error) return setError(res.error);
    setDeleted(true);
    onChanged?.();
  }

  if (deleted) return <p className="text-sm text-muted">That document has been deleted.</p>;
  if (!doc || !form) return error ? <ErrorNote message={error} /> : <p className="text-sm text-muted">Loading…</p>;

  const current = currentVersion(versions);
  const pill = reviewPill(doc);
  const by = reviewBy(doc);
  const set = <K extends keyof WhsDocument>(k: K, v: WhsDocument[K]) => setForm(f => (f ? { ...f, [k]: v } : f));
  const siteName = doc.site_id ? sites.find(s => s.id === doc.site_id)?.name ?? doc.site_id : 'All sites';

  return (
    <div className="flex flex-col gap-4.5">
      {!embedded && <a href={hrefFor({ name: 'module', id: 'documents' })} className="text-sm no-underline text-muted">← Documents</a>}
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone="grey">{docTypeLabel(doc.doc_type)}</Pill>
        <Pill tone={pill.tone}>{pill.label}</Pill>
      </div>
      <div>
        <h1 className="m-0 text-xl font-bold">{doc.doc_no ? `${doc.doc_no} · ` : ''}{doc.title}</h1>
        <p className="mt-1 mb-0 text-[13px] text-muted">
          {current ? `${current.version || 'Current version'} · ${fileKind(current.file_name)} · uploaded ${formatWhen(current.uploaded_at)}` : 'No file uploaded yet'} · {siteName}
        </p>
      </div>
      <ErrorNote message={error} />

      <div className="flex flex-wrap gap-2">
        {current && <button type="button" onClick={() => void openDocumentFile(current.file_path)} className={primary}>Open the file</button>}
        {office && <button type="button" onClick={() => void reviewedToday()} disabled={busy} className={btn}>Reviewed today</button>}
      </div>

      <dl className="m-0 grid grid-cols-[120px_1fr] gap-x-3 gap-y-2 text-sm">
        <dt className="text-muted">Owner</dt><dd className="m-0">{doc.owner_name || '—'}</dd>
        <dt className="text-muted">Review every</dt><dd className="m-0">{doc.review_months} months</dd>
        <dt className="text-muted">Last reviewed</dt><dd className="m-0">{doc.reviewed_on ? `${formatDay(doc.reviewed_on)}${doc.reviewed_by_name ? ` by ${doc.reviewed_by_name}` : ''}` : 'Not yet'}</dd>
        <dt className="text-muted">Review by</dt><dd className="m-0">{by ? formatDay(by) : 'Set when it is first reviewed'}</dd>
        {doc.machine_model && <><dt className="text-muted">Machine model</dt><dd className="m-0">{doc.machine_model}</dd></>}
        {doc.notes && <><dt className="text-muted">Notes</dt><dd className="m-0 whitespace-pre-wrap">{doc.notes}</dd></>}
      </dl>

      <section aria-label="Versions">
        <h2 className="m-0 mb-2 text-[13px] font-semibold text-muted">Versions</h2>
        <div className="border border-line rounded-xl bg-white">
          {versions.length === 0 && <p className="m-0 px-3.5 py-3 text-sm text-muted">No file yet.</p>}
          {versions.map((v, i) => (
            <div key={v.id} className={`flex items-center gap-3 px-3.5 py-2.5 text-sm ${i ? 'border-t border-line-soft' : ''}`}>
              <span className="flex-1 min-w-0">
                <span className="font-semibold">{v.version || 'No version label'}</span>
                {i === 0 && <span className="ml-2"><Pill tone="green">Current</Pill></span>}
                <span className="block text-xs text-muted truncate">{v.file_name} · {formatWhen(v.uploaded_at)}{v.uploaded_by_name ? ` · ${v.uploaded_by_name}` : ''}</span>
              </span>
              <button type="button" onClick={() => void openDocumentFile(v.file_path)} className={btn}>Open</button>
            </div>
          ))}
        </div>
        {office && (
          <form onSubmit={addVersion} className="mt-3 flex flex-wrap gap-2 items-end">
            <Field label="Upload a new version" htmlFor="doc-file">
              <input id="doc-file" type="file" onChange={e => setFile(e.target.files?.[0] ?? null)} className="text-sm max-w-[260px]" />
            </Field>
            <Field label="Version" optional htmlFor="doc-ver">
              <input id="doc-ver" value={versionLabel} onChange={e => setVersionLabel(e.target.value)} placeholder="v5.0" className={`${inputClass} w-28`} />
            </Field>
            <button type="submit" disabled={!file || busy} className={primary}>Upload</button>
            <p className="m-0 basis-full text-xs text-muted">Older versions are kept. Staff are always given the newest.</p>
          </form>
        )}
      </section>

      {office && (
        <form onSubmit={save} className="flex flex-col gap-3 border-t border-line-soft pt-4">
          <h2 className="m-0 text-[13px] font-semibold text-muted">Details</h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type" htmlFor="d-type">
              <select id="d-type" value={form.doc_type} onChange={e => set('doc_type', e.target.value as DocType)} className={inputClass}>
                {DOC_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </Field>
            <Field label="Number" optional htmlFor="d-no"><input id="d-no" value={form.doc_no} onChange={e => set('doc_no', e.target.value)} className={inputClass} /></Field>
          </div>
          <Field label="Title" htmlFor="d-title"><input id="d-title" value={form.title} onChange={e => set('title', e.target.value)} className={inputClass} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Applies to" htmlFor="d-site">
              <select id="d-site" value={form.site_id ?? ''} onChange={e => set('site_id', e.target.value || null)} className={inputClass}>
                <option value="">All sites</option>
                {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Machine model" optional htmlFor="d-model"><input id="d-model" value={form.machine_model} onChange={e => set('machine_model', e.target.value)} placeholder="J-1480" className={inputClass} /></Field>
            <Field label="Category (heading in the list)" optional htmlFor="d-cat">
              <input id="d-cat" list="d-cats" value={form.category} onChange={e => set('category', e.target.value)} placeholder="e.g. Mobile plant" className={inputClass} />
              <datalist id="d-cats">{CATEGORY_SUGGESTIONS.map(c => <option key={c} value={c} />)}</datalist>
            </Field>
            <Field label="Owner" htmlFor="d-owner"><input id="d-owner" value={form.owner_name} onChange={e => set('owner_name', e.target.value)} className={inputClass} /></Field>
            <Field label="Review every (months)" htmlFor="d-months"><input id="d-months" type="number" min={1} value={form.review_months} onChange={e => set('review_months', Number(e.target.value))} className={inputClass} /></Field>
          </div>
          <Field label="Notes" optional htmlFor="d-notes"><textarea id="d-notes" value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} className={textareaClass} /></Field>
          <div className="flex flex-wrap gap-2 items-center">
            <button type="submit" disabled={!dirty || busy} className={primary}>Save details</button>
            {officer && !confirmDelete && <button type="button" onClick={() => setConfirmDelete(true)} className={`${btn} ml-auto text-finlay`}>Delete</button>}
            {officer && confirmDelete && (
              <span className="ml-auto flex items-center gap-2 text-sm">
                Delete this document and all its versions?
                <button type="button" onClick={() => void remove()} disabled={busy} className={`${btn} text-finlay`}>Yes, delete</button>
                <button type="button" onClick={() => setConfirmDelete(false)} className={btn}>Keep</button>
              </span>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
