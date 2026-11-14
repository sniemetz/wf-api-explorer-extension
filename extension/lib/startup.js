import { highestVersion } from './versions.js';

export const ALARM = 'refresh';

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
