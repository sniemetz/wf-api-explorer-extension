export const HOST = 'https://api-cl01.my.workfront.com';
export const EXPLORER_URL = 'https://developersupport.workfront.com/page-api-explorer.html';

// Background work (prefetch) goes easy on the API: 2 parallel requests with a pause after each.
// A user-started Refresh uses the fast default (5 parallel, no pause).
export const BACKGROUND_PACE = { concurrency: 2, gapMs: 200 };
// The scheduled list check runs every 6 hours.
export const CHECK_INTERVAL_MINUTES = 360;
