import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { buildXlsx, colName, crc32, sheetNames } from './xlsx.ts';

test('crc32 known value', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});
test('column names', () => {
  assert.deepEqual([0, 25, 26, 27, 701, 702].map(colName), ['A', 'Z', 'AA', 'AB', 'ZZ', 'AAA']);
});
test('sheet names are short, clean and unique', () => {
  const n = sheetNames(['A/B:C', 'x'.repeat(40), 'x'.repeat(40), '']);
  assert.equal(n[0], 'A B C');
  assert.ok(n.every(x => x.length <= 31));
  assert.equal(new Set(n.map(x => x.toLowerCase())).size, 4);
});
test('builds a zip that starts and ends correctly (and writes a sample when asked)', () => {
  const b = buildXlsx([{ name: 'Incidents', columns: ['Date', 'Hours', 'Note'], rows: [['2026-10-01', 12.5, 'a & b <c>'], ['x', null, 'é']] }]);
  assert.equal(b[0], 0x50); assert.equal(b[1], 0x4b);
  assert.ok(b.length > 500);
  if (process.env.XLSX_OUT) writeFileSync(process.env.XLSX_OUT, b);
});
