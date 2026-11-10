/** Adds step 3's pre-starts, flags, Take 5s and site inspections to the home screen. */

import type { HomeData } from './homeData.ts';
import { brisbaneDay, daysUntil, formatTime } from './dates.ts';
import { openFlags, siteInspectionsDue, type Check, type Checklist, type PlantFlag } from './checks.ts';

export function withChecks(home: HomeData, flags: PlantFlag[], checklists: Checklist[], checks: Check[], now: Date = new Date()): HomeData {
  const open = openFlags(flags);
  const units = new Set(open.map(f => f.unit_no));
  const attention = [...home.attention];

  for (const f of open) {
    attention.push({
      id: `f-${f.id}`,
      urgency: f.level === 'stop' ? 'overdue' : 'due_soon',
      title: f.level === 'stop' ? 'Do not use: failed pre-start' : 'Fault reported on pre-start',
      unit: f.unit_no,
      detail: f.reason.slice(0, 120),
      moduleId: 'plant',
      href: '#/m/plant',
    });
  }
  for (const d of siteInspectionsDue(checklists, checks, now)) {
    if (d.state === 'overdue' || d.state === 'due_soon' || d.state === 'never') {
      attention.push({
        id: `s-${d.checklist.id}`,
        urgency: d.state === 'due_soon' ? 'due_soon' : d.state === 'never' ? 'review' : 'overdue',
        title: `${d.checklist.name}${d.state === 'never' ? ': not done in the app yet' : ''}`,
        detail: d.checklist.site_name || 'Site inspection',
        due: d.due ?? undefined,
        moduleId: 'inspections',
        href: `#/checks/new-site-${d.checklist.id}`,
      });
    }
  }
  for (const c of checks) {
    if (c.kind === 'take5' && c.result === 'stop' && daysUntil(brisbaneDay(c.done_at), now) > -7) {
      attention.push({ id: `t-${c.id}`, urgency: 'review', title: `Take 5 said not safe: ${c.task}`, unit: c.unit_no || undefined, detail: `${c.done_by_name}${c.site_name ? ` · ${c.site_name}` : ''}`, moduleId: 'inspections', href: `#/checks/${c.id}` });
    }
  }

  const latest = [
    ...home.latest,
    ...checks
      .filter(c => c.kind === 'prestart' ? c.result !== 'ok' : true)
      .map(c => ({
        id: c.id,
        type: c.kind === 'prestart' ? 'Pre-start' : c.kind === 'take5' ? 'Take 5' : 'Inspection',
        title: c.kind === 'prestart' ? `Unit ${c.unit_no} ${c.result === 'stop' ? 'failed (critical)' : 'fault reported'}` : c.kind === 'take5' ? c.task : `${c.checklist_name}: ${c.issue_count} issue(s)`,
        by: `${c.done_by_name} · ${formatTime(c.done_at)}`,
        at: c.done_at,
      })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 5);

  return {
    ...home,
    summary: home.summary.map(s => (s.id === 'plant' ? { ...s, value: units.size, sub: open.some(f => f.level === 'stop') ? `${open.filter(f => f.level === 'stop').length} do not use` : 'faults reported', alert: true } : s)),
    attention,
    latest,
    navCounts: { ...home.navCounts, ...(units.size ? { plant: units.size } : {}) },
  };
}
