import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { WhsUser } from '../services/auth.ts';
import { createSwms, loadSwms } from '../services/swms.ts';
import { listDocuments } from '../services/documents.ts';
import { useSiteScope } from '../hooks/useSiteScope.tsx';
import { go } from '../hooks/useRoute.ts';
import { isOfficeAccess } from '../utils/access.ts';
import { formatDay } from '../utils/dates.ts';
import { inScope } from '../utils/siteScope.ts';
import type { WhsDocument } from '../utils/documents.ts';
import { currentApproved, swmsIssues, swmsNeedsAction, swmsPill, swmsReviewBy, VERSION_LABEL, type Swms, type SwmsVersion } from '../utils/swms.ts';
import { ErrorNote, Field, inputClass } from './Form.tsx';
import { Pill } from './Pill.tsx';
import { SidePanel, rowOpens } from './SidePanel.tsx';

const th = 'px-2 py-3 font-semibold border-b border-[#EEEBE6] text-left';
const td = 'px-2 py-3 border-b border-line-soft align-top';
const btn = 'min-h-10 px-3.5 rounded-lg border border-[#D6D2CC] bg-white text-sm font-semibold cursor-pointer';
const primary = 'min-h-10 px-4 rounded-lg border-0 bg-finlay hover:bg-finlay-dark text-white text-sm font-bold cursor-pointer disabled:opacity-60';
const chip = (on: boolean) => `min-h-9 px-3 rounded-full text-[13px] font-semibold cursor-pointer border ${on ? 'bg-ink text-white border-ink' : 'bg-white text-ink border-[#D6D2CC]'}`;
const TILE = { red: 'bg-[#FBE3E4] border-[#F1C0C2]', amber: 'bg-[#FFF3D6] border-[#F0DDA6]', grey: 'bg-white border-line' } as const;

type Filter = 'all' | 'attention' | 'approved' | 'retired';

/** The SWMS list: every safe work method statement, its approved version and when it is next reviewed. */
export function SwmsListPage({ user }: { user: WhsUser }) {
  const office = isOfficeAccess(user.access);
  const { site, sites } = useSiteScope();
  const [swms, setSwms] = useState<Swms[]>([]);
  const [versions, setVersions] = useState<SwmsVersion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);

  const load = () => loadSwms().then(r => {
    setError(r.error ?? null);
    setSwms(r.data?.swms ?? []);
    setVersions(r.data?.versions ?? []);
    setLoaded(true);
  });
  useEffect(() => { void load(); }, []);

  const byId = useMemo(() => {
    const m = new Map<string, SwmsVersion[]>();
    for (const v of versions) m.set(v.swms_id, [...(m.get(v.swms_id) ?? []), v]);
    return m;
  }, [versions]);

  const scoped = swms.filter(s => !s.site_id || inScope(site, { site_id: s.site_id }));
  const active = scoped.filter(s => s.status === 'active');
  const vs = (s: Swms) => byId.get(s.id) ?? [];
  const shown = scoped
    .filter(s => (filter === 'retired' ? s.status === 'retired' : s.status === 'active'))
    .filter(s => filter !== 'attention' || swmsNeedsAction(s, vs(s)))
    .filter(s => filter !== 'approved' || Boolean(currentApproved(vs(s))))
    .filter(s => !q.trim() || `${s.ref} ${s.title} ${s.owner_name}`.toLowerCase().includes(q.trim().toLowerCase()));

  const awaiting = active.filter(s => vs(s).some(v => v.status === 'awaiting')).length;
  const notApproved = active.filter(s => !currentApproved(vs(s))).length;
  const reviewsDue = active.filter(s => swmsIssues(s, vs(s)).some(i => i.key === 'overdue' || i.key === 'due_soon')).length;
  const inUse = active.filter(s => currentApproved(vs(s))).length;

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
            <h2 className="m-0 text-[22px] font-bold">Safe work method statements</h2>
            <p className="mt-1 mb-0 text-muted text-[15px]">Write, approve and review SWMS here. Only approved versions are used on site.</p>
          </div>
          {office && <button type="button" onClick={() => setCreating(true)} className={`${primary} ml-auto`}>+ New SWMS</button>}
        </div>
        <ErrorNote message={error} />
        <section aria-label="Summary" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {stat('In use', inUse, 'approved and active', 'grey')}
          {stat('Awaiting approval', awaiting, 'sent to the WHS officer', 'amber')}
          {stat('Not approved yet', notApproved, 'no approved version', 'red')}
          {stat('Reviews due', reviewsDue, 'overdue or due in 60 days', 'amber')}
        </section>
        <div className="flex flex-wrap items-center gap-2">
          {([['all', 'All'], ['attention', 'Needs action'], ['approved', 'Approved'], ['retired', 'Retired']] as [Filter, string][]).map(([id, label]) => (
            <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)} className={chip(filter === id)}>{label}</button>
          ))}
          <input type="search" aria-label="Search SWMS" placeholder="Search SWMS, owners" value={q} onChange={e => setQ(e.target.value)} className="min-h-9 ml-auto w-56 rounded-lg border border-[#D6D2CC] bg-white px-3 text-[13px]" />
        </div>
        {!loaded ? <p className="text-muted">Loading…</p> : shown.length === 0 ? (
          <div className="bg-white border border-line rounded-xl p-6 text-sm text-muted">
            {swms.length === 0 ? <>No SWMS yet.{office ? ' Use “+ New SWMS” to write the first one.' : ''}</> : 'Nothing matches these filters.'}
          </div>
        ) : (
          <div className="bg-white border border-line rounded-xl overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead><tr><th className={`${th} pl-4`}>Ref</th><th className={th}>SWMS</th><th className={th}>Approved version</th><th className={th}>Approved by</th><th className={th}>Owner</th><th className={th}>Review by</th><th className={`${th} pr-4`}>Status</th></tr></thead>
              <tbody>
                {shown.map(s => {
                  const cur = currentApproved(vs(s));
                  const pill = swmsPill(s, vs(s));
                  const by = swmsReviewBy(s);
                  return (
                    <tr key={s.id} onClick={e => rowOpens(e, () => go({ name: 'swms', id: s.id }))} className="cursor-pointer hover:bg-[#FAF8F6]">
                      <td className={`${td} pl-4 font-semibold whitespace-nowrap`}>{s.ref}</td>
                      <td className={td}><span className="font-semibold">{s.title}</span><span className="block text-xs text-muted">{sites.find(x => x.id === s.site_id)?.name ?? 'All sites'}</span></td>
                      <td className={td}>{cur ? `Version ${cur.version}` : <span className="text-muted">None</span>}</td>
                      <td className={td}>{cur ? <>{cur.approved_by_name}<span className="block text-xs text-muted">{cur.approved_at ? formatDay(cur.approved_at.slice(0, 10)) : ''}</span></> : <span className="text-muted">—</span>}</td>
                      <td className={td}>{s.owner_name}</td>
                      <td className={`${td} whitespace-nowrap`}>{by ? formatDay(by) : <span className="text-muted">—</span>}</td>
                      <td className={`${td} pr-4`}><Pill tone={pill.tone}>{pill.label}</Pill></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="m-0 text-xs text-muted">Click a row to open the SWMS. A new version is needed for any change to an approved SWMS. Statuses: {Object.values(VERSION_LABEL).map(v => v.label).join(', ')}.</p>
      </div>
      {creating && office && (
        <SidePanel label="New SWMS" onClose={() => setCreating(false)}>
          <NewSwms sites={sites} onCancel={() => setCreating(false)} />
        </SidePanel>
      )}
    </div>
  );
}

function NewSwms({ sites, onCancel }: { sites: { id: string; name: string }[]; onCancel: () => void }) {
  const [f, setF] = useState({ title: '', site_id: '', owner_name: 'WHS officer', review_months: '12', document_id: '' });
  const [docs, setDocs] = useState<WhsDocument[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { void listDocuments().then(r => setDocs((r.data ?? []).filter(d => d.doc_type === 'swms'))); }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const months = Number(f.review_months);
    if (!f.title.trim()) return setError('Give the SWMS a title.');
    if (!Number.isInteger(months) || months < 1 || months > 120) return setError('Review every must be a whole number of months.');
    setBusy(true);
    const r = await createSwms({ title: f.title.trim(), site_id: f.site_id || null, owner_name: f.owner_name.trim() || 'WHS officer', review_months: months, document_id: f.document_id || null });
    setBusy(false);
    if (r.data) go({ name: 'swms', id: r.data.id });
    if (r.error) setError(r.error);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <h2 className="m-0 text-xl font-bold">New SWMS</h2>
      <p className="m-0 text-sm text-muted">Start with the title. You write the steps on the next screen and send it for approval when it is ready.</p>
      <ErrorNote message={error} />
      <Field label="Title" htmlFor="sw-title"><input id="sw-title" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="Changing screen mesh on the Powerscreen" className={inputClass} /></Field>
      <Field label="Where" htmlFor="sw-site">
        <select id="sw-site" value={f.site_id} onChange={e => setF({ ...f, site_id: e.target.value })} className={inputClass}>
          <option value="">All sites</option>
          {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Owner" htmlFor="sw-own"><input id="sw-own" value={f.owner_name} onChange={e => setF({ ...f, owner_name: e.target.value })} className={inputClass} /></Field>
        <Field label="Review every (months)" htmlFor="sw-rev"><input id="sw-rev" type="number" min={1} max={120} value={f.review_months} onChange={e => setF({ ...f, review_months: e.target.value })} className={inputClass} /></Field>
      </div>
      <Field label="Existing SWMS file in Documents" optional hint="Link the file this replaces, if there is one." htmlFor="sw-doc">
        <select id="sw-doc" value={f.document_id} onChange={e => setF({ ...f, document_id: e.target.value })} className={inputClass}>
          <option value="">None</option>
          {docs.map(d => <option key={d.id} value={d.id}>{[d.doc_no, d.title].filter(Boolean).join(' · ')}</option>)}
        </select>
      </Field>
      <div className="flex gap-2"><button type="submit" disabled={busy} className={primary}>{busy ? 'Creating…' : 'Create and start writing'}</button><button type="button" onClick={onCancel} className={btn}>Cancel</button></div>
    </form>
  );
}
