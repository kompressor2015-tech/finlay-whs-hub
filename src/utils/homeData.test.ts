import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyHomeData, summaryValue } from './homeData.ts';
import { MODULES } from './modules.ts';

test('the real home screen shows dashes, not made-up numbers, until modules exist', () => {
  const home = emptyHomeData();
  assert.deepEqual(home.summary.map(summaryValue), ['—', '—', '—', '—']);
  assert.equal(home.attention.length, 0);
});

test('training and tickets is not in the menu for now', () => {
  assert.equal(MODULES.some(m => /training|ticket/i.test(m.label)), false);
  assert.equal(new Set(MODULES.map(m => m.id)).size, MODULES.length);
});
