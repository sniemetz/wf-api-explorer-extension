import { sha256, stableStringify } from './hash.js';
import { ApiError } from './api.js';
import { isValidObjCode } from './versions.js';

const STALE_MS = 6 * 3600000;

// A 4xx answer means the object has no metadata for us. It is not a refresh failure.
export const isNoData = (err) => err instanceof ApiError && err.status >= 400 && err.status < 500;

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createSync({ api, cache, now = Date.now, sleep = defaultSleep }) {
  // Run task(item) for every item with at most `concurrency` in flight; wait `gapMs` after each item.
  // Each call has its own pool, so a paced background run never slows a user-started refresh.
  async function runPool(items, task, { concurrency = 5, gapMs = 0 } = {}) {
    const results = new Array(items.length);
    let next = 0;
    async function worker() {
      while (next < items.length) {
        const i = next++;
        results[i] = await task(items[i]).then((value) => ({ ok: true, value }), () => ({ ok: false }));
        if (gapMs && next < items.length) await sleep(gapMs);
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
    return results;
  }

  async function checkList(host, ver) {
    const { text, data } = await api.fetchList(host, ver);
    const hash = await sha256(stableStringify(data));
    const prev = await cache.getList(host, ver);
    if (prev && prev.hash === hash) return { changed: false, entry: prev };
    const entry = { hash, data, fetchedAt: now() };
    await cache.setList(host, ver, entry);
    return { changed: true, entry };
  }

  async function checkDetail(host, ver, code) {
    const prev = await cache.getDetail(host, ver, code);
    const res = await api.fetchDetail(host, ver, code);
    const hash = await sha256(stableStringify(res.data));
    if (prev && prev.hash === hash) return { changed: false, entry: prev };
    const entry = { hash, data: res.data, fetchedAt: now() };
    await cache.setDetail(host, ver, code, entry);
    return { changed: true, entry };
  }

  async function prefetchAll(host, ver, codes, pace = {}) {
    await runPool(codes.filter(isValidObjCode), async (code) => {
      if (await cache.getDetail(host, ver, code)) return;
      await checkDetail(host, ver, code);
    }, pace);
  }

  async function refresh(host, ver, pace = {}) {
    const { entry, changed: listChanged } = await checkList(host, ver);
    const codes = Object.values(entry.data.objects).map((o) => o.objCode).filter(isValidObjCode);
    const results = await runPool(codes, async (code) => {
      try {
        return (await checkDetail(host, ver, code)).changed;
      } catch (err) {
        if (isNoData(err)) return false; // e.g. 401: the object has no public metadata
        throw err;
      }
    }, pace);
    const failed = results.filter((x) => !x.ok).length;
    const changed = (listChanged ? 1 : 0) + results.filter((x) => x.ok && x.value).length;
    if (!failed) await cache.setLastRun(now());
    return { changed, failed, total: codes.length };
  }

  async function refreshIfStale(host, ver, maxAgeMs = STALE_MS) {
    const last = await cache.getLastRun();
    if (last !== undefined && now() - last < maxAgeMs) return false;
    await refresh(host, ver);
    return true;
  }

  return { checkList, checkDetail, prefetchAll, refresh, refreshIfStale };
}
