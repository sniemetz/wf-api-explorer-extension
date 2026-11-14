# Privacy Policy: Workfront API Explorer

Effective date: 2026-11-14

Workfront API Explorer is a Chrome extension that shows Workfront API object metadata (fields, references, collections, search, actions and queries).

## What I collect
Nothing. The extension does not collect, record or transmit any personal data or browsing data. It has no analytics, no tracking and no accounts. It does not read the pages you visit.

## What the extension stores on your device
Everything below stays in your browser (`chrome.storage.local`) and is never sent anywhere:
- Cached Workfront API metadata (schema information for objects, for up to 10 API versions).
- Your selected API version.
- The state of the popup so it reopens where you left off: selected object, tab, search text, expanded items and scroll position.
- The status of the last manual refresh.

Removing the extension deletes all of this.

## Network requests
The extension makes read-only requests to:
- `https://api-cl01.my.workfront.com`: public API metadata endpoints.
- `https://developersupport.workfront.com`: the API Explorer page, to learn which API versions exist.

These requests contain no personal data and no credentials. As with any web request, those servers can see your IP address. The extension sends nothing to any other party and uses no third-party services.

## Remote code
None. All code ships inside the extension package.

## Changes
If this policy changes, the new version will be published at this location with an updated effective date.

## Contact
Sven Niemetz, sniemetz@gmail.com, or open an issue at https://github.com/sniemetz/wf-api-explorer-extension/issues
