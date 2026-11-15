import { test } from 'node:test';
import assert from 'node:assert/strict';
import { afterLevel, beforeLevel, needsAttention, reviewBy, riskIssues, riskLevel, riskPill, riskReviewState, type Risk } from './risks.ts';

const now = new Date('2026-11-14T04:00:00Z');
const risk = (o: Partial<Risk> = {}): Risk => ({ id: 'r', ref: 'RSK-0001', title: 't', category: '', site_id: null, description: '', before_likelihood: 4, before_consequence: 4, after_likelihood: 2, after_consequence: 4, owner_name: 'WHS officer', review_months: 12, reviewed_on: '2026-06-01', reviewed_by_name: '', notes: '', status: 'active', created_by_name: '', created_at: '', updated_at: '', ...o });
const ctl = [{ control_level: 'engineer' as const }];

test('levels follow the score on the 5 by 5 grid', () => {
  assert.equal(riskLevel(1, 4), 'low');
  assert.equal(riskLevel(1, 5), 'medium');
  assert.equal(riskLevel(3, 3), 'medium');
  assert.equal(riskLevel(2, 5), 'high');
  assert.equal(riskLevel(4, 4), 'high');
  assert.equal(riskLevel(4, 5), 'extreme');
  assert.equal(riskLevel(5, 5), 'extreme');
  assert.equal(riskLevel(null, null), null);
  assert.equal(beforeLevel(risk()), 'high');
  assert.equal(afterLevel(risk()), 'medium');
});

test('review is counted from the last review, flagged 60 days before', () => {
  assert.equal(reviewBy(risk()), '2027-06-01');
  assert.equal(riskReviewState(risk(), now), 'ok');
  assert.equal(riskReviewState(risk({ reviewed_on: '2025-12-20' }), now), 'due_soon');
  assert.equal(riskReviewState(risk({ reviewed_on: '2025-10-01' }), now), 'overdue');
  assert.equal(riskReviewState(risk({ reviewed_on: null }), now), 'none');
});

test('what a risk needs, worst first', () => {
  assert.equal(riskIssues(risk(), ctl, now).length, 0);
  assert.equal(riskPill(risk(), ctl, now).label, 'In control');
  assert.equal(riskIssues(risk(), [], now)[0]?.key, 'no_controls');
  assert.equal(needsAttention(risk(), [], now), true);
  assert.equal(riskIssues(risk(), [{ control_level: 'ppe' }], now)[0]?.key, 'ppe_only');
  assert.equal(riskIssues(risk({ after_likelihood: null, after_consequence: null }), ctl, now)[0]?.key, 'not_rated');
  assert.ok(riskIssues(risk({ after_likelihood: 4, after_consequence: 4 }), ctl, now).some(i => i.key === 'high_after'));
  assert.equal(riskIssues(risk({ status: 'retired' }), [], now).length, 0);
});

import { withRisks } from './homeRisks.ts';
import { emptyHomeData } from './homeData.ts';

test('home shows risks that need action', () => {
  const risks = [risk({ id: 'a', ref: 'RSK-0001' }), risk({ id: 'b', ref: 'RSK-0002' }), risk({ id: 'c', ref: 'RSK-0003', after_likelihood: 4, after_consequence: 4 }), risk({ id: 'd', ref: 'RSK-0004', status: 'retired' })];
  const controls = [{ id: '1', risk_id: 'a', control_level: 'engineer' as const, what: 'x', created_at: '' }, { id: '2', risk_id: 'c', control_level: 'engineer' as const, what: 'x', created_at: '' }];
  const home = withRisks(emptyHomeData(), risks, controls, now);
  assert.deepEqual(home.attention.map(a => a.id).sort(), ['risk-high', 'risk-nocontrols']);
  assert.equal(home.navCounts.risk, 2);
});
