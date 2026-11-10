/**
 * Loads the home screen from the WHS tables. If the step 2 tables are not there yet
 * (SQL not run), it falls back to the empty home screen instead of failing.
 */

import { emptyHomeData, type HomeData } from '../utils/homeData.ts';
import { buildHome } from '../utils/records.ts';
import { listActions, listHazards, listIncidents } from './records.ts';

export async function loadHomeData(me: string): Promise<HomeData> {
  const [incidents, hazards, actions] = await Promise.all([listIncidents(), listHazards(), listActions()]);
  if (incidents.error || hazards.error || actions.error) return emptyHomeData();
  return buildHome(incidents.data ?? [], hazards.data ?? [], actions.data ?? [], me);
}
