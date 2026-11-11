import { useEffect, useMemo, useState } from 'react';
import { listActions, listHazards, listIncidents } from '../services/records.ts';
import { hrefFor } from '../hooks/useRoute.ts';
import { formatDate, formatDay } from '../utils/dates.ts';
import { looseMatch } from '../utils/search.ts';
import { csvFor, downloadCsv } from '../utils/csv.ts';
import { hazardFixBy, hazardStatus, incidentStatus, incidentStatusFor, incidentTypeLabel, riskFor, type Hazard, type Incident, type WhsAction } from '../utils/records.ts';
import type { WhsUser } from '../services/auth.ts';
import { ErrorNote } from './Form.tsx';
import { HazardPage } from './HazardPage.tsx';
import { IncidentPage } from './IncidentPage.tsx';
import { SidePanel, linkOpens, rowOpens, useListPanel } from './SidePanel.tsx';
import { Pill } from './Pill.tsx';
import { useSiteScope } from '../hooks/useSiteScope.tsx';
import { actionsInScope, inScope } from '../utils/siteScope.ts';

type Tab = 'incidents' | 'hazards';
type Filter = 'open' | 'notifiable' | 'injury' | 'near_miss' | 'all';

const th = 'px-2 py-3 font-semibold border-b border-[#EEEBE6] text-left';
const td = 'px-2 py-3.5 border-b border-line-soft align-top';

/** The incident and hazard registers, as two tabs. */
export function RegisterPage({ tab, user }: { tab: Tab; user: WhsUser }) {
  const { site } = useSiteScope();
  const [allIncidents, setIncidents] = useState<Incident[]>([]);
  const [allHazards, setHazards] = useState<Hazard[]>([]);
  const [allActions, setActions] = useState<WhsAction[]>([]);
  const incidents = useMemo(() => allIncidents.filter(i => inScope(site, i)), [allIncidents, site]);
  const hazards = useMemo(() => allHazards.filter(h => inScope(site, h)), [allHazards, site]);
  const actions = useMemo(() => actionsInScope(site, allActions, [...incidents, ...hazards]), [allActions, incidents, hazards, site]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('open');

  const load = () =>
    Promise.all([listIncidents(), listHazards(), listActions()]).then(([i, h, a]) => {
      setError(i.error ?? h.error ?? null);
      setIncidents(i.data ?? []);
      setHazards(h.data ?? []);
      setActions(a.data ?? []);
      setLoaded(true);
    });
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Changes made in the panel (status, actions) show in the list when it closes
  const panel = useListPanel(() => (tab === 'incidents' ? shownIncidents : shownHazards).map(x => x.id), () => void load());
  // A panel opened on one tab does not follow you to the other
  useEffect(() => panel.setOpenId(null), [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const actionsFor = (id: string) => {
    const list = actions.filter(a => a.source_id === id);
    return list.length ? `${list.filter(a => a.status === 'done').length} of ${list.length} done` : '—';
  };

  const shownIncidents = useMemo(
    () =>
      incidents.filter(i => {
        if (filter === 'open' && i.status === 'closed') return false;
        if (filter === 'notifiable' && !i.notifiable) return false;
        if (filter === 'injury' && i.type !== 'injury') return false;
        if (filter === 'near_miss' && i.type !== 'near_miss') return false;
        return looseMatch(q, [i.ref, i.description, i.site_name, i.unit_no, i.people, i.reporter_name]);
      }),
    [incidents, filter, q]
  );
  const shownHazards = useMemo(
    () => hazards.filter(h => (filter !== 'open' || h.status !== 'closed') && looseMatch(q, [h.ref, h.description, h.site_name, h.unit_no, h.reporter_name])),
    [hazards, filter, q]
  );

  const year = new Date().getFullYear().toString();
  const notifiableThisYear = incidents.filter(i => i.notifiable && i.occurred_at.startsWith(year)).length;
  const filters: { id: Filter; label: string }[] =
    tab === 'incidents'
      ? [{ id: 'open', label: 'Open' }, { id: 'notifiable', label: 'Notifiable' }, { id: 'injury', label: 'Injuries' }, { id: 'near_miss', label: 'Near misses' }, { id: 'all', label: 'All' }]
      : [{ id: 'open', label: 'Open' }, { id: 'all', label: 'All' }];

  function exportCsv() {
    if (tab === 'incidents') {
      downloadCsv('incidents.csv', csvFor(
        ['Ref', 'Date', 'Type', 'Site', 'Unit', 'What happened', 'Notifiable', 'WHSQ reference', 'Status', 'Reported by'],
        shownIncidents.map(i => [i.ref, formatDate(i.occurred_at), incidentTypeLabel(i.type), i.site_name, i.unit_no, i.description, i.notifiable ? 'Yes' : 'No', i.whsq_reference, incidentStatusFor(i, actions.filter(a => a.source_id === i.id)).label, i.reporter_name])
      ));
    } else {
      downloadCsv('hazards.csv', csvFor(
        ['Ref', 'Date', 'Hazard', 'Site', 'Unit', 'Risk', 'Fix by', 'Status', 'Reported by'],
        shownHazards.map(h => [h.ref, formatDate(h.created_at), h.description, h.site_name, h.unit_no, riskFor(h.severity).label, formatDay(hazardFixBy(h)), hazardStatus(h.status).label, h.reporter_name])
      ));
    }
  }

  const rowCls = (id: string) => `cursor-pointer ${panel.openId === id ? 'bg-finlay-soft' : 'hover:bg-[#FAFAF9]'}`;

  return (
    <div className="flex gap-5 items-start">
    <div className="flex-1 min-w-0 flex flex-col gap-4.5">
      <div className="flex flex-wrap justify-between items-end gap-3">
        <div>
          <h1 className="m-0 text-[26px] font-bold">{tab === 'incidents' ? 'Incidents' : 'Hazards'}{site && <span className="text-finlay-dark font-semibold"> · {site.name}</span>}</h1>
          <p className="mt-1.5 mb-0 text-muted text-[15px]">
            {tab === 'incidents'
              ? `${incidents.filter(i => i.status !== 'closed').length} open · ${notifiableThisYear} notifiable this year · ${incidents.length} in total`
              : `${hazards.filter(h => h.status === 'new').length} to review · ${hazards.filter(h => h.status !== 'closed').length} open · ${hazards.length} in total`}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button type="button" onClick={exportCsv} className="min-h-11 px-3.5 rounded-lg border border-[#D6D2CC] bg-white text-sm font-semibold cursor-pointer">Export CSV</button>
          <a href={hrefFor({ name: tab === 'incidents' ? 'incident' : 'hazard', id: 'new' })} className="no-underline min-h-11 px-4 rounded-lg bg-finlay hover:bg-finlay-dark text-white text-sm font-semibold flex items-center">
            {tab === 'incidents' ? 'Report an incident' : 'Report a hazard'}
          </a>
        </div>
      </div>

      <div role="tablist" className="flex gap-1 border-b border-line">
        {(['incidents', 'hazards'] as Tab[]).map(t => (
          <a key={t} role="tab" aria-selected={tab === t} href={hrefFor({ name: 'module', id: t })}
            className={`no-underline px-3.5 py-2.5 text-[15px] border-b-2 ${tab === t ? 'border-finlay font-semibold text-ink' : 'border-transparent text-muted'}`}>
            {t === 'incidents' ? 'Incidents' : 'Hazards'} <span className="text-muted font-medium">{t === 'incidents' ? incidents.length : hazards.length}</span>
          </a>
        ))}
      </div>

      <div className="flex flex-wrap gap-2.5 items-center">
        <label htmlFor="reg-q" className="sr-only">Search</label>
        <input id="reg-q" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search by words, unit or person"
          className="flex-[1_1_240px] max-w-[360px] min-h-11 rounded-lg border border-[#D6D2CC] bg-white px-3 text-sm" />
        {filters.map(f => (
          <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}
            className={`min-h-10 px-3.5 rounded-full text-[13px] font-semibold cursor-pointer border ${filter === f.id ? 'bg-ink text-white border-ink' : 'bg-white text-ink border-[#D6D2CC]'}`}>
            {f.label}
          </button>
        ))}
      </div>

      <ErrorNote message={error} />

      <div className="bg-white border border-line rounded-xl overflow-x-auto">
        {tab === 'incidents' ? (
          <table className="w-full border-collapse text-sm min-w-[820px]">
            <thead>
              <tr className="text-muted text-xs uppercase tracking-wide">
                <th scope="col" className={`${th} pl-4`}>Ref</th><th scope="col" className={th}>Date</th><th scope="col" className={th}>Type</th>
                <th scope="col" className={th}>What happened</th><th scope="col" className={th}>Unit</th><th scope="col" className={th}>Actions</th>
                <th scope="col" className={`${th} pr-4`}>Status</th>
              </tr>
            </thead>
            <tbody>
              {shownIncidents.map(i => {
                const s = incidentStatusFor(i, actions.filter(a => a.source_id === i.id));
                return (
                  <tr key={i.id} onClick={e => rowOpens(e, () => panel.setOpenId(i.id))} aria-selected={panel.openId === i.id} className={rowCls(i.id)}>
                    <td className={`${td} pl-4 whitespace-nowrap`}><a href={hrefFor({ name: 'incident', id: i.id })} onClick={e => linkOpens(e, () => panel.setOpenId(i.id))} className="font-semibold">{i.ref}</a></td>
                    <td className={`${td} whitespace-nowrap text-muted`}>{formatDate(i.occurred_at)}</td>
                    <td className={`${td} whitespace-nowrap`}>{incidentTypeLabel(i.type)}</td>
                    <td className={td}>
                      <span className="block font-medium">{i.description}</span>
                      <span className="block text-[13px] text-muted mt-0.5">{i.site_name}</span>
                      {i.notifiable && <span className="inline-block mt-1.5 text-[11px] font-bold tracking-wide px-2 py-0.5 rounded-full bg-finlay text-white">NOTIFIABLE</span>}
                    </td>
                    <td className={`${td} whitespace-nowrap text-finlay font-bold`}>{i.unit_no || '—'}</td>
                    <td className={`${td} whitespace-nowrap text-muted`}>{actionsFor(i.id)}</td>
                    <td className={`${td} pr-4 whitespace-nowrap`}><Pill tone={s.tone}>{s.label}</Pill></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <table className="w-full border-collapse text-sm min-w-[820px]">
            <thead>
              <tr className="text-muted text-xs uppercase tracking-wide">
                <th scope="col" className={`${th} pl-4`}>Ref</th><th scope="col" className={th}>Date</th><th scope="col" className={th}>Hazard</th>
                <th scope="col" className={th}>Unit</th><th scope="col" className={th}>Risk</th><th scope="col" className={th}>Fix by</th>
                <th scope="col" className={`${th} pr-4`}>Status</th>
              </tr>
            </thead>
            <tbody>
              {shownHazards.map(h => {
                const s = hazardStatus(h.status);
                const r = riskFor(h.severity);
                return (
                  <tr key={h.id} onClick={e => rowOpens(e, () => panel.setOpenId(h.id))} aria-selected={panel.openId === h.id} className={rowCls(h.id)}>
                    <td className={`${td} pl-4 whitespace-nowrap`}><a href={hrefFor({ name: 'hazard', id: h.id })} onClick={e => linkOpens(e, () => panel.setOpenId(h.id))} className="font-semibold">{h.ref}</a></td>
                    <td className={`${td} whitespace-nowrap text-muted`}>{formatDate(h.created_at)}</td>
                    <td className={td}><span className="block font-medium">{h.description}</span><span className="block text-[13px] text-muted mt-0.5">{h.site_name}</span></td>
                    <td className={`${td} whitespace-nowrap text-finlay font-bold`}>{h.unit_no || '—'}</td>
                    <td className={`${td} whitespace-nowrap`}><Pill tone={r.tone}>{r.label}</Pill></td>
                    <td className={`${td} whitespace-nowrap text-muted`}>{formatDay(hazardFixBy(h))}</td>
                    <td className={`${td} pr-4 whitespace-nowrap`}><Pill tone={s.tone}>{s.label}</Pill></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {loaded && (tab === 'incidents' ? shownIncidents : shownHazards).length === 0 && (
          <p className="m-0 px-4 py-8 text-sm text-muted text-center">{q || filter !== 'open' ? 'Nothing matches.' : `No open ${tab}.`}</p>
        )}
      </div>
    </div>
    {panel.openId && (
      <SidePanel label={tab === 'incidents' ? 'Incident' : 'Hazard'} fullHref={hrefFor({ name: tab === 'incidents' ? 'incident' : 'hazard', id: panel.openId })} onClose={panel.close}>
        {tab === 'incidents' ? <IncidentPage key={panel.openId} id={panel.openId} user={user} embedded /> : <HazardPage key={panel.openId} id={panel.openId} user={user} embedded />}
      </SidePanel>
    )}
    </div>
  );
}
