import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hazardsIn, numberedItems, ppeIn, swiToJsa } from './swiToJsa.ts';

const TRACKING = `Safe Work Instructions Version No 1.2
883 Tracking
1. Competency Requirements
Only persons deemed competent may operate 883 Reclaimer
PPE
2. Safety before and during maintenance
1. Whenever walking a machine a minimum of two (2) persons must be present at all times. NEVER WORK ALONE.
2. Prepare yourself. Wear a hard hat, safety glasses and or a face shield, hearing protection and other protective equipment as required by job conditions.
3. Never attempt repairs or adjustments to the machine while it is running.
4. Never operate any type of engine without proper ventilation – EXHAUST FUMES CAN KILL.
5. Checking for hydraulic leaks. Beware hydraulic fluid under pressure can penetrate the skin or damage eyes.
ELECTRICAL AND ENGINE SAFETY
1. Never short across the starter terminals of a battery as this can cause a fire.
2. Battery electrolyte contains acid and can cause serious injury. Use gloves and protective glasses.
Disclaimer: Information provided within this form is intended to provide information regarding common hazards and risks associated
with the foreseeable operation of this machine. Any operation outside the scope contemplated within this form must be subjected to a
separate risk assessment by the end user.
3. Procedure – Tracking 883
Preparation
Ideally best for 2 persons.
Clear area of non essential personel
Always check if machine is isolated or under repair before proceeding to track the machine
TRACKING
To track machine using dog lead.
(1) Plug lead into socket on the feeder end of
the machine
(2) Start engine.
(3) CAUTION Raise the tail drum of the
intermediate belt and the 2 legs at the rear
of the feeder.
(4) Engage the 2 hydraulic levers situated in the engine bay
Hazards
1. Crush injury.
2. Contact with overhead wires.
Controls:
1. Use a second person to keep others away
and to ensure no other vehicles in direct vicinity.
2. Check area and look up.
Plant Risk Assessment – Part B – 883 Tracking
Task/Activity Hazard/Risk Inherent`;

test('numbered items only continue in order, so a wrapped "13 mm" line is not a new item', () => {
  assert.deepEqual(numberedItems(['1. Replace filters by removing the cover with a', '13 mm spanner.', '2. Check level.']), [['Replace filters by removing the cover with a 13 mm spanner.', 'Check level.']]);
  assert.deepEqual(numberedItems(['(1) Plug lead', '(2) Start engine.']), [['Plug lead', 'Start engine.']]);
});

test('the SWI becomes a safety step, then a step per procedure section', () => {
  const d = swiToJsa(TRACKING, { docNo: 'SWI-041', title: '883 Tracking', version: '1.2' });
  assert.equal(d.content.title, '883 Tracking (from SWI-041)');
  assert.match(d.content.work_covered, /Based on SWI-041 883 Tracking, version 1\.2/);
  assert.deepEqual(d.content.steps.map(s => s.section), ['Before work starts', 'Preparation', 'Tracking']);
  const [safe, prep, track] = d.content.steps;
  assert.equal(safe.controls.split('\n').length, 7);
  assert.match(safe.controls, /minimum of two \(2\) persons/);
  assert.match(safe.hazard, /Exhaust fumes/);
  assert.match(prep.step, /Clear area of non essential personel/);
  assert.match(track.step, /1\. Plug lead into socket on the feeder end of the machine/);
  assert.match(track.step, /3\. CAUTION Raise the tail drum/);
  assert.match(track.step, /4\. Engage the 2 hydraulic levers/);
  assert.match(track.hazard, /Crush injury/);
  assert.match(track.controls, /Use a second person to keep others away and to ensure no other vehicles in direct vicinity\./);
});

test('PPE and isolation are picked out of the wording, ratings are left blank', () => {
  const d = swiToJsa(TRACKING, { docNo: 'SWI-041', title: '883 Tracking' });
  assert.match(d.content.ppe, /Hard hat/);
  assert.match(d.content.ppe, /Face shield/);
  assert.match(d.content.permits, /Isolation/);
  assert.ok(d.content.steps.every(s => s.before === null && s.after === null));
});

test('long sections are split into steps of at most 8 points', () => {
  const items = Array.from({ length: 18 }, (_, i) => `${i + 1}. Do thing ${i + 1}.`).join('\n');
  const d = swiToJsa(`2. Safety before and during maintenance\n1. Isolate.\n3. Procedure – x\nEngine\n${items}`, { docNo: 'SWI-1', title: 'x' });
  const engine = d.content.steps.filter(s => s.section === 'Engine');
  assert.equal(engine.length, 3);
  assert.match(engine[0].step, /^Engine \(1–8\)/);
  assert.match(engine[2].step, /^Engine \(17–18\)/);
});

test('a file with no readable procedure still gives an empty step and says so', () => {
  const d = swiToJsa('Nothing useful here', { docNo: 'SWI-9', title: 'Odd' });
  assert.equal(d.content.steps.length, 1);
  assert.ok(d.notes.some(n => /could not be read/.test(n)));
});

test('keyword helpers', () => {
  assert.deepEqual(hazardsIn('Wear a harness above 2 m'), ['Fall from height']);
  assert.deepEqual(ppeIn('hard hat and gloves'), ['Hard hat', 'Gloves']);
});
