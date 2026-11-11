/**
 * Numbers for the charts on the desktop home screen: how things are going, not just what is
 * due. Pure functions, so they are tested and the home screen only draws them.
 */

import type { Hazard, Incident, WhsAction } from './records.ts';
import { actionState } from './records.ts';
import { currentSds, sdsState, type Chemical, type Sds } from './chemicals.ts';
import { classToConfirm } from './stocktakes.ts';

export interface MonthCount {
  /** e.g. "Nov" */
  label: string;
  /** yyyy-mm, Brisbane time */
  key: string;
  hazards: number;
  incidents: number;
}

export interface ActionSplit {
  done: number;
  open: number;
  dueSoon: number;
  overdue: number;
}

export interface Health {
  id: string;
  label: string;
  /** Items meeting the target */
  good: number;
  total: number;
  /** Target as a share, 0 to 1 */
  target: number;
  href: string;
}

export interface HomeCharts {
  months: MonthCount[];
  actions: ActionSplit;
  health: Health[];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** yyyy-mm of an ISO timestamp in Brisbane time (UTC+10, no daylight saving). */
export function brisbaneMonth(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 10 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** The last `n` months ending with the month of `now`, oldest first. */
export function lastMonths(now: Date, n: number): { key: string; label: string }[] {
  const base = new Date(now.getTime() + 10 * 3600 * 1000);
  const out: { key: string; label: string }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - i, 1));
    out.push({ key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`, label: MONTHS[d.getUTCMonth()] });
  }
  return out;
}

export function monthlyCounts(hazards: Pick<Hazard, 'created_at'>[], incidents: Pick<Incident, 'occurred_at'>[], now: Date, n = 6): MonthCount[] {
  const months = lastMonths(now, n).map(m => ({ ...m, hazards: 0, incidents: 0 }));
  const at = new Map(months.map(m => [m.key, m]));
  for (const h of hazards) {
    const m = at.get(brisbaneMonth(h.created_at));
    if (m) m.hazards += 1;
  }
  for (const i of incidents) {
    const m = at.get(brisbaneMonth(i.occurred_at));
    if (m) m.incidents += 1;
  }
  return months;
}

export function actionSplit(actions: Pick<WhsAction, 'status' | 'due'>[], now: Date): ActionSplit {
  const out: ActionSplit = { done: 0, open: 0, dueSoon: 0, overdue: 0 };
  for (const a of actions) {
    const s = actionState(a, now);
    if (s === 'done') out.done += 1;
    else if (s === 'overdue') out.overdue += 1;
    else if (s === 'due_soon') out.dueSoon += 1;
    else out.open += 1;
  }
  return out;
}

/** Chemical register health against a 100% target: class checked, and SDS in date. */
export function chemicalHealth(chemicals: Chemical[], sds: Sds[], now: Date): Health[] {
  const active = chemicals.filter(c => c.active);
  if (active.length === 0) return [];
  const byChem = new Map<string, Sds[]>();
  for (const s of sds) byChem.set(s.chemical_id, [...(byChem.get(s.chemical_id) ?? []), s]);
  const confirmed = active.filter(c => !classToConfirm(c)).length;
  const inDate = active.filter(c => {
    const st = sdsState(currentSds(byChem.get(c.id) ?? []), now);
    return st === 'ok' || st === 'due_soon';
  }).length;
  return [
    { id: 'class', label: 'DG class checked from the SDS', good: confirmed, total: active.length, target: 1, href: '#/m/chemicals' },
    { id: 'sds', label: 'SDS less than 5 years old', good: inDate, total: active.length, target: 1, href: '#/m/chemicals' },
  ];
}

export function buildCharts(
  incidents: Incident[], hazards: Hazard[], actions: WhsAction[], chemicals: Chemical[], sds: Sds[], now: Date = new Date(),
): HomeCharts {
  return {
    months: monthlyCounts(hazards, incidents, now),
    actions: actionSplit(actions, now),
    health: chemicalHealth(chemicals, sds, now),
  };
}
