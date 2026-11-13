/**
 * Site cover: are there enough first aiders and fire wardens at each site, and are their tickets
 * current, and CPR is renewed every 12 months. Headcount is the active people whose site is set to that site. Finlay sites (workshops,
 * yards and plant) are treated as high risk: 1 first aider for every 25 workers. The low risk
 * ratio is 1 in 50 and remote high risk 1 in 10 (state first aid codes of practice).
 */

import type { Person } from './incidentFile.ts';
import { CPR_TICKET, FIRE_WARDEN_TICKET, FIRST_AID_TICKET, currentTickets, ticketState, type Ticket } from './tickets.ts';

export const WORKERS_PER_FIRST_AIDER = 25;

export interface Holder {
  person: Person;
  ticket: Ticket | null;
  /** true when the ticket is there and not expired (for a first aider, CPR must be current too) */
  valid: boolean;
  /** First aiders only: the yearly CPR refresher */
  cpr?: Ticket | null;
  cprValid?: boolean;
}

export interface SiteCover {
  siteId: string;
  headcount: number;
  required: number;
  firstAiders: Holder[];
  validFirstAiders: number;
  /** Counted as first aiders in the app but without a current ticket */
  wardens: Holder[];
  validWardens: number;
  chiefWarden: Holder | null;
  gaps: string[];
}

export function requiredFirstAiders(headcount: number): number {
  return headcount <= 0 ? 0 : Math.ceil(headcount / WORKERS_PER_FIRST_AIDER);
}

function holder(p: Person, name: string, tickets: Ticket[], now: Date): Holder {
  const t = currentTickets(tickets.filter(x => x.person_id === p.id)).find(x => x.name.trim().toLowerCase() === name.toLowerCase()) ?? null;
  return { person: p, ticket: t, valid: !!t && ticketState(t, now) !== 'expired' };
}

export function coverFor(siteId: string, people: Person[], tickets: Ticket[], now: Date = new Date()): SiteCover {
  const here = people.filter(p => p.active && p.site_id === siteId);
  const firstAiders = here.filter(p => p.is_first_aider).map(p => {
    const h = holder(p, FIRST_AID_TICKET, tickets, now);
    const c = holder(p, CPR_TICKET, tickets, now);
    return { ...h, cpr: c.ticket, cprValid: c.valid, valid: h.valid && c.valid };
  });
  const wardens = here.filter(p => p.is_fire_warden).map(p => holder(p, FIRE_WARDEN_TICKET, tickets, now));
  const required = requiredFirstAiders(here.length);
  const validFirstAiders = firstAiders.filter(h => h.valid).length;
  const validWardens = wardens.filter(h => h.valid).length;
  const chiefWarden = wardens.find(h => h.person.warden_role === 'chief') ?? null;
  const gaps: string[] = [];
  if (here.length && validFirstAiders < required) gaps.push(`Needs ${required} first aider${required === 1 ? '' : 's'} with a current ticket, has ${validFirstAiders}`);
  if (here.length && validWardens === 0) gaps.push('No fire warden with a current ticket');
  else if (here.length && wardens.length && !chiefWarden) gaps.push('No chief warden named');
  const noFa = firstAiders.filter(h => !h.ticket || ticketState(h.ticket, now) === 'expired').length;
  if (noFa) gaps.push(`${noFa} first aider${noFa === 1 ? '' : 's'} without a current first aid ticket`);
  const noCpr = firstAiders.filter(h => !h.cprValid).length;
  if (noCpr) gaps.push(`${noCpr} first aider${noCpr === 1 ? '' : 's'} without current CPR (renewed every 12 months)`);
  return { siteId, headcount: here.length, required, firstAiders, validFirstAiders, wardens, validWardens, chiefWarden, gaps };
}

/** Sites that are short of first aiders or fire wardens. */
export function sitesShort(siteIds: string[], people: Person[], tickets: Ticket[], now: Date = new Date()): string[] {
  return siteIds.filter(id => coverFor(id, people, tickets, now).gaps.length > 0);
}

export { CPR_TICKET };
