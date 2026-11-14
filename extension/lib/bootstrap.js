import { FALLBACK_VERSIONS, parseVersionOptions, probeVersions } from './versions.js';
import { sha256 } from './hash.js';

const UNSUPPORTED = '-unsupported';

async function fetchExplorerOptions(explorerUrl, fetchFn) {
  try {
    const res = await fetchFn(explorerUrl);
    if (!res.ok) return [];
    return parseVersionOptions(await res.text());
  } catch {
    return [];
  }
}

export async function loadVersions({ host, explorerUrl, fetchFn, cache, now = Date.now }) {
  const cached = await cache.getVersions(host);
  let base = await fetchExplorerOptions(explorerUrl, fetchFn);
  if (!base.length) base = cached?.data?.length ? cached.data : FALLBACK_VERSIONS;

  const hits = await probeVersions(base, fetchFn, host);
  const options = [
    ...base.filter((o) => o.value !== UNSUPPORTED),
    ...hits.filter((h) => !base.some((o) => o.value === h.value)),
    ...base.filter((o) => o.value === UNSUPPORTED),
  ];

  const hash = await sha256(JSON.stringify(options));
  if (cached?.hash !== hash) await cache.setVersions(host, { hash, data: options, fetchedAt: now() });
  return options;
}
