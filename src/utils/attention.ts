/**
 * The "Needs attention" list on the home screen. Each module turns its own records
 * into AttentionItems; this file decides how urgent each one is and the order they show in.
 */

import { daysUntil } from './dates.ts';

export type Urgency = 'overdue' | 'due_soon' | 'not_signed' | 'review';

export interface AttentionItem {
  id: string;
  urgency: Urgency;
  title: string;
  /** Machine unit number, shown in Finlay red */
  unit?: string;
  detail: string;
  /** YYYY-MM-DD the item is due, if it has one */
  due?: string;
  moduleId: string;
}

export type Tone = 'red' | 'amber' | 'blue' | 'green' | 'grey';

const PILLS: Record<Urgency, { label: string; tone: Tone; rank: number }> = {
  overdue: { label: 'Overdue', tone: 'red', rank: 0 },
  due_soon: { label: 'Due this week', tone: 'amber', rank: 1 },
  not_signed: { label: 'Not signed', tone: 'amber', rank: 2 },
  review: { label: 'To review', tone: 'blue', rank: 3 },
};

export function pillFor(urgency: Urgency): { label: string; tone: Tone } {
  const { label, tone } = PILLS[urgency];
  return { label, tone };
}

/**
 * Urgency of something with a due date: overdue once the day has passed, due soon within
 * `soonDays` (7 by default), otherwise null (not on the list yet).
 */
export function urgencyForDue(due: string, now: Date = new Date(), soonDays = 7): Urgency | null {
  const days = daysUntil(due, now);
  if (days < 0) return 'overdue';
  if (days <= soonDays) return 'due_soon';
  return null;
}

/** Most urgent first; within the same urgency, the earliest due date first; undated last. */
export function sortAttention(items: AttentionItem[]): AttentionItem[] {
  return [...items].sort((a, b) => {
    const r = PILLS[a.urgency].rank - PILLS[b.urgency].rank;
    if (r !== 0) return r;
    if (a.due && b.due) return a.due.localeCompare(b.due);
    if (a.due) return -1;
    if (b.due) return 1;
    return a.title.localeCompare(b.title);
  });
}
