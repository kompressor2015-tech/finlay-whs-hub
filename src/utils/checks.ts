/**
 * Pre-starts, Take 5s, site inspections and plant flags: shapes and rules.
 * isProblem mirrors the database's whs_item_problem(), so the screen shows the
 * same result the database will record.
 */

import { addDays, brisbaneDay, daysUntil } from './dates.ts';
import type { Tone } from './attention.ts';

export type CheckKind = 'prestart' | 'take5' | 'site';
export type ItemType = 'pass_fail' | 'yes_no' | 'tick_list' | 'photo' | 'text';
export type CheckResult = 'ok' | 'fault' | 'stop' | 'issues';

export interface ChecklistItem {
  id: string;
  section: string;
  type: ItemType;
  text: string;
  sub?: string;
  /** Critical pre-start item: a fail means do not operate */
  critical?: boolean;
  /** For yes/no: the answer that means there is a problem */
  bad?: 'yes' | 'no';
  /** For tick lists: every option should be ticked */
  options?: string[];
  /** For photos: how many are needed */
  min_photos?: number;
}

export interface Checklist {
  id: string;
  kind: 'prestart' | 'site';
  name: string;
  site_id: string | null;
  site_name: string;
  frequency_days: number | null;
  version: number;
  items: ChecklistItem[];
  active: boolean;
  updated_by_name: string;
  updated_at: string;
}

export interface Answer {
  /** pass/fail/na, yes/no, ticked options, or text */
  v?: string | string[];
  note?: string;
  photos?: string[];
}

export type Answers = Record<string, Answer>;

export interface Check {
  id: string;
  kind: CheckKind;
  checklist_id: string | null;
  checklist_name: string;
  checklist_version: number | null;
  items: ChecklistItem[];
  answers: Answers;
  machine_id: string | null;
  unit_no: string;
  site_id: string | null;
  site_name: string;
  engine_hours: number | null;
  task: string;
  hazards: string[];
  controls: string[];
  crew: string;
  safe_to_start: boolean | null;
  comments: string;
  photos: string[];
  signed_off: boolean;
  /** Site inspections: the signature image in the photo store */
  signature_path: string | null;
  result: CheckResult;
  issue_count: number;
  done_by: string;
  done_by_name: string;
  done_at: string;
}

export interface PlantFlag {
  id: string;
  machine_id: string | null;
  unit_no: string;
  level: 'stop' | 'fault';
  reason: string;
  check_id: string | null;
  incident_id: string | null;
  action_id: string | null;
  raised_by_name: string;
  raised_at: string;
  cleared_at: string | null;
  cleared_by_name: string;
  clear_note: string;
}

// ---------------------------------------------------------------------------------
// Answers and results
// ---------------------------------------------------------------------------------

export function isProblem(item: ChecklistItem, answer: Answer | undefined): boolean {
  if (!answer || answer.v === undefined) return false;
  switch (item.type) {
    case 'pass_fail':
      return answer.v === 'fail';
    case 'yes_no':
      return answer.v === item.bad;
    case 'tick_list':
      return Array.isArray(answer.v) && answer.v.length < (item.options?.length ?? 0);
    default:
      return false;
  }
}

/** Whether a question has been answered enough to submit. */
export function isAnswered(item: ChecklistItem, answer: Answer | undefined): boolean {
  switch (item.type) {
    case 'pass_fail':
    case 'yes_no':
      return typeof answer?.v === 'string' && answer.v !== '';
    case 'tick_list':
      return Array.isArray(answer?.v);
    case 'photo':
      return (answer?.photos?.length ?? 0) >= (item.min_photos ?? 1);
    case 'text':
      return true;
  }
}

/** What still needs doing before the check can be submitted (plain words, first few). */
export function missingAnswers(items: ChecklistItem[], answers: Answers): string[] {
  const out: string[] = [];
  for (const item of items) {
    const a = answers[item.id];
    if (!isAnswered(item, a)) {
      out.push(item.type === 'photo' ? `${item.text} (${item.min_photos ?? 1} photo${(item.min_photos ?? 1) > 1 ? 's' : ''})` : item.text);
    } else if (isProblem(item, a) && item.type === 'pass_fail' && !a?.note?.trim()) {
      out.push(`${item.text}: say what's wrong`);
    }
  }
  return out;
}

export function resultFor(kind: CheckKind, items: ChecklistItem[], answers: Answers, safeToStart?: boolean | null): { result: CheckResult; issues: number } {
  let issues = 0;
  let critical = 0;
  for (const item of items) {
    if (isProblem(item, answers[item.id])) {
      issues += 1;
      if (item.critical) critical += 1;
    }
  }
  if (kind === 'take5') return { result: safeToStart ? 'ok' : 'stop', issues };
  if (kind === 'prestart') return { result: critical ? 'stop' : issues ? 'fault' : 'ok', issues };
  return { result: issues ? 'issues' : 'ok', issues };
}

export function resultPill(kind: CheckKind, result: CheckResult, issues = 0): { label: string; tone: Tone } {
  if (kind === 'take5') return result === 'ok' ? { label: 'Safe to start', tone: 'green' } : { label: 'Not safe to start', tone: 'red' };
  if (kind === 'prestart') {
    if (result === 'stop') return { label: 'Do not operate', tone: 'red' };
    if (result === 'fault') return { label: 'Fault reported', tone: 'amber' };
    return { label: 'OK', tone: 'green' };
  }
  return issues ? { label: `${issues} issue${issues > 1 ? 's' : ''}`, tone: 'amber' } : { label: 'No issues', tone: 'green' };
}

/** Group a checklist's questions by section, keeping their order. */
export function sections(items: ChecklistItem[]): { name: string; items: ChecklistItem[] }[] {
  const out: { name: string; items: ChecklistItem[] }[] = [];
  for (const item of items) {
    const name = item.section || 'Checks';
    const last = out[out.length - 1];
    if (last && last.name === name) last.items.push(item);
    else out.push({ name, items: [item] });
  }
  return out;
}

export function answerText(item: ChecklistItem, a: Answer | undefined): string {
  if (!a || a.v === undefined) return item.type === 'photo' ? `${a?.photos?.length ?? 0} photo(s)` : '—';
  if (Array.isArray(a.v)) return `${a.v.length} of ${item.options?.length ?? 0} ticked`;
  const words: Record<string, string> = { pass: 'Pass', fail: 'Fail', na: 'N/A', yes: 'Yes', no: 'No' };
  return words[a.v] ?? a.v;
}

// ---------------------------------------------------------------------------------
// Site inspections due
// ---------------------------------------------------------------------------------

export interface SiteDue {
  checklist: Checklist;
  lastDone: string | null;
  /** YYYY-MM-DD */
  due: string | null;
  state: 'overdue' | 'due_soon' | 'ok' | 'never';
}

export function siteInspectionsDue(checklists: Checklist[], checks: Pick<Check, 'kind' | 'checklist_id' | 'done_at'>[], now: Date = new Date()): SiteDue[] {
  return checklists
    .filter(c => c.kind === 'site' && c.active)
    .map(c => {
      const last = checks
        .filter(k => k.kind === 'site' && k.checklist_id === c.id)
        .map(k => k.done_at)
        .sort()
        .pop() ?? null;
      if (!c.frequency_days) return { checklist: c, lastDone: last, due: null, state: 'ok' as const };
      if (!last) return { checklist: c, lastDone: null, due: null, state: 'never' as const };
      const due = addDays(brisbaneDay(last), c.frequency_days);
      const d = daysUntil(due, now);
      return { checklist: c, lastDone: last, due, state: d < 0 ? ('overdue' as const) : d <= 7 ? ('due_soon' as const) : ('ok' as const) };
    });
}

// ---------------------------------------------------------------------------------
// Plant
// ---------------------------------------------------------------------------------

export function flagPill(level: PlantFlag['level']): { label: string; tone: Tone } {
  return level === 'stop' ? { label: 'Do not use', tone: 'red' } : { label: 'Fault', tone: 'amber' };
}

/** Open flags, most serious and newest first. */
export function openFlags(flags: PlantFlag[]): PlantFlag[] {
  return flags
    .filter(f => !f.cleared_at)
    .sort((a, b) => (a.level === b.level ? b.raised_at.localeCompare(a.raised_at) : a.level === 'stop' ? -1 : 1));
}

/** The most serious open flag for each unit number. */
export function flagByUnit(flags: PlantFlag[]): Map<string, PlantFlag> {
  const map = new Map<string, PlantFlag>();
  for (const f of openFlags(flags)) if (!map.has(f.unit_no)) map.set(f.unit_no, f);
  return map;
}

/** New ids for checklist questions an officer adds. */
export function newItemId(items: ChecklistItem[], text: string): string {
  const base = text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24) || 'q';
  let id = base;
  let n = 2;
  while (items.some(i => i.id === id)) id = `${base}_${n++}`;
  return id;
}

export const TAKE5_HAZARDS = ['Working at height', 'Moving parts', 'Heavy lifting', 'Mobile plant nearby', 'Hot surfaces', 'Stored energy', 'Dust or noise', 'Chemicals', 'Electrical', 'Weather'];
export const TAKE5_CONTROLS = ['Isolated and locked out', 'Harness or EWP', 'Two-person lift', 'Exclusion zone', 'Spotter', 'PPE checked', 'Permit in place', 'Let it cool'];
