/**
 * Loads the home screen from the WHS tables. If the step 2 tables are not there yet
 * (SQL not run), it falls back to the empty home screen instead of failing.
 */

import { emptyHomeData, type HomeData } from '../utils/homeData.ts';
import { buildHome } from '../utils/records.ts';
import { listActions, listHazards, listIncidents } from './records.ts';
import { listChecklists, listChecks, listFlags } from './checks.ts';
import { withChecks } from '../utils/homeChecks.ts';
import { listStocktakes, loadRegister } from './chemicals.ts';
import { withChemicals } from '../utils/homeChemicals.ts';
import { buildCharts } from '../utils/homeCharts.ts';

export async function loadHomeData(me: string): Promise<HomeData> {
  const [incidents, hazards, actions, flags, checklists, checks, register, stocktakes] = await Promise.all([
    listIncidents(), listHazards(), listActions(), listFlags(), listChecklists(), listChecks(60), loadRegister(), listStocktakes(),
  ]);
  if (incidents.error || hazards.error || actions.error) return emptyHomeData();
  const home = buildHome(incidents.data ?? [], hazards.data ?? [], actions.data ?? [], me);
  // Step 3 tables may not be there yet; the home screen still works without them.
  // Later steps' tables may not be there yet; the home screen still works without them.
  const withStep3 = flags.error || checklists.error || checks.error ? home : withChecks(home, flags.data ?? [], checklists.data ?? [], checks.data ?? []);
  const now = new Date();
  const chemicals = !register.error && register.data ? register.data : null;
  const charts = buildCharts(incidents.data ?? [], hazards.data ?? [], actions.data ?? [], chemicals?.chemicals ?? [], chemicals?.sds ?? [], now);
  if (!chemicals) return { ...withStep3, charts };
  const r = chemicals;
  return { ...withChemicals(withStep3, r.sites, r.chemicals, r.stock, r.sds, now, stocktakes.data ?? []), charts };
}
