import { isValidObjCode } from './versions.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const MAPS = ['fields', 'references', 'collections', 'search', 'actions', 'queries'];

// Shape guards for remote metadata: reject anything the popup would not render safely.
export function isValidList(data) {
  return isObj(data) && isObj(data.objects)
    && Object.values(data.objects).every((o) => isObj(o) && typeof o.label === 'string' && isValidObjCode(o.objCode));
}

export function isValidDetail(data) {
  if (!isObj(data)) return false;
  if ('label' in data && typeof data.label !== 'string') return false;
  for (const k of ['flags', 'operations']) if (data[k] != null && !Array.isArray(data[k])) return false;
  return MAPS.every((k) => data[k] == null || (isObj(data[k]) && Object.values(data[k]).every(isObj)));
}
