/**
 * Forgiving search: every word typed must appear somewhere in the record,
 * ignoring case, spaces and dashes ("inc 42", "INC-0042" and "2417" all work).
 */

function squash(s: string): string {
  return s.toLowerCase().replace(/[\s\-_/.]+/g, '');
}

export function looseMatch(query: string, fields: (string | null | undefined)[]): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = fields.filter(Boolean).join(' ').toLowerCase();
  const squashed = squash(hay);
  return words.every(w => hay.includes(w) || squashed.includes(squash(w)));
}
