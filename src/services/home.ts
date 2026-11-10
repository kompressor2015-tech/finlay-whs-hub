/**
 * Loads the home screen from the WHS tables. If the step 2 tables are not there yet
 * (SQL not run), it falls back to the empty home screen instead of failing.
 */

import { emptyHomeData, type HomeData } from '../utils/homeData.ts';
import { buildHome } from '../utils/records.ts';
import { listActions, listHazards, listIncidents } from './records.ts';
import { listChecklists, listChecks, listFlags } from './checks.ts';
import { withChecks } from '../utils/homeChecks.ts';
import { loadRegister } from './chemicals.ts';
import { withChemicals } from '../utils/homeChemicals.ts';

export async function loadHomeData(me: string): Promise<HomeData> {
  const [incidents, hazards, actions, flags, checklists, checks, register] = await Promise.all([
    listIncidents(), listHazards(), listActions(), listFlags(), listChecklists(), listChecks(60), loadRegister(),
  ]);
  if (incidents.error || hazards.error || actions.error) return emptyHomeData();
  const home = buildHome(incidents.data ?? [], hazards.data ?? [], actions.data ?? [], me);
  // Step 3 tables may not be there yet; the home screen still works without them.
  // Later steps' tables may not be there yet; the home screen still works without them.
  const withStep3 = flags.error || checklists.error || checks.error ? home : withChecks(home, flags.data ?? [], checklists.data ?? [], checks.data ?? []);
  if (register.error || !register.data) return withStep3;
  const r = register.data;
  return withChemicals(withStep3, r.sites, r.chemicals, r.stock, r.sds);
}
