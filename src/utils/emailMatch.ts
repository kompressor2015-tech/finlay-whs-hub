/** Matching a pasted list of names and emails to people on file. */

import type { Person } from './incidentFile.ts';

export interface EmailMatch { line: string; email: string; person: Person | null; note: string }

const EMAIL = /[A-Z0-9._%+'-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');
/** "Smith, John" and "John Smith" and "john.smith" all give the same key */
const nameKey = (s: string) => norm(s.includes(',') ? s.split(',').reverse().join(' ') : s);

export function validEmail(s: string): boolean { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim()); }

/** Each pasted line is a name and an email in any order, split by comma, tab, dash or spaces. */
export function matchEmails(text: string, people: Person[]): EmailMatch[] {
  const active = people.filter(p => p.active);
  const out: EmailMatch[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(EMAIL);
    if (!m) { out.push({ line, email: '', person: null, note: 'No email found on this line' }); continue; }
    const email = m[0].toLowerCase();
    let label = line.replace(m[0], ' ').replace(/[<>()"\t;|]+/g, ' ').replace(/\s[-–]\s/g, ' ').trim().replace(/^,|,$/g, '').trim();
    if (!label) label = email.split('@')[0].replace(/[._-]+/g, ' ');
    const key = nameKey(label);
    let hits = active.filter(p => nameKey(p.name) === key);
    if (hits.length === 0) {
      // "Smith, John Paul" against "John Smith": all of the pasted words are in the name
      const words = key.split(' ');
      hits = active.filter(p => { const n = nameKey(p.name).split(' '); return words.length >= 2 && words.every(w => n.includes(w)); });
    }
    if (hits.length === 1) out.push({ line, email, person: hits[0], note: hits[0].email && hits[0].email.toLowerCase() !== email ? `Replaces ${hits[0].email}` : '' });
    else out.push({ line, email, person: null, note: hits.length > 1 ? 'More than one person with that name' : 'No one on file with that name' });
  }
  return out;
}
