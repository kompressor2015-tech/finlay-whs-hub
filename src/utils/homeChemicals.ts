/** Adds the chemical register's warnings to the home screen. */

import type { HomeData } from './homeData.ts';
import { currentSds, sdsState, siteTotals, stocktakeDue, type Chemical, type Sds, type Site, type Stock } from './chemicals.ts';

export function withChemicals(home: HomeData, sites: Site[], chemicals: Chemical[], stock: Stock[], sds: Sds[], now: Date = new Date()): HomeData {
  const attention = [...home.attention];
  const byChem = new Map(chemicals.map(c => [c.id, c]));
  const active = chemicals.filter(c => c.active);
  const sdsOf = (id: string) => currentSds(sds.filter(s => s.chemical_id === id));
  const missing = active.filter(c => sdsState(sdsOf(c.id), now) === 'missing').length;
  const expired = active.filter(c => sdsState(sdsOf(c.id), now) === 'expired').length;

  for (const site of sites) {
    const here = stock.filter(s => s.site_id === site.id);
    for (const line of siteTotals(site.state, here, byChem)) {
      if (line.status === 'ok') continue;
      attention.push({
        id: `m-${site.id}-${line.key}`,
        urgency: line.status === 'over' ? 'overdue' : 'due_soon',
        title: `${site.name}: ${line.label.split(',')[0]} ${line.status === 'over' ? 'over' : 'at ' + Math.round(line.pctManifest * 100) + '% of'} the manifest quantity`,
        detail: `${line.total.toLocaleString('en-AU')} of ${line.manifest.toLocaleString('en-AU')} ${line.unit}`,
        moduleId: 'chemicals',
        href: `#/chem/totals-${site.id}`,
      });
    }
    const take = stocktakeDue(site, here, now);
    if (take.state === 'overdue' || take.state === 'due_soon') {
      attention.push({ id: `k-${site.id}`, urgency: take.state === 'overdue' ? 'overdue' : 'due_soon', title: `Chemical stocktake: ${site.name}`, detail: 'Every 3 months', due: take.due ?? undefined, moduleId: 'chemicals', href: `#/chem/stocktake-${site.id}` });
    } else if (take.state === 'never' && take.total) {
      attention.push({ id: `k-${site.id}`, urgency: 'review', title: `First chemical stocktake: ${site.name}`, detail: `${take.counted} of ${take.total} items counted`, moduleId: 'chemicals', href: `#/chem/stocktake-${site.id}` });
    }
  }
  if (expired) attention.push({ id: 'sds-old', urgency: 'review', title: `${expired} SDS over 5 years old`, detail: 'Get the current SDS from the supplier', moduleId: 'chemicals', href: '#/m/chemicals' });
  if (missing) attention.push({ id: 'sds-missing', urgency: 'review', title: `${missing} chemical(s) with no SDS in the app`, detail: 'Upload them from the SDS folders', moduleId: 'chemicals', href: '#/chem/upload-sds' });

  return {
    ...home,
    attention,
    navCounts: { ...home.navCounts, ...(missing + expired ? { chemicals: missing + expired } : {}) },
  };
}
