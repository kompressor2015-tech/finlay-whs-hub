import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerRows, commencedOn } from './swmsRegister.ts';
import type { Swms, SwmsReview, SwmsVersion } from './swms.ts';

const s = (o: Partial<Swms> = {}): Swms => ({ id: 's1', ref: 'SWMS-003', swms_number: '001', risk_register_ref: 'FSC76', title: 'TTS620T service', site_id: null, owner_name: '', review_months: 12, reviewed_on: null, reviewed_by_name: '', document_id: null, status: 'active', created_by_name: '', created_at: '2026-11-17T00:00:00Z', updated_at: '', ...o });
const v = (o: Partial<SwmsVersion> = {}): SwmsVersion => ({ id: 'v1', swms_id: 's1', version: 1, status: 'approved', approved_at: '2026-01-16T00:00:00Z', expected_start: null, ...o }) as SwmsVersion;
const r = (d: string, id = d): SwmsReview => ({ id, swms_id: 's1', reviewed_on: d, reviewed_by_name: '', note: '', created_at: '' });

test('commenced uses expected start, then first approval, then creation', () => {
  assert.equal(commencedOn(s(), [v({ expected_start: '2026-01-15' })]), '2026-01-15');
  assert.equal(commencedOn(s(), [v()]), '2026-01-16');
  assert.equal(commencedOn(s(), []), '2026-11-17');
});

test('a row has the number, risk ref, revision and the latest four review dates, oldest first', () => {
  const [row] = registerRows([s()], [v(), v({ id: 'v2', version: 2, status: 'draft' })], ['2026-01-16', '2026-04-01', '2026-07-01', '2026-10-01', '2026-11-01'].map(d => r(d)));
  assert.equal(row.no, '001');
  assert.equal(row.riskRef, 'FSC76');
  assert.equal(row.revision, '1.0');
  assert.deepEqual(row.reviews, ['2026-04-01', '2026-07-01', '2026-10-01', '2026-11-01']);
});

test('retired SWMS are left off and rows sort by number', () => {
  const rows = registerRows([s({ id: 'a', swms_number: '002' }), s({ id: 'b', swms_number: '001' }), s({ id: 'c', status: 'retired' })], [], []);
  assert.deepEqual(rows.map(x => x.no), ['001', '002']);
});
