import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FALLBACK_VERSIONS,
  parseVersionOptions,
  highestVersion,
  probeVersions,
  metadataUrl,
  defaultVersion,
  statusOf,
  cachedVersions,
} from '../extension/lib/versions.js';

const HTML = `
<div><select ng-change="updateAPIVersion()" ng-model="apiversion">
  <option value="/v15.0">API Version 15.0</option>
  <option value="/v16.0">API Version 16.0</option>
  <option value="/v17.0">API Version 17.0</option>
  <option value="/v18.0">API Version 18.0</option>
  <option value="/v19.0">API Version 19.0</option>
  <option value="/v20.0">API Version 20.0</option>
  <option value="/v21.0">API Version 21.0</option>
  <option value="/v22.0" selected="selected">API Version 22.0</option>
  <option value="-unsupported">API Unsupported</option>
</select></div>
<select ng-model="other"><option value="x">X</option></select>`;

test('FALLBACK_VERSIONS has 9 entries ending with unsupported', () => {
  assert.equal(FALLBACK_VERSIONS.length, 9);
  assert.deepEqual(FALLBACK_VERSIONS[0], { value: '/v15.0', label: 'API Version 15.0' });
  assert.deepEqual(FALLBACK_VERSIONS[8], { value: '-unsupported', label: 'API Unsupported' });
});

test('parseVersionOptions reads 9 options from the apiversion select only', () => {
  const opts = parseVersionOptions(HTML);
  assert.equal(opts.length, 9);
  assert.deepEqual(opts[7], { value: '/v22.0', label: 'API Version 22.0' });
  assert.deepEqual(opts[8], { value: '-unsupported', label: 'API Unsupported' });
});

test('parseVersionOptions returns [] for empty or select-less html', () => {
  assert.deepEqual(parseVersionOptions(''), []);
  assert.deepEqual(parseVersionOptions('<p>nothing</p>'), []);
});

test('highestVersion ignores unsupported', () => {
  assert.equal(highestVersion(FALLBACK_VERSIONS).value, '/v22.0');
});

test('probeVersions adds v23.0 and stops at v24.0 (400)', async () => {
  const calls = [];
  const fetchFn = async (url) => {
    calls.push(url);
    return { status: url.includes('/v23.0/') ? 200 : 400 };
  };
  const hits = await probeVersions(FALLBACK_VERSIONS, fetchFn, 'https://h');
  assert.deepEqual(hits, [{ value: '/v23.0', label: 'API Version 23.0', probed: true }]);
  assert.deepEqual(calls, [
    'https://h/attask/api/v23.0/metadata',
    'https://h/attask/api/v24.0/metadata',
  ]);
});

test('probeVersions returns [] when fetch rejects', async () => {
  const hits = await probeVersions(FALLBACK_VERSIONS, async () => { throw new Error('offline'); }, 'https://h');
  assert.deepEqual(hits, []);
});

test('metadataUrl builds list, detail and unsupported urls', () => {
  assert.equal(metadataUrl('https://h', '/v22.0'), 'https://h/attask/api/v22.0/metadata');
  assert.equal(metadataUrl('https://h', '/v22.0', 'PROJ'), 'https://h/attask/api/v22.0/PROJ/metadata');
  assert.equal(metadataUrl('https://h', '-unsupported'), 'https://h/attask/api-unsupported/metadata');
});

test('parseVersionOptions drops values outside the allowlist', () => {
  const bad = `<select ng-model="apiversion">
<option value="/v22.0">ok</option>
<option value="/../evil">bad</option>
<option value="/v22.0?x=1">bad2</option>
<option value="-unsupported">u</option></select>`;
  assert.deepEqual(parseVersionOptions(bad).map((o) => o.value), ['/v22.0', '-unsupported']);
});

test('metadataUrl rejects an invalid version value or objCode', () => {
  assert.throws(() => metadataUrl('https://h', '/../x'));
  assert.throws(() => metadataUrl('https://h', '/v22.0', '../PROJ'));
  assert.throws(() => metadataUrl('https://h', '/v22.0', 'PROJ/x'));
});

test('probeVersions stops after 10 probes even if every answer is 200', async () => {
  let n = 0;
  const hits = await probeVersions(FALLBACK_VERSIONS, async () => { n++; return { status: 200 }; }, 'https://h');
  assert.equal(n, 10);
  assert.equal(hits.length, 10);
});

test('defaultVersion is the highest version the explorer lists, never a probed one', () => {
  const opts = [...FALLBACK_VERSIONS, { value: '/v23.0', label: 'API Version 23.0', probed: true }];
  assert.equal(defaultVersion(opts).value, '/v22.0');
  assert.equal(defaultVersion([{ value: '/v23.0', label: 'x', probed: true }]).value, '/v23.0');
});

test('statusOf reads the status and cancels the body', async () => {
  let cancelled = false;
  const fetchFn = async () => ({ status: 200, body: { cancel: async () => { cancelled = true; } } });
  assert.equal(await statusOf(fetchFn, 'u'), 200);
  assert.equal(cancelled, true);
});

test('cachedVersions keeps unsupported plus the newest numeric versions, 10 in total', () => {
  const opts = [...Array.from({ length: 12 }, (_, i) => ({ value: `/v${i + 15}.0`, label: 'x' })), { value: '-unsupported', label: 'u' }];
  const keep = cachedVersions(opts, 10);
  assert.equal(keep.length, 10);
  assert.equal(keep[0], '/v26.0');
  assert.equal(keep.filter((v) => v !== '-unsupported').length, 9);
  assert.ok(keep.includes('-unsupported'));
  assert.equal(cachedVersions(opts.slice(0, 12), 10).length, 10); // no unsupported offered: 10 numeric
  assert.deepEqual(cachedVersions(opts.slice(8), 10), ['/v26.0', '/v25.0', '/v24.0', '/v23.0', '-unsupported']);
});
