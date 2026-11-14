export const FALLBACK_VERSIONS = [
  ...[15, 16, 17, 18, 19, 20, 21, 22].map((n) => ({ value: `/v${n}.0`, label: `API Version ${n}.0` })),
  { value: '-unsupported', label: 'API Unsupported' },
];

const SELECT_RE = /<select\b[^>]*ng-model="apiversion"[^>]*>([\s\S]*?)<\/select>/i;
const OPTION_RE = /<option\b[^>]*\bvalue="([^"]*)"[^>]*>([\s\S]*?)<\/option>/gi;

export function parseVersionOptions(html) {
  const select = SELECT_RE.exec(html || '');
  if (!select) return [];
  const options = [];
  for (const m of select[1].matchAll(OPTION_RE)) {
    options.push({ value: m[1], label: m[2].trim() });
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

export function metadataUrl(host, versionValue, objCode) {
  const base = `${host}/attask/api${versionValue}`;
  return objCode ? `${base}/${objCode}/metadata` : `${base}/metadata`;
}

export async function probeVersions(options, fetchFn, host) {
  const hits = [];
  const top = highestVersion(options);
  if (!top) return hits;
  let next = Math.floor(versionNumber(top.value)) + 1;
  for (;;) {
    const value = `/v${next}.0`;
    let status;
    try {
      status = (await fetchFn(metadataUrl(host, value))).status;
    } catch {
      return hits;
    }
    if (status !== 200) return hits;
    hits.push({ value, label: `API Version ${next}.0` });
    next += 1;
  }
}
