/**
 * Safe work method statements. A SWMS has versions: draft, awaiting approval, approved, superseded.
 * Only the WHS officer or an administrator approves, with a signature. Approved versions are locked.
 * A SWMS is reviewed every 12 months unless set otherwise, flagged 60 days before.
 */

import { addMonths } from './documents.ts';
import { daysUntil } from './dates.ts';
import type { Tone } from './attention.ts';
import { riskLevel, REVIEW_SOON_DAYS, type RiskLevel } from './risks.ts';

export type VersionStatus = 'draft' | 'awaiting' | 'approved' | 'superseded';

export interface Swms {
  id: string;
  ref: string;
  title: string;
  site_id: string | null;
  owner_name: string;
  review_months: number;
  reviewed_on: string | null;
  reviewed_by_name: string;
  document_id: string | null;
  status: 'active' | 'retired';
  created_by_name: string;
  created_at: string;
  updated_at: string;
}

export interface SwmsStep {
  step: string;
  hazard: string;
  before: [number, number] | null;
  controls: string;
  after: [number, number] | null;
  who: string;
  risk_id: string | null;
}

export interface SwmsVersion {
  id: string;
  swms_id: string;
  version: number;
  status: VersionStatus;
  work_covered: string;
  who_may: string;
  steps: SwmsStep[];
  ppe: string;
  plant: string;
  permits: string;
  emergency: string;
  linked_risk_ids: string[];
  decision_note: string;
  created_by_name: string;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  submitted_by_name: string;
  approved_at: string | null;
  approved_by_name: string;
  signature_path: string | null;
}

export interface SwmsReview {
  id: string;
  swms_id: string;
  reviewed_on: string;
  reviewed_by_name: string;
  note: string;
  created_at: string;
}

export const VERSION_LABEL: Record<VersionStatus, { label: string; tone: Tone }> = {
  draft: { label: 'Draft', tone: 'grey' },
  awaiting: { label: 'Awaiting approval', tone: 'amber' },
  approved: { label: 'Approved', tone: 'green' },
  superseded: { label: 'Superseded', tone: 'grey' },
};

export function emptyStep(): SwmsStep {
  return { step: '', hazard: '', before: null, controls: '', after: null, who: '', risk_id: null };
}

export function stepLevel(s: Pick<SwmsStep, 'before' | 'after'>, which: 'before' | 'after'): RiskLevel | null {
  const v = s[which];
  return v ? riskLevel(v[0], v[1]) : null;
}

/** What is missing before a version can be sent for approval. Empty means ready. */
export function versionProblems(v: Pick<SwmsVersion, 'steps' | 'work_covered'>): string[] {
  const out: string[] = [];
  if (!v.work_covered.trim()) out.push('Say what work this SWMS covers.');
  if (v.steps.length === 0) out.push('Add at least one step.');
  v.steps.forEach((s, i) => {
    const n = i + 1;
    if (!s.step.trim()) out.push(`Step ${n}: describe the step.`);
    if (!s.hazard.trim()) out.push(`Step ${n}: name the hazard.`);
    if (!s.before) out.push(`Step ${n}: rate the risk before controls.`);
    if (!s.controls.trim()) out.push(`Step ${n}: write the controls.`);
    if (s.before && s.controls.trim() && !s.after) out.push(`Step ${n}: rate the risk after controls.`);
    const after = stepLevel(s, 'after');
    if (after === 'extreme') out.push(`Step ${n}: still extreme after controls. Add stronger controls or do not proceed.`);
  });
  return out;
}

/** Steps that stay high after controls: allowed, but the approver should see them. */
export function highAfterCount(steps: SwmsStep[]): number {
  return steps.filter(s => stepLevel(s, 'after') === 'high').length;
}

/** The version people work from: the approved one. */
export function currentApproved(versions: SwmsVersion[]): SwmsVersion | null {
  return versions.filter(v => v.status === 'approved').sort((a, b) => b.version - a.version)[0] ?? null;
}

/** The version being worked on (draft or awaiting), if any. */
export function openVersion(versions: SwmsVersion[]): SwmsVersion | null {
  return versions.filter(v => v.status === 'draft' || v.status === 'awaiting').sort((a, b) => b.version - a.version)[0] ?? null;
}

export function swmsReviewBy(s: Pick<Swms, 'reviewed_on' | 'review_months'>): string | null {
  return s.reviewed_on ? addMonths(s.reviewed_on, s.review_months) : null;
}

export type SwmsReviewState = 'none' | 'overdue' | 'due_soon' | 'ok';

export function swmsReviewState(s: Pick<Swms, 'reviewed_on' | 'review_months'>, now: Date = new Date()): SwmsReviewState {
  const by = swmsReviewBy(s);
  if (!by) return 'none';
  const left = daysUntil(by, now);
  return left < 0 ? 'overdue' : left <= REVIEW_SOON_DAYS ? 'due_soon' : 'ok';
}

export type SwmsIssueKey = 'awaiting' | 'not_approved' | 'overdue' | 'due_soon' | 'draft';

/** What a SWMS needs, worst first. Used for the Status column, tiles and home screen. */
export function swmsIssues(s: Swms, versions: Pick<SwmsVersion, 'status'>[], now: Date = new Date()): { key: SwmsIssueKey; label: string; tone: Tone }[] {
  const out: { key: SwmsIssueKey; label: string; tone: Tone }[] = [];
  if (s.status === 'retired') return out;
  const approved = versions.some(v => v.status === 'approved');
  const awaiting = versions.some(v => v.status === 'awaiting');
  const draft = versions.some(v => v.status === 'draft');
  if (!approved) out.push({ key: 'not_approved', label: 'Not approved yet', tone: 'red' });
  const rs = swmsReviewState(s, now);
  if (approved && rs === 'overdue') out.push({ key: 'overdue', label: 'Review overdue', tone: 'red' });
  if (awaiting) out.push({ key: 'awaiting', label: 'Awaiting approval', tone: 'amber' });
  if (approved && rs === 'due_soon') out.push({ key: 'due_soon', label: 'Review due soon', tone: 'amber' });
  if (draft && approved) out.push({ key: 'draft', label: 'New version in draft', tone: 'grey' });
  return out;
}

export function swmsPill(s: Swms, versions: Pick<SwmsVersion, 'status'>[], now: Date = new Date()): { label: string; tone: Tone } {
  if (s.status === 'retired') return { label: 'Retired', tone: 'grey' };
  const first = swmsIssues(s, versions, now)[0];
  return first ? { label: first.label, tone: first.tone } : { label: 'Approved', tone: 'green' };
}

/** Needs someone to act (red, or waiting on the approver). */
export function swmsNeedsAction(s: Swms, versions: Pick<SwmsVersion, 'status'>[], now: Date = new Date()): boolean {
  return swmsIssues(s, versions, now).some(i => i.tone === 'red' || i.key === 'awaiting');
}

/** Copy a version's content into a fresh draft's fields. */
export function contentOf(v: SwmsVersion) {
  return {
    work_covered: v.work_covered, who_may: v.who_may, steps: v.steps, ppe: v.ppe, plant: v.plant,
    permits: v.permits, emergency: v.emergency, linked_risk_ids: v.linked_risk_ids,
  };
}
