import { useCallback, useEffect, useMemo, useState } from 'react';
import { listActions, listHazards, listIncidents } from '../services/records.ts';
import { listChecks } from '../services/checks.ts';
import { useSiteScope } from '../hooks/useSiteScope.tsx';
import { actionsInScope } from '../utils/siteScope.ts';
import type { WhsUser } from '../services/auth.ts';
import { hrefFor } from '../hooks/useRoute.ts';
import { isOfficeAccess } from '../utils/access.ts';
import { formatDay } from '../utils/dates.ts';
import { looseMatch } from '../utils/search.ts';
import { csvFor, downloadCsv } from '../utils/csv.ts';
import { actionCounts, actionPill, actionState, sortActions, type WhsAction } from '../utils/records.ts';
import { DoneDialog } from './ActionsPanel.tsx';
import { ErrorNote } from './Form.tsx';
import { Pill } from './Pill.tsx';
import { ActionDetail } from './ActionDetail.tsx';
import { SidePanel, rowOpens, useListPanel } from './SidePanel.tsx';

type View = 'overdue' | 'due_soon' | 'open' | 'done';

const th = 'px-2 py-3 font-semibold border-b border-[#EEEBE6] text-left';
const td = 'px-2 py-3.5 border-b border-line-soft align-top';

function sourceHref(a: WhsAction): string | null {
  if (!a.source_id) return null;
  if (a.source_type === 'incident') return hrefFor({ name: 'incident', id: a.source_id });
  if (a.source_type === 'hazard') return hrefFor({ name: 'hazard', id: a.source_id });
  if (a.source_type === 'inspection') return hrefFor({ name: 'check', id: a.source_id });
  return null;
}

/** Every corrective action, from every module, in one list. */
export function ActionsPage({ user }: { user: WhsUser }) {
  const office = isOfficeAccess(user.access);
  const { site } = useSiteScope();
  const [allActions, setActions] = useState<WhsAction[]>([]);
  const [sources, setSources] = useState<{ id: string; site_id: string | null; site_name: string }[]>([]);
  const actions = useMemo(() => actionsInScope(site, allActions, sources), [allActions, sources, site]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<View>('open');
  const [mine, setMine] = useState(!office);
  const [from, setFrom] = useState('all');
  const [q, setQ] = useState('');
  const [finishing, setFinishing] = useState<WhsAction | null>(null);

  const load = useCallback(async () => {
    const res = await listActions();
    setError(res.error ?? null);
    setActions(res.data ?? []);
    // Which site an action belongs to comes from what it was raised against
    const [i, h, c] = await Promise.all([listIncidents(), listHazards(), listChecks(365)]);
    setSources([...(i.data ?? []), ...(h.data ?? []), ...(c.data ?? [])].map(s => ({ id: s.id, site_id: s.site_id, site_name: s.site_name })));
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = actionCounts(actions);
  const shown = useMemo(() => {
    const now = new Date();
    return sortActions(
      actions.filter(a => {
        const s = actionState(a, now);
        if (view === 'overdue' && s !== 'overdue') return false;
        if (view === 'due_soon' && s !== 'due_soon') return false;
        if (view === 'open' && s === 'done') return false;
        if (view === 'done' && s !== 'done') return false;
        if (mine && a.owner_id !== user.id) return false;
        if (from !== 'all' && a.source_type !== from) return false;
        return looseMatch(q, [a.title, a.source_ref, a.owner_name, a.unit_no]);
      }),
      now
    );
  }, [actions, view, mine, from, q, user.id]);

  const panel = useListPanel(() => shown.map(a => a.id));
  const openAction = panel.openId ? actions.find(a => a.id === panel.openId) ?? null : null;

  const cards: { id: View; label: string; value: number; alert?: boolean }[] = [
    { id: 'overdue', label: 'Overdue', value: counts.overdue, alert: true },
    { id: 'due_soon', label: 'Due this week', value: counts.dueSoon },
    { id: 'open', label: 'Open', value: counts.open },
    { id: 'done', label: 'Done this month', value: counts.doneThisMonth },
  ];

  return (
    <div className="flex gap-5 items-start">
    <div className="flex-1 min-w-0 flex flex-col gap-4.5">
      <div className="flex flex-wrap justify-between items-end gap-3">
        <div>
          <h1 className="m-0 text-[26px] font-bold">Actions</h1>
          <p className="mt-1.5 mb-0 text-muted text-[15px]">{site ? `Fixes from ${site.name} incidents, hazards and inspections. Actions added by hand show under All sites.` : 'Every fix from incidents, hazards and inspections, in one list.'}</p>
        </div>
        <button type="button" className="min-h-11 px-3.5 rounded-lg border border-[#D6D2CC] bg-white text-sm font-semibold cursor-pointer"
          onClick={() => downloadCsv('actions.csv', csvFor(['Action', 'Unit', 'Came from', 'Owner', 'Due', 'Status', 'Done note'],
            shown.map(a => [a.title, a.unit_no, a.source_ref, a.owner_name, formatDay(a.due), actionPill(a).label, a.done_note])))}>
          Export CSV
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map(c => (
          <button key={c.id} type="button" aria-pressed={view === c.id} onClick={() => setView(c.id)}
            className={`text-left cursor-pointer bg-white rounded-xl px-4 py-3.5 ${view === c.id ? 'border-2 border-ink' : 'border border-line'}`}>
            <span className="block text-muted text-[13px]">{c.label}</span>
            <span className={`block text-[26px] font-bold mt-0.5 ${c.alert && c.value > 0 ? 'text-finlay' : 'text-ink'}`}>{c.value}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2.5 items-center">
        <label htmlFor="act-q" className="sr-only">Search actions</label>
        <input id="act-q" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search actions"
          className="flex-[1_1_220px] max-w-[320px] min-h-11 rounded-lg border border-[#D6D2CC] bg-white px-3 text-sm" />
        {office && (
          <select aria-label="Owner" value={mine ? 'mine' : 'all'} onChange={e => setMine(e.target.value === 'mine')} className="min-h-11 rounded-lg border border-[#D6D2CC] bg-white px-2.5 text-[13px]">
            <option value="all">Anyone</option>
            <option value="mine">Mine</option>
          </select>
        )}
        <select aria-label="Came from" value={from} onChange={e => setFrom(e.target.value)} className="min-h-11 rounded-lg border border-[#D6D2CC] bg-white px-2.5 text-[13px]">
          <option value="all">From anything</option>
          <option value="incident">Incidents</option>
          <option value="hazard">Hazards</option>
          <option value="inspection">Inspections</option>
        </select>
      </div>

      <ErrorNote message={error} />

      <div className="bg-white border border-line rounded-xl overflow-x-auto">
        <table className="w-full border-collapse text-sm min-w-[820px]">
          <thead>
            <tr className="text-muted text-xs uppercase tracking-wide">
              <th scope="col" className={`${th} pl-4`}>Action</th><th scope="col" className={th}>Came from</th><th scope="col" className={th}>Owner</th>
              <th scope="col" className={th}>Due</th><th scope="col" className={th}>Status</th><th scope="col" className={`${th} pr-4`}><span className="sr-only">Mark done</span></th>
            </tr>
          </thead>
          <tbody>
            {shown.map(a => {
              const pill = actionPill(a);
              const late = pill.label === 'Overdue';
              const href = sourceHref(a);
              return (
                <tr key={a.id} onClick={e => rowOpens(e, () => panel.setOpenId(a.id))} aria-selected={panel.openId === a.id} className={`cursor-pointer ${panel.openId === a.id ? 'bg-finlay-soft' : 'hover:bg-[#FAFAF9]'}`}>
                  <td className={`${td} pl-4`}>
                    <span className="block font-medium">{a.title} {a.unit_no && <span className="text-finlay font-bold">{a.unit_no}</span>}</span>
                    {a.status === 'done' && a.done_note && <span className="block text-[13px] text-muted mt-0.5">{a.done_note}</span>}
                  </td>
                  <td className={`${td} whitespace-nowrap text-[13px]`}>{href ? <a href={href}>{a.source_ref}</a> : a.source_ref || '—'}</td>
                  <td className={`${td} whitespace-nowrap text-muted`}>{a.owner_name || '—'}</td>
                  <td className={`${td} whitespace-nowrap ${late ? 'text-[#8E0F15] font-bold' : ''}`}>{formatDay(a.due) || '—'}</td>
                  <td className={`${td} whitespace-nowrap`}><Pill tone={pill.tone}>{pill.label}</Pill></td>
                  <td className={`${td} pr-4 whitespace-nowrap text-right`}>
                    {a.status !== 'done' && (office || a.owner_id === user.id) && (
                      <button type="button" onClick={() => setFinishing(a)} className="min-h-10 px-3 rounded-lg border border-line bg-white text-[13px] font-semibold cursor-pointer">Mark done</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {loaded && shown.length === 0 && <p className="m-0 px-4 py-8 text-sm text-muted text-center">Nothing here.</p>}
      </div>

      <p className="m-0 text-[13px] text-muted">Add actions from an incident or hazard page, so each fix stays linked to why it was needed.</p>

      <DoneDialog action={finishing} onClose={() => setFinishing(null)} onDone={() => { setFinishing(null); load(); }} />
    </div>
    {openAction && (
      <SidePanel label="Action" fullHref={hrefFor({ name: 'module', id: 'actions' })} onClose={panel.close}>
        <ActionDetail key={openAction.id} action={openAction} user={user} sourceHref={sourceHref(openAction)} onChanged={() => void load()} onDeleted={() => { panel.close(); void load(); }} />
      </SidePanel>
    )}
    </div>
  );
}
