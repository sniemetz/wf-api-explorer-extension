import { sha256 } from './hash.js';
import { ApiError } from './api.js';
import { isValidObjCode } from './versions.js';

const HOUR_MS = 3600000;

export function createSync({ api, cache, now = Date.now }) {
  const queue = [];
  let running = 0;
  let limit = 5;

  function pump() {
    while (running < limit && queue.length) {
      const job = queue.shift();
      running++;
      job.run()
        .then((value) => ({ ok: true, value }), () => ({ ok: false }))
        .then((result) => {
          running--;
          job.resolve(result);
          pump();
        });
    }
  }

  function enqueue(code, run) {
    return new Promise((resolve) => {
      queue.push({ code, run, resolve });
      pump();
    });
  }

  async function checkList(host, ver) {
    const { text, data } = await api.fetchList(host, ver);
    const hash = await sha256(text);
    const prev = await cache.getList(host, ver);
    if (prev && prev.hash === hash) return { changed: false, entry: prev };
    const entry = { hash, data, fetchedAt: now() };
    await cache.setList(host, ver, entry);
    return { changed: true, entry };
  }

  async function checkDetail(host, ver, code) {
    const prev = await cache.getDetail(host, ver, code);
    let res;
    try {
      res = await api.fetchDetail(host, ver, code);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        if (prev && prev.needsLogin) return { changed: false, entry: prev };
        const entry = { needsLogin: true };
        await cache.setDetail(host, ver, code, entry);
        return { changed: true, entry };
      }
      throw err;
    }
    const hash = await sha256(res.text);
    if (prev && prev.hash === hash) return { changed: false, entry: prev };
    const entry = { hash, data: res.data, fetchedAt: now() };
    await cache.setDetail(host, ver, code, entry);
    return { changed: true, entry };
  }

  function prefetchAll(host, ver, codes, { concurrency = 5 } = {}) {
    limit = concurrency;
    const jobs = codes.filter(isValidObjCode).map((code) =>
      enqueue(code, async () => {
        if (await cache.getDetail(host, ver, code)) return;
        await checkDetail(host, ver, code);
      }),
    );
    return Promise.all(jobs).then(() => {});
  }

  function prioritise(code) {
    const i = queue.findIndex((j) => j.code === code);
    if (i > 0) queue.unshift(...queue.splice(i, 1));
  }

  async function refresh(host, ver) {
    const { entry, changed: listChanged } = await checkList(host, ver);
    const codes = Object.values(entry.data.objects).map((o) => o.objCode).filter(isValidObjCode);
    const results = await Promise.all(
      codes.map((code) =>
        enqueue(code, async () => {
          const prev = await cache.getDetail(host, ver, code);
          if (prev && prev.needsLogin) return false;
          return (await checkDetail(host, ver, code)).changed;
        }),
      ),
    );
    const failed = results.filter((x) => !x.ok).length;
    const changed = (listChanged ? 1 : 0) + results.filter((x) => x.ok && x.value).length;
    if (!failed) await cache.setLastRun(now());
    return { changed, failed, total: codes.length };
  }

  async function refreshIfStale(host, ver, maxAgeMs = HOUR_MS) {
    const last = await cache.getLastRun();
    if (last !== undefined && now() - last < maxAgeMs) return false;
    await refresh(host, ver);
    return true;
  }

  return { checkList, checkDetail, prefetchAll, prioritise, refresh, refreshIfStale };
}
