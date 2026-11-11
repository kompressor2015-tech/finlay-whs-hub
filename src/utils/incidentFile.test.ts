import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PARTS, closeBlockers, daysOpen, feedMatches, incidentAttention, investigationProgress, needsFullInvestigation, partsDone,
  requiredParts, sortFeed, statementCounts, togglePart, type FeedItem,
} from './incidentFile.ts';

const injury = { type: 'injury' as const, notifiable_reasons: [], parts_done: [] as string[] };
const nearMiss = { type: 'near_miss' as const, notifiable_reasons: [], parts_done: [] as string[] };

test('injuries and notifiable incidents need the full investigation, others a lighter one', () => {
  assert.equal(needsFullInvestigation(injury), true);
  assert.equal(needsFullInvestigation({ type: 'near_miss', notifiable_reasons: ['dangerous'] }), true);
  assert.equal(needsFullInvestigation(nearMiss), false);
  assert.equal(requiredParts(injury).length, 6);
  assert.deepEqual(requiredParts(nearMiss), ['evidence', 'timeline', 'why', 'findings']);
  assert.equal(PARTS.length, 6);
});

test('investigation progress counts only the required parts', () => {
  assert.deepEqual(investigationProgress({ ...nearMiss, parts_done: ['evidence', 'signoff'] }), { done: 1, total: 4, remaining: ['timeline', 'why', 'findings'] });
  const p = investigationProgress({ ...injury, parts_done: ['evidence', 'evidence', 'why'] });
  assert.equal(p.done, 2);
  assert.equal(p.total, 6);
});

test('togglePart adds and removes a part, and ignores duplicates', () => {
  assert.deepEqual(togglePart({ parts_done: ['evidence'] }, 'why'), ['evidence', 'why']);
  assert.deepEqual(togglePart({ parts_done: ['evidence', 'why'] }, 'why'), ['evidence']);
  assert.deepEqual(partsDone({ parts_done: ['why', 'why'] }), ['why']);
  assert.deepEqual(partsDone({}), []);
});

test('closeBlockers explains what is left, and matches the database rule', () => {
  const open = { ...injury, status: 'investigating' as const };
  assert.deepEqual(closeBlockers(open, [{ status: 'done' }], []), ['Investigation: 6 of 6 parts not done']);
  const b = closeBlockers({ ...open, parts_done: ['evidence'] }, [{ status: 'not_started' }, { status: 'done' }], [{ status: 'accepted' }, { status: 'closed' }]);
  assert.deepEqual(b, ['1 action is not done', 'Investigation: 5 of 6 parts not done', '1 claim is still open']);
  const all = PARTS.map(p => p.id);
  assert.deepEqual(closeBlockers({ ...open, parts_done: all }, [], [{ status: 'rejected' }, { status: 'closed' }]), []);
  // a near miss only needs its actions done
  assert.deepEqual(closeBlockers({ ...nearMiss, status: 'actions' }, [{ status: 'done' }], null), []);
  assert.deepEqual(closeBlockers({ ...nearMiss, status: 'closed' }, [{ status: 'not_started' }], null), []);
});

test('statement counts', () => {
  assert.deepEqual(statementCounts([{ status: 'signed' }, { status: 'requested' }, { status: 'received' }]), { signed: 1, total: 3 });
});

test('the file feed filters and sorts newest first', () => {
  const items: FeedItem[] = [
    { id: 'a', at: '2026-11-10T01:00:00Z', kind: 'evidence', what: 'Photo', by: 'x', file: 'p.jpg' },
    { id: 'b', at: '2026-11-12T01:00:00Z', kind: 'certificate', what: 'Cert', by: 'x', file: 'c.pdf' },
    { id: 'c', at: '2026-11-11T01:00:00Z', kind: 'log', what: 'Call', by: 'x' },
    { id: 'd', at: '2026-11-09T01:00:00Z', kind: 'history', what: 'Reported', by: 'x' },
  ];
  assert.deepEqual(sortFeed(items).map(i => i.id), ['b', 'c', 'a', 'd']);
  assert.deepEqual(items.filter(i => feedMatches(i, 'claim')).map(i => i.id), ['b', 'c']);
  assert.deepEqual(items.filter(i => feedMatches(i, 'investigation')).map(i => i.id), ['a']);
  assert.deepEqual(items.filter(i => feedMatches(i, 'files')).map(i => i.id), ['a', 'b']);
  assert.equal(items.filter(i => feedMatches(i, 'all')).length, 4);
});

test('incident attention: investigation due and statements waiting', () => {
  const now = new Date('2026-11-12T00:00:00+10:00');
  assert.deepEqual(incidentAttention({ status: 'investigating', investigation_due: '2026-11-17' }, [], now).map(a => [a.tone, a.when]), [['amber', 'In 5 days']]);
  assert.equal(incidentAttention({ status: 'investigating', investigation_due: '2026-11-10' }, [], now)[0].tone, 'red');
  assert.equal(incidentAttention({ status: 'investigating', investigation_due: '2026-12-30' }, [], now).length, 0);
  assert.equal(incidentAttention({ status: 'closed', investigation_due: '2026-11-10' }, [], now).length, 0);
  const s = incidentAttention({ status: 'actions', investigation_due: null }, [{ status: 'requested', name: 'Worker B' }, { status: 'signed', name: 'Sup' }], now);
  assert.equal(s[0].what, 'No statement yet from Worker B');
});

test('days open', () => {
  assert.equal(daysOpen({ created_at: '2026-11-10T00:00:00+10:00', closed_at: null }, new Date('2026-11-12T10:00:00+10:00')), 2);
  assert.equal(daysOpen({ created_at: '2026-11-10T00:00:00+10:00', closed_at: '2026-11-11T09:00:00+10:00' }, new Date('2026-11-30T10:00:00+10:00')), 1);
});

test('an injury marked "investigation not required" can close without the six parts, but a notifiable one cannot be waived', async () => {
  const { canWaiveInvestigation } = await import('./incidentFile.ts');
  const inj = { status: 'investigating', type: 'injury', notifiable_reasons: [], parts_done: [], investigation_waived: true } as never;
  assert.deepEqual(closeBlockers(inj, [], []), []);
  assert.equal(canWaiveInvestigation({ notifiable_reasons: [] }), true);
  assert.equal(canWaiveInvestigation({ notifiable_reasons: ['x'] as never }), false);
});
