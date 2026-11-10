import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pillFor, sortAttention, urgencyForDue, type AttentionItem } from './attention.ts';

const now = new Date('2026-11-10T00:53:00Z'); // 10/11/2026 in Brisbane

test('urgency from a due date', () => {
  assert.equal(urgencyForDue('2026-11-09', now), 'overdue');
  assert.equal(urgencyForDue('2026-11-10', now), 'due_soon');
  assert.equal(urgencyForDue('2026-11-17', now), 'due_soon');
  assert.equal(urgencyForDue('2026-11-18', now), null);
  assert.equal(urgencyForDue('2026-11-20', now, 14), 'due_soon');
});

test('pills', () => {
  assert.deepEqual(pillFor('overdue'), { label: 'Overdue', tone: 'red' });
  assert.deepEqual(pillFor('review'), { label: 'To review', tone: 'blue' });
});

test('most urgent first, then earliest due, undated last', () => {
  const item = (id: string, urgency: AttentionItem['urgency'], due?: string): AttentionItem => ({
    id, urgency, due, title: id, detail: '', moduleId: 'actions',
  });
  const sorted = sortAttention([
    item('r1', 'review'),
    item('s1', 'due_soon', '2026-11-13'),
    item('o2', 'overdue', '2026-11-07'),
    item('o1', 'overdue', '2026-11-05'),
    item('r0', 'review', '2026-11-30'),
  ]);
  assert.deepEqual(sorted.map(i => i.id), ['o1', 'o2', 's1', 'r0', 'r1']);
});
