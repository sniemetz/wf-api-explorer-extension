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

test('evictExcept drops list/detail entries of versions not offered, keeps the rest', async () => {
  const storage = fakeStorage();
  storage.remove = async (keys) => { for (const k of keys) delete storage.store[k]; };
  storage.get = async (k) => (k === null ? { ...storage.store } : (k in storage.store ? { [k]: storage.store[k] } : {}));
  const c = createCache(storage);
  await c.setList(H, '/v21.0', { n: 1 });
  await c.setDetail(H, '/v21.0', 'TASK', { n: 1 });
  await c.setList(H, '/v22.0', { n: 2 });
  await c.setDetail(H, '/v22.0', 'TASK', { n: 2 });
  await c.setDetail('https://other', '/v21.0', 'TASK', { n: 3 });
  await c.setVersions(H, { data: [] });
  assert.equal(await c.evictExcept(H, ['/v22.0']), 2);
  assert.equal(await c.getList(H, '/v21.0'), undefined);
  assert.equal(await c.getDetail(H, '/v21.0', 'TASK'), undefined);
  assert.ok(await c.getList(H, '/v22.0'));
  assert.ok(await c.getDetail('https://other', '/v21.0', 'TASK'));
  assert.ok(await c.getVersions(H));
});

test('versions round trip', async () => {
  const c = createCache(fakeStorage());
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
