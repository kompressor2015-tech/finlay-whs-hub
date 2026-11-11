import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inScope, pickSite, siteKey } from './siteScope.ts';

const bur = { id: 'burpengary', name: 'Burpengary Yard' };
const som = { id: 'somerton', name: 'Somerton Workshop' };

test('no site chosen keeps everything', () => {
  assert.equal(inScope(null, { site_id: null, site_name: 'Anywhere' }), true);
});

test('records match a site by id or by its name, and client sites are left out', () => {
  assert.equal(siteKey('Burpengary Yard'), 'burpengary');
  assert.equal(inScope(bur, { site_id: 'burpengary' }), true);
  assert.equal(inScope(bur, { site_id: null, site_name: 'Burpengary Yard' }), true);
  assert.equal(inScope(bur, { site_id: 'x', site_name: 'burpengary depot' }), true);
  assert.equal(inScope(bur, { site_id: null, site_name: 'Somerton Workshop' }), false);
  assert.equal(inScope(bur, { site_id: null, site_name: 'Client site, Ipswich' }), false);
  assert.equal(inScope(som, { site_name: '' }), false);
});

test('pickSite falls back to all sites for an unknown or "all" id', () => {
  assert.equal(pickSite([bur, som], 'somerton'), som);
  assert.equal(pickSite([bur, som], 'all'), null);
  assert.equal(pickSite([bur, som], 'gone'), null);
  assert.equal(pickSite([bur, som], null), null);
});

test('actions follow the site of what they came from', async () => {
  const { actionsInScope } = await import('./siteScope.ts');
  const sources = [{ id: 'i1', site_id: 'burpengary' }, { id: 'h1', site_name: 'Somerton Workshop' }];
  const acts = [{ source_id: 'i1' }, { source_id: 'h1' }, { source_id: null }];
  assert.equal(actionsInScope(bur, acts, sources).length, 1);
  assert.equal(actionsInScope(null, acts, sources).length, 3);
});
