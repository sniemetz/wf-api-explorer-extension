import { metadataUrl } from './versions.js';

export class ApiError extends Error {
  constructor(message, status, url) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.url = url;
  }
}

export function createApi(fetchFn) {
  const inFlight = new Map();

  async function load(url) {
    let res;
    try {
      res = await fetchFn(url);
    } catch (err) {
      throw new ApiError(`Network error: ${err.message}`, null, url);
    }
    if (!res.ok) throw new ApiError(`HTTP ${res.status}`, res.status, url);
    const text = await res.text();
    return { text, data: JSON.parse(text).data };
  }

  function dedupe(url) {
    if (!inFlight.has(url)) {
      const p = load(url).finally(() => inFlight.delete(url));
      inFlight.set(url, p);
    }
    return inFlight.get(url);
  }

  return {
    fetchList: (host, ver) => dedupe(metadataUrl(host, ver)),
    fetchDetail: (host, ver, code) => dedupe(metadataUrl(host, ver, code)),
  };
}
