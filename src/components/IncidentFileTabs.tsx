import { useCallback, useEffect, useState } from 'react';
import { listAppointmentsFor, listCertificates, listClaimDocs, listLog } from '../services/claims.ts';
import { openFile } from '../services/files.ts';
import { listEvidence, listStatements, listTimeline } from '../services/incidentFile.ts';
import { formatWhen } from '../utils/dates.ts';
import type { Appointment, Certificate, Claim, ClaimDoc, LogEntry } from '../utils/claims.ts';
import { logLabel, capacityLabel } from '../utils/claims.ts';
import { FEED_FILTERS, feedMatches, sortFeed, EVIDENCE_KINDS, type Evidence, type FeedItem, type Statement, type TimelineEntry } from '../utils/incidentFile.ts';
import type { HistoryEntry } from '../utils/records.ts';
import { Pill } from './Pill.tsx';

const card = 'bg-white border border-line rounded-xl';
const linkBtn = 'bg-transparent border-0 p-0 text-[13px] font-semibold text-ink underline cursor-pointer min-h-8';

export interface FileData {
  evidence: Evidence[]; statements: Statement[]; timeline: TimelineEntry[];
  certs: Certificate[]; log: LogEntry[]; claimDocs: ClaimDoc[]; appointments: Appointment[];
}

/** Everything attached to the incident. Claim items are only fetched for the WHS officer and admins. */
export function useFileData(incidentId: string, claims: Claim[], officer: boolean, version: number): FileData {
  const [d, setD] = useState<FileData>({ evidence: [], statements: [], timeline: [], certs: [], log: [], claimDocs: [], appointments: [] });
  const key = claims.map(c => c.id).join(',');
  const load = useCallback(async () => {
    const [e, s, t] = await Promise.all([listEvidence(incidentId), listStatements(incidentId), listTimeline(incidentId)]);
    let certs: Certificate[] = [], log: LogEntry[] = [], claimDocs: ClaimDoc[] = [], appointments: Appointment[] = [];
    if (officer && claims.length) {
      const per = await Promise.all(claims.map(async c => [(await listCertificates(c.id)).data ?? [], (await listLog(c.id)).data ?? [], (await listClaimDocs(c.id)).data ?? []] as const));
      certs = per.flatMap(x => x[0]); log = per.flatMap(x => x[1]); claimDocs = per.flatMap(x => x[2]);
      appointments = (await listAppointmentsFor(claims.map(c => c.id))).data ?? [];
    }
    setD({ evidence: e.data ?? [], statements: s.data ?? [], timeline: t.data ?? [], certs, log, claimDocs, appointments });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidentId, officer, key]);
  useEffect(() => { void load(); }, [load, version]);
  return d;
}

export function buildFeed(history: HistoryEntry[], d: FileData): FeedItem[] {
  const items: FeedItem[] = [];
  for (const h of history) items.push({ id: `h${h.id}`, at: h.occurred_at, kind: 'history', what: h.what, by: h.actor_name });
  for (const e of d.evidence) items.push({ id: `e${e.id}`, at: e.created_at, kind: 'evidence', what: `${EVIDENCE_KINDS.find(k => k.id === e.kind)?.label ?? 'Evidence'}: ${e.description || e.file_name}`, by: e.created_by_name, file: e.file_path || undefined });
  for (const s of d.statements) items.push({ id: `s${s.id}`, at: s.created_at, kind: 'statement', what: `Statement from ${s.name} (${s.status})`, by: s.created_by_name, file: s.file_path || undefined });
  for (const t of d.timeline) items.push({ id: `t${t.id}`, at: t.happened_at, kind: 'timeline', what: t.what, by: t.created_by_name });
  for (const c of d.certs) items.push({ id: `c${c.id}`, at: c.created_at, kind: 'certificate', what: `Certificate added: ${capacityLabel(c.capacity).label}, ${c.from_date} to ${c.to_date}`, by: c.created_by_name, file: c.file_path || undefined });
  for (const l of d.log) items.push({ id: `l${l.id}`, at: l.happened_at, kind: 'log', what: `${logLabel(l.kind)} with ${l.with_whom}${l.what ? `: ${l.what}` : ''}`, by: l.created_by_name, file: l.file_path || undefined });
  for (const x of d.claimDocs) items.push({ id: `d${x.id}`, at: x.created_at, kind: 'document', what: `Document filed: ${x.title}`, by: x.created_by_name, file: x.file_path });
  return sortFeed(items);
}

const KIND_LABEL: Record<FeedItem['kind'], string> = { history: 'Change', evidence: 'Evidence', statement: 'Statement', timeline: 'Event', certificate: 'Certificate', log: 'Correspondence', claim: 'Claim', document: 'Document' };

export function TimelineTab({ history, data, officer, limit }: { history: HistoryEntry[]; data: FileData; officer: boolean; limit?: number }) {
  const [filter, setFilter] = useState<'all' | 'investigation' | 'claim' | 'files'>('all');
  const filters = FEED_FILTERS.filter(f => officer || f.id !== 'claim');
  const feed = buildFeed(history, data).filter(i => feedMatches(i, filter));
  const shown = limit ? feed.slice(0, limit) : feed;
  return (
    <section className={`${card} px-4.5 py-4 flex flex-col gap-3`}>
      {!limit && (
        <div role="group" aria-label="Filter" className="flex flex-wrap gap-2">
          {filters.map(f => (
            <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}
              className={`min-h-10 px-3.5 rounded-full text-[13px] font-semibold cursor-pointer border ${filter === f.id ? 'bg-ink text-white border-ink' : 'bg-white text-muted border-[#D6D2CC]'}`}>{f.label}</button>
          ))}
        </div>
      )}
      {shown.length === 0 ? <p className="m-0 text-sm text-muted">Nothing yet.</p> : (
        <ol className="list-none m-0 p-0 flex flex-col gap-3">
          {shown.map(i => (
            <li key={i.id} className="flex gap-3 text-sm">
              <span className="w-28 shrink-0 text-xs text-muted pt-0.5">{formatWhen(i.at)}</span>
              <span className="min-w-0 flex-1">
                <Pill tone={i.kind === 'history' ? 'grey' : i.kind === 'certificate' || i.kind === 'log' || i.kind === 'document' ? 'blue' : 'amber'}>{KIND_LABEL[i.kind]}</Pill>{' '}
                <span className="whitespace-pre-line">{i.what}</span>
                <span className="block text-xs text-muted">{i.by}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function DocumentsTab({ data, photos, officer }: { data: FileData; photos: string[]; officer: boolean }) {
  const groups: { title: string; rows: { id: string; name: string; sub: string; bucket: 'whs-incident-files' | 'whs-claim-files'; path: string }[] }[] = [
    { title: 'Evidence', rows: data.evidence.filter(e => e.file_path).map(e => ({ id: e.id, name: e.file_name || e.description, sub: e.description, bucket: 'whs-incident-files', path: e.file_path })) },
    { title: 'Statements', rows: data.statements.filter(s => s.file_path).map(s => ({ id: s.id, name: s.file_name, sub: `${s.name} (${s.status})`, bucket: 'whs-incident-files', path: s.file_path })) },
  ];
  if (officer) {
    groups.push(
      { title: 'Medical certificates', rows: data.certs.filter(c => c.file_path).map(c => ({ id: c.id, name: c.file_name, sub: `${c.from_date} to ${c.to_date}`, bucket: 'whs-claim-files', path: c.file_path })) },
      { title: 'Correspondence', rows: data.log.filter(l => l.file_path).map(l => ({ id: l.id, name: l.file_name, sub: `${logLabel(l.kind)} with ${l.with_whom}`, bucket: 'whs-claim-files', path: l.file_path })) },
      { title: 'Claim documents', rows: data.claimDocs.map(x => ({ id: x.id, name: x.title, sub: x.file_name, bucket: 'whs-claim-files', path: x.file_path })) },
    );
  }
  const any = photos.length > 0 || groups.some(g => g.rows.length);
  return (
    <section className={`${card} px-4.5 py-4 flex flex-col gap-4`}>
      {!any && <p className="m-0 text-sm text-muted">No files yet. Photos, evidence, statements and claim paperwork all collect here.</p>}
      {photos.length > 0 && (
        <div><div className="text-xs font-semibold uppercase tracking-wide text-muted mb-1.5">Photos from the report</div>
          <div className="flex flex-wrap gap-2">{photos.map((src, i) => <a key={src} href={src} target="_blank" rel="noreferrer"><img src={src} alt={`Photo ${i + 1}`} className="w-28 h-20 object-cover rounded-md" /></a>)}</div></div>
      )}
      {groups.filter(g => g.rows.length).map(g => (
        <div key={g.title}>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted mb-1">{g.title}</div>
          <ul className="list-none m-0 p-0 flex flex-col divide-y divide-line-soft">
            {g.rows.map(r => (
              <li key={r.id} className="py-2 flex flex-wrap items-center gap-x-3 text-sm">
                <button type="button" className={linkBtn} onClick={() => void openFile(r.bucket, r.path)}>{r.name || 'Open'}</button>
                <span className="text-muted">{r.sub}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
