/**
 * Loads the lists the home screen is built from. If the later tables are not there yet
 * (SQL not run), those parts are left out instead of failing.
 */

import { emptyHomeData } from '../utils/homeData.ts';
import type { HomeRaw } from '../utils/homeBuild.ts';
import { listActions, listHazards, listIncidents } from './records.ts';
import { listChecklists, listChecks, listFlags } from './checks.ts';
import { listStocktakes, loadRegister } from './chemicals.ts';
import { listDocuments } from './documents.ts';
import { listPeople } from './incidentFile.ts';
import { listTickets } from './tickets.ts';
import { loadChecks } from './recurringChecks.ts';

export async function loadHomeRaw(): Promise<HomeRaw | null> {
  const [incidents, hazards, actions, flags, checklists, checks, register, stocktakes, documents, recurring, people, tickets] = await Promise.all([
    listIncidents(), listHazards(), listActions(), listFlags(), listChecklists(), listChecks(60), loadRegister(), listStocktakes(), listDocuments(), loadChecks(), listPeople(), listTickets(),
  ]);
  if (incidents.error || hazards.error || actions.error) return null;
  return {
    incidents: incidents.data ?? [],
    hazards: hazards.data ?? [],
    actions: actions.data ?? [],
    checks: flags.error || checklists.error || checks.error ? null : { flags: flags.data ?? [], checklists: checklists.data ?? [], checks: checks.data ?? [] },
    register: !register.error && register.data ? register.data : null,
    stocktakes: stocktakes.data ?? [],
    documents: documents.error ? null : documents.data ?? [],
    training: people.error || tickets.error || !recurring.data ? null : { people: people.data ?? [], tickets: tickets.data ?? [], siteIds: recurring.data.sites.map(x => x.id) },
    recurring: recurring.error || !recurring.data ? null : { checks: recurring.data.checks, log: recurring.data.log, sites: recurring.data.sites },
  };
}

export { emptyHomeData };
