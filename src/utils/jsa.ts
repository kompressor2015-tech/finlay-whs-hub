/**
 * Job Safety Analysis (JSA): a job-specific risk assessment of a task, step by step. It is not a SWMS.
 * Work that is high risk construction work needs a SWMS, so ticking any high risk area flags that.
 */

import type { Tone } from './attention.ts';
import { stepLevel, type SwmsStep } from './swms.ts';

export interface Jsa {
  id: string;
  ref: string;
  title: string;
  site_id: string | null;
  /** The site as written: a Finlay site picked from the list, or any customer site typed in */
  site_name: string;
  location: string;
  done_on: string | null;
  supervisor_name: string;
  crew: string;
  work_covered: string;
  steps: SwmsStep[];
  high_risk_areas: string[];
  ppe: string;
  permits: string;
  emergency: string;
  status: 'draft' | 'completed';
  completed_at: string | null;
  completed_by_name: string;
  created_by_name: string;
  created_at: string;
  updated_at: string;
}

export type JsaContent = Pick<Jsa, 'title' | 'site_id' | 'site_name' | 'location' | 'done_on' | 'supervisor_name' | 'crew' | 'work_covered' | 'steps' | 'high_risk_areas' | 'ppe' | 'permits' | 'emergency'>;

export const EMPTY_JSA: JsaContent = {
  title: '', site_id: null, site_name: '', location: '', done_on: null, supervisor_name: '', crew: '', work_covered: '', steps: [], high_risk_areas: [],
  ppe: '', permits: '', emergency: '',
};

/** Work that needs a SWMS rather than (or as well as) a JSA. */
export function needsSwms(j: Pick<Jsa, 'high_risk_areas'>): boolean {
  return j.high_risk_areas.length > 0;
}

/** What is missing before a JSA can be marked completed. Empty means ready. */
export function jsaProblems(j: Pick<Jsa, 'title' | 'steps' | 'supervisor_name' | 'crew' | 'done_on'> & Partial<Pick<Jsa, 'site_name'>>): string[] {
  const out: string[] = [];
  if (!j.title.trim()) out.push('Give the JSA a title.');
  if (j.site_name !== undefined && !j.site_name.trim()) out.push('Enter the site.');
  if (!j.done_on) out.push('Enter the date of the job.');
  if (!j.supervisor_name.trim()) out.push('Enter the supervisor.');
  if (!j.crew.trim()) out.push('List the crew.');
  if (j.steps.length === 0) out.push('Add at least one step.');
  j.steps.forEach((s, i) => {
    const n = i + 1;
    if (!s.step.trim()) out.push(`Step ${n}: say what is being done.`);
    if (!s.hazard.trim()) out.push(`Step ${n}: list the hazards.`);
    if (!s.controls.trim()) out.push(`Step ${n}: list the controls.`);
    if (!s.before) out.push(`Step ${n}: rate the risk before controls.`);
    if (!s.after) out.push(`Step ${n}: rate the risk after controls.`);
  });
  return out;
}

/** Steps still High or Extreme after controls: the job should not go ahead until they are lower or approved. */
export function highAfter(j: Pick<Jsa, 'steps'>): number {
  return j.steps.filter(s => ['high', 'extreme'].includes(stepLevel(s, 'after') ?? '')).length;
}

export function jsaPill(j: Pick<Jsa, 'status'>): { label: string; tone: Tone } {
  return j.status === 'completed' ? { label: 'Completed', tone: 'green' } : { label: 'Draft', tone: 'amber' };
}
