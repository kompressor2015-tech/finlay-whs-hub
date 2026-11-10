import { test } from 'node:test';
import assert from 'node:assert/strict';
import { looseMatch } from './search.ts';
import { csvFor } from './csv.ts';

test('loose search', () => {
  const fields = ['INC-0042', 'Hand caught in conveyor return roller', 'Narangba workshop', '1988'];
  assert.equal(looseMatch('', fields), true);
  assert.equal(looseMatch('inc0042', fields), true);
  assert.equal(looseMatch('inc 42', fields), true);
  assert.equal(looseMatch('roller narangba', fields), true);
  assert.equal(looseMatch('1988', fields), true);
  assert.equal(looseMatch('pinkenba', fields), false);
});

test('csv quotes and guards cells', () => {
  const csv = csvFor(['Ref', 'Note'], [['INC-0001', 'Said "stop", then left'], ['=SUM(A1)', null]]);
  assert.equal(csv, '﻿Ref,Note\r\nINC-0001,"Said ""stop"", then left"\r\n\'=SUM(A1),');
});
