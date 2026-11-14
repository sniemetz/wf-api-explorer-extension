export const TABS = [
  { key: 'fields', label: 'Fields' },
  { key: 'references', label: 'References' },
  { key: 'collections', label: 'Collections' },
  { key: 'search', label: 'Search' },
  { key: 'actions', label: 'Actions' },
  { key: 'queries', label: 'Queries' },
];

export const tabEntries = (detail, key) => Object.entries(detail?.[key] ?? {});

export const visibleAttrs = (attrs) => Object.entries(attrs ?? {}).filter(([k, v]) => k !== 'label' && k !== 'url' && v != null);

export function itemMeta(attrs) {
  const type = attrs.fieldType || attrs.typeObjCode || attrs.resultType || '';
  const flags = Array.isArray(attrs.flags) ? attrs.flags.join(', ') : '';
  return [type, flags].filter(Boolean).join(' · ');
}
