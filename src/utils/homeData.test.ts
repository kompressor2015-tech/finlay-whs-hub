import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyHomeData, summaryValue } from './homeData.ts';
import { sampleHomeData } from '../data/sampleHome.ts';
import { sortAttention } from './attention.ts';
import { MODULES, moduleById } from './modules.ts';

test('the real home screen shows dashes, not made-up numbers, until modules exist', () => {
  const home = emptyHomeData();
  assert.deepEqual(home.summary.map(summaryValue), ['—', '—', '—', '—']);
  assert.equal(home.attention.length, 0);
});

test('sample data is ordered most urgent first and points at real modules', () => {
  const now = new Date('2026-11-10T00:53:00Z');
  const sample = sampleHomeData(now);
  const sorted = sortAttention(sample.attention);
  assert.equal(sorted[0].urgency, 'overdue');
  assert.equal(sorted[sorted.length - 1].urgency, 'review');
  for (const item of sample.attention) assert.ok(moduleById(item.moduleId), item.moduleId);
  for (const id of Object.keys(sample.navCounts)) assert.ok(moduleById(id), id);
});

test('training and tickets is not in the menu for now', () => {
  assert.equal(MODULES.some(m => /training|ticket/i.test(m.label)), false);
  assert.equal(new Set(MODULES.map(m => m.id)).size, MODULES.length);
});
