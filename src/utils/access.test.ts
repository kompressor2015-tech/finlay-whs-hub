import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accessLabel, canOpenModule, isOfficeAccess, whsAccessFor } from './access.ts';

test('fleet admins are WHS admins', () => {
  assert.equal(whsAccessFor({ role: 'admin', whs_role: null, status: 'ACTIVE' }), 'admin');
  assert.equal(whsAccessFor({ role: 'admin', whs_role: 'field', status: 'ACTIVE' }), 'admin');
});

test('the whs_role column decides access for everyone else', () => {
  assert.equal(whsAccessFor({ role: 'user', whs_role: 'supervisor', status: 'ACTIVE' }), 'supervisor');
  assert.equal(whsAccessFor({ role: 'sales', whs_role: 'field', status: 'ACTIVE' }), 'field');
  assert.equal(whsAccessFor({ role: 'user', whs_role: 'whs_officer' }), 'whs_officer');
});

test('no whs_role, an unknown value or a suspended account means no access', () => {
  assert.equal(whsAccessFor({ role: 'user', whs_role: null, status: 'ACTIVE' }), null);
  assert.equal(whsAccessFor({ role: 'user', whs_role: 'boss', status: 'ACTIVE' }), null);
  assert.equal(whsAccessFor({ role: 'user', whs_role: 'field', status: 'SUSPENDED' }), null);
  assert.equal(whsAccessFor({ role: 'admin', status: 'SUSPENDED' }), null);
});

test('labels and office / field split', () => {
  assert.equal(accessLabel('whs_officer'), 'WHS officer');
  assert.equal(isOfficeAccess('supervisor'), true);
  assert.equal(isOfficeAccess('field'), false);
  assert.equal(canOpenModule('field', 'incidents'), true);
  assert.equal(canOpenModule('field', 'reports'), false);
  assert.equal(canOpenModule('supervisor', 'reports'), true);
});
