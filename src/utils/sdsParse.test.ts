import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseSdsText, reviewSds, patchFrom, combustibleFor } from './sdsParse.ts';
import type { Chemical } from './chemicals.ts';

const fx = (n: string) => readFileSync(new URL(`./sdsFixtures/${n}.txt`, import.meta.url), 'utf8');
/** pdf.js gives text in a different layout, so every fixture is also tried with all line breaks turned into spaces. */
const both = (n: string) => [fx(n), fx(n).replace(/\n/g, ' ')];

function chem(over: Partial<Chemical> = {}): Chemical {
  return { id: 'c', name: 'Test', manufacturer: '', dg_class: null, subsidiary: '', packing_group: null, un_number: null, aerosol: false, combustible: null, ghs_hazardous: null, hazard_summary: '', h_statements: [], ppe: [], first_aid: '', spill: '', supplier_phone: '', section: '', class_confirmed: false, notes: '', active: true, ...over };
}

test('Dulux Urethane Thinner (Australian)', () => {
  for (const t of both('dulux-urethane-thinner')) {
    const f = parseSdsText(t);
    assert.equal(f.un, '1263');
    assert.equal(f.dgClass, '3');
    assert.equal(f.packingGroup, 'III');
    assert.equal(f.issueDate, '2024-08-29');
    assert.deepEqual(f.hStatements, ['H225', 'H304', 'H315', 'H319', 'H335', 'H336']);
    assert.equal(f.australian, true);
    assert.equal(f.overseas, false);
    assert.equal(f.phone.replace(/\s/g, '').startsWith('1800220770'), true);
  }
});

test('BP Unleaded 91', () => {
  for (const t of both('bp-unleaded')) {
    const f = parseSdsText(t);
    assert.equal(f.un, '1203');
    assert.equal(f.dgClass, '3');
    assert.equal(f.packingGroup, 'II');
    assert.equal(f.issueDate, '2025-01-13');
    assert.ok(f.hStatements.includes('H350') && f.hStatements.includes('H340'));
    assert.deepEqual(f.flashPoint, { value: -40, bound: '<' });
  }
});

test('Wattyl aerosol (table layout, class has no label)', () => {
  for (const t of both('wattyl-aerosol')) {
    const f = parseSdsText(t);
    assert.equal(f.un, '1950');
    assert.equal(f.dgClass, '2.1');
    assert.equal(f.packingGroup, null);
    assert.equal(f.aerosol, true);
    assert.ok(f.hStatements.includes('H222') && f.hStatements.includes('H360'));
    assert.equal(f.issueDate, '2024-10-29');
  }
});

test('Loctite 545 (Australian, not dangerous goods)', () => {
  for (const t of both('loctite-545-au')) {
    const f = parseSdsText(t);
    assert.equal(f.un, null);
    assert.equal(f.dgClass, null);
    assert.equal(f.notDg, true);
    assert.equal(f.issueDate, '2022-12-12');
    assert.deepEqual(f.hStatements, ['H315', 'H317', 'H319', 'H335', 'H402']);
    assert.deepEqual(f.flashPoint, { value: 93, bound: '>' });
  }
});

test('Loctite 638 (UK, not DG, flagged as overseas)', () => {
  for (const t of both('loctite-638-uk')) {
    const f = parseSdsText(t);
    assert.equal(f.notDg, true);
    assert.equal(f.overseas, true);
    assert.equal(f.issueDate, '2023-08-01');
    assert.ok(f.hStatements.includes('H318'));
  }
});

test('Australis 2010 SDS is read but flagged as old', () => {
  for (const t of both('australis-2010')) {
    const f = parseSdsText(t);
    assert.equal(f.un, '1263');
    assert.equal(f.dgClass, '3');
    assert.equal(f.packingGroup, 'III');
    assert.equal(f.issueDate, '2010-10-07');
    const r = reviewSds(chem({ name: 'Colourtrend Australis Oil Based Enamel' }), f, '2026-11-17');
    assert.ok(r.warnings.some(w => /over 5 years/.test(w)));
    assert.equal(r.trustworthy, false);
    assert.equal(r.proposals.find(p => p.key === 'confirmed')?.apply, false);
  }
});

test('Aircolor (EU) uses the latest date and is flagged overseas', () => {
  for (const t of both('aircolor-eu')) {
    const f = parseSdsText(t);
    assert.equal(f.un, '1950');
    assert.equal(f.dgClass, '2.1');
    assert.equal(f.issueDate, '2026-09-25');
    assert.equal(f.overseas, true);
  }
});

test('review proposes changes only where they differ, and merges ticked ones', () => {
  const f = parseSdsText(fx('dulux-urethane-thinner'));
  const c = chem({ name: 'Dulux Urethane Thinner', dg_class: '3', un_number: '1263', notes: 'Found in the booth. Upload the SDS to confirm the class.' });
  const r = reviewSds(c, f, '2026-11-17');
  const keys = r.proposals.map(p => p.key);
  assert.ok(!keys.includes('dg') && !keys.includes('un'), 'unchanged fields are not proposed');
  assert.ok(keys.includes('pg') && keys.includes('h') && keys.includes('note') && keys.includes('confirmed'));
  const patch = patchFrom(r.proposals);
  assert.equal(patch.packing_group, 'III');
  assert.equal(patch.class_confirmed, true);
  assert.equal(patch.notes, 'Found in the booth.');
  r.proposals.find(p => p.key === 'pg')!.apply = false;
  assert.equal(patchFrom(r.proposals).packing_group, undefined);
});

test('a name mismatch is flagged and stops auto-confirming the class', () => {
  const f = parseSdsText(fx('bp-unleaded'));
  const r = reviewSds(chem({ name: 'Paint Remover' }), f, '2026-11-17');
  assert.ok(r.warnings.some(w => /does not look like/.test(w)));
  assert.equal(r.proposals.find(p => p.key === 'confirmed')?.apply, false);
});

test('combustible class from the flash point', () => {
  const base = parseSdsText(fx('loctite-545-au'));
  assert.equal(combustibleFor({ ...base, flashPoint: { value: 100, bound: '' } }), 'C1');
  assert.equal(combustibleFor({ ...base, flashPoint: { value: 200, bound: '' } }), 'C2');
  assert.equal(combustibleFor({ ...base, flashPoint: { value: 93, bound: '>' } }), null);
  assert.equal(combustibleFor({ ...base, dgClass: '3', flashPoint: { value: 20, bound: '' } }), null);
});
