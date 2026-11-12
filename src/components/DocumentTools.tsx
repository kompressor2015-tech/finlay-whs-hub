import { useState, type FormEvent } from 'react';
import { createDocument, uploadVersion } from '../services/documents.ts';
import { useSiteScope } from '../hooks/useSiteScope.tsx';
import { DOC_TYPES, fileKind, parseDocFile, type DocType, type WhsDocument } from '../utils/documents.ts';
import { CategoryField } from './CategoryField.tsx';
import { ErrorNote, Field, inputClass } from './Form.tsx';

const btn = 'min-h-10 px-3.5 rounded-lg border border-[#D6D2CC] bg-white text-sm font-semibold cursor-pointer';
const primary = 'min-h-10 px-4 rounded-lg bg-finlay hover:bg-finlay-dark text-white text-sm font-semibold cursor-pointer border-0 disabled:opacity-60';
const cell = 'min-h-9 w-full rounded-md border border-[#D6D2CC] bg-white px-2 text-[13px]';

/** Add one document, with its first file. */
export function AddDocumentForm({ onDone, onCancel }: { onDone: (id: string) => void; onCancel: () => void }) {
  const { sites, site } = useSiteScope();
  const [type, setType] = useState<DocType>('swi');
  const [docNo, setDocNo] = useState('');
  const [title, setTitle] = useState('');
  const [version, setVersion] = useState('');
  const [siteId, setSiteId] = useState<string>(site?.id ?? '');
  const [model, setModel] = useState('');
  const [category, setCategory] = useState('');
  const [owner, setOwner] = useState('WHS officer');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function pickFile(f: File | null) {
    setFile(f);
    if (f && !title) {
      const p = parseDocFile(f.name);
      setType(p.type);
      setDocNo(p.doc_no);
      setTitle(p.title);
      setVersion(p.version);
      setModel(p.machine_model);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError('Give the document a title.');
    setBusy(true);
    setError(null);
    const made = await createDocument({ doc_type: type, doc_no: docNo.trim(), title: title.trim(), site_id: siteId || null, machine_model: model.trim(), category: category.trim(), owner_name: owner.trim() || 'WHS officer', review_months: 12, notes: '' });
    if (made.error || !made.data) {
      setBusy(false);
      return setError(made.error ?? 'Could not add the document.');
    }
    if (file) {
      const up = await uploadVersion(made.data.id, file, version.trim());
      if (up.error) {
        setBusy(false);
        setError(`The document was added but its file did not upload: ${up.error}`);
        return;
      }
    }
    setBusy(false);
    onDone(made.data.id);
  }

  return (
    <form onSubmit={submit} className="bg-white border border-line rounded-xl p-4.5 flex flex-col gap-3">
      <h2 className="m-0 text-[15px] font-semibold">Add a document</h2>
      <Field label="File" optional htmlFor="n-file">
        <input id="n-file" type="file" onChange={e => pickFile(e.target.files?.[0] ?? null)} className="text-sm" />
      </Field>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <Field label="Type" htmlFor="n-type">
          <select id="n-type" value={type} onChange={e => setType(e.target.value as DocType)} className={inputClass}>
            {DOC_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </Field>
        <Field label="Number" optional htmlFor="n-no"><input id="n-no" value={docNo} onChange={e => setDocNo(e.target.value)} placeholder="SWI-055" className={inputClass} /></Field>
        <Field label="Version" optional htmlFor="n-ver"><input id="n-ver" value={version} onChange={e => setVersion(e.target.value)} placeholder="v1.0" className={inputClass} /></Field>
        <Field label="Category (heading in the list)" optional htmlFor="n-cat">
          <CategoryField id="n-cat" value={category} onChange={setCategory} />
        </Field>
        <Field label="Machine model" optional htmlFor="n-model"><input id="n-model" value={model} onChange={e => setModel(e.target.value)} placeholder="J-1480" className={inputClass} /></Field>
      </div>
      <Field label="Title" htmlFor="n-title"><input id="n-title" value={title} onChange={e => setTitle(e.target.value)} className={inputClass} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Applies to" htmlFor="n-site">
          <select id="n-site" value={siteId} onChange={e => setSiteId(e.target.value)} className={inputClass}>
            <option value="">All sites</option>
            {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Owner" htmlFor="n-owner"><input id="n-owner" value={owner} onChange={e => setOwner(e.target.value)} className={inputClass} /></Field>
      </div>
      <ErrorNote message={error} />
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className={primary}>{busy ? 'Adding…' : 'Add document'}</button>
        <button type="button" onClick={onCancel} className={btn}>Cancel</button>
      </div>
      <p className="m-0 text-xs text-muted">It starts with no review date. Open the document and press Reviewed today once someone has checked it.</p>
    </form>
  );
}

interface Pending {
  file: File;
  path: string;
  type: DocType;
  doc_no: string;
  title: string;
  version: string;
  machine_model: string;
  status: 'ready' | 'done' | 'error' | 'skip';
  message: string;
}

/** Drop many files (or a whole folder) at once. Each file's details are worked out from its name and can be corrected before uploading. */
export function BulkDocumentUpload({ existing, onDone, onCancel }: { existing: WhsDocument[]; onDone: () => void; onCancel: () => void }) {
  const [items, setItems] = useState<Pending[]>([]);
  const [busy, setBusy] = useState(false);
  const { site } = useSiteScope();

  function addFiles(files: File[]) {
    const wanted = files.filter(f => /\.(pdf|docx?|xlsx?)$/i.test(f.name) && !/^[~.]/.test(f.name) && !/^~\$/.test(f.name));
    setItems(prev => [
      ...prev,
      ...wanted.map(file => {
        const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath ?? '';
        const p = parseDocFile(file.name, path);
        return { file, path, ...p, status: 'ready' as const, message: '' };
      }),
    ]);
  }

  const update = (i: number, patch: Partial<Pending>) => setItems(prev => prev.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  async function uploadAll(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    // The same document twice (a PDF and a Word copy, or v1 and v2) becomes one document with two versions
    const made = new Map<string, string>();
    const key = (t: string, no: string, title: string) => `${t}|${no.toLowerCase()}|${title.toLowerCase()}`;
    for (const d of existing) made.set(key(d.doc_type, d.doc_no, d.title), d.id);
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.status !== 'ready') continue;
      if (!it.title.trim()) {
        update(i, { status: 'error', message: 'Needs a title' });
        continue;
      }
      const k = key(it.type, it.doc_no.trim(), it.title.trim());
      let docId = made.get(k);
      if (!docId) {
        const res = await createDocument({ doc_type: it.type, doc_no: it.doc_no.trim(), title: it.title.trim(), site_id: site?.id ?? null, machine_model: it.machine_model.trim(), category: '', owner_name: 'WHS officer', review_months: 12, notes: '' });
        if (res.error || !res.data) {
          update(i, { status: 'error', message: res.error ?? 'Could not add' });
          continue;
        }
        docId = res.data.id;
        made.set(k, docId);
      }
      const up = await uploadVersion(docId, it.file, it.version.trim());
      update(i, up.error ? { status: 'error', message: up.error } : { status: 'done', message: '' });
    }
    setBusy(false);
  }

  const ready = items.filter(i => i.status === 'ready').length;
  const done = items.filter(i => i.status === 'done').length;

  return (
    <form onSubmit={uploadAll} className="bg-white border border-line rounded-xl p-4.5 flex flex-col gap-3">
      <h2 className="m-0 text-[15px] font-semibold">Upload many files</h2>
      <p className="m-0 text-[13px] text-muted">
        Choose files, or a whole folder. The number, title, version and type are read from each file name. Check them, correct any that are wrong, then upload.
        {site ? ` They will be set to apply to ${site.name} only. Choose All sites in the top bar first if they apply everywhere.` : ' They will apply to all sites.'}
      </p>
      <div className="flex flex-wrap gap-4">
        <Field label="Files" htmlFor="b-files"><input id="b-files" type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx" onChange={e => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }} className="text-sm" /></Field>
        <Field label="A folder" htmlFor="b-folder">
          <input
            id="b-folder"
            type="file"
            multiple
            ref={el => { el?.setAttribute('webkitdirectory', ''); }}
            onChange={e => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }}
            className="text-sm"
          />
        </Field>
      </div>
      {items.length > 0 && (
        <div className="overflow-x-auto border border-line rounded-lg">
          <table className="w-full border-collapse text-sm min-w-[900px]">
            <thead>
              <tr className="text-muted text-xs text-left bg-[#FAF8F6]">
                <th className="px-2 py-2 font-semibold">File</th><th className="px-2 py-2 font-semibold">Type</th><th className="px-2 py-2 font-semibold">Number</th>
                <th className="px-2 py-2 font-semibold">Title</th><th className="px-2 py-2 font-semibold">Version</th><th className="px-2 py-2 font-semibold w-24">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i} className="border-t border-line-soft align-top">
                  <td className="px-2 py-2 text-[13px] text-muted max-w-[220px] truncate" title={it.path || it.file.name}>{fileKind(it.file.name)} · {it.file.name}</td>
                  <td className="px-2 py-1.5"><select aria-label="Type" value={it.type} disabled={it.status !== 'ready'} onChange={e => update(i, { type: e.target.value as DocType })} className={cell}>{DOC_TYPES.map(t => <option key={t.id} value={t.id}>{t.short}</option>)}</select></td>
                  <td className="px-2 py-1.5"><input aria-label="Number" value={it.doc_no} disabled={it.status !== 'ready'} onChange={e => update(i, { doc_no: e.target.value })} className={`${cell} w-28`} /></td>
                  <td className="px-2 py-1.5"><input aria-label="Title" value={it.title} disabled={it.status !== 'ready'} onChange={e => update(i, { title: e.target.value })} className={cell} /></td>
                  <td className="px-2 py-1.5"><input aria-label="Version" value={it.version} disabled={it.status !== 'ready'} onChange={e => update(i, { version: e.target.value })} className={`${cell} w-20`} /></td>
                  <td className="px-2 py-2 text-[13px]">
                    {it.status === 'done' ? <span className="text-[#1F6B2E] font-semibold">Uploaded</span> : it.status === 'error' ? <span className="text-finlay font-semibold" title={it.message}>Failed</span> : it.status === 'skip' ? 'Skipped' : 'Ready'}
                    {it.status === 'ready' && <button type="button" onClick={() => update(i, { status: 'skip' })} className="ml-2 bg-transparent border-0 p-0 text-xs underline cursor-pointer text-muted">skip</button>}
                    {it.status === 'error' && <span className="block text-xs text-muted">{it.message}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap gap-2 items-center">
        <button type="submit" disabled={busy || ready === 0} className={primary}>{busy ? 'Uploading…' : `Upload ${ready} file${ready === 1 ? '' : 's'}`}</button>
        {done > 0 && !busy && <button type="button" onClick={onDone} className={btn}>Done, show the list</button>}
        <button type="button" onClick={onCancel} className={btn}>Close</button>
        {done > 0 && <span className="text-sm text-muted">{done} uploaded</span>}
      </div>
    </form>
  );
}
