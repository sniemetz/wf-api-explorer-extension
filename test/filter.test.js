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

test('3+ characters match anywhere in the label or the API code', () => {
  assert.deepEqual(filterObjects(OBJS, 'ask').map((o) => o.objCode), ['TASK']);
  assert.deepEqual(filterObjects(OBJS, 'rtfo').map((o) => o.objCode), ['PORT']); // inside "Portfolio"
  assert.deepEqual(filterObjects(OBJS, 'ORT').map((o) => o.objCode), ['PORT']);
});

const VER = [
  { label: 'Document Version', objCode: 'DOCV' },
  { label: 'Stage Approver', objCode: 'STGAPR' },
  { label: 'Baseline', objCode: 'BASE' },
];

test('"ver" finds every label containing it, in any position', () => {
  assert.deepEqual(filterObjects(VER, 'ver').map((o) => o.objCode), ['DOCV', 'STGAPR']);
  assert.deepEqual(filterObjects(VER, 'document ver').map((o) => o.objCode), ['DOCV']);
});

test('1-2 characters match only the start of a label word (or inside the code)', () => {
  assert.deepEqual(filterObjects(VER, 've').map((o) => o.objCode), ['DOCV']); // Version word + code
  assert.deepEqual(filterObjects(VER, 'er').map((o) => o.objCode), []);
  assert.deepEqual(filterObjects(VER, 'ap').map((o) => o.objCode), ['STGAPR']);
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
