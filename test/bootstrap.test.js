import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCache } from '../extension/lib/cache.js';
import { FALLBACK_VERSIONS } from '../extension/lib/versions.js';
import { loadVersions } from '../extension/lib/bootstrap.js';

const H = 'https://h';
const EXPLORER = 'https://e/page.html';

function fakeStorage() {
  const store = {};
  return {
    async get(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      const out = {};
      for (const k of list) if (k in store) out[k] = store[k];
      return out;
    },
    async set(obj) { Object.assign(store, obj); },
  };
}

const html = `<select ng-model="apiversion">
<option value="/v21.0">API Version 21.0</option>
<option value="/v22.0">API Version 22.0</option>
<option value="-unsupported">API Unsupported</option></select>`;

const res = (status, body = '') => ({ status, ok: status < 300, text: async () => body });

function router({ page = html, pageStatus = 200, ok = [21, 22, 23], throwMeta = false } = {}) {
  return async (url) => {
    if (url === EXPLORER) {
      if (pageStatus === 'throw') throw new Error('offline');
      return res(pageStatus, page);
    }
    if (throwMeta) throw new Error('offline');
    if (url.endsWith('/attask/api-unsupported/metadata')) return res(200);
    const m = /\/v(\d+)\.0\/metadata$/.exec(url);
    if (m) return res(ok.includes(Number(m[1])) ? 200 : 400);
    return res(404);
  };
}

test('parsed options plus probe hit, unsupported stays last', async () => {
  const cache = createCache(fakeStorage());
  const opts = await loadVersions({ host: H, explorerUrl: EXPLORER, fetchFn: router(), cache });
  assert.deepEqual(opts.map((o) => o.value), ['/v21.0', '/v22.0', '/v23.0', '-unsupported']);
  assert.equal(opts[2].label, 'API Version 23.0');
});

test('result is cached', async () => {
  const cache = createCache(fakeStorage());
  const opts = await loadVersions({ host: H, explorerUrl: EXPLORER, fetchFn: router(), cache });
  assert.deepEqual((await cache.getVersions(H)).data, opts);
});

test('malformed explorer html falls back to hard-coded list', async () => {
  const cache = createCache(fakeStorage());
  const opts = await loadVersions({ host: H, explorerUrl: EXPLORER, fetchFn: router({ page: '<p>x</p>', ok: [15, 16, 17, 18, 19, 20, 21, 22] }), cache });
  assert.deepEqual(opts, FALLBACK_VERSIONS);
});

test('explorer unreachable uses cached options before the hard-coded list', async () => {
  const cache = createCache(fakeStorage());
  await loadVersions({ host: H, explorerUrl: EXPLORER, fetchFn: router(), cache });
  const opts = await loadVersions({ host: H, explorerUrl: EXPLORER, fetchFn: router({ pageStatus: 'throw' }), cache });
  assert.deepEqual(opts.map((o) => o.value), ['/v21.0', '/v22.0', '/v23.0', '-unsupported']);
});

test('versions whose metadata is not HTTP 200 are removed from the list', async () => {
  const cache = createCache(fakeStorage());
  const opts = await loadVersions({ host: H, explorerUrl: EXPLORER, fetchFn: router({ ok: [22] }), cache });
  assert.deepEqual(opts.map((o) => o.value), ['/v22.0', '-unsupported']);
});

test('network errors while validating keep the options (cannot tell)', async () => {
  const cache = createCache(fakeStorage());
  const opts = await loadVersions({ host: H, explorerUrl: EXPLORER, fetchFn: router({ throwMeta: true }), cache });
  assert.deepEqual(opts.map((o) => o.value), ['/v21.0', '/v22.0', '-unsupported']);
});

test('if no numeric version survives validation, the unvalidated list is kept', async () => {
  const cache = createCache(fakeStorage());
  const opts = await loadVersions({ host: H, explorerUrl: EXPLORER, fetchFn: router({ ok: [] }), cache });
  assert.deepEqual(opts.map((o) => o.value), ['/v21.0', '/v22.0', '-unsupported']);
});

test('a page that lists only "unsupported" falls back to the hard-coded list', async () => {
  const cache = createCache(fakeStorage());
  const page = '<select ng-model="apiversion"><option value="-unsupported">API Unsupported</option></select>';
  const opts = await loadVersions({ host: H, explorerUrl: EXPLORER, fetchFn: router({ page, ok: [15, 16, 17, 18, 19, 20, 21, 22] }), cache });
  assert.deepEqual(opts, FALLBACK_VERSIONS);
});

test('probed versions are flagged', async () => {
  const cache = createCache(fakeStorage());
  const opts = await loadVersions({ host: H, explorerUrl: EXPLORER, fetchFn: router(), cache });
  assert.deepEqual(opts.filter((o) => o.probed).map((o) => o.value), ['/v23.0']);
});

test('cached entries of versions no longer offered are evicted', async () => {
  const store = {};
  const storage = {
    async get(k) { return k === null ? { ...store } : (k in store ? { [k]: store[k] } : {}); },
    async set(o) { Object.assign(store, o); },
    async remove(keys) { for (const k of keys) delete store[k]; },
  };
  const cache = createCache(storage);
  await cache.setList(H, '/v19.0', { n: 1 });
  await cache.setList(H, '/v22.0', { n: 2 });
  await loadVersions({ host: H, explorerUrl: EXPLORER, fetchFn: router(), cache });
  assert.equal(await cache.getList(H, '/v19.0'), undefined);
  assert.ok(await cache.getList(H, '/v22.0'));
});

test('existence checks cancel the response body', async () => {
  const cache = createCache(fakeStorage());
  let cancelled = 0;
  const inner = router();
  const fetchFn = async (url) => {
    const r = await inner(url);
    return url.endsWith('/metadata') ? { ...r, body: { cancel: async () => { cancelled++; } } } : r;
  };
  await loadVersions({ host: H, explorerUrl: EXPLORER, fetchFn, cache });
  assert.ok(cancelled >= 4, `cancelled ${cancelled}`);
});
