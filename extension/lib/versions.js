export const FALLBACK_VERSIONS = [
  ...[15, 16, 17, 18, 19, 20, 21, 22].map((n) => ({ value: `/v${n}.0`, label: `API Version ${n}.0` })),
  { value: '-unsupported', label: 'API Unsupported' },
];

const VERSION_RE = /^(\/v\d+\.\d+|-unsupported)$/;
const CODE_RE = /^[A-Za-z0-9_]{1,32}$/;
const MAX_PROBES = 10;

export const isValidVersion = (v) => typeof v === 'string' && VERSION_RE.test(v);
export const isValidObjCode = (code) => typeof code === 'string' && CODE_RE.test(code);

const SELECT_RE = /<select\b[^>]*ng-model="apiversion"[^>]*>([\s\S]*?)<\/select>/i;
const OPTION_RE = /<option\b[^>]*\bvalue="([^"]*)"[^>]*>([\s\S]*?)<\/option>/gi;

export function parseVersionOptions(html) {
  const select = SELECT_RE.exec(html || '');
  if (!select) return [];
  const options = [];
  for (const m of select[1].matchAll(OPTION_RE)) {
    if (VERSION_RE.test(m[1])) options.push({ value: m[1], label: m[2].trim() });
  }
  return options;
}

function versionNumber(value) {
  const m = /^\/v(\d+)\.(\d+)$/.exec(value);
  return m ? Number(m[1]) + Number(m[2]) / 1000 : null;
}

export function highestVersion(options) {
  let best = null;
  let bestNum = -1;
  for (const o of options) {
    const n = versionNumber(o.value);
    if (n !== null && n > bestNum) {
      best = o;
      bestNum = n;
    }
  }
  return best;
}

// API versions whose data we keep cached: 'unsupported' (if offered) plus the highest numeric ones, 10 in total.
// About 0.8 MB per version, so 10 stay well inside the default 10 MB storage.local quota.
export const MAX_CACHED_VERSIONS = 10;
export function cachedVersions(options, max = MAX_CACHED_VERSIONS) {
  const num = options.filter((o) => versionNumber(o.value) !== null).sort((a, b) => versionNumber(b.value) - versionNumber(a.value));
  const rest = options.filter((o) => versionNumber(o.value) === null);
  return [...num.slice(0, Math.max(0, max - rest.length)), ...rest].map((o) => o.value);
}

// Default = highest version the explorer page lists. Probed versions (found by us, not listed) never become the default.
export function defaultVersion(options) {
  return highestVersion(options.filter((o) => !o.probed)) ?? highestVersion(options);
}

// HTTP status of a GET without downloading the body (the metadata endpoints reject HEAD with 405).
export async function statusOf(fetchFn, url) {
  const res = await fetchFn(url);
  Promise.resolve(res.body?.cancel?.()).catch(() => {});
  return res.status;
}

export function metadataUrl(host, versionValue, objCode) {
  if (!VERSION_RE.test(versionValue)) throw new Error(`Invalid API version: ${versionValue}`);
  if (objCode !== undefined && !isValidObjCode(objCode)) throw new Error(`Invalid object code: ${objCode}`);
  const base = `${host}/attask/api${versionValue}`;
  return objCode ? `${base}/${objCode}/metadata` : `${base}/metadata`;
}

export async function probeVersions(options, fetchFn, host) {
  const hits = [];
  const top = highestVersion(options);
  if (!top) return hits;
  let next = Math.floor(versionNumber(top.value)) + 1;
  for (let i = 0; i < MAX_PROBES; i++) {
    const value = `/v${next}.0`;
    let status;
    try {
      status = await statusOf(fetchFn, metadataUrl(host, value));
    } catch {
      return hits;
    }
    if (status !== 200) return hits;
    hits.push({ value, label: `API Version ${next}.0`, probed: true });
    next += 1;
  }
  return hits;
}
