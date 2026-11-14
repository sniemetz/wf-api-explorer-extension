export const TABS = [
  { key: 'fields', label: 'Fields' },
  { key: 'references', label: 'References' },
  { key: 'collections', label: 'Collections' },
  { key: 'search', label: 'Search' },
  { key: 'actions', label: 'Actions' },
  { key: 'queries', label: 'Queries' },
];

export const tabEntries = (detail, key) => Object.entries(detail?.[key] ?? {});

export const visibleAttrs = (attrs) => Object.entries(attrs ?? {}).filter(([k, v]) => k !== 'label' && v != null);

export function itemMeta(attrs) {
  const type = attrs.fieldType || attrs.typeObjCode || attrs.resultType || '';
  const flags = Array.isArray(attrs.flags) ? attrs.flags.join(', ') : '';
  return [type, flags].filter(Boolean).join(' · ');
}

export function objCodeFromUrl(url) {
  const m = /\/attask\/api(?:\/v\d+\.\d+|-unsupported)\/([A-Za-z0-9_]+)\/metadata$/.exec(typeof url === 'string' ? url : '');
  return m ? m[1] : null;
}
