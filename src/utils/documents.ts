/**
 * The Documents library: types, review dates and reading a document's details from its file name.
 * Every document is reviewed on a cycle (12 months unless set otherwise) counted from the day it
 * was last reviewed. A document with no review date yet is flagged until someone sets one.
 */

import { brisbaneDay, daysUntil } from './dates.ts';
import type { Tone } from './attention.ts';

export type DocType = 'hsms' | 'swi' | 'swms' | 'risk_assessment' | 'policy' | 'form';

export const DOC_TYPES: readonly { id: DocType; label: string; short: string }[] = [
  { id: 'hsms', label: 'Management system', short: 'HSMS' },
  { id: 'swi', label: 'Work instructions', short: 'SWI' },
  { id: 'swms', label: 'SWMS', short: 'SWMS' },
  { id: 'risk_assessment', label: 'Machine risk assessments', short: 'Risk assessment' },
  { id: 'policy', label: 'Policies and plans', short: 'Policy' },
  { id: 'form', label: 'Forms and templates', short: 'Form' },
];

export function docTypeLabel(type: DocType): string {
  return DOC_TYPES.find(t => t.id === type)?.short ?? type;
}

export const CATEGORY_SUGGESTIONS = ['Hand tools and workshop', 'Mobile plant', 'Crusher and screen changeovers', 'Other'];

export interface WhsDocument {
  id: string;
  doc_type: DocType;
  doc_no: string;
  title: string;
  site_id: string | null;
  machine_model: string;
  /** Optional heading to group a long list under, e.g. "Mobile plant" */
  category: string;
  owner_name: string;
  review_months: number;
  reviewed_on: string | null;
  reviewed_by_name: string;
  notes: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DocVersion {
  id: string;
  document_id: string;
  version: string;
  file_path: string;
  file_name: string;
  /** The date printed on this version, if known */
  issued_on: string | null;
  uploaded_at: string;
  uploaded_by_name: string;
}

/** The newest version of each document (the one staff are given). */
export function currentVersion(versions: DocVersion[]): DocVersion | null {
  return [...versions].sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at))[0] ?? null;
}

export function fileKind(name: string): 'PDF' | 'DOC' | 'XLS' | 'FILE' {
  if (/\.pdf$/i.test(name)) return 'PDF';
  if (/\.docx?$/i.test(name)) return 'DOC';
  if (/\.xlsx?$/i.test(name)) return 'XLS';
  return 'FILE';
}

// ---------------------------------------------------------------------------------
// Review dates
// ---------------------------------------------------------------------------------

/** Adds whole months to a YYYY-MM-DD date, keeping the day (29 to 31 Jan + 1 month = the last day of Feb). */
export function addMonths(day: string, months: number): string {
  const [y, m, d] = day.slice(0, 10).split('-').map(Number);
  const total = (m - 1) + months;
  const year = y + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

export function reviewBy(doc: Pick<WhsDocument, 'reviewed_on' | 'review_months'>): string | null {
  return doc.reviewed_on ? addMonths(doc.reviewed_on, doc.review_months) : null;
}

export type ReviewState = 'none' | 'ok' | 'due_soon' | 'overdue';

/** Flagged from 90 days before the review date, like the SDS review. */
export function reviewState(doc: Pick<WhsDocument, 'reviewed_on' | 'review_months'>, now: Date = new Date()): ReviewState {
  const by = reviewBy(doc);
  if (!by) return 'none';
  const left = daysUntil(by, now);
  if (left < 0) return 'overdue';
  if (left <= 90) return 'due_soon';
  return 'ok';
}

export function reviewPill(doc: Pick<WhsDocument, 'reviewed_on' | 'review_months'>, now: Date = new Date()): { label: string; tone: Tone } {
  const state = reviewState(doc, now);
  const by = reviewBy(doc);
  const mmyyyy = by ? `${by.slice(5, 7)}/${by.slice(0, 4)}` : '';
  if (state === 'none') return { label: 'No review date', tone: 'amber' };
  if (state === 'overdue') return { label: `Overdue since ${mmyyyy}`, tone: 'red' };
  if (state === 'due_soon') return { label: `Review by ${mmyyyy}`, tone: 'amber' };
  return { label: `Review by ${mmyyyy}`, tone: 'green' };
}

export function today(now: Date = new Date()): string {
  return brisbaneDay(now);
}

// ---------------------------------------------------------------------------------
// Reading a file name
// ---------------------------------------------------------------------------------

export interface ParsedDocFile {
  type: DocType;
  doc_no: string;
  title: string;
  version: string;
  machine_model: string;
}

function tidy(s: string): string {
  return s.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').replace(/^[\s\-–]+|[\s\-–]+$/g, '').trim();
}

/**
 * Works out what a file is from its name (and the folder it sits in, when the browser gives one):
 *   "SWI -001 Angle Grinder.pdf"               -> work instruction SWI-001
 *   "J-1480 Risk Assessment v4.9.pdf"          -> machine risk assessment, model J-1480, v4.9
 *   "SWMS_J1480-1083 - Finlay.docx"            -> SWMS
 *   "HSMS05 Responsibility and Accountability" -> management system HSMS05
 * Anything it cannot place is a policy, and the person can change it before uploading.
 */
export function parseDocFile(fileName: string, relativePath = ''): ParsedDocFile {
  let base = fileName.replace(/\.[A-Za-z0-9]{2,5}$/, '');
  let version = '';
  const v = /[\s_-]v(?:ersion)?\s?(\d+(?:\.\d+)*)\s*$/i.exec(base);
  if (v) {
    version = `v${v[1]}`;
    base = base.slice(0, v.index);
  }
  base = tidy(base);

  const swi = /^SWI\s*-?\s*(\d+)\s*[-–]?\s*(.*)$/i.exec(base);
  if (swi) return { type: 'swi', doc_no: `SWI-${swi[1].padStart(3, '0')}`, title: tidy(swi[2]) || base, version, machine_model: '' };

  const hsms = /^HSMS\s*-?\s*(\d+)\s*[-–]?\s*(.*)$/i.exec(base);
  if (hsms) return { type: 'hsms', doc_no: `HSMS${hsms[1].padStart(2, '0')}`, title: tidy(hsms[2]) || base, version, machine_model: '' };
  const folder = /(?:^|\/)HSMS\s*(\d+)\s+([^/]+)\//i.exec(relativePath);
  if (folder) return { type: 'hsms', doc_no: `HSMS${folder[1].padStart(2, '0')}`, title: base, version, machine_model: '' };

  if (/risk assessment/i.test(base)) {
    const model = tidy(base.replace(/\s*risk assessment.*$/i, ''));
    return { type: 'risk_assessment', doc_no: '', title: base, version, machine_model: model };
  }

  const swms = /^SWMS[\s_-]*(.*)$/i.exec(base);
  if (swms) {
    const rest = tidy(swms[1]);
    if (/template/i.test(rest)) return { type: 'form', doc_no: '', title: `SWMS ${rest}`, version, machine_model: '' };
    if (/register/i.test(rest)) return { type: 'policy', doc_no: '', title: `SWMS ${rest}`, version, machine_model: '' };
    return { type: 'swms', doc_no: '', title: rest || base, version, machine_model: '' };
  }

  if (/\b(template|form)\b/i.test(base)) return { type: 'form', doc_no: '', title: base, version, machine_model: '' };
  return { type: 'policy', doc_no: '', title: base, version, machine_model: '' };
}
