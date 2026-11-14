import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCache } from '../extension/lib/cache.js';
import { createSync } from '../extension/lib/sync.js';
import { ApiError } from '../extension/lib/api.js';

const H = 'https://h';
const V = '/v22.0';

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

const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

function listText(codes) {
  const objects = {};
  for (const c of codes) objects[c.toLowerCase()] = { name: c, label: c, objCode: c, url: '' };
  const text = JSON.stringify({ data: { objects } });
  return { text, data: { objects } };
}

function setup({ codes = ['A', 'B'], delay = 0, failCodes = [] } = {}) {
  const calls = [];
  let running = 0;
  let maxRunning = 0;
  const api = {
    async fetchList() { return listText(codes); },
    async fetchDetail(host, ver, code) {
      calls.push(code);
      running++;
      maxRunning = Math.max(maxRunning, running);
      if (delay) await tick(delay);
      running--;
      if (code === 'ACTLOG') throw new ApiError('HTTP 401', 401, 'u');
      if (failCodes.includes(code)) throw new ApiError('HTTP 500', 500, 'u');
      const text = JSON.stringify({ data: { objCode: code } });
      return { text, data: { objCode: code } };
    },
  };
  const storage = fakeStorage();
  const cache = createCache(storage);
  const clock = { t: 1_000_000 };
  const sync = createSync({ api, cache, now: () => clock.t });
  return { api, cache, sync, calls, clock, maxRunning: () => maxRunning, storage };
}

test('checkList unchanged hash does not rewrite the cache', async () => {
  const { sync, cache } = setup();
  const first = await sync.checkList(H, V);
  assert.equal(first.changed, true);
  let writes = 0;
  const orig = cache.setList;
  cache.setList = (...a) => { writes++; return orig(...a); };
  const second = await sync.checkList(H, V);
  assert.equal(second.changed, false);
  assert.equal(writes, 0);
});

test('checkList changed hash writes the new entry', async () => {
  const s = setup({ codes: ['A'] });
  await s.sync.checkList(H, V);
  s.api.fetchList = async () => listText(['A', 'B']);
  const out = await s.sync.checkList(H, V);
  assert.equal(out.changed, true);
  assert.ok((await s.cache.getList(H, V)).data.objects.b);
});

test('checkDetail 401 stores needsLogin once', async () => {
  const { sync, cache } = setup();
  const first = await sync.checkDetail(H, V, 'ACTLOG');
  assert.equal(first.changed, true);
  assert.deepEqual(await cache.getDetail(H, V, 'ACTLOG'), { needsLogin: true });
  const second = await sync.checkDetail(H, V, 'ACTLOG');
  assert.equal(second.changed, false);
});

test('prefetchAll never exceeds concurrency 5', async () => {
  const codes = Array.from({ length: 12 }, (_, i) => `O${i}`);
  const s = setup({ codes, delay: 5 });
  await s.sync.prefetchAll(H, V, codes);
  assert.equal(s.calls.length, 12);
  assert.ok(s.maxRunning() <= 5, `max ${s.maxRunning()}`);
  assert.ok(s.maxRunning() > 1);
});

test('prefetchAll skips cached codes and needsLogin codes', async () => {
  const s = setup({ codes: ['A', 'B', 'ACTLOG'] });
  await s.sync.prefetchAll(H, V, ['A', 'B', 'ACTLOG']);
  assert.deepEqual([...s.calls].sort(), ['A', 'ACTLOG', 'B']);
  s.calls.length = 0;
  await s.sync.prefetchAll(H, V, ['A', 'B', 'ACTLOG']);
  assert.deepEqual(s.calls, []);
});

test('prefetchAll continues after a failed object', async () => {
  const s = setup({ codes: ['A', 'B'], failCodes: ['A'] });
  await s.sync.prefetchAll(H, V, ['A', 'B']);
  assert.equal(await s.cache.getDetail(H, V, 'A'), undefined);
  assert.ok(await s.cache.getDetail(H, V, 'B'));
});

test('prioritise moves a queued code to the front', async () => {
  const s = setup({ codes: ['A', 'B', 'C', 'D'], delay: 5 });
  const p = s.sync.prefetchAll(H, V, ['A', 'B', 'C', 'D'], { concurrency: 1 });
  s.sync.prioritise('D');
  await p;
  assert.deepEqual(s.calls, ['A', 'D', 'B', 'C']);
});

test('refresh sets lastRun and rewrites only changed details', async () => {
  const s = setup({ codes: ['A', 'B'] });
  await s.sync.refresh(H, V);
  assert.equal(await s.cache.getLastRun(), 1_000_000);
  assert.ok(await s.cache.getDetail(H, V, 'A'));
  let writes = 0;
  const orig = s.cache.setDetail;
  s.cache.setDetail = (...a) => { writes++; return orig(...a); };
  s.clock.t += 10;
  await s.sync.refresh(H, V);
  assert.equal(writes, 0);
});

test('refreshIfStale: false at 59 min, true at 61 min', async () => {
  const s = setup({ codes: ['A'] });
  await s.cache.setLastRun(s.clock.t);
  s.clock.t += 59 * 60_000;
  assert.equal(await s.sync.refreshIfStale(H, V), false);
  s.clock.t += 2 * 60_000;
  assert.equal(await s.sync.refreshIfStale(H, V), true);
});

test('refreshIfStale runs when lastRun is missing', async () => {
  const s = setup({ codes: ['A'] });
  assert.equal(await s.sync.refreshIfStale(H, V), true);
});

test('refresh does not set lastRun when a detail fetch fails', async () => {
  const s = setup({ codes: ['A', 'B'], failCodes: ['A'] });
  await s.sync.refresh(H, V);
  assert.equal(await s.cache.getLastRun(), undefined);
  assert.ok(await s.cache.getDetail(H, V, 'B'));
});

test('refresh skips object codes outside the allowlist', async () => {
  const s = setup({ codes: ['A', '../x', 'B|C'] });
  await s.sync.refresh(H, V);
  assert.deepEqual([...s.calls].sort(), ['A']);
});
