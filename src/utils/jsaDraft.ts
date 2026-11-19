/** Hands a ready-made JSA draft (from an SWI, or a copy of another JSA) to the JSA page, which opens it as a new JSA. */

import type { JsaContent } from './jsa.ts';

export interface JsaStart {
  content: JsaContent;
  /** Where it came from, shown at the top, e.g. "SWI-041 883 Tracking" or "JSA-003" */
  from: string;
  kind: 'swi' | 'copy';
  /** Things worth telling the person about what was and was not picked up */
  notes: string[];
}

let pending: JsaStart | null = null;

export function setJsaStart(s: JsaStart): void { pending = s; }

/** Returns the waiting draft once, then forgets it. */
export function takeJsaStart(): JsaStart | null { const s = pending; pending = null; return s; }

/** A copy of a JSA for a new job: same steps, but the date, supervisor and crew are left for the new crew. */
export function copyOf(j: JsaContent): JsaContent {
  return { ...j, done_on: null, supervisor_name: '', crew: '', steps: j.steps.map(s => ({ ...s })) };
}
