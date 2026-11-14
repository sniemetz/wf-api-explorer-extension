import { highestVersion } from './versions.js';

export const ALARM = 'refresh';

// Prefetch all object details for a version, using the cached list (the popup already checked it).
export async function prefetchFromCache({ host, version, cache, sync }) {
  const cached = await cache.getList(host, version);
  const entry = cached ?? (await sync.checkList(host, version)).entry;
  await sync.prefetchAll(host, version, Object.values(entry.data.objects).map((o) => o.objCode));
}

// Extension load (install, browser start): spec 6.2.1.
export async function populate({ host, getVersions, storage, sync, alarms }) {
  // Create the alarm first so a failed network step cannot leave the extension without an hourly refresh.
  await alarms.create(ALARM, { periodInMinutes: 60 });
  const latest = highestVersion(await getVersions()).value;
  await storage.set({ selectedVersion: latest });
  const { entry } = await sync.checkList(host, latest);
  const codes = Object.values(entry.data.objects).map((o) => o.objCode);
  await sync.prefetchAll(host, latest, codes);
}
