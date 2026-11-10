/**
 * Loads the home screen. The WHS modules are not built yet, so this returns the empty
 * home screen; each module adds its own query here as it arrives (step 2 onwards).
 */

import { emptyHomeData, type HomeData } from '../utils/homeData.ts';

export async function loadHomeData(): Promise<HomeData> {
  return emptyHomeData();
}
