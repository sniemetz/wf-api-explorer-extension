export function filterObjects(objects, q) {
  const s = (q || '').trim().toLowerCase();
  if (!s) return objects;
  return objects.filter(
    (o) => o.label.toLowerCase().startsWith(s) || o.objCode.toLowerCase().includes(s),
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
