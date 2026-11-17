/**
 * Reads the facts the chemical register needs out of the text of an SDS (safety data sheet).
 * Works on plain text only (the PDF is turned into text in the browser), is forgiving about
 * layout, and never guesses: anything it cannot find is left out, and the person reviews every
 * proposed change before it is saved.
 */

import type { Chemical, DgClass, PackingGroup } from './chemicals.ts';

const DG_CLASSES: DgClass[] = ['2.1', '2.2', '2.3', '3', '4.1', '4.2', '4.3', '5.1', '5.2', '6.1', '8', '9'];

export interface SdsFacts {
  /** Latest labelled issue/revision date found, YYYY-MM-DD */
  issueDate: string | null;
  /** Every labelled date found, YYYY-MM-DD, oldest first */
  dates: string[];
  productName: string;
  supplier: string;
  phone: string;
  /** UN number from section 14, if the product is dangerous goods */
  un: string | null;
  dgClass: DgClass | null;
  packingGroup: PackingGroup | null;
  subsidiary: string;
  /** The SDS says in section 14 that the product is not dangerous goods */
  notDg: boolean;
  /** True when section 14 was found and read */
  hasTransport: boolean;
  hStatements: string[];
  /** Flash point in degrees C, and whether the figure is only a bound ("> 93") */
  flashPoint: { value: number; bound: '<' | '>' | '' } | null;
  aerosol: boolean;
  /** true / false when the SDS says; null when it does not say */
  ghsHazardous: boolean | null;
  /** Looks like an Australian SDS (Safe Work Australia, ADG) */
  australian: boolean;
  /** Looks like an EU/UK SDS (CLP, ADR) with no Australian wording */
  overseas: boolean;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function flatten(text: string): string {
  return text.replace(/ /g, ' ').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
}

function iso(y: number, m: number, d: number): string | null {
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Day-first (Australian) unless the numbers can only be month-first (a US style date like 1/13/2025). */
function numericDate(a: number, b: number, y: number): string | null {
  if (b > 12 && a <= 12) return iso(y, a, b);
  return iso(y, b, a);
}

const DATE_LABEL = /(?:date of issue|issue date|issued|revision date|date of revision|revised|revision|date of preparation|date of compilation|date prepared|print date)\s*[:.]?\s*/gi;
const DATE_VALUE = /^(?:(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})|(\d{1,2})[-]([A-Za-z]{3})[-](\d{4})|(\d{1,2})[./-](\d{1,2})[./-](\d{4})|(\d{4})-(\d{2})-(\d{2}))/;

export function findDates(text: string): string[] {
  const found = new Set<string>();
  for (const label of text.matchAll(DATE_LABEL)) {
    if (/print/i.test(label[0])) continue;
    const rest = text.slice((label.index ?? 0) + label[0].length, (label.index ?? 0) + label[0].length + 30);
    const m = DATE_VALUE.exec(rest);
    if (!m) continue;
    let d: string | null = null;
    if (m[1]) {
      const mi = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
      if (mi >= 0) d = iso(Number(m[3]), mi + 1, Number(m[1]));
    } else if (m[4]) {
      const mi = MONTHS.indexOf(m[5].toLowerCase());
      if (mi >= 0) d = iso(Number(m[6]), mi + 1, Number(m[4]));
    } else if (m[7]) {
      d = numericDate(Number(m[7]), Number(m[8]), Number(m[9]));
    } else if (m[10]) {
      d = iso(Number(m[10]), Number(m[11]), Number(m[12]));
    }
    if (d) found.add(d);
  }
  return [...found].sort();
}

function section(text: string, from: RegExp, to: RegExp): string {
  const all = [...text.matchAll(new RegExp(from.source, from.flags.includes('g') ? from.flags : `${from.flags}g`))];
  // A heading can appear in a contents list or repeat as a page header, so every real body is joined.
  const bodies: string[] = [];
  for (const m of all) {
    const tail = text.slice((m.index ?? 0) + m[0].length);
    const end = tail.search(to);
    const body = end >= 0 ? tail.slice(0, end) : tail.slice(0, 4000);
    if (body.trim().length > 40) bodies.push(body);
  }
  return bodies.join(' ');
}

const CLASS_OK = new Set<string>(DG_CLASSES);

export function parseSdsText(raw: string): SdsFacts {
  const text = flatten(raw);
  const oneLine = text.replace(/\n/g, ' ');

  const dates = findDates(oneLine);
  const today = new Date().toISOString().slice(0, 10);
  const notFuture = dates.filter(d => d <= today);
  const issueDate = (notFuture.length ? notFuture : dates).slice(-1)[0] ?? null;

  // Section 14
  const s14 = section(oneLine, /(?:section\s*)?14\s*[.:]?\s*(?:section\s*14\s*[.:]?\s*)?transport\s+information/i, /(?:section\s*)?15\s*[.:]?\s*regulatory/i);
  const hasTransport = s14.length > 0;
  let un: string | null = null;
  let dgClass: DgClass | null = null;
  let packingGroup: PackingGroup | null = null;
  let subsidiary = '';
  let notDg = false;
  if (hasTransport) {
    const unM = /\bUN\s*(?:no\.?|number|or id number)?\s*(?:or id number)?\s*[:.]?\s*(?:[A-Za-z ]{0,12}?)UN\s*(\d{4})|\bUN\s*(?:no\.?|number)?\s*[:.]?\s*(\d{4})\b/i.exec(s14)
      ?? /\bUN\s*(?:no\.?|number|or id number)[^0-9]{0,45}(\d{4})\b/i.exec(s14);
    if (unM) un = unM[1] ?? unM[2] ?? null;
    if (un) {
      const clsLabel = /(?:hazard class(?:\(es\))?|dangerous goods class|class-primary|primary class|\bclass)\s*[:.]?\s*(?:ADG|ADR|IMDG|IATA|RID|ADN)?\s*[:.]?\s*([1-9](?:\.[1-6])?)(?![\d])/i.exec(s14);
      let c = clsLabel?.[1];
      if (c === '2') c = /labels?\s*[:.]?\s*(2\.[123])/i.exec(s14)?.[1];
      if (!c || !CLASS_OK.has(c)) {
        c = /\bhazard\s+(?:class(?:\(es\))?\s*[:.]?\s*)?(\d(?:\.\d)?)\b/i.exec(s14)?.[1];
        if (c === '2') c = /labels?\s*[:.]?\s*(2\.[123])/i.exec(s14)?.[1];
      }
      if (!c || !CLASS_OK.has(c)) {
        const afterUn = s14.slice(s14.search(new RegExp(`UN\\s*${un}`, 'i')));
        const tbl = /\b(2\.[123]|3|4\.[123]|5\.[12]|6\.1|8|9)\b/.exec(afterUn.slice(afterUn.indexOf(un) + 4, afterUn.indexOf(un) + 140));
        c = tbl?.[1];
      }
      if (c && CLASS_OK.has(c)) dgClass = c as DgClass;
      const pg = /packing\s*group\s*[:.]?\s*(?:ADG|ADR|IMDG|IATA|RID|ADN|[:.])*\s*(III|II|I|111|11|1)(?![\w])/i.exec(s14);
      if (pg) packingGroup = ({ III: 'III', II: 'II', I: 'I', 111: 'III', 11: 'II', 1: 'I' } as Record<string, PackingGroup>)[pg[1].toUpperCase()] ?? null;
      const sub = /subsidiary\s*(?:risk|hazard)s?(?:\s*label)?\s*[:.]?\s*(\d(?:\.\d)?)/i.exec(s14);
      if (sub && CLASS_OK.has(sub[1])) subsidiary = sub[1];
    } else {
      notDg = /not\s+(?:classified\s+as\s+)?(?:a\s+)?dangerous\s+goods|not\s+regulated|not\s+subject\s+to\s+(?:dg|dangerous)/i.test(s14);
    }
  }

  // H statements: from the hazard identification section only (not the ingredient list).
  const s2 = section(oneLine, /(?:section\s*)?2\s*[.:]?\s*hazards?\s*\(?s?\)?\s*identification/i, /(?:section\s*)?3\s*[.:]?\s*composition/i);
  const hSource = s2 || oneLine.slice(0, 6000);
  const hStatements = [...new Set([...hSource.matchAll(/\bH(\d{3})([A-Za-z]{0,2})\b/g)].map(m => `H${m[1]}${m[2]}`))].sort();

  const fp = /flash\s*point\s*\(\s*(?:°|º)?\s*C\s*\)\s*[:.]?\s*([<>]?)\s*(-?\d{1,3}(?:\.\d)?)/i.exec(oneLine)
    ?? /flash\s*point[^0-9<>-]{0,40}([<>]?)\s*(-?\d{1,3}(?:\.\d)?)\s*(?:°|º|deg)?\s*C\b/i.exec(oneLine);
  const flashPoint = fp ? { value: Number(fp[2]), bound: (fp[1] as '<' | '>' | '') } : null;

  const aerosol = un === '1950' || /\baerosol\b/i.test(oneLine.slice(0, 1500));

  let ghsHazardous: boolean | null = null;
  if (/not\s+(?:a\s+)?hazardous\s+(?:substance|chemical)|non-?\s*hazardous\s+according|not\s+classified\s+as\s+hazardous/i.test(oneLine.slice(0, 6000))) ghsHazardous = false;
  else if (hStatements.length || /hazardous\s+according\s+to\s+the\s+criteria/i.test(oneLine.slice(0, 6000))) ghsHazardous = true;

  const phoneM = /emergency[^0-9+]{0,60}(\+?\d[\d ()-]{6,20}\d)/i.exec(oneLine);
  const phone = phoneM ? phoneM[1].trim() : '';

  const nameM = /(?:product\s*(?:name|identifier)|trade\s*name|product\s*form)\s*[:.]?\s*([^\n]{3,90})/i.exec(text);
  const productName = (nameM?.[1] ?? text.split('\n').find(l => l.trim().length > 3 && !/safety data sheet/i.test(l)) ?? '').trim();

  const supM = /(?:^|\n)\s*(?:supplier|manufacturer|company\s*(?:name|details))\s*[:.]?\s*\n?\s*([A-Z][^\n]{3,80})/i.exec(text);
  const supplier = (supM?.[1] ?? '').replace(/\s{2,}.*$/, '').trim();

  const australian = /safe work australia|australian code for the transport|\bADG\b|australia(?:n)?\s+pty|\bABN\b/i.test(oneLine);
  const overseas = !australian && /regulation \(ec\)|1272\/2008|\bADR\b|1907\/2006/i.test(oneLine);

  return { issueDate, dates, productName, supplier, phone, un, dgClass, packingGroup, subsidiary, notDg, hasTransport, hStatements, flashPoint, aerosol, ghsHazardous, australian, overseas };
}

// ---------- Comparing an SDS with the register ----------

export type FieldKey = 'dg' | 'un' | 'pg' | 'subsidiary' | 'aerosol' | 'combustible' | 'ghs' | 'h' | 'phone' | 'confirmed' | 'note';

export interface Proposal {
  key: FieldKey;
  label: string;
  current: string;
  proposed: string;
  /** Ticked by default */
  apply: boolean;
  patch: Partial<Pick<Chemical, 'dg_class' | 'un_number' | 'packing_group' | 'subsidiary' | 'aerosol' | 'combustible' | 'ghs_hazardous' | 'h_statements' | 'supplier_phone' | 'class_confirmed' | 'notes'>>;
}

export const SDS_NOTE_RE = /\s*(?:Upload the SDS to confirm the class\.|Upload the SDS\.|Enter the DG class from the SDS\.|Class from the can label \(flammable aerosol\)\.)/g;

export function combustibleFor(f: SdsFacts): 'C1' | 'C2' | null {
  if (!f.flashPoint || f.dgClass) return null;
  const { value, bound } = f.flashPoint;
  if (bound === '<') return null;
  if (value > 150) return 'C2';
  if (bound === '>') return null;
  if (value >= 60.5) return 'C1';
  return null;
}

const show = (v: string | null | undefined) => (v === null || v === undefined || v === '' ? 'blank' : v);

export interface SdsReview {
  proposals: Proposal[];
  warnings: string[];
  /** Whether the SDS looks safe to confirm the class from */
  trustworthy: boolean;
}

export function reviewSds(chem: Chemical, f: SdsFacts, today: string): SdsReview {
  const warnings: string[] = [];
  if (!f.hasTransport) warnings.push('Could not find section 14 (transport) in this PDF, so the class was not read. It may be scanned or an unusual layout.');
  if (f.issueDate) {
    const fiveYears = `${Number(f.issueDate.slice(0, 4)) + 5}${f.issueDate.slice(4)}`;
    if (fiveYears < today) warnings.push('This SDS is over 5 years old. Ask the supplier for a current one.');
  } else {
    warnings.push('Could not find the issue date. Enter it from the SDS.');
  }
  if (f.overseas) warnings.push('This looks like an overseas (EU or UK) SDS, not an Australian one. Ask the supplier for the Australian SDS.');
  const words = chem.name.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 4 && !/^(line|paint|enamel|oil)$/.test(w));
  const head = f.productName.toLowerCase();
  if (words.length && !words.some(w => head.includes(w))) warnings.push(`The SDS is titled "${f.productName || 'unknown'}", which does not look like "${chem.name}". Check it is the right SDS.`);
  const trustworthy = f.hasTransport && !f.overseas && !warnings.some(w => /over 5 years|titled/.test(w));

  const proposals: Proposal[] = [];
  const add = (p: Omit<Proposal, 'apply'> & { apply?: boolean }) => {
    if (p.current === p.proposed) return;
    proposals.push({ apply: true, ...p });
  };

  if (f.hasTransport && (f.dgClass || f.notDg)) {
    add({ key: 'dg', label: 'Dangerous goods class', current: show(chem.dg_class ? `Class ${chem.dg_class}` : chem.class_confirmed ? 'Not DG' : null), proposed: f.dgClass ? `Class ${f.dgClass}` : 'Not DG', patch: { dg_class: f.dgClass } });
    add({ key: 'un', label: 'UN number', current: show(chem.un_number), proposed: show(f.un), patch: { un_number: f.un } });
    add({ key: 'pg', label: 'Packing group', current: show(chem.packing_group), proposed: show(f.packingGroup), patch: { packing_group: f.packingGroup } });
    add({ key: 'subsidiary', label: 'Subsidiary risk', current: show(chem.subsidiary), proposed: show(f.subsidiary), patch: { subsidiary: f.subsidiary } });
    add({ key: 'aerosol', label: 'Aerosol', current: chem.aerosol ? 'Yes' : 'No', proposed: f.un === '1950' ? 'Yes' : 'No', patch: { aerosol: f.un === '1950' } });
    const comb = combustibleFor(f);
    if (comb || (f.notDg && f.flashPoint && f.flashPoint.bound !== '<')) {
      add({ key: 'combustible', label: 'Combustible liquid', current: show(chem.combustible), proposed: show(comb), patch: { combustible: comb }, apply: comb !== null });
    }
  }
  if (f.ghsHazardous !== null) add({ key: 'ghs', label: 'GHS hazardous', current: chem.ghs_hazardous === null ? 'blank' : chem.ghs_hazardous ? 'Yes' : 'No', proposed: f.ghsHazardous ? 'Yes' : 'No', patch: { ghs_hazardous: f.ghsHazardous } });
  if (f.hStatements.length) add({ key: 'h', label: 'H statements', current: show(chem.h_statements.join(' ')), proposed: f.hStatements.join(' '), patch: { h_statements: f.hStatements } });
  if (f.phone) add({ key: 'phone', label: 'Supplier emergency phone', current: show(chem.supplier_phone), proposed: f.phone, patch: { supplier_phone: f.phone }, apply: !chem.supplier_phone });
  if (f.hasTransport && (f.dgClass || f.notDg) && !chem.class_confirmed) {
    add({ key: 'confirmed', label: 'Class checked against the SDS', current: 'No', proposed: 'Yes', patch: { class_confirmed: true }, apply: trustworthy });
  }
  if (SDS_NOTE_RE.test(chem.notes)) {
    SDS_NOTE_RE.lastIndex = 0;
    add({ key: 'note', label: 'Remove the "Upload the SDS" note', current: 'Present', proposed: 'Removed', patch: { notes: chem.notes.replace(SDS_NOTE_RE, '').trim() } });
  }
  SDS_NOTE_RE.lastIndex = 0;
  return { proposals, warnings, trustworthy };
}

/** Merge the ticked proposals into one update for the chemical. */
export function patchFrom(proposals: Proposal[]): Partial<Chemical> {
  const out: Record<string, unknown> = {};
  for (const p of proposals) if (p.apply) Object.assign(out, p.patch);
  return out as Partial<Chemical>;
}
