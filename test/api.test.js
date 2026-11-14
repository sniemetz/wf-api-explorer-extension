import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi, ApiError } from '../extension/lib/api.js';

const H = 'https://h';
const res = (status, body = '') => ({ status, ok: status >= 200 && status < 300, text: async () => body });

test('fetchList returns text and the data key parsed', async () => {
  const body = JSON.stringify({ data: { objects: { a: { label: 'A', objCode: 'A' } } } });
  const urls = [];
  const api = createApi(async (u) => { urls.push(u); return res(200, body); });
  const out = await api.fetchList(H, '/v22.0');
  assert.equal(out.text, body);
  assert.deepEqual(out.data, { objects: { a: { label: 'A', objCode: 'A' } } });
  assert.deepEqual(urls, ['https://h/attask/api/v22.0/metadata']);
});

test('fetchDetail 401 throws ApiError with status and url', async () => {
  const api = createApi(async () => res(401));
  await assert.rejects(api.fetchDetail(H, '/v22.0', 'ACTLOG'), (e) => {
    assert.ok(e instanceof ApiError);
    assert.equal(e.status, 401);
    assert.equal(e.url, 'https://h/attask/api/v22.0/ACTLOG/metadata');
    return true;
  });
});

test('non-2xx throws ApiError with that status', async () => {
  const api = createApi(async () => res(500), { sleep: async () => {} });
  await assert.rejects(api.fetchList(H, '/v22.0'), (e) => e instanceof ApiError && e.status === 500);
});

test('network failure throws ApiError with status null', async () => {
  const api = createApi(async () => { throw new TypeError('Failed to fetch'); }, { sleep: async () => {} });
  await assert.rejects(api.fetchList(H, '/v22.0'), (e) => e instanceof ApiError && e.status === null);
});

test('concurrent fetchDetail for one object calls fetch once', async () => {
  let n = 0;
  const api = createApi(async () => { n++; await new Promise((r) => setTimeout(r, 10)); return res(200, '{"data":{}}'); });
  const [a, b] = await Promise.all([
    api.fetchDetail(H, '/v22.0', 'PROJ'),
    api.fetchDetail(H, '/v22.0', 'PROJ'),
  ]);
  assert.equal(n, 1);
  assert.equal(a, b);
});

test('a failed request is not cached as in-flight', async () => {
  let n = 0;
  const api = createApi(async () => { n++; return n <= 2 ? res(500) : res(200, '{"data":{}}'); }, { sleep: async () => {} });
  await assert.rejects(api.fetchDetail(H, '/v22.0', 'PROJ')); // 500 + one retry = 2 calls
  await api.fetchDetail(H, '/v22.0', 'PROJ');
  assert.equal(n, 3);
});

test('200 with a non-JSON body throws ApiError with status 200 and url', async () => {
  const api = createApi(async () => res(200, '<html>portal</html>'));
  await assert.rejects(api.fetchList(H, '/v22.0'), (e) =>
    e instanceof ApiError && e.status === 200 && e.url === 'https://h/attask/api/v22.0/metadata');
});

test('200 JSON without an object "data" key throws ApiError', async () => {
  const api = createApi(async () => res(200, '{"foo":1}'));
  await assert.rejects(api.fetchDetail(H, '/v22.0', 'PROJ'), (e) => e instanceof ApiError && e.status === 200);
});

test('a 200 response with the wrong shape is rejected', async () => {
  const list = createApi(async () => res(200, JSON.stringify({ data: { objects: { a: { label: 'A', objCode: '../x' } } } })));
  await assert.rejects(list.fetchList(H, '/v22.0'), (e) => e instanceof ApiError && /shape/.test(e.message));
  const detail = createApi(async () => res(200, JSON.stringify({ data: { fields: [] } })));
  await assert.rejects(detail.fetchDetail(H, '/v22.0', 'TASK'), (e) => e instanceof ApiError && /shape/.test(e.message));
});

const hdr = (v) => ({ get: (k) => (k === 'retry-after' ? v : null) });

test('retries once on 5xx, then succeeds', async () => {
  let n = 0;
  const body = JSON.stringify({ data: { objects: {} } });
  const api = createApi(async () => (++n === 1 ? res(503) : res(200, body)), { sleep: async () => {} });
  assert.deepEqual((await api.fetchList(H, '/v22.0')).data, { objects: {} });
  assert.equal(n, 2);
});

test('retries once on a network error, then reports status null', async () => {
  let n = 0;
  const api = createApi(async () => { n++; throw new Error('offline'); }, { sleep: async () => {} });
  await assert.rejects(api.fetchList(H, '/v22.0'), (e) => e.status === null);
  assert.equal(n, 2);
});

test('429 honors Retry-After (capped at 10s)', async () => {
  const waits = [];
  let n = 0;
  const api = createApi(async () => (++n < 3 ? { ...res(429), headers: hdr('60') } : res(200, '{"data":{"objects":{}}}')), { sleep: async (ms) => { waits.push(ms); } });
  await assert.rejects(api.fetchList(H, '/v22.0'), (e) => e.status === 429); // only one retry
  assert.deepEqual(waits, [10000]);
});

test('4xx is not retried', async () => {
  let n = 0;
  const api = createApi(async () => { n++; return res(401); }, { sleep: async () => {} });
  await assert.rejects(api.fetchDetail(H, '/v22.0', 'ACTLOG'), (e) => e.status === 401);
  assert.equal(n, 1);
});
