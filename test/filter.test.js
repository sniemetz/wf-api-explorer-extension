import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterObjects, filterItems } from '../extension/lib/filter.js';
import { HOST, EXPLORER_URL } from '../extension/lib/config.js';

const OBJS = [
  { name: 'Project', label: 'Project', objCode: 'PROJ', url: '' },
  { name: 'Portfolio', label: 'Portfolio', objCode: 'PORT', url: '' },
  { name: 'Task', label: 'Task', objCode: 'TASK', url: '' },
];

test('"proj" finds Project by label and code', () => {
  assert.deepEqual(filterObjects(OBJS, 'proj').map((o) => o.objCode), ['PROJ']);
});

test('label match is prefix, code match is substring', () => {
  assert.deepEqual(filterObjects(OBJS, 'ask').map((o) => o.objCode), ['TASK']);
  assert.deepEqual(filterObjects(OBJS, 'rtfo').map((o) => o.objCode), []);
});

test('no match returns [] and empty query returns all', () => {
  assert.deepEqual(filterObjects(OBJS, 'zzz'), []);
  assert.equal(filterObjects(OBJS, '').length, 3);
});

test('filterItems matches name and label, case-insensitive substring', () => {
  const entries = [['actualCost', { label: 'Actual Cost' }], ['status', { label: 'Status' }]];
  assert.deepEqual(filterItems(entries, 'COST').map((e) => e[0]), ['actualCost']);
  assert.deepEqual(filterItems(entries, 'stat').map((e) => e[0]), ['status']);
  assert.deepEqual(filterItems(entries, 'nope'), []);
  assert.equal(filterItems(entries, '').length, 2);
});

test('config constants', () => {
  assert.equal(HOST, 'https://api-cl01.my.workfront.com');
  assert.equal(EXPLORER_URL, 'https://developersupport.workfront.com/page-api-explorer.html');
});
