import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { WhsUser } from '../services/auth.ts';
import { addControl, addReview, createRisk, deleteRisk, loadRisks, removeControl, removeReview, updateRisk, type RiskInput } from '../services/risks.ts';
import { listHistory } from '../services/records.ts';
import { useSiteScope } from '../hooks/useSiteScope.tsx';
import { isOfficeAccess } from '../utils/access.ts';
import { brisbaneDay, formatDay, formatWhen } from '../utils/dates.ts';
import { inScope } from '../utils/siteScope.ts';
import { CONTROL_LEVELS, type ControlLevel } from '../utils/incidentFile.ts';
import type { HistoryEntry } from '../utils/records.ts';
import { afterLevel, beforeLevel, LEVELS, needsAttention, reviewBy, RISK_CATEGORIES, riskPill, riskIssues, sortRisks, type Risk, type RiskControl, type RiskReview } from '../utils/risks.ts';
import { ErrorNote, Field, inputClass, textareaClass } from './Form.tsx';
import { Pill } from './Pill.tsx';
import { RatingGrid } from './RatingGrid.tsx';
import { SidePanel, rowOpens, useListPanel } from './SidePanel.tsx';
import { askConfirm } from './ConfirmHost.tsx';

const th = 'px-2 py-3 font-semibold border-b border-[#EEEBE6] text-left';
const td = 'px-2 py-3 border-b border-line-soft align-top';
const btn = 'min-h-10 px-3.5 rounded-lg border border-[#D6D2CC] bg-white text-sm font-semibold cursor-pointer hover:text-finlay disabled:opacity-60';
const primary = 'min-h-10 px-4 rounded-lg border-0 bg-finlay hover:bg-finlay-dark text-white text-sm font-bold cursor-pointer disabled:opacity-60';
const chip = (on: boolean) => `min-h-9 px-3 rounded-full text-[13px] font-semibold cursor-pointer border ${on ? 'bg-ink text-white border-ink' : 'bg-white text-ink border-[#D6D2CC]'}`;
const TILE = { red: 'bg-[#FBE3E4] border-[#F1C0C2]', amber: 'bg-[#FFF3D6] border-[#F0DDA6]', grey: 'bg-white border-line' } as const;

type Filter = 'all' | 'attention' | 'extreme' | 'high' | 'retired';
const NEW = 'new';

/** The risk register: every risk rated before and after controls, with its controls, owner and review. */
export function RisksPage({ user }: { user: WhsUser }) {
  const office = isOfficeAccess(user.access);
  const { site, sites } = useSiteScope();
  const [risks, setRisks] = useState<Risk[]>([]);
  const [controls, setControls] = useState<RiskControl[]>([]);
  const [reviews, setReviews] = useState<RiskReview[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [category, setCategory] = useState('');
  const [q, setQ] = useState('');

  const load = () => loadRisks().then(r => {
    setError(r.error ?? null);
    setRisks(r.data?.risks ?? []);
    setControls(r.data?.controls ?? []);
    setReviews(r.data?.reviews ?? []);
    setLoaded(true);
  });
  useEffect(() => { void load(); }, []);

  const ctl = useMemo(() => {
    const m = new Map<string, RiskControl[]>();
    for (const c of controls) m.set(c.risk_id, [...(m.get(c.risk_id) ?? []), c]);
    return m;
  }, [controls]);

  const scoped = risks.filter(r => !r.site_id || inScope(site, { site_id: r.site_id }));
  const active = scoped.filter(r => r.status === 'active');
  const cats = Array.from(new Set(active.map(r => r.category).filter(Boolean))).sort();
  const level = (r: Risk) => afterLevel(r) ?? beforeLevel(r);
  const shown = sortRisks(
    scoped
      .filter(r => (filter === 'retired' ? r.status === 'retired' : r.status === 'active'))
      .filter(r => filter !== 'attention' || needsAttention(r, ctl.get(r.id) ?? []))
      .filter(r => filter !== 'extreme' || level(r) === 'extreme')
      .filter(r => filter !== 'high' || level(r) === 'high')
      .filter(r => !category || r.category === category)
      .filter(r => !q.trim() || `${r.ref} ${r.title} ${r.category} ${r.owner_name} ${r.description}`.toLowerCase().includes(q.trim().toLowerCase()))
      .map(risk => ({ risk })),
  ).map(x => x.risk);

  const { openId, setOpenId, close } = useListPanel(() => shown.map(r => r.id));
  const open = openId && openId !== NEW ? risks.find(r => r.id === openId) ?? null : null;

  const needs = active.filter(r => needsAttention(r, ctl.get(r.id) ?? [])).length;
  const highAfter = active.filter(r => ['high', 'extreme'].includes(afterLevel(r) ?? '')).length;
  const noControls = active.filter(r => (ctl.get(r.id) ?? []).length === 0).length;
  const reviewsDue = active.filter(r => riskIssues(r, ctl.get(r.id) ?? []).some(i => ['overdue', 'due_soon', 'no_review'].includes(i.key))).length;

  const stat = (label: string, value: number, sub: string, tone: keyof typeof TILE) => (
    <div className={`border rounded-xl p-4 ${value ? TILE[tone] : TILE.grey}`}>
      <div className="text-[13px] text-muted">{label}</div>
      <div className="text-[28px] font-bold leading-tight">{value}</div>
      <div className="text-xs text-muted">{sub}</div>
    </div>
  );

  return (
    <div className="flex gap-5 items-start">
      <div className="flex-1 min-w-0 flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h1 className="m-0 text-[26px] font-bold">Risk register</h1>
            <p className="mt-1 mb-0 text-muted text-[15px]">Every risk we manage, the controls for it, and when it is next reviewed.</p>
          </div>
          {office && <button type="button" onClick={() => setOpenId(NEW)} className={`${primary} ml-auto`}>+ New risk</button>}
        </div>
        <ErrorNote message={error} />
        <section aria-label="Summary" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {stat('Needs action', needs, 'no controls, still high, or review overdue', 'red')}
          {stat('Still high or extreme', highAfter, 'after controls', 'red')}
          {stat('No controls recorded', noControls, 'not yet managed', 'amber')}
          {stat('Reviews due', reviewsDue, 'overdue, due in 60 days or never', 'amber')}
        </section>
        <div className="flex flex-wrap items-center gap-2">
          {([['all', 'All'], ['attention', 'Needs action'], ['extreme', 'Extreme'], ['high', 'High'], ['retired', 'Retired']] as [Filter, string][]).map(([id, label]) => (
            <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)} className={chip(filter === id)}>{label}</button>
          ))}
          <select aria-label="Category" value={category} onChange={e => setCategory(e.target.value)} className="min-h-9 rounded-lg border border-[#D6D2CC] bg-white px-2 text-[13px]">
            <option value="">All categories</option>
            {cats.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input type="search" aria-label="Search risks" placeholder="Search risks, owners" value={q} onChange={e => setQ(e.target.value)} className="min-h-9 ml-auto w-56 rounded-lg border border-[#D6D2CC] bg-white px-3 text-[13px]" />
        </div>

        {!loaded ? <p className="text-muted">Loading…</p> : shown.length === 0 ? (
          <div className="bg-white border border-line rounded-xl p-6 text-sm text-muted">
            {risks.length === 0 ? <>No risks on the register yet.{office ? ' Use “+ New risk” to add the first one.' : ''}</> : 'Nothing matches these filters.'}
          </div>
        ) : (
          <div className="bg-white border border-line rounded-xl overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead><tr><th className={`${th} pl-4`}>Ref</th><th className={th}>Risk</th><th className={th}>Before</th><th className={th}>After controls</th><th className={th}>Controls</th><th className={th}>Owner</th><th className={th}>Review by</th><th className={`${th} pr-4`}>Status</th></tr></thead>
              <tbody>
                {shown.map(r => {
                  const cs = ctl.get(r.id) ?? [];
                  const pill = riskPill(r, cs);
                  const al = afterLevel(r);
                  const best = CONTROL_LEVELS.find(l => cs.some(c => c.control_level === l.id));
                  return (
                    <tr key={r.id} onClick={e => rowOpens(e, () => setOpenId(r.id))} className={`cursor-pointer hover:bg-[#FAF8F6] ${openId === r.id ? 'bg-[#FAF8F6]' : ''}`}>
                      <td className={`${td} pl-4 font-semibold whitespace-nowrap`}>{r.ref}</td>
                      <td className={`${td} max-w-[320px]`}><span className="font-semibold">{r.title}</span><span className="block text-xs text-muted">{[r.category, sites.find(s => s.id === r.site_id)?.name ?? 'All sites'].filter(Boolean).join(' · ')}</span></td>
                      <td className={td}><Pill tone={LEVELS[beforeLevel(r)].tone}>{LEVELS[beforeLevel(r)].label}</Pill></td>
                      <td className={td}>{al ? <Pill tone={LEVELS[al].tone}>{LEVELS[al].label}</Pill> : <span className="text-muted">Not rated</span>}</td>
                      <td className={`${td} text-muted`}>{cs.length ? `${cs.length} · best: ${best?.label ?? ''}` : 'None'}</td>
                      <td className={td}>{r.owner_name}</td>
                      <td className={`${td} whitespace-nowrap`}>{reviewBy(r) ? formatDay(reviewBy(r)) : <span className="text-muted">—</span>}</td>
                      <td className={`${td} pr-4`}><Pill tone={pill.tone}>{pill.label}</Pill></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="m-0 text-xs text-muted">Click a row to open it beside the list. Ratings use the Finlay matrix: score 1 to 8 low, 9 to 15 medium, 16 to 19 high, 20 to 25 extreme.</p>
      </div>

      {openId === NEW && office && (
        <SidePanel label="New risk" onClose={close}>
          <RiskForm sites={sites} onSaved={async r => { await load(); setOpenId(r.id); }} onCancel={close} />
        </SidePanel>
      )}
      {open && (
        <SidePanel label={open.title} onClose={close}>
          <RiskPanel key={open.id} risk={open} controls={ctl.get(open.id) ?? []} reviews={reviews.filter(v => v.risk_id === open.id)} sites={sites} user={user} office={office} onChanged={() => void load()} onDeleted={() => { close(); void load(); }} />
        </SidePanel>
      )}
    </div>
  );
}

function RiskForm({ risk, sites, onSaved, onCancel }: { risk?: Risk; sites: { id: string; name: string }[]; onSaved: (r: Risk) => void | Promise<void>; onCancel: () => void }) {
  const [f, setF] = useState({
    title: risk?.title ?? '', category: risk?.category ?? '', site_id: risk?.site_id ?? '', description: risk?.description ?? '',
    owner_name: risk?.owner_name ?? 'WHS officer', review_months: String(risk?.review_months ?? 12),
  });
  const [before, setBefore] = useState<[number, number] | null>(risk ? [risk.before_likelihood, risk.before_consequence] : null);
  const [after, setAfter] = useState<[number, number] | null>(risk?.after_likelihood && risk.after_consequence ? [risk.after_likelihood, risk.after_consequence] : null);
  const [drafts, setDrafts] = useState<{ control_level: ControlLevel; what: string }[]>([]);
  const [lvl, setLvl] = useState<ControlLevel>('engineer');
  const [what, setWhat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const months = Number(f.review_months);
    if (!f.title.trim()) return setError('Give the risk a title.');
    if (!before) return setError('Rate the risk before controls: tap a square in the first grid.');
    if (!Number.isInteger(months) || months < 1 || months > 120) return setError('Review every must be a whole number of months.');
    setBusy(true);
    const input: RiskInput = {
      title: f.title.trim(), category: f.category.trim(), site_id: f.site_id || null, description: f.description.trim(),
      before_likelihood: before[0], before_consequence: before[1], after_likelihood: after?.[0] ?? null, after_consequence: after?.[1] ?? null,
      owner_name: f.owner_name.trim() || 'WHS officer', review_months: months,
    };
    const r = risk ? await updateRisk(risk.id, input) : await createRisk(input, drafts);
    setBusy(false);
    if (r.data) await onSaved(r.data);
    if (r.error) setError(r.error);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <h2 className="m-0 text-xl font-bold">{risk ? `Edit ${risk.ref}` : 'New risk'}</h2>
      <ErrorNote message={error} />
      <Field label="Risk" htmlFor="rk-title"><input id="rk-title" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="Working at height on the screen deck" className={inputClass} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category" optional htmlFor="rk-cat">
          <input id="rk-cat" list="rk-cats" value={f.category} onChange={e => setF({ ...f, category: e.target.value })} className={inputClass} />
          <datalist id="rk-cats">{RISK_CATEGORIES.map(c => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label="Where" htmlFor="rk-site">
          <select id="rk-site" value={f.site_id} onChange={e => setF({ ...f, site_id: e.target.value })} className={inputClass}>
            <option value="">All sites</option>
            {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
      </div>
      <Field label="What could happen, and to whom" optional htmlFor="rk-desc"><textarea id="rk-desc" rows={3} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} className={textareaClass} /></Field>
      <div className="flex flex-wrap gap-6">
        <RatingGrid label="Before controls" likelihood={before?.[0] ?? null} consequence={before?.[1] ?? null} onChange={(l, c) => setBefore([l, c])} />
        <RatingGrid label="After controls (optional for now)" likelihood={after?.[0] ?? null} consequence={after?.[1] ?? null} onChange={(l, c) => setAfter([l, c])} />
      </div>
      {!risk && (
        <div>
          <div className="text-xs font-semibold text-muted mb-1">Controls, best first</div>
          {drafts.map((d, i) => (
            <div key={i} className="flex items-center gap-2 py-1 text-sm"><Pill tone="blue">{CONTROL_LEVELS.find(l => l.id === d.control_level)?.label}</Pill><span className="flex-1">{d.what}</span><button type="button" className={btn} onClick={() => setDrafts(drafts.filter((_, j) => j !== i))}>Remove</button></div>
          ))}
          <div className="flex gap-2 mt-1">
            <select aria-label="Control level" value={lvl} onChange={e => setLvl(e.target.value as ControlLevel)} className="min-h-10 rounded-lg border border-[#D6D2CC] bg-white px-2 text-sm">{CONTROL_LEVELS.map(l => <option key={l.id} value={l.id}>{l.label}: {l.sub}</option>)}</select>
            <input aria-label="What the control is" value={what} onChange={e => setWhat(e.target.value)} placeholder="Handrails and a lifting frame" className="min-h-10 flex-1 rounded-lg border border-[#D6D2CC] bg-white px-3 text-sm" />
            <button type="button" className={btn} onClick={() => { if (what.trim()) { setDrafts([...drafts, { control_level: lvl, what: what.trim() }]); setWhat(''); } }}>Add</button>
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Owner" htmlFor="rk-own"><input id="rk-own" value={f.owner_name} onChange={e => setF({ ...f, owner_name: e.target.value })} className={inputClass} /></Field>
        <Field label="Review every (months)" htmlFor="rk-rev"><input id="rk-rev" type="number" min={1} max={120} value={f.review_months} onChange={e => setF({ ...f, review_months: e.target.value })} className={inputClass} /></Field>
      </div>
      <div className="flex gap-2"><button type="submit" disabled={busy} className={primary}>{busy ? 'Saving…' : 'Save'}</button><button type="button" onClick={onCancel} className={btn}>Cancel</button></div>
    </form>
  );
}

function RiskPanel({ risk, controls, reviews, sites, user, office, onChanged, onDeleted }: {
  risk: Risk; controls: RiskControl[]; reviews: RiskReview[]; sites: { id: string; name: string }[]; user: WhsUser; office: boolean; onChanged: () => void; onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lvl, setLvl] = useState<ControlLevel>('engineer');
  const [what, setWhat] = useState('');
  const [rev, setRev] = useState({ on: brisbaneDay(new Date()), note: '' });
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  useEffect(() => { void listHistory('risk', risk.id).then(setHistory); }, [risk.id, risk.updated_at, controls.length, reviews.length]);

  const pill = riskPill(risk, controls);
  const issues = riskIssues(risk, controls);
  const by = reviewBy(risk);
  const run = async (fn: () => Promise<{ error?: string }>) => { setBusy(true); const r = await fn(); setBusy(false); if (r.error) setError(r.error); else { setError(null); onChanged(); } };

  if (editing) return <RiskForm risk={risk} sites={sites} onSaved={() => { setEditing(false); onChanged(); }} onCancel={() => setEditing(false)} />;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-xs font-semibold text-muted">{risk.ref} · {[risk.category, sites.find(s => s.id === risk.site_id)?.name ?? 'All sites'].filter(Boolean).join(' · ')}</div>
        <h2 className="m-0 mt-1 text-xl font-bold">{risk.title}</h2>
        <div className="mt-2 flex flex-wrap gap-2"><Pill tone={pill.tone}>{pill.label}</Pill>{issues.slice(1).map(i => <Pill key={i.key} tone={i.tone}>{i.label}</Pill>)}</div>
      </div>
      <ErrorNote message={error} />
      <div className="flex flex-wrap gap-6">
        <RatingGrid label="Before controls" likelihood={risk.before_likelihood} consequence={risk.before_consequence} />
        <RatingGrid label="After controls" likelihood={risk.after_likelihood} consequence={risk.after_consequence} />
      </div>
      {risk.description && <div><div className="text-xs font-semibold text-muted mb-1">What could happen, and to whom</div><div className="text-sm">{risk.description}</div></div>}

      <div>
        <div className="text-xs font-semibold text-muted mb-1">Controls, best first</div>
        <div className="border border-line rounded-xl bg-white">
          {controls.length === 0 && <p className="m-0 px-3.5 py-3 text-sm text-muted">No controls recorded yet.</p>}
          {CONTROL_LEVELS.flatMap(l => controls.filter(c => c.control_level === l.id)).map((c, i) => (
            <div key={c.id} className={`flex items-center gap-3 px-3.5 py-2.5 text-sm ${i ? 'border-t border-line-soft' : ''}`}>
              <Pill tone={c.control_level === 'ppe' ? 'grey' : 'blue'}>{CONTROL_LEVELS.find(l => l.id === c.control_level)?.label}</Pill>
              <span className="flex-1">{c.what}</span>
              {office && <button type="button" disabled={busy} className={btn} onClick={() => void run(async () => (await removeControl(c.id)))}>Remove</button>}
            </div>
          ))}
        </div>
        {office && (
          <div className="flex gap-2 mt-2">
            <select aria-label="Control level" value={lvl} onChange={e => setLvl(e.target.value as ControlLevel)} className="min-h-10 rounded-lg border border-[#D6D2CC] bg-white px-2 text-sm">{CONTROL_LEVELS.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}</select>
            <input aria-label="What the control is" value={what} onChange={e => setWhat(e.target.value)} placeholder="Add a control" className="min-h-10 flex-1 rounded-lg border border-[#D6D2CC] bg-white px-3 text-sm" />
            <button type="button" disabled={busy || !what.trim()} className={btn} onClick={() => void run(async () => { const r = await addControl(risk.id, lvl, what.trim()); if (!r.error) setWhat(''); return r; })}>Add</button>
          </div>
        )}
      </div>

      <div className="text-sm"><span className="text-xs font-semibold text-muted block mb-1">Owner and review</span>{risk.owner_name} · reviewed every {risk.review_months} months{risk.reviewed_on ? ` · last reviewed ${formatDay(risk.reviewed_on)}${risk.reviewed_by_name ? ` by ${risk.reviewed_by_name}` : ''}` : ' · never reviewed'}{by ? ` · next ${formatDay(by)}` : ''}</div>

      {office && (
        <form className="flex flex-col gap-2 border border-line rounded-xl p-3.5" onSubmit={e => { e.preventDefault(); void run(async () => { const r = await addReview(risk.id, rev.on, rev.note.trim()); if (!r.error) setRev({ ...rev, note: '' }); return r; }); }}>
          <h3 className="m-0 text-sm font-bold">Record a review</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date" htmlFor="rv-on"><input id="rv-on" type="date" max={brisbaneDay(new Date())} value={rev.on} onChange={e => setRev({ ...rev, on: e.target.value })} className={inputClass} /></Field>
            <Field label="Note" optional htmlFor="rv-note"><input id="rv-note" value={rev.note} onChange={e => setRev({ ...rev, note: e.target.value })} className={inputClass} /></Field>
          </div>
          <div><button type="submit" disabled={busy || !rev.on} className={primary}>Save review</button></div>
        </form>
      )}
      {reviews.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-muted mb-1">Review history</div>
          <div className="border border-line rounded-xl bg-white">
            {reviews.map((v, i) => (
              <div key={v.id} className={`flex items-center gap-3 px-3.5 py-2.5 text-sm ${i ? 'border-t border-line-soft' : ''}`}>
                <span className="flex-1"><b>{formatDay(v.reviewed_on)}</b> · {v.reviewed_by_name || 'Unknown'}{v.note && <span className="block text-xs text-muted">{v.note}</span>}</span>
                {user.access === 'admin' && <button type="button" disabled={busy} className={btn} onClick={async () => { if (await askConfirm({ title: `Remove the ${formatDay(v.reviewed_on)} review?`, body: 'Only do this for a line entered by mistake.', confirmLabel: 'Remove', danger: true })) void run(async () => removeReview(v.id)); }}>Remove</button>}
              </div>
            ))}
          </div>
        </div>
      )}
      {history.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-muted mb-1">History</div>
          <ul className="m-0 p-0 list-none text-[13px] text-muted">{history.map(h => <li key={h.id} className="py-0.5">{formatWhen(h.occurred_at)} · {h.actor_name}: {h.what}</li>)}</ul>
          <div className="text-xs text-muted mt-1">History cannot be edited.</div>
        </div>
      )}
      {office && (
        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" onClick={() => setEditing(true)} className={btn}>Edit</button>
          <button type="button" disabled={busy} onClick={() => void run(async () => updateRisk(risk.id, { status: risk.status === 'active' ? 'retired' : 'active' }))} className={btn}>{risk.status === 'active' ? 'Retire this risk' : 'Put back on the register'}</button>
          {user.access === 'admin' && <button type="button" disabled={busy} onClick={async () => { if (await askConfirm({ title: `Delete ${risk.ref}?`, body: 'This removes the risk, its controls and reviews for good. Retire it instead if it is no longer relevant.', confirmLabel: 'Delete', danger: true })) { setBusy(true); const r = await deleteRisk(risk.id); setBusy(false); if (r.error) setError(r.error); else onDeleted(); } }} className={`${btn} text-[#9B1218] border-[#E3B7B7]`}>Delete</button>}
        </div>
      )}
    </div>
  );
}
