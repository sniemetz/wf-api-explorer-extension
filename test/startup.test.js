import { test } from 'node:test';
import assert from 'node:assert/strict';
import { populate, prefetchFromCache } from '../extension/lib/startup.js';

const H = 'https://h';
const OPTIONS = [{ value: '/v22.0', label: 'API Version 22.0' }, { value: '/v23.0', label: 'API Version 23.0' }];

function deps({ checkListFails = false } = {}) {
  const calls = { alarms: [], prefetch: [], set: [] };
  return {
    calls,
    args: {
      host: H,
      getVersions: async () => OPTIONS,
      storage: { set: async (o) => { calls.set.push(o); } },
      alarms: { create: async (name, info) => { calls.alarms.push([name, info]); } },
      sync: {
        checkList: async () => {
          if (checkListFails) throw new Error('offline');
          return { entry: { data: { objects: { a: { objCode: 'A' }, b: { objCode: 'B' } } } } };
        },
        prefetchAll: async (host, ver, codes) => { calls.prefetch.push([host, ver, codes]); },
      },
    },
  };
}

test('populate creates the hourly alarm even when the list fetch fails', async () => {
  const d = deps({ checkListFails: true });
  await assert.rejects(populate(d.args));
  assert.deepEqual(d.calls.alarms, [['refresh', { periodInMinutes: 60 }]]);
});

test('populate selects the highest version and prefetches its objects', async () => {
  const d = deps();
  await populate(d.args);
  assert.deepEqual(d.calls.set, [{ selectedVersion: '/v23.0' }]);
  assert.deepEqual(d.calls.prefetch, [[H, '/v23.0', ['A', 'B']]]);
  assert.equal(d.calls.alarms.length, 1);
});

test('prefetchFromCache uses the cached list and does not fetch it again', async () => {
  const prefetched = [];
  let listFetches = 0;
  const cache = { getList: async () => ({ data: { objects: { a: { objCode: 'A' }, b: { objCode: 'B' } } } }) };
  const sync = {
    checkList: async () => { listFetches++; },
    prefetchAll: async (h, v, codes) => { prefetched.push([h, v, codes]); },
  };
  await prefetchFromCache({ host: H, version: '/v22.0', cache, sync });
  assert.equal(listFetches, 0);
  assert.deepEqual(prefetched, [[H, '/v22.0', ['A', 'B']]]);
});

test('prefetchFromCache fetches the list only when none is cached', async () => {
  const prefetched = [];
  const cache = { getList: async () => undefined };
  const sync = {
    checkList: async () => ({ entry: { data: { objects: { c: { objCode: 'C' } } } } }),
    prefetchAll: async (h, v, codes) => { prefetched.push(codes); },
  };
  await prefetchFromCache({ host: H, version: '/v22.0', cache, sync });
  assert.deepEqual(prefetched, [['C']]);
});
