/** SWMS items for the home screen: waiting for approval, no approved version, review overdue or due. */

import type { HomeData } from './homeData.ts';
import { swmsIssues, type Swms, type SwmsVersion } from './swms.ts';

export function withSwms(home: HomeData, swms: Swms[], versions: Pick<SwmsVersion, 'swms_id' | 'status'>[], now: Date = new Date()): HomeData {
  const by = new Map<string, Pick<SwmsVersion, 'status'>[]>();
  for (const v of versions) by.set(v.swms_id, [...(by.get(v.swms_id) ?? []), v]);
  const active = swms.filter(s => s.status === 'active');
  const keys = (s: Swms) => swmsIssues(s, by.get(s.id) ?? [], now).map(i => i.key);
  const awaiting = active.filter(s => keys(s).includes('awaiting')).length;
  const none = active.filter(s => keys(s).includes('not_approved') && !keys(s).includes('awaiting')).length;
  const overdue = active.filter(s => keys(s).includes('overdue')).length;
  const soon = active.filter(s => keys(s).includes('due_soon')).length;
  const href = '#/m/risk/swms';
  const n = (c: number, one: string, many: string) => (c === 1 ? one : many);
  const attention = [...home.attention];
  if (awaiting) attention.push({ id: 'swms-awaiting', urgency: 'overdue', title: `${awaiting} ${n(awaiting, 'SWMS is', 'SWMS are')} waiting for approval`, detail: 'SWMS', moduleId: 'risk', href });
  if (none) attention.push({ id: 'swms-none', urgency: 'overdue', title: `${none} ${n(none, 'SWMS has', 'SWMS have')} no approved version`, detail: 'SWMS', moduleId: 'risk', href });
  if (overdue) attention.push({ id: 'swms-overdue', urgency: 'overdue', title: `${overdue} ${n(overdue, 'SWMS review is', 'SWMS reviews are')} overdue`, detail: 'SWMS', moduleId: 'risk', href });
  if (soon) attention.push({ id: 'swms-soon', urgency: 'review', title: `${soon} ${n(soon, 'SWMS is', 'SWMS are')} due for review`, detail: 'SWMS', moduleId: 'risk', href });
  const count = active.filter(s => keys(s).some(k => ['awaiting', 'not_approved', 'overdue'].includes(k))).length;
  const prev = home.navCounts.risk ?? 0;
  return { ...home, attention, navCounts: { ...home.navCounts, ...(prev + count ? { risk: prev + count } : {}) } };
}
