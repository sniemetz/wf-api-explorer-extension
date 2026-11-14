import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRefreshJob, describeStatus, STATUS_KEY } from '../extension/lib/refreshJob.js';

const H = 'https://h';

function fakeStorage(initial = {}) {
  const store = { ...initial };
  const writes = [];
  return {
    store,
    writes,
    async get(k) { return k in store ? { [k]: store[k] } : {}; },
    async set(o) { Object.assign(store, o); writes.push(JSON.parse(JSON.stringify(o))); },
  };
}

test('start writes running, runs sync.refresh once, then writes done with the result', async () => {
  const storage = fakeStorage();
  const calls = [];
  const sync = { refresh: async (h, v) => { calls.push([h, v]); return { changed: 2, failed: 0, total: 5 }; } };
  const job = createRefreshJob({ sync, storage, host: H, now: () => 100 });
  await job.start('/v22.0');
  assert.deepEqual(calls, [[H, '/v22.0']]);
  assert.equal(storage.writes[0][STATUS_KEY].state, 'running');
  assert.deepEqual(storage.store[STATUS_KEY], {
    state: 'done', version: '/v22.0', result: { changed: 2, failed: 0, total: 5 }, finishedAt: 100, seen: false,
  });
});

test('a second start while one is running does not start another refresh', async () => {
  let n = 0;
  let release;
  const gate = new Promise((r) => { release = r; });
  const sync = { refresh: async () => { n++; await gate; return { changed: 0, failed: 0, total: 1 }; } };
  const job = createRefreshJob({ sync, storage: fakeStorage(), host: H });
  const a = job.start('/v22.0');
  const b = job.start('/v22.0');
  release();
  await Promise.all([a, b]);
  assert.equal(n, 1);
});

test('a failing refresh writes a failed status and start does not throw', async () => {
  const storage = fakeStorage();
  const job = createRefreshJob({ sync: { refresh: async () => { throw new Error('offline'); } }, storage, host: H, now: () => 7 });
  await job.start('/v22.0');
  assert.deepEqual(storage.store[STATUS_KEY], { state: 'failed', version: '/v22.0', error: 'offline', finishedAt: 7, seen: false });
});

test('a leftover running status from a dead worker becomes failed (interrupted)', async () => {
  const storage = fakeStorage({ [STATUS_KEY]: { state: 'running', version: '/v22.0', startedAt: 1 } });
  const job = createRefreshJob({ sync: { refresh: async () => ({ changed: 0, failed: 0, total: 0 }) }, storage, host: H, now: () => 9 });
  await job.ready;
  assert.equal(storage.store[STATUS_KEY].state, 'failed');
  assert.equal(storage.store[STATUS_KEY].error, 'interrupted');
});

test('refreshVersions runs first; a dropped version falls back to the explorer default', async () => {
  const order = [];
  const sync = { refresh: async (h, v) => { order.push(`refresh ${v}`); return { changed: 0, failed: 0, total: 1 }; } };
  const refreshVersions = async () => { order.push('versions'); return [{ value: '/v21.0', label: 'x' }, { value: '/v22.0', label: 'y' }]; };
  const storage = fakeStorage();
  const job = createRefreshJob({ sync, storage, host: H, refreshVersions });
  await job.start('/v15.0');
  assert.deepEqual(order, ['versions', 'refresh /v22.0']);
  assert.equal(storage.store[STATUS_KEY].version, '/v22.0');
});

test('describeStatus texts', () => {
  assert.deepEqual(describeStatus(undefined), { busy: false, text: '' });
  assert.deepEqual(describeStatus({ state: 'running' }), { busy: true, text: '' });
  const done = (result) => describeStatus({ state: 'done', result });
  assert.equal(done({ changed: 0, failed: 0, total: 9 }).text, 'Already up to date');
  assert.equal(done({ changed: 1, failed: 0, total: 9 }).text, 'Updated 1 item');
  assert.equal(done({ changed: 3, failed: 0, total: 9 }).text, 'Updated 3 items');
  assert.equal(done({ changed: 0, failed: 3, total: 10 }).text, 'Refresh incomplete: 3 of 10 objects failed');
  assert.equal(done({ changed: 2, failed: 3, total: 10 }).text, 'Refresh incomplete: 3 of 10 objects failed, 2 updated');
  assert.equal(describeStatus({ state: 'failed', error: 'offline' }).text, 'Refresh failed: could not reach Workfront. Cached data kept.');
  assert.equal(describeStatus({ state: 'failed', error: 'interrupted' }).text, 'Refresh was interrupted. Cached data kept.');
});
