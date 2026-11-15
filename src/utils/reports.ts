/**
 * The numbers behind the reports: incidents, injuries, lost time, injury rates, hazards, actions,
 * checks. Everything comes from records already in the app; hours worked come from payroll.
 *
 * Lost time injury (LTI): an injury with at least one full day or shift off work, taken from the
 * workers compensation claim (first day off and return date). TRIFR also counts injuries that
 * needed a doctor or hospital. Rates are per 1,000,000 hours worked.
 */

import { brisbaneDay, daysUntil } from './dates.ts';
import { inScope, type ScopeSite } from './siteScope.ts';
import type { Claim } from './claims.ts';
import type { Hazard, Incident, WhsAction } from './records.ts';
import type { Check } from './checks.ts';

export interface HourRow { site_id: string; month: string; hours: number; source: string }
export interface InjuredRow { incident_id: string; person_id: string | null; treatment: string }

export interface ReportData {
  incidents: Incident[];
  injured: InjuredRow[];
  /** null when the person cannot see claims (only the WHS officer and admins can) */
  claims: Claim[] | null;
  hazards: Hazard[];
  actions: WhsAction[];
  checks: Check[];
  hours: HourRow[];
}

export const RATE_BASE = 1_000_000;

/** "2026-10" */
export function ymOf(day: string): string { return day.slice(0, 7); }

export function ymNow(now: Date = new Date()): string { return ymOf(brisbaneDay(now)); }

/** The n months ending at (and including) ym, oldest first. */
export function monthsEnding(ym: string, n: number): string[] {
  const [y, m] = ym.split('-').map(Number);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const t = y * 12 + (m - 1) - i;
    out.push(`${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`);
  }
  return out;
}

export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-AU', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
export function monthShort(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-AU', { month: 'short', timeZone: 'UTC' });
}

/** Whole days off work. Same-day return is 0. Still off work counts to today. */
export function daysLost(c: Pick<Claim, 'off_work_from' | 'returned_on'>, now: Date = new Date()): number {
  if (!c.off_work_from) return 0;
  const end = c.returned_on ?? brisbaneDay(now);
  return Math.max(0, Math.round((Date.parse(`${end.slice(0, 10)}T00:00:00Z`) - Date.parse(`${c.off_work_from.slice(0, 10)}T00:00:00Z`)) / 86_400_000));
}

export function isLostTime(c: Pick<Claim, 'off_work_from' | 'returned_on'>, now: Date = new Date()): boolean {
  return daysLost(c, now) >= 1;
}

export function rate(count: number, hours: number): number | null {
  return hours > 0 ? Math.round((count * RATE_BASE / hours) * 10) / 10 : null;
}

const incidentDay = (i: Incident) => brisbaneDay(i.occurred_at);

/** The claim's injury month: its injury date, or the incident's day. */
function claimDay(c: Claim, byId: Map<string, Incident>): string | null {
  return c.injury_date ?? (byId.get(c.incident_id) ? incidentDay(byId.get(c.incident_id)!) : null);
}

export function hoursIn(rows: HourRow[], site: ScopeSite | null, months: string[]): number {
  const set = new Set(months);
  return rows.filter(r => set.has(ymOf(r.month)) && (!site || r.site_id === site.id)).reduce((n, r) => n + Number(r.hours), 0);
}

export interface InjuryCounts { injuries: number; firstAid: number; medical: number; lostTime: number; recordable: number; lostDays: number }

/** Injury counts for the given months and site. Lost time needs claims; without them it is null. */
export function injuryCounts(d: ReportData, months: string[], site: ScopeSite | null, now: Date = new Date()): InjuryCounts & { lostTimeKnown: boolean } {
  const set = new Set(months);
  const byId = new Map(d.incidents.map(i => [i.id, i]));
  const inc = d.incidents.filter(i => i.type === 'injury' && set.has(ymOf(incidentDay(i))) && inScope(site, i));
  let firstAid = 0; let medical = 0; let injuries = 0;
  const recordable = new Set<string>();
  for (const i of inc) {
    const rows = d.injured.filter(r => r.incident_id === i.id);
    if (!rows.length) { injuries += 1; continue; }
    rows.forEach((r, n) => {
      injuries += 1;
      const key = `${i.id}|${r.person_id ?? n}`;
      if (r.treatment === 'doctor' || r.treatment === 'hospital') { medical += 1; recordable.add(key); } else firstAid += 1;
    });
  }
  let lostTime = 0; let lostDays = 0;
  if (d.claims) {
    for (const c of d.claims) {
      const day = claimDay(c, byId);
      const inc2 = byId.get(c.incident_id);
      if (!day || !set.has(ymOf(day)) || !inScope(site, inc2 ?? {}) || !isLostTime(c, now)) continue;
      lostTime += 1; lostDays += daysLost(c, now);
      recordable.add(`${c.incident_id}|${c.person_id}`);
    }
  }
  return { injuries, firstAid, medical, lostTime, recordable: recordable.size, lostDays, lostTimeKnown: d.claims !== null };
}

export interface MonthSummary {
  ym: string;
  incidents: number;
  byType: Record<string, number>;
  notifiable: number;
  investigationsClosed: number;
  investigationsOnTime: number;
  injury: InjuryCounts & { lostTimeKnown: boolean };
  hours: number;
  hours12: number;
  ltifr12: number | null;
  trifr12: number | null;
  hazardsReported: number;
  hazardsClosed: number;
  actionsOpened: number;
  actionsClosed: number;
  actionsOverdue: number;
  actionsOpenNow: number;
  avgDaysToClose: number | null;
  prestarts: number;
  take5s: number;
  siteInspections: number;
}

const inMonth = (iso: string | null | undefined, ym: string) => !!iso && ymOf(brisbaneDay(iso)) === ym;

export function monthSummary(d: ReportData, ym: string, site: ScopeSite | null, now: Date = new Date()): MonthSummary {
  const inc = d.incidents.filter(i => ymOf(incidentDay(i)) === ym && inScope(site, i));
  const byType: Record<string, number> = {};
  for (const i of inc) byType[i.type] = (byType[i.type] ?? 0) + 1;
  const closed = inc.filter(i => i.status === 'closed' && i.closed_at);
  const onTime = closed.filter(i => !i.investigation_due || brisbaneDay(i.closed_at!) <= i.investigation_due.slice(0, 10)).length;

  const months12 = monthsEnding(ym, 12);
  const i12 = injuryCounts(d, months12, site, now);
  const hours12 = hoursIn(d.hours, site, months12);

  const sourceSite = new Map<string, { site_id?: string | null; site_name?: string | null }>();
  for (const i of d.incidents) sourceSite.set(i.id, i);
  for (const h of d.hazards) sourceSite.set(h.id, h);
  for (const c of d.checks) sourceSite.set(c.id, c);
  const actionInScope = (a: WhsAction) => !site || (a.source_id !== null && inScope(site, sourceSite.get(a.source_id) ?? {}));
  const acts = d.actions.filter(actionInScope);
  const closedActs = acts.filter(a => a.status === 'done' && inMonth(a.done_at, ym));
  const spans = closedActs.map(a => (Date.parse(`${brisbaneDay(a.done_at!)}T00:00:00Z`) - Date.parse(`${brisbaneDay(a.created_at)}T00:00:00Z`)) / 86_400_000);
  const openActs = acts.filter(a => a.status !== 'done');

  const checks = d.checks.filter(c => inMonth(c.done_at, ym) && inScope(site, c));
  return {
    ym,
    incidents: inc.length,
    byType,
    notifiable: inc.filter(i => i.notifiable).length,
    investigationsClosed: closed.length,
    investigationsOnTime: onTime,
    injury: injuryCounts(d, [ym], site, now),
    hours: hoursIn(d.hours, site, [ym]),
    hours12,
    ltifr12: i12.lostTimeKnown ? rate(i12.lostTime, hours12) : null,
    trifr12: i12.lostTimeKnown ? rate(i12.recordable, hours12) : null,
    hazardsReported: d.hazards.filter(h => inMonth(h.created_at, ym) && inScope(site, h)).length,
    hazardsClosed: d.hazards.filter(h => h.status === 'closed' && inMonth(h.closed_at, ym) && inScope(site, h)).length,
    actionsOpened: acts.filter(a => inMonth(a.created_at, ym)).length,
    actionsClosed: closedActs.length,
    actionsOverdue: openActs.filter(a => a.due && daysUntil(a.due, now) < 0).length,
    actionsOpenNow: openActs.length,
    avgDaysToClose: spans.length ? Math.round(spans.reduce((n, x) => n + x, 0) / spans.length) : null,
    prestarts: checks.filter(c => c.kind === 'prestart').length,
    take5s: checks.filter(c => c.kind === 'take5').length,
    siteInspections: checks.filter(c => c.kind === 'site').length,
  };
}

export interface SeriesPoint { ym: string; incidents: number; injuries: number; lostTime: number; hours: number; ltifr12: number | null; trifr12: number | null; hasHours: boolean }

/** One point for each of the last n months, with the rolling 12 month rates. */
export function monthlySeries(d: ReportData, endYm: string, n: number, site: ScopeSite | null, now: Date = new Date()): SeriesPoint[] {
  return monthsEnding(endYm, n).map(ym => {
    const m12 = monthsEnding(ym, 12);
    const i1 = injuryCounts(d, [ym], site, now);
    const i12 = injuryCounts(d, m12, site, now);
    const h12 = hoursIn(d.hours, site, m12);
    return {
      ym,
      incidents: d.incidents.filter(i => ymOf(incidentDay(i)) === ym && inScope(site, i)).length,
      injuries: i1.injuries,
      lostTime: i1.lostTime,
      hours: hoursIn(d.hours, site, [ym]),
      ltifr12: i12.lostTimeKnown ? rate(i12.lostTime, h12) : null,
      trifr12: i12.lostTimeKnown ? rate(i12.recordable, h12) : null,
      hasHours: h12 > 0,
    };
  });
}

/** Sites with no hours entered for a month, among the sites given. */
export function missingHours(rows: HourRow[], siteIds: string[], ym: string): string[] {
  return siteIds.filter(id => !rows.some(r => r.site_id === id && ymOf(r.month) === ym && Number(r.hours) > 0));
}
