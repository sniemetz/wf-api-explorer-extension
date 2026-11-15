const words = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Label: the query matches the start of any word ("ver" finds "Document Version"). Code: substring.
export function filterObjects(objects, q) {
  const s = (q || '').trim().toLowerCase();
  if (!s) return objects;
  const w = words(s);
  return objects.filter(
    (o) => (w && ` ${words(o.label)}`.includes(` ${w}`)) || o.objCode.toLowerCase().includes(s),
  );
}

export function filterItems(entries, q) {
  const s = (q || '').trim().toLowerCase();
  if (!s) return entries;
  return entries.filter(
    ([name, attrs]) =>
      name.toLowerCase().includes(s) || String(attrs?.label ?? '').toLowerCase().includes(s),
  );
}
