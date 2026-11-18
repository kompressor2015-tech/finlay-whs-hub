/** Tickets and training: first aid, CPR, fire warden, licences. Expiry, status and what is current. */

import { addMonths } from './documents.ts';
import { daysUntil } from './dates.ts';

export interface Ticket {
  id: string;
  person_id: string;
  name: string;
  number: string;
  issued_on: string | null;
  expires_on: string | null;
  provider: string;
  file_path: string;
  file_name: string;
  notes: string;
  /** Classes covered by one card, such as a high risk work licence */
  classes?: string[];
  created_by_name: string;
  created_at: string;
}

/** Common tickets with how long each normally lasts. The expiry is filled in from this and can be changed. */
export const TICKET_PRESETS: { name: string; months: number | null; note: string }[] = [
  { name: 'Provide First Aid', months: 36, note: 'Renew every 3 years' },
  { name: 'CPR refresher', months: 12, note: 'Every year' },
  { name: 'Fire warden', months: 6, note: 'Warden / E.C.O. Refresher, at least every 6 months (AS 3745)' },
  { name: 'Fire extinguisher training', months: 12, note: 'Occupant Evacuation & First Response Procedures (Fire EMT online), every 12 months' },
  { name: 'White card', months: null, note: 'General construction induction, no expiry' },
  { name: 'High risk work licence', months: 60, note: 'One card, one expiry: tick every class on it. Check the expiry printed on the card (usually 5 years)' },
  { name: 'Working at heights', months: null, note: 'Enter the expiry from the card' },
  { name: 'Site induction', months: null, note: 'No expiry' },
];

export const HRW_TICKET = 'High risk work licence';
/** Classes on a high risk work licence. Anything else can be typed in. */
export const HRW_CLASSES = [
  'Forklift (LF)', 'Dogging (DG)', 'Basic rigging (RB)', 'Intermediate rigging (RI)', 'Advanced rigging (RA)',
  'Scaffolding', 'Crane', 'Elevating work platform (WP)',
];

/** People holding each class on a current (not expired) high risk work licence, for the classes anyone holds. */
export function classHolders(tickets: Ticket[], names: Map<string, string>, now: Date = new Date()): { cls: string; holders: { personId: string; name: string; expires_on: string | null; expired: boolean }[] }[] {
  const byPerson = new Map<string, Ticket[]>();
  for (const t of tickets) {
    if (t.name.trim().toLowerCase() !== HRW_TICKET.toLowerCase() || !names.has(t.person_id)) continue;
    byPerson.set(t.person_id, [...(byPerson.get(t.person_id) ?? []), t]);
  }
  const out = new Map<string, { personId: string; name: string; expires_on: string | null; expired: boolean }[]>();
  for (const [personId, list] of byPerson) {
    const t = currentTickets(list)[0];
    for (const cls of t.classes ?? []) out.set(cls, [...(out.get(cls) ?? []), { personId, name: names.get(personId) as string, expires_on: t.expires_on, expired: ticketState(t, now) === 'expired' }]);
  }
  return [...out.entries()].map(([cls, holders]) => ({ cls, holders: holders.sort((a, b) => a.name.localeCompare(b.name)) })).sort((a, b) => a.cls.localeCompare(b.cls));
}

export const FIRST_AID_TICKET = 'Provide First Aid';
export const CPR_TICKET = 'CPR refresher';
export const FIRE_WARDEN_TICKET = 'Fire warden';

export function presetFor(name: string) {
  return TICKET_PRESETS.find(p => p.name.toLowerCase() === name.trim().toLowerCase()) ?? null;
}

/** Expiry worked out from the issue date, or null when the ticket does not expire. */
export function expiryFromIssue(name: string, issuedOn: string): string | null {
  const months = presetFor(name)?.months ?? null;
  return months && issuedOn ? addMonths(issuedOn, months) : null;
}

/** How soon a ticket is flagged before it runs out. */
export const DUE_SOON_DAYS = 60;

export type TicketState = 'expired' | 'due_soon' | 'ok' | 'no_expiry';

export function ticketState(t: Pick<Ticket, 'expires_on'>, now: Date = new Date()): TicketState {
  if (!t.expires_on) return 'no_expiry';
  const left = daysUntil(t.expires_on, now);
  if (left < 0) return 'expired';
  if (left <= DUE_SOON_DAYS) return 'due_soon';
  return 'ok';
}

export function ticketPill(t: Pick<Ticket, 'expires_on'>, now: Date = new Date()): { label: string; tone: 'red' | 'amber' | 'green' | 'grey' } {
  const s = ticketState(t, now);
  if (s === 'no_expiry') return { label: 'No expiry', tone: 'green' };
  const left = daysUntil(t.expires_on as string, now);
  if (s === 'expired') return { label: left === -1 ? 'Expired yesterday' : `Expired ${-left} days ago`, tone: 'red' };
  if (s === 'due_soon') return { label: left === 0 ? 'Expires today' : left === 1 ? 'Expires tomorrow' : `${left} days`, tone: 'amber' };
  return { label: 'Current', tone: 'green' };
}

/** Only the newest ticket of each name counts: a renewal replaces the one before it (which stays in the history). */
export function currentTickets(list: Ticket[]): Ticket[] {
  const byName = new Map<string, Ticket>();
  const stamp = (t: Ticket) => `${t.issued_on ?? ''}|${t.created_at}`;
  for (const t of list) {
    const key = t.name.trim().toLowerCase();
    const have = byName.get(key);
    if (!have || stamp(t) > stamp(have)) byName.set(key, t);
  }
  return [...byName.values()].sort((a, b) => (a.expires_on ?? '9999').localeCompare(b.expires_on ?? '9999') || a.name.localeCompare(b.name));
}

/** Tickets that need someone to act, worst first. */
export function ticketsNeedingAction(list: Ticket[], now: Date = new Date()): Ticket[] {
  return currentTickets(list).filter(t => ['expired', 'due_soon'].includes(ticketState(t, now)));
}
