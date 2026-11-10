import { test } from 'node:test';
import assert from 'node:assert/strict';
import { finaliseAnswers, plainAnswers } from './draftAnswers.ts';

const file = (name: string) => ({ name }) as unknown as File;

test('photos are uploaded and replaced by their paths; notes are trimmed', async () => {
  const uploaded: string[][] = [];
  const res = await finaliseAnswers(
    { guards: { v: 'fail', note: '  Missing  ', files: [file('a.jpg')] }, leaks: { v: 'pass', note: ' ' } },
    async files => { uploaded.push(files.map(f => f.name)); return { data: files.map(f => `2026-11/${f.name}`) }; }
  );
  assert.deepEqual(res.answers, { guards: { v: 'fail', note: 'Missing', photos: ['2026-11/a.jpg'] }, leaks: { v: 'pass' } });
  assert.deepEqual(uploaded, [['a.jpg']]);
});

test('an upload error stops the save', async () => {
  const res = await finaliseAnswers({ p: { files: [file('a.jpg')] } }, async () => ({ error: 'No signal' }));
  assert.equal(res.error, 'No signal');
});

test('plain answers count photos for the "enough photos" rule', () => {
  assert.deepEqual(plainAnswers({ p: { files: [file('a'), file('b')] } }).p.photos, ['a', 'b']);
});
