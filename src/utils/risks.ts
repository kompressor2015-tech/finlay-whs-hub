/**
 * The risk register. A risk is rated twice on one 5 by 5 matrix: before controls and after controls.
 * The matrix is Finlay's own (the one printed in the SWMS): each square has a score from 1 to 25.
 * 1 to 8 low, 9 to 15 medium, 16 to 19 high, 20 to 25 extreme.
 * Controls use the same five levels as incident fixes. Every risk is reviewed on a cycle (12 months
 * unless set otherwise), flagged 60 days before.
 */

import { addMonths } from './documents.ts';
import { daysUntil } from './dates.ts';
import type { Tone } from './attention.ts';
import type { ControlLevel } from './incidentFile.ts';

export const REVIEW_SOON_DAYS = 60;

export type RiskLevel = 'low' | 'medium' | 'high' | 'extreme';

export interface Risk {
  id: string;
  ref: string;
  title: string;
  category: string;
  site_id: string | null;
  description: string;
  before_likelihood: number;
  before_consequence: number;
  after_likelihood: number | null;
  after_consequence: number | null;
  owner_name: string;
  review_months: number;
  reviewed_on: string | null;
  reviewed_by_name: string;
  notes: string;
  status: 'active' | 'retired';
  created_by_name: string;
  created_at: string;
  updated_at: string;
}

export interface RiskControl {
  id: string;
  risk_id: string;
  control_level: ControlLevel;
  what: string;
  created_at: string;
}

export interface RiskReview {
  id: string;
  risk_id: string;
  reviewed_on: string;
  reviewed_by_name: string;
  note: string;
  created_at: string;
}

export const LIKELIHOODS = [
  { n: 5, label: 'Almost certain', sub: 'Common or repeating; more than once a month' },
  { n: 4, label: 'Likely', sub: 'Known to occur, or it has happened; more than 1 a year' },
  { n: 3, label: 'Possible', sub: 'Could occur; between 1 and 5 years' },
  { n: 2, label: 'Unlikely', sub: 'Not likely or remote; between 5 and 20 years' },
  { n: 1, label: 'Rare', sub: 'Practically impossible; more than 20 years' },
] as const;

export const CONSEQUENCES = [
  { n: 1, label: 'Minor', sub: 'First aid case, minor illness' },
  { n: 2, label: 'Moderate', sub: 'Medical treatment, no restricted duties' },
  { n: 3, label: 'Serious', sub: 'Lost time injury of 1 to 3 days, or restricted duties' },
  { n: 4, label: 'Major', sub: 'Lost time of 4 days or more; potential permanent disability' },
  { n: 5, label: 'Severe', sub: 'Fatality or significant permanent disability' },
] as const;

/** Finlay's matrix: MATRIX[likelihood][consequence] is the score. */
const MATRIX: Record<number, Record<number, number>> = {
  5: { 1: 11, 2: 16, 3: 20, 4: 23, 5: 25 },
  4: { 1: 7, 2: 12, 3: 17, 4: 21, 5: 24 },
  3: { 1: 4, 2: 9, 3: 13, 4: 18, 5: 22 },
  2: { 1: 2, 2: 5, 3: 10, 4: 14, 5: 19 },
  1: { 1: 1, 2: 3, 3: 6, 4: 8, 5: 15 },
};

export function riskScore(likelihood: number | null, consequence: number | null): number | null {
  if (likelihood === null || consequence === null) return null;
  return MATRIX[likelihood]?.[consequence] ?? null;
}

export const RISK_CATEGORIES = ['Mobile plant', 'Plant and machinery', 'Working at height', 'Hot work', 'Manual tasks', 'Health and hygiene', 'Chemicals', 'Electrical', 'Traffic and yard', 'Contractors', 'Other'];

export function riskLevel(likelihood: number | null, consequence: number | null): RiskLevel | null {
  const s = riskScore(likelihood, consequence);
  if (s === null) return null;
  return s >= 20 ? 'extreme' : s >= 16 ? 'high' : s >= 9 ? 'medium' : 'low';
}

/** The way the SWMS prints a rating: a letter for the level and the score, such as H18 or M13. */
export function riskCode(likelihood: number | null, consequence: number | null): string {
  const lv = riskLevel(likelihood, consequence);
  const sc = riskScore(likelihood, consequence);
  return lv && sc !== null ? `${lv === 'extreme' ? 'E' : lv === 'high' ? 'H' : lv === 'medium' ? 'M' : 'L'}${sc}` : '';
}

export const LEVELS: Record<RiskLevel, { label: string; tone: Tone; rank: number }> = {
  extreme: { label: 'Extreme', tone: 'red', rank: 0 },
  high: { label: 'High', tone: 'amber', rank: 1 },
  medium: { label: 'Medium', tone: 'blue', rank: 2 },
  low: { label: 'Low', tone: 'green', rank: 3 },
};

export function beforeLevel(r: Pick<Risk, 'before_likelihood' | 'before_consequence'>): RiskLevel {
  return riskLevel(r.before_likelihood, r.before_consequence) as RiskLevel;
}
export function afterLevel(r: Pick<Risk, 'after_likelihood' | 'after_consequence'>): RiskLevel | null {
  return riskLevel(r.after_likelihood, r.after_consequence);
}

export function reviewBy(r: Pick<Risk, 'reviewed_on' | 'review_months'>): string | null {
  return r.reviewed_on ? addMonths(r.reviewed_on, r.review_months) : null;
}

export type RiskReviewState = 'none' | 'overdue' | 'due_soon' | 'ok';

export function riskReviewState(r: Pick<Risk, 'reviewed_on' | 'review_months'>, now: Date = new Date()): RiskReviewState {
  const by = reviewBy(r);
  if (!by) return 'none';
  const left = daysUntil(by, now);
  return left < 0 ? 'overdue' : left <= REVIEW_SOON_DAYS ? 'due_soon' : 'ok';
}

export type RiskStatusKey = 'no_controls' | 'not_rated' | 'high_after' | 'overdue' | 'due_soon' | 'no_review' | 'ppe_only' | 'ok';

/** What a risk needs, worst first. Used for the Status column, the tiles and the home screen. */
export function riskIssues(r: Risk, controls: Pick<RiskControl, 'control_level'>[], now: Date = new Date()): { key: RiskStatusKey; label: string; tone: Tone }[] {
  const out: { key: RiskStatusKey; label: string; tone: Tone }[] = [];
  if (r.status === 'retired') return out;
  if (controls.length === 0) out.push({ key: 'no_controls', label: 'Needs controls', tone: 'red' });
  else if (controls.every(c => c.control_level === 'ppe')) out.push({ key: 'ppe_only', label: 'PPE is the only control', tone: 'amber' });
  const after = afterLevel(r);
  if (controls.length > 0 && !after) out.push({ key: 'not_rated', label: 'Rate it after controls', tone: 'amber' });
  if (after === 'extreme' || after === 'high') out.push({ key: 'high_after', label: `Still ${LEVELS[after].label.toLowerCase()} after controls`, tone: 'red' });
  const rs = riskReviewState(r, now);
  if (rs === 'overdue') out.push({ key: 'overdue', label: 'Review overdue', tone: 'red' });
  else if (rs === 'none') out.push({ key: 'no_review', label: 'No review date', tone: 'amber' });
  else if (rs === 'due_soon') out.push({ key: 'due_soon', label: 'Review due soon', tone: 'amber' });
  return out;
}

export function riskPill(r: Risk, controls: Pick<RiskControl, 'control_level'>[], now: Date = new Date()): { label: string; tone: Tone } {
  const first = riskIssues(r, controls, now)[0];
  if (r.status === 'retired') return { label: 'Retired', tone: 'grey' };
  return first ? { label: first.label, tone: first.tone } : { label: 'In control', tone: 'green' };
}

/** A risk that needs someone to act, for the tiles and the menu count. */
export function needsAttention(r: Risk, controls: Pick<RiskControl, 'control_level'>[], now: Date = new Date()): boolean {
  return riskIssues(r, controls, now).some(i => i.tone === 'red');
}

export function sortRisks<T extends { risk: Risk }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const la = LEVELS[afterLevel(a.risk) ?? beforeLevel(a.risk)].rank;
    const lb = LEVELS[afterLevel(b.risk) ?? beforeLevel(b.risk)].rank;
    return la - lb || a.risk.ref.localeCompare(b.risk.ref);
  });
}
