/**
 * The incident file: people on an incident, the six-part investigation, and the rules for what
 * has to be done before an incident can close. No Supabase calls here, so it is all unit-tested.
 */

import type { Tone } from './attention.ts';
import { brisbaneDay, daysUntil } from './dates.ts';
import type { Incident, WhsAction } from './records.ts';

// ---------------------------------------------------------------------------------
// Shapes (matching the whs_ tables)
// ---------------------------------------------------------------------------------

export type PersonRole = 'injured' | 'witness' | 'involved' | 'first_aider' | 'supervisor';
export type Treatment = '' | 'none' | 'first_aid' | 'doctor' | 'hospital';
export type EvidenceKind = 'photo' | 'cctv' | 'document' | 'sketch' | 'measurement' | 'equipment' | 'other';
export type StatementStatus = 'requested' | 'received' | 'signed';
export type PartId = 'evidence' | 'statements' | 'timeline' | 'why' | 'findings' | 'signoff';
export type ControlLevel = '' | 'eliminate' | 'substitute' | 'engineer' | 'administrative' | 'ppe';

export interface Person {
  id: string;
  name: string;
  position: string;
  site_id: string | null;
  phone: string;
  emergency_contact: string;
  profile_id: string | null;
  start_date: string | null;
  notes: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface IncidentPerson {
  id: string;
  incident_id: string;
  person_id: string | null;
  name: string;
  role: PersonRole;
  employer: string;
  phone: string;
  notes: string;
  body_part: string;
  injury_nature: string;
  mechanism: string;
  treatment: Treatment;
  off_work_from: string | null;
  returned_on: string | null;
  created_by_name: string;
  created_at: string;
}

export interface Evidence {
  id: string;
  incident_id: string;
  kind: EvidenceKind;
  description: string;
  file_path: string;
  file_name: string;
  created_by_name: string;
  created_at: string;
}

export interface Statement {
  id: string;
  incident_id: string;
  person_id: string | null;
  name: string;
  role: string;
  status: StatementStatus;
  requested_on: string;
  file_path: string;
  file_name: string;
  notes: string;
  created_by_name: string;
  created_at: string;
}

export interface TimelineEntry {
  id: string;
  incident_id: string;
  happened_at: string;
  what: string;
  created_by_name: string;
  created_at: string;
}

// ---------------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------------

export const PERSON_ROLES: { id: PersonRole; label: string }[] = [
  { id: 'injured', label: 'Injured' },
  { id: 'witness', label: 'Witness' },
  { id: 'involved', label: 'Involved' },
  { id: 'first_aider', label: 'First aider' },
  { id: 'supervisor', label: 'Supervisor' },
];

export function roleLabel(role: PersonRole): string {
  return PERSON_ROLES.find(r => r.id === role)?.label ?? role;
}

export const TREATMENTS: { id: Treatment; label: string }[] = [
  { id: '', label: 'Not recorded' },
  { id: 'none', label: 'None needed' },
  { id: 'first_aid', label: 'First aid' },
  { id: 'doctor', label: 'Doctor' },
  { id: 'hospital', label: 'Hospital' },
];

export const EVIDENCE_KINDS: { id: EvidenceKind; label: string }[] = [
  { id: 'photo', label: 'Photo' },
  { id: 'cctv', label: 'CCTV' },
  { id: 'sketch', label: 'Sketch or layout' },
  { id: 'measurement', label: 'Measurement' },
  { id: 'equipment', label: 'Equipment record' },
  { id: 'document', label: 'Document' },
  { id: 'other', label: 'Other' },
];

export const STATEMENT_STATUS: { id: StatementStatus; label: string; tone: Tone }[] = [
  { id: 'requested', label: 'Requested', tone: 'amber' },
  { id: 'received', label: 'Received', tone: 'blue' },
  { id: 'signed', label: 'Signed', tone: 'green' },
];

export const CONTROL_LEVELS: { id: ControlLevel; label: string; sub: string }[] = [
  { id: 'eliminate', label: 'Remove it', sub: 'Get rid of the hazard' },
  { id: 'substitute', label: 'Swap it', sub: 'Use something safer' },
  { id: 'engineer', label: 'Engineer it', sub: 'Guards, barriers, isolation' },
  { id: 'administrative', label: 'Procedure', sub: 'Training, signs, rules' },
  { id: 'ppe', label: 'PPE', sub: 'Last resort' },
];

/** What contributed. The first five are the original set; the rest come from the investigation form. */
export const CONTRIBUTING = [
  'Plant / guarding', 'Procedure / isolation', 'People / training', 'Place / layout', 'Supervision',
  'Work area', 'Equipment', 'Fatigue', 'Time pressure', 'PPE', 'Communication', 'Housekeeping',
];

// ---------------------------------------------------------------------------------
// Investigation parts
// ---------------------------------------------------------------------------------

export const PARTS: { id: PartId; label: string; sub: string }[] = [
  { id: 'evidence', label: 'Scene and evidence', sub: 'Photos, CCTV, sketches, equipment and documents' },
  { id: 'statements', label: 'Statements', sub: 'Written or recorded, with the signed copy attached' },
  { id: 'timeline', label: 'What happened, step by step', sub: 'Built from the evidence above' },
  { id: 'why', label: 'Why did it happen', sub: 'Ask why until you reach something you can fix' },
  { id: 'findings', label: 'Findings and fixes', sub: 'Each fix becomes an action with an owner and a due date' },
  { id: 'signoff', label: 'Review and sign-off', sub: 'Investigator, reviewer and the crew briefing' },
];

/** Injuries and notifiable incidents need all six parts. Other incidents get a lighter investigation. */
export function needsFullInvestigation(incident: Pick<Incident, 'type' | 'notifiable_reasons'>): boolean {
  return incident.type === 'injury' || incident.notifiable_reasons.length > 0;
}

export function requiredParts(incident: Pick<Incident, 'type' | 'notifiable_reasons'>): PartId[] {
  return needsFullInvestigation(incident) ? PARTS.map(p => p.id) : ['evidence', 'timeline', 'why', 'findings'];
}

/** A notifiable incident always has to be investigated; others can be marked not required. */
export function canWaiveInvestigation(incident: Pick<Incident, 'notifiable_reasons'>): boolean {
  return incident.notifiable_reasons.length === 0;
}

export function partsDone(incident: Pick<Incident, 'parts_done'>): PartId[] {
  return Array.from(new Set(incident.parts_done ?? [])) as PartId[];
}

export function investigationProgress(incident: Pick<Incident, 'type' | 'notifiable_reasons' | 'parts_done'>): { done: number; total: number; remaining: PartId[] } {
  const required = requiredParts(incident);
  const done = new Set(partsDone(incident));
  const remaining = required.filter(p => !done.has(p));
  return { done: required.length - remaining.length, total: required.length, remaining };
}

export function togglePart(incident: Pick<Incident, 'parts_done'>, part: PartId): PartId[] {
  const now = partsDone(incident);
  return now.includes(part) ? now.filter(p => p !== part) : [...now, part];
}

export function statementCounts(list: Pick<Statement, 'status'>[]): { signed: number; total: number } {
  return { signed: list.filter(s => s.status === 'signed').length, total: list.length };
}

// ---------------------------------------------------------------------------------
// Closing
// ---------------------------------------------------------------------------------

/** Plain-words reasons an incident can't be closed yet. Empty when it can. Matches the database's own rule. */
export function closeBlockers(
  incident: Pick<Incident, 'status' | 'type' | 'notifiable_reasons' | 'parts_done' | 'investigation_waived'>,
  actions: Pick<WhsAction, 'status'>[],
  claims: { status: string; label?: string }[] | null
): string[] {
  if (incident.status === 'closed') return [];
  const out: string[] = [];
  const open = actions.filter(a => a.status !== 'done').length;
  if (open) out.push(`${open} ${open === 1 ? 'action is' : 'actions are'} not done`);
  if (needsFullInvestigation(incident)) {
    const p = investigationProgress(incident);
    if (!incident.investigation_waived && p.remaining.length) out.push(`Investigation: ${p.remaining.length} of ${p.total} ${p.remaining.length === 1 ? 'part' : 'parts'} not done`);
    const openClaims = (claims ?? []).filter(c => c.status !== 'closed' && c.status !== 'rejected');
    if (openClaims.length === 1 && openClaims[0].label) out.push(`${openClaims[0].label} is still open (close or reject it in People and claims)`);
    else if (openClaims.length) out.push(`${openClaims.length} ${openClaims.length === 1 ? 'claim is' : 'claims are'} still open`);
  }
  return out;
}

// ---------------------------------------------------------------------------------
// Timeline: one list of everything that happened on the file
// ---------------------------------------------------------------------------------

export type FeedKind = 'history' | 'evidence' | 'statement' | 'timeline' | 'claim' | 'certificate' | 'log' | 'document';

export interface FeedItem {
  id: string;
  at: string;
  kind: FeedKind;
  what: string;
  by: string;
  file?: string;
}

export const FEED_FILTERS: { id: 'all' | 'investigation' | 'claim' | 'files'; label: string }[] = [
  { id: 'all', label: 'Everything' },
  { id: 'investigation', label: 'Investigation' },
  { id: 'claim', label: 'Medical and claim' },
  { id: 'files', label: 'Files only' },
];

export function feedMatches(item: FeedItem, filter: 'all' | 'investigation' | 'claim' | 'files'): boolean {
  if (filter === 'all') return true;
  if (filter === 'files') return Boolean(item.file);
  if (filter === 'claim') return ['claim', 'certificate', 'log', 'document'].includes(item.kind);
  return ['evidence', 'statement', 'timeline'].includes(item.kind);
}

export function sortFeed(items: FeedItem[]): FeedItem[] {
  return [...items].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

// ---------------------------------------------------------------------------------
// Needs attention on an incident (the claim items are added by the caller for the WHS officer)
// ---------------------------------------------------------------------------------

export interface FileAttention {
  id: string;
  tone: Tone;
  when: string;
  what: string;
}

export function incidentAttention(
  incident: Pick<Incident, 'status' | 'investigation_due'>,
  statements: Pick<Statement, 'status' | 'name'>[],
  now: Date = new Date()
): FileAttention[] {
  const out: FileAttention[] = [];
  if (incident.status === 'investigating' && incident.investigation_due) {
    const d = daysUntil(incident.investigation_due, now);
    if (d < 0) out.push({ id: 'inv', tone: 'red', when: 'Overdue', what: `Investigation was due ${-d} ${-d === 1 ? 'day' : 'days'} ago` });
    else if (d <= 7) out.push({ id: 'inv', tone: 'amber', when: d === 0 ? 'Today' : `In ${d} ${d === 1 ? 'day' : 'days'}`, what: 'Investigation is due' });
  }
  const waiting = statements.filter(s => s.status === 'requested');
  if (waiting.length) out.push({ id: 'stm', tone: 'grey', when: 'Waiting', what: `No statement yet from ${waiting.map(s => s.name).join(', ')}` });
  return out;
}

export function daysOpen(incident: Pick<Incident, 'created_at' | 'closed_at'>, now: Date = new Date()): number {
  const end = incident.closed_at ? brisbaneDay(incident.closed_at) : brisbaneDay(now);
  return Math.max(0, daysUntil(end, new Date(`${brisbaneDay(incident.created_at)}T12:00:00+10:00`)));
}
