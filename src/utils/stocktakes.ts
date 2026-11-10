/**
 * Chemical stocktakes: the record kept when a count is finished, the sheet printed from it
 * (the same layout as the old Monthly Dangerous Goods Audit: container × qty = subtotal, totals),
 * and which items still need counting this round.
 */

import { SECTIONS, amountOf, classLabel, siteTotals, type Chemical, type State, type Stock, type ThresholdLine } from './chemicals.ts';

/** One stored item as it stood when the stocktake was finished. */
export interface StocktakeLine {
  stock_id: string;
  chemical_id: string;
  name: string;
  section: string;
  location: string;
  container: string;
  size: number | null;
  unit: 'L' | 'kg';
  count: number | null;
  counted_at: string | null;
  class_label: string;
  class_confirmed: boolean;
  /** What the threshold check needs, so the sheet can show the totals as they were */
  dg: Pick<Chemical, 'dg_class' | 'subsidiary' | 'packing_group' | 'aerosol' | 'combustible'>;
}

export interface Stocktake {
  id: string;
  site_id: string;
  done_at: string;
  counted_by_name: string;
  lines: StocktakeLine[];
  notes: string;
  authorised_at: string | null;
  authorised_by_name: string;
  authorised_signature: string | null;
}

/** A product that hasn't had its DG class checked against the SDS yet. */
export function classToConfirm(c: Pick<Chemical, 'class_confirmed'>): boolean {
  return c.class_confirmed === false;
}

/** Copy every stored item at a site into stocktake lines. */
export function snapshotLines(stock: Stock[], chemById: Map<string, Chemical>): StocktakeLine[] {
  const lines: StocktakeLine[] = [];
  for (const s of stock) {
    const c = chemById.get(s.chemical_id);
    if (!c || !c.active) continue;
    lines.push({
      stock_id: s.id,
      chemical_id: c.id,
      name: c.name,
      section: c.section,
      location: s.location,
      container: s.container,
      size: s.container_size,
      unit: s.unit,
      count: s.count,
      counted_at: s.last_counted_at,
      class_label: classLabel(c),
      class_confirmed: !classToConfirm(c),
      dg: { dg_class: c.dg_class, subsidiary: c.subsidiary, packing_group: c.packing_group, aerosol: c.aerosol, combustible: c.combustible },
    });
  }
  return lines.sort((a, b) => a.name.localeCompare(b.name) || a.location.localeCompare(b.location));
}

/** Has this item been counted since the last finished stocktake? */
export function countedThisRound(s: Pick<Stock, 'last_counted_at'>, lastDoneAt: string | null): boolean {
  if (!s.last_counted_at) return false;
  return !lastDoneAt || s.last_counted_at > lastDoneAt;
}

export function roundProgress(stock: Stock[], lastDoneAt: string | null): { counted: number; total: number; left: Stock[] } {
  const left = stock.filter(s => !countedThisRound(s, lastDoneAt));
  return { counted: stock.length - left.length, total: stock.length, left };
}

// ---------------------------------------------------------------------------------
// The printed sheet
// ---------------------------------------------------------------------------------

export interface SheetGroup {
  size: number | null;
  unit: string;
  qty: number | null;
  subtotal: number | null;
  location: string;
}

export interface SheetRow {
  chemical_id: string;
  name: string;
  class_label: string;
  class_confirmed: boolean;
  locations: string[];
  groups: SheetGroup[];
  total: number;
  /** Some containers couldn't be added up (not counted, or size not set) */
  incomplete: boolean;
}

export interface SheetSection {
  letter: string;
  section: string;
  rows: SheetRow[];
  total: number;
}

export interface Sheet {
  sections: SheetSection[];
  /** Number of Cont | Qty | Subtotal column groups (at least 3, like the paper sheet) */
  columns: number;
  /** Sum of each column group across the sheet */
  columnTotals: number[];
  grandTotal: number;
  items: number;
  incomplete: number;
  toConfirm: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function buildSheet(lines: StocktakeLine[]): Sheet {
  const byChem = new Map<string, StocktakeLine[]>();
  for (const l of lines) byChem.set(l.chemical_id, [...(byChem.get(l.chemical_id) ?? []), l]);

  const rows: (SheetRow & { section: string })[] = [];
  for (const group of byChem.values()) {
    const first = group[0];
    const groups: SheetGroup[] = group
      .map(l => ({ size: l.size, unit: l.unit, qty: l.count, subtotal: amountOf({ count: l.count, container_size: l.size }), location: l.location }))
      .sort((a, b) => (b.size ?? -1) - (a.size ?? -1) || a.location.localeCompare(b.location));
    rows.push({
      section: first.section,
      chemical_id: first.chemical_id,
      name: first.name,
      class_label: first.class_label,
      class_confirmed: first.class_confirmed,
      locations: Array.from(new Set(group.map(l => l.location))),
      groups,
      total: round1(groups.reduce((n, g) => n + (g.subtotal ?? 0), 0)),
      incomplete: groups.some(g => g.subtotal === null),
    });
  }

  const order = [...SECTIONS, ...Array.from(new Set(rows.map(r => r.section))).filter(s => !SECTIONS.includes(s)).sort()];
  const sections: SheetSection[] = [];
  for (const section of order) {
    const here = rows.filter(r => r.section === section).sort((a, b) => a.name.localeCompare(b.name));
    if (!here.length) continue;
    sections.push({
      letter: String.fromCharCode(65 + sections.length),
      section,
      rows: here.map(({ section: _s, ...r }) => r),
      total: round1(here.reduce((n, r) => n + r.total, 0)),
    });
  }

  const columns = Math.max(3, ...rows.map(r => r.groups.length));
  const columnTotals = Array.from({ length: columns }, (_, i) => round1(rows.reduce((n, r) => n + (r.groups[i]?.subtotal ?? 0), 0)));
  return {
    sections,
    columns,
    columnTotals,
    grandTotal: round1(sections.reduce((n, s) => n + s.total, 0)),
    items: lines.length,
    incomplete: lines.filter(l => amountOf({ count: l.count, container_size: l.size }) === null).length,
    toConfirm: rows.filter(r => !r.class_confirmed).length,
  };
}

/** The placard and manifest check, worked out from the stocktake's own figures. */
export function sheetTotals(state: State, lines: StocktakeLine[]): ThresholdLine[] {
  const chems = new Map<string, Chemical>();
  const stock: Stock[] = [];
  for (const l of lines) {
    chems.set(l.chemical_id, { id: l.chemical_id, name: l.name, active: true, ...l.dg } as Chemical);
    stock.push({
      id: l.stock_id, chemical_id: l.chemical_id, site_id: '', location: l.location, container: l.container, container_size: l.size,
      unit: l.unit, count: l.count, max_count: null, last_counted_at: l.counted_at, last_counted_by_name: '',
    });
  }
  return siteTotals(state, stock, chems);
}

// ---------------------------------------------------------------------------------
// How often each site is counted
// ---------------------------------------------------------------------------------

export const FREQUENCIES: { days: number; label: string }[] = [
  { days: 30, label: 'Monthly' },
  { days: 60, label: 'Every 2 months' },
  { days: 90, label: 'Every 3 months' },
  { days: 180, label: 'Every 6 months' },
];

export function frequencyLabel(days: number): string {
  return FREQUENCIES.find(f => f.days === days)?.label ?? `Every ${days} days`;
}

/** Document reference printed on the sheet, e.g. STK-BUR-20261110. */
export function stocktakeRef(code: string, doneAt: string, day: (v: string) => string): string {
  return `STK-${code}-${day(doneAt).replace(/-/g, '')}`;
}
