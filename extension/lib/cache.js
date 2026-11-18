const listKey = (host, ver) => `list|${host}|${ver}`;
const detailKey = (host, ver, code) => `detail|${host}|${ver}|${code}`;
const versionsKey = (host) => `versions|${host}`;

const SEP = '|';

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
    // Drop list/detail entries of this host whose API version is not in `versions`.
    async evictExcept(host, versions) {
      const keep = new Set(versions);
      const keys = area.getKeys ? await area.getKeys() : Object.keys(await area.get(null));
      const stale = keys.filter((k) => {
        const [kind, h, ver] = k.split(SEP);
        return (kind === 'list' || kind === 'detail') && h === host && !keep.has(ver);
      });
      if (stale.length) await area.remove(stale);
      return stale.length;
    },
  };
}
