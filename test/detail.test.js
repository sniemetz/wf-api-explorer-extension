import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TABS, tabEntries, visibleAttrs, itemMeta } from '../extension/lib/detail.js';

test('TABS has the 6 tabs in spec order', () => {
  assert.deepEqual(TABS.map((t) => t.key), ['fields', 'references', 'collections', 'search', 'actions', 'queries']);
  assert.deepEqual(TABS.map((t) => t.label), ['Fields', 'References', 'Collections', 'Search', 'Actions', 'Queries']);
});

test('tabEntries returns entries, or [] for a missing key', () => {
  assert.deepEqual(tabEntries({ fields: { a: { label: 'A' } } }, 'fields'), [['a', { label: 'A' }]]);
  assert.deepEqual(tabEntries({}, 'queries'), []);
});

test('visibleAttrs hides label', () => {
  assert.deepEqual(visibleAttrs({ label: 'L', fieldType: 'string' }), [['fieldType', 'string']]);
});

test('itemMeta joins type and flags', () => {
  assert.equal(itemMeta({ fieldType: 'string', flags: ['READ_ONLY', 'LAZY_READ'] }), 'string · READ_ONLY, LAZY_READ');
  assert.equal(itemMeta({ resultType: 'void', flags: [] }), 'void');
  assert.equal(itemMeta({ typeObjCode: 'USER' }), 'USER');
  assert.equal(itemMeta({ label: 'Q', arguments: [] }), '');
});

test('visibleAttrs hides null and undefined values but keeps false, 0 and empty arrays', () => {
  const attrs = { label: 'L', enumType: null, url: undefined, fieldType: 'string', flags: [], n: 0, b: false };
  assert.deepEqual(visibleAttrs(attrs), [['fieldType', 'string'], ['flags', []], ['n', 0], ['b', false]]);
});
