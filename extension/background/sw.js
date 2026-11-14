import { HOST, EXPLORER_URL } from '../lib/config.js';
import { createCache } from '../lib/cache.js';
import { createApi } from '../lib/api.js';
import { createSync } from '../lib/sync.js';
import { loadVersions } from '../lib/bootstrap.js';
import { highestVersion } from '../lib/versions.js';
import { populate, ALARM } from '../lib/startup.js';
import { createRefreshJob } from '../lib/refreshJob.js';

const fetchFn = (url) => fetch(url);
const cache = createCache(chrome.storage.local);
const sync = createSync({ api: createApi(fetchFn), cache });
const refreshJob = createRefreshJob({ sync, storage: chrome.storage.local, host: HOST });

async function versions() {
  return loadVersions({ host: HOST, explorerUrl: EXPLORER_URL, fetchFn, cache });
}

const populateNow = () =>
  populate({ host: HOST, getVersions: versions, storage: chrome.storage.local, sync, alarms: chrome.alarms });

async function hourly() {
  const options = await versions();
  const { selectedVersion } = await chrome.storage.local.get('selectedVersion');
  await sync.refresh(HOST, selectedVersion ?? highestVersion(options).value);
}

const log = (label) => (err) => console.error(`[wf-api-explorer] ${label}`, err);

chrome.runtime.onInstalled.addListener(() => { populateNow().catch(log('install')); });

chrome.runtime.onStartup.addListener(() => {
  populateNow()
    .then(async () => {
      const { selectedVersion } = await chrome.storage.local.get('selectedVersion');
      await sync.refreshIfStale(HOST, selectedVersion);
    })
    .catch(log('startup'));
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) hourly().catch(log('hourly'));
});

// Popup asks for a prefetch when the user switches version (popup may close first).
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'refresh') {
    refreshJob.start(msg.version).catch(log('refresh'));
    sendResponse({ started: true });
    return;
  }
  if (msg?.type !== 'prefetch') return;
  (async () => {
    const { entry } = await sync.checkList(HOST, msg.version);
    await sync.prefetchAll(HOST, msg.version, Object.values(entry.data.objects).map((o) => o.objCode));
  })().catch(log('prefetch'));
});
