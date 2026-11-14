import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi, ApiError } from '../extension/lib/api.js';

const H = 'https://h';
const res = (status, body = '') => ({ status, ok: status >= 200 && status < 300, text: async () => body });

test('fetchList returns text and the data key parsed', async () => {
  const body = JSON.stringify({ data: { objects: { a: { objCode: 'A' } } } });
  const urls = [];
  const api = createApi(async (u) => { urls.push(u); return res(200, body); });
  const out = await api.fetchList(H, '/v22.0');
  assert.equal(out.text, body);
  assert.deepEqual(out.data, { objects: { a: { objCode: 'A' } } });
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
  const api = createApi(async () => res(500));
  await assert.rejects(api.fetchList(H, '/v22.0'), (e) => e instanceof ApiError && e.status === 500);
});

test('network failure throws ApiError with status null', async () => {
  const api = createApi(async () => { throw new TypeError('Failed to fetch'); });
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
  const api = createApi(async () => { n++; return n === 1 ? res(500) : res(200, '{"data":{}}'); });
  await assert.rejects(api.fetchDetail(H, '/v22.0', 'PROJ'));
  await api.fetchDetail(H, '/v22.0', 'PROJ');
  assert.equal(n, 2);
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
