import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sha256 } from '../extension/lib/hash.js';
import { createCache } from '../extension/lib/cache.js';

function fakeStorage() {
  const store = {};
  return {
    store,
    async get(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      const out = {};
      for (const k of list) if (k in store) out[k] = store[k];
      return out;
    },
    async set(obj) { Object.assign(store, obj); },
  };
}

const H = 'https://h';

test('sha256 of "abc" matches the known digest', async () => {
  assert.equal(
    await sha256('abc'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
});

test('list round trip and missing key returns undefined', async () => {
  const c = createCache(fakeStorage());
  assert.equal(await c.getList(H, '/v22.0'), undefined);
  const entry = { hash: 'x', data: { objects: {} }, fetchedAt: 1 };
  await c.setList(H, '/v22.0', entry);
  assert.deepEqual(await c.getList(H, '/v22.0'), entry);
});

test('detail round trip, versions do not collide', async () => {
  const c = createCache(fakeStorage());
  await c.setDetail(H, '/v22.0', 'PROJ', { hash: 'a', data: { n: 22 }, fetchedAt: 1 });
  await c.setDetail(H, '/v23.0', 'PROJ', { hash: 'b', data: { n: 23 }, fetchedAt: 2 });
  assert.equal((await c.getDetail(H, '/v22.0', 'PROJ')).data.n, 22);
  assert.equal((await c.getDetail(H, '/v23.0', 'PROJ')).data.n, 23);
  assert.equal(await c.getDetail(H, '/v22.0', 'TASK'), undefined);
});

test('needsLogin entry round trips', async () => {
  const c = createCache(fakeStorage());
  await c.setDetail(H, '/v22.0', 'ACTLOG', { needsLogin: true });
  assert.deepEqual(await c.getDetail(H, '/v22.0', 'ACTLOG'), { needsLogin: true });
});

test('versions and lastRun round trip', async () => {
  const c = createCache(fakeStorage());
  assert.equal(await c.getLastRun(), undefined);
  await c.setLastRun(123);
  assert.equal(await c.getLastRun(), 123);
  const v = { hash: 'v', data: [{ value: '/v22.0', label: 'API Version 22.0' }], fetchedAt: 1 };
  await c.setVersions(H, v);
  assert.deepEqual(await c.getVersions(H), v);
});

test('key format uses pipes', async () => {
  const s = fakeStorage();
  const c = createCache(s);
  await c.setList(H, '/v22.0', { hash: 'x' });
  await c.setDetail(H, '/v22.0', 'PROJ', { hash: 'y' });
  assert.ok('list|https://h|/v22.0' in s.store);
  assert.ok('detail|https://h|/v22.0|PROJ' in s.store);
});
