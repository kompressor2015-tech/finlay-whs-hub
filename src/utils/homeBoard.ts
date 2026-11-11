/**
 * The rest of the desktop home screen: the six tiles, how each site is going, what is coming up in
 * the next 30 days, and how many site inspections are up to date. Pure functions, tested.
 */

import { addDays, brisbaneDay, daysUntil } from './dates.ts';
import { siteInspectionsDue, type Check, type Checklist } from './checks.ts';
import { currentSds, sdsState, sdsValidUntil, stocktakeDue, type Chemical, type Sds, type Site, type Stock } from './chemicals.ts';
import type { Tone } from './attention.ts';

export interface SiteRow {
  id: string;
  name: string;
  sub: string;
  pill: string;
  tone: Tone;
  href: string;
}

export interface ComingItem {
  /** YYYY-MM-DD */
  day: string;
  what: string;
  site: string;
  href: string;
}

export interface HomeBoard {
  inspectionsDue: number;
  sdsToReview: number;
  stocktakesDue: number;
  /** Which site's stocktake is due, for the tile note */
  stocktakeSites: string[];
  /** Site inspections not overdue, out of those that have a schedule */
  inspections: { ok: number; total: number };
  sites: SiteRow[];
  coming: ComingItem[];
}

export function buildBoard(
  sites: Site[], chemicals: Chemical[], stock: Stock[], sds: Sds[], checklists: Checklist[], checks: Pick<Check, 'kind' | 'checklist_id' | 'done_at'>[],
  now: Date = new Date(), windowDays = 30,
): HomeBoard {
  const coming: ComingItem[] = [];
  const within = (day: string) => daysUntil(day, now) >= 0 && daysUntil(day, now) <= windowDays;

  const due = siteInspectionsDue(checklists, checks, now);
  const scheduled = due.filter(d => d.checklist.frequency_days);
  const inspectionsDue = scheduled.filter(d => d.state !== 'ok').length;
  for (const d of scheduled) {
    if (d.due && within(d.due)) coming.push({ day: d.due, what: 'Site inspection due', site: d.checklist.site_name || '', href: `#/checks/new-site-${d.checklist.id}` });
  }

  const stocktakeSites: string[] = [];
  const siteRows: SiteRow[] = sites.map(site => {
    const here = stock.filter(s => s.site_id === site.id);
    const take = stocktakeDue(site, here, now);
    if (take.state === 'overdue' || take.state === 'due_soon' || take.state === 'never') stocktakeSites.push(site.name.replace(/ (Yard|Workshop|Site)$/, ''));
    if (take.due && within(take.due)) coming.push({ day: take.due, what: 'Chemical stocktake due', site: site.name, href: `#/chem/stocktake-${site.id}` });
    const pill =
      take.state === 'ok' ? { pill: 'Up to date', tone: 'green' as Tone }
        : take.state === 'due_soon' ? { pill: 'Due soon', tone: 'amber' as Tone }
          : take.state === 'overdue' ? { pill: 'Overdue', tone: 'red' as Tone }
            : { pill: 'Not counted', tone: 'amber' as Tone };
    const sub =
      take.total === 0 ? 'No chemicals stored'
        : take.state === 'never' ? `${take.counted} of ${take.total} items counted`
          : `Stocktake due ${take.due ? take.due.split('-').reverse().join('/') : ''}`.trim();
    return { id: site.id, name: site.name, sub, ...pill, href: `#/chem/totals-${site.id}` };
  });

  const active = chemicals.filter(c => c.active);
  const byChem = new Map<string, Sds[]>();
  for (const s of sds) byChem.set(s.chemical_id, [...(byChem.get(s.chemical_id) ?? []), s]);
  let sdsToReview = 0;
  let reachingSoon = 0;
  for (const c of active) {
    const cur = currentSds(byChem.get(c.id) ?? []);
    const st = sdsState(cur, now);
    if (st === 'missing' || st === 'expired' || st === 'due_soon') sdsToReview += 1;
    if (cur && st !== 'expired' && within(sdsValidUntil(cur.issue_date))) reachingSoon += 1;
  }
  if (reachingSoon) coming.push({ day: addDays(brisbaneDay(now), windowDays), what: `${reachingSoon} SDS reach 5 years`, site: 'All sites', href: '#/m/chemicals' });

  return {
    inspectionsDue,
    sdsToReview,
    stocktakesDue: stocktakeSites.length,
    stocktakeSites,
    inspections: { ok: scheduled.length - scheduled.filter(d => d.state === 'overdue').length, total: scheduled.length },
    sites: siteRows,
    coming: coming.sort((a, b) => a.day.localeCompare(b.day)).slice(0, 5),
  };
}
