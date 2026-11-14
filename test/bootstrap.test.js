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

function router({ page = html, pageStatus = 200, probe = { 23: 200 } } = {}) {
  return async (url) => {
    if (url === EXPLORER) {
      if (pageStatus === 'throw') throw new Error('offline');
      return res(pageStatus, page);
    }
    const m = /\/v(\d+)\.0\/metadata$/.exec(url);
    if (m) return res(probe[m[1]] ?? 400);
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
  const opts = await loadVersions({ host: H, explorerUrl: EXPLORER, fetchFn: router({ page: '<p>x</p>', probe: {} }), cache });
  assert.deepEqual(opts, FALLBACK_VERSIONS);
});

test('explorer unreachable uses cached options before the hard-coded list', async () => {
  const cache = createCache(fakeStorage());
  await loadVersions({ host: H, explorerUrl: EXPLORER, fetchFn: router(), cache });
  const opts = await loadVersions({ host: H, explorerUrl: EXPLORER, fetchFn: router({ pageStatus: 'throw', probe: {} }), cache });
  assert.deepEqual(opts.map((o) => o.value), ['/v21.0', '/v22.0', '/v23.0', '-unsupported']);
});
