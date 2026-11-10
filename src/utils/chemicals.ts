/**
 * Chemicals, SDS and storage: shapes, and the compliance rules.
 *
 * Threshold figures (checked 10/11/2026):
 *  - QLD and NSW: WHS Regulation Schedule 11, placard and manifest quantities
 *    (safeworkaustralia.gov.au, "Schedule 11 Placarding and Manifest Quantities Table").
 *  - VIC: Dangerous Goods (Storage and Handling) Regulations 2022, Schedule 2 manifest
 *    quantities (worksafe.vic.gov.au, "Manifest quantities of dangerous goods").
 *    Victorian placard quantities are not on that page, so they are not shown here.
 * Gases are counted in litres of water capacity of the cylinders. Unknown packing groups
 * are treated as packing group I (the strictest) until the SDS is checked.
 */

import { addDays, brisbaneDay, daysUntil } from './dates.ts';
import type { Tone } from './attention.ts';

export type State = 'QLD' | 'NSW' | 'VIC';
export type DgClass = '2.1' | '2.2' | '2.3' | '3' | '4.1' | '4.2' | '4.3' | '5.1' | '5.2' | '6.1' | '8' | '9';
export type PackingGroup = 'I' | 'II' | 'III';

export interface Site {
  id: string;
  name: string;
  state: State;
  code: string;
  stocktake_days: number;
}

export interface Chemical {
  id: string;
  name: string;
  manufacturer: string;
  dg_class: DgClass | null;
  subsidiary: string;
  packing_group: PackingGroup | null;
  un_number: string | null;
  aerosol: boolean;
  combustible: 'C1' | 'C2' | null;
  ghs_hazardous: boolean | null;
  hazard_summary: string;
  h_statements: string[];
  ppe: string[];
  first_aid: string;
  spill: string;
  supplier_phone: string;
  section: string;
  notes: string;
  active: boolean;
}

export interface Stock {
  id: string;
  chemical_id: string;
  site_id: string;
  location: string;
  container: string;
  container_size: number | null;
  unit: 'L' | 'kg';
  count: number | null;
  max_count: number | null;
  last_counted_at: string | null;
  last_counted_by_name: string;
}

export interface Sds {
  id: string;
  chemical_id: string;
  file_path: string;
  file_name: string;
  issue_date: string;
  uploaded_at: string;
  uploaded_by_name: string;
}

export const SECTIONS = ['Gases, fuels & aerosols', 'Paints, coatings & bonding', 'Chemicals, adhesives & reagents', 'Oils, hydraulic fluids & greases'];

// ---------------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------------

export function classLabel(c: Pick<Chemical, 'dg_class' | 'subsidiary' | 'packing_group' | 'aerosol' | 'combustible'>): string {
  if (c.dg_class) {
    const base = c.aerosol ? `Class ${c.dg_class} Aerosol` : `Class ${c.dg_class}`;
    return [base, c.subsidiary ? `sub ${c.subsidiary}` : '', c.packing_group ? `PG ${c.packing_group}` : ''].filter(Boolean).join(' · ');
  }
  if (c.combustible) return `${c.combustible} Combustible`;
  return 'Non-DG';
}

export function classTone(c: Pick<Chemical, 'dg_class' | 'combustible'>): Tone {
  if (c.dg_class) return 'red';
  if (c.combustible === 'C1') return 'amber';
  if (c.combustible === 'C2') return 'grey';
  return 'green';
}

/** How much is stored at one location, or null if not counted / container size unknown. */
export function amountOf(s: Pick<Stock, 'count' | 'container_size'>): number | null {
  if (s.count === null || s.count === undefined || !s.container_size) return null;
  return Math.round(s.count * s.container_size * 100) / 100;
}

export function formatAmount(n: number | null, unit: string): string {
  if (n === null) return '—';
  return `${n.toLocaleString('en-AU', { maximumFractionDigits: 1 })} ${unit}`;
}

export function stateRules(state: State): { register: string; thresholds: string; regulator: string } {
  if (state === 'VIC') {
    return {
      register: 'OHS Regulations 2017 (Vic) and Dangerous Goods (Storage and Handling) Regulations 2022',
      thresholds: 'Dangerous Goods (Storage and Handling) Regulations 2022, Schedule 2 manifest quantities',
      regulator: 'WorkSafe Victoria',
    };
  }
  return {
    register: `Work Health and Safety Regulation (${state}) r.346`,
    thresholds: 'Schedule 11 placard and manifest quantities',
    regulator: state === 'QLD' ? 'Workplace Health and Safety Queensland' : 'SafeWork NSW',
  };
}

// ---------------------------------------------------------------------------------
// SDS age (an SDS must be reviewed at least every 5 years)
// ---------------------------------------------------------------------------------

export type SdsState = 'missing' | 'expired' | 'due_soon' | 'ok';

export function sdsValidUntil(issueDate: string): string {
  const [y, m, d] = issueDate.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y + 5, m - 1, d)).toISOString().slice(0, 10);
}

/** The newest SDS for a chemical (by issue date). */
export function currentSds(list: Sds[]): Sds | null {
  return [...list].sort((a, b) => b.issue_date.localeCompare(a.issue_date))[0] ?? null;
}

export function sdsState(sds: Pick<Sds, 'issue_date'> | null, now: Date = new Date()): SdsState {
  if (!sds) return 'missing';
  const left = daysUntil(sdsValidUntil(sds.issue_date), now);
  if (left < 0) return 'expired';
  if (left <= 90) return 'due_soon';
  return 'ok';
}

export function sdsPill(sds: Pick<Sds, 'issue_date'> | null, now: Date = new Date()): { label: string; tone: Tone } {
  const s = sdsState(sds, now);
  if (s === 'missing' || !sds) return { label: 'No SDS', tone: 'red' };
  const until = sdsValidUntil(sds.issue_date);
  const mmyyyy = `${until.slice(5, 7)}/${until.slice(0, 4)}`;
  if (s === 'expired') return { label: 'Over 5 years old', tone: 'red' };
  if (s === 'due_soon') return { label: `Review by ${mmyyyy}`, tone: 'amber' };
  return { label: `Valid to ${mmyyyy}`, tone: 'green' };
}

// ---------------------------------------------------------------------------------
// Placard and manifest quantities
// ---------------------------------------------------------------------------------

interface Rule {
  key: string;
  label: string;
  placard: number | null;
  manifest: number;
  unit: string;
  /** Which stored items count towards this line */
  match: (c: Chemical) => boolean;
  note?: string;
}

const PG_LIMITS: Record<PackingGroup, { placard: number; manifest: number }> = {
  I: { placard: 50, manifest: 500 },
  II: { placard: 250, manifest: 2500 },
  III: { placard: 1000, manifest: 10000 },
};

/** Packing group used for thresholds: unknown counts as the strictest (I). */
export function effectivePg(c: Pick<Chemical, 'packing_group'>): PackingGroup {
  return c.packing_group ?? 'I';
}

const isGas = (c: Chemical, cls: DgClass) => c.dg_class === cls && !c.aerosol;

function classRules(cls: DgClass, name: string, vic: boolean): Rule[] {
  const rules: Rule[] = (['I', 'II', 'III'] as PackingGroup[]).map(pg => ({
    key: `${cls}-${pg}`,
    label: `Class ${cls} ${name}, PG ${pg}`,
    placard: vic ? null : PG_LIMITS[pg].placard,
    manifest: PG_LIMITS[pg].manifest,
    unit: 'kg or L',
    match: (c: Chemical) => c.dg_class === cls && !c.aerosol && effectivePg(c) === pg,
  }));
  rules.push({
    key: `${cls}-all`,
    label: `Class ${cls} ${name}, all packing groups together`,
    placard: vic ? null : 1000,
    manifest: 10000,
    unit: 'kg or L',
    match: (c: Chemical) => c.dg_class === cls && !c.aerosol,
  });
  return rules;
}

export function rulesFor(state: State): Rule[] {
  const vic = state === 'VIC';
  const rules: Rule[] = [
    { key: '2.1', label: 'Class 2.1 Flammable gas (cylinders)', placard: vic ? null : 200, manifest: 5000, unit: 'L water capacity', match: c => isGas(c, '2.1') },
    { key: '2.2', label: 'Class 2.2 Non-flammable gas (incl. sub 5.1)', placard: vic ? null : 1000, manifest: 10000, unit: 'L water capacity', match: c => isGas(c, '2.2') },
    { key: '2.3', label: 'Class 2.3 Toxic gas', placard: vic ? null : 50, manifest: 500, unit: 'L water capacity', match: c => isGas(c, '2.3') },
    { key: 'aerosol', label: 'Aerosols', placard: vic ? null : 5000, manifest: 10000, unit: 'L', match: c => c.aerosol },
    ...classRules('3', 'Flammable liquid', vic),
    ...classRules('4.1', 'Flammable solid', vic),
    ...classRules('4.2', 'Spontaneously combustible', vic),
    ...classRules('4.3', 'Dangerous when wet', vic),
    ...classRules('5.1', 'Oxidiser', vic),
    ...classRules('6.1', 'Toxic', vic),
    ...classRules('8', 'Corrosive', vic),
    { key: '5.2', label: 'Class 5.2 Organic peroxide', placard: vic ? null : 250, manifest: 2500, unit: 'kg or L', match: c => c.dg_class === '5.2', note: 'Types C to F assumed' },
  ];
  if (vic) {
    rules.push(
      { key: '9', label: 'Class 9 Miscellaneous', placard: null, manifest: 10000, unit: 'kg or L', match: c => c.dg_class === '9' },
      { key: 'mixed', label: 'All dangerous goods together (mixed classes)', placard: null, manifest: 10000, unit: 'kg or L', match: c => c.dg_class !== null },
      { key: 'C1', label: 'C1 Combustible liquid (isolated from other DG)', placard: null, manifest: 100000, unit: 'L', match: c => c.dg_class === null && c.combustible === 'C1', note: 'If kept with other dangerous goods it counts towards the 10,000 kg or L mixed total' },
    );
  } else {
    rules.push({ key: 'C1', label: 'Flammable liquid category 4 / C1 (e.g. diesel)', placard: 10000, manifest: 100000, unit: 'L', match: c => c.dg_class === null && c.combustible === 'C1', note: 'In a spill compound with Class 3 liquids it counts as the Class 3 category' });
  }
  return rules;
}

export type ThresholdStatus = 'over' | 'close' | 'ok';

export interface ThresholdLine {
  key: string;
  label: string;
  unit: string;
  placard: number | null;
  manifest: number;
  total: number;
  products: number;
  /** Stored items that couldn't be added up (not counted, or container size missing) */
  unknown: number;
  /** Items whose packing group is unknown and were treated as PG I */
  assumedPg: number;
  pctManifest: number;
  pctPlacard: number | null;
  status: ThresholdStatus;
  overPlacard: boolean;
  note?: string;
}

/** The share of the manifest quantity at which the app starts warning. */
export const WARN_AT = 0.8;

export function siteTotals(state: State, stock: Stock[], chemicals: Map<string, Chemical>): ThresholdLine[] {
  const lines: ThresholdLine[] = [];
  for (const rule of rulesFor(state)) {
    let total = 0;
    let unknown = 0;
    let assumedPg = 0;
    const products = new Set<string>();
    for (const s of stock) {
      const c = chemicals.get(s.chemical_id);
      if (!c || !c.active || !rule.match(c)) continue;
      products.add(c.id);
      if (c.dg_class && !c.aerosol && !c.dg_class.startsWith('2') && c.dg_class !== '9' && !c.packing_group) assumedPg += 1;
      const a = amountOf(s);
      if (a === null) unknown += 1;
      else total += a;
    }
    if (!products.size) continue;
    const pctManifest = total / rule.manifest;
    const pctPlacard = rule.placard ? total / rule.placard : null;
    lines.push({
      key: rule.key,
      label: rule.label,
      unit: rule.unit,
      placard: rule.placard,
      manifest: rule.manifest,
      total: Math.round(total * 10) / 10,
      products: products.size,
      unknown,
      assumedPg,
      pctManifest,
      pctPlacard,
      status: pctManifest >= 1 ? 'over' : pctManifest >= WARN_AT ? 'close' : 'ok',
      overPlacard: pctPlacard !== null && pctPlacard >= 1,
      note: rule.note,
    });
  }
  return lines;
}

/** The single line closest to its manifest quantity (for summaries). */
export function worstLine(lines: ThresholdLine[]): ThresholdLine | null {
  return [...lines].sort((a, b) => b.pctManifest - a.pctManifest)[0] ?? null;
}

// ---------------------------------------------------------------------------------
// Storage segregation (general rules from the DG class; the SDS section 7 has the final word)
// ---------------------------------------------------------------------------------

export type Segregation = { verdict: 'apart' | 'check' | 'ok'; reason: string };

const FLAMMABLE = ['2.1', '3', '4.1', '4.2', '4.3'];

function isOxidiser(c: Chemical): boolean {
  return c.dg_class === '5.1' || c.dg_class === '5.2' || c.subsidiary.split(/[ ,]+/).includes('5.1');
}
function isFlammable(c: Chemical): boolean {
  return (c.dg_class !== null && FLAMMABLE.includes(c.dg_class)) || c.combustible === 'C1';
}

export function segregation(a: Chemical, b: Chemical): Segregation {
  if (a.id === b.id) return { verdict: 'ok', reason: 'Same product.' };
  if ((isOxidiser(a) && isFlammable(b)) || (isOxidiser(b) && isFlammable(a))) {
    return { verdict: 'apart', reason: 'Keep apart: an oxidiser makes a flammable or combustible fire far worse.' };
  }
  const pair = (x: string, y: string) => (a.dg_class === x && b.dg_class === y) || (a.dg_class === y && b.dg_class === x);
  if (pair('2.1', '2.3')) return { verdict: 'apart', reason: 'Keep apart: flammable gas and toxic gas.' };
  if (pair('4.3', '8')) return { verdict: 'apart', reason: 'Keep apart: dangerous-when-wet goods react with corrosive liquids.' };
  if (a.dg_class === '4.3' || b.dg_class === '4.3') return { verdict: 'check', reason: 'Dangerous when wet: keep dry and check the SDS for the other product.' };
  if (a.dg_class === '8' && b.dg_class === '8') return { verdict: 'check', reason: 'Two corrosives: acids and alkalis must be kept apart. Check both SDS.' };
  if ((a.dg_class === '2.1' && b.dg_class === '2.2') || (a.dg_class === '2.2' && b.dg_class === '2.1')) {
    return { verdict: 'check', reason: 'Gas cylinders: keep flammable gas cylinders separated as the cage layout requires (check AS 4332).' };
  }
  if (a.dg_class === null && b.dg_class === null) return { verdict: 'ok', reason: 'Neither is a dangerous good.' };
  return { verdict: 'ok', reason: 'No general segregation rule between these classes. Check section 7 of each SDS.' };
}

// ---------------------------------------------------------------------------------
// Stocktakes
// ---------------------------------------------------------------------------------

export function stocktakeDue(site: Pick<Site, 'stocktake_days'>, stock: Pick<Stock, 'last_counted_at'>[], now: Date = new Date()): {
  due: string | null;
  state: 'never' | 'overdue' | 'due_soon' | 'ok';
  counted: number;
  total: number;
} {
  const counted = stock.filter(s => s.last_counted_at).length;
  if (!stock.length) return { due: null, state: 'ok', counted, total: 0 };
  // Until every item at the site has been counted once, the first stocktake is still to do.
  if (counted < stock.length) return { due: null, state: 'never', counted, total: stock.length };
  const oldest = stock.map(s => s.last_counted_at as string).sort()[0];
  const due = addDays(brisbaneDay(oldest), site.stocktake_days);
  const d = daysUntil(due, now);
  return { due, state: d < 0 ? 'overdue' : d <= 14 ? 'due_soon' : 'ok', counted, total: stock.length };
}

// ---------------------------------------------------------------------------------
// Bulk SDS upload: match a PDF file name to a product, and guess the issue date
// ---------------------------------------------------------------------------------

const STOP = new Set(['sds', 'msds', 'safety', 'data', 'sheet', 'sheets', 'ghs', 'aus', 'au', 'the', 'and', 'of', 'pdf', 'version', 'revision', 'issue', 'new', 'copy']);

export function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/\.pdf$/i, '')
    .replace(/[äöü]/g, m => ({ ä: 'a', ö: 'o', ü: 'u' })[m] ?? m)
    .replace(/(\d+)\s*w\s*-?\s*(\d+)/g, '$1w$2')
    .split(/[^a-z0-9]+/)
    // Single letters are kept: "Part A" and "Part B" are different products.
    .filter(t => t && !STOP.has(t));
}

/** Best matching product for a file name, with a score from 0 to 1 (0.5 or more is a likely match). */
export function matchSdsFile(fileName: string, chemicals: Pick<Chemical, 'id' | 'name'>[]): { id: string; score: number } | null {
  const ft = new Set(tokens(fileName));
  if (!ft.size) return null;
  let best: { id: string; score: number } | null = null;
  for (const c of chemicals) {
    const ct = tokens(c.name);
    if (!ct.length) continue;
    const shared = ct.filter(t => ft.has(t)).length;
    // Share of the product's words found in the file name, nudged by the share of the file's words used
    const score = (shared / ct.length) * 0.8 + (shared / ft.size) * 0.2;
    if (!best || score > best.score) best = { id: c.id, score: Math.round(score * 100) / 100 };
  }
  return best && best.score > 0 ? best : null;
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** A likely issue date from a file name such as "…30.05.2015", "…July-2025" or "…2023". Returns YYYY-MM-DD or null. */
export function issueDateFromName(fileName: string): string | null {
  const n = fileName.toLowerCase();
  let m = /(\d{1,2})[._-](\d{1,2})[._-](20\d{2})/.exec(n);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = /(20\d{2})[._-](\d{2})[._-](\d{2})/.exec(n);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /(20\d{2})[._-](\d{2})(?!\d)/.exec(n);
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) return `${m[1]}-${m[2]}-01`;
  const month = MONTHS.findIndex(mo => n.includes(mo));
  m = /(20\d{2})/.exec(n);
  if (m && month >= 0) return `${m[1]}-${String(month + 1).padStart(2, '0')}-01`;
  if (m) return `${m[1]}-01-01`;
  return null;
}
