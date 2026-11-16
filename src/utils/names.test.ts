import { test } from 'node:test';
import assert from 'node:assert/strict';
import { surnameCaps } from './names.ts';

test('surname goes to capitals', () => {
  assert.equal(surnameCaps('Daniel Sykes'), 'Daniel SYKES');
  assert.equal(surnameCaps('  mary  ann smith-jones '), 'mary ann SMITH-JONES');
  assert.equal(surnameCaps("Tam O'Sullivan"), "Tam O'SULLIVAN");
  assert.equal(surnameCaps('Madonna'), 'Madonna');
  assert.equal(surnameCaps(''), '');
});
