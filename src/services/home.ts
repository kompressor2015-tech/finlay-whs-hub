/**
 * Loads the lists the home screen is built from. If the later tables are not there yet
 * (SQL not run), those parts are left out instead of failing.
 */

import { emptyHomeData } from '../utils/homeData.ts';
import type { HomeRaw } from '../utils/homeBuild.ts';
import { listActions, listHazards, listIncidents } from './records.ts';
import { listChecklists, listChecks, listFlags } from './checks.ts';
import { listStocktakes, loadRegister } from './chemicals.ts';

export async function loadHomeRaw(): Promise<HomeRaw | null> {
  const [incidents, hazards, actions, flags, checklists, checks, register, stocktakes] = await Promise.all([
    listIncidents(), listHazards(), listActions(), listFlags(), listChecklists(), listChecks(60), loadRegister(), listStocktakes(),
  ]);
  if (incidents.error || hazards.error || actions.error) return null;
  return {
    incidents: incidents.data ?? [],
    hazards: hazards.data ?? [],
    actions: actions.data ?? [],
    checks: flags.error || checklists.error || checks.error ? null : { flags: flags.data ?? [], checklists: checklists.data ?? [], checks: checks.data ?? [] },
    register: !register.error && register.data ? register.data : null,
    stocktakes: stocktakes.data ?? [],
  };
}

export { emptyHomeData };
