/** Adds the Documents library's review warnings to the home screen. */

import type { HomeData } from './homeData.ts';
import type { ComingItem } from './homeBoard.ts';
import { daysUntil } from './dates.ts';
import { reviewBy, reviewState, type WhsDocument } from './documents.ts';

export function withDocuments(home: HomeData, docs: WhsDocument[], now: Date = new Date()): HomeData {
  const active = docs.filter(d => d.active);
  const count = (s: ReturnType<typeof reviewState>) => active.filter(d => reviewState(d, now) === s).length;
  const overdue = count('overdue');
  const soon = count('due_soon');
  const none = count('none');
  const attention = [...home.attention];
  const plural = (n: number) => (n === 1 ? 'document is' : 'documents are');

  if (overdue) attention.push({ id: 'docs-overdue', urgency: 'overdue', title: `${overdue} ${plural(overdue)} past the review date`, detail: 'Read through, then mark reviewed', moduleId: 'documents', href: '#/m/documents' });
  if (soon) attention.push({ id: 'docs-soon', urgency: 'due_soon', title: `${soon} ${plural(soon)} due for review within 90 days`, detail: 'Documents', moduleId: 'documents', href: '#/m/documents' });
  if (none) attention.push({ id: 'docs-none', urgency: 'review', title: `${none} ${plural(none)} without a review date`, detail: 'Set a review date so the reminders start', moduleId: 'documents', href: '#/m/documents' });

  return { ...home, attention, navCounts: { ...home.navCounts, ...(overdue + soon ? { documents: overdue + soon } : {}) } };
}

/** Reviews falling due in the next few days, for the "coming up" list. */
export function documentsComing(docs: WhsDocument[], now: Date = new Date(), windowDays = 30): ComingItem[] {
  const out: ComingItem[] = [];
  for (const d of docs) {
    const by = reviewBy(d);
    if (!d.active || !by) continue;
    const left = daysUntil(by, now);
    if (left >= 0 && left <= windowDays) out.push({ day: by, what: 'Document review due', site: `${d.doc_no ? d.doc_no + ' ' : ''}${d.title}`.slice(0, 50), href: `#/documents/${d.id}` });
  }
  return out;
}
