export const STATUS_KEY = 'refreshStatus';

// Runs sync.refresh inside the service worker so it survives the popup closing.
// Progress and result live in storage so any popup instance can show them.
export function createRefreshJob({ sync, storage, host, now = Date.now }) {
  let inFlight = null;

  const read = async () => (await storage.get(STATUS_KEY))[STATUS_KEY];
  const write = (status) => storage.set({ [STATUS_KEY]: status });

  // A 'running' status with no run in this instance belongs to a dead worker.
  const ready = (async () => {
    const status = await read();
    if (status?.state === 'running') {
      await write({ state: 'failed', version: status.version, error: 'interrupted', finishedAt: now(), seen: false });
    }
  })();

  function start(version) {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      await ready;
      await write({ state: 'running', version, startedAt: now() });
      let status;
      try {
        const result = await sync.refresh(host, version);
        status = { state: 'done', version, result, finishedAt: now(), seen: false };
      } catch (err) {
        status = { state: 'failed', version, error: String(err?.message ?? err), finishedAt: now(), seen: false };
      }
      await write(status);
    })().finally(() => { inFlight = null; });
    return inFlight;
  }

  return { start, ready };
}

export function describeStatus(status) {
  if (!status) return { busy: false, text: '' };
  if (status.state === 'running') return { busy: true, text: '' };
  if (status.state === 'failed') {
    return {
      busy: false,
      text: status.error === 'interrupted'
        ? 'Refresh was interrupted. Cached data kept.'
        : 'Refresh failed: could not reach Workfront. Cached data kept.',
    };
  }
  const { changed, failed, total } = status.result;
  if (failed) return { busy: false, text: `Refresh incomplete: ${failed} of ${total} objects failed${changed ? `, ${changed} updated` : ''}` };
  return { busy: false, text: changed ? `Updated ${changed} item${changed === 1 ? '' : 's'}` : 'Already up to date' };
}
