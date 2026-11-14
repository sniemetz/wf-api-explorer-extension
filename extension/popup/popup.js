import { HOST, EXPLORER_URL } from '../lib/config.js';
import { createCache } from '../lib/cache.js';
import { createApi, ApiError } from '../lib/api.js';
import { createSync } from '../lib/sync.js';
import { loadVersions } from '../lib/bootstrap.js';
import { highestVersion } from '../lib/versions.js';
import { filterObjects, filterItems } from '../lib/filter.js';
import { TABS, tabEntries, visibleAttrs } from '../lib/detail.js';
import { STATUS_KEY, describeStatus } from '../lib/refreshJob.js';
import { renderObjectList, showMessage, debounce, renderDetailHead, renderTabs, renderItems } from './render.js';

const fetchFn = (url) => fetch(url);
const cache = createCache(chrome.storage.local);
const sync = createSync({ api: createApi(fetchFn), cache });

const $ = (id) => document.getElementById(id);
const dom = {
  version: $('version'), note: $('note'), objSearch: $('objSearch'), objList: $('objList'),
  hint: $('hint'), detail: $('detail'), refresh: $('refresh'),
  detailHead: $('detailHead'), tabs: $('tabs'), tabSearch: $('tabSearch'), items: $('items'),
};

const state = {
  ver: null, objects: [], selected: null, listToken: 0,
  detailToken: 0, detail: null, tab: 'fields', expanded: new Set(),
};

function setNote(text) {
  dom.note.hidden = !text;
  dom.note.textContent = text || '';
}

function objectsFrom(entry) {
  return Object.values(entry.data.objects).sort((a, b) => a.label.localeCompare(b.label));
}

function saveView() {
  chrome.storage.local.set({ view: {
    ver: state.ver, objCode: state.selected?.objCode ?? null, tab: state.tab,
    objSearch: dom.objSearch.value, tabSearch: dom.tabSearch.value,
    expanded: [...state.expanded], objScroll: dom.objList.scrollTop, itemsScroll: dom.items.scrollTop,
  } }).catch(() => {});
}

function clearSelection() {
  state.selected = null;
  state.detail = null;
  state.detailToken++;
  dom.detail.hidden = true;
  dom.hint.hidden = false;
  saveView();
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

function renderItemsView() {
  if (!state.detail) return;
  const entries = tabEntries(state.detail, state.tab);
  if (!entries.length) return showMessage(dom.items, 'empty', { text: 'No items' });
  const filtered = filterItems(entries, dom.tabSearch.value);
  if (!filtered.length) return showMessage(dom.items, 'empty', { text: 'No items match' });
  renderItems(dom.items, filtered, {
    expanded: state.expanded,
    onToggle: (name) => {
      if (!state.expanded.delete(name)) state.expanded.add(name);
      renderItemsView();
      saveView();
    },
    resolveCode: (code) => (code ? state.objects.find((o) => o.objCode.toLowerCase() === code.toLowerCase())?.objCode : undefined),
    onLink: (code) => {
      const target = state.objects.find((o) => o.objCode === code);
      if (target) selectObject(target);
    },
    visibleAttrs,
  });
}

function renderTabsView() {
  const counts = Object.fromEntries(TABS.map((t) => [t.key, tabEntries(state.detail, t.key).length]));
  renderTabs(dom.tabs, TABS, counts, state.tab, (key) => {
    state.tab = key;
    state.expanded.clear();
    saveView();
    renderTabsView();
    renderItemsView();
    dom.items.scrollTop = 0;
  });
}

function showDetail(obj, entry) {
  if (entry.needsLogin) {
    state.detail = null;
    renderDetailHead(dom.detailHead, obj, null);
    dom.tabs.replaceChildren();
    showMessage(dom.items, 'empty', { text: 'Needs login' });
    return;
  }
  state.detail = entry.data;
  renderDetailHead(dom.detailHead, obj, entry.data);
  renderTabsView();
  renderItemsView();
}

function revealSelected() {
  const code = state.selected?.objCode;
  if (code && !filterObjects(state.objects, dom.objSearch.value).some((o) => o.objCode === code)) {
    dom.objSearch.value = '';
    renderList();
    saveView();
  }
  dom.objList.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
}

async function selectObject(obj, { tab = 'fields', tabSearch = '', expanded = [], itemsScroll = 0 } = {}) {
  const ver = state.ver;
  const token = ++state.detailToken;
  const current = () => token === state.detailToken && ver === state.ver;
  state.selected = obj;
  state.detail = null;
  state.tab = tab;
  state.expanded = new Set(expanded);
  dom.tabSearch.value = tabSearch;
  saveView();
  dom.items.replaceChildren();
  dom.items.scrollTop = 0;
  dom.hint.hidden = true;
  dom.detail.hidden = false;
  renderList();
  revealSelected();

  const cached = await cache.getDetail(HOST, ver, obj.objCode);
  if (!current()) return;
  if (cached) {
    showDetail(obj, cached);
    dom.items.scrollTop = itemsScroll;
    if (!cached.needsLogin) {
      sync.checkDetail(HOST, ver, obj.objCode)
        .then((r) => { if (current() && r.changed) showDetail(obj, r.entry); })
        .catch(() => {});
    }
    return;
  }
  renderDetailHead(dom.detailHead, obj, null);
  dom.tabs.replaceChildren();
  showMessage(dom.items, 'loading', { text: 'Loading details...' });
  try {
    const r = await sync.checkDetail(HOST, ver, obj.objCode);
    if (current()) { showDetail(obj, r.entry); dom.items.scrollTop = itemsScroll; }
  } catch (err) {
    if (current()) {
      showMessage(dom.items, 'error', {
        status: err instanceof ApiError ? err.status : null, url: err.url, onRetry: () => selectObject(obj),
      });
    }
  }
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
  if (!current()) return;
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
  const { view } = await chrome.storage.local.get('view');
  const sameVersion = view?.ver === state.ver;
  if (sameVersion) dom.objSearch.value = view.objSearch ?? '';
  await loadList(state.ver);
  const restore = sameVersion && state.objects.find((o) => o.objCode === view.objCode);
  if (restore) {
    await selectObject(restore, {
      tab: TABS.some((t) => t.key === view.tab) ? view.tab : 'fields',
      tabSearch: view.tabSearch ?? '',
      expanded: Array.isArray(view.expanded) ? view.expanded : [],
      itemsScroll: view.itemsScroll ?? 0,
    });
  }
  if (sameVersion) dom.objList.scrollTop = view.objScroll ?? 0;
  renderRefresh((await chrome.storage.local.get(STATUS_KEY))[STATUS_KEY]);
}

dom.version.addEventListener('change', async () => {
  state.ver = dom.version.value;
  await chrome.storage.local.set({ selectedVersion: state.ver });
  clearSelection();
  dom.objSearch.value = '';
  dom.tabSearch.value = '';
  saveView();
  await loadList(state.ver);
});

dom.objSearch.addEventListener('input', debounce(() => { renderList(); saveView(); }, 200));
dom.tabSearch.addEventListener('input', debounce(() => { renderItemsView(); saveView(); }, 200));
dom.objList.addEventListener('scroll', debounce(saveView, 200));
dom.items.addEventListener('scroll', debounce(saveView, 200));

function setRefreshBusy(busy) {
  dom.refresh.disabled = busy;
  if (busy) {
    dom.refresh.setAttribute('aria-busy', 'true');
    dom.refresh.replaceChildren(Object.assign(document.createElement('span'), { className: 'spinner' }), 'Refreshing...');
  } else {
    dom.refresh.removeAttribute('aria-busy');
    dom.refresh.textContent = 'Refresh';
  }
}

async function reloadFromCache(ver) {
  const list = await cache.getList(HOST, ver);
  if (list && ver === state.ver) applyList(list);
  if (state.selected) {
    const detail = await cache.getDetail(HOST, ver, state.selected.objCode);
    if (detail && ver === state.ver) showDetail(state.selected, detail);
  }
}

// The refresh runs in the service worker; its status lives in storage (see lib/refreshJob.js).
async function renderRefresh(status) {
  const { busy, text } = describeStatus(status);
  setRefreshBusy(busy);
  if (busy || !status || status.seen) return;
  await chrome.storage.local.set({ [STATUS_KEY]: { ...status, seen: true } });
  if (status.version !== state.ver) return;
  if (status.state === 'done') await reloadFromCache(status.version);
  setNote(text);
}

dom.refresh.addEventListener('click', () => {
  setRefreshBusy(true);
  setNote('');
  const notStarted = () => {
    setRefreshBusy(false);
    setNote('Refresh did not start. Reload the extension on chrome://extensions and try again.');
  };
  // The worker acknowledges with { started: true }; an outdated worker does not answer.
  chrome.runtime.sendMessage({ type: 'refresh', version: state.ver })
    .then((resp) => { if (!resp?.started) notStarted(); })
    .catch(notStarted);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[STATUS_KEY]) renderRefresh(changes[STATUS_KEY].newValue);
});

document.addEventListener('keydown', (e) => {
  if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
  e.preventDefault();
  dom.objSearch.focus();
});

init().catch((err) => showMessage(dom.objList, 'error', { status: err.status ?? null, url: err.url, onRetry: init }));
