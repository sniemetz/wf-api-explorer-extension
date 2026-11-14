export const TABS = [
  { key: 'fields', label: 'Fields' },
  { key: 'references', label: 'References' },
  { key: 'collections', label: 'Collections' },
  { key: 'search', label: 'Search' },
  { key: 'actions', label: 'Actions' },
];

export const tabEntries = (detail, key) => Object.entries(detail?.[key] ?? {});

export const visibleAttrs = (attrs) => Object.entries(attrs ?? {}).filter(([k, v]) => k !== 'label' && k !== 'url' && v != null && !(Array.isArray(v) && v.length === 0));
