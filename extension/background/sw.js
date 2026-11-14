import { HOST, EXPLORER_URL } from '../lib/config.js';
import { createCache } from '../lib/cache.js';
import { createApi } from '../lib/api.js';
import { createSync } from '../lib/sync.js';
import { loadVersions } from '../lib/bootstrap.js';
import { highestVersion } from '../lib/versions.js';

const ALARM = 'refresh';
const fetchFn = (url) => fetch(url);
const cache = createCache(chrome.storage.local);
const sync = createSync({ api: createApi(fetchFn), cache });

async function versions() {
  return loadVersions({ host: HOST, explorerUrl: EXPLORER_URL, fetchFn, cache });
}

// Extension load (install, browser start): spec 6.2.1.
async function populate() {
  const options = await versions();
  const latest = highestVersion(options).value;
  await chrome.storage.local.set({ selectedVersion: latest });
  const { entry } = await sync.checkList(HOST, latest);
  const codes = Object.values(entry.data.objects).map((o) => o.objCode);
  await chrome.alarms.create(ALARM, { periodInMinutes: 60 });
  await sync.prefetchAll(HOST, latest, codes);
}

async function hourly() {
  const options = await versions();
  const { selectedVersion } = await chrome.storage.local.get('selectedVersion');
  await sync.refresh(HOST, selectedVersion ?? highestVersion(options).value);
}

const log = (label) => (err) => console.error(`[wf-api-explorer] ${label}`, err);

chrome.runtime.onInstalled.addListener(() => { populate().catch(log('install')); });

chrome.runtime.onStartup.addListener(() => {
  populate()
    .then(async () => {
      const { selectedVersion } = await chrome.storage.local.get('selectedVersion');
      await sync.refreshIfStale(HOST, selectedVersion);
    })
    .catch(log('startup'));
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) hourly().catch(log('hourly'));
});
