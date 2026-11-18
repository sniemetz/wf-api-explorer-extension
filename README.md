# Workfront API Explorer

A Chrome extension that shows the Workfront API object metadata, the same data as the [API Explorer](https://developer.adobe.com/workfront/api-explorer/), in a popup, with faster search and a local cache.

> Unofficial. Not affiliated with or endorsed by Adobe or Workfront.

**Install:** [Chrome Web Store](https://chromewebstore.google.com/detail/workfront-api-explorer/ljmpofcohabalbmgkokmibckpgickgna)

## Features

- **Object search:** filters the object list by display name and by API name. Type 3 or more characters to match anywhere in the name or API code. Shorter text matches the start of a word.
- **Five tabs per object:** Fields, References, Collections, Search, Actions. Items show the display name and the API name.
- **Search inside a tab:** a second search box filters the items of the active tab by display name and API name.
- **Item details:** expand an item to see its attributes (type, flags, possible values, arguments). Empty attributes are hidden. A linked object type is a link that opens that object.
- **Click-to-copy API names:** click an API name in the object list, the object heading, or an item to copy it.
- **Version dropdown:** the versions the Explorer offers, plus newer versions that the API itself serves. Only versions that answer are listed.
- **Keeps your place:** the popup reopens with the same object, tab, search texts, expanded items and scroll position.
- **Works offline:** shows cached data when Workfront is not reachable.
- **Keyboard:** the object search is focused when the popup opens. `/` jumps back to it.

## What it fetches

All requests are read-only `GET` requests. They send no login, cookies or personal data, and the extension reads no record data and no custom fields.

| Request | Host | Purpose |
|---|---|---|
| API Explorer page | `developersupport.workfront.com` | Read the list of API versions |
| `/attask/api/{version}/metadata` | `api-cl01.my.workfront.com` | Object list (about 30 KB) |
| `/attask/api/{version}/{OBJCODE}/metadata` | `api-cl01.my.workfront.com` | Details of one object (174 objects, about 1.2 MB in total) |

- **Version check:** each listed version is checked with one metadata request. One more request tests whether the next version number exists.
- **Objects without data:** a few objects (for example `ACTLOG`) answer "401 login required". They show "No data available", as in the Explorer.
- **Cache:** everything is stored in your browser (`chrome.storage.local`), per API version. Nothing is sent anywhere else. See the [privacy policy](docs/privacy.md).

## When it fetches

| When | What | Pace |
|---|---|---|
| Install and browser start | Version list, object list, and details for objects not cached yet | 2 requests at a time with a 200 ms pause (about 45 s for all 174 objects) |
| Every 6 hours | Object list. New objects are fetched. Cached details are not re-fetched. | same |
| Popup opens | Object list once. Details of the open object, in the background. | single requests |
| You open an object that is not cached | That object, immediately | single request |
| You switch version | Object list and missing details of that version | gentle pace |
| **Refresh** button | Version list, object list, and all details | 5 requests at a time (about 10 s). Runs in the background and continues if you close the popup. |

## Permissions

- `storage`: the local cache and popup state.
- `alarms`: the 6-hour list check.
- Host access to `api-cl01.my.workfront.com` and `developersupport.workfront.com` only.

## For developers

- Load unpacked: `chrome://extensions` → Developer mode → Load unpacked → select the `extension/` folder.
- After changing the service worker or `extension/lib/`, reload the extension. The popup rereads its files on every open, but the worker does not.
- Tests: `npm test` (Node 24, `node --test`).
- Docs: [spec](docs/spec.md), [privacy policy](docs/privacy.md).

Issues and feedback: https://github.com/sniemetz/wf-api-explorer-extension/issues
