import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stableStringify } from '../extension/lib/hash.js';

test('object key order does not matter', () => {
  assert.equal(stableStringify({ a: 1, b: { c: 2, d: 3 } }), stableStringify({ b: { d: 3, c: 2 }, a: 1 }));
});

test('flags arrays are compared as sets (order does not matter)', () => {
  assert.equal(
    stableStringify({ x: { flags: ['NOT_GROUPABLE', 'READ_ONLY'] } }),
    stableStringify({ x: { flags: ['READ_ONLY', 'NOT_GROUPABLE'] } }),
  );
});

test('other arrays keep their order (arguments, possibleValues)', () => {
  assert.notEqual(
    stableStringify({ arguments: [{ name: 'a' }, { name: 'b' }] }),
    stableStringify({ arguments: [{ name: 'b' }, { name: 'a' }] }),
  );
});

test('different values give different strings', () => {
  assert.notEqual(stableStringify({ a: 1 }), stableStringify({ a: 2 }));
});
