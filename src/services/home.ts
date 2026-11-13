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
import { listAppointmentsFor, listCertificatesFor, listClaims } from './claims.ts';
import { isOpen } from '../utils/claims.ts';
import { listPeople } from './incidentFile.ts';
import { listTickets } from './tickets.ts';
import { loadChecks } from './recurringChecks.ts';

export async function loadHomeRaw(): Promise<HomeRaw | null> {
  const [incidents, hazards, actions, flags, checklists, checks, register, stocktakes, documents, recurring, people, tickets] = await Promise.all([
    listIncidents(), listHazards(), listActions(), listFlags(), listChecklists(), listChecks(60), loadRegister(), listStocktakes(), listDocuments(), loadChecks(), listPeople(), listTickets(),
  ]);
  if (incidents.error || hazards.error || actions.error) return null;
  // Claims are for the WHS officer and admins; anyone else gets nothing back, so the alerts stay off
  const claimList = await listClaims();
  const open = (claimList.data ?? []).filter(isOpen);
  const [claimCerts, claimAppts] = open.length ? await Promise.all([listCertificatesFor(open.map(c => c.id)), listAppointmentsFor(open.map(c => c.id))]) : [{ data: [] }, { data: [] }];
  return {
    incidents: incidents.data ?? [],
    hazards: hazards.data ?? [],
    actions: actions.data ?? [],
    checks: flags.error || checklists.error || checks.error ? null : { flags: flags.data ?? [], checklists: checklists.data ?? [], checks: checks.data ?? [] },
    register: !register.error && register.data ? register.data : null,
    stocktakes: stocktakes.data ?? [],
    documents: documents.error ? null : documents.data ?? [],
    claims: claimList.error || claimCerts.error || claimAppts.error ? null : { claims: open, certs: claimCerts.data ?? [], appts: claimAppts.data ?? [], names: (people.data ?? []).map(p => [p.id, p.name] as [string, string]) },
    training: people.error || tickets.error || !recurring.data ? null : { people: people.data ?? [], tickets: tickets.data ?? [], siteIds: recurring.data.sites.map(x => x.id) },
    recurring: recurring.error || !recurring.data ? null : { checks: recurring.data.checks, log: recurring.data.log, sites: recurring.data.sites },
  };
}

export { emptyHomeData };
