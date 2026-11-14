import { metadataUrl } from './versions.js';
import { isValidList, isValidDetail } from './schema.js';

export class ApiError extends Error {
  constructor(message, status, url) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.url = url;
  }
}

const MAX_RETRY_DELAY_MS = 10000;
const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));
const retryable = (status) => status === null || status === 429 || status >= 500;

function retryDelay(res, base) {
  const secs = Number(res?.headers?.get?.('retry-after'));
  return Number.isFinite(secs) && secs > 0 ? Math.min(secs * 1000, MAX_RETRY_DELAY_MS) : base;
}

export function createApi(fetchFn, { retryDelayMs = 1000, sleep = defaultSleep } = {}) {
  const inFlight = new Map();

  // One retry on network errors, 429 and 5xx. Anything else (4xx, bad body) is final.
  async function request(url) {
    for (let attempt = 0; ; attempt++) {
      let res;
      try {
        res = await fetchFn(url);
      } catch (err) {
        if (attempt === 0) { await sleep(retryDelayMs); continue; }
        throw new ApiError(`Network error: ${err.message}`, null, url);
      }
      if (res.ok) return res;
      if (attempt === 0 && retryable(res.status)) {
        Promise.resolve(res.body?.cancel?.()).catch(() => {});
        await sleep(retryDelay(res, retryDelayMs));
        continue;
      }
      throw new ApiError(`HTTP ${res.status}`, res.status, url);
    }
  }

  async function load(url, isValid) {
    const res = await request(url);
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text).data;
    } catch {
      throw new ApiError('Unexpected response (not JSON)', res.status, url);
    }
    if (data === null || typeof data !== 'object') {
      throw new ApiError('Unexpected response (no data)', res.status, url);
    }
    if (!isValid(data)) throw new ApiError('Unexpected response (wrong shape)', res.status, url);
    return { text, data };
  }

  function dedupe(url, isValid) {
    if (!inFlight.has(url)) {
      const p = load(url, isValid).finally(() => inFlight.delete(url));
      inFlight.set(url, p);
    }
    return inFlight.get(url);
  }

  return {
    fetchList: (host, ver) => dedupe(metadataUrl(host, ver), isValidList),
    fetchDetail: (host, ver, code) => dedupe(metadataUrl(host, ver, code), isValidDetail),
  };
}
