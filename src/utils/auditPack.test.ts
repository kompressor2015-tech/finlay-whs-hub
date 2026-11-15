import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPack, coverSheet, SECTIONS } from './auditPack.ts';

const base = { from: '2026-10-01', to: '2026-10-31', site: null, siteNames: { s1: 'Burpengary' } };
const inc = (o: object) => ({ id: 'i', ref: 'INC-1', type: 'injury', occurred_at: '2026-10-05T08:00:00+10:00', site_id: 's1', site_name: '', people: 'A', description: 'x', status: 'new', notifiable: false, ...o }) as never;

test('incident register keeps the date range and site', () => {
  const sheets = buildPack(['incidents'], { ...base, incidents: [inc({}), inc({ id: 'j', occurred_at: '2026-09-30T08:00:00+10:00' }), inc({ id: 'k', site_id: 's2' })] });
  assert.equal(sheets[0].rows.length, 2);
  const one = buildPack(['incidents'], { ...base, site: { id: 's1', name: 'Burpengary' }, incidents: [inc({}), inc({ id: 'k', site_id: 's2', site_name: 'Somerton' })] });
  assert.equal(one[0].rows.length, 1);
});
test('swms sign-ons only for the period', () => {
  const sheets = buildPack(['swms'], { ...base, swms: {
    swms: [{ id: 'w', ref: 'SWMS-1', swms_number: '099', title: 'T', site_id: null }] as never,
    versions: [{ id: 'v', swms_id: 'w', version: 1, status: 'approved' }] as never,
    signOns: [{ id: 'o1', swms_id: 'w', version_id: 'v', signer_name: 'A', company: 'F', signed_at: '2026-10-02T08:00:00+10:00', method: 'self' }, { id: 'o2', swms_id: 'w', version_id: 'v', signer_name: 'B', company: 'F', signed_at: '2026-08-02T08:00:00+10:00', method: 'self' }] as never,
  } });
  assert.equal(sheets.length, 2);
  assert.equal(sheets[0].rows[0][6], 2);
  assert.equal(sheets[1].rows.length, 1);
});
test('chemicals show the newest SDS date', () => {
  const s = buildPack(['chemicals'], { ...base, chemicals: { chemicals: [{ id: 'c', name: 'Diesel', active: true, class_confirmed: true }] as never, sds: [{ chemical_id: 'c', issue_date: '2024-01-01' }, { chemical_id: 'c', issue_date: '2025-06-01' }] as never } });
  assert.equal(s[0].rows[0][5], '01/06/2025');
});
test('cover lists the sheets, claims are marked officer only', () => {
  const s = buildPack(['hazards'], { ...base, hazards: [] });
  assert.equal(coverSheet(base, s, 'Sam').rows.at(-1)![0], 'Hazards');
  assert.equal(SECTIONS.find(x => x.id === 'claims')!.officerOnly, true);
});
