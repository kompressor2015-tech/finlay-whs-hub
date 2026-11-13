/** Adds tickets and site cover to the home screen (office roles only: tickets are not readable by field staff). */

import type { HomeData } from './homeData.ts';
import type { Person } from './incidentFile.ts';
import { ticketState, currentTickets, type Ticket } from './tickets.ts';
import { sitesShort } from './siteCover.ts';

export function withTickets(home: HomeData, people: Person[], tickets: Ticket[], siteIds: string[], now: Date = new Date()): HomeData {
  const active = new Set(people.filter(p => p.active).map(p => p.id));
  const current = currentTickets(tickets.filter(t => active.has(t.person_id)));
  const expired = current.filter(t => ticketState(t, now) === 'expired').length;
  const soon = current.filter(t => ticketState(t, now) === 'due_soon').length;
  const short = sitesShort(siteIds, people, tickets, now).length;
  const attention = [...home.attention];
  const href = '#/m/training';
  const s = (n: number) => (n === 1 ? 'ticket has' : 'tickets have');
  if (expired) attention.push({ id: 'tickets-expired', urgency: 'overdue', title: `${expired} ${s(expired)} expired`, detail: 'Training and tickets', moduleId: 'training', href });
  if (soon) attention.push({ id: 'tickets-soon', urgency: 'due_soon', title: `${soon} ${s(soon)} expire within 60 days`, detail: 'Training and tickets', moduleId: 'training', href });
  if (short) attention.push({ id: 'cover-short', urgency: 'review', title: `${short} ${short === 1 ? 'site is' : 'sites are'} short of first aiders or fire wardens`, detail: 'Training & site cover', moduleId: 'training', href });
  return { ...home, attention, navCounts: { ...home.navCounts, ...(expired + soon + short ? { training: expired + soon + short } : {}) } };
}
