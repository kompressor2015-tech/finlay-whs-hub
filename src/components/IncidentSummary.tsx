import type { ReactNode } from 'react';
import { hrefFor } from '../hooks/useRoute.ts';
import { formatDay } from '../utils/dates.ts';
import { certificateStatus, claimStatus, daysOffWork, isOffWork, isOpen, STATES, appointmentKindLabel, type Claim } from '../utils/claims.ts';
import { investigationProgress, needsFullInvestigation, roleLabel, statementCounts, type IncidentPerson } from '../utils/incidentFile.ts';
import { actionPill, notifiableSummary, type HistoryEntry, type Incident, type WhsAction } from '../utils/records.ts';
import { TimelineTab, type FileData } from './IncidentFileTabs.tsx';
import { Pill } from './Pill.tsx';

const card = 'bg-white border border-line rounded-xl';
const toneBg: Record<string, string> = { red: 'bg-[#FDE8E8] text-[#9B1218]', amber: 'bg-[#FFF1D6] text-[#7A4B00]', green: 'bg-[#E3F4E6] text-[#1F6B2E]', blue: 'bg-[#E4EEFC] text-[#1C4A8F]', grey: 'bg-[#ECECEC] text-[#4A4A50]' };

function Block({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className={`${card} px-4 py-3.5`}>
      <div className="flex items-baseline justify-between gap-3 mb-2"><h2 className="m-0 text-[13px] font-bold uppercase tracking-wide text-muted">{title}</h2>{aside}</div>
      {children}
    </section>
  );
}

/** The side panel: everything worth knowing about an incident at a glance. Nothing to fill in here; editing is on the full file. */
export function IncidentSummary({ incident, actions, people, claims, data, history, officer, photos, attention, leadName }: {
  incident: Incident; actions: WhsAction[]; people: IncidentPerson[]; claims: Claim[]; data: FileData; history: HistoryEntry[]; officer: boolean; photos: string[];
  attention: { id: string; tone: string; when: string; what: string }[]; leadName: string;
}) {
  const full = needsFullInvestigation(incident);
  const prog = investigationProgress(incident);
  const stm = statementCounts(data.statements);
  const done = actions.filter(a => a.status === 'done').length;
  const fileHref = hrefFor({ name: 'incident', id: incident.id });
  return (
    <div className="flex flex-col gap-3.5">
      <a href={fileHref} className="min-h-11 rounded-lg bg-ink text-white no-underline text-sm font-semibold flex items-center justify-center">Open the full file</a>

      {attention.length > 0 && (
        <Block title="Needs attention">
          <ul className="list-none m-0 p-0 flex flex-col gap-1.5">
            {attention.map(a => <li key={a.id} className={`rounded-lg px-3 py-2 text-[13px] ${toneBg[a.tone] ?? toneBg.grey}`}><strong>{a.when}.</strong> {a.what}</li>)}
          </ul>
        </Block>
      )}

      <Block title="What happened">
        <p className="m-0 text-sm leading-relaxed whitespace-pre-line">{incident.description || '—'}</p>
        {incident.immediate_action && <p className="mt-2 mb-0 text-[13px] text-muted"><strong className="text-ink">Done at the time:</strong> {incident.immediate_action}</p>}
        {photos.length > 0 && <div className="mt-2.5 flex flex-wrap gap-1.5">{photos.slice(0, 4).map((src, i) => <a key={src} href={src} target="_blank" rel="noreferrer"><img src={src} alt={`Photo ${i + 1}`} className="w-16 h-12 object-cover rounded" /></a>)}{photos.length > 4 && <span className="text-xs text-muted self-center">+{photos.length - 4} more</span>}</div>}
      </Block>

      <Block title="People" aside={<span className="text-xs text-muted">{people.length || ''}</span>}>
        {people.length === 0 ? <p className="m-0 text-sm text-muted">{incident.people ? `Reported: ${incident.people}. Not yet added to the file.` : 'Nobody recorded yet.'}</p> : (
          <ul className="list-none m-0 p-0 flex flex-col gap-2 text-sm">
            {people.map(p => (
              <li key={p.id}>
                <span className="font-semibold">{p.name}</span> <Pill tone={p.role === 'injured' ? 'red' : 'grey'}>{roleLabel(p.role)}</Pill>
                {p.role === 'injured' && (p.body_part || p.injury_nature || p.treatment) && (
                  <span className="block text-[13px] text-muted">{[p.body_part, p.injury_nature].filter(Boolean).join(', ')}{p.treatment ? ` · treatment: ${p.treatment.replace('_', ' ')}` : ''}{p.off_work_from ? ` · off work from ${formatDay(p.off_work_from)}` : ''}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block title="Investigation" aside={incident.investigation_waived ? undefined : <span className="text-xs text-muted">{prog.done} of {prog.total} parts</span>}>
        {incident.investigation_waived ? (
          <p className="m-0 text-sm"><strong>Not required.</strong> <span className="text-muted">{incident.investigation_waived_reason}</span></p>
        ) : (
          <>
            <div className="h-2 rounded bg-[#ECE8E2] overflow-hidden"><div className="h-full bg-finlay" style={{ width: `${prog.total ? (prog.done / prog.total) * 100 : 0}%` }} /></div>
            <dl className="mt-2.5 mb-0 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px]">
              <div><dt className="text-muted">Led by</dt><dd className="m-0 font-medium">{leadName || (incident.investigation_lead ? 'Assigned' : 'Nobody yet')}</dd></div>
              <div><dt className="text-muted">Due</dt><dd className="m-0 font-medium">{incident.investigation_due ? formatDay(incident.investigation_due) : '—'}</dd></div>
              <div><dt className="text-muted">Evidence</dt><dd className="m-0 font-medium">{data.evidence.length} {data.evidence.length === 1 ? 'item' : 'items'}</dd></div>
              {full && <div><dt className="text-muted">Statements</dt><dd className="m-0 font-medium">{stm.total ? `${stm.signed} of ${stm.total} signed` : 'None requested'}</dd></div>}
            </dl>
            {(incident.root_cause || incident.immediate_cause) && (
              <p className="mt-2.5 mb-0 text-[13px]">{incident.root_cause && <><strong>Root cause:</strong> {incident.root_cause}</>}{!incident.root_cause && incident.immediate_cause && <><strong>Immediate cause:</strong> {incident.immediate_cause}</>}</p>
            )}
          </>
        )}
      </Block>

      <Block title="Actions" aside={<span className="text-xs text-muted">{done} of {actions.length} done</span>}>
        {actions.length === 0 ? <p className="m-0 text-sm text-muted">No actions yet.</p> : (
          <ul className="list-none m-0 p-0 flex flex-col divide-y divide-line-soft">
            {actions.map(a => {
              const s = actionPill(a);
              return (
                <li key={a.id} className="py-2 flex flex-wrap items-start gap-x-2 text-sm">
                  <span className="flex-1 min-w-0">{a.title}<span className="block text-xs text-muted">{[a.owner_name, a.due ? `due ${formatDay(a.due)}` : ''].filter(Boolean).join(' · ')}</span></span>
                  <Pill tone={s.tone}>{s.label}</Pill>
                </li>
              );
            })}
          </ul>
        )}
      </Block>

      {officer && claims.length > 0 && (
        <Block title="Claims">
          <ul className="list-none m-0 p-0 flex flex-col gap-3 text-sm">
            {claims.map(c => {
              const st = claimStatus(c.status);
              const cs = certificateStatus(data.certs.filter(x => x.claim_id === c.id));
              const off = isOffWork(c) ? daysOffWork(c) : null;
              const next = data.appointments.filter(a => a.claim_id === c.id && a.status === 'booked').sort((a, b) => a.on_date.localeCompare(b.on_date))[0];
              const who = people.find(p => p.person_id === c.person_id)?.name ?? 'Worker';
              return (
                <li key={c.id}>
                  <a href={hrefFor({ name: 'person', id: c.person_id })} className="font-semibold">{who}</a> <Pill tone={st.tone}>{STATES[c.state].scheme}: {st.label}</Pill>
                  <span className="block text-[13px] text-muted">
                    {[off !== null ? `${off}d off work` : '', cs.current && isOpen(c) ? `certificate to ${formatDay(cs.current.to_date)}` : '', next ? `next: ${appointmentKindLabel(next.kind).toLowerCase()} ${formatDay(next.on_date)}` : '', c.rtw_coordinator ? `RTW: ${c.rtw_coordinator}` : ''].filter(Boolean).join(' · ') || 'Nothing recorded yet'}
                  </span>
                </li>
              );
            })}
          </ul>
        </Block>
      )}

      <Block title="WHSQ">
        <p className="m-0 text-sm">
          {incident.notifiable ? <><strong className="text-[#8E0F15]">Notifiable:</strong> {notifiableSummary(incident.notifiable_reasons)}</> : 'Not notifiable'}
        </p>
        {incident.notifiable && <p className="mt-1.5 mb-0 text-[13px] text-muted">{incident.whsq_called_at ? `Called, reference ${incident.whsq_reference || 'not recorded'}` : 'Not recorded as called yet'}{incident.site_released_at ? ' · site released' : ''}</p>}
      </Block>

      <Block title="Latest activity"><TimelineTab history={history} data={data} officer={officer} limit={5} bare /></Block>
    </div>
  );
}
