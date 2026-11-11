import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { createAction, updateIncident } from '../services/records.ts';
import { addEvidence, addTimeline, listEvidence, listStatements, listTimeline, removeEvidence, removeStatement, removeTimeline, requestStatement, updateStatement } from '../services/incidentFile.ts';
import { openFile } from '../services/files.ts';
import type { WhsUser } from '../services/auth.ts';
import { useLookups } from '../hooks/useLookups.ts';
import { formatDay, formatWhen, fromInputs, nowForInputs } from '../utils/dates.ts';
import {
  CONTRIBUTING, CONTROL_LEVELS, canWaiveInvestigation, EVIDENCE_KINDS, PARTS, STATEMENT_STATUS, investigationProgress, needsFullInvestigation, partsDone, requiredParts, togglePart,
  type ControlLevel, type Evidence, type EvidenceKind, type IncidentPerson, type PartId, type Statement, type TimelineEntry,
} from '../utils/incidentFile.ts';
import type { Incident, WhsAction } from '../utils/records.ts';
import { ErrorNote, Field, inputClass } from './Form.tsx';
import { Pill } from './Pill.tsx';

import { askConfirm } from './ConfirmHost.tsx';
const card = 'bg-white border border-line rounded-xl';
const btn = 'min-h-10 px-3.5 rounded-lg border border-[#D6D2CC] bg-white text-[13px] font-semibold cursor-pointer disabled:opacity-60';
const btnPri = 'min-h-10 px-4 rounded-lg border-0 bg-ink text-white text-[13px] font-semibold cursor-pointer disabled:opacity-60';
const linkBtn = 'bg-transparent border-0 p-0 text-[13px] font-semibold text-ink underline cursor-pointer min-h-8';

function Part({ id, n, incident, canEdit, busy, onToggle, count, children }: {
  id: PartId; n: number; incident: Incident; canEdit: boolean; busy: boolean; onToggle: () => void; count?: string; children: ReactNode;
}) {
  const meta = PARTS.find(p => p.id === id)!;
  const done = partsDone(incident).includes(id);
  const optional = !requiredParts(incident).includes(id);
  return (
    <section className={`${card} overflow-hidden`} aria-label={meta.label}>
      <div className="flex flex-wrap items-center gap-2.5 px-4.5 py-3.5 border-b border-[#EEEBE6]">
        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-[13px] font-bold shrink-0 ${done ? 'bg-[#1E6B3A] text-white' : 'bg-[#ECECEC] text-[#4A4A50]'}`}>{done ? '✓' : n}</span>
        <div className="min-w-0 flex-1">
          <h3 className="m-0 text-base font-bold">{meta.label} {optional && <span className="text-xs font-medium text-muted">optional for this incident</span>}</h3>
          <p className="m-0 text-[13px] text-muted">{meta.sub}</p>
        </div>
        {count && <span className="text-[13px] text-muted">{count}</span>}
        {canEdit && (
          <button type="button" disabled={busy} onClick={onToggle} aria-pressed={done}
            className={`min-h-9 px-3 rounded-lg text-[13px] font-semibold cursor-pointer border ${done ? 'bg-[#E3F4E6] border-[#BFE2C6] text-[#1F6B2E]' : 'bg-white border-[#D6D2CC]'}`}>
            {done ? 'Done ✓' : 'Mark as done'}
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

/** The six-part investigation. Every part saves as you go, and every file stays on the incident. */
export function InvestigationTab({ incident, user, actions, people, canEdit, officer, reload }: {
  incident: Incident; user: WhsUser; actions: WhsAction[]; people: IncidentPerson[]; canEdit: boolean; officer: boolean; reload: () => Promise<void> | void;
}) {
  const { people: staff } = useLookups();
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [statements, setStatements] = useState<Statement[]>([]);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    const [e, s, t] = await Promise.all([listEvidence(incident.id), listStatements(incident.id), listTimeline(incident.id)]);
    setError(e.error ?? s.error ?? t.error ?? null);
    setEvidence(e.data ?? []);
    setStatements(s.data ?? []);
    setTimeline(t.data ?? []);
  }, [incident.id]);
  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function run(fn: () => Promise<{ error?: string }>) {
    setBusy(true);
    setError(null);
    const res = await fn();
    setBusy(false);
    if (res.error) setError(res.error);
    else {
      await loadAll();
      await reload();
    }
    return !res.error;
  }
  const togglePartFor = (id: PartId) => run(() => updateIncident(incident.id, { parts_done: togglePart(incident, id) }));

  // Header: lead and due
  const [lead, setLead] = useState(incident.investigation_lead ?? '');
  const [due, setDue] = useState(incident.investigation_due ?? '');
  // Evidence draft
  const [eKind, setEKind] = useState<EvidenceKind>('photo');
  const [eText, setEText] = useState('');
  const [eFile, setEFile] = useState<File | null>(null);
  // Statement draft
  const [sWho, setSWho] = useState('');
  // Timeline draft
  const [tWhen, setTWhen] = useState(() => nowForInputs());
  const [tWhat, setTWhat] = useState('');
  // Why
  const [whys, setWhys] = useState<string[]>(incident.why_chain?.length ? incident.why_chain : ['', '', '']);
  const [factors, setFactors] = useState<string[]>(incident.factors ?? []);
  const [immediate, setImmediate] = useState(incident.immediate_cause ?? '');
  const [root, setRoot] = useState(incident.root_cause ?? '');
  // Findings
  const [findings, setFindings] = useState(incident.findings ?? '');
  const [fixTitle, setFixTitle] = useState('');
  const [fixLevel, setFixLevel] = useState<ControlLevel>('');
  const [fixOwner, setFixOwner] = useState('');
  const [fixDue, setFixDue] = useState('');
  // Sign-off
  const [briefed, setBriefed] = useState(incident.crew_briefed_on ?? '');

  const waived = Boolean(incident.investigation_waived);
  const [waiving, setWaiving] = useState(false);
  const [reason, setReason] = useState('');
  const progress = investigationProgress(incident);
  const full = needsFullInvestigation(incident);
  const myActions = actions;
  const signedCount = statements.filter(s => s.status === 'signed').length;

  return (
    <div className="flex flex-col gap-4">
      <ErrorNote message={error} />

      {waived && (
        <section className={`${card} px-4.5 py-4 flex flex-wrap items-center gap-3`}>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">Investigation not required</div>
            <div className="text-sm text-muted">{incident.investigation_waived_reason}</div>
          </div>
          {canEdit && <button type="button" disabled={busy} className={btn} onClick={() => run(() => updateIncident(incident.id, { investigation_waived: false, investigation_waived_reason: '' }))}>Investigate it after all</button>}
        </section>
      )}
      {!waived && canEdit && canWaiveInvestigation(incident) && (
        <div className="text-sm">
          {!waiving ? <button type="button" className="bg-transparent border-0 p-0 text-[13px] font-semibold underline cursor-pointer min-h-8" onClick={() => setWaiving(true)}>This incident doesn&apos;t need an investigation</button> : (
            <section className={`${card} px-4.5 py-4 flex flex-wrap items-end gap-3`}>
              <div className="min-w-[260px] flex-1"><Field label="Why isn't an investigation needed?" htmlFor="inv-waive" hint="This is kept on the incident.">
                <input id="inv-waive" className={inputClass} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Minor cut, first aid only, cause obvious and already fixed" />
              </Field></div>
              <button type="button" disabled={busy || !reason.trim()} className={btnPri} onClick={async () => { if (await run(() => updateIncident(incident.id, { investigation_waived: true, investigation_waived_reason: reason.trim() }))) setWaiving(false); }}>Not required</button>
              <button type="button" className={btn} onClick={() => setWaiving(false)}>Cancel</button>
            </section>
          )}
        </div>
      )}

      {!waived && <section className={`${card} px-4.5 py-4 flex flex-wrap gap-4 items-end`}>
        <div className="min-w-[220px] flex-1">
          <div className="text-sm font-semibold">Investigation <span className="font-normal text-muted">· {progress.done} of {progress.total} parts done{full ? '' : ' (lighter investigation for this kind of incident)'}</span></div>
          <div className="h-2 rounded bg-[#ECE8E2] mt-2 overflow-hidden"><div className="h-full bg-finlay" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} /></div>
        </div>
        <Field label="Led by" htmlFor="inv-lead">
          <select id="inv-lead" className={inputClass} disabled={!canEdit} value={lead} onChange={e => setLead(e.target.value)}>
            <option value="">Nobody yet</option>
            {staff.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Due" htmlFor="inv-due"><input id="inv-due" type="date" className={inputClass} disabled={!canEdit} value={due} onChange={e => setDue(e.target.value)} /></Field>
        {canEdit && (lead !== (incident.investigation_lead ?? '') || due !== (incident.investigation_due ?? '')) && (
          <button type="button" disabled={busy} className={btnPri} onClick={() => run(() => updateIncident(incident.id, { investigation_lead: lead || null, investigation_due: due || null }))}>Save</button>
        )}
      </section>}

      {!waived && (<>
      {/* 1 Evidence */}
      <Part id="evidence" n={1} incident={incident} canEdit={canEdit} busy={busy} onToggle={() => togglePartFor('evidence')} count={`${evidence.length} ${evidence.length === 1 ? 'item' : 'items'}`}>
        {evidence.length === 0 && <p className="m-0 px-4.5 py-3 text-sm text-muted">Nothing added yet.</p>}
        {evidence.map(e => (
          <div key={e.id} className="flex items-center gap-3 px-4.5 py-2.5 border-b border-line-soft text-sm">
            <Pill tone="grey">{EVIDENCE_KINDS.find(k => k.id === e.kind)?.label ?? e.kind}</Pill>
            <span className="flex-1 min-w-0">{e.description}<span className="block text-xs text-muted">{e.created_by_name} · {formatWhen(e.created_at)}</span></span>
            {e.file_path && <button type="button" className={linkBtn} onClick={() => openFile('whs-incident-files', e.file_path)}>Open {e.file_name ? `(${e.file_name.slice(-18)})` : ''}</button>}
            {officer && <button type="button" className={linkBtn} onClick={() => askConfirm('Remove this evidence?').then(ok => ok && run(() => removeEvidence(e)))}>Remove</button>}
          </div>
        ))}
        {canEdit && (
          <form className="px-4.5 py-3.5 bg-[#FAFAF9] grid grid-cols-1 sm:grid-cols-[150px_1fr] gap-2.5"
            onSubmit={async ev => { ev.preventDefault(); if (!eText.trim()) return setError('Say what the evidence is.'); if (await run(() => addEvidence(incident.id, eKind, eText.trim(), eFile))) { setEText(''); setEFile(null); } }}>
            <select aria-label="Kind" className={inputClass} value={eKind} onChange={e => setEKind(e.target.value as EvidenceKind)}>{EVIDENCE_KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}</select>
            <input aria-label="What is it" className={inputClass} placeholder="e.g. Scene photos, camera 4 from 7:35 to 7:45" value={eText} onChange={e => setEText(e.target.value)} />
            <span className="text-xs text-muted self-center">File (optional)</span>
            <span className="flex gap-2 flex-wrap items-center">
              <input type="file" aria-label="Evidence file" className="text-sm" onChange={e => setEFile(e.target.files?.[0] ?? null)} />
              <button type="submit" disabled={busy} className={btnPri}>Add evidence</button>
            </span>
          </form>
        )}
      </Part>

      {/* 2 Statements */}
      <Part id="statements" n={2} incident={incident} canEdit={canEdit} busy={busy} onToggle={() => togglePartFor('statements')} count={`${signedCount} of ${statements.length} signed`}>
        {statements.length === 0 && <p className="m-0 px-4.5 py-3 text-sm text-muted">No statements asked for yet.</p>}
        {statements.map(s => {
          const st = STATEMENT_STATUS.find(x => x.id === s.status)!;
          return (
            <div key={s.id} className="px-4.5 py-3 border-b border-line-soft text-sm flex flex-wrap items-center gap-3">
              <span className="min-w-[150px] flex-1"><b>{s.name}</b> <span className="text-muted">{s.role}</span><span className="block text-xs text-muted">Asked {formatDay(s.requested_on)}</span></span>
              <Pill tone={st.tone}>{st.label}</Pill>
              {s.file_path && <button type="button" className={linkBtn} onClick={() => openFile('whs-incident-files', s.file_path)}>Open file</button>}
              {canEdit && (
                <span className="flex items-center gap-2 flex-wrap">
                  <label className="text-[13px] font-semibold underline cursor-pointer min-h-8 flex items-center">
                    {s.file_path ? 'Replace file' : 'Attach file'}
                    <input type="file" className="sr-only" onChange={e => { const f = e.target.files?.[0]; if (f) void run(() => updateStatement(s, {}, f)); }} />
                  </label>
                  {s.status !== 'signed' && <button type="button" className={linkBtn} onClick={() => run(() => updateStatement(s, { status: 'signed' }, null))}>Mark signed</button>}
                  {s.status === 'signed' && <button type="button" className={linkBtn} onClick={() => run(() => updateStatement(s, { status: 'received' }, null))}>Undo signed</button>}
                  {officer && <button type="button" className={linkBtn} onClick={() => askConfirm('Remove this statement?').then(ok => ok && run(() => removeStatement(s)))}>Remove</button>}
                </span>
              )}
            </div>
          );
        })}
        {canEdit && (
          <form className="px-4.5 py-3.5 bg-[#FAFAF9] flex flex-wrap gap-2.5 items-center"
            onSubmit={async ev => {
              ev.preventDefault();
              const p = people.find(x => x.id === sWho);
              if (!p) return setError('Pick someone from the people on this incident. Add them on the People tab first.');
              if (await run(() => requestStatement(incident.id, p.name, p.role === 'injured' ? 'Injured' : p.role === 'witness' ? 'Witness' : p.role === 'first_aider' ? 'First aid' : p.role === 'supervisor' ? 'Supervisor' : 'Involved', p.person_id))) setSWho('');
            }}>
            <select aria-label="Who" className={`${inputClass} max-w-[320px]`} value={sWho} onChange={e => setSWho(e.target.value)}>
              <option value="">Who do you need a statement from?</option>
              {people.filter(p => !statements.some(s => s.name === p.name)).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button type="submit" disabled={busy} className={btnPri}>Ask for a statement</button>
          </form>
        )}
      </Part>

      {/* 3 Timeline */}
      <Part id="timeline" n={3} incident={incident} canEdit={canEdit} busy={busy} onToggle={() => togglePartFor('timeline')} count={`${timeline.length} ${timeline.length === 1 ? 'step' : 'steps'}`}>
        {timeline.length === 0 && <p className="m-0 px-4.5 py-3 text-sm text-muted">No steps yet. Add what happened in order, using the evidence above.</p>}
        <ol className="list-none m-0 px-4.5 py-2">
          {timeline.map(t => (
            <li key={t.id} className="flex gap-3 py-2 text-sm border-b border-line-soft last:border-b-0">
              <span className="w-[130px] shrink-0 font-semibold whitespace-nowrap">{formatWhen(t.happened_at)}</span>
              <span className="flex-1 min-w-0 text-[#3A3A3F]">{t.what}</span>
              {officer && <button type="button" className={linkBtn} onClick={() => run(() => removeTimeline(t.id))}>Remove</button>}
            </li>
          ))}
        </ol>
        {canEdit && (
          <form className="px-4.5 py-3.5 bg-[#FAFAF9] grid grid-cols-2 sm:grid-cols-[140px_110px_1fr_auto] gap-2.5 items-center"
            onSubmit={async ev => { ev.preventDefault(); if (!tWhat.trim()) return setError('Say what happened at that time.'); if (await run(() => addTimeline(incident.id, fromInputs(tWhen.date, tWhen.time), tWhat.trim()))) setTWhat(''); }}>
            <input type="date" aria-label="Date" className={inputClass} value={tWhen.date} onChange={e => setTWhen({ ...tWhen, date: e.target.value })} />
            <input type="time" aria-label="Time" className={inputClass} value={tWhen.time} onChange={e => setTWhen({ ...tWhen, time: e.target.value })} />
            <input aria-label="What happened" className={`${inputClass} col-span-2 sm:col-span-1`} placeholder="What happened at this time" value={tWhat} onChange={e => setTWhat(e.target.value)} />
            <button type="submit" disabled={busy} className={btnPri}>Add step</button>
          </form>
        )}
      </Part>

      {/* 4 Why */}
      <Part id="why" n={4} incident={incident} canEdit={canEdit} busy={busy} onToggle={() => togglePartFor('why')}>
        <div className="px-4.5 py-4 flex flex-col gap-3">
          {whys.map((w, i) => (
            <div key={i} className="flex gap-2.5 items-center">
              <span className="w-14 text-[13px] text-muted">Why {i + 1}</span>
              <input aria-label={`Why ${i + 1}`} className={inputClass} disabled={!canEdit} value={w} onChange={e => setWhys(whys.map((x, j) => (j === i ? e.target.value : x)))} />
            </div>
          ))}
          {canEdit && whys.length < 6 && <button type="button" className="self-start bg-transparent border-0 text-sm font-semibold text-finlay cursor-pointer min-h-10 p-0" onClick={() => setWhys([...whys, ''])}>+ Another why</button>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Immediate cause" htmlFor="inv-imm"><input id="inv-imm" className={inputClass} disabled={!canEdit} value={immediate} onChange={e => setImmediate(e.target.value)} /></Field>
            <Field label="Root cause" htmlFor="inv-root"><input id="inv-root" className={inputClass} disabled={!canEdit} value={root} onChange={e => setRoot(e.target.value)} /></Field>
          </div>
          <fieldset className="border-0 m-0 p-0">
            <legend className="text-sm font-semibold mb-2 p-0">What contributed</legend>
            <div className="flex flex-wrap gap-2">
              {CONTRIBUTING.map(f => {
                const on = factors.includes(f);
                return (
                  <button key={f} type="button" aria-pressed={on} disabled={!canEdit} onClick={() => setFactors(on ? factors.filter(x => x !== f) : [...factors, f])}
                    className={`min-h-9 px-3.5 rounded-full text-[13px] font-semibold cursor-pointer border ${on ? 'bg-ink text-white border-ink' : 'bg-white text-muted border-[#D6D2CC]'}`}>{f}</button>
                );
              })}
            </div>
          </fieldset>
          {canEdit && <button type="button" disabled={busy} className={`${btnPri} self-start`} onClick={() => run(() => updateIncident(incident.id, { why_chain: whys.map(w => w.trim()).filter(Boolean), factors, immediate_cause: immediate.trim(), root_cause: root.trim() }))}>Save</button>}
        </div>
      </Part>

      {/* 5 Findings */}
      <Part id="findings" n={5} incident={incident} canEdit={canEdit} busy={busy} onToggle={() => togglePartFor('findings')} count={`${myActions.length} ${myActions.length === 1 ? 'fix' : 'fixes'}`}>
        <div className="px-4.5 py-4 flex flex-col gap-3">
          <Field label="Findings" htmlFor="inv-find"><textarea id="inv-find" rows={3} className={inputClass} disabled={!canEdit} value={findings} onChange={e => setFindings(e.target.value)} placeholder="What did the investigation find?" /></Field>
          {canEdit && <button type="button" disabled={busy} className={`${btnPri} self-start`} onClick={() => run(() => updateIncident(incident.id, { findings: findings.trim() }))}>Save findings</button>}
        </div>
        {myActions.map(a => (
          <div key={a.id} className="flex items-center gap-3 px-4.5 py-2.5 border-t border-line-soft text-sm">
            <span className={`w-[18px] h-[18px] rounded-[5px] border-2 shrink-0 ${a.status === 'done' ? 'bg-[#1E6B3A] border-[#1E6B3A]' : 'border-[#B8B2AA]'}`} />
            <span className="flex-1 min-w-0">{a.title}{a.control_level && <span className="ml-2 text-xs text-muted">{CONTROL_LEVELS.find(c => c.id === a.control_level)?.label}</span>}</span>
            <span className="text-[13px] text-muted">{a.owner_name || 'No owner'} · {a.due ? formatDay(a.due) : 'No date'}</span>
          </div>
        ))}
        {canEdit && (
          <form className="px-4.5 py-3.5 border-t border-line-soft bg-[#FAFAF9] flex flex-col gap-2.5"
            onSubmit={async ev => {
              ev.preventDefault();
              if (!fixTitle.trim()) return setError('Say what needs to be done.');
              const ok = await run(() => createAction({ title: fixTitle.trim(), source_type: 'incident', source_id: incident.id, source_ref: incident.ref, machine_id: incident.machine_id, unit_no: incident.unit_no, owner_id: fixOwner || null, due: fixDue || null, control_level: fixLevel }));
              if (ok) { setFixTitle(''); setFixLevel(''); setFixOwner(''); setFixDue(''); }
            }}>
            <span className="text-sm font-semibold">Add a fix <span className="font-normal text-muted">strongest control first</span></span>
            <div className="flex flex-wrap gap-2">
              {CONTROL_LEVELS.map(c => (
                <button key={c.id} type="button" aria-pressed={fixLevel === c.id} title={c.sub} onClick={() => setFixLevel(fixLevel === c.id ? '' : c.id)}
                  className={`min-h-9 px-3 rounded-full text-[13px] font-semibold cursor-pointer border ${fixLevel === c.id ? 'bg-ink text-white border-ink' : 'bg-white text-muted border-[#D6D2CC]'}`}>{c.label}</button>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px_150px_auto] gap-2.5">
              <input aria-label="What needs to be done" className={inputClass} placeholder="What needs to be done" value={fixTitle} onChange={e => setFixTitle(e.target.value)} />
              <select aria-label="Owner" className={inputClass} value={fixOwner} onChange={e => setFixOwner(e.target.value)}><option value="">No owner yet</option>{staff.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
              <input type="date" aria-label="Due" className={inputClass} value={fixDue} onChange={e => setFixDue(e.target.value)} />
              <button type="submit" disabled={busy} className={btnPri}>Add fix</button>
            </div>
          </form>
        )}
      </Part>

      {/* 6 Sign-off */}
      <Part id="signoff" n={6} incident={incident} canEdit={canEdit} busy={busy} onToggle={() => togglePartFor('signoff')}>
        <div className="px-4.5 py-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-[13px] font-semibold text-muted mb-1">Investigator signs</div>
            {incident.investigation_signed_at ? <div>{incident.investigation_signed_by_name}<span className="block text-xs text-muted">{formatWhen(incident.investigation_signed_at)}</span></div>
              : canEdit ? <button type="button" disabled={busy} className={btn} onClick={() => run(() => updateIncident(incident.id, { investigation_signed_by_name: user.name, investigation_signed_at: new Date().toISOString() }))}>Sign as {user.name}</button> : <span className="text-muted">Not signed</span>}
          </div>
          <div>
            <div className="text-[13px] font-semibold text-muted mb-1">Reviewed by</div>
            {incident.reviewed_at ? <div>{incident.reviewed_by_name}<span className="block text-xs text-muted">{formatWhen(incident.reviewed_at)}</span></div>
              : canEdit && incident.investigation_signed_by_name !== user.name ? <button type="button" disabled={busy} className={btn} onClick={() => run(() => updateIncident(incident.id, { reviewed_by_name: user.name, reviewed_at: new Date().toISOString() }))}>Review as {user.name}</button>
                : <span className="text-muted">{incident.investigation_signed_by_name === user.name && canEdit ? 'Someone else reviews it' : 'Not reviewed'}</span>}
          </div>
          <div>
            <Field label="Crew briefed on" htmlFor="inv-brief">
              <span className="flex gap-2">
                <input id="inv-brief" type="date" className={inputClass} disabled={!canEdit} value={briefed} onChange={e => setBriefed(e.target.value)} />
                {canEdit && briefed !== (incident.crew_briefed_on ?? '') && <button type="button" disabled={busy} className={btnPri} onClick={() => run(() => updateIncident(incident.id, { crew_briefed_on: briefed || null }))}>Save</button>}
              </span>
            </Field>
          </div>
        </div>
      </Part>
      </>)}
    </div>
  );
}
