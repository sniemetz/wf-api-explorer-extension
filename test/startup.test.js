import { test } from 'node:test';
import assert from 'node:assert/strict';
import { populate, prefetchFromCache, checkListAndPrefetch } from '../extension/lib/startup.js';
import { BACKGROUND_PACE } from '../extension/lib/config.js';

const H = 'https://h';
const OPTIONS = [{ value: '/v21.0', label: 'API Version 21.0' }, { value: '/v22.0', label: 'API Version 22.0' }, { value: '/v23.0', label: 'API Version 23.0', probed: true }];

function deps({ checkListFails = false, selected } = {}) {
  const calls = { alarms: [], prefetch: [], set: [] };
  return {
    calls,
    args: {
      host: H,
      getVersions: async () => OPTIONS,
      storage: { get: async () => (selected ? { selectedVersion: selected } : {}), set: async (o) => { calls.set.push(o); } },
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
  assert.deepEqual(d.calls.alarms, [['refresh', { periodInMinutes: 360 }]]);
});

test('populate selects the explorer default (not a probed version) and prefetches its objects', async () => {
  const d = deps();
  await populate(d.args);
  assert.deepEqual(d.calls.set, [{ selectedVersion: '/v22.0' }]);
  assert.deepEqual(d.calls.prefetch, [[H, '/v22.0', ['A', 'B']]]);
  assert.equal(d.calls.alarms.length, 1);
});

test('populate keeps the user-selected version while it is still offered', async () => {
  const d = deps({ selected: '/v21.0' });
  await populate(d.args);
  assert.deepEqual(d.calls.set, []);
  assert.deepEqual(d.calls.prefetch, [[H, '/v21.0', ['A', 'B']]]);
});

test('populate replaces a selected version the dropdown no longer offers', async () => {
  const d = deps({ selected: '/v15.0' });
  await populate(d.args);
  assert.deepEqual(d.calls.set, [{ selectedVersion: '/v22.0' }]);
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

test('checkListAndPrefetch checks the list once and prefetches only via prefetchAll (no refresh)', async () => {
  const calls = [];
  const sync = {
    checkList: async () => { calls.push('list'); return { entry: { data: { objects: { a: { objCode: 'A' } } } } }; },
    prefetchAll: async (h, v, codes) => { calls.push(['prefetch', codes]); },
    refresh: async () => { calls.push('refresh'); },
  };
  await checkListAndPrefetch({ host: H, version: '/v22.0', sync });
  assert.deepEqual(calls, ['list', ['prefetch', ['A']]]);
});

test('background prefetches use the gentle pace', async () => {
  const paces = [];
  const sync = {
    checkList: async () => ({ entry: { data: { objects: { a: { objCode: 'A' } } } } }),
    prefetchAll: async (h, v, codes, pace) => { paces.push(pace); },
  };
  await prefetchFromCache({ host: H, version: '/v22.0', cache: { getList: async () => undefined }, sync });
  await checkListAndPrefetch({ host: H, version: '/v22.0', sync });
  assert.deepEqual(paces, [BACKGROUND_PACE, BACKGROUND_PACE]);
  assert.deepEqual(BACKGROUND_PACE, { concurrency: 2, gapMs: 200 });
});
