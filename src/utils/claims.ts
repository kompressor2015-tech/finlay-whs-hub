/**
 * Injury management: a claim for each injured person on an incident, with its medical
 * certificates, return to work plan, contacts, correspondence and documents. The steps and
 * wording differ by state (QLD WorkCover, VIC WorkSafe, NSW icare / SIRA). No Supabase calls
 * here, so it is all unit-tested.
 *
 * The state rules below come from each scheme's own employer guidance (see `source`). Where the
 * guidance gives no number of days, none is shown.
 */

import type { Tone } from './attention.ts';
import { addDays, brisbaneDay, daysUntil, formatDay } from './dates.ts';

export type State = 'QLD' | 'VIC' | 'NSW';
export type ClaimStatus = 'not_lodged' | 'lodged' | 'accepted' | 'rejected' | 'under_review' | 'closed';
export type RtwStatus = 'none' | 'draft' | 'agreed' | 'in_progress' | 'complete';
export type Capacity = 'unfit' | 'partial' | 'fit';
export type LogKind = 'call' | 'meeting' | 'email_in' | 'email_out' | 'letter_in' | 'letter_out' | 'form' | 'note';
export type DocCategory = 'claim_forms' | 'medical' | 'return_to_work' | 'insurer' | 'worker' | 'other';

export interface Claim {
  id: string;
  incident_id: string;
  person_id: string;
  state: State;
  insurer: string;
  claim_no: string;
  status: ClaimStatus;
  injury_date: string | null;
  insurer_notified_at: string | null;
  claim_lodged_on: string | null;
  decision_on: string | null;
  claim_manager_name: string;
  claim_manager_phone: string;
  claim_manager_email: string;
  excess_note: string;
  rtw_coordinator: string;
  rtw_status: RtwStatus;
  rtw_goal: string;
  rtw_goal_date: string | null;
  rtw_next_review: string | null;
  off_work_from: string | null;
  returned_on: string | null;
  closed_on: string | null;
  steps: Record<string, { at: string; by: string }>;
  notes: string;
  created_by_name: string;
  created_at: string;
  updated_at: string;
}

export interface Certificate {
  id: string;
  claim_id: string;
  from_date: string;
  to_date: string;
  doctor_name: string;
  capacity: Capacity;
  restrictions: string;
  /** When they next see the doctor, if known */
  next_appointment_on?: string | null;
  file_path: string;
  file_name: string;
  created_by_name: string;
  created_at: string;
}

export interface RtwStage {
  id: string;
  claim_id: string;
  stage_no: number;
  duties: string;
  hours: string;
  starts_on: string | null;
  status: 'planned' | 'current' | 'done';
}

export type AppointmentKind = 'doctor' | 'specialist' | 'physio' | 'psychologist' | 'assessment' | 'other';
export type AppointmentStatus = 'booked' | 'attended' | 'missed' | 'cancelled';

export interface Appointment {
  id: string;
  claim_id: string;
  kind: AppointmentKind;
  with_whom: string;
  on_date: string;
  at_time: string;
  place: string;
  status: AppointmentStatus;
  outcome: string;
  follow_up_on: string | null;
  follow_up_note: string;
  followed_up_at: string | null;
  followed_up_by_name: string;
  created_by_name: string;
  created_at: string;
}

export const APPOINTMENT_KINDS: { id: AppointmentKind; label: string }[] = [
  { id: 'doctor', label: 'Doctor (GP)' },
  { id: 'specialist', label: 'Specialist' },
  { id: 'physio', label: 'Physio' },
  { id: 'psychologist', label: 'Psychologist' },
  { id: 'assessment', label: 'Assessment or scan' },
  { id: 'other', label: 'Other' },
];

export const APPOINTMENT_STATUSES: { id: AppointmentStatus; label: string; tone: Tone }[] = [
  { id: 'booked', label: 'Booked', tone: 'blue' },
  { id: 'attended', label: 'Attended', tone: 'green' },
  { id: 'missed', label: 'Missed', tone: 'red' },
  { id: 'cancelled', label: 'Cancelled', tone: 'grey' },
];

export function appointmentKindLabel(kind: AppointmentKind): string {
  return APPOINTMENT_KINDS.find(k => k.id === kind)?.label ?? kind;
}

export interface ClaimContact {
  id: string;
  claim_id: string;
  name: string;
  role: string;
  org: string;
  phone: string;
  email: string;
}

export interface LogEntry {
  id: string;
  claim_id: string;
  kind: LogKind;
  with_whom: string;
  what: string;
  happened_at: string;
  file_path: string;
  file_name: string;
  created_by_name: string;
}

export interface ClaimDoc {
  id: string;
  claim_id: string;
  category: DocCategory;
  title: string;
  file_path: string;
  file_name: string;
  created_by_name: string;
  created_at: string;
}

// ---------------------------------------------------------------------------------
// State rules
// ---------------------------------------------------------------------------------

export interface ClaimStep {
  id: string;
  label: string;
}

export interface StateInfo {
  id: State;
  scheme: string;
  insurer: string;
  certificate: string;
  steps: ClaimStep[];
  rules: string[];
  source: { label: string; url: string };
}

export const STATES: Record<State, StateInfo> = {
  QLD: {
    id: 'QLD',
    scheme: 'WorkCover Queensland',
    insurer: 'WorkCover Queensland',
    certificate: 'Medical certificate',
    steps: [
      { id: 'notified', label: 'WorkCover Queensland notified of the injury' },
      { id: 'form', label: 'Worker given the claim form' },
      { id: 'lodged', label: 'Claim lodged with a medical certificate' },
      { id: 'contacted', label: 'Worker contacted early' },
      { id: 'wages', label: 'Wage information sent to WorkCover' },
      { id: 'duties', label: 'Suitable duties offered, or written reasons sent to WorkCover' },
      { id: 'plan', label: 'Return to work plan agreed with the worker' },
      { id: 'checkins', label: 'Regular check-ins with the worker recorded' },
    ],
    rules: [
      'Start rehabilitation as soon as it is safe to do so, and contact the worker early.',
      'Give WorkCover the worker\'s wage history quickly, before the claim is decided.',
      'Offer suitable duties. If you can\'t, give WorkCover written reasons with evidence.',
      'Don\'t dismiss the worker within 12 months of the injury solely or mainly because they are unfit for their role due to the injury.',
      'Use workers\' compensation documents only to help the worker return to work.',
      'Employers above a wages threshold must have a Rehabilitation and Return to Work Coordinator and a rehabilitation policy.',
    ],
    source: { label: 'WorkCover Queensland: employer responsibilities', url: 'https://www.workcoverqld.com.au/recovery-and-return-to-work/treatment-and-recovery/roles-and-responsibilities-in-your-recovery/employer-responsibilities-in-recovery' },
  },
  VIC: {
    id: 'VIC',
    scheme: 'WorkSafe Victoria',
    insurer: 'WorkSafe Victoria agent',
    certificate: 'Certificate of Capacity',
    steps: [
      { id: 'coordinator', label: 'Return to work coordinator appointed and the worker told who they are' },
      { id: 'certificate', label: 'Certificate of Capacity received' },
      { id: 'form', label: 'Worker\'s claim form received' },
      { id: 'contacted', label: 'Worker contacted, and regular contact kept' },
      { id: 'suitable', label: 'Suitable employment offered' },
      { id: 'arrangements', label: 'Return to work arrangements form completed' },
      { id: 'practitioner', label: 'Treating practitioner consulted (only with the worker\'s consent)' },
      { id: 'information', label: 'Return to work information available to all employees' },
    ],
    rules: [
      'Your obligations start when you receive the Certificate of Capacity or the claim form, or are told by your WorkSafe agent that they have one. That is before the claim is accepted.',
      'If the worker is unfit for their pre-injury work, provide suitable employment for 52 weeks after the injury.',
      'Appoint a return to work coordinator with enough seniority, and tell the worker who it is.',
      'Consult the worker, and the treating practitioner only with the worker\'s consent.',
      'Breaches can be prosecuted.',
    ],
    source: { label: 'WorkSafe Victoria: employer\'s legal obligations during return to work', url: 'https://worksafe.vic.gov.au/employers-legal-obligations-during-return-work' },
  },
  NSW: {
    id: 'NSW',
    scheme: 'icare / SIRA',
    insurer: 'Workers compensation insurer (icare)',
    certificate: 'Certificate of capacity',
    steps: [
      { id: 'notified', label: 'Insurer notified within 48 hours' },
      { id: 'details', label: 'Insurer\'s details given to the worker' },
      { id: 'certificate', label: 'Certificate of capacity received' },
      { id: 'consent', label: 'Consent form signed to share injury and recovery information' },
      { id: 'plan', label: 'Return to work plan written and given to the worker' },
      { id: 'program', label: 'Return to work program in place' },
      { id: 'reviewed', label: 'Plan reviewed (the guide recommends weekly)' },
    ],
    rules: [
      'Tell the insurer about the injury within 48 hours, and give the worker the insurer\'s details.',
      'A certificate of capacity covers no more than 28 days. The doctor completes it, and you use it to plan suitable work.',
      'The return to work plan covers suitable duties, limits, hours and breaks, support, progression and a review date. Give the worker a copy of every updated version.',
      'The insurer develops the injury management plan with the worker and doctor.',
      'Don\'t dismiss the worker because of the injury within six months of when they first become unfit for work.',
    ],
    source: { label: 'SIRA: injured at work guide for employers', url: 'https://www.sira.nsw.gov.au/resources-library/workers-compensation-resources/publications/workers-and-claims/injured-at-work-guide' },
  },
};

export const STATE_LIST: State[] = ['QLD', 'VIC', 'NSW'];

/** The claim number and insurer wording to show for a state. */
export function stateInfo(state: State): StateInfo {
  return STATES[state];
}

export const CLAIM_STATUSES: { id: ClaimStatus; label: string; tone: Tone }[] = [
  { id: 'not_lodged', label: 'Not lodged', tone: 'grey' },
  { id: 'lodged', label: 'Lodged', tone: 'blue' },
  { id: 'accepted', label: 'Accepted', tone: 'green' },
  { id: 'under_review', label: 'Under review', tone: 'amber' },
  { id: 'rejected', label: 'Rejected', tone: 'red' },
  { id: 'closed', label: 'Closed', tone: 'grey' },
];

export function claimStatus(status: ClaimStatus): { label: string; tone: Tone } {
  return CLAIM_STATUSES.find(s => s.id === status) ?? { label: status, tone: 'grey' };
}

export const RTW_STATUSES: { id: RtwStatus; label: string; tone: Tone }[] = [
  { id: 'none', label: 'No plan yet', tone: 'grey' },
  { id: 'draft', label: 'Plan in draft', tone: 'amber' },
  { id: 'agreed', label: 'Plan agreed', tone: 'blue' },
  { id: 'in_progress', label: 'Back at work, building up', tone: 'blue' },
  { id: 'complete', label: 'Back to full duties', tone: 'green' },
];

export function rtwStatus(status: RtwStatus): { label: string; tone: Tone } {
  return RTW_STATUSES.find(s => s.id === status) ?? { label: status, tone: 'grey' };
}

export const CAPACITIES: { id: Capacity; label: string; tone: Tone }[] = [
  { id: 'unfit', label: 'Unfit for all work', tone: 'red' },
  { id: 'partial', label: 'Fit for some duties', tone: 'amber' },
  { id: 'fit', label: 'Fit for normal duties', tone: 'green' },
];

export function capacityLabel(c: Capacity): { label: string; tone: Tone } {
  return CAPACITIES.find(x => x.id === c) ?? { label: c, tone: 'grey' };
}

export const LOG_KINDS: { id: LogKind; label: string }[] = [
  { id: 'call', label: 'Phone call' },
  { id: 'meeting', label: 'Meeting' },
  { id: 'email_in', label: 'Email in' },
  { id: 'email_out', label: 'Email out' },
  { id: 'letter_in', label: 'Letter in' },
  { id: 'letter_out', label: 'Letter out' },
  { id: 'form', label: 'Form' },
  { id: 'note', label: 'Note' },
];

export function logLabel(kind: LogKind): string {
  return LOG_KINDS.find(k => k.id === kind)?.label ?? kind;
}

export const DOC_CATEGORIES: { id: DocCategory; label: string; sub: string }[] = [
  { id: 'claim_forms', label: 'Claim forms', sub: 'Claim form, wage information' },
  { id: 'medical', label: 'Medical', sub: 'Certificates, GP and physio letters' },
  { id: 'return_to_work', label: 'Return to work', sub: 'Plan, review notes, duties' },
  { id: 'insurer', label: 'Insurer letters', sub: 'Decisions and requests' },
  { id: 'worker', label: 'Worker\'s own', sub: 'Statements, consent forms' },
  { id: 'other', label: 'Other', sub: 'Anything that does not fit' },
];

// ---------------------------------------------------------------------------------
// Steps and deadlines
// ---------------------------------------------------------------------------------

export function stepsDone(claim: Pick<Claim, 'state' | 'steps'>): { done: number; total: number } {
  const list = STATES[claim.state].steps;
  return { done: list.filter(s => claim.steps?.[s.id]).length, total: list.length };
}

/** NSW employers tell the insurer within 48 hours of the incident. Other states give no number of days. */
export function notifyDeadline(state: State, incidentAt: string): string | null {
  if (state !== 'NSW') return null;
  return new Date(new Date(incidentAt).getTime() + 48 * 3_600_000).toISOString();
}

// ---------------------------------------------------------------------------------
// Certificates
// ---------------------------------------------------------------------------------

export interface CertificateStatus {
  current: Certificate | null;
  /** Days left on the current certificate (0 = ends today), or null when there isn't one. */
  endsInDays: number | null;
  /** Days with no certificate between two certificates. */
  gaps: { from: string; to: string }[];
  /** The last certificate's end date when it has run out and nothing has replaced it. */
  lapsedSince: string | null;
}

export function certificateStatus(certs: Pick<Certificate, 'from_date' | 'to_date' | 'capacity'>[], now: Date = new Date()): CertificateStatus & { latest: Pick<Certificate, 'from_date' | 'to_date' | 'capacity'> | null } {
  const sorted = [...certs].sort((a, b) => (a.from_date < b.from_date ? -1 : a.from_date > b.from_date ? 1 : 0));
  const today = brisbaneDay(now);
  const current = sorted.find(c => c.from_date <= today && today <= c.to_date) ?? null;
  const gaps: { from: string; to: string }[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prevEnd = sorted[i - 1].to_date;
    const next = sorted[i].from_date;
    if (next > addDays(prevEnd, 1)) gaps.push({ from: addDays(prevEnd, 1), to: addDays(next, -1) });
  }
  const latest = sorted.length ? sorted.reduce((a, b) => (b.to_date > a.to_date ? b : a)) : null;
  const lapsedSince = !current && latest && latest.to_date < today ? latest.to_date : null;
  return { current: current as Certificate | null, endsInDays: current ? daysUntil(current.to_date, now) : null, gaps, lapsedSince, latest };
}

// ---------------------------------------------------------------------------------
// Time off work
// ---------------------------------------------------------------------------------

/** Calendar days from the first day off to the day back (or today). */
export function daysOffWork(claim: Pick<Claim, 'off_work_from' | 'returned_on'>, now: Date = new Date()): number | null {
  if (!claim.off_work_from) return null;
  const end = claim.returned_on ?? brisbaneDay(now);
  return Math.max(0, daysUntil(end, new Date(`${claim.off_work_from}T12:00:00+10:00`)));
}

export function isOffWork(claim: Pick<Claim, 'off_work_from' | 'returned_on' | 'status'>): boolean {
  return Boolean(claim.off_work_from) && !claim.returned_on && claim.status !== 'closed';
}

export function isOpen(claim: Pick<Claim, 'status'>): boolean {
  return claim.status !== 'closed' && claim.status !== 'rejected';
}

// ---------------------------------------------------------------------------------
// Needs attention
// ---------------------------------------------------------------------------------

export interface ClaimAttention {
  id: string;
  tone: Tone;
  when: string;
  what: string;
  action: 'certificate' | 'plan' | 'step' | 'review' | 'appointment';
}

export function claimAttention(
  claim: Pick<Claim, 'state' | 'status' | 'steps' | 'off_work_from' | 'returned_on' | 'rtw_next_review' | 'rtw_status' | 'insurer_notified_at'>,
  certs: Pick<Certificate, 'from_date' | 'to_date' | 'capacity' | 'next_appointment_on'>[],
  incidentAt: string,
  now: Date = new Date(),
  appointments: Pick<Appointment, 'id' | 'kind' | 'with_whom' | 'on_date' | 'status' | 'follow_up_on' | 'followed_up_at'>[] = []
): ClaimAttention[] {
  if (!isOpen(claim)) return [];
  const out: ClaimAttention[] = [];
  const cs = certificateStatus(certs, now);
  const today = brisbaneDay(now);
  const label = STATES[claim.state].certificate.toLowerCase();
  if (isOffWork(claim)) {
    if (cs.current && cs.endsInDays !== null && cs.endsInDays <= 7) {
      out.push({
        id: 'cert-ends', action: 'certificate', tone: cs.endsInDays <= 3 ? 'red' : 'amber',
        when: cs.endsInDays === 0 ? 'Today' : `In ${cs.endsInDays} ${cs.endsInDays === 1 ? 'day' : 'days'}`,
        what: `The ${label} ends ${formatDay(cs.current.to_date)}. ${(() => {
          const booked = appointments.find(a => a.status === 'booked' && a.kind === 'doctor' && a.on_date >= today && a.on_date <= cs.current!.to_date);
          const next = cs.current!.next_appointment_on;
          if (booked) return `Doctor appointment booked for ${formatDay(booked.on_date)}, so the next one is due then.`;
          if (next && next >= today) return `Back to the doctor on ${formatDay(next)}, so the next one is due then.`;
          return 'No doctor appointment is recorded. Ask when they see the doctor next.';
        })()}`,
      });
    } else if (!cs.current) {
      out.push({
        id: 'cert-none', action: 'certificate', tone: 'red', when: 'Now',
        what: cs.lapsedSince ? `No current ${label} since ${formatDay(cs.lapsedSince)}.` : `No ${label} on file yet.`,
      });
    }
  }
  if (claim.rtw_next_review && claim.rtw_status !== 'complete') {
    const d = daysUntil(claim.rtw_next_review, now);
    if (d < 0) out.push({ id: 'rtw-late', action: 'plan', tone: 'red', when: 'Overdue', what: `Return to work review was due ${formatDay(claim.rtw_next_review)}.` });
    else if (d <= 7) out.push({ id: 'rtw-due', action: 'plan', tone: 'amber', when: d === 0 ? 'Today' : `In ${d} ${d === 1 ? 'day' : 'days'}`, what: `Return to work review is due ${formatDay(claim.rtw_next_review)}.` });
  }
  const past = certs.find(c => c.next_appointment_on && c.next_appointment_on < today && !certs.some(o => o.from_date >= (c.next_appointment_on as string)));
  if (past && isOffWork(claim)) {
    out.push({ id: 'cert-appt-past', action: 'certificate', tone: 'amber', when: 'Overdue', what: `Doctor appointment was on ${formatDay(past.next_appointment_on)}. Ask for the new certificate.` });
  }
  for (const a of appointments) {
    if (a.status === 'cancelled') continue;
    const who = `${appointmentKindLabel(a.kind).toLowerCase()}${a.with_whom ? ` with ${a.with_whom}` : ''}`;
    if (a.status === 'booked') {
      const d = daysUntil(a.on_date, now);
      if (d < 0) out.push({ id: `appt-${a.id}`, action: 'appointment', tone: 'amber', when: 'Overdue', what: `The ${who} was on ${formatDay(a.on_date)}. Did they go? Record the outcome.` });
      else if (d <= 2) out.push({ id: `appt-${a.id}`, action: 'appointment', tone: 'amber', when: d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : 'In 2 days', what: `${who[0].toUpperCase()}${who.slice(1)} appointment on ${formatDay(a.on_date)}.` });
      else if (d <= 7) out.push({ id: `appt-${a.id}`, action: 'appointment', tone: 'grey', when: `In ${d} days`, what: `${who[0].toUpperCase()}${who.slice(1)} appointment on ${formatDay(a.on_date)}.` });
    }
    if (a.status === 'missed' && !a.followed_up_at) out.push({ id: `missed-${a.id}`, action: 'appointment', tone: 'red', when: 'Missed', what: `They missed the ${who} on ${formatDay(a.on_date)}. Follow up.` });
    if (a.follow_up_on && !a.followed_up_at && a.follow_up_on <= today) {
      out.push({ id: `fu-${a.id}`, action: 'appointment', tone: daysUntil(a.follow_up_on, now) < 0 ? 'red' : 'amber', when: daysUntil(a.follow_up_on, now) < 0 ? 'Overdue' : 'Today', what: `Follow up after the ${who} (${formatDay(a.on_date)}).` });
    }
  }
  const deadline = notifyDeadline(claim.state, incidentAt);
  if (deadline && !claim.steps?.notified) {
    const late = now.getTime() > new Date(deadline).getTime();
    out.push({ id: 'notify', action: 'step', tone: late ? 'red' : 'amber', when: late ? 'Overdue' : 'Within 48 hours', what: 'Tell the insurer about the injury.' });
  }
  return out;
}
