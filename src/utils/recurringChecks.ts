/**
 * Recurring checks: the things that must be done every few months at each site (fire extinguisher
 * inspections, first aid kits, emergency lighting, drills). Each site has its own list, started
 * from the template for its state. Every interval carries where the rule comes from, and a
 * "confirmed" flag: an interval nobody has checked against the current rule shows "to confirm".
 */

import { daysUntil, brisbaneDay } from './dates.ts';
import { addMonths } from './documents.ts';
import type { Tone } from './attention.ts';

export const DUE_SOON_DAYS = 30;

export interface RecurringCheck {
  id: string;
  site_id: string;
  name: string;
  category: string;
  interval_months: number;
  basis: string;
  rule_confirmed: boolean;
  first_due: string | null;
  notes: string;
  active: boolean;
  created_at: string;
}

export interface CheckLogLine {
  id: string;
  check_id: string;
  done_on: string;
  done_by_kind: 'staff' | 'contractor';
  done_by_name: string;
  company: string;
  result: 'passed' | 'failed';
  notes: string;
  file_path: string | null;
  file_name: string | null;
  action_id: string | null;
  recorded_by_name: string;
  created_at: string;
}

export type CheckState = 'overdue' | 'due_soon' | 'ok' | 'never';

export interface Template {
  name: string;
  category: string;
  interval_months: number;
  basis: string;
  confirmed: boolean;
}

const COMMON: Template[] = [
  { name: 'Fire extinguisher inspection', category: 'Fire safety', interval_months: 6, basis: 'AS 1851 (6-monthly inspection). Check the current standard and your state.', confirmed: true },
  { name: 'Emergency and exit lighting test', category: 'Fire safety', interval_months: 6, basis: 'AS 2293. Interval to confirm.', confirmed: false },
  { name: 'Evacuation drill', category: 'Emergency', interval_months: 12, basis: 'Interval to confirm (6 or 12 months).', confirmed: false },
  { name: 'Eyewash and safety shower test', category: 'Emergency', interval_months: 6, basis: 'Interval to confirm.', confirmed: false },
  { name: 'Electrical test and tag', category: 'Electrical', interval_months: 12, basis: 'AS/NZS 3760. Interval depends on the environment. To confirm.', confirmed: false },
  { name: 'Lifting gear and harness inspection', category: 'Plant', interval_months: 6, basis: 'Interval to confirm.', confirmed: false },
];

/** The starting list for a site in a state. Intervals marked unconfirmed show "to confirm". */
export function templatesFor(state: string): Template[] {
  const kit: Template =
    state === 'QLD'
      ? { name: 'First aid kit check', category: 'First aid', interval_months: 12, basis: 'Queensland First Aid code of practice: check at least every 12 months, and after use.', confirmed: true }
      : state === 'NSW'
        ? { name: 'First aid kit check', category: 'First aid', interval_months: 12, basis: 'NSW First Aid code: check on a regular basis. 12 months is a starting point, to confirm.', confirmed: false }
        : { name: 'First aid kit check', category: 'First aid', interval_months: 12, basis: 'Interval to confirm for this state.', confirmed: false };
  return [COMMON[0], kit, ...COMMON.slice(1)];
}

/** The newest line in the log for a check. */
export function lastDone(log: CheckLogLine[]): CheckLogLine | null {
  return log.reduce<CheckLogLine | null>((best, l) => (!best || l.done_on > best.done_on || (l.done_on === best.done_on && l.created_at > best.created_at) ? l : best), null);
}

/** When the check is next due: a month interval after the last time it was done, or the first due date. */
export function nextDue(check: Pick<RecurringCheck, 'interval_months' | 'first_due'>, log: CheckLogLine[]): string | null {
  const last = lastDone(log);
  // A failed check is not finished until it is done again
  if (last && last.result === 'failed') return last.done_on;
  if (last) return addMonths(last.done_on, check.interval_months);
  return check.first_due;
}

export function checkState(check: Pick<RecurringCheck, 'interval_months' | 'first_due'>, log: CheckLogLine[], now: Date = new Date()): CheckState {
  const due = nextDue(check, log);
  if (!due) return 'never';
  const left = daysUntil(due, now);
  if (left < 0) return 'overdue';
  if (left <= DUE_SOON_DAYS) return 'due_soon';
  return 'ok';
}

export function checkPill(check: Pick<RecurringCheck, 'interval_months' | 'first_due'>, log: CheckLogLine[], now: Date = new Date()): { label: string; tone: Tone } {
  const state = checkState(check, log, now);
  const due = nextDue(check, log);
  const last = lastDone(log);
  if (state === 'never') return { label: 'Not done yet', tone: 'amber' };
  const left = daysUntil(due as string, now);
  if (last?.result === 'failed') return { label: 'Failed, do again', tone: 'red' };
  if (state === 'overdue') return { label: `Overdue ${-left} day${left === -1 ? '' : 's'}`, tone: 'red' };
  if (state === 'due_soon') return { label: left === 0 ? 'Due today' : `Due in ${left} day${left === 1 ? '' : 's'}`, tone: 'amber' };
  return { label: 'Up to date', tone: 'green' };
}

export function intervalLabel(months: number): string {
  if (months === 12) return 'Yearly';
  if (months % 12 === 0) return `Every ${months / 12} years`;
  return months === 1 ? 'Monthly' : `Every ${months} months`;
}

/** Templates not already on the site's list (matched by name). */
export function missingTemplates(state: string, existing: Pick<RecurringCheck, 'name'>[]): Template[] {
  const have = new Set(existing.map(e => e.name.trim().toLowerCase()));
  return templatesFor(state).filter(t => !have.has(t.name.toLowerCase()));
}

export function sortByDue<T extends { due: string | null }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (a.due ?? '0000').localeCompare(b.due ?? '0000'));
}

export function today(now: Date = new Date()): string {
  return brisbaneDay(now);
}
