/**
 * Jobs and SWMS sign-on. A job has a crew and the SWMS that apply to it. Each person signs on to the
 * current approved version of each SWMS. A new approved version means signing on again.
 * Lapsed tickets are flagged for the office; they never stop someone signing on.
 */

import { daysUntil } from './dates.ts';
import { currentTickets, ticketState, type Ticket } from './tickets.ts';
import type { Swms, SwmsVersion } from './swms.ts';
import { currentApproved } from './swms.ts';

export interface Job {
  id: string;
  ref: string;
  name: string;
  site_id: string | null;
  client: string;
  location: string;
  supervisor_name: string;
  starts_on: string | null;
  ends_on: string | null;
  notes: string;
  status: 'active' | 'closed';
  created_by_name: string;
  created_at: string;
  updated_at: string;
}

export interface JobSwms { job_id: string; swms_id: string }
export interface JobPerson { job_id: string; person_id: string }

export interface SignOn {
  id: string;
  swms_id: string;
  version_id: string;
  job_id: string | null;
  person_id: string | null;
  signer_name: string;
  company: string;
  signature_path: string;
  method: 'self' | 'recorded';
  recorded_by_name: string;
  signed_at: string;
}

export type JobTiming = 'closed' | 'undated' | 'upcoming' | 'running' | 'ended';

/** Where a job is in its dates. An active job past its end date is "ended": it still needs closing. */
export function jobTiming(j: Pick<Job, 'status' | 'starts_on' | 'ends_on'>, now: Date = new Date()): JobTiming {
  if (j.status === 'closed') return 'closed';
  if (!j.starts_on && !j.ends_on) return 'undated';
  if (j.starts_on && daysUntil(j.starts_on, now) > 0) return 'upcoming';
  if (j.ends_on && daysUntil(j.ends_on, now) < 0) return 'ended';
  return 'running';
}

export const TIMING_LABEL: Record<JobTiming, { label: string; tone: 'green' | 'blue' | 'amber' | 'grey' }> = {
  running: { label: 'Running', tone: 'green' },
  upcoming: { label: 'Starts soon', tone: 'blue' },
  undated: { label: 'No dates', tone: 'grey' },
  ended: { label: 'Past end date', tone: 'amber' },
  closed: { label: 'Closed', tone: 'grey' },
};

export type Cell = 'signed' | 'older' | 'none' | 'no_version';

export interface SheetRow {
  key: string;
  name: string;
  company: string;
  personId: string | null;
  cells: Record<string, Cell>;
}

/** The signer's identity as the database keys it: a person id, or a contractor's name and company. */
export function signerKey(s: Pick<SignOn, 'person_id' | 'signer_name' | 'company'>): string {
  return s.person_id ?? `${s.signer_name.trim().toLowerCase()}|${s.company.trim().toLowerCase()}`;
}

/** Has this signer signed the current approved version of this SWMS (on any job)? */
export function cellFor(key: string, swmsId: string, versions: Pick<SwmsVersion, 'id' | 'swms_id' | 'status' | 'version'>[], signons: SignOn[]): Cell {
  const cur = currentApproved(versions.filter(v => v.swms_id === swmsId) as SwmsVersion[]);
  if (!cur) return 'no_version';
  const mine = signons.filter(s => s.swms_id === swmsId && signerKey(s) === key);
  if (mine.some(s => s.version_id === cur.id)) return 'signed';
  return mine.length ? 'older' : 'none';
}

/** The sign-on sheet for a job: crew members and anyone else who signed on to its SWMS, against each SWMS. */
export function jobSheet(
  job: Job, swmsIds: string[], crew: { id: string; name: string }[],
  versions: Pick<SwmsVersion, 'id' | 'swms_id' | 'status' | 'version'>[], signons: SignOn[],
): SheetRow[] {
  const rows = new Map<string, SheetRow>();
  const add = (key: string, name: string, company: string, personId: string | null) => {
    if (!rows.has(key)) rows.set(key, { key, name, company, personId, cells: {} });
  };
  for (const p of crew) add(p.id, p.name, 'Finlay', p.id);
  // People who signed on for this job but are not on the crew list (contractors, people added later)
  for (const s of signons) if (s.job_id === job.id && swmsIds.includes(s.swms_id)) add(signerKey(s), s.signer_name, s.company, s.person_id);
  for (const r of rows.values()) for (const id of swmsIds) r.cells[id] = cellFor(r.key, id, versions, signons);
  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function sheetProgress(rows: SheetRow[], swmsIds: string[]): { done: number; total: number } {
  let done = 0; let total = 0;
  for (const r of rows) for (const id of swmsIds) {
    if (r.cells[id] === 'no_version') continue;
    total += 1;
    if (r.cells[id] === 'signed') done += 1;
  }
  return { done, total };
}

export interface ToSign { swms: Swms; version: SwmsVersion; job: Job | null; again: boolean }

/**
 * What a worker still has to sign on to: the current approved version of each SWMS on their
 * running or upcoming jobs. A SWMS signed on an older version is listed as "again".
 */
export function outstandingFor(
  personId: string, jobs: Job[], jobSwms: JobSwms[], jobPeople: JobPerson[],
  swms: Swms[], versions: SwmsVersion[], signons: SignOn[], now: Date = new Date(),
): ToSign[] {
  const out: ToSign[] = [];
  const seen = new Set<string>();
  for (const job of jobs) {
    if (!['running', 'upcoming', 'undated'].includes(jobTiming(job, now))) continue;
    if (!jobPeople.some(p => p.job_id === job.id && p.person_id === personId)) continue;
    for (const link of jobSwms.filter(l => l.job_id === job.id)) {
      const s = swms.find(x => x.id === link.swms_id);
      if (!s || s.status !== 'active' || seen.has(s.id)) continue;
      const cell = cellFor(personId, s.id, versions, signons);
      if (cell === 'signed' || cell === 'no_version') continue;
      const version = currentApproved(versions.filter(v => v.swms_id === s.id));
      if (!version) continue;
      seen.add(s.id);
      out.push({ swms: s, version, job, again: cell === 'older' });
    }
  }
  return out;
}

/** Names of tickets a person holds that have run out. Shown to the office; never blocks signing on. */
export function expiredTicketNames(tickets: Ticket[], now: Date = new Date()): string[] {
  return currentTickets(tickets).filter(t => ticketState(t, now) === 'expired').map(t => t.name);
}

/** Active jobs (running or upcoming) that have crew members who still have not signed on. */
export function jobsWithGaps(
  jobs: Job[], jobSwms: JobSwms[], jobPeople: JobPerson[], people: { id: string; name: string }[],
  versions: Pick<SwmsVersion, 'id' | 'swms_id' | 'status' | 'version'>[], signons: SignOn[], now: Date = new Date(),
): { job: Job; missing: number }[] {
  const out: { job: Job; missing: number }[] = [];
  for (const job of jobs) {
    if (!['running', 'upcoming', 'undated'].includes(jobTiming(job, now))) continue;
    const ids = jobSwms.filter(l => l.job_id === job.id).map(l => l.swms_id);
    const crew = people.filter(p => jobPeople.some(jp => jp.job_id === job.id && jp.person_id === p.id));
    const sheet = jobSheet(job, ids, crew, versions, signons);
    const { done, total } = sheetProgress(sheet.filter(r => r.personId && crew.some(c => c.id === r.personId)), ids);
    if (total - done > 0) out.push({ job, missing: total - done });
  }
  return out;
}
