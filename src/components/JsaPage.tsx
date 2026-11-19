import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { NameInput } from './NameInput.tsx';
import type { WhsUser } from '../services/auth.ts';
import { createJsa, deleteJsa, listJsas, saveJsa } from '../services/jsa.ts';
import { useSiteScope } from '../hooks/useSiteScope.tsx';
import { isOfficeAccess } from '../utils/access.ts';
import { brisbaneDay, formatDay } from '../utils/dates.ts';
import { inScope } from '../utils/siteScope.ts';
import { EMPTY_JSA, highAfter, jsaPill, jsaProblems, needsSwms, type Jsa, type JsaContent } from '../utils/jsa.ts';
import { copyOf, takeJsaStart, type JsaStart } from '../utils/jsaDraft.ts';
import { emptyStep, HIGH_RISK_AREAS, stepCode, stepLevel, type SwmsStep } from '../utils/swms.ts';
import { LEVELS, type RiskLevel, riskLevel } from '../utils/risks.ts';
import { COMPANY } from '../utils/swms.ts';
import { ErrorNote, Field, inputClass } from './Form.tsx';
import { Pill } from './Pill.tsx';
import { RatingGrid } from './RatingGrid.tsx';
import { askConfirm } from './ConfirmHost.tsx';

const th = 'px-2 py-3 font-semibold border-b border-[#EEEBE6] text-left';
const td = 'px-2 py-3 border-b border-line-soft align-top';
const btn = 'min-h-10 px-3.5 rounded-lg border border-[#D6D2CC] bg-white text-sm font-semibold cursor-pointer disabled:opacity-60';
const primary = 'min-h-10 px-4 rounded-lg border-0 bg-finlay hover:bg-finlay-dark text-white text-sm font-bold cursor-pointer disabled:opacity-60';
const card = 'bg-white border border-line rounded-xl px-4.5 py-4';
const textareaClass = `${inputClass} min-h-[72px] py-2`;
const MATRIX_BG: Record<RiskLevel, string> = { low: '#99CC00', medium: '#FFFF00', high: '#FFB000', extreme: '#FF0000' };

const contentOf = (j: Jsa): JsaContent => ({ title: j.title, site_id: j.site_id, location: j.location, done_on: j.done_on, supervisor_name: j.supervisor_name, crew: j.crew, work_covered: j.work_covered, steps: j.steps, high_risk_areas: j.high_risk_areas, ppe: j.ppe, permits: j.permits, emergency: j.emergency });

/** Job Safety Analyses: a quick, job-specific risk assessment. High risk construction work needs a SWMS instead. */
export function JsaPage({ user }: { user: WhsUser }) {
  const office = isOfficeAccess(user.access);
  const officer = user.access === 'admin' || user.access === 'whs_officer';
  const { site, sites } = useSiteScope();
  const [all, setAll] = useState<Jsa[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [start, setStart] = useState<JsaStart | null>(takeJsaStart);
  const [open, setOpen] = useState<Jsa | 'new' | null>(start ? 'new' : null);
  const [q, setQ] = useState('');

  const load = () => listJsas().then(r => { setAll(r.data ?? []); setError(r.error ?? null); setLoaded(true); });
  useEffect(() => { void load(); }, []);
  const shown = useMemo(() => all.filter(j => inScope(site, j)).filter(j => !q.trim() || `${j.ref} ${j.title} ${j.supervisor_name} ${j.crew} ${j.location}`.toLowerCase().includes(q.trim().toLowerCase())), [all, site, q]);

  if (open) return <JsaEditor key={open === 'new' ? 'new' : open.id} jsa={open === 'new' ? null : open} start={open === 'new' ? start : null} onCopy={x => { setStart(x); setOpen('new'); }} sites={sites} officer={officer} office={office} onClose={() => { setOpen(null); void load(); }} />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="m-0 text-2xl font-bold">JSA</h1>
          <p className="mt-1.5 mb-0 text-muted text-[15px] max-w-2xl">Job Safety Analysis: the steps of a job, what could hurt someone and how it is controlled. It is not a SWMS. <a href="#/m/risk/guide" className="font-semibold">Which document do I need?</a></p>
        </div>
        {office && <button type="button" className={primary} onClick={() => { setStart(null); setOpen('new'); }}>+ New JSA</button>}
      </div>
      <ErrorNote message={error} />
      <input type="search" aria-label="Search JSAs" placeholder="Search JSAs, supervisors, crew" value={q} onChange={e => setQ(e.target.value)} className="min-h-10 w-full sm:w-72 rounded-lg border border-[#D6D2CC] bg-white px-3 text-[13px]" />
      {!loaded ? <p className="text-muted">Loading…</p> : shown.length === 0 ? (
        <div className="bg-white border border-line rounded-xl p-6 text-sm text-muted">{all.length === 0 ? <>No JSAs yet.{office ? ' Use “+ New JSA” to write the first one.' : ''}</> : 'Nothing matches.'}</div>
      ) : (
        <div className="bg-white border border-line rounded-xl overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead><tr><th className={`${th} pl-4`}>Ref</th><th className={th}>Job</th><th className={th}>Date</th><th className={th}>Supervisor</th><th className={`${th} pr-4`}>Status</th></tr></thead>
            <tbody>
              {shown.map(j => {
                const p = jsaPill(j);
                return (
                  <tr key={j.id} onClick={() => setOpen(j)} className="cursor-pointer hover:bg-[#FAF8F6]">
                    <td className={`${td} pl-4 font-semibold whitespace-nowrap`}>{j.ref}</td>
                    <td className={td}><span className="font-semibold">{j.title}</span><span className="block text-xs text-muted">{sites.find(x => x.id === j.site_id)?.name ?? 'No site'}{j.location ? ` · ${j.location}` : ''}</span></td>
                    <td className={`${td} whitespace-nowrap`}>{j.done_on ? formatDay(j.done_on) : <span className="text-muted">—</span>}</td>
                    <td className={td}>{j.supervisor_name || <span className="text-muted">—</span>}</td>
                    <td className={`${td} pr-4`}><Pill tone={p.tone}>{p.label}</Pill>{needsSwms(j) && <span className="block mt-1"><Pill tone="red">Needs a SWMS</Pill></span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Draws attention to a detail the crew still has to fill in. */
function Flag({ on, children }: { on: boolean; children: ReactNode }) {
  return on ? <div className="rounded-xl bg-[#FFF6DD] outline-2 outline outline-[#E0A526] p-2 -m-2">{children}</div> : <>{children}</>;
}

function Sec({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className={`${card} flex flex-col gap-3`}>
      <div><h2 className="m-0 text-base font-bold">{title}</h2>{hint && <p className="m-0 mt-0.5 text-xs text-muted">{hint}</p>}</div>
      {children}
    </section>
  );
}

function JsaEditor({ jsa, start, onCopy, sites, officer, office, onClose }: { jsa: Jsa | null; start: JsaStart | null; onCopy: (s: JsaStart) => void; sites: { id: string; name: string }[]; officer: boolean; office: boolean; onClose: () => void }) {
  const [saved, setSaved] = useState<Jsa | null>(jsa);
  const [d, setD] = useState<JsaContent>(jsa ? contentOf(jsa) : start ? { ...start.content, done_on: start.content.done_on ?? brisbaneDay(new Date()) } : { ...EMPTY_JSA, done_on: brisbaneDay(new Date()), steps: [emptyStep()] });
  const guide = !saved && start; // a draft made from an SWI or another JSA: point out what the crew still fills in
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const done = saved?.status === 'completed';
  const editable = office && !done;
  const patch = (p: Partial<JsaContent>) => setD(prev => ({ ...prev, ...p }));
  const setStep = (i: number, p: Partial<SwmsStep>) => patch({ steps: d.steps.map((s, j) => (j === i ? { ...s, ...p } : s)) });
  const move = (i: number, by: -1 | 1) => { const a = [...d.steps]; [a[i], a[i + by]] = [a[i + by], a[i]]; patch({ steps: a }); };
  const swms = needsSwms(d);
  const hl = !!start && editable; // highlight what the crew still fills in on a draft made from an SWI or a copy

  async function save(then?: 'complete' | 'reopen') {
    if (!d.title.trim()) return setError('Give the JSA a title.');
    setBusy(true);
    setError(null);
    const r = saved ? await saveJsa(saved.id, { ...d, ...(then === 'complete' ? { status: 'completed' as const } : then === 'reopen' ? { status: 'draft' as const } : {}) }) : await createJsa(d);
    setBusy(false);
    if (r.error || !r.data) return setError(r.error ?? 'It could not be saved.');
    setSaved(r.data);
    setD(contentOf(r.data));
  }

  async function complete() {
    const p = jsaProblems(d);
    setProblems(p);
    if (p.length) return;
    if (swms && !(await askConfirm({ title: 'This looks like high risk construction work', body: 'A JSA does not replace a SWMS for work like this. Mark the JSA completed anyway?', confirmLabel: 'Mark completed' }))) return;
    await save('complete');
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="print:hidden flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={btn} onClick={onClose}>← All JSAs</button>
          {saved && <><span className="font-bold">{saved.ref}</span><Pill tone={jsaPill(saved).tone}>{jsaPill(saved).label}</Pill></>}
          <div className="ml-auto flex flex-wrap gap-2">
            {saved && <button type="button" className={btn} onClick={() => window.print()}>Print</button>}
            {saved && office && <button type="button" className={btn} onClick={() => onCopy({ content: copyOf(contentOf(saved)), from: saved.ref, kind: 'copy', notes: [] })}>Copy this JSA</button>}
            {saved && done && office && <button type="button" className={btn} disabled={busy} onClick={() => void save('reopen')}>Reopen to edit</button>}
            {saved && officer && <button type="button" className={btn} onClick={async () => { if (await askConfirm({ title: `Delete ${saved.ref}?`, body: 'This removes the JSA for good.', confirmLabel: 'Delete' })) { const r = await deleteJsa(saved.id); if (r.error) setError(r.error); else onClose(); } }}>Delete</button>}
          </div>
        </div>
        <h1 className="m-0 text-2xl font-bold">{saved ? saved.title : 'New JSA'}</h1>
        <ErrorNote message={error} />

        {guide && (
          <div className="rounded-xl border border-[#9CC0E0] bg-[#EAF2FA] px-4 py-3.5 text-sm text-[#12334F] flex flex-col gap-2">
            <div><b>{start.kind === 'swi' ? `Draft made from ${start.from}` : `Copy of ${start.from}`}</b></div>
            <p className="m-0">{start.kind === 'swi'
              ? 'The steps, hazards, controls and PPE are filled in from the SWI. Read through them, then fill in the highlighted details for this job: the site, supervisor, crew, emergency arrangements and a risk rating for each step.'
              : 'The steps are kept from the original. Enter the date, supervisor and crew for this job and check the steps still suit it.'}</p>
            {start.notes.length > 0 && <ul className="m-0 pl-5 text-[13px]">{start.notes.map(n => <li key={n}>{n}</li>)}</ul>}
          </div>
        )}

        {swms && (
          <div role="alert" className="rounded-xl border-2 border-[#E0A526] bg-[#FFF6DD] px-4 py-3 text-sm text-[#5A3A00]">
            <b>This needs a SWMS.</b> You ticked high risk construction work. A JSA does not replace a SWMS for that work: write or use a SWMS (<a href="#/m/risk/swms" className="font-semibold">SWMS list</a>). <a href="#/m/risk/guide" className="font-semibold">Why?</a>
          </div>
        )}

        <Sec title="The job">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2"><Field label="Job or task" htmlFor="j-title"><input id="j-title" disabled={!editable} className={inputClass} value={d.title} onChange={e => patch({ title: e.target.value })} placeholder="e.g. Replace screen mesh on the Powerscreen" /></Field></div>
            <Flag on={hl && !d.site_id}><Field label="Site" htmlFor="j-site"><select id="j-site" disabled={!editable} className={inputClass} value={d.site_id ?? ''} onChange={e => patch({ site_id: e.target.value || null })}><option value="">No site</option>{sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field></Flag>
            <Flag on={hl && !d.location.trim()}><Field label="Location or address" optional htmlFor="j-loc"><input id="j-loc" disabled={!editable} className={inputClass} value={d.location} onChange={e => patch({ location: e.target.value })} /></Field></Flag>
            <Field label="Date of the job" htmlFor="j-date"><input id="j-date" type="date" disabled={!editable} className={inputClass} value={d.done_on ?? ''} onChange={e => patch({ done_on: e.target.value || null })} /></Field>
            <Flag on={hl && !d.supervisor_name.trim()}><Field label="Supervisor" htmlFor="j-sup">{editable ? <NameInput id="j-sup" value={d.supervisor_name} onChange={t => patch({ supervisor_name: t })} /> : <input id="j-sup" disabled className={inputClass} value={d.supervisor_name} readOnly />}</Field></Flag>
            <div className="sm:col-span-2"><Flag on={hl && !d.crew.trim()}><Field label="Crew" hint="Everyone doing the job, separated by commas. Start typing to pick from the people on file." htmlFor="j-crew">{editable ? <NameInput id="j-crew" multi value={d.crew} onChange={t => patch({ crew: t })} /> : <input id="j-crew" disabled className={inputClass} value={d.crew} readOnly />}</Field></Flag></div>
            <div className="sm:col-span-2"><Field label="What the work covers" optional htmlFor="j-work"><textarea id="j-work" rows={2} disabled={!editable} className={textareaClass} value={d.work_covered} onChange={e => patch({ work_covered: e.target.value })} /></Field></div>
          </div>
        </Sec>

        <Sec title="Is any of this high risk construction work?" hint="Tick anything that applies. If so, the job needs a SWMS, not just a JSA.">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1">
            {HIGH_RISK_AREAS.map(a => <label key={a} className="flex items-start gap-2 text-sm min-h-8 cursor-pointer"><input type="checkbox" disabled={!editable} className="mt-1 w-4 h-4" checked={d.high_risk_areas.includes(a)} onChange={e => patch({ high_risk_areas: e.target.checked ? [...d.high_risk_areas, a] : d.high_risk_areas.filter(x => x !== a) })} />{a}</label>)}
          </div>
        </Sec>

        <section className="flex flex-col gap-3">
          <div><h2 className="m-0 text-base font-bold">Steps</h2><p className="m-0 mt-0.5 text-xs text-muted">Break the job into steps. Ratings use the Finlay matrix; High or Extreme after controls means the job should not start until the risk is lower or the manager approves.</p></div>
          {d.steps.map((s, i) => {
            const b = stepLevel(s, 'before'); const a = stepLevel(s, 'after');
            return (
              <div key={i} className={`${card} flex flex-col gap-3`}>
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-full bg-ink text-white text-sm font-bold grid place-items-center">{i + 1}</span>
                  {!editable && <span className="flex flex-wrap gap-2">{b && <Pill tone={LEVELS[b].tone}>Before: {stepCode(s, 'before')}</Pill>}{a && <Pill tone={LEVELS[a].tone}>After: {stepCode(s, 'after')}</Pill>}</span>}
                  {editable && <div className="ml-auto flex gap-1.5">
                    <button type="button" className={btn} aria-label={`Move step ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                    <button type="button" className={btn} aria-label={`Move step ${i + 1} down`} disabled={i === d.steps.length - 1} onClick={() => move(i, 1)}>↓</button>
                    <button type="button" className={btn} onClick={() => patch({ steps: d.steps.filter((_, j) => j !== i) })}>Remove</button>
                  </div>}
                </div>
                <Field label="What is done" htmlFor={`js-${i}-s`}><textarea id={`js-${i}-s`} rows={Math.min(8, Math.max(1, s.step.split('\n').length))} disabled={!editable} className={`${textareaClass} min-h-12`} value={s.step} onChange={e => setStep(i, { step: e.target.value })} /></Field>
                <Field label="Hazards" hint="What could hurt someone in this step" htmlFor={`js-${i}-h`}><textarea id={`js-${i}-h`} rows={2} disabled={!editable} className={textareaClass} value={s.hazard} onChange={e => setStep(i, { hazard: e.target.value })} /></Field>
                {editable && <Flag on={hl && (!s.before || !s.after)}><div className="flex flex-wrap gap-6">
                  <RatingGrid label="Risk before controls" likelihood={s.before?.[0] ?? null} consequence={s.before?.[1] ?? null} onChange={(l, c) => setStep(i, { before: [l, c] })} />
                  <RatingGrid label="Risk after controls" likelihood={s.after?.[0] ?? null} consequence={s.after?.[1] ?? null} onChange={(l, c) => setStep(i, { after: [l, c] })} />
                </div></Flag>}
                <Field label="Controls" hint="One per line, best control first" htmlFor={`js-${i}-c`}><textarea id={`js-${i}-c`} rows={3} disabled={!editable} className={textareaClass} value={s.controls} onChange={e => setStep(i, { controls: e.target.value })} /></Field>
                <Field label="Action by" optional htmlFor={`js-${i}-w`}><input id={`js-${i}-w`} disabled={!editable} className={inputClass} value={s.who} onChange={e => setStep(i, { who: e.target.value })} placeholder="Technician" /></Field>
              </div>
            );
          })}
          {editable && <div><button type="button" className={btn} onClick={() => patch({ steps: [...d.steps, emptyStep()] })}>+ Add a step</button></div>}
          {highAfter(d) > 0 && <p className="m-0 text-sm font-semibold text-[#9B1218]">{highAfter(d)} {highAfter(d) === 1 ? 'step is' : 'steps are'} still High or Extreme after controls.</p>}
        </section>

        <Sec title="PPE, permits and emergency">
          <div className="grid sm:grid-cols-3 gap-3">
            <Field label="PPE and safety equipment" optional htmlFor="j-ppe"><textarea id="j-ppe" rows={3} disabled={!editable} className={textareaClass} value={d.ppe} onChange={e => patch({ ppe: e.target.value })} /></Field>
            <Field label="Permits needed" optional htmlFor="j-perm"><textarea id="j-perm" rows={3} disabled={!editable} className={textareaClass} value={d.permits} onChange={e => patch({ permits: e.target.value })} /></Field>
            <Flag on={hl && !d.emergency.trim()}><Field label="Emergency arrangements" optional htmlFor="j-em"><textarea id="j-em" rows={3} disabled={!editable} className={textareaClass} value={d.emergency} onChange={e => patch({ emergency: e.target.value })} placeholder="Nearest first aid, muster point, who to call" /></Field></Flag>
          </div>
        </Sec>

        {problems.length > 0 && <div role="alert" className="rounded-xl border border-[#F1C0C2] bg-[#FBE3E4] px-4 py-3 text-sm text-[#7A1015]"><b>Still to do before it can be marked completed:</b><ul className="m-0 mt-1 pl-5">{problems.map(p => <li key={p}>{p}</li>)}</ul></div>}

        {editable && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={primary} disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : saved ? 'Save changes' : 'Save JSA'}</button>
            {saved && <button type="button" className={btn} disabled={busy} onClick={() => void complete()}>Mark completed</button>}
          </div>
        )}
        {done && saved && <p className="m-0 text-xs text-muted">Completed {saved.completed_at ? formatDay(brisbaneDay(saved.completed_at)) : ''}{saved.completed_by_name ? ` by ${saved.completed_by_name}` : ''}. Reopen it to change anything.</p>}
      </div>
      {saved && <JsaPrint jsa={saved} siteName={sites.find(s => s.id === saved.site_id)?.name ?? ''} />}
    </div>
  );
}

const cell = 'border border-[#2A6FA8] px-2 py-1 align-top';
const head = `${cell} bg-[#D9E5F3] font-bold`;
const lines = (t: string) => t.split('\n').map(x => x.trim()).filter(Boolean);

/** The printed JSA: the steps, then a sign-on table for the crew to sign on paper. */
function JsaPrint({ jsa, siteName }: { jsa: Jsa; siteName: string }) {
  const crew = jsa.crew.split(/[,;]/).map(x => x.trim()).filter(Boolean);
  const rows = Math.max(crew.length, 6);
  const code = (v: [number, number] | null) => (v ? <span style={{ background: MATRIX_BG[riskLevel(v[0], v[1]) as RiskLevel] }} className="px-1.5 font-bold">{stepCode({ ...emptyStep(), before: v }, 'before')}</span> : null);
  return (
    <div className="hidden print:block text-[11px] leading-snug text-black">
      <style>{'@page { size: A4 landscape; margin: 10mm; }'}</style>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[24px] font-medium font-sans">Job Safety Analysis (JSA)</div>
        <img src="/finlay-logo.jpg" alt="Finlay" className="h-10" />
      </div>
      <table className="w-full border-collapse mb-2"><tbody>
        <tr><td className={head}>JSA No:</td><td className={cell}>{jsa.ref}</td><td className={head}>Date:</td><td className={cell}>{jsa.done_on ? formatDay(jsa.done_on) : ''}</td><td className={head}>Company:</td><td className={cell}>{COMPANY.name}</td></tr>
        <tr><td className={head}>Job / task:</td><td className={cell} colSpan={3}>{jsa.title}</td><td className={head}>Site / location:</td><td className={cell}>{[siteName, jsa.location].filter(Boolean).join(', ')}</td></tr>
        <tr><td className={head}>Supervisor:</td><td className={cell} colSpan={3}>{jsa.supervisor_name}</td><td className={head}>Crew:</td><td className={cell}>{crew.join(', ')}</td></tr>
        {jsa.work_covered && <tr><td className={head}>Work covered:</td><td className={cell} colSpan={5}>{jsa.work_covered}</td></tr>}
      </tbody></table>
      <table className="w-full border-collapse mb-2">
        <thead><tr><th className={head}>#</th><th className={head}>What is done</th><th className={head}>Hazards</th><th className={head}>Before</th><th className={head}>Controls</th><th className={head}>After</th><th className={head}>Action by</th></tr></thead>
        <tbody>
          {jsa.steps.map((s, i) => (
            <tr key={i}><td className={cell}>{i + 1}</td><td className={`${cell} whitespace-pre-line`}>{s.step}</td><td className={`${cell} whitespace-pre-line`}>{s.hazard}</td><td className={cell}>{code(s.before)}</td><td className={cell}><ul className="m-0 pl-4">{lines(s.controls).map((l, k) => <li key={k}>{l}</li>)}</ul></td><td className={cell}>{code(s.after)}</td><td className={cell}>{s.who}</td></tr>
          ))}
        </tbody>
      </table>
      <table className="w-full border-collapse mb-2"><tbody>
        <tr><td className={head}>PPE</td><td className={head}>Permits</td><td className={head}>Emergency</td></tr>
        <tr><td className={cell}>{jsa.ppe}</td><td className={cell}>{jsa.permits}</td><td className={cell}>{jsa.emergency}</td></tr>
      </tbody></table>
      <div className="mb-1 font-bold">I have read and understood this JSA and will follow it.</div>
      <table className="w-full border-collapse"><thead><tr><th className={head}>Name</th><th className={head}>Signature</th><th className={head}>Date</th></tr></thead>
        <tbody>{Array.from({ length: rows }, (_, i) => <tr key={i}><td className={`${cell} h-8`}>{crew[i] ?? ''}</td><td className={cell} /><td className={cell} /></tr>)}</tbody>
      </table>
    </div>
  );
}
