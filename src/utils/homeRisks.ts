/** Risk register items for the home screen: risks that need controls, are still high after controls, or are due for review. */

import type { HomeData } from './homeData.ts';
import { riskIssues, type Risk, type RiskControl } from './risks.ts';

export function withRisks(home: HomeData, risks: Risk[], controls: RiskControl[], now: Date = new Date()): HomeData {
  const by = new Map<string, RiskControl[]>();
  for (const c of controls) by.set(c.risk_id, [...(by.get(c.risk_id) ?? []), c]);
  const active = risks.filter(r => r.status === 'active');
  const keys = (r: Risk) => riskIssues(r, by.get(r.id) ?? [], now).map(i => i.key);
  const noControls = active.filter(r => keys(r).includes('no_controls')).length;
  const high = active.filter(r => keys(r).includes('high_after')).length;
  const overdue = active.filter(r => keys(r).includes('overdue')).length;
  const soon = active.filter(r => keys(r).some(k => k === 'due_soon' || k === 'no_review')).length;
  const attention = [...home.attention];
  const href = '#/m/risk';
  const s = (n: number, one: string, many: string) => (n === 1 ? one : many);
  if (noControls) attention.push({ id: 'risk-nocontrols', urgency: 'overdue', title: `${noControls} ${s(noControls, 'risk has', 'risks have')} no controls recorded`, detail: 'Risk register', moduleId: 'risk', href });
  if (high) attention.push({ id: 'risk-high', urgency: 'overdue', title: `${high} ${s(high, 'risk is', 'risks are')} still high or extreme after controls`, detail: 'Risk register', moduleId: 'risk', href });
  if (overdue) attention.push({ id: 'risk-overdue', urgency: 'overdue', title: `${overdue} ${s(overdue, 'risk review is', 'risk reviews are')} overdue`, detail: 'Risk register', moduleId: 'risk', href });
  if (soon) attention.push({ id: 'risk-soon', urgency: 'review', title: `${soon} ${s(soon, 'risk needs', 'risks need')} a review date or is due for review`, detail: 'Risk register', moduleId: 'risk', href });
  const count = new Set(active.filter(r => keys(r).some(k => ['no_controls', 'high_after', 'overdue'].includes(k))).map(r => r.id)).size;
  return { ...home, attention, navCounts: { ...home.navCounts, ...(count ? { risk: count } : {}) } };
}

