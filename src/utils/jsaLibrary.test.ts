import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeLines, stageOf, STAGES } from './jsaLibrary.ts';

test('every task has hazards and controls, and stages are unique', () => {
  assert.equal(new Set(STAGES.map(s => s.id)).size, STAGES.length);
  for (const s of STAGES) {
    assert.ok(s.hint && s.tasks.length >= 3, s.label);
    for (const t of s.tasks) assert.ok(t.step && t.hazards.length > 0 && t.controls.length > 0, `${s.label}: ${t.step}`);
  }
});

test('no task is listed twice', () => {
  const all = STAGES.flatMap(s => s.tasks.map(t => t.step.toLowerCase()));
  assert.equal(new Set(all).size, all.length);
});

test('merging keeps what was typed and skips repeats', () => {
  assert.equal(mergeLines('Crush\nNoise', ['noise', 'Dust']), 'Crush\nNoise\nDust');
  assert.equal(mergeLines('', ['A']), 'A');
});

test('a step section finds its stage', () => {
  assert.equal(stageOf('arriving on site')?.id, 'arrive');
  assert.equal(stageOf('Before work starts'), undefined);
});
