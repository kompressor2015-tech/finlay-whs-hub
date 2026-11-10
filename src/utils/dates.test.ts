import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, brisbaneDay, daysUntil, formatDate, formatDay, formatLongDate, formatWhen, fromInputs, greeting, nowForInputs } from './dates.ts';

// 10/11/2026 10:53 in Brisbane is 00:53 UTC.
const now = new Date('2026-11-10T00:53:00Z');

test('dates show as DD/MM/YYYY in Brisbane time', () => {
  assert.equal(formatDate(now), '10/11/2026');
  // 22:30 UTC on the 9th is already the 10th in Brisbane.
  assert.equal(formatDate('2026-11-09T22:30:00Z'), '10/11/2026');
  assert.equal(formatLongDate(now), 'Tuesday 10/11/2026');
  assert.equal(formatDate('not a date'), '');
});

test('brisbaneDay and daysUntil count whole Brisbane days', () => {
  assert.equal(brisbaneDay(now), '2026-11-10');
  assert.equal(daysUntil('2026-11-10', now), 0);
  assert.equal(daysUntil('2026-11-13', now), 3);
  assert.equal(daysUntil('2026-11-07', now), -3);
});

test('formatWhen uses plain words for recent reports', () => {
  assert.equal(formatWhen('2026-11-09T22:12:00Z', now), 'Today 08:12');
  assert.equal(formatWhen('2026-11-09T06:40:00Z', now), 'Yesterday 16:40');
  assert.equal(formatWhen('2026-11-08T01:00:00Z', now), 'Sun 08/11');
  assert.equal(formatWhen('2026-10-01T01:00:00Z', now), '01/10/2026');
});

test('form fields use Brisbane time both ways', () => {
  assert.deepEqual(nowForInputs(now), { date: '2026-11-10', time: '10:53' });
  assert.equal(fromInputs('2026-11-10', '10:53'), '2026-11-10T00:53:00.000Z');
  assert.equal(addDays('2026-11-28', 5), '2026-12-03');
  assert.equal(formatDay('2026-11-13'), '13/11/2026');
  assert.equal(formatDay(null), '');
});

test('greeting follows the Brisbane clock', () => {
  assert.equal(greeting(now), 'Good morning');
  assert.equal(greeting(new Date('2026-11-10T04:00:00Z')), 'Good afternoon');
  assert.equal(greeting(new Date('2026-11-10T09:00:00Z')), 'Good evening');
});
