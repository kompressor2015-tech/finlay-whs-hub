import { useCallback, useEffect, useState } from 'react';
import { getIncident, listActions, listHistory, photoLinks, updateIncident } from '../services/records.ts';
import type { WhsUser } from '../services/auth.ts';
import { useLookups } from '../hooks/useLookups.ts';
import { hrefFor } from '../hooks/useRoute.ts';
import { isOfficeAccess } from '../utils/access.ts';
import { addDays, brisbaneDay, formatDate, formatDay, formatLongDate, formatTime, formatWhen } from '../utils/dates.ts';
import {
  FACTORS, NOTIFIABLE_REASONS, WHSQ_PHONE, WHSQ_TEL, canClose, incidentStatus, incidentSteps, incidentTypeLabel,
  keepRecordUntil, notifiableSummary, type HistoryEntry, type Incident, type WhsAction,
} from '../utils/records.ts';
import { listClaims } from '../services/claims.ts';
import { listIncidentPeople } from '../services/incidentFile.ts';
import { claimAttention, type Claim } from '../utils/claims.ts';
import { closeBlockers, incidentAttention, investigationProgress, needsFullInvestigation, type IncidentPerson } from '../utils/incidentFile.ts';
import { ActionsPanel } from './ActionsPanel.tsx';
import { IncidentPeopleTab } from './IncidentPeopleTab.tsx';
import { DocumentsTab, TimelineTab, useFileData } from './IncidentFileTabs.tsx';
import { InvestigationTab } from './InvestigationTab.tsx';
import { ErrorNote, Field, inputClass } from './Form.tsx';
import { Pill } from './Pill.tsx';

const card = 'bg-white border border-line rounded-xl';
type Tab = 'overview' | 'investigation' | 'people' | 'timeline' | 'documents' | 'actions';
const smallButton = 'min-h-11 px-4 rounded-lg text-sm font-semibold cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed';

export function IncidentPage({ id, user, embedded }: { id: string; user: WhsUser; embedded?: boolean }) {
  const { people } = useLookups();
  const office = isOfficeAccess(user.access);
  const officer = user.access === 'admin' || user.access === 'whs_officer';
  const [incident, setIncident] = useState<Incident | null>(null);
  const [actions, setActions] = useState<WhsAction[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');
  const [ipeople, setIpeople] = useState<IncidentPerson[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [version, setVersion] = useState(0);
  const tabbed = office && !embedded;
  const fileData = useFileData(id, claims, officer && tabbed, version);
  // Investigation draft
  const [lead, setLead] = useState('');
  const [due, setDue] = useState('');
  const [whys, setWhys] = useState<string[]>([]);
  const [factors, setFactors] = useState<string[]>([]);
  // WHSQ draft
  const [whsqRef, setWhsqRef] = useState('');
  const [releasedBy, setReleasedBy] = useState('');

  const load = useCallback(async () => {
    const res = await getIncident(id);
    if (res.error || !res.data) return setError(res.error ?? 'Not found');
    const inc = res.data;
    setIncident(inc);
    setLead(inc.investigation_lead ?? '');
    setDue(inc.investigation_due ?? '');
    setWhys(inc.why_chain.length ? inc.why_chain : ['']);
    setFactors(inc.factors);
    setWhsqRef(inc.whsq_reference);
    setReleasedBy(inc.site_released_by);
    const [acts, hist, links, ppl, cl] = await Promise.all([listActions({ type: 'incident', id }), office ? listHistory('incident', id) : Promise.resolve([]), photoLinks(inc.photos), office ? listIncidentPeople(id) : Promise.resolve({ data: [] as IncidentPerson[] }), officer ? listClaims({ incidentId: id }) : Promise.resolve({ data: [] as Claim[] })]);
    setIpeople(ppl.data ?? []);
    setClaims(cl.data ?? []);
    setVersion(v => v + 1);
    setActions(acts.data ?? []);
    setHistory(hist);
    setPhotos(links);
  }, [id, office, officer]);

  useEffect(() => {
    load();
  }, [load]);

  async function save(patch: Partial<Incident>) {
    setSaving(true);
    setError(null);
    const res = await updateIncident(id, patch);
    setSaving(false);
    if (res.error) return setError(res.error);
    await load();
  }

  if (!incident) {
    return error ? <ErrorNote message={error} /> : <p className="text-muted text-sm">Loading…</p>;
  }

  const status = incidentStatus(incident.status);
  const steps = incidentSteps(incident, actions);
  const closable = tabbed ? closeBlockers(incident, actions, officer ? claims : null).length === 0 : canClose(incident, actions);
  const blockers = tabbed ? closeBlockers(incident, actions, officer ? claims : null) : [];
  const full = needsFullInvestigation(incident);
  const prog = investigationProgress(incident);
  const attention = [
    ...incidentAttention(incident, fileData.statements).map(a => ({ id: a.id, tone: a.tone, when: a.when, what: a.what })),
    ...(officer ? claims.flatMap(c => claimAttention(c, fileData.certs.filter(x => x.claim_id === c.id), incident.occurred_at).map(a => ({ id: `${c.id}-${a.id}`, tone: a.tone, when: a.when, what: a.what }))) : []),
  ];
  const toneBg: Record<string, string> = { red: 'bg-[#FDE8E8] text-[#9B1218]', amber: 'bg-[#FFF1D6] text-[#7A4B00]', green: 'bg-[#E3F4E6] text-[#1F6B2E]', blue: 'bg-[#E4EEFC] text-[#1C4A8F]', grey: 'bg-[#ECECEC] text-[#4A4A50]' };
  const tabs: { id: Tab; label: string; badge?: string }[] = [
    { id: 'overview', label: 'Overview' },
    ...(incident.status !== 'new' ? [{ id: 'investigation' as Tab, label: 'Investigation', badge: incident.investigation_waived ? 'Not required' : `${prog.done}/${prog.total}` }] : []),
    { id: 'people', label: officer ? 'People and claims' : 'People', badge: ipeople.length ? String(ipeople.length) : undefined },
    { id: 'timeline', label: 'Timeline' },
    { id: 'documents', label: 'Documents' },
    { id: 'actions', label: 'Actions', badge: actions.length ? `${actions.filter(a => a.status === 'done').length}/${actions.length}` : undefined },
  ];
  const reload = async () => { await load(); };
  const actionsPanel = (
    <ActionsPanel source={{ type: 'incident', id: incident.id, ref: incident.ref }} access={user.access} me={user.id} unitNo={incident.unit_no} machineId={incident.machine_id} actions={actions} onChanged={load} />
  );

  return (
    <div className="flex flex-col gap-5">
      {!embedded && (
  <a href={hrefFor({ name: 'module', id: 'incidents' })} className="text-sm no-underline text-muted">← Incidents</a>
      )}

      <div className="flex flex-wrap justify-between items-start gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-sm font-semibold text-muted">{incident.ref} · {incidentTypeLabel(incident.type)}</span>
            <Pill tone={status.tone}>{status.label}</Pill>
            {incident.notifiable && <span className="text-[11px] font-bold tracking-wide px-2 py-0.5 rounded-full bg-finlay text-white">NOTIFIABLE</span>}
          </div>
          <h1 className="mt-1.5 mb-0 text-2xl font-bold break-words">{incident.description || 'No description'}</h1>
          <p className="mt-1.5 mb-0 text-muted text-[15px]">
            {formatLongDate(incident.occurred_at)} {formatTime(incident.occurred_at)} · {incident.site_name}
            {incident.location_detail ? `, ${incident.location_detail}` : ''}
            {incident.unit_no && <> · Unit <span className="text-finlay font-bold">{incident.unit_no}</span></>}
            {' '}· reported by {incident.reporter_name}
          </p>
        </div>
        {office && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => window.print()} className={`${smallButton} border border-[#D6D2CC] bg-white`}>Print</button>
            {incident.status === 'new' && (
              <button type="button" disabled={saving} className={`${smallButton} border-0 bg-ink text-white`}
                onClick={() => save({ status: 'investigating', investigation_lead: incident.investigation_lead ?? user.id, investigation_due: incident.investigation_due ?? addDays(brisbaneDay(new Date()), 7) })}>
                Start investigation
              </button>
            )}
            {incident.status === 'investigating' && (
              <button type="button" disabled={saving} className={`${smallButton} border-0 bg-ink text-white`} onClick={() => save({ status: 'actions' })}>Investigation finished</button>
            )}
            {incident.status === 'closed' ? (
              officer && <button type="button" disabled={saving} className={`${smallButton} border border-[#D6D2CC] bg-white`} onClick={() => save({ status: 'actions' })}>Reopen</button>
            ) : (
              officer && (
                <button type="button" disabled={saving || !closable} title={closable ? '' : blockers.length ? `Before closing: ${blockers.join('; ')}` : 'Finish all actions first'} className={`${smallButton} border-0 bg-finlay text-white`}
                  onClick={() => { if (window.confirm(`Close ${incident.ref}?\n\nThis marks the incident as finished. You can reopen it later if you need to.`)) void save({ status: 'closed' }); }}>
                  Close incident
                </button>
              )
            )}
          </div>
        )}
      </div>

      <ErrorNote message={error} />

      <ol aria-label="Progress" className="list-none m-0 p-0 grid grid-cols-2 sm:grid-cols-4 gap-2">
        {steps.map(s => (
          <li key={s.label} className={`border-t-4 pt-2 text-[13px] ${s.state === 'done' ? 'border-[#1E6B3A]' : s.state === 'now' ? 'border-finlay' : 'border-line'}`}>
            <span className={`block font-semibold ${s.state === 'todo' ? 'text-muted' : s.state === 'done' ? 'text-[#1E6B3A]' : 'text-ink'}`}>{s.label}</span>
            <span className="block text-muted mt-0.5">{s.sub}</span>
          </li>
        ))}
      </ol>

      {tabbed && !closable && blockers.length > 0 && incident.status !== 'closed' && full && (
        <p className="m-0 text-sm text-muted">To close: {blockers.join(' · ')}.</p>
      )}

      {tabbed && (
        <div role="tablist" aria-label="Incident file" className="flex flex-wrap gap-1 border-b border-line">
          {tabs.map(t => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
              className={`min-h-11 px-4 -mb-px bg-transparent border-0 border-b-2 text-sm font-semibold cursor-pointer ${tab === t.id ? 'border-finlay text-ink' : 'border-transparent text-muted'}`}>
              {t.label}{t.badge && <span className="ml-1.5 text-xs font-normal text-muted">{t.badge}</span>}
            </button>
          ))}
        </div>
      )}

      {tabbed && tab === 'investigation' && <InvestigationTab incident={incident} user={user} actions={actions} people={ipeople} canEdit={incident.status !== 'closed'} officer={officer} reload={reload} />}
      {tabbed && tab === 'people' && <IncidentPeopleTab incident={incident} people={ipeople} claims={claims} certs={fileData.certs} canEdit={incident.status !== 'closed'} officer={officer} reload={reload} />}
      {tabbed && tab === 'timeline' && <TimelineTab history={history} data={fileData} officer={officer} />}
      {tabbed && tab === 'documents' && <DocumentsTab data={fileData} photos={photos} officer={officer} />}
      {tabbed && tab === 'actions' && actionsPanel}

      {(!tabbed || tab === 'overview') && (
      <div className="flex flex-wrap gap-5 items-start">
        <div className="flex-[2_1_520px] min-w-0 flex flex-col gap-5">
          {tabbed && attention.length > 0 && (
            <section className={`${card} px-5 py-4`}>
              <h2 className="mt-0 mb-2.5 text-[15px] font-semibold">Needs attention</h2>
              <ul className="list-none m-0 p-0 flex flex-col gap-2">
                {attention.map(a => <li key={a.id} className={`rounded-lg px-3.5 py-2 text-sm ${toneBg[a.tone]}`}><strong>{a.when}.</strong> {a.what}</li>)}
              </ul>
            </section>
          )}
          <section className={`${card} px-5 py-4.5`}>
            <h2 className="mt-0 mb-3 text-[17px] font-semibold">What happened</h2>
            <p className="m-0 text-sm leading-relaxed whitespace-pre-line">{incident.description}</p>
            <dl className="mt-4 mb-0 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3.5 text-sm">
              <div><dt className="text-muted text-[13px]">Who was involved</dt><dd className="mt-0.5 ml-0 font-medium">{incident.people || '—'}</dd></div>
              <div><dt className="text-muted text-[13px]">Done at the time</dt><dd className="mt-0.5 ml-0 font-medium whitespace-pre-line">{incident.immediate_action || '—'}</dd></div>
            </dl>
            {photos.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {photos.map((src, i) => (
                  <a key={src} href={src} target="_blank" rel="noreferrer"><img src={src} alt={`Photo ${i + 1}`} className="w-28 h-20 object-cover rounded-md" /></a>
                ))}
              </div>
            )}
          </section>

          {tabbed && ipeople.length > 0 && (
            <section className={`${card} px-5 py-4`}>
              <h2 className="mt-0 mb-2.5 text-[15px] font-semibold">People</h2>
              <ul className="list-none m-0 p-0 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                {ipeople.map(p => <li key={p.id}><strong>{p.name}</strong> <span className="text-muted">{p.role === 'injured' ? 'injured' : p.role.replace('_', ' ')}</span></li>)}
              </ul>
            </section>
          )}

          {tabbed && <TimelineTab history={history} data={fileData} officer={officer} limit={6} />}

          {!tabbed && office && incident.status !== 'new' && (
            <section className={`${card} px-5 py-4.5 flex flex-col gap-4`}>
              <h2 className="m-0 text-[17px] font-semibold">Investigation</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Lead" htmlFor="inv-lead">
                  <select id="inv-lead" className={inputClass} value={lead} onChange={e => setLead(e.target.value)}>
                    <option value="">Nobody yet</option>
                    {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </Field>
                <Field label="Due" htmlFor="inv-due">
                  <input id="inv-due" type="date" className={inputClass} value={due} onChange={e => setDue(e.target.value)} />
                </Field>
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-sm font-semibold">Why did it happen? <span className="font-normal text-muted">Ask "why" until you reach something you can fix.</span></span>
                {whys.map((w, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <span className="w-6 text-sm text-muted text-right">{i + 1}.</span>
                    <input aria-label={`Why ${i + 1}`} className={inputClass} value={w} onChange={e => setWhys(whys.map((x, j) => (j === i ? e.target.value : x)))} />
                  </div>
                ))}
                {whys.length < 6 && (
                  <button type="button" onClick={() => setWhys([...whys, ''])} className="self-start bg-transparent border-0 text-sm font-semibold text-finlay cursor-pointer min-h-10">+ Another why</button>
                )}
              </div>
              <fieldset className="border-0 m-0 p-0">
                <legend className="text-sm font-semibold mb-2 p-0">What contributed</legend>
                <div className="flex flex-wrap gap-2">
                  {FACTORS.map(f => {
                    const on = factors.includes(f);
                    return (
                      <button key={f} type="button" aria-pressed={on} onClick={() => setFactors(on ? factors.filter(x => x !== f) : [...factors, f])}
                        className={`min-h-10 px-3.5 rounded-full text-[13px] font-semibold cursor-pointer border ${on ? 'bg-ink text-white border-ink' : 'bg-white text-muted border-[#D6D2CC]'}`}>
                        {f}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
              <button type="button" disabled={saving} className={`${smallButton} self-start border-0 bg-ink text-white`}
                onClick={() => save({ investigation_lead: lead || null, investigation_due: due || null, why_chain: whys.map(w => w.trim()).filter(Boolean), factors })}>
                Save investigation
              </button>
            </section>
          )}

          {!tabbed && actionsPanel}
        </div>

        <div className="flex-[1_1_300px] min-w-0 flex flex-col gap-5">
          <section className={`${card} px-4.5 py-4 ${incident.notifiable ? 'border-finlay' : ''}`}>
            <h2 className={`mt-0 mb-2.5 text-[15px] font-semibold ${incident.notifiable ? 'text-[#8E0F15]' : ''}`}>WHSQ notification</h2>
            {office && incident.status !== 'closed' ? (
              <div className="flex flex-col gap-1">
                {NOTIFIABLE_REASONS.map(r => {
                  const on = incident.notifiable_reasons.includes(r.id);
                  return (
                    <label key={r.id} className="flex gap-2.5 items-center min-h-10 text-sm cursor-pointer">
                      <input type="checkbox" checked={on} disabled={saving} className="w-5 h-5 accent-[#B9151C]"
                        onChange={() => save({ notifiable_reasons: on ? incident.notifiable_reasons.filter(x => x !== r.id) : [...incident.notifiable_reasons, r.id] })} />
                      {r.title}
                    </label>
                  );
                })}
              </div>
            ) : (
              <p className="m-0 text-sm">{incident.notifiable ? notifiableSummary(incident.notifiable_reasons) : 'Not notifiable'}</p>
            )}

            {incident.notifiable && (
              <dl className="mt-3 mb-0 flex flex-col gap-3 text-sm">
                <div>
                  <dt className="text-muted text-[13px]">Called</dt>
                  <dd className="mt-0.5 ml-0 font-medium">
                    {incident.whsq_called_at ? `${formatDate(incident.whsq_called_at)} ${formatTime(incident.whsq_called_at)} by ${incident.whsq_called_by || '—'}` : (
                      <span className="flex flex-col gap-2">
                        <span className="text-[#8E0F15]">Not recorded yet</span>
                        <a href={WHSQ_TEL} className="text-finlay font-semibold">Call {WHSQ_PHONE}</a>
                        {office && <button type="button" disabled={saving} className={`${smallButton} self-start border border-[#D6D2CC] bg-white`} onClick={() => save({ whsq_called_at: new Date().toISOString(), whsq_called_by: user.name })}>Mark as called now</button>}
                      </span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted text-[13px]">WHSQ reference</dt>
                  <dd className="mt-0.5 ml-0 font-medium">
                    {office ? (
                      <span className="flex gap-2">
                        <input aria-label="WHSQ reference" className={`${inputClass} min-h-10`} value={whsqRef} onChange={e => setWhsqRef(e.target.value)} />
                        {whsqRef !== incident.whsq_reference && <button type="button" disabled={saving} className={`${smallButton} border-0 bg-ink text-white`} onClick={() => save({ whsq_reference: whsqRef.trim() })}>Save</button>}
                      </span>
                    ) : incident.whsq_reference || '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted text-[13px]">Site released</dt>
                  <dd className="mt-0.5 ml-0 font-medium">
                    {incident.site_released_at ? `${formatDate(incident.site_released_at)} ${formatTime(incident.site_released_at)}${incident.site_released_by ? `, by ${incident.site_released_by}` : ''}` : office ? (
                      <span className="flex flex-col gap-2">
                        <input aria-label="Released by (inspector's name)" placeholder="Inspector's name" className={`${inputClass} min-h-10`} value={releasedBy} onChange={e => setReleasedBy(e.target.value)} />
                        <button type="button" disabled={saving} className={`${smallButton} self-start border border-[#D6D2CC] bg-white`} onClick={() => save({ site_released_at: new Date().toISOString(), site_released_by: releasedBy.trim() })}>Mark site released now</button>
                      </span>
                    ) : 'Not yet'}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted text-[13px]">Keep this record until</dt>
                  <dd className="mt-0.5 ml-0 font-medium">{formatDay(keepRecordUntil(incident))} (5 years)</dd>
                </div>
              </dl>
            )}
          </section>

          {incident.unit_no && (
            <section className={`${card} px-4.5 py-4`}>
              <h2 className="mt-0 mb-2 text-[15px] font-semibold">Machine</h2>
              <p className="m-0 text-sm leading-relaxed">
                <span className="text-finlay font-bold">{incident.unit_no}</span>
                {!incident.machine_id && <span className="text-muted"> (not matched to the fleet register)</span>}
              </p>
            </section>
          )}

          {office && !tabbed && (
            <section className={`${card} px-4.5 py-4`}>
              <h2 className="mt-0 mb-2.5 text-[15px] font-semibold">History</h2>
              {history.length === 0 ? (
                <p className="m-0 text-sm text-muted">No history yet.</p>
              ) : (
                <ol className="list-none m-0 p-0 flex flex-col gap-2.5 text-[13px]">
                  {history.map(h => (
                    <li key={h.id}>
                      <span className="text-muted">{formatWhen(h.occurred_at)} · {h.actor_name}</span>
                      <span className="block mt-px">{h.what}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
