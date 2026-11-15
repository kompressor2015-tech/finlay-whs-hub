import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cellFor, jobSheet, jobsWithGaps, jobTiming, outstandingFor, sheetProgress, signerKey, expiredTicketNames, type Job, type SignOn } from './signon.ts';
import type { Swms, SwmsVersion } from './swms.ts';

const now = new Date('2026-06-10T10:00:00+10:00');
const job = (o: Partial<Job> = {}): Job => ({ id: 'j1', ref: 'JOB-001', name: 'Job', site_id: null, client: '', location: '', supervisor_name: '', starts_on: '2026-06-01', ends_on: null, notes: '', status: 'active', created_by_name: '', created_at: '', updated_at: '', ...o });
const swms = (id: string): Swms => ({ id, ref: id, swms_number: '', risk_register_ref: '', title: id, site_id: null, owner_name: '', review_months: 12, reviewed_on: null, reviewed_by_name: '', document_id: null, status: 'active', created_by_name: '', created_at: '', updated_at: '' });
const ver = (id: string, swms_id: string, version: number, status: 'approved' | 'superseded') => ({ id, swms_id, version, status }) as unknown as SwmsVersion;
const so = (o: Partial<SignOn>): SignOn => ({ id: 'x', swms_id: 's1', version_id: 'v1', job_id: 'j1', person_id: 'p1', signer_name: 'Ann', company: 'Finlay', signature_path: 'a', method: 'self', recorded_by_name: '', signed_at: '', ...o });

test('job timing from dates', () => {
  assert.equal(jobTiming(job(), now), 'running');
  assert.equal(jobTiming(job({ starts_on: '2026-07-01' }), now), 'upcoming');
  assert.equal(jobTiming(job({ ends_on: '2026-06-05' }), now), 'ended');
  assert.equal(jobTiming(job({ starts_on: null }), now), 'undated');
  assert.equal(jobTiming(job({ status: 'closed' }), now), 'closed');
});
test('signed, older and none', () => {
  const vs = [ver('v1', 's1', 1, 'superseded'), ver('v2', 's1', 2, 'approved')];
  assert.equal(cellFor('p1', 's1', vs, [so({ version_id: 'v2' })]), 'signed');
  assert.equal(cellFor('p1', 's1', vs, [so({ version_id: 'v1' })]), 'older');
  assert.equal(cellFor('p2', 's1', vs, []), 'none');
  assert.equal(cellFor('p1', 's9', vs, []), 'no_version');
});
test('contractor keys match the database', () => {
  assert.equal(signerKey({ person_id: null, signer_name: ' Bob ', company: 'Sparky Co' }), 'bob|sparky co');
  assert.equal(signerKey({ person_id: 'p1', signer_name: 'x', company: 'y' }), 'p1');
});
test('sheet includes crew and contractors who signed, with progress', () => {
  const vs = [ver('v1', 's1', 1, 'approved')];
  const signons = [so({ version_id: 'v1' }), so({ id: 'y', person_id: null, signer_name: 'Bob', company: 'Sparky' })];
  const sheet = jobSheet(job(), ['s1'], [{ id: 'p1', name: 'Ann' }, { id: 'p2', name: 'Cy' }], vs, signons);
  assert.deepEqual(sheet.map(r => [r.name, r.cells.s1]), [['Ann', 'signed'], ['Bob', 'signed'], ['Cy', 'none']]);
  assert.deepEqual(sheetProgress(sheet, ['s1']), { done: 2, total: 3 });
});
test('a worker is told what is left, and to sign again after a new version', () => {
  const vs = [ver('v1', 's1', 1, 'superseded'), ver('v2', 's1', 2, 'approved'), ver('v3', 's2', 1, 'approved')];
  const out = outstandingFor('p1', [job()], [{ job_id: 'j1', swms_id: 's1' }, { job_id: 'j1', swms_id: 's2' }], [{ job_id: 'j1', person_id: 'p1' }], [swms('s1'), swms('s2')], vs, [so({ version_id: 'v1' })], now);
  assert.deepEqual(out.map(o => [o.swms.id, o.again]), [['s1', true], ['s2', false]]);
});
test('nothing is listed for a worker not on the crew or on a closed job', () => {
  const vs = [ver('v1', 's1', 1, 'approved')];
  assert.equal(outstandingFor('p9', [job()], [{ job_id: 'j1', swms_id: 's1' }], [{ job_id: 'j1', person_id: 'p1' }], [swms('s1')], vs, [], now).length, 0);
  assert.equal(outstandingFor('p1', [job({ status: 'closed' })], [{ job_id: 'j1', swms_id: 's1' }], [{ job_id: 'j1', person_id: 'p1' }], [swms('s1')], vs, [], now).length, 0);
});
test('jobs with gaps counts only crew', () => {
  const vs = [ver('v1', 's1', 1, 'approved')];
  const gaps = jobsWithGaps([job()], [{ job_id: 'j1', swms_id: 's1' }], [{ job_id: 'j1', person_id: 'p1' }, { job_id: 'j1', person_id: 'p2' }], [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }], vs, [so({ version_id: 'v1' })], now);
  assert.deepEqual(gaps.map(g => g.missing), [1]);
});
test('expired tickets are named', () => {
  const t = (name: string, expires_on: string | null) => ({ id: name, person_id: 'p1', name, number: '', issued_on: '2025-01-01', expires_on, provider: '', file_path: '', file_name: '', notes: '', created_by_name: '', created_at: '2025-01-01' });
  assert.deepEqual(expiredTicketNames([t('First aid', '2026-01-01'), t('White card', null), t('CPR', '2027-01-01')], now), ['First aid']);
});

import { emptyHomeData } from './homeData.ts';
import { withSignOns } from './homeSignon.ts';

test('home lists sign-ons for a worker and a gap alert for the office', () => {
  const vs = [ver('v1', 's1', 1, 'approved')];
  const raw = { jobs: [job()], jobSwms: [{ job_id: 'j1', swms_id: 's1' }], jobPeople: [{ job_id: 'j1', person_id: 'p1' }], signons: [], swms: [swms('s1')], versions: vs, people: [{ id: 'p1', name: 'Ann' }], mine: 'p1' };
  const home = withSignOns(emptyHomeData(), raw, now);
  assert.equal(home.phoneToSign.length, 1);
  assert.equal(home.phoneToSign[0].href, '#/swms/s1');
  assert.ok(home.attention.some(a => a.id === 'signon-gaps'));
});
