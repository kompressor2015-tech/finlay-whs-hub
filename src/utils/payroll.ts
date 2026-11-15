/**
 * Payroll hours import. Payroll exports a file with a site (or cost centre), a date and hours.
 * We read it as CSV (save as CSV from Excel), add the hours up by site and month, and show a
 * preview. Nothing is saved until the person confirms, and saved hours are never overwritten silently.
 */

export interface ParsedCsv { headers: string[]; rows: string[][] }

export function detectDelimiter(text: string): string {
  const first = text.replace(/^﻿/, '').split(/\r?\n/).find(l => l.trim()) ?? '';
  const counts = [',', ';', '\t'].map(d => [d, first.split(d).length - 1] as const);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ',';
}

export function parseCsv(text: string): ParsedCsv {
  const src = text.replace(/^﻿/, '');
  const d = detectDelimiter(src);
  const out: string[][] = [];
  let row: string[] = []; let cur = ''; let q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"') { if (src[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c;
    } else if (c === '"') q = true;
    else if (c === d) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.some(x => x.trim() !== '')) out.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some(x => x.trim() !== '')) out.push(row);
  const [headers = [], ...rows] = out;
  return { headers: headers.map(h => h.trim()), rows: rows.map(r => r.map(x => x.trim())) };
}

export interface ColumnGuess { site: number; date: number; hours: number }

export function guessColumns(headers: string[]): ColumnGuess {
  const find = (re: RegExp) => headers.findIndex(h => re.test(h.toLowerCase()));
  return {
    site: find(/site|location|branch|cost ?cent|department|depot|project/),
    date: find(/month|period|date|week|pay ?period|worked/),
    hours: find(/hours|hrs|time worked|total/),
  };
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Turn a payroll date into "YYYY-MM", or null when it is not understood. */
export function parseMonth(raw: string): string | null {
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?/);
  if (m) return ym(+m[1], +m[2]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) { const y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; return ym(y, +m[2]); } // day/month/year
  m = s.match(/^(?:\d{1,2}\s+)?([A-Za-z]{3})[a-z]*[\s,-]+(\d{4})$/);
  if (m) { const i = MONTHS.indexOf(m[1].toLowerCase()); return i >= 0 ? ym(+m[2], i + 1) : null; }
  return null;
}
function ym(y: number, mo: number): string | null {
  return mo >= 1 && mo <= 12 && y >= 2000 && y <= 2100 ? `${y}-${String(mo).padStart(2, '0')}` : null;
}

export function parseHours(raw: string): number | null {
  const s = raw.replace(/[,\s]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return n >= 0 ? n : null;
}

export interface SiteRef { id: string; name: string; code: string }

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Match a payroll site name to one of ours: by code, name, or either one inside the other. */
export function matchSite(raw: string, sites: SiteRef[], aliases: Record<string, string> = {}): SiteRef | null {
  const k = key(raw);
  if (!k) return null;
  if (aliases[k]) return sites.find(s => s.id === aliases[k]) ?? null;
  const exact = sites.find(s => key(s.code) === k || key(s.name) === k);
  if (exact) return exact;
  const loose = sites.filter(s => key(s.name).length >= 4 && (k.includes(key(s.name)) || key(s.name).includes(k)) && k.length >= 4);
  return loose.length === 1 ? loose[0] : null;
}

export interface ImportLine { site: SiteRef; month: string; hours: number }
export interface ImportPreview {
  lines: ImportLine[];
  unknownSites: { name: string; rows: number }[];
  badRows: { row: number; why: string }[];
  /** hours that differ from what is already saved */
  replaces: { site: SiteRef; month: string; old: number; next: number }[];
  /** more than double or less than half of the site's usual month */
  outliers: { site: SiteRef; month: string; hours: number; typical: number }[];
  /** sites we expected hours for in the latest month in the file */
  gaps: { site: SiteRef; month: string }[];
  rowsRead: number;
}

export interface ExistingHours { site_id: string; month: string; hours: number }

export function buildPreview(
  parsed: ParsedCsv, cols: ColumnGuess, sites: SiteRef[], existing: ExistingHours[], aliases: Record<string, string> = {},
): ImportPreview {
  const sums = new Map<string, ImportLine>();
  const unknown = new Map<string, number>();
  const badRows: ImportPreview['badRows'] = [];
  parsed.rows.forEach((r, i) => {
    const n = i + 2;
    const rawSite = r[cols.site] ?? ''; const month = parseMonth(r[cols.date] ?? ''); const hours = parseHours(r[cols.hours] ?? '');
    if (!rawSite && !(r[cols.date] ?? '') && !(r[cols.hours] ?? '')) return;
    if (!month) { badRows.push({ row: n, why: `Date "${r[cols.date] ?? ''}" not understood` }); return; }
    if (hours === null) { badRows.push({ row: n, why: `Hours "${r[cols.hours] ?? ''}" not a number` }); return; }
    const site = matchSite(rawSite, sites, aliases);
    if (!site) { unknown.set(rawSite || '(blank)', (unknown.get(rawSite || '(blank)') ?? 0) + 1); return; }
    const k = `${site.id}|${month}`;
    const cur = sums.get(k);
    if (cur) cur.hours = Math.round((cur.hours + hours) * 100) / 100; else sums.set(k, { site, month, hours: Math.round(hours * 100) / 100 });
  });
  const lines = Array.from(sums.values()).sort((a, b) => a.month.localeCompare(b.month) || a.site.name.localeCompare(b.site.name));
  const replaces: ImportPreview['replaces'] = [];
  const outliers: ImportPreview['outliers'] = [];
  for (const l of lines) {
    const old = existing.find(e => e.site_id === l.site.id && e.month.slice(0, 7) === l.month);
    if (old && Math.abs(Number(old.hours) - l.hours) > 0.005) replaces.push({ site: l.site, month: l.month, old: Number(old.hours), next: l.hours });
    const others = existing.filter(e => e.site_id === l.site.id && e.month.slice(0, 7) !== l.month && Number(e.hours) > 0).map(e => Number(e.hours));
    if (others.length >= 3) {
      const typical = others.reduce((a, b) => a + b, 0) / others.length;
      if (l.hours > typical * 2 || l.hours < typical / 2) outliers.push({ site: l.site, month: l.month, hours: l.hours, typical: Math.round(typical) });
    }
  }
  const latest = lines.length ? lines[lines.length - 1].month : null;
  const seen = new Set(lines.filter(l => l.month === latest).map(l => l.site.id));
  const active = new Set(existing.filter(e => Number(e.hours) > 0).map(e => e.site_id));
  const gaps = latest ? sites.filter(s => active.has(s.id) && !seen.has(s.id)).map(s => ({ site: s, month: latest })) : [];
  return { lines, unknownSites: Array.from(unknown, ([name, rows]) => ({ name, rows })), badRows, replaces, outliers, gaps, rowsRead: parsed.rows.length };
}
