export const TIMEOUT_MS = 15000;

// fetch with a hard per-request timeout (covers the body read too). A timeout rejects like a network error.
export const fetchWithTimeout = (ms = TIMEOUT_MS) => (url) => fetch(url, { signal: AbortSignal.timeout(ms) });
