import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { isValidList, isValidDetail } from '../extension/lib/schema.js';

const okList = { objects: { task: { label: 'Task', objCode: 'TASK' } } };

test('list: accepts the documented shape', () => assert.equal(isValidList(okList), true));

test('list: rejects non-objects, missing objects, bad labels and unsafe objCodes', () => {
  for (const bad of [null, [], 'x', {}, { objects: [] }, { objects: { a: null } },
    { objects: { a: { label: 1, objCode: 'A' } } },
    { objects: { a: { label: 'A', objCode: '../x' } } },
    { objects: { a: { label: 'A' } } }]) assert.equal(isValidList(bad), false, JSON.stringify(bad));
});

test('detail: accepts typical and sparse shapes', () => {
  assert.equal(isValidDetail({ label: 'Task', flags: ['A'], operations: [], fields: { id: { label: 'ID' } }, queries: null }), true);
  assert.equal(isValidDetail({}), true);
});

test('detail: rejects wrong container types', () => {
  for (const bad of [null, [], { label: 5 }, { flags: 'x' }, { fields: [] }, { fields: { a: 'str' } }, { actions: { a: null } }]) {
    assert.equal(isValidDetail(bad), false, JSON.stringify(bad));
  }
});
