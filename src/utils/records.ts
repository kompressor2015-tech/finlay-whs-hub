/**
 * Incidents, hazards and actions: their shapes (matching the whs_ tables) and the rules
 * the screens follow. No Supabase calls here, so everything in this file is unit-tested.
 */

import { addDays, brisbaneDay, daysUntil, formatDay } from './dates.ts';
import type { AttentionItem, Tone } from './attention.ts';
import { urgencyForDue } from './attention.ts';
import type { HomeData, LatestReport, PhoneTask } from './homeData.ts';

// ---------------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------------

export type IncidentType = 'injury' | 'near_miss' | 'damage' | 'spill';
export type IncidentStatus = 'new' | 'investigating' | 'actions' | 'closed';
export type NotifiableReason = 'death' | 'serious' | 'dangerous';
export type Severity = 'minor' | 'injury' | 'serious' | 'fatal';
export type MadeSafe = 'yes' | 'partly' | 'no';
export type HazardStatus = 'new' | 'actioned' | 'closed';
export type ActionStatus = 'not_started' | 'in_progress' | 'done';
export type SourceType = 'incident' | 'hazard' | 'inspection' | 'other';

export interface Incident {
  id: string;
  ref: string;
  type: IncidentType;
  occurred_at: string;
  site_id: string | null;
  site_name: string;
  location_detail: string;
  machine_id: string | null;
  unit_no: string;
  people: string;
  description: string;
  immediate_action: string;
  photos: string[];
  notifiable_reasons: NotifiableReason[];
  notifiable: boolean;
  whsq_called_at: string | null;
  whsq_called_by: string;
  whsq_reference: string;
  site_released_at: string | null;
  site_released_by: string;
  status: IncidentStatus;
  investigation_lead: string | null;
  investigation_due: string | null;
  why_chain: string[];
  factors: string[];
  closed_at: string | null;
  reported_by: string;
  reporter_name: string;
  created_at: string;
}

export interface Hazard {
  id: string;
  ref: string;
  description: string;
  site_id: string | null;
  site_name: string;
  location_detail: string;
  machine_id: string | null;
  unit_no: string;
  photos: string[];
  severity: Severity;
  made_safe: MadeSafe;
  made_safe_note: string;
  status: HazardStatus;
  closed_at: string | null;
  reported_by: string;
  reporter_name: string;
  created_at: string;
}

export interface WhsAction {
  id: string;
  title: string;
  source_type: SourceType;
  source_id: string | null;
  source_ref: string;
  machine_id: string | null;
  unit_no: string;
  owner_id: string | null;
  owner_name: string;
  due: string | null;
  status: ActionStatus;
  done_note: string;
  done_at: string | null;
  created_at: string;
}

export interface HistoryEntry {
  id: number;
  occurred_at: string;
  actor_name: string;
  what: string;
}

// ---------------------------------------------------------------------------------
// Incident choices and the WHSQ notifiable check
// ---------------------------------------------------------------------------------

export const INCIDENT_TYPES: { id: IncidentType; label: string; sub: string }[] = [
  { id: 'injury', label: 'Injury or illness', sub: 'Someone was hurt' },
  { id: 'near_miss', label: 'Near miss', sub: 'Could have hurt someone' },
  { id: 'damage', label: 'Damage', sub: 'Plant, vehicle or property' },
  { id: 'spill', label: 'Spill or environment', sub: 'Oil, fuel, chemicals' },
];

export function incidentTypeLabel(type: IncidentType): string {
  return INCIDENT_TYPES.find(t => t.id === type)?.label ?? type;
}

/** Plain-words version of WorkSafe Queensland's notifiable incident categories. */
export const NOTIFIABLE_REASONS: { id: NotifiableReason; title: string; sub: string }[] = [
  { id: 'death', title: 'Someone died', sub: '' },
  {
    id: 'serious',
    title: 'Serious injury or illness',
    sub: 'Admitted to hospital, or needs immediate treatment for an amputation, serious head, eye or spinal injury, serious burn or cut, skin torn away, or loss of a body function. Or a doctor within 48 hours after contact with a substance.',
  },
  {
    id: 'dangerous',
    title: 'Dangerous incident',
    sub: 'Someone was put at serious risk by: uncontrolled spill, leak, fire, explosion, gas, steam or pressurised substance; electric shock; something falling from height; collapse, overturning or failure of plant that needs registering (e.g. cranes); a structure or excavation collapsing.',
  },
];

export const WHSQ_PHONE = '1300 362 128';
export const WHSQ_TEL = 'tel:1300362128';

export function notifiableSummary(reasons: NotifiableReason[]): string {
  const labels: Record<NotifiableReason, string> = {
    death: 'Death',
    serious: 'Serious injury or illness',
    dangerous: 'Dangerous incident',
  };
  return reasons.map(r => labels[r]).join(', ');
}

/** Records of notifiable incidents are kept at least 5 years from notification. Returns YYYY-MM-DD. */
export function keepRecordUntil(incident: Pick<Incident, 'whsq_called_at' | 'occurred_at'>): string {
  const from = brisbaneDay(incident.whsq_called_at ?? incident.occurred_at);
  const [y, m, d] = from.split('-').map(Number);
  // 29 February rolls forward to 1 March in a non-leap year
  const target = new Date(Date.UTC(y + 5, m - 1, d));
  return target.toISOString().slice(0, 10);
}

/** Things to look at on an incident page (contributing factors). */
export const FACTORS = ['Plant / guarding', 'Procedure / isolation', 'People / training', 'Place / layout', 'Supervision'];

// ---------------------------------------------------------------------------------
// Hazard risk
// ---------------------------------------------------------------------------------

export const SEVERITIES: { id: Severity; label: string; sub: string }[] = [
  { id: 'minor', label: 'Minor', sub: 'First aid at most' },
  { id: 'injury', label: 'Injury', sub: 'Time off work' },
  { id: 'serious', label: 'Serious', sub: 'Hospital, lasting harm' },
  { id: 'fatal', label: 'Could kill', sub: 'Death possible' },
];

export interface Risk {
  label: 'Low' | 'Medium' | 'High' | 'Extreme';
  tone: Tone;
  /** Days to fix it in; 0 = today */
  days: number;
  note: string;
}

const RISKS: Record<Severity, Risk> = {
  minor: { label: 'Low', tone: 'green', days: 30, note: 'Fix within 30 days.' },
  injury: { label: 'Medium', tone: 'amber', days: 7, note: 'Fix within 7 days.' },
  serious: { label: 'High', tone: 'red', days: 1, note: 'Fix within 24 hours. Tell your supervisor now.' },
  fatal: { label: 'Extreme', tone: 'red', days: 0, note: 'Stop work in the area now and call your supervisor.' },
};

export function riskFor(severity: Severity): Risk {
  return RISKS[severity];
}

/** The date a hazard should be fixed by (YYYY-MM-DD, Brisbane). */
export function hazardFixBy(hazard: Pick<Hazard, 'severity' | 'created_at'>): string {
  return addDays(brisbaneDay(hazard.created_at), RISKS[hazard.severity].days);
}

// ---------------------------------------------------------------------------------
// Status labels
// ---------------------------------------------------------------------------------

export function incidentStatus(status: IncidentStatus): { label: string; tone: Tone } {
  switch (status) {
    case 'new':
      return { label: 'New', tone: 'blue' };
    case 'investigating':
      return { label: 'Investigating', tone: 'amber' };
    case 'actions':
      return { label: 'Actions open', tone: 'amber' };
    case 'closed':
      return { label: 'Closed', tone: 'green' };
  }
}

export function hazardStatus(status: HazardStatus): { label: string; tone: Tone } {
  switch (status) {
    case 'new':
      return { label: 'To review', tone: 'blue' };
    case 'actioned':
      return { label: 'Action set', tone: 'amber' };
    case 'closed':
      return { label: 'Closed', tone: 'green' };
  }
}

export type ActionState = 'done' | 'overdue' | 'due_soon' | 'open';

export function actionState(a: Pick<WhsAction, 'status' | 'due'>, now: Date = new Date()): ActionState {
  if (a.status === 'done') return 'done';
  if (!a.due) return 'open';
  const u = urgencyForDue(a.due, now);
  return u === 'overdue' ? 'overdue' : u === 'due_soon' ? 'due_soon' : 'open';
}

export function actionPill(a: Pick<WhsAction, 'status' | 'due'>, now: Date = new Date()): { label: string; tone: Tone } {
  const state = actionState(a, now);
  if (state === 'done') return { label: 'Done', tone: 'green' };
  if (state === 'overdue') return { label: 'Overdue', tone: 'red' };
  return a.status === 'in_progress' ? { label: 'In progress', tone: 'blue' } : { label: 'Not started', tone: 'grey' };
}

/** Overdue first, then by due date (undated last), done at the bottom (most recent first). */
export function sortActions<T extends Pick<WhsAction, 'status' | 'due' | 'done_at' | 'title'>>(list: T[], now: Date = new Date()): T[] {
  const rank = (a: T) => (actionState(a, now) === 'overdue' ? 0 : a.status === 'done' ? 2 : 1);
  return [...list].sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    if (a.status === 'done' && b.status === 'done') return (b.done_at ?? '').localeCompare(a.done_at ?? '');
    if (a.due && b.due) return a.due.localeCompare(b.due);
    if (a.due) return -1;
    if (b.due) return 1;
    return a.title.localeCompare(b.title);
  });
}

export function actionCounts(list: Pick<WhsAction, 'status' | 'due' | 'done_at'>[], now: Date = new Date()) {
  const month = brisbaneDay(now).slice(0, 7);
  let overdue = 0;
  let dueSoon = 0;
  let open = 0;
  let doneThisMonth = 0;
  for (const a of list) {
    const s = actionState(a, now);
    if (s === 'done') {
      if (a.done_at && brisbaneDay(a.done_at).slice(0, 7) === month) doneThisMonth += 1;
      continue;
    }
    open += 1;
    if (s === 'overdue') overdue += 1;
    if (s === 'due_soon') dueSoon += 1;
  }
  return { overdue, dueSoon, open, doneThisMonth };
}

// ---------------------------------------------------------------------------------
// Incident progress
// ---------------------------------------------------------------------------------

export interface Step {
  label: string;
  sub: string;
  state: 'done' | 'now' | 'todo';
}

export function incidentSteps(incident: Incident, actions: Pick<WhsAction, 'status'>[]): Step[] {
  const order: IncidentStatus[] = ['new', 'investigating', 'actions', 'closed'];
  const at = order.indexOf(incident.status);
  const state = (i: number): Step['state'] => (i < at || incident.status === 'closed' ? 'done' : i === at ? 'now' : 'todo');
  const done = actions.filter(a => a.status === 'done').length;
  return [
    { label: 'Reported', sub: formatDay(brisbaneDay(incident.created_at)), state: 'done' },
    {
      label: 'Investigating',
      sub: incident.investigation_due ? `Due ${formatDay(incident.investigation_due)}` : 'No due date yet',
      state: at === 0 ? 'todo' : state(1),
    },
    { label: 'Actions', sub: `${done} of ${actions.length} done`, state: state(2) },
    {
      label: 'Closed',
      sub: incident.closed_at ? formatDay(brisbaneDay(incident.closed_at)) : 'Signed off by the WHS officer',
      state: incident.status === 'closed' ? 'done' : 'todo',
    },
  ];
}

/** Whether every action is done, so the incident can be closed. */
export function canClose(incident: Pick<Incident, 'status'>, actions: Pick<WhsAction, 'status'>[]): boolean {
  return incident.status !== 'closed' && actions.every(a => a.status === 'done');
}

// ---------------------------------------------------------------------------------
// Home screen from real records
// ---------------------------------------------------------------------------------

export function buildHome(
  incidents: Incident[],
  hazards: Hazard[],
  actions: WhsAction[],
  me: string,
  now: Date = new Date()
): HomeData {
  const openIncidents = incidents.filter(i => i.status !== 'closed');
  const counts = actionCounts(actions, now);
  const openHazards = hazards.filter(h => h.status !== 'closed');

  const attention: AttentionItem[] = [];
  for (const a of actions) {
    const s = actionState(a, now);
    if (s !== 'overdue' && s !== 'due_soon') continue;
    attention.push({
      id: `a-${a.id}`,
      urgency: s,
      title: a.title,
      unit: a.unit_no || undefined,
      detail: [a.source_ref, a.owner_name && `owner ${a.owner_name}`].filter(Boolean).join(' · '),
      due: a.due ?? undefined,
      moduleId: 'actions',
      href: a.source_id && a.source_type !== 'other' ? `#/${a.source_type === 'inspection' ? 'check' : a.source_type}s/${a.source_id}` : '#/m/actions',
    });
  }
  for (const i of openIncidents) {
    if (i.status === 'investigating' && i.investigation_due) {
      const u = urgencyForDue(i.investigation_due, now);
      if (u) {
        attention.push({ id: `i-${i.id}`, urgency: u, title: `Investigation due: ${i.description.slice(0, 60) || i.ref}`, unit: i.unit_no || undefined, detail: i.ref, due: i.investigation_due, moduleId: 'incidents', href: `#/incidents/${i.id}` });
      }
    }
    if (i.status === 'new') {
      attention.push({ id: `i-${i.id}`, urgency: 'review', title: `New ${incidentTypeLabel(i.type).toLowerCase()}: ${i.description.slice(0, 60)}`, unit: i.unit_no || undefined, detail: `${i.ref}${i.notifiable ? ' · notifiable' : ''}`, moduleId: 'incidents', href: `#/incidents/${i.id}` });
    }
  }
  for (const h of openHazards) {
    if (h.status === 'new') {
      attention.push({ id: `h-${h.id}`, urgency: 'review', title: `Hazard to review: ${h.description.slice(0, 60)}`, unit: h.unit_no || undefined, detail: `${h.ref} · ${riskFor(h.severity).label} risk`, due: hazardFixBy(h), moduleId: 'hazards', href: `#/hazards/${h.id}` });
    }
  }

  const latest: LatestReport[] = [
    ...incidents.map(i => ({ id: i.id, type: incidentTypeLabel(i.type), title: i.description || i.ref, by: `${i.ref} · reported by ${i.reporter_name}`, at: i.created_at })),
    ...hazards.map(h => ({ id: h.id, type: 'Hazard', title: h.description, by: `${h.ref} · reported by ${h.reporter_name}`, at: h.created_at })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 5);

  const mine = actions.filter(a => a.owner_id === me && a.status !== 'done');
  const phoneToday: PhoneTask[] = sortActions(mine, now).slice(0, 5).map(a => {
    const p = actionPill(a, now);
    return { id: a.id, title: a.title, unit: a.unit_no || undefined, detail: a.due ? `Due ${formatDay(a.due)}` : 'No due date', pill: p.label, tone: p.tone };
  });

  const notifiableThisYear = incidents.filter(i => i.notifiable && brisbaneDay(i.occurred_at).slice(0, 4) === brisbaneDay(now).slice(0, 4)).length;

  return {
    summary: [
      { id: 'incidents', label: 'Open incidents', value: openIncidents.length, sub: notifiableThisYear ? `${notifiableThisYear} notifiable this year` : `${incidents.filter(i => i.status === 'investigating').length} under investigation` },
      { id: 'actions', label: 'Overdue actions', value: counts.overdue, sub: `of ${counts.open} open`, alert: true },
      { id: 'hazards', label: 'Hazards to review', value: hazards.filter(h => h.status === 'new').length, sub: `${openHazards.length} open` },
      { id: 'plant', label: 'Plant flagged', value: null, sub: 'Arrives with pre-starts (step 3)' },
    ],
    attention,
    latest,
    navCounts: {
      ...(openIncidents.length ? { incidents: openIncidents.length } : {}),
      ...(openHazards.length ? { hazards: openHazards.length } : {}),
      ...(counts.open ? { actions: counts.open } : {}),
    },
    phoneToday,
    phoneToSign: [],
  };
}

/** Days left (negative = late) in words, for due dates. */
export function dueWords(due: string | null, now: Date = new Date()): string {
  if (!due) return 'No due date';
  const d = daysUntil(due, now);
  if (d === 0) return 'Due today';
  if (d === 1) return 'Due tomorrow';
  if (d > 1) return `Due in ${d} days`;
  return d === -1 ? '1 day late' : `${-d} days late`;
}
