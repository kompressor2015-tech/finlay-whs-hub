import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchAll } from './globalSearch.ts';
import type { HomeRaw } from './homeBuild.ts';

const raw = {
  incidents: [
    { id: 'i1', ref: 'INC-0042', type: 'near_miss', description: 'Loader reversed into a bin', site_name: 'Burpengary Yard', site_id: null, unit_no: '2417', people: '', reporter_name: 'Sam' },
    { id: 'i2', ref: 'INC-0043', type: 'injury', description: 'Cut finger', site_name: 'Somerton Workshop', site_id: null, unit_no: '', people: '', reporter_name: 'Al' },
  ],
  hazards: [],
  actions: [{ id: 'a1', title: 'Fix the loader reversing alarm', source_ref: 'INC-0042', owner_name: 'Dan', unit_no: '2417', status: 'not_started', source_id: 'i1', source_type: 'incident' }],
  checks: null,
  register: { sites: [], stock: [], sds: [], chemicals: [{ id: 'c1', name: 'LeMix Prefill', manufacturer: 'LeMix', dg_class: '2.1', un_number: '1950', active: true }] },
  stocktakes: [],
} as unknown as HomeRaw;

test('short searches return nothing', () => {
  assert.equal(searchAll(raw, 'a', null).length, 0);
});

test('finds across modules by ref, unit, product and UN number', () => {
  assert.deepEqual(searchAll(raw, '2417', null).map(h => h.group), ['Incidents', 'Actions']);
  assert.equal(searchAll(raw, 'inc 42', null)[0].href, '#/incidents/i1');
  assert.equal(searchAll(raw, '1950', null)[0].href, '#/chemicals/c1');
});

test('the site switcher narrows the results', () => {
  const som = { id: 'somerton', name: 'Somerton Workshop' };
  assert.deepEqual(searchAll(raw, 'inc', som).map(h => h.id), ['i2']);
});
