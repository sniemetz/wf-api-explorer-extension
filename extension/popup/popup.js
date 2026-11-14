import { HOST, EXPLORER_URL } from '../lib/config.js';
import { createCache } from '../lib/cache.js';
import { createApi, ApiError } from '../lib/api.js';
import { createSync } from '../lib/sync.js';
import { loadVersions } from '../lib/bootstrap.js';
import { highestVersion } from '../lib/versions.js';
import { filterObjects } from '../lib/filter.js';
import { renderObjectList, showMessage, debounce } from './render.js';

const fetchFn = (url) => fetch(url);
const cache = createCache(chrome.storage.local);
const sync = createSync({ api: createApi(fetchFn), cache });

const $ = (id) => document.getElementById(id);
const dom = {
  version: $('version'), note: $('note'), objSearch: $('objSearch'), objList: $('objList'),
  hint: $('hint'), detail: $('detail'), refresh: $('refresh'),
};

const state = { ver: null, objects: [], selected: null, listToken: 0 };

function setNote(text) {
  dom.note.hidden = !text;
  dom.note.textContent = text || '';
}

function objectsFrom(entry) {
  return Object.values(entry.data.objects).sort((a, b) => a.label.localeCompare(b.label));
}

function clearSelection() {
  state.selected = null;
  dom.detail.hidden = true;
  dom.hint.hidden = false;
}

function renderList() {
  const filtered = filterObjects(state.objects, dom.objSearch.value);
  if (!filtered.length) {
    showMessage(dom.objList, 'empty', { text: 'No objects found matching that filter' });
    return;
  }
  renderObjectList(dom.objList, filtered, state.selected?.objCode, (o) => selectObject(o));
}

function applyList(entry) {
  state.objects = objectsFrom(entry);
  if (state.selected && !state.objects.some((o) => o.objCode === state.selected.objCode)) clearSelection();
  renderList();
}

// Extension point for Task 9.
export function selectObject(obj) {
  state.selected = obj;
  renderList();
}

async function loadList(ver) {
  const token = ++state.listToken;
  const current = () => token === state.listToken;
  setNote('');
  const cached = await cache.getList(HOST, ver);
  if (cached) {
    applyList(cached);
    sync.checkList(HOST, ver)
      .then((r) => { if (current() && r.changed) applyList(r.entry); })
      .catch(() => { if (current()) setNote('Offline, showing cached data'); });
  } else {
    showMessage(dom.objList, 'loading', { text: 'Loading objects...' });
    try {
      const r = await sync.checkList(HOST, ver);
      if (current()) applyList(r.entry);
    } catch (err) {
      if (current()) {
        showMessage(dom.objList, 'error', {
          status: err instanceof ApiError ? err.status : null,
          url: err.url,
          onRetry: () => loadList(ver),
        });
      }
      return;
    }
  }
  chrome.runtime.sendMessage({ type: 'prefetch', version: ver }).catch(() => {});
}

function fillVersions(options, selected) {
  dom.version.replaceChildren(...options.map((o) => {
    const opt = document.createElement('option');
    opt.value = o.value;
    opt.textContent = o.label;
    return opt;
  }));
  dom.version.value = selected;
  dom.version.disabled = false;
}

async function init() {
  showMessage(dom.objList, 'loading', { text: 'Loading...' });
  const cachedVersions = await cache.getVersions(HOST);
  const options = cachedVersions?.data?.length
    ? cachedVersions.data
    : await loadVersions({ host: HOST, explorerUrl: EXPLORER_URL, fetchFn, cache });
  const { selectedVersion } = await chrome.storage.local.get('selectedVersion');
  state.ver = options.some((o) => o.value === selectedVersion) ? selectedVersion : highestVersion(options).value;
  fillVersions(options, state.ver);
  await loadList(state.ver);
}

dom.version.addEventListener('change', async () => {
  state.ver = dom.version.value;
  await chrome.storage.local.set({ selectedVersion: state.ver });
  clearSelection();
  dom.objSearch.value = '';
  await loadList(state.ver);
});

dom.objSearch.addEventListener('input', debounce(renderList, 200));

dom.refresh.addEventListener('click', async () => {
  dom.refresh.disabled = true;
  try {
    await sync.refresh(HOST, state.ver);
    await loadList(state.ver);
  } catch {
    setNote('Refresh failed');
  } finally {
    dom.refresh.disabled = false;
  }
});

init().catch((err) => showMessage(dom.objList, 'error', { status: err.status ?? null, url: err.url, onRetry: init }));
