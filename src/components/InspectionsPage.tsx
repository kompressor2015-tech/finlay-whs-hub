import { useEffect, useMemo, useState } from 'react';
import { createChecklist, listChecklists, listChecks } from '../services/checks.ts';
import { useSiteScope } from '../hooks/useSiteScope.tsx';
import { inScope } from '../utils/siteScope.ts';
import type { WhsUser } from '../services/auth.ts';
import { go, hrefFor } from '../hooks/useRoute.ts';
import { brisbaneDay, daysUntil, formatDay, formatWhen } from '../utils/dates.ts';
import { looseMatch } from '../utils/search.ts';
import { csvFor, downloadCsv } from '../utils/csv.ts';
import { resultPill, siteInspectionsDue, type Check, type Checklist } from '../utils/checks.ts';
import { ErrorNote } from './Form.tsx';
import { Pill } from './Pill.tsx';

type Tab = 'prestart' | 'take5' | 'site';
const th = 'px-2 py-3 font-semibold border-b border-[#EEEBE6] text-left';
const td = 'px-2 py-3 border-b border-line-soft align-top';

export function InspectionsPage({ user }: { user: WhsUser }) {
  const officer = user.access === 'admin' || user.access === 'whs_officer';
  const { site } = useSiteScope();
  const [allChecks, setChecks] = useState<Check[]>([]);
  const [allChecklists, setChecklists] = useState<Checklist[]>([]);
  // Pre-starts are by machine, not site, so they stay in; Take 5s and site inspections follow the site
  const checks = useMemo(() => allChecks.filter(c => c.kind === 'prestart' || inScope(site, c)), [allChecks, site]);
  const checklists = useMemo(() => allChecklists.filter(c => inScope(site, c)), [allChecklists, site]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>('prestart');
  const [q, setQ] = useState('');

  useEffect(() => {
    Promise.all([listChecks(90), listChecklists()]).then(([c, l]) => {
      setError(c.error ?? l.error ?? null);
      setChecks(c.data ?? []);
      setChecklists(l.data ?? []);
      setLoaded(true);
    });
  }, []);

  const now = new Date();
  const today = brisbaneDay(now);
  const lastWeek = (c: Check) => daysUntil(brisbaneDay(c.done_at), now) > -7;
  const prestartsToday = checks.filter(c => c.kind === 'prestart' && brisbaneDay(c.done_at) === today).length;
  const faultsWeek = checks.filter(c => c.kind === 'prestart' && c.result !== 'ok' && lastWeek(c));
  const take5Week = checks.filter(c => c.kind === 'take5' && lastWeek(c));
  const due = siteInspectionsDue(checklists, checks, now);
  const overdue = due.filter(d => d.state === 'overdue' || d.state === 'never').length;

  const shown = useMemo(
    () => checks.filter(c => c.kind === tab && looseMatch(q, [c.unit_no, c.done_by_name, c.task, c.checklist_name, c.site_name])),
    [checks, tab, q]
  );

  async function newSiteChecklist() {
    const res = await createChecklist({ kind: 'site', name: 'Site inspection: new site', site_name: '', frequency_days: 30, items: [] });
    if (res.error || !res.data) return setError(res.error ?? 'Could not create it.');
    go({ name: 'checklist', id: res.data.id });
  }

  function exportCsv() {
    const rows = shown.map(c => [formatWhen(c.done_at), c.kind === 'site' ? c.checklist_name : c.kind === 'take5' ? c.task : c.unit_no, c.done_by_name, resultPill(c.kind, c.result, c.issue_count).label, c.issue_count]);
    downloadCsv(`${tab}s.csv`, csvFor(['When', tab === 'prestart' ? 'Unit' : tab === 'take5' ? 'Task' : 'Inspection', 'Done by', 'Result', 'Issues'], rows));
  }

  const stats = [
    { label: 'Pre-starts today', value: prestartsToday, sub: 'all units', alert: false },
    { label: 'Pre-start faults this week', value: faultsWeek.length, sub: `${faultsWeek.filter(c => c.result === 'stop').length} critical`, alert: faultsWeek.some(c => c.result === 'stop') },
    { label: 'Take 5s this week', value: take5Week.length, sub: `${take5Week.filter(c => c.result === 'stop').length} said "not safe"`, alert: false },
    { label: 'Site inspections due', value: overdue, sub: overdue ? 'overdue' : 'none overdue', alert: overdue > 0 },
  ];

  return (
    <div className="flex flex-col gap-4.5">
      <div className="flex flex-wrap justify-between items-end gap-3">
        <div>
          <h1 className="m-0 text-[26px] font-bold">Inspections &amp; checks</h1>
          <p className="mt-1.5 mb-0 text-muted text-[15px]">Daily pre-starts, Take 5s and site inspections (last 90 days).</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button type="button" onClick={exportCsv} className="min-h-11 px-3.5 rounded-lg border border-[#D6D2CC] bg-white text-sm font-semibold cursor-pointer">Export CSV</button>
          <a href={hrefFor({ name: 'check', id: 'new-take5' })} className="no-underline min-h-11 px-3.5 rounded-lg border border-[#D6D2CC] bg-white text-sm font-semibold flex items-center">Take 5</a>
          <a href={hrefFor({ name: 'check', id: 'new-prestart' })} className="no-underline min-h-11 px-4 rounded-lg bg-finlay hover:bg-finlay-dark text-white text-sm font-semibold flex items-center">Start a pre-start</a>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map(s => (
          <div key={s.label} className="bg-white border border-line rounded-xl px-4 py-3.5">
            <div className="text-muted text-[13px]">{s.label}</div>
            <div className={`text-[26px] font-bold mt-0.5 ${s.alert ? 'text-finlay' : ''}`}>{s.value}</div>
            <div className="text-muted text-xs mt-0.5">{s.sub}</div>
          </div>
        ))}
      </div>

      <ErrorNote message={error} />

      <div className="flex flex-wrap gap-5 items-start">
        <div className="flex-[2_1_560px] min-w-0 flex flex-col gap-3">
          <div role="tablist" className="flex gap-1 border-b border-line">
            {([['prestart', 'Pre-starts'], ['take5', 'Take 5s'], ['site', 'Site inspections']] as [Tab, string][]).map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
                className={`bg-transparent border-0 border-b-2 px-3.5 py-2.5 text-[15px] cursor-pointer ${tab === id ? 'border-finlay font-semibold text-ink' : 'border-transparent text-muted'}`}>
                {label}
              </button>
            ))}
          </div>
          <label htmlFor="ins-q" className="sr-only">Search</label>
          <input id="ins-q" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search by unit, person or task"
            className="max-w-[360px] min-h-11 rounded-lg border border-[#D6D2CC] bg-white px-3 text-sm" />
          <div className="bg-white border border-line rounded-xl overflow-x-auto">
            <table className="w-full border-collapse text-sm min-w-[640px]">
              <thead>
                <tr className="text-muted text-xs uppercase tracking-wide">
                  <th scope="col" className={`${th} pl-4`}>When</th>
                  <th scope="col" className={th}>{tab === 'prestart' ? 'Unit' : tab === 'take5' ? 'Task' : 'Inspection'}</th>
                  <th scope="col" className={th}>Done by</th>
                  <th scope="col" className={`${th} pr-4`}>Result</th>
                </tr>
              </thead>
              <tbody>
                {shown.map(c => {
                  const p = resultPill(c.kind, c.result, c.issue_count);
                  return (
                    <tr key={c.id}>
                      <td className={`${td} pl-4 whitespace-nowrap text-muted`}><a href={hrefFor({ name: 'check', id: c.id })}>{formatWhen(c.done_at)}</a></td>
                      <td className={td}>
                        {c.kind === 'prestart' ? <span className="text-finlay font-bold">{c.unit_no}</span> : c.kind === 'take5' ? c.task : c.checklist_name}
                        {c.kind === 'take5' && c.unit_no && <span className="text-finlay font-bold"> {c.unit_no}</span>}
                      </td>
                      <td className={`${td} whitespace-nowrap text-muted`}>{c.done_by_name}</td>
                      <td className={`${td} pr-4 whitespace-nowrap`}><Pill tone={p.tone}>{p.label}</Pill></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {loaded && shown.length === 0 && <p className="m-0 px-4 py-8 text-sm text-muted text-center">Nothing recorded yet.</p>}
          </div>
        </div>

        <div className="flex-[1_1_300px] min-w-0 flex flex-col gap-5">
          <section className="bg-white border border-line rounded-xl overflow-hidden">
            <h2 className="m-0 px-4.5 py-4 border-b border-[#EEEBE6] text-[17px] font-semibold">Site inspections</h2>
            {due.length === 0 && <p className="m-0 px-4.5 py-4 text-sm text-muted">No site checklists yet.</p>}
            {due.map(d => {
              const tone = d.state === 'overdue' || d.state === 'never' ? 'red' : d.state === 'due_soon' ? 'amber' : 'green';
              const label = d.state === 'never' ? 'Not done yet' : d.state === 'overdue' ? 'Overdue' : d.due ? `Due ${formatDay(d.due)}` : 'Any time';
              return (
                <div key={d.checklist.id} className="px-4.5 py-3.5 border-b border-line-soft last:border-b-0 flex items-center gap-3">
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold">{d.checklist.name}</span>
                    <span className="block text-[13px] text-muted mt-0.5">{d.lastDone ? `last ${formatWhen(d.lastDone)}` : 'never done in this app'}</span>
                  </span>
                  <Pill tone={tone}>{label}</Pill>
                  <a href={hrefFor({ name: 'check', id: `new-site-${d.checklist.id}` })} className="no-underline text-[13px] font-semibold border border-[#D6D2CC] rounded-lg px-2.5 min-h-10 flex items-center">Start</a>
                </div>
              );
            })}
          </section>

          {officer && (
            <section className="bg-white border border-line rounded-xl px-4.5 py-4">
              <h2 className="mt-0 mb-2 text-[15px] font-semibold">Checklists</h2>
              <p className="mt-0 mb-2.5 text-[13px] text-muted leading-relaxed">Change the questions here. Old checks keep the questions they were done with.</p>
              <ul className="m-0 p-0 list-none flex flex-col gap-1 text-sm">
                {checklists.map(c => (
                  <li key={c.id} className="flex justify-between gap-2 min-h-10 items-center">
                    <span>{c.name} {!c.active && <span className="text-muted">(off)</span>}</span>
                    <a href={hrefFor({ name: 'checklist', id: c.id })} className="text-[13px]">Edit</a>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={newSiteChecklist} className="mt-2 bg-transparent border-0 text-sm font-semibold text-finlay cursor-pointer min-h-10 p-0">+ New site checklist</button>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
