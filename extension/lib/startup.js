import { defaultVersion } from './versions.js';
import { BACKGROUND_PACE, CHECK_INTERVAL_MINUTES } from './config.js';

export const ALARM = 'refresh';

// Prefetch all object details for a version, using the cached list (the popup already checked it).
export async function prefetchFromCache({ host, version, cache, sync }) {
  const cached = await cache.getList(host, version);
  const entry = cached ?? (await sync.checkList(host, version)).entry;
  await sync.prefetchAll(host, version, Object.values(entry.data.objects).map((o) => o.objCode), BACKGROUND_PACE);
}

// Check the list (one request) and fetch details we do not have yet. Cached details are left alone.
export async function checkListAndPrefetch({ host, version, sync }) {
  const { entry } = await sync.checkList(host, version);
  await sync.prefetchAll(host, version, Object.values(entry.data.objects).map((o) => o.objCode), BACKGROUND_PACE);
}

// Extension load (install, browser start): spec 6.2.1.
export async function populate({ host, getVersions, storage, sync, alarms }) {
  // Create the alarm first so a failed network step cannot leave the extension without its scheduled list check.
  await alarms.create(ALARM, { periodInMinutes: CHECK_INTERVAL_MINUTES });
  const options = await getVersions();
  const { selectedVersion } = await storage.get('selectedVersion');
  // Keep the user's choice while the dropdown still offers it; otherwise use the explorer's highest version.
  const ver = options.some((o) => o.value === selectedVersion) ? selectedVersion : defaultVersion(options).value;
  if (ver !== selectedVersion) await storage.set({ selectedVersion: ver });
  await checkListAndPrefetch({ host, version: ver, sync });
}
