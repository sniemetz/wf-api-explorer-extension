const listKey = (host, ver) => `list|${host}|${ver}`;
const detailKey = (host, ver, code) => `detail|${host}|${ver}|${code}`;
const versionsKey = (host) => `versions|${host}`;
const LAST_RUN_KEY = 'lastRun';

export function createCache(area) {
  const read = async (key) => (await area.get(key))[key];
  const write = (key, value) => area.set({ [key]: value });
  return {
    getList: (host, ver) => read(listKey(host, ver)),
    setList: (host, ver, entry) => write(listKey(host, ver), entry),
    getDetail: (host, ver, code) => read(detailKey(host, ver, code)),
    setDetail: (host, ver, code, entry) => write(detailKey(host, ver, code), entry),
    getVersions: (host) => read(versionsKey(host)),
    setVersions: (host, entry) => write(versionsKey(host), entry),
    getLastRun: () => read(LAST_RUN_KEY),
    setLastRun: (ts) => write(LAST_RUN_KEY, ts),
  };
}
