export async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

// Canonical JSON for change detection. The API returns object keys and `flags` lists
// in varying order between requests, so sort keys and treat `flags` as a set.
export function stableStringify(value) {
  const canon = (v, key) => {
    if (Array.isArray(v)) {
      const items = v.map((x) => canon(x));
      return key === 'flags' ? items.map((i) => JSON.stringify(i)).sort().map((s) => JSON.parse(s)) : items;
    }
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k], k)]));
    }
    return v;
  };
  return JSON.stringify(canon(value));
}
