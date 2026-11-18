/** Courses everyone does (unless marked not required on their file): who is current, due, expired or has none. */

import type { Person } from './incidentFile.ts';
import { currentTickets, ticketState, type Ticket } from './tickets.ts';
import { addDays, brisbaneDay } from './dates.ts';

export const COMPANY_COURSES = ['Fire extinguisher training'] as const;

/** Online courses are chased with a "reminder sent" tick; in-person ones are booked for a date. */
export type CourseDelivery = 'online' | 'in_person';
export const COURSE_DELIVERY: Record<string, CourseDelivery> = { 'Fire extinguisher training': 'online' };
export const deliveryOf = (course: string): CourseDelivery => COURSE_DELIVERY[course] ?? 'in_person';

export type CourseState = 'current' | 'due_soon' | 'expired' | 'none';

export interface CourseRow { person: Person; ticket: Ticket | null; state: CourseState }
export interface CourseStatus {
  course: string;
  rows: CourseRow[];
  current: number;
  dueSoon: number;
  expired: number;
  none: number;
  /** active people marked as not needing it */
  excused: number;
}

export function courseStatus(course: string, people: Person[], tickets: Ticket[], now: Date = new Date()): CourseStatus {
  const key = course.toLowerCase();
  const active = people.filter(p => p.active);
  const needed = active.filter(p => !(p.not_required ?? []).some(n => n.toLowerCase() === key));
  const rows = needed.map<CourseRow>(person => {
    const t = currentTickets(tickets.filter(x => x.person_id === person.id)).find(x => x.name.trim().toLowerCase() === key) ?? null;
    if (!t) return { person, ticket: null, state: 'none' };
    const st = ticketState(t, now);
    return { person, ticket: t, state: st === 'expired' ? 'expired' : st === 'due_soon' ? 'due_soon' : 'current' };
  });
  const count = (s: CourseState) => rows.filter(r => r.state === s).length;
  return { course, rows, current: count('current'), dueSoon: count('due_soon'), expired: count('expired'), none: count('none'), excused: active.length - needed.length };
}

/** People who still need to do it, worst first (never done, expired, then due soon). */
export function outstanding(status: CourseStatus): CourseRow[] {
  const rank: Record<CourseState, number> = { none: 0, expired: 1, due_soon: 2, current: 3 };
  return status.rows.filter(r => r.state !== 'current').sort((a, b) => rank[a.state] - rank[b.state] || a.person.name.localeCompare(b.person.name));
}

export interface CourseReminder { id: string; person_id: string; course: string; sent_at: string; sent_by_name: string }

/**
 * The reminder that still counts for this row. A reminder sent before the current ticket came
 * within 60 days of expiring belongs to an earlier round, so it is ignored.
 */
export function reminderFor(row: CourseRow, course: string, reminders: CourseReminder[]): CourseReminder | null {
  const key = course.toLowerCase();
  const r = reminders.find(x => x.person_id === row.person.id && x.course.toLowerCase() === key);
  if (!r) return null;
  if (row.ticket?.expires_on) {
    const window = addDays(row.ticket.expires_on, -60);
    if (brisbaneDay(r.sent_at) < window) return null;
  }
  return r;
}

export function reminderCounts(rows: CourseRow[], course: string, reminders: CourseReminder[]): { sent: number; notSent: number } {
  const sent = rows.filter(r => reminderFor(r, course, reminders)).length;
  return { sent, notSent: rows.length - sent };
}
