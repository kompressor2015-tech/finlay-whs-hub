import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyName, currentSegment, exactMatch, suggest } from './nameSuggest.ts';

const o = [{ id: '1', name: 'John SMITH' }, { id: '2', name: 'Jo SMITHSON' }, { id: '3', name: 'Mary JONES' }, { id: '4', name: "Tam O'SULLIVAN" }, { id: '5', name: 'Alex DYER' }];

test('finds by any typed word, first or last name, and puts starts-with first', () => {
  assert.deepEqual(suggest(o, 'smi').map(x => x.id).sort(), ['1', '2']);
  assert.deepEqual(suggest(o, 'smith jo').map(x => x.id).sort(), ['1', '2']);
  assert.equal(suggest(o, 'john')[0].id, '1');
  assert.deepEqual(suggest(o, 'MARY').map(x => x.id), ['3']);
  assert.deepEqual(suggest(o, 'osull').map(x => x.id), []);
  assert.deepEqual(suggest(o, "o'sul").map(x => x.id), ['4']);
  assert.deepEqual(suggest(o, '  '), []);
});
test('works on the name being typed after a comma', () => {
  assert.deepEqual(currentSegment('John Smith, mar', true), { start: 11, query: 'mar' });
  assert.equal(applyName('John Smith, mar', 'Mary JONES', true), 'John Smith, Mary JONES');
  assert.equal(applyName('jo', 'John SMITH', true), 'John SMITH');
  assert.equal(applyName('jo', 'John SMITH', false), 'John SMITH');
  assert.deepEqual(currentSegment('a, b', false), { start: 0, query: 'a, b' });
});
test('exact match only when it is one person', () => {
  assert.equal(exactMatch(o, 'john smith')?.id, '1');
  assert.equal(exactMatch(o, 'John'), null);
  assert.equal(exactMatch([...o, { id: '9', name: 'John SMITH' }], 'John Smith'), null);
});
