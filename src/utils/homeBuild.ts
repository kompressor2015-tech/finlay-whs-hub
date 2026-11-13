/**
 * Builds the home screen from the raw lists, for the chosen site (or all sites).
 * Plant faults are not tied to a site, so they always show for every site.
 */

import type { HomeData } from './homeData.ts';
import { buildHome, type Hazard, type Incident, type WhsAction } from './records.ts';
import { withChecks } from './homeChecks.ts';
import { withChemicals } from './homeChemicals.ts';
import { buildCharts } from './homeCharts.ts';
import { buildBoard } from './homeBoard.ts';
import { documentsComing, withDocuments } from './homeDocuments.ts';
import type { WhsDocument } from './documents.ts';
import { withTickets } from './homeTickets.ts';
import type { Person } from './incidentFile.ts';
import type { Ticket } from './tickets.ts';
import { recurringComing, withRecurring } from './homeRecurring.ts';
import type { CheckLogLine, RecurringCheck } from './recurringChecks.ts';
import { actionsInScope, inScope, type ScopeSite } from './siteScope.ts';
import type { Check, Checklist, PlantFlag } from './checks.ts';
import type { Chemical, Sds, Site, Stock } from './chemicals.ts';
import type { Stocktake } from './stocktakes.ts';

export interface HomeRaw {
  incidents: Incident[];
  hazards: Hazard[];
  actions: WhsAction[];
  /** null when the step 3 tables are not there yet */
  checks: { flags: PlantFlag[]; checklists: Checklist[]; checks: Check[] } | null;
  /** null when the chemical tables are not there yet */
  register: { sites: Site[]; chemicals: Chemical[]; stock: Stock[]; sds: Sds[] } | null;
  stocktakes: Pick<Stocktake, 'id' | 'site_id' | 'done_at' | 'authorised_at'>[];
  /** null when the documents table is not there yet */
  documents?: WhsDocument[] | null;
  /** null when the recurring checks tables are not there yet */
  /** null when the people tickets tables are not there yet or the person cannot read them */
  training?: { people: Person[]; tickets: Ticket[]; siteIds: string[] } | null;
  recurring?: { checks: RecurringCheck[]; log: CheckLogLine[]; sites: { id: string; name: string }[] } | null;
}

export function buildHomeData(raw: HomeRaw, me: string, site: ScopeSite | null, now: Date = new Date()): HomeData {
  const incidents = raw.incidents.filter(i => inScope(site, i));
  const hazards = raw.hazards.filter(h => inScope(site, h));

  const checklists = (raw.checks?.checklists ?? []).filter(c => inScope(site, c));
  const allChecks = raw.checks?.checks ?? [];
  // Pre-starts are by machine, not site, so they stay in; Take 5s and inspections follow the site
  const checks = allChecks.filter(c => c.kind === 'prestart' || inScope(site, c));

  // An action belongs to a site through what it came from. Actions raised by hand have no site.
  const actions = actionsInScope(site, raw.actions, [...raw.incidents, ...raw.hazards, ...allChecks]);

  const home = buildHome(incidents, hazards, actions, me, now);
  const withStep3 = raw.checks ? withChecks(home, raw.checks.flags, checklists, checks, now) : home;

  const reg = raw.register;
  const sites = reg ? reg.sites.filter(s => !site || s.id === site.id) : [];
  const stock = reg ? reg.stock.filter(s => !site || s.site_id === site.id) : [];
  const stocked = new Set(stock.map(s => s.chemical_id));
  const chemicals = reg ? reg.chemicals.filter(c => !site || stocked.has(c.id)) : [];
  const sds = reg?.sds ?? [];

  const charts = buildCharts(incidents, hazards, actions, chemicals, sds, now);
  const board = buildBoard(sites, chemicals, stock, sds, checklists, checks, now);
  const stocktakes = raw.stocktakes.filter(t => !site || t.site_id === site.id);
  const withStep4 = reg ? withChemicals(withStep3, sites, chemicals, stock, sds, now, stocktakes) : withStep3;
  // A document applies to every site unless it was set to one site
  const docs = (raw.documents ?? []).filter(d => !site || !d.site_id || d.site_id === site.id);
  const withStep5 = raw.documents ? withDocuments(withStep4, docs, now) : withStep4;
  const rec = raw.recurring;
  const recChecks = rec ? rec.checks.filter(c => !site || c.site_id === site.id || c.site_id === site.depotSiteId) : [];
  const withStep7 = rec ? withRecurring(withStep5, recChecks, rec.log, now) : withStep5;
  const tr = raw.training;
  const trPeople = tr ? tr.people.filter(p => !site || !p.site_id || p.site_id === site.id || p.site_id === site.depotSiteId) : [];
  const trSites = tr ? tr.siteIds.filter(id => !site || id === site.id || id === site.depotSiteId) : [];
  const withStep8 = tr ? withTickets(withStep7, trPeople, tr.tickets, trSites, now) : withStep7;
  const coming = [...board.coming, ...documentsComing(docs, now), ...(rec ? recurringComing(recChecks, rec.log, rec.sites, now) : [])].sort((a, b) => a.day.localeCompare(b.day)).slice(0, 5);
  return { ...withStep8, charts, board: { ...board, coming } };
}
