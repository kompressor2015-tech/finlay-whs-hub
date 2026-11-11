import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  addCertificate, addClaimDoc, addContact, addLog, listCertificates, listClaimDocs, listClaimHistory, listContacts, listLog, listStages,
  removeCertificate, removeClaimDoc, removeContact, removeLog, removeStage, saveStage, toggleStep, updateClaim, logAccess,
} from '../services/claims.ts';
import { openFile } from '../services/files.ts';
import { hrefFor } from '../hooks/useRoute.ts';
import { addDays, brisbaneDay, formatDay, formatWhen } from '../utils/dates.ts';
import {
  CAPACITIES, CLAIM_STATUSES, DOC_CATEGORIES, LOG_KINDS, RTW_STATUSES, STATES, capacityLabel, certificateStatus, claimAttention, claimStatus, daysOffWork, isOpen,
  logLabel, rtwStatus, stepsDone, type Capacity, type Certificate, type Claim, type ClaimContact, type ClaimDoc, type ClaimStatus, type DocCategory, type LogEntry, type LogKind, type RtwStage, type RtwStatus,
} from '../utils/claims.ts';
import type { WhsUser } from '../services/auth.ts';
import { ErrorNote, Field, inputClass } from './Form.tsx';
import { Pill } from './Pill.tsx';

const card = 'bg-white border border-line rounded-xl';
const btn = 'min-h-10 px-3.5 rounded-lg border border-[#D6D2CC] bg-white text-[13px] font-semibold cursor-pointer disabled:opacity-60';
const btnPri = 'min-h-10 px-4 rounded-lg border-0 bg-ink text-white text-[13px] font-semibold cursor-pointer disabled:opacity-60';
const linkBtn = 'bg-transparent border-0 p-0 text-[13px] font-semibold text-ink underline cursor-pointer min-h-8';
const toneBg: Record<string, string> = { red: 'bg-[#FDE8E8] text-[#9B1218]', amber: 'bg-[#FFF1D6] text-[#7A4B00]', green: 'bg-[#E3F4E6] text-[#1F6B2E]', blue: 'bg-[#E4EEFC] text-[#1C4A8F]', grey: 'bg-[#ECECEC] text-[#4A4A50]' };

function Section({ title, sub, count, children, open: initial = true }: { title: string; sub?: string; count?: string; children: ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(initial);
  return (
    <section className={`${card} overflow-hidden`}>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="w-full flex items-center gap-3 px-4.5 py-3.5 bg-transparent border-0 text-left cursor-pointer">
        <span className="flex-1 min-w-0"><span className="block text-[15px] font-semibold">{title}</span>{sub && <span className="block text-[13px] text-muted">{sub}</span>}</span>
        {count && <span className="text-[13px] text-muted">{count}</span>}
        <span aria-hidden="true" className="text-muted">{open ? '−' : '+'}</span>
      </button>
      {open && <div className="border-t border-line-soft px-4.5 py-4 flex flex-col gap-3.5">{children}</div>}
    </section>
  );
}

function FileLink({ path, name }: { path: string; name: string }) {
  if (!path) return null;
  return <button type="button" className={linkBtn} onClick={() => void openFile('whs-claim-files', path)}>{name || 'Open the file'}</button>;
}

const atNoon = (day: string) => new Date(`${day}T12:00:00+10:00`).toISOString();

/** One workers compensation claim: status, steps, certificates, return to work, contacts, correspondence and documents. */
export function ClaimFile({ claim: initial, incidentRef, incidentAt, user, onChanged }: { claim: Claim; incidentRef: string; incidentAt: string; user: WhsUser; onChanged: () => void }) {
  const [claim, setClaim] = useState(initial);
  const [certs, setCerts] = useState<Certificate[]>([]);
  const [stages, setStages] = useState<RtwStage[]>([]);
  const [contacts, setContacts] = useState<ClaimContact[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [docs, setDocs] = useState<ClaimDoc[]>([]);
  const [history, setHistory] = useState<{ id: number; occurred_at: string; actor_name: string; what: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const info = STATES[claim.state];

  const loadAll = useCallback(async () => {
    const [c, s, k, l, d, h] = await Promise.all([listCertificates(initial.id), listStages(initial.id), listContacts(initial.id), listLog(initial.id), listClaimDocs(initial.id), listClaimHistory(initial.id)]);
    setError(c.error ?? s.error ?? k.error ?? l.error ?? d.error ?? null);
    setCerts(c.data ?? []); setStages(s.data ?? []); setContacts(k.data ?? []); setLog(l.data ?? []); setDocs(d.data ?? []); setHistory(h);
  }, [initial.id]);
  useEffect(() => { void loadAll(); }, [loadAll]);
  useEffect(() => { void logAccess(initial.person_id, initial.id, `Opened the ${initial.state} claim file for ${incidentRef}`); }, [initial.id, initial.person_id, initial.state, incidentRef]);

  async function run(fn: () => Promise<{ error?: string; data?: unknown }>, andClaim = false) {
    setBusy(true); setError(null);
    const res = await fn();
    setBusy(false);
    if (res.error) { setError(res.error); return false; }
    if (andClaim && res.data) setClaim(res.data as Claim);
    await loadAll(); onChanged();
    return true;
  }
  const patch = (p: Partial<Claim>) => run(() => updateClaim(claim.id, p), true);

  const st = claimStatus(claim.status);
  const cs = certificateStatus(certs);
  const att = claimAttention(claim, certs, incidentAt);
  const steps = stepsDone(claim);
  const off = daysOffWork(claim);

  return (
    <div className="flex flex-col gap-3.5">
      <div className={`${card} px-4.5 py-4 flex flex-wrap items-center gap-x-4 gap-y-2`}>
        <Pill tone={st.tone}>{info.scheme}: {st.label}</Pill>
        <a href={hrefFor({ name: 'incident', id: claim.incident_id })} className="text-sm font-semibold">{incidentRef}</a>
        {claim.claim_no && <span className="text-sm text-muted">Claim no. {claim.claim_no}</span>}
        {off !== null && <span className="text-sm text-muted">{off} {off === 1 ? 'day' : 'days'} {claim.returned_on ? 'off work' : 'off work so far'}</span>}
        <span className="text-sm text-muted">Steps {steps.done}/{steps.total}</span>
      </div>
      <ErrorNote message={error} />
      {att.length > 0 && (
        <ul className="list-none m-0 p-0 flex flex-col gap-2">
          {att.map(a => <li key={a.id} className={`rounded-lg px-3.5 py-2.5 text-sm ${toneBg[a.tone]}`}><strong>{a.when}.</strong> {a.what}</li>)}
        </ul>
      )}

      <Section title="Claim details" sub="Status, dates and the claim manager at the insurer">
        <ClaimDetails claim={claim} busy={busy} onSave={patch} />
      </Section>

      <Section title={`What ${info.scheme} expects of Finlay`} sub={`${steps.done} of ${steps.total} steps done`}>
        <ul className="list-none m-0 p-0 flex flex-col gap-1">
          {info.steps.map(s => {
            const done = claim.steps?.[s.id];
            return (
              <li key={s.id}>
                <label className="flex items-start gap-2.5 min-h-10 py-1 text-sm cursor-pointer">
                  <input type="checkbox" className="w-5 h-5 mt-0.5 accent-[#1E6B3A]" checked={Boolean(done)} disabled={busy} onChange={() => void run(() => toggleStep(claim, s.id, user.name), true)} />
                  <span>{s.label}{done && <span className="block text-xs text-muted">{formatWhen(done.at)} · {done.by}</span>}</span>
                </label>
              </li>
            );
          })}
        </ul>
        <details className="text-sm">
          <summary className="cursor-pointer font-semibold">The rules for {claim.state}</summary>
          <ul className="mt-2 mb-2 pl-5 flex flex-col gap-1 text-[13px] leading-relaxed">{info.rules.map(r => <li key={r}>{r}</li>)}</ul>
          <a href={info.source.url} target="_blank" rel="noreferrer" className="text-[13px] font-semibold">Source: {info.source.label}</a>
          <p className="mt-1.5 mb-0 text-xs text-muted">A guide for the file, not legal advice. Check with the insurer for your exact obligations.</p>
        </details>
      </Section>

      <Section title="Medical certificates" sub={cs.current ? `Current to ${formatDay(cs.current.to_date)}` : cs.lapsedSince ? `Ran out ${formatDay(cs.lapsedSince)}` : 'None on file'} count={`${certs.length}`}>
        {cs.gaps.length > 0 && <p className={`m-0 rounded-lg px-3.5 py-2.5 text-sm ${toneBg.amber}`}>No certificate covering {cs.gaps.map(g => `${formatDay(g.from)} to ${formatDay(g.to)}`).join(', ')}.</p>}
        <ul className="list-none m-0 p-0 flex flex-col divide-y divide-line-soft">
          {certs.map(c => {
            const cap = capacityLabel(c.capacity);
            return (
              <li key={c.id} className="py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="font-semibold">{formatDay(c.from_date)} to {formatDay(c.to_date)}</span>
                <Pill tone={cap.tone}>{cap.label}</Pill>
                <span className="text-muted">{c.doctor_name}</span>
                <FileLink path={c.file_path} name={c.file_name} />
                <button type="button" className={`${linkBtn} ml-auto`} onClick={() => window.confirm('Delete this certificate?') && void run(() => removeCertificate(c))}>Delete</button>
                {c.restrictions && <span className="basis-full text-[13px] text-[#3A3A3F]">{c.restrictions}</span>}
              </li>
            );
          })}
        </ul>
        <CertificateForm busy={busy} defaultFrom={cs.latest ? addDays(cs.latest.to_date, 1) : claim.off_work_from ?? brisbaneDay(new Date())} onAdd={(i, f) => run(() => addCertificate(claim.id, i, f))} />
      </Section>

      <Section title="Return to work" sub={`${rtwStatus(claim.rtw_status).label}${claim.rtw_coordinator ? ` · coordinator ${claim.rtw_coordinator}` : ''}`}>
        <RtwPlan claim={claim} stages={stages} busy={busy} onSave={patch} onStage={(s) => run(() => saveStage(claim.id, s))} onRemoveStage={id => run(() => removeStage(id))} />
      </Section>

      <Section title="Doctors, case manager and other contacts" count={`${contacts.length}`} open={contacts.length > 0}>
        <ul className="list-none m-0 p-0 flex flex-col divide-y divide-line-soft">
          {contacts.map(c => (
            <li key={c.id} className="py-2 flex flex-wrap items-center gap-x-3 text-sm">
              <span className="font-semibold">{c.name}</span><span className="text-muted">{[c.role, c.org].filter(Boolean).join(', ')}</span>
              {c.phone && <a href={`tel:${c.phone.replace(/\s/g, '')}`}>{c.phone}</a>}{c.email && <a href={`mailto:${c.email}`}>{c.email}</a>}
              <button type="button" className={`${linkBtn} ml-auto`} onClick={() => void run(() => removeContact(c.id))}>Remove</button>
            </li>
          ))}
        </ul>
        <ContactForm busy={busy} onAdd={i => run(() => addContact(claim.id, i))} />
      </Section>

      <Section title="Correspondence" sub="Every call, email, letter and form, newest first" count={`${log.length}`}>
        <LogForm busy={busy} onAdd={(i, f) => run(() => addLog(claim.id, i, f))} />
        <ul className="list-none m-0 p-0 flex flex-col divide-y divide-line-soft">
          {log.map(l => (
            <li key={l.id} className="py-2.5 text-sm">
              <div className="flex flex-wrap items-center gap-x-3"><span className="text-muted">{formatDay(brisbaneDay(l.happened_at))}</span><Pill tone="grey">{logLabel(l.kind)}</Pill><span className="font-semibold">{l.with_whom}</span><FileLink path={l.file_path} name={l.file_name} />
                <button type="button" className={`${linkBtn} ml-auto`} onClick={() => window.confirm('Delete this entry?') && void run(() => removeLog(l))}>Delete</button></div>
              {l.what && <p className="mt-1 mb-0 text-[#3A3A3F] whitespace-pre-line">{l.what}</p>}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Documents" sub="Forms, letters and reports, filed by kind" count={`${docs.length}`}>
        <DocForm busy={busy} onAdd={(c, t, f) => run(() => addClaimDoc(claim.id, c, t, f))} />
        {DOC_CATEGORIES.map(cat => {
          const list = docs.filter(d => d.category === cat.id);
          if (!list.length) return null;
          return (
            <div key={cat.id}>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted mb-1">{cat.label}</div>
              <ul className="list-none m-0 p-0 flex flex-col divide-y divide-line-soft">
                {list.map(d => (
                  <li key={d.id} className="py-2 flex flex-wrap items-center gap-x-3 text-sm"><span className="font-medium">{d.title}</span><FileLink path={d.file_path} name={d.file_name} /><span className="text-muted text-xs">{formatWhen(d.created_at)} · {d.created_by_name}</span>
                    <button type="button" className={`${linkBtn} ml-auto`} onClick={() => window.confirm('Delete this document?') && void run(() => removeClaimDoc(d))}>Delete</button></li>
                ))}
              </ul>
            </div>
          );
        })}
      </Section>

      <Section title="Changes to this claim" open={false} count={`${history.length}`}>
        {history.length === 0 ? <p className="m-0 text-sm text-muted">Nothing yet.</p> : (
          <ol className="list-none m-0 p-0 flex flex-col gap-2 text-[13px]">{history.map(h => <li key={h.id}><span className="text-muted">{formatWhen(h.occurred_at)} · {h.actor_name}</span><span className="block">{h.what}</span></li>)}</ol>
        )}
      </Section>
    </div>
  );
}

function ClaimDetails({ claim, busy, onSave }: { claim: Claim; busy: boolean; onSave: (p: Partial<Claim>) => void }) {
  const [v, setV] = useState({ status: claim.status, claim_no: claim.claim_no, claim_lodged_on: claim.claim_lodged_on ?? '', decision_on: claim.decision_on ?? '', insurer_notified_at: claim.insurer_notified_at ? brisbaneDay(claim.insurer_notified_at) : '', off_work_from: claim.off_work_from ?? '', returned_on: claim.returned_on ?? '', claim_manager_name: claim.claim_manager_name, claim_manager_phone: claim.claim_manager_phone, claim_manager_email: claim.claim_manager_email, notes: claim.notes });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      <Field label="Status" htmlFor="cl-status"><select id="cl-status" className={inputClass} value={v.status} onChange={e => setV({ ...v, status: e.target.value as ClaimStatus })}>{CLAIM_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></Field>
      <Field label="Claim number" htmlFor="cl-no" optional><input id="cl-no" className={inputClass} value={v.claim_no} onChange={set('claim_no')} /></Field>
      <Field label="Insurer told on" htmlFor="cl-told" optional><input id="cl-told" type="date" className={inputClass} value={v.insurer_notified_at} onChange={set('insurer_notified_at')} /></Field>
      <Field label="Claim lodged on" htmlFor="cl-lod" optional><input id="cl-lod" type="date" className={inputClass} value={v.claim_lodged_on} onChange={set('claim_lodged_on')} /></Field>
      <Field label="Decision on" htmlFor="cl-dec" optional><input id="cl-dec" type="date" className={inputClass} value={v.decision_on} onChange={set('decision_on')} /></Field>
      <span className="hidden sm:block" />
      <Field label="First day off work" htmlFor="cl-off" optional><input id="cl-off" type="date" className={inputClass} value={v.off_work_from} onChange={set('off_work_from')} /></Field>
      <Field label="Back at work on" htmlFor="cl-ret" optional><input id="cl-ret" type="date" className={inputClass} value={v.returned_on} onChange={set('returned_on')} /></Field>
      <span className="hidden sm:block" />
      <Field label="Claim manager" htmlFor="cl-cm" optional><input id="cl-cm" className={inputClass} value={v.claim_manager_name} onChange={set('claim_manager_name')} /></Field>
      <Field label="Their phone" htmlFor="cl-cp" optional><input id="cl-cp" className={inputClass} value={v.claim_manager_phone} onChange={set('claim_manager_phone')} /></Field>
      <Field label="Their email" htmlFor="cl-ce" optional><input id="cl-ce" className={inputClass} value={v.claim_manager_email} onChange={set('claim_manager_email')} /></Field>
      <div className="col-span-2 sm:col-span-3"><Field label="Notes" htmlFor="cl-notes" optional><input id="cl-notes" className={inputClass} value={v.notes} onChange={set('notes')} /></Field></div>
      <div className="col-span-2 sm:col-span-3"><button type="button" disabled={busy} className={btnPri} onClick={() => onSave({
        status: v.status, claim_no: v.claim_no.trim(), claim_lodged_on: v.claim_lodged_on || null, decision_on: v.decision_on || null,
        insurer_notified_at: v.insurer_notified_at ? atNoon(v.insurer_notified_at) : null, off_work_from: v.off_work_from || null, returned_on: v.returned_on || null,
        closed_on: v.status === 'closed' ? (claim.closed_on ?? brisbaneDay(new Date())) : null,
        claim_manager_name: v.claim_manager_name.trim(), claim_manager_phone: v.claim_manager_phone.trim(), claim_manager_email: v.claim_manager_email.trim(), notes: v.notes.trim(),
      })}>Save details</button>{isOpen(claim) ? null : <span className="ml-3 text-sm text-muted">This claim is {claim.status === 'closed' ? 'closed' : 'rejected'}.</span>}</div>
    </div>
  );
}

function CertificateForm({ busy, defaultFrom, onAdd }: { busy: boolean; defaultFrom: string; onAdd: (i: { from_date: string; to_date: string; doctor_name: string; capacity: Capacity; restrictions: string }, f: File | null) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState('');
  const [doctor, setDoctor] = useState('');
  const [cap, setCap] = useState<Capacity>('unfit');
  const [rest, setRest] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (!open) return <button type="button" className={`${btn} self-start`} onClick={() => { setFrom(defaultFrom); setOpen(true); }}>+ Add a certificate</button>;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#FAFAF9] rounded-lg p-3.5">
      <Field label="From" htmlFor="ce-from"><input id="ce-from" type="date" className={inputClass} value={from} onChange={e => setFrom(e.target.value)} /></Field>
      <Field label="To" htmlFor="ce-to"><input id="ce-to" type="date" className={inputClass} value={to} onChange={e => setTo(e.target.value)} /></Field>
      <Field label="Doctor" htmlFor="ce-doc" optional><input id="ce-doc" className={inputClass} value={doctor} onChange={e => setDoctor(e.target.value)} /></Field>
      <Field label="Capacity" htmlFor="ce-cap"><select id="ce-cap" className={inputClass} value={cap} onChange={e => setCap(e.target.value as Capacity)}>{CAPACITIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></Field>
      <div className="col-span-2 sm:col-span-4"><Field label="Restrictions" htmlFor="ce-res" optional><input id="ce-res" className={inputClass} value={rest} onChange={e => setRest(e.target.value)} placeholder="e.g. No lifting over 5 kg, no overhead work" /></Field></div>
      <div className="col-span-2 sm:col-span-4"><Field label="Scan or photo of the certificate" htmlFor="ce-file" optional><input id="ce-file" type="file" accept="image/*,.pdf" onChange={e => setFile(e.target.files?.[0] ?? null)} /></Field></div>
      <div className="col-span-2 sm:col-span-4"><ErrorNote message={err} /></div>
      <div className="col-span-2 sm:col-span-4 flex gap-2">
        <button type="button" disabled={busy} className={btnPri} onClick={async () => {
          if (!from || !to) return setErr('Enter both dates.');
          if (to < from) return setErr('The end date is before the start date.');
          setErr(null);
          if (await onAdd({ from_date: from, to_date: to, doctor_name: doctor.trim(), capacity: cap, restrictions: rest.trim() }, file)) { setOpen(false); setTo(''); setRest(''); setFile(null); }
        }}>Save certificate</button>
        <button type="button" className={btn} onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}

function RtwPlan({ claim, stages, busy, onSave, onStage, onRemoveStage }: {
  claim: Claim; stages: RtwStage[]; busy: boolean; onSave: (p: Partial<Claim>) => void;
  onStage: (s: { stage_no: number; duties: string; hours: string; starts_on: string | null; status: RtwStage['status'] }) => Promise<boolean>; onRemoveStage: (id: string) => Promise<boolean>;
}) {
  const [coord, setCoord] = useState(claim.rtw_coordinator);
  const [status, setStatus] = useState<RtwStatus>(claim.rtw_status);
  const [goal, setGoal] = useState(claim.rtw_goal);
  const [goalDate, setGoalDate] = useState(claim.rtw_goal_date ?? '');
  const [review, setReview] = useState(claim.rtw_next_review ?? '');
  const [adding, setAdding] = useState(false);
  const [duties, setDuties] = useState('');
  const [hours, setHours] = useState('');
  const [starts, setStarts] = useState('');
  const next = (stages.reduce((m, s) => Math.max(m, s.stage_no), 0)) + 1;
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Field label="Return to work coordinator" htmlFor="rt-co" hint="The person at Finlay running this return to work."><input id="rt-co" className={inputClass} value={coord} onChange={e => setCoord(e.target.value)} /></Field>
        <Field label="Plan status" htmlFor="rt-st"><select id="rt-st" className={inputClass} value={status} onChange={e => setStatus(e.target.value as RtwStatus)}>{RTW_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></Field>
        <Field label="Next review" htmlFor="rt-rv" optional><input id="rt-rv" type="date" className={inputClass} value={review} onChange={e => setReview(e.target.value)} /></Field>
        <div className="col-span-2"><Field label="Goal" htmlFor="rt-goal" optional><input id="rt-goal" className={inputClass} value={goal} onChange={e => setGoal(e.target.value)} placeholder="e.g. Back to full duties as a fitter" /></Field></div>
        <Field label="Goal date" htmlFor="rt-gd" optional><input id="rt-gd" type="date" className={inputClass} value={goalDate} onChange={e => setGoalDate(e.target.value)} /></Field>
        <div className="col-span-2 sm:col-span-3"><button type="button" disabled={busy} className={btnPri} onClick={() => onSave({ rtw_coordinator: coord.trim(), rtw_status: status, rtw_goal: goal.trim(), rtw_goal_date: goalDate || null, rtw_next_review: review || null })}>Save plan</button></div>
      </div>
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">Stages (duties and hours, building up)</div>
      <ol className="list-none m-0 p-0 flex flex-col gap-2">
        {stages.map(s => (
          <li key={s.id} className="rounded-lg border border-line-soft px-3.5 py-2.5 text-sm flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-semibold">Stage {s.stage_no}</span><span>{s.duties}</span><span className="text-muted">{s.hours}{s.starts_on ? ` · from ${formatDay(s.starts_on)}` : ''}</span>
            <select aria-label={`Stage ${s.stage_no} status`} className="ml-auto min-h-9 rounded-md border border-[#D6D2CC] px-2 text-[13px]" value={s.status} onChange={e => void onStage({ stage_no: s.stage_no, duties: s.duties, hours: s.hours, starts_on: s.starts_on, status: e.target.value as RtwStage['status'] })}>
              <option value="planned">Planned</option><option value="current">Current</option><option value="done">Done</option>
            </select>
            <button type="button" className={linkBtn} onClick={() => void onRemoveStage(s.id)}>Remove</button>
          </li>
        ))}
      </ol>
      {!adding ? <button type="button" className={`${btn} self-start`} onClick={() => setAdding(true)}>+ Add a stage</button> : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-[#FAFAF9] rounded-lg p-3.5">
          <div className="col-span-2 sm:col-span-3"><Field label={`Stage ${next} duties`} htmlFor="st-d"><input id="st-d" className={inputClass} value={duties} onChange={e => setDuties(e.target.value)} placeholder="e.g. Light duties in the parts store" /></Field></div>
          <Field label="Hours" htmlFor="st-h" optional><input id="st-h" className={inputClass} value={hours} onChange={e => setHours(e.target.value)} placeholder="e.g. 4 hours, 3 days a week" /></Field>
          <Field label="Starts" htmlFor="st-s" optional><input id="st-s" type="date" className={inputClass} value={starts} onChange={e => setStarts(e.target.value)} /></Field>
          <div className="col-span-2 sm:col-span-3 flex gap-2">
            <button type="button" disabled={busy || !duties.trim()} className={btnPri} onClick={async () => { if (await onStage({ stage_no: next, duties: duties.trim(), hours: hours.trim(), starts_on: starts || null, status: 'planned' })) { setAdding(false); setDuties(''); setHours(''); setStarts(''); } }}>Add stage</button>
            <button type="button" className={btn} onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      )}
    </>
  );
}

function ContactForm({ busy, onAdd }: { busy: boolean; onAdd: (i: Pick<ClaimContact, 'name' | 'role' | 'org' | 'phone' | 'email'>) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ name: '', role: '', org: '', phone: '', email: '' });
  if (!open) return <button type="button" className={`${btn} self-start`} onClick={() => setOpen(true)}>+ Add a contact</button>;
  const f = (k: keyof typeof v, label: string, ph = '') => <Field label={label} htmlFor={`ct-${k}`} optional={k !== 'name'}><input id={`ct-${k}`} className={inputClass} value={v[k]} placeholder={ph} onChange={e => setV({ ...v, [k]: e.target.value })} /></Field>;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-[#FAFAF9] rounded-lg p-3.5">
      {f('name', 'Name')}{f('role', 'Role', 'GP, physio, case manager')}{f('org', 'Practice or company')}{f('phone', 'Phone')}{f('email', 'Email')}
      <div className="col-span-2 sm:col-span-3 flex gap-2">
        <button type="button" disabled={busy || !v.name.trim()} className={btnPri} onClick={async () => { if (await onAdd({ name: v.name.trim(), role: v.role.trim(), org: v.org.trim(), phone: v.phone.trim(), email: v.email.trim() })) { setOpen(false); setV({ name: '', role: '', org: '', phone: '', email: '' }); } }}>Save contact</button>
        <button type="button" className={btn} onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}

function LogForm({ busy, onAdd }: { busy: boolean; onAdd: (i: { kind: LogKind; with_whom: string; what: string; happened_at: string }, f: File | null) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<LogKind>('call');
  const [who, setWho] = useState('');
  const [what, setWhat] = useState('');
  const [day, setDay] = useState(brisbaneDay(new Date()));
  const [file, setFile] = useState<File | null>(null);
  if (!open) return <button type="button" className={`${btn} self-start`} onClick={() => setOpen(true)}>+ Record correspondence</button>;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-[#FAFAF9] rounded-lg p-3.5">
      <Field label="Kind" htmlFor="lg-k"><select id="lg-k" className={inputClass} value={kind} onChange={e => setKind(e.target.value as LogKind)}>{LOG_KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}</select></Field>
      <Field label="With" htmlFor="lg-w" hint="Doctor, insurer, worker..."><input id="lg-w" className={inputClass} value={who} onChange={e => setWho(e.target.value)} /></Field>
      <Field label="Date" htmlFor="lg-d"><input id="lg-d" type="date" className={inputClass} value={day} onChange={e => setDay(e.target.value)} /></Field>
      <div className="col-span-2 sm:col-span-3"><Field label="What was said or sent" htmlFor="lg-t"><textarea id="lg-t" rows={3} className={inputClass} value={what} onChange={e => setWhat(e.target.value)} /></Field></div>
      <div className="col-span-2 sm:col-span-3"><Field label="Attach the email, letter or form" htmlFor="lg-f" optional><input id="lg-f" type="file" onChange={e => setFile(e.target.files?.[0] ?? null)} /></Field></div>
      <div className="col-span-2 sm:col-span-3 flex gap-2">
        <button type="button" disabled={busy || !who.trim() || !day || (!what.trim() && !file)} className={btnPri} onClick={async () => { if (await onAdd({ kind, with_whom: who.trim(), what: what.trim(), happened_at: atNoon(day) }, file)) { setOpen(false); setWho(''); setWhat(''); setFile(null); } }}>Save entry</button>
        <button type="button" className={btn} onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}

function DocForm({ busy, onAdd }: { busy: boolean; onAdd: (c: DocCategory, t: string, f: File) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [cat, setCat] = useState<DocCategory>('claim_forms');
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  if (!open) return <button type="button" className={`${btn} self-start`} onClick={() => setOpen(true)}>+ Add a document</button>;
  return (
    <div className="grid grid-cols-2 gap-3 bg-[#FAFAF9] rounded-lg p-3.5">
      <Field label="Filed under" htmlFor="dc-c"><select id="dc-c" className={inputClass} value={cat} onChange={e => setCat(e.target.value as DocCategory)}>{DOC_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></Field>
      <Field label="Title" htmlFor="dc-t"><input id="dc-t" className={inputClass} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Claim form" /></Field>
      <div className="col-span-2"><Field label="File" htmlFor="dc-f"><input id="dc-f" type="file" onChange={e => setFile(e.target.files?.[0] ?? null)} /></Field></div>
      <div className="col-span-2 flex gap-2">
        <button type="button" disabled={busy || !file || !title.trim()} className={btnPri} onClick={async () => { if (file && await onAdd(cat, title.trim(), file)) { setOpen(false); setTitle(''); setFile(null); } }}>Save document</button>
        <button type="button" className={btn} onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}
