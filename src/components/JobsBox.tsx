import { useState, type FormEvent } from 'react';
import { addCheckJob, attachJobFile, raiseJobAction, updateCheckJob } from '../services/checkJobs.ts';
import { openFile } from '../services/files.ts';
import { isOpenJob, jobLabel, money, nextSteps, type CheckJob } from '../utils/checkJobs.ts';
import { formatDay } from '../utils/dates.ts';
import type { WhsAction } from '../utils/records.ts';
import { ErrorNote, Field, inputClass, textareaClass } from './Form.tsx';
import { Pill } from './Pill.tsx';

const btn = 'min-h-9 px-3 rounded-lg border border-[#D6D2CC] bg-white text-[13px] font-semibold cursor-pointer disabled:opacity-60';
const primary = 'min-h-10 px-4 rounded-lg border-0 bg-ink text-white text-[13px] font-semibold cursor-pointer disabled:opacity-60';
const link = 'p-0 border-0 bg-transparent text-xs font-semibold text-finlay cursor-pointer underline';

/** Quotes and repair work from a check: quote, approval, PO number, booked date, done. */
export function JobsBox({ checkId, label, jobs, actions, canEdit, onChanged }: { checkId: string; label: string; jobs: CheckJob[]; actions: WhsAction[]; canEdit: boolean; onChanged: () => void }) {
  const [adding, setAdding] = useState(false);
  if (!jobs.length && !canEdit) return null;
  return (
    <section aria-label="Quotes and repair work" className="flex flex-col gap-2.5">
      <div className="flex items-center gap-3">
        <h3 className="m-0 text-[13px] font-semibold text-muted">Quotes and repair work</h3>
        {canEdit && !adding && <button type="button" onClick={() => setAdding(true)} className={`${btn} ml-auto`}>Add a quote</button>}
      </div>
      {adding && <AddJob checkId={checkId} label={label} onDone={() => { setAdding(false); onChanged(); }} onCancel={() => setAdding(false)} />}
      {!jobs.length && !adding && <p className="m-0 text-sm text-muted">No quotes or repair work recorded for this check.</p>}
      {jobs.map(j => <JobCard key={j.id} job={j} label={label} action={actions.find(a => a.id === j.action_id) ?? null} canEdit={canEdit} onChanged={onChanged} />)}
    </section>
  );
}

function JobCard({ job, label: checkLabel, action, canEdit, onChanged }: { job: CheckJob; label: string; action: WhsAction | null; canEdit: boolean; onChanged: () => void }) {
  const [edit, setEdit] = useState<{ po: string; booked: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = jobLabel(job.status);
  const steps = canEdit ? nextSteps(job.status) : [];

  async function run(p: Promise<{ error?: string }>) {
    setBusy(true);
    setError(null);
    const r = await p;
    setBusy(false);
    if (r.error) return setError(r.error);
    setEdit(null);
    onChanged();
  }

  return (
    <div className="border border-line rounded-xl p-3.5 flex flex-col gap-2 bg-white">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-sm">{job.title}</div>
          <div className="text-xs text-muted">{[job.supplier, job.quote_ref && `Quote ${job.quote_ref}`, money(job.quote_amount)].filter(Boolean).join(' · ')}</div>
        </div>
        <span className="ml-auto"><Pill tone={label.tone}>{label.text}</Pill></span>
      </div>
      <div className="text-xs text-muted">
        PO: {job.po_number || 'not entered'} · Booked for: {job.booked_for ? formatDay(job.booked_for) : 'date not set'}
        {job.approved_by_name && <> · Approved by {job.approved_by_name}{job.approved_on ? ` on ${formatDay(job.approved_on)}` : ''}</>}
      </div>
      {job.notes && <p className="m-0 text-sm whitespace-pre-line">{job.notes}</p>}
      {action ? (
        <div className="text-xs text-muted">Action: <a href="#/m/actions" className="font-semibold text-finlay">{action.title}</a> · {action.status === 'done' ? 'done' : `due ${action.due ? formatDay(action.due) : 'no date'}`}</div>
      ) : canEdit && isOpenJob(job) ? (
        <div className="text-xs text-muted">No action yet. <button type="button" className={link} onClick={() => void run(raiseJobAction(job, checkLabel))}>Raise an action for this job</button></div>
      ) : null}
      {job.file_path && <div><button type="button" className={link} onClick={() => void openFile('whs-check-files', job.file_path as string)}>{job.file_name || 'Open the quote'}</button></div>}
      <ErrorNote message={error} />
      {canEdit && edit && (
        <form onSubmit={(e: FormEvent) => { e.preventDefault(); void run(updateCheckJob(job, { po_number: edit.po.trim(), booked_for: edit.booked || null })); }} className="flex flex-wrap gap-3 items-end">
          <Field label="PO number" htmlFor={`jp-${job.id}`}><input id={`jp-${job.id}`} value={edit.po} onChange={e => setEdit({ ...edit, po: e.target.value })} className={`${inputClass} w-40`} /></Field>
          <Field label="Booked for" optional htmlFor={`jb-${job.id}`}><input id={`jb-${job.id}`} type="date" value={edit.booked} onChange={e => setEdit({ ...edit, booked: e.target.value })} className={inputClass} /></Field>
          <button type="submit" disabled={busy} className={primary}>Save</button>
          <button type="button" onClick={() => setEdit(null)} className={btn}>Cancel</button>
        </form>
      )}
      {canEdit && !edit && (
        <div className="flex flex-wrap gap-2">
          {steps.map(s => <button key={s.to} type="button" disabled={busy} onClick={() => void run(updateCheckJob(job, { status: s.to }))} className={btn}>{s.label}</button>)}
          {job.status !== 'done' && job.status !== 'cancelled' && <button type="button" onClick={() => setEdit({ po: job.po_number, booked: job.booked_for ?? '' })} className={btn}>PO and booking</button>}
          <label className={`${btn} inline-flex items-center cursor-pointer`}>
            {job.file_path ? 'Replace file' : 'Attach quote'}
            <input type="file" className="sr-only" onChange={e => { const f = e.target.files?.[0]; if (f) void run(attachJobFile(job, f)); e.target.value = ''; }} />
          </label>
        </div>
      )}
    </div>
  );
}

function AddJob({ checkId, label, onDone, onCancel }: { checkId: string; label: string; onDone: () => void; onCancel: () => void }) {
  const [f, setF] = useState({ title: '', supplier: '', quote_ref: '', amount: '', po: '', booked: '', notes: '' });
  const [raise, setRaise] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!f.title.trim()) return setError('Say what the work is.');
    const amount = f.amount.trim() ? Number(f.amount.replace(/[$,\s]/g, '')) : null;
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) return setError('Enter the quote amount as a number.');
    setBusy(true);
    setError(null);
    const r = await addCheckJob(checkId, { title: f.title.trim(), supplier: f.supplier.trim(), quote_ref: f.quote_ref.trim(), quote_amount: amount, po_number: f.po.trim(), booked_for: f.booked || null, notes: f.notes.trim() }, file, raise ? label : null);
    setBusy(false);
    if (r.error) return setError(r.error);
    onDone();
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3 border border-line rounded-xl p-3.5 bg-[#FAF8F6]">
      <Field label="What is the work" htmlFor="jb-title"><input id="jb-title" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} className={inputClass} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Supplier" optional htmlFor="jb-sup"><input id="jb-sup" value={f.supplier} onChange={e => setF({ ...f, supplier: e.target.value })} className={inputClass} /></Field>
        <Field label="Quote reference" optional htmlFor="jb-ref"><input id="jb-ref" value={f.quote_ref} onChange={e => setF({ ...f, quote_ref: e.target.value })} className={inputClass} /></Field>
        <Field label="Amount (incl GST)" optional htmlFor="jb-amt"><input id="jb-amt" inputMode="decimal" value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} className={inputClass} /></Field>
        <Field label="Booked for" optional htmlFor="jb-bk"><input id="jb-bk" type="date" value={f.booked} onChange={e => setF({ ...f, booked: e.target.value })} className={inputClass} /></Field>
      </div>
      <Field label="Notes" optional htmlFor="jb-notes"><textarea id="jb-notes" rows={2} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} className={textareaClass} /></Field>
      <Field label="Quote file" optional htmlFor="jb-file"><input id="jb-file" type="file" onChange={e => setFile(e.target.files?.[0] ?? null)} className="text-sm" /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={raise} onChange={e => setRaise(e.target.checked)} /> Also raise an action to track this job (due on the booked date, or in 14 days)</label>
      <ErrorNote message={error} />
      <div className="flex gap-2"><button type="submit" disabled={busy} className={primary}>{busy ? 'Saving…' : 'Save quote'}</button><button type="button" onClick={onCancel} className={btn}>Cancel</button></div>
    </form>
  );
}
