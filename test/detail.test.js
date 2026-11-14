import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TABS, tabEntries, visibleAttrs } from '../extension/lib/detail.js';

test('TABS has the 5 Explorer tabs in order (Queries hidden)', () => {
  assert.deepEqual(TABS.map((t) => t.key), ['fields', 'references', 'collections', 'search', 'actions']);
  assert.deepEqual(TABS.map((t) => t.label), ['Fields', 'References', 'Collections', 'Search', 'Actions']);
});

test('tabEntries returns entries, or [] for a missing key', () => {
  assert.deepEqual(tabEntries({ fields: { a: { label: 'A' } } }, 'fields'), [['a', { label: 'A' }]]);
  assert.deepEqual(tabEntries({}, 'queries'), []);
});

test('visibleAttrs hides label', () => {
  assert.deepEqual(visibleAttrs({ label: 'L', fieldType: 'string' }), [['fieldType', 'string']]);
});

test('visibleAttrs hides null, undefined and empty arrays but keeps false and 0', () => {
  const attrs = { label: 'L', enumType: null, url2: undefined, fieldType: 'string', flags: [], arguments: [], n: 0, b: false, f: ['A'] };
  assert.deepEqual(visibleAttrs(attrs), [['fieldType', 'string'], ['n', 0], ['b', false], ['f', ['A']]]);
});

test('visibleAttrs hides url (duplicates the object link)', () => {
  assert.deepEqual(visibleAttrs({ typeObjCode: 'CUST', url: 'https://h/attask/api/v22.0/cust/metadata' }), [['typeObjCode', 'CUST']]);
});
