import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_JSA, highAfter, jsaProblems, needsSwms, type Jsa } from './jsa.ts';
import { emptyStep } from './swms.ts';

const jsa = (o: Partial<Jsa> = {}) => ({ ...EMPTY_JSA, ...o }) as Jsa;
const good = emptyStep();
good.step = 'Isolate'; good.hazard = 'Stored energy'; good.controls = 'Lock out'; good.before = [4, 4]; good.after = [1, 4];

test('a JSA is complete only with title, date, supervisor, crew and rated steps', () => {
  assert.equal(jsaProblems(jsa({ title: 'x', site_name: 'Acme Quarry', done_on: '2026-11-20', supervisor_name: 'A', crew: 'B', steps: [good] })).length, 0);
  const p = jsaProblems(jsa({ steps: [emptyStep()] }));
  assert.ok(p.some(x => /title/i.test(x)) && p.some(x => /Step 1: list the hazards/.test(x)) && p.some(x => /rate the risk after/.test(x)));
});

test('any ticked high risk area means it needs a SWMS', () => {
  assert.equal(needsSwms(jsa()), false);
  assert.equal(needsSwms(jsa({ high_risk_areas: ['Height > 2 metres'] })), true);
});

test('counts steps still high after controls', () => {
  const hi = { ...good, after: [4, 4] as [number, number] };
  assert.equal(highAfter(jsa({ steps: [good, hi] })), 1);
});

test('the site must be entered, typed or picked', () => {
  assert.ok(jsaProblems(jsa({ title: 'x', done_on: '2026-11-20', supervisor_name: 'A', crew: 'B', steps: [good] })).some(x => /site/i.test(x)));
});
