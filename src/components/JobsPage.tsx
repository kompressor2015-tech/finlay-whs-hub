import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { NameInput } from './NameInput.tsx';
import type { WhsUser } from '../services/auth.ts';
import { listPeople } from '../services/incidentFile.ts';
import { listTickets } from '../services/tickets.ts';
import { loadSwms } from '../services/swms.ts';
import { createJob, deleteJob, loadJobs, loadSignOns, setJobPeople, setJobSwms, updateJob, type JobInput } from '../services/signon.ts';
import { useSiteScope } from '../hooks/useSiteScope.tsx';
import { isOfficeAccess } from '../utils/access.ts';
import { formatDay } from '../utils/dates.ts';
import { inScope } from '../utils/siteScope.ts';
import { jobSheet, jobTiming, sheetProgress, TIMING_LABEL, type Cell, type Job, type JobPerson, type JobSwms, type SignOn } from '../utils/signon.ts';
import { currentApproved, type Swms, type SwmsVersion } from '../utils/swms.ts';
import type { Person } from '../utils/incidentFile.ts';
import type { Ticket } from '../utils/tickets.ts';
import { askConfirm } from './ConfirmHost.tsx';
import { ErrorNote, Field, inputClass, textareaClass } from './Form.tsx';
import { Pill } from './Pill.tsx';
import { SidePanel, rowOpens } from './SidePanel.tsx';
import { SignOnPanel } from './SignOnPanel.tsx';

const th = 'px-2 py-3 font-semibold border-b border-[#EEEBE6] text-left';
const td = 'px-2 py-3 border-b border-line-soft align-top';
const btn = 'min-h-10 px-3.5 rounded-lg border border-[#D6D2CC] bg-white text-sm font-semibold cursor-pointer disabled:opacity-60';
const primary = 'min-h-10 px-4 rounded-lg border-0 bg-finlay hover:bg-finlay-dark text-white text-sm font-bold cursor-pointer disabled:opacity-60';
const chip = (on: boolean) => `min-h-9 px-3 rounded-full text-[13px] font-semibold cursor-pointer border ${on ? 'bg-ink text-white border-ink' : 'bg-white text-ink border-[#D6D2CC]'}`;
const TILE = { red: 'bg-[#FBE3E4] border-[#F1C0C2]', amber: 'bg-[#FFF3D6] border-[#F0DDA6]', grey: 'bg-white border-line' } as const;
const CELL: Record<Cell, { label: string; cls: string }> = {
  signed: { label: '✓', cls: 'text-[#1F6B2E] font-bold' },
  older: { label: 'Again', cls: 'text-[#7A4B00] font-semibold' },
  none: { label: '—', cls: 'text-[#9B1218]' },
  no_version: { label: 'n/a', cls: 'text-muted' },
};

type Filter = 'active' | 'running' | 'closed';

interface Data { jobs: Job[]; jobSwms: JobSwms[]; jobPeople: JobPerson[]; swms: Swms[]; versions: SwmsVersion[]; signons: SignOn[]; people: Person[]; tickets: Ticket[] }

/** Jobs: where the work is, who is on it, which SWMS apply, and who has signed on. Office roles only. */
export function JobsPage({ user }: { user: WhsUser }) {
  const office = isOfficeAccess(user.access);
  const { site, sites } = useSiteScope();
  const [d, setD] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('active');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | 'new' | null>(null);

  const load = useCallback(async () => {
    const [j, s, so, p, t] = await Promise.all([loadJobs(), loadSwms(), loadSignOns(), listPeople(), listTickets()]);
    const err = j.error ?? s.error ?? so.error;
    if (err) { setError(err); return; }
    setError(null);
    setD({ jobs: j.data!.jobs, jobSwms: j.data!.jobSwms, jobPeople: j.data!.jobPeople, swms: s.data!.swms, versions: s.data!.versions, signons: so.data ?? [], people: (p.data ?? []).filter(x => x.active), tickets: t.data ?? [] });
  }, []);
  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(() => {
    if (!d) return [];
    return d.jobs.filter(j => inScope(site, { site_id: j.site_id })).map(j => {
      const ids = d.jobSwms.filter(l => l.job_id === j.id).map(l => l.swms_id);
      const crew = d.people.filter(p => d.jobPeople.some(l => l.job_id === j.id && l.person_id === p.id));
      const prog = sheetProgress(jobSheet(j, ids, crew, d.versions, d.signons).filter(r => crew.some(c => c.id === r.personId)), ids);
      return { job: j, timing: jobTiming(j), swmsCount: ids.length, crewCount: crew.length, ...prog };
    });
  }, [d, site]);

  const shown = rows
    .filter(r => (filter === 'closed' ? r.job.status === 'closed' : r.job.status === 'active'))
    .filter(r => filter !== 'running' || r.timing === 'running')
    .filter(r => !q.trim() || `${r.job.ref} ${r.job.name} ${r.job.client} ${r.job.location}`.toLowerCase().includes(q.trim().toLowerCase()));
  const act = rows.filter(r => r.job.status === 'active');
  const stat = (label: string, value: number, sub: string, tone: keyof typeof TILE) => (
    <div className={`border rounded-xl p-4 ${value ? TILE[tone] : TILE.grey}`}>
      <div className="text-[13px] text-muted">{label}</div><div className="text-[28px] font-bold leading-tight">{value}</div><div className="text-xs text-muted">{sub}</div>
    </div>
  );
  const open = openId && openId !== 'new' ? d?.jobs.find(j => j.id === openId) ?? null : null;

  return (
    <div className="flex gap-5 items-start">
      <div className="flex-1 min-w-0 flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h2 className="m-0 text-[22px] font-bold">Jobs</h2>
            <p className="mt-1 mb-0 text-muted text-[15px]">A job is the work at a site. Put the crew and the SWMS on it, then watch who has signed on.</p>
          </div>
          {office && <button type="button" onClick={() => setOpenId('new')} className={`${primary} ml-auto`}>+ New job</button>}
        </div>
        <ErrorNote message={error} />
        <section aria-label="Summary" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {stat('Running', act.filter(r => r.timing === 'running').length, 'on now', 'grey')}
          {stat('Starting soon', act.filter(r => r.timing === 'upcoming').length, 'start date ahead', 'grey')}
          {stat('Sign-ons to do', act.reduce((n, r) => n + (r.total - r.done), 0), 'crew still to sign on', 'amber')}
          {stat('Past end date', act.filter(r => r.timing === 'ended').length, 'still open, close them', 'amber')}
        </section>
        <div className="flex flex-wrap items-center gap-2">
          {([['active', 'Open'], ['running', 'Running'], ['closed', 'Closed']] as [Filter, string][]).map(([id, label]) => <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)} className={chip(filter === id)}>{label}</button>)}
          <input type="search" aria-label="Search jobs" placeholder="Search jobs, clients" value={q} onChange={e => setQ(e.target.value)} className="min-h-9 ml-auto w-56 rounded-lg border border-[#D6D2CC] bg-white px-3 text-[13px]" />
        </div>
        {!d ? <p className="text-muted">Loading…</p> : shown.length === 0 ? (
          <div className="bg-white border border-line rounded-xl p-6 text-sm text-muted">{d.jobs.length === 0 ? 'No jobs yet. Use “+ New job” to add one.' : 'Nothing matches these filters.'}</div>
        ) : (
          <div className="bg-white border border-line rounded-xl overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead><tr><th className={`${th} pl-4`}>Job</th><th className={th}>Site</th><th className={th}>Dates</th><th className={th}>Crew</th><th className={th}>SWMS</th><th className={th}>Signed on</th><th className={`${th} pr-4`}>Status</th></tr></thead>
              <tbody>
                {shown.map(r => {
                  const t = TIMING_LABEL[r.timing];
                  return (
                    <tr key={r.job.id} onClick={e => rowOpens(e, () => setOpenId(r.job.id))} className={`cursor-pointer hover:bg-[#FAF8F6] ${openId === r.job.id ? 'bg-[#FAF8F6]' : ''}`}>
                      <td className={`${td} pl-4`}><span className="font-semibold">{r.job.name}</span><span className="block text-xs text-muted">{r.job.ref}{r.job.client ? ` · ${r.job.client}` : ''}</span></td>
                      <td className={td}>{sites.find(s => s.id === r.job.site_id)?.name ?? <span className="text-muted">Not set</span>}</td>
                      <td className={`${td} whitespace-nowrap`}>{r.job.starts_on ? formatDay(r.job.starts_on) : '…'} to {r.job.ends_on ? formatDay(r.job.ends_on) : '…'}</td>
                      <td className={td}>{r.crewCount}</td>
                      <td className={td}>{r.swmsCount}</td>
                      <td className={td}>{r.total ? <span className={r.done === r.total ? 'text-[#1F6B2E] font-semibold' : ''}>{r.done} of {r.total}</span> : <span className="text-muted">—</span>}</td>
                      <td className={`${td} pr-4`}><Pill tone={t.tone}>{t.label}</Pill></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {openId && d && (
        <SidePanel label={openId === 'new' ? 'New job' : open?.name ?? 'Job'} onClose={() => setOpenId(null)}>
          {openId === 'new'
            ? <JobForm sites={sites} onSaved={async id => { await load(); setOpenId(id); }} onCancel={() => setOpenId(null)} />
            : open ? <JobPanel key={open.id} job={open} d={d} sites={sites} user={user} reload={load} close={() => setOpenId(null)} /> : <p>Job not found.</p>}
        </SidePanel>
      )}
    </div>
  );
}

function JobForm({ job, sites, onSaved, onCancel }: { job?: Job; sites: { id: string; name: string }[]; onSaved: (id: string) => void | Promise<void>; onCancel: () => void }) {
  const [f, setF] = useState({ name: job?.name ?? '', site_id: job?.site_id ?? '', client: job?.client ?? '', location: job?.location ?? '', supervisor_name: job?.supervisor_name ?? '', starts_on: job?.starts_on ?? '', ends_on: job?.ends_on ?? '', notes: job?.notes ?? '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) return setError('Give the job a name.');
    if (f.starts_on && f.ends_on && f.ends_on < f.starts_on) return setError('The end date is before the start date.');
    const input: JobInput = { name: f.name.trim(), site_id: f.site_id || null, client: f.client.trim(), location: f.location.trim(), supervisor_name: f.supervisor_name.trim(), starts_on: f.starts_on || null, ends_on: f.ends_on || null, notes: f.notes.trim() };
    setBusy(true);
    const r = job ? await updateJob(job.id, input) : await createJob(input);
    setBusy(false);
    if (r.error || !r.data) return setError(r.error ?? 'Could not save.');
    setError(null);
    await onSaved(r.data.id);
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {!job && <h2 className="m-0 text-xl font-bold">New job</h2>}
      <ErrorNote message={error} />
      <Field label="Job name" htmlFor="j-name"><input id="j-name" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} className={inputClass} placeholder="Powerscreen service, Shadforths Aura" /></Field>
      <Field label="Site" optional htmlFor="j-site">
        <select id="j-site" value={f.site_id} onChange={e => setF({ ...f, site_id: e.target.value })} className={inputClass}><option value="">Not set</option>{sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Client" optional htmlFor="j-cl"><input id="j-cl" value={f.client} onChange={e => setF({ ...f, client: e.target.value })} className={inputClass} /></Field>
        <Field label="Supervisor" optional htmlFor="j-sup"><NameInput id="j-sup" value={f.supervisor_name} onChange={t => setF({ ...f, supervisor_name: t })} /></Field>
      </div>
      <Field label="Address or location" optional htmlFor="j-loc"><input id="j-loc" value={f.location} onChange={e => setF({ ...f, location: e.target.value })} className={inputClass} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Starts" optional htmlFor="j-st"><input id="j-st" type="date" value={f.starts_on} onChange={e => setF({ ...f, starts_on: e.target.value })} className={inputClass} /></Field>
        <Field label="Ends" optional htmlFor="j-en"><input id="j-en" type="date" value={f.ends_on} onChange={e => setF({ ...f, ends_on: e.target.value })} className={inputClass} /></Field>
      </div>
      <Field label="Notes" optional htmlFor="j-no"><textarea id="j-no" rows={2} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} className={textareaClass} /></Field>
      <div className="flex gap-2"><button type="submit" disabled={busy} className={primary}>{busy ? 'Saving…' : job ? 'Save job' : 'Create job'}</button><button type="button" onClick={onCancel} className={btn}>Cancel</button></div>
    </form>
  );
}

function JobPanel({ job, d, sites, user, reload, close }: { job: Job; d: Data; sites: { id: string; name: string }[]; user: WhsUser; reload: () => Promise<void>; close: () => void }) {
  const [tab, setTab] = useState<'sheet' | 'setup'>('sheet');
  const [editing, setEditing] = useState(false);
  const [signing, setSigning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [find, setFind] = useState('');
  const linked = d.jobSwms.filter(l => l.job_id === job.id).map(l => l.swms_id);
  const crewIds = d.jobPeople.filter(l => l.job_id === job.id).map(l => l.person_id);
  const crew = d.people.filter(p => crewIds.includes(p.id));
  const sheet = jobSheet(job, linked, crew, d.versions, d.signons);
  const linkedSwms = linked.map(id => d.swms.find(s => s.id === id)).filter((s): s is Swms => Boolean(s));
  const t = TIMING_LABEL[jobTiming(job)];
  const flagged = (personId: string | null) => personId ? d.tickets.filter(x => x.person_id === personId) : [];

  const run = async (fn: () => Promise<{ error?: string }>) => { setBusy(true); const r = await fn(); setBusy(false); if (r.error) setError(r.error); else { setError(null); await reload(); } };
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter(x => x !== id) : [...list, id]);
  const signSwms = signing ? d.swms.find(s => s.id === signing) : null;
  const signVersion = signSwms ? currentApproved(d.versions.filter(v => v.swms_id === signSwms.id)) : null;
  const people = d.people.filter(p => !find.trim() || p.name.toLowerCase().includes(find.trim().toLowerCase()));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-xs font-semibold text-muted">{job.ref} · {sites.find(s => s.id === job.site_id)?.name ?? 'No site'}</div>
        <h2 className="m-0 mt-1 text-xl font-bold">{job.name}</h2>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm"><Pill tone={t.tone}>{t.label}</Pill><span className="text-muted">{job.starts_on ? formatDay(job.starts_on) : '…'} to {job.ends_on ? formatDay(job.ends_on) : '…'}{job.client ? ` · ${job.client}` : ''}{job.supervisor_name ? ` · Supervisor ${job.supervisor_name}` : ''}</span></div>
      </div>
      <ErrorNote message={error} />
      <div role="tablist" className="flex gap-2 border-b border-line">
        {(['sheet', 'setup'] as const).map(k => <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`min-h-10 px-3 text-sm font-semibold cursor-pointer border-0 bg-transparent border-b-[3px] ${tab === k ? 'text-finlay border-b-finlay' : 'text-muted border-b-transparent'}`}>{k === 'sheet' ? 'Sign-on sheet' : 'Crew and SWMS'}</button>)}
      </div>

      {tab === 'sheet' && (
        <div className="flex flex-col gap-3">
          {linkedSwms.length === 0 ? <p className="m-0 text-sm text-muted">No SWMS on this job yet. Add them under “Crew and SWMS”.</p> : sheet.length === 0 ? <p className="m-0 text-sm text-muted">No crew yet. Add them under “Crew and SWMS”.</p> : (
            <div className="border border-line rounded-xl overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead><tr className="text-left"><th className="px-3 py-2 font-semibold">Name</th>{linkedSwms.map(s => <th key={s.id} className="px-3 py-2 font-semibold">{s.swms_number || s.ref}<span className="block text-xs font-normal text-muted max-w-[140px] truncate">{s.title}</span></th>)}</tr></thead>
                <tbody>
                  {sheet.map(r => {
                    const exp = flagged(r.personId).filter(x => x.expires_on && x.expires_on < new Date().toISOString().slice(0, 10));
                    return (
                      <tr key={r.key} className="border-t border-line-soft">
                        <td className="px-3 py-2 font-semibold">{r.name}<span className="block text-xs font-normal text-muted">{r.company}{exp.length ? ' · ' : ''}{exp.length ? <span className="text-[#7A4B00]">expired ticket: {exp.map(x => x.name).join(', ')}</span> : ''}</span></td>
                        {linkedSwms.map(s => <td key={s.id} className={`px-3 py-2 ${CELL[r.cells[s.id]].cls}`}>{CELL[r.cells[s.id]].label}</td>)}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="text-xs text-muted">✓ signed on the current approved version · Again = signed an older version · — not yet signed. A lapsed ticket is flagged but never stops someone signing on.</div>
          {linkedSwms.length > 0 && (signSwms && signVersion ? (
            <div className="border border-line rounded-xl p-3.5">
              <h3 className="m-0 mb-3 text-sm font-bold">Sign someone on to {signSwms.title}</h3>
              <SignOnPanel swms={signSwms} version={signVersion} jobs={[job]} mode="office" people={d.people.map(p => ({ id: p.id, name: p.name }))} tickets={d.tickets} onDone={() => { setSigning(null); void reload(); }} />
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {linkedSwms.map(s => {
                const v = currentApproved(d.versions.filter(x => x.swms_id === s.id));
                return <button key={s.id} type="button" className={btn} disabled={!v || s.status !== 'active'} title={v ? '' : 'Not approved yet'} onClick={() => setSigning(s.id)}>Sign someone on: {s.swms_number || s.ref}</button>;
              })}
            </div>
          ))}
        </div>
      )}

      {tab === 'setup' && (
        <div className="flex flex-col gap-4">
          <section className="flex flex-col gap-2">
            <div className="flex items-center gap-2"><h3 className="m-0 text-sm font-bold">Details</h3><button type="button" className={`${btn} ml-auto`} onClick={() => setEditing(e => !e)}>{editing ? 'Close' : 'Edit'}</button></div>
            {editing && <JobForm job={job} sites={sites} onSaved={async () => { setEditing(false); await reload(); }} onCancel={() => setEditing(false)} />}
          </section>
          <section className="flex flex-col gap-2">
            <h3 className="m-0 text-sm font-bold">SWMS on this job</h3>
            <p className="m-0 text-xs text-muted">Only approved SWMS can be signed on to.</p>
            <div className="border border-line rounded-xl max-h-64 overflow-y-auto">
              {d.swms.filter(s => s.status === 'active' || linked.includes(s.id)).map(s => {
                const v = currentApproved(d.versions.filter(x => x.swms_id === s.id));
                return (
                  <label key={s.id} className="flex items-start gap-3 px-3 py-2 border-b border-line-soft last:border-0 min-h-11 cursor-pointer">
                    <input type="checkbox" className="mt-1 w-4 h-4" disabled={busy} checked={linked.includes(s.id)} onChange={() => void run(async () => setJobSwms(job.id, toggle(linked, s.id), linked))} />
                    <span className="flex-1 text-sm"><b>{s.swms_number || s.ref}</b> {s.title}</span>
                    {!v && <Pill tone="amber">Not approved</Pill>}
                  </label>
                );
              })}
              {d.swms.length === 0 && <p className="m-0 p-3 text-sm text-muted">No SWMS yet.</p>}
            </div>
          </section>
          <section className="flex flex-col gap-2">
            <h3 className="m-0 text-sm font-bold">Crew ({crewIds.length})</h3>
            <input type="search" aria-label="Find a worker" placeholder="Find a worker" value={find} onChange={e => setFind(e.target.value)} className="min-h-10 rounded-lg border border-[#D6D2CC] bg-white px-3 text-sm" />
            <div className="border border-line rounded-xl max-h-64 overflow-y-auto">
              {people.map(p => (
                <label key={p.id} className="flex items-center gap-3 px-3 py-2 border-b border-line-soft last:border-0 min-h-11 cursor-pointer">
                  <input type="checkbox" className="w-4 h-4" disabled={busy} checked={crewIds.includes(p.id)} onChange={() => void run(async () => setJobPeople(job.id, toggle(crewIds, p.id), crewIds))} />
                  <span className="text-sm">{p.name}{p.position && <span className="text-muted"> · {p.position}</span>}</span>
                </label>
              ))}
            </div>
            <p className="m-0 text-xs text-muted">Contractors are not on the crew list. A supervisor signs them on from the sign-on sheet.</p>
          </section>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btn} disabled={busy} onClick={() => void run(async () => updateJob(job.id, { status: job.status === 'active' ? 'closed' : 'active' }))}>{job.status === 'active' ? 'Close this job' : 'Reopen this job'}</button>
            {user.access === 'admin' && <button type="button" className={`${btn} text-[#9B1218] border-[#E3B7B7]`} onClick={async () => { if (await askConfirm({ title: `Delete ${job.ref}?`, body: 'This removes the job and its crew and SWMS links. Sign-ons already recorded are kept. Close it instead if the work is finished.', confirmLabel: 'Delete', danger: true })) { const r = await deleteJob(job.id); if (r.error) setError(r.error); else { await reload(); close(); } } }}>Delete</button>}
          </div>
        </div>
      )}
    </div>
  );
}
