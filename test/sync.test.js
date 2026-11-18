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
  const sleeps = [];
  const sync = createSync({ api, cache, now: () => clock.t, sleep: async (ms) => { sleeps.push(ms); } });
  return { api, cache, sync, calls, clock, sleeps, maxRunning: () => maxRunning, storage };
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

test('checkDetail 401 throws and caches nothing', async () => {
  const { sync, cache } = setup();
  await assert.rejects(sync.checkDetail(H, V, 'ACTLOG'), (e) => e.status === 401);
  assert.equal(await cache.getDetail(H, V, 'ACTLOG'), undefined);
});

test('prefetchAll never exceeds concurrency 5', async () => {
  const codes = Array.from({ length: 12 }, (_, i) => `O${i}`);
  const s = setup({ codes, delay: 5 });
  await s.sync.prefetchAll(H, V, codes);
  assert.equal(s.calls.length, 12);
  assert.ok(s.maxRunning() <= 5, `max ${s.maxRunning()}`);
  assert.ok(s.maxRunning() > 1);
});

test('prefetchAll skips cached codes and retries objects that answered 401', async () => {
  const s = setup({ codes: ['A', 'B', 'ACTLOG'] });
  await s.sync.prefetchAll(H, V, ['A', 'B', 'ACTLOG']);
  assert.deepEqual([...s.calls].sort(), ['A', 'ACTLOG', 'B']);
  s.calls.length = 0;
  await s.sync.prefetchAll(H, V, ['A', 'B', 'ACTLOG']);
  assert.deepEqual(s.calls, ['ACTLOG']);
});

test('prefetchAll continues after a failed object', async () => {
  const s = setup({ codes: ['A', 'B'], failCodes: ['A'] });
  await s.sync.prefetchAll(H, V, ['A', 'B']);
  assert.equal(await s.cache.getDetail(H, V, 'A'), undefined);
  assert.ok(await s.cache.getDetail(H, V, 'B'));
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

test('refreshIfStale: false just under 6 h, true just over', async () => {
  const s = setup({ codes: ['A'] });
  await s.cache.setLastRun(s.clock.t);
  s.clock.t += (6 * 60 - 1) * 60_000;
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

test('refresh returns {changed, failed, total}: first run counts list + all details as changed', async () => {
  const s = setup({ codes: ['A', 'B'] });
  assert.deepEqual(await s.sync.refresh(H, V), { changed: 3, failed: 0, total: 2 });
});

test('refresh returns changed 0 on an unchanged second run', async () => {
  const s = setup({ codes: ['A', 'B'] });
  await s.sync.refresh(H, V);
  assert.deepEqual(await s.sync.refresh(H, V), { changed: 0, failed: 0, total: 2 });
});

test('refresh counts one changed detail', async () => {
  const s = setup({ codes: ['A', 'B'] });
  await s.sync.refresh(H, V);
  const orig = s.api.fetchDetail;
  s.api.fetchDetail = async (h, v, code) => {
    if (code !== 'A') return orig(h, v, code);
    const text = JSON.stringify({ data: { objCode: 'A', extra: 1 } });
    return { text, data: { objCode: 'A', extra: 1 } };
  };
  assert.deepEqual(await s.sync.refresh(H, V), { changed: 1, failed: 0, total: 2 });
});

test('refresh counts 5xx as failures but a 401 (no metadata) is not a failure', async () => {
  const s = setup({ codes: ['A', 'B', 'ACTLOG'], failCodes: ['A'] });
  const r1 = await s.sync.refresh(H, V);
  assert.deepEqual(r1, { changed: 2, failed: 1, total: 3 });
  const r2 = await s.sync.refresh(H, V);
  assert.deepEqual(r2, { changed: 0, failed: 1, total: 3 });
});

test('checkDetail ignores flag order and key order differences between fetches', async () => {
  const s = setup({ codes: ['A'] });
  const a = { objCode: 'A', fields: { f: { flags: ['NOT_GROUPABLE', 'READ_ONLY'], label: 'F' } } };
  const b = { fields: { f: { label: 'F', flags: ['READ_ONLY', 'NOT_GROUPABLE'] } }, objCode: 'A' };
  s.api.fetchDetail = async () => ({ text: JSON.stringify({ data: a }), data: a });
  assert.equal((await s.sync.checkDetail(H, V, 'A')).changed, true);
  s.api.fetchDetail = async () => ({ text: JSON.stringify({ data: b }), data: b });
  assert.equal((await s.sync.checkDetail(H, V, 'A')).changed, false);
});

test('prefetchAll with a gap sleeps between requests and respects the concurrency', async () => {
  const codes = ['A', 'B', 'C', 'D', 'E', 'F'];
  const s = setup({ codes, delay: 5 });
  await s.sync.prefetchAll(H, V, codes, { concurrency: 2, gapMs: 200 });
  assert.equal(s.calls.length, 6);
  assert.ok(s.maxRunning() <= 2, `max ${s.maxRunning()}`);
  assert.ok(s.sleeps.length >= 3 && s.sleeps.every((ms) => ms === 200), JSON.stringify(s.sleeps));
});

test('prefetchAll without a gap never sleeps', async () => {
  const s = setup({ codes: ['A', 'B'] });
  await s.sync.prefetchAll(H, V, ['A', 'B']);
  assert.deepEqual(s.sleeps, []);
});

test('a manual refresh stays fast (5 parallel, no sleep) even after a paced prefetch', async () => {
  const codes = Array.from({ length: 12 }, (_, i) => `O${i}`);
  const s = setup({ codes, delay: 5 });
  await s.sync.prefetchAll(H, V, ['O0'], { concurrency: 1, gapMs: 200 });
  s.sleeps.length = 0;
  await s.sync.refresh(H, V);
  assert.ok(s.maxRunning() > 2, `max ${s.maxRunning()}`);
  assert.deepEqual(s.sleeps, []);
});
