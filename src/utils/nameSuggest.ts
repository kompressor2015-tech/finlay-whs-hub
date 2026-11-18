/** Suggesting worker names while someone types. Anything typed is still allowed. */

export interface NameOption { id: string; name: string; position?: string }

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

/** The part of the text being typed now: after the last comma, semicolon or "&" (several names allowed), or all of it. */
export function currentSegment(text: string, multi: boolean): { start: number; query: string } {
  if (!multi) return { start: 0, query: text.trim() };
  const m = /[,;&][^,;&]*$/.exec(text);
  const start = m ? m.index + 1 : 0;
  return { start, query: text.slice(start).trim() };
}

/** Names containing every typed word (in any order, so "smith jo" finds John SMITH), starting-with first. */
export function suggest(options: NameOption[], query: string, limit = 8): NameOption[] {
  const words = norm(query).split(' ').filter(Boolean);
  if (words.length === 0) return [];
  const scored: { o: NameOption; rank: number }[] = [];
  for (const o of options) {
    const n = norm(o.name);
    const parts = n.split(' ');
    if (!words.every(w => parts.some(p => p.startsWith(w)) || n.includes(w))) continue;
    const rank = n.startsWith(words.join(' ')) ? 0 : words.every(w => parts.some(p => p.startsWith(w))) ? 1 : 2;
    scored.push({ o, rank });
  }
  return scored.sort((a, b) => a.rank - b.rank || a.o.name.localeCompare(b.o.name)).slice(0, limit).map(x => x.o);
}

/** Put a chosen name in place of the segment being typed. */
export function applyName(text: string, name: string, multi: boolean): string {
  if (!multi) return name;
  const { start } = currentSegment(text, true);
  const before = text.slice(0, start).trimEnd();
  return `${before}${before ? ' ' : ''}${name}`;
}

/** The one person whose name matches exactly (ignoring case and punctuation), or null. */
export function exactMatch(options: NameOption[], text: string): NameOption | null {
  const t = norm(text);
  if (!t) return null;
  const hits = options.filter(o => norm(o.name) === t);
  return hits.length === 1 ? hits[0] : null;
}
