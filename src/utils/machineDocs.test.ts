import { test } from 'node:test';
import assert from 'node:assert/strict';
import { docsForUnit, modelKeys, unitMatchesModel } from './machineDocs.ts';

test('keys ignore brand, descriptions, hyphens, spaces and the plus', () => {
  assert.deepEqual(modelKeys('Finlay C1550+ Cone Crusher'), ['c1550']);
  assert.deepEqual(modelKeys('C-1550'), ['c1550']);
  assert.deepEqual(modelKeys('883+ Spaleck'), ['883']);
  assert.deepEqual(modelKeys('TDS V20'), ['tdsv20']);
  assert.deepEqual(modelKeys('TE TDSV20 Mid Speed Shredder'), ['tdsv20']);
  assert.deepEqual(modelKeys('I-140 / I-120RS'), ['i140', 'i120rs']);
  assert.deepEqual(modelKeys('Pilot VS350E VSI Crusher'), ['vs350e']);
  assert.deepEqual(modelKeys('Jaw Crusher'), []);
});

test('fleet register spellings match the model list', () => {
  assert.ok(unitMatchesModel('Finlay C1550P Cone Crusher', 'C-1550'));
  assert.ok(unitMatchesModel('Finlay C1550+ Cone Crusher', 'C-1550'));
  assert.ok(unitMatchesModel('Finlay 694 Supertrak', '694+ Supertrak'));
  assert.ok(unitMatchesModel('Finlay 696 3D Supertrak', '696 2D Supertrak / 696 3D Supertrak'));
  assert.ok(unitMatchesModel('Finlay 883+ Heavy Duty Screener', '883+ Spaleck'));
  assert.ok(unitMatchesModel('TE TD820 Slow Speed Shredder', 'TDS 820'));
  assert.ok(unitMatchesModel('Pilot VS350H VSI Crusher', 'VS350'));
  assert.ok(unitMatchesModel('Finlay C1540RS Cone Crusher', 'C-1540 / C-1540P'));
  assert.ok(unitMatchesModel('Finlay J1175 Jaw Crusher', 'J-1175'));
});

test('different machines do not match', () => {
  assert.equal(unitMatchesModel('Finlay I140 Impact Crusher', 'I-140RS'), false);
  assert.equal(unitMatchesModel('Finlay I140RS Impact Crusher', 'I-140'), false);
  assert.equal(unitMatchesModel('TE TTS620 Tracked Trommel', 'TTS 620T'), false);
  assert.equal(unitMatchesModel('Finlay C1554 Cone Crusher', 'C-1550'), false);
  assert.equal(unitMatchesModel('Finlay 5032 Wheeled Conveyor', ''), false);
  assert.equal(unitMatchesModel('Finlay 5032 Wheeled Conveyor', 'Jaw Crusher'), false);
});

test('docsForUnit picks the documents for a model', () => {
  const docs = [{ machine_model: 'C-1550' }, { machine_model: 'J-1480' }, { machine_model: '' }];
  assert.deepEqual(docsForUnit('Finlay C1550P Cone Crusher', docs), [docs[0]]);
});
