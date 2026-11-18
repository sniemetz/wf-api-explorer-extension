import { HOST, EXPLORER_URL } from '../lib/config.js';
import { fetchWithTimeout } from '../lib/http.js';
import { createCache } from '../lib/cache.js';
import { createApi } from '../lib/api.js';
import { createSync } from '../lib/sync.js';
import { loadVersions } from '../lib/bootstrap.js';
import { defaultVersion, isValidVersion } from '../lib/versions.js';
import { populate, prefetchFromCache, checkListAndPrefetch, ALARM } from '../lib/startup.js';
import { createRefreshJob } from '../lib/refreshJob.js';

const fetchFn = fetchWithTimeout();
const cache = createCache(chrome.storage.local);
const sync = createSync({ api: createApi(fetchFn), cache });
// The version list is fetched only on install, browser start and manual Refresh; otherwise the cached list is used.
async function versions({ force = false } = {}) {
  if (!force) {
    const cached = await cache.getVersions(HOST);
    if (cached?.data?.length) return cached.data;
  }
  return loadVersions({ host: HOST, explorerUrl: EXPLORER_URL, fetchFn, cache });
}

const refreshJob = createRefreshJob({
  sync, storage: chrome.storage.local, host: HOST, refreshVersions: () => versions({ force: true }),
});

const populateNow = () =>
  populate({ host: HOST, getVersions: () => versions({ force: true }), storage: chrome.storage.local, sync, alarms: chrome.alarms });

async function scheduledCheck() {
  const options = await versions();
  const { selectedVersion } = await chrome.storage.local.get('selectedVersion');
  const ver = options.some((o) => o.value === selectedVersion) ? selectedVersion : defaultVersion(options).value;
  // List only: details refresh when the user opens an object or presses Refresh. New objects get prefetched.
  await checkListAndPrefetch({ host: HOST, version: ver, sync });
}

const log = (label) => (err) => console.error(`[wf-api-explorer] ${label}`, err);

chrome.runtime.onInstalled.addListener(() => { populateNow().catch(log('install')); });

// populate already re-checks the list and prefetches what is missing; details refresh lazily.
chrome.runtime.onStartup.addListener(() => { populateNow().catch(log('startup')); });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) scheduledCheck().catch(log('scheduled check'));
});

// Popup asks for a prefetch when the user switches version (popup may close first).
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!isValidVersion(msg?.version)) return;
  if (msg.type === 'refresh') {
    refreshJob.start(msg.version).catch(log('refresh'));
    sendResponse({ started: true });
    return;
  }
  if (msg.type !== 'prefetch') return;
  prefetchFromCache({ host: HOST, version: msg.version, cache, sync }).catch(log('prefetch'));
});
