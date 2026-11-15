/**
 * Safe work method statements. A SWMS has versions: draft, awaiting approval, approved, superseded.
 * Only the WHS officer or an administrator approves, with a signature. Approved versions are locked.
 * A SWMS is reviewed every 12 months unless set otherwise, flagged 60 days before.
 */

import { addMonths } from './documents.ts';
import { daysUntil } from './dates.ts';
import type { Tone } from './attention.ts';
import { riskCode, riskLevel, REVIEW_SOON_DAYS, type RiskLevel } from './risks.ts';

export type VersionStatus = 'draft' | 'awaiting' | 'approved' | 'superseded';

export interface Swms {
  id: string;
  ref: string;
  /** Finlay's own number for the printed SWMS; falls back to ref */
  swms_number: string;
  risk_register_ref: string;
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
  /** Heading the step sits under, such as "Site arrival setup" */
  section: string;
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
  site_name: string;
  site_address: string;
  legislation: string;
  high_risk_areas: string[];
  high_risk_other: string;
  author_position: string;
  author_signature_path: string | null;
  supervisor_name: string;
  supervisor_position: string;
  supervisor_contact: string;
  supervisor_signature_path: string | null;
  expected_start: string | null;
  consulted: { name: string; signature_path: string | null }[];
  chemicals: { name: string; sds: string }[];
  review_checks: string[];
  permit_types: string[];
  qualifications: string;
  voc: string[];
  tools: string;
  sops: string;
  approver_position: string;
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

export function emptyStep(section = ''): SwmsStep {
  return { section, step: '', hazard: '', before: null, controls: '', after: null, who: '', risk_id: null };
}

export function stepLevel(s: Pick<SwmsStep, 'before' | 'after'>, which: 'before' | 'after'): RiskLevel | null {
  const v = s[which];
  return v ? riskLevel(v[0], v[1]) : null;
}

/** What is missing before a version can be sent for approval. Empty means ready. */
export function versionProblems(v: Pick<SwmsVersion, 'steps' | 'work_covered'> & Partial<Pick<SwmsVersion, 'site_name' | 'author_signature_path'>>): string[] {
  const out: string[] = [];
  if (!v.work_covered.trim()) out.push('Say what work this SWMS covers (the work activity).');
  if (v.site_name !== undefined && !v.site_name.trim()) out.push('Add the site or project name.');
  if (v.author_signature_path !== undefined && !v.author_signature_path) out.push('Sign as the author (in “The people”).');
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

export const HIGH_RISK_AREAS = [
  'Height > 2 metres', 'Telecommunications tower', 'Demolition of load bearing structures', 'Disturbance of asbestos', 'Confined space entry', 'Excavation or trench > 1.5 m',
  'Explosives', 'Pressurised or liquified gas main or pipe', 'Chemical, fuel or refrigerant lines', 'Energised electrical installation or service', 'Temporary supports or braces', 'Flammable atmosphere', 'Tunnels or tunnelling work',
  'Tilt-up panels or pre-cast concrete', 'Adjacent road, rail or shipping lane', 'Powered mobile plant', 'Artificial temperature extreme', 'Work near water (risk of drowning)', 'Hazardous substance', 'Underwater diving',
];
export const PERMIT_TYPES = ['Work at height', 'Confined space', 'Excavation', 'Other'];
export const VOC_TYPES = ['Elevated work platform (EWP)', 'Scaffold', 'Rigging', 'Vehicle loading crane (HIAB)', 'Working at heights'];
export const REVIEW_CHECKS = [
  { id: 'checklist', label: 'Has the SWMS been reviewed using the SWMS Review Checklist?' },
  { id: 'environment', label: 'Environmental controls adequate for task?' },
  { id: 'principal', label: 'Has Principal Contractor / client reviewed the SWMS?' },
];
export const COMPANY = { name: 'FINLAY SCREENING & CRUSHING SYSTEMS P/L', address: '740 OLD GYMPIE RD, BURPENGARY QLD 4505', abn: 'ABN: 84 059 443 677' };

export const DEFAULT_LEGISLATION = `Work Health and Safety Act 2011 (Qld): s19 Primary duty of care; s27 Duty of officers; s28 Duties of workers; s46-49 Consultation duties
Work Health and Safety Regulation 2011 (Qld) including Part 3.1 Managing risks; Part 4.2 Hazardous manual tasks; Part 4.3 Noise; Part 4.4 Hazardous chemicals; Part 5.1 Plant and structures; Part 5.2 Duties of designers, manufacturers, importers, suppliers of plant; Part 7.2 Hazardous atmospheres
Codes of Practice: Managing Risks of Plant in the Workplace; Safe Use of Machinery; Managing the Risk of Falls at Workplaces; How to Manage WHS Risks; Hazardous Manual Tasks; Managing Noise and Preventing Hearing Loss at Work; Managing Risks of Hazardous Chemicals in the Workplace
Australian Standards: AS 4024 Safety of machinery; AS/NZS 3000 Wiring Rules; AS 1940 Flammable and combustible liquids; AS/NZS 3760 In-service safety inspection and testing of electrical equipment; AS 1891 Industrial fall-arrest systems and devices
Manufacturer documentation: operator and maintenance manual; manufacturer service schedules and isolation procedures; OEM safety decals and guarding requirements`;

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

/** The fields a person writes. Everything else on a version is stamped by the database. */
export const CONTENT_KEYS = [
  'work_covered', 'who_may', 'steps', 'ppe', 'plant', 'permits', 'emergency', 'linked_risk_ids',
  'site_name', 'site_address', 'legislation', 'high_risk_areas', 'high_risk_other', 'author_position', 'author_signature_path',
  'supervisor_name', 'supervisor_position', 'supervisor_contact', 'supervisor_signature_path', 'expected_start', 'consulted',
  'chemicals', 'review_checks', 'permit_types', 'qualifications', 'voc', 'tools', 'sops',
] as const;
export type ContentKey = (typeof CONTENT_KEYS)[number];
export type VersionContent = Pick<SwmsVersion, ContentKey>;

export const EMPTY_CONTENT: VersionContent = {
  work_covered: '', who_may: '', steps: [], ppe: '', plant: '', permits: '', emergency: '', linked_risk_ids: [],
  site_name: '', site_address: '', legislation: DEFAULT_LEGISLATION, high_risk_areas: [], high_risk_other: '', author_position: '', author_signature_path: null,
  supervisor_name: '', supervisor_position: '', supervisor_contact: '', supervisor_signature_path: null, expected_start: null, consulted: [],
  chemicals: [], review_checks: [], permit_types: [], qualifications: '', voc: [], tools: '', sops: '',
};

/** Copy a version's content into a fresh draft's fields. */
export function contentOf(v: SwmsVersion): VersionContent {
  const out = {} as Record<string, unknown>;
  for (const k of CONTENT_KEYS) out[k] = v[k];
  return out as unknown as VersionContent;
}

/** A step's score for printing, such as H18. */
export function stepCode(s: SwmsStep, which: 'before' | 'after'): string {
  const v = s[which];
  return v ? riskCode(v[0], v[1]) : '';
}

/** Steps grouped under their section headings, in order. */
export function groupSteps(steps: SwmsStep[]): { section: string; steps: { step: SwmsStep; index: number }[] }[] {
  const out: { section: string; steps: { step: SwmsStep; index: number }[] }[] = [];
  steps.forEach((step, index) => {
    const last = out[out.length - 1];
    if (last && last.section === (step.section || '')) last.steps.push({ step, index });
    else out.push({ section: step.section || '', steps: [{ step, index }] });
  });
  return out;
}
