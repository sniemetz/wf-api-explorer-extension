import { FALLBACK_VERSIONS, parseVersionOptions, probeVersions, highestVersion, metadataUrl } from './versions.js';
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

// Keep a version only if its metadata answers HTTP 200. A network error says nothing, so it keeps the option.
async function validate(options, host, fetchFn) {
  const ok = await Promise.all(options.map(async (o) => {
    try {
      return (await fetchFn(metadataUrl(host, o.value))).status === 200;
    } catch {
      return true;
    }
  }));
  return options.filter((_, i) => ok[i]);
}

export async function loadVersions({ host, explorerUrl, fetchFn, cache, now = Date.now }) {
  const cached = await cache.getVersions(host);
  let base = await fetchExplorerOptions(explorerUrl, fetchFn);
  if (!base.length) base = cached?.data?.length ? cached.data : FALLBACK_VERSIONS;

  if (!highestVersion(base)) base = FALLBACK_VERSIONS; // e.g. the page lists only "unsupported"
  let valid = await validate(base, host, fetchFn);
  if (!highestVersion(valid)) valid = base; // never end up with no usable version

  const hits = await probeVersions(valid, fetchFn, host);
  const options = [
    ...valid.filter((o) => o.value !== UNSUPPORTED),
    ...hits.filter((h) => !valid.some((o) => o.value === h.value)),
    ...valid.filter((o) => o.value === UNSUPPORTED),
  ];

  const hash = await sha256(JSON.stringify(options));
  if (cached?.hash !== hash) await cache.setVersions(host, { hash, data: options, fetchedAt: now() });
  return options;
}
