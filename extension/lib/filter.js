const words = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const MIN_ANYWHERE = 3;

// 3+ characters: substring of the label or the API code ("ver" finds "Document Version" and "Approver").
// 1-2 characters would match nearly everything, so there the label must match the start of a word.
export function filterObjects(objects, q) {
  const s = (q || '').trim().toLowerCase();
  if (!s) return objects;
  const w = words(s);
  const inLabel = s.length >= MIN_ANYWHERE
    ? (o) => o.label.toLowerCase().includes(s)
    : (o) => w && ` ${words(o.label)}`.includes(` ${w}`);
  return objects.filter((o) => inLabel(o) || o.objCode.toLowerCase().includes(s));
}

export function filterItems(entries, q) {
  const s = (q || '').trim().toLowerCase();
  if (!s) return entries;
  return entries.filter(
    ([name, attrs]) =>
      name.toLowerCase().includes(s) || String(attrs?.label ?? '').toLowerCase().includes(s),
  );
}
