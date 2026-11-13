/** Adds recurring checks (extinguishers, first aid kits, drills) to the home screen. */

import type { HomeData } from './homeData.ts';
import type { ComingItem } from './homeBoard.ts';
import { checkState, nextDue, type CheckLogLine, type RecurringCheck } from './recurringChecks.ts';
import { daysUntil } from './dates.ts';

export interface SiteName { id: string; name: string }

export function withRecurring(home: HomeData, checks: RecurringCheck[], log: CheckLogLine[], now: Date = new Date()): HomeData {
  const by = new Map<string, CheckLogLine[]>();
  for (const l of log) by.set(l.check_id, [...(by.get(l.check_id) ?? []), l]);
  const live = checks.filter(c => c.active);
  const st = (c: RecurringCheck) => checkState(c, by.get(c.id) ?? [], now);
  const late = live.filter(c => st(c) === 'overdue').length;
  const soon = live.filter(c => st(c) === 'due_soon').length;
  const never = live.filter(c => st(c) === 'never').length;
  const attention = [...home.attention];
  const plural = (n: number) => (n === 1 ? 'check is' : 'checks are');
  const href = '#/m/recurring';
  if (late) attention.push({ id: 'checks-late', urgency: 'overdue', title: `${late} recurring ${plural(late)} overdue`, detail: 'Fire extinguishers, first aid kits and similar', moduleId: 'recurring', href });
  if (soon) attention.push({ id: 'checks-soon', urgency: 'due_soon', title: `${soon} recurring ${plural(soon)} due within 30 days`, detail: 'Recurring checks', moduleId: 'recurring', href });
  if (never) attention.push({ id: 'checks-never', urgency: 'review', title: `${never} recurring ${plural(never)} never recorded`, detail: 'Record when each was last done so the reminders start', moduleId: 'recurring', href });
  return { ...home, attention, navCounts: { ...home.navCounts, ...(late + soon ? { recurring: late + soon } : {}) } };
}

export function recurringComing(checks: RecurringCheck[], log: CheckLogLine[], sites: SiteName[], now: Date = new Date(), windowDays = 30): ComingItem[] {
  const out: ComingItem[] = [];
  for (const c of checks) {
    if (!c.active) continue;
    const due = nextDue(c, log.filter(l => l.check_id === c.id));
    if (!due) continue;
    const left = daysUntil(due, now);
    if (left >= 0 && left <= windowDays) out.push({ day: due, what: c.name, site: sites.find(s => s.id === c.site_id)?.name ?? '', href: '#/m/recurring' });
  }
  return out;
}
