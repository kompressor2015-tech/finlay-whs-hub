import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentApproved, emptyStep, groupSteps, stepCode, highAfterCount, swmsIssues, swmsNeedsAction, swmsPill, versionProblems, type Swms, type SwmsStep } from './swms.ts';

const swms = (o: Partial<Swms> = {}): Swms => ({
  id: 's', ref: 'SWMS-001', swms_number: '', risk_register_ref: '', title: 't', site_id: null, owner_name: 'x', review_months: 12, reviewed_on: '2026-01-10', reviewed_by_name: '',
  document_id: null, status: 'active', created_by_name: '', created_at: '', updated_at: '', ...o,
});
const good = (): SwmsStep => ({ ...emptyStep(), step: 'Isolate', hazard: 'Stored energy', before: [4, 4], controls: 'Lock out', after: [2, 3], who: 'Operator' });
const now = new Date('2026-06-01T00:00:00+10:00');

test('an empty version has problems', () => {
  assert.ok(versionProblems({ steps: [], work_covered: '' }).length >= 2);
});
test('a complete version is ready', () => {
  assert.deepEqual(versionProblems({ steps: [good()], work_covered: 'Servicing' }), []);
});
test('a step missing after rating is flagged', () => {
  const s = { ...good(), after: null };
  assert.ok(versionProblems({ steps: [s], work_covered: 'x' }).some(p => /after controls/.test(p)));
});
test('extreme after controls blocks', () => {
  const s = { ...good(), after: [5, 5] as [number, number] };
  assert.ok(versionProblems({ steps: [s], work_covered: 'x' }).some(p => /extreme/.test(p)));
});
test('high after controls is counted, not blocked', () => {
  const s = { ...good(), after: [4, 3] as [number, number] };
  assert.equal(highAfterCount([s, good()]), 1);
  assert.deepEqual(versionProblems({ steps: [s], work_covered: 'x' }), []);
});
test('no approved version is red', () => {
  assert.equal(swmsPill(swms(), [{ status: 'draft' }], now).tone, 'red');
  assert.ok(swmsNeedsAction(swms(), [{ status: 'draft' }], now));
});
test('approved and in date is fine', () => {
  assert.equal(swmsPill(swms(), [{ status: 'approved' }], now).label, 'Approved');
  assert.equal(swmsNeedsAction(swms(), [{ status: 'approved' }], now), false);
});
test('review overdue and due soon', () => {
  assert.equal(swmsIssues(swms({ reviewed_on: '2025-01-01' }), [{ status: 'approved' }], now)[0].key, 'overdue');
  assert.equal(swmsIssues(swms({ reviewed_on: '2025-07-01' }), [{ status: 'approved' }], now)[0].key, 'due_soon');
});
test('awaiting approval needs action', () => {
  assert.ok(swmsNeedsAction(swms(), [{ status: 'approved' }, { status: 'awaiting' }], now));
});
test('retired has no issues', () => {
  assert.deepEqual(swmsIssues(swms({ status: 'retired' }), [], now), []);
});
test('currentApproved picks the highest approved', () => {
  const v = (n: number, status: 'approved' | 'superseded') => ({ version: n, status }) as never;
  assert.equal(currentApproved([v(1, 'superseded'), v(2, 'approved')])?.version, 2);
});

import { emptyHomeData } from './homeData.ts';
import { withSwms } from './homeSwms.ts';

test('home shows SWMS waiting for approval and counts them on the menu', () => {
  const home = withSwms(emptyHomeData(), [swms(), swms({ id: 's2', ref: 'SWMS-002' })], [{ swms_id: 's', status: 'awaiting' }, { swms_id: 's2', status: 'approved' }], now);
  assert.ok(home.attention.some(a => a.id === 'swms-awaiting'));
  assert.equal(home.navCounts.risk, 1);
});
test('home adds to the existing risk count', () => {
  const base = { ...emptyHomeData(), navCounts: { risk: 2 } };
  const home = withSwms(base, [swms()], [], now);
  assert.equal(home.navCounts.risk, 3);
});

test('steps group under their section headings in order', () => {
  const g = groupSteps([{ ...good(), section: 'Arrive' }, { ...good(), section: 'Arrive' }, { ...good(), section: 'Service' }]);
  assert.deepEqual(g.map(x => [x.section, x.steps.length]), [['Arrive', 2], ['Service', 1]]);
});
test('step scores print like H18', () => {
  assert.equal(stepCode({ ...good(), before: [3, 4] }, 'before'), 'H18');
  assert.equal(stepCode({ ...good(), after: [1, 3] }, 'after'), 'L6');
  assert.equal(stepCode({ ...good(), after: null }, 'after'), '');
});
