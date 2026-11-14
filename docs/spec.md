# Workfront API Metadata Viewer - Chrome Extension Spec

Status: Draft v0.5 (ready for build)
Date: 2026-11-14
Target: Chrome (Manifest V3)

## 1. Goal

- Show what the Workfront API Explorer shows.
- Show Workfront objects and their out-of-box attributes.
- Do not show custom fields or record data.
- Source: https://developer.adobe.com/workfront/api-explorer/

## 2. Key facts (verified on 2026-11-11)

Tested with curl, no API key, API v22.0.

- `GET https://api-cl01.my.workfront.com/attask/api/v22.0/metadata`
  - HTTP 200, JSON.
  - `data.objects` holds 174 objects.
  - Each object has `name`, `label`, `objCode`, `url`.
- `GET .../attask/api/v22.0/{OBJCODE}/metadata`
  - HTTP 200 for 173 of 174 objects.
  - `ACTLOG` returns HTTP 401.
- A customer instance (`ecxioaustriagmbhpartner.sb02.workfront.com`) returns the same objects and the same `PROJ` fields (183) as `api-cl01`.
- Metadata is schema. It is the same on every host. It has no custom fields.
- Data calls (for example `/user?action=count`) need a login. Without it they return "You are not currently logged in."
- Action calls need `PUT`. Test result: "PUT is required to perform an action operation".

How the Explorer works (read from `explorer.js`):

- The Explorer page is an iframe: https://developersupport.workfront.com/page-api-explorer.html
- Script: https://developersupport.workfront.com/explorer.js
- It calls `/metadata` for the list and `/{OBJCODE}/metadata` for one object.
- Version options: v15.0 to v22.0, and "unsupported".
- Filter: label starts with the search text (case-insensitive).
- Hidden: the `queries` section and the `label` key inside each item.

Version dropdown (read from https://developersupport.workfront.com/page-api-explorer.html on 2026-11-14):

- Element: `<select ng-change="updateAPIVersion()" ng-model="apiversion">`
- Options (value / label):

| Value | Label |
|---|---|
| `/v15.0` | API Version 15.0 |
| `/v16.0` | API Version 16.0 |
| `/v17.0` | API Version 17.0 |
| `/v18.0` | API Version 18.0 |
| `/v19.0` | API Version 19.0 |
| `/v20.0` | API Version 20.0 |
| `/v21.0` | API Version 21.0 |
| `/v22.0` (selected) | API Version 22.0 |
| `-unsupported` | API Unsupported |

- The value is appended to `/attask/api`. Example: `/attask/api` + `/v22.0` + `/metadata`.

Extra tests (2026-11-14, curl, no login):

- `/attask/api/v23.0/metadata` returns HTTP 200 with the same 174 objects as v22.0. `v23.0` is not in the Explorer dropdown.
- `/attask/api/v24.0/metadata` returns HTTP 400.
- `/attask/api-unsupported/metadata` returns HTTP 200. `/attask/api-unsupported/PROJ/metadata` returns HTTP 200.
- Object list: 29.8 KB, 0.5 s (4.4 KB with gzip). `PROJ` detail: 63 KB, 0.8 s.
- All 174 object details: about 1.16 MB, 8.2 s with 10 parallel calls.
- Response headers: `cache-control: no-store`, no `ETag`. A conditional request (`If-None-Match`) is not possible.

## 3. Scope

In scope (v1):

- Popup UI (see section 6.0).
- Version dropdown, same options as the Explorer.
- Scrollable object list.
- Object detail with 5 tabs (Fields, References, Collections, Search, Actions). The Queries tab is hidden for parity with the Explorer (decision 2026-11-14; reason: the user cannot verify that queries work).
- Loading indicators and empty states (see section 6.7).
- Two search boxes (object list and tab content).
- Cache, change check on open, background prefetch, and hourly refresh.
- Links between objects.

Out of scope (v1):

- Custom fields.
- Record data.
- Authenticated requests (see section 9, backlog).
- Context-menu lookup (see section 9.1, backlog).

## 4. Data model

### Object list

`data.objects` is a map. Each value:

| Key | Type | Use |
|---|---|---|
| name | string | Technical name |
| label | string | Display name |
| objCode | string | Code, for example PROJ |
| url | string | Metadata URL for this object |

### Object detail (`data`)

| Key | Content |
|---|---|
| name, label, objCode | Header |
| flags | Object flags, for example REPORTABLE, SHARABLE |
| operations | For example add, edit, delete, get, search, report, count, copy |
| fields | Map: field name to attributes |
| references | Map: single link to another object |
| collections | Map: list of linked objects |
| search | Map: filterable fields |
| actions | Map: named operations with arguments |
| queries | Map: named lookups with arguments (hidden in Explorer) |

### Item attributes (inside fields, references, collections, search)

| Key | Meaning |
|---|---|
| label | Display label |
| fieldType | Type, for example string, int, boolean, dateTime, string[], map |
| typeObjCode | Linked object code, if any |
| targetTypeObjCode | Target object code, if any |
| enumType | Enum type, if any |
| possibleValues | List of `{label, value}` |
| flags | For example NOT_GROUPABLE, LAZY_READ, READ_ONLY, DYNAMIC, WRITE_ONLY |
| url | Metadata URL of the linked object |

### Action attributes

| Key | Meaning |
|---|---|
| label | Action name |
| arguments | List of `{name, type}` |
| flags | List |
| resultType | Return type |

### Query attributes

| Key | Meaning |
|---|---|
| label | Query name |
| arguments | List of `{name, type}` |

No `flags` and no `resultType`.

## 5. Actions versus queries

- Same shape: both are named operations with arguments.
- Difference in metadata: actions have `flags` and `resultType`. Queries do not.
- Actions: change or calculate data. Examples: `PROJ.attachTemplate`, `TASK.markDone`, `TASK.assign`. Called with `PUT`.
- Queries: lookup helpers. Examples: `PROJ.helpDeskQueues`, `TASK.allTasksOnIterations`.
- 28 of 173 readable objects have queries.
- Open: how a query is called over HTTP. Not verified.
- Open: why the Explorer hides queries. Not verified. See section 11.

## 6. Functional requirements

### 6.0 Layout (from mockup)

Latest mockup: `mockup/mockup-v4-latest.png` (in the project folder).

- Entry point: toolbar popup. Size about 792 px x 445 px (left panel 260 px, right panel 500 px; changed from 600 px on 2026-11-14).
- Title: "Workfront API explorer" (top left).
- Version dropdown: top right (see section 6.4).
- Left panel: object search box ("Search objects") above a scrollable list of objects.
- Right panel: tabbed section for the object details.
  - Tab bar (5 tabs, in this order): Fields, References, Collections, Search, Actions. The first tab (Fields) is active by default.
  - No object selected: hide the content of the right panel (tab bar, tab search box, list). Show nothing, or a short hint such as "Select an object".
  - Below the tab bar: tab search box ("Search tabbed section") above a scrollable list of details for the selected tab.
- Both search boxes filter while the user types (about 200 ms debounce). No "Go" button.
- Close: a click outside the UI closes it.
  - **Inference:** A Chrome toolbar popup closes on an outside click by default. No code is needed. If the UI becomes a side panel or an injected overlay, this needs custom code. Not tested.

### 6.1 Entry points

- v1: toolbar popup.
- v2 (backlog): context menu on selected text (see section 9.1).

### 6.2 Object list

- Source: `GET https://api-cl01.my.workfront.com/attask/api/{version}/metadata`.
- Load on extension load: use the highest version number in the dropdown (see section 6.4). Cache the response.
- Show the list in the left panel. It scrolls.
- Show label and `objCode` per row.
- Show 174 rows. Include `ACTLOG`.
- Click a row: select the object, load its detail, open the right panel.
- Object search box (mockup v2): match label prefix as the Explorer does. Also match `objCode`.
  - Filter while typing, about 200 ms after the last key press.
  - Empty result: show "No objects found matching that filter" (the Explorer text).

### 6.2.1 Load, cache, and change check

On extension load (install, and each browser start):

1. Read the version options (see section 6.4).
2. Pick the highest version number. Set the dropdown to it.
3. Fetch `/{version}/metadata`. Store the response in cache.
4. Start the background prefetch of all object details (see below). It runs async. It does not block the UI.
5. Create the hourly alarm (see below).

On every popup open (the popup checks the list once; it then asks the service worker to prefetch details from the cached list, so the list is not fetched twice):

1. If the list is in cache: render it at once.
2. If the list is not in cache (for example the user opens the popup before step 3 ends): fetch it in the foreground. Show a loading state. Render when done.
3. Start an async fetch of the same metadata URL.
4. Compare the new response with the cache (hash of the response text).
5. If different: update the cache and re-render the list. Keep the selected object if it still exists.
6. If the fetch fails: keep the cache and show a small "Offline, showing cached data" note.

On object click:

1. If the detail is in cache: render it at once. Then check for changes async (same hash compare).
2. If the detail is not in cache (the prefetch has not reached it): fetch it in the foreground. Show a loading state. Store it. Render it.
3. The prefetch skips objects that are already cached. If a request for the same object is in flight, reuse it (no double fetch).

Background prefetch:

- Runs after the first list load. Fetches `/{version}/{OBJCODE}/metadata` for all objects in the list.
- Concurrency: limited, for example 5 parallel calls. **Inference:** Adobe rate limits for this endpoint are unknown. 10 parallel calls worked without error in the 2026-11-14 test (8.2 s for all 174). Not tested for repeated runs.
- `ACTLOG` returns 401. Store "Needs login". Do not retry it on every run.
- A user-requested fetch goes before queued prefetch calls.

Hourly refresh:

- Use `chrome.alarms`, period 60 minutes.
- Each run: fetch the list. Fetch all object details. Compare hashes. Write to storage only when a hash changed.
- If the browser was closed, alarms do not run. On browser start, run the refresh if the last run is older than 60 minutes.
- Scope: the currently selected API version only (default: latest). Each run also re-reads the version options and runs the version probe (section 6.4).
- When the user selects another version: run the same populate (list, then background prefetch of all details) for that version. Cache is keyed by version, so a version that was cached before shows at once and the check runs async.
- The calls are fast (see section 2), so one version per run is cheap. Refreshing all cached versions is not needed.
- Data per run: about 1.2 MB (see section 2).

Notes:

- The server sends `cache-control: no-store` and no `ETag`. A conditional request does not work. Every check downloads the full response (list: 29.8 KB, 4.4 KB with gzip).
- An unchanged list does not prove that object details are unchanged. The list holds only `name`, `label`, `objCode`, `url`. A field change in `PROJ` would not change the list. For that reason details have their own check (on open, and hourly).

### 6.3 Object detail

- Header: label, `objCode`, flags, operations.
- Tabs (5): Fields, References, Collections, Search, Actions. Each tab maps to one metadata key: `fields`, `references`, `collections`, `search`, `actions`, `queries`.
- Click a tab: show its items in the scrollable list.
- Tab search box: filters the items in the active tab while typing (about 200 ms debounce). Match on item name and label. Clear the box when the user selects another object.
- Show the item count on each tab, for example "Fields (183)". Optional. Not in the mockup.
- Per item (collapsed): label left, API name right. Type and flags show only in the expanded view.
- Expand an item to see all attributes, including `possibleValues`.
- Hide `label` in the expanded list (the Explorer does this).
- `typeObjCode` is a link. A click opens that object.
- Empty tab: show "No items" (the Explorer shows a blank text per section).
- Show "Needs login" if the call returns 401.
- The `queries` section is in the metadata and in the cache, but has no tab (decision 2026-11-14). Parity with the Explorer, which hides it.

### 6.7 Loading and empty states

- Loading indicator (spinner or similar) in each of these cases:
  - Object list: while the list is fetched in the foreground (cache empty, or version change).
  - Object detail: while a detail is fetched in the foreground (cache empty for the clicked object).
  - Version dropdown: while the options and the version probe load. Disable the dropdown until options exist.
- Do not show a loading indicator for the async change check when cached data is shown. Update the view without a flash.
- No object selected: right panel content is hidden (see section 6.0).
- Empty tab: "No items".
- Search without a match: "No objects found matching that filter" (object list). "No items match" (tab list).
- Error: HTTP status, URL, and a Retry button (see section 7).

### 6.4 Version selector

- Same dropdown as the Explorer. Same options and labels as the table in section 2.
- Position: top right of the popup.
- Options: v15.0 to v22.0 and "API Unsupported".
- On extension load, select the highest version number (today: v22.0).
  - "API Unsupported" does not count as a version number. Skip it for this rule.
- Change of selection: fetch and cache the list for that version, re-render the list, clear the right panel.
- Source of the options (decision): parse them from the Explorer page https://developersupport.workfront.com/page-api-explorer.html.
  - Reason: Adobe has no public list of API versions (user statement; not verified).
  - Find `<select ng-model="apiversion">`. Read each `<option>`: `value` and label text.
  - The `<option>` elements are in the static HTML of the page (checked 2026-11-14). The page is an Angular template, but the options are not generated by script.
  - Needs host permission for `developersupport.workfront.com`.
  - Parse with `DOMParser` in the popup or an offscreen document. **Inference:** a service worker has no DOM, so `DOMParser` is not available there. Not tested. Alternative: regex on the `<option value="...">` text.
  - Store the parsed options in cache. Re-parse on extension load and in the hourly refresh.
  - Fallback if the fetch or the parse fails: use the last cached options. If there are none, use a hard-coded list (v15.0 to v22.0, API Unsupported).
- "Latest" = highest version number after the version probe (below). Today this is v23.0.
  - **Known gap:** v23.0 is the current API version (user statement; not verified). The Explorer page does not list it yet. `/attask/api/v23.0/metadata` returns HTTP 200 (tested 2026-11-14). `v24.0` returns HTTP 400.
  - Version probe (decision, in v1): after parsing the options, request `/attask/api/v{highest+1}.0/metadata`. If the answer is HTTP 200, add that version to the dropdown with the label "API Version {n}.0". Repeat with the next number until the answer is not HTTP 200.
  - Run the probe on extension load and in the hourly refresh. Cache the result.
  - Validation (decision 2026-11-14): every version in the dropdown (parsed or probed) must answer its `/metadata` call with HTTP 200. A version that answers anything else is removed from the dropdown. A network error keeps the option (it proves nothing). If no numeric version is left, keep the unvalidated list. If the page lists no numeric version, use the hard-coded list.
  - Reason: a version that the API serves is real, and the probe costs one small call. Today: v23.0 returns 200 and v24.0 returns 400.
  - When Adobe adds the version to the Explorer page, the parsed list and the probe agree. No update is needed.
  - **Inference:** a probed version has no Adobe documentation. Its metadata can change without notice. The hourly refresh picks up changes.
- "Unsupported" URL form (tested 2026-11-14): `https://api-cl01.my.workfront.com/attask/api-unsupported/metadata` returns HTTP 200.

### 6.5 Host setting

- Default: `https://api-cl01.my.workfront.com`.
- v1: fixed to `https://api-cl01.my.workfront.com`. No setting.
- v2: see section 9.3 (cluster selector).
- **Inference:** The default is reachable from all networks. Not verified for IBM networks.

### 6.6 Utilities

- Keyboard: `/` focuses the search box.
- Keep state: the last selected object, tab, and both search texts, expanded items, and both scroll positions are restored when the popup opens (same version only).
- In an expanded item, null attributes, empty lists (e.g. empty `flags` or `arguments`) and `url` are hidden (`typeObjCode` is the link to the linked object).
- Selecting an object scrolls it into view in the list. If the search filter hides it, the filter is cleared.

## 7. Technical design

- Manifest V3.
- Permissions: `storage`, `alarms`. Add `unlimitedStorage` if the quota is a problem (see Cache).
- `host_permissions` (v1, narrow): `https://api-cl01.my.workfront.com/*`, `https://developersupport.workfront.com/*` (version options, section 6.4). v2 adds `https://*.my.workfront.com/*` (section 9.3).
- Background: a service worker runs the prefetch and the hourly alarm.
  - **Inference:** Chrome can stop a service worker when it is idle. The alarm starts it again. A run of about 8 s is short. Not tested.
- Fetch from the service worker or the extension page. With `host_permissions`, CORS does not block the call.
  - **Inference:** Based on Chrome extension rules. Not tested in a browser yet.
- Cache: `chrome.storage.local`, key = host + version + objCode. Keep list and detail separately. `PROJ` detail is about 64 KB.
- No cache expiry (decision 2026-11-14). The hourly refresh is the full check (list and all details, hash compare). A "Refresh" button forces the same run. It runs in the service worker, so closing the popup does not stop it; progress and result are kept in storage and shown the next time the popup opens. While it runs, the button shows a spinner and is disabled; the UI stays usable and the cache stays valid. When it ends, the list and the open object re-render and a note shows "Updated N items", "Already up to date", or "Refresh incomplete: N of M objects failed". A failed call never changes the cache. The list is also checked on every open (see section 6.2.1).
- Cache strategy (answer to the fetch-speed question):
  - Measured: list 0.5 s. One detail 0.8 s. All 174 details 1.16 MB in 8.2 s (10 parallel calls).
  - Decision: prefetch all details in the background after the first list load (see section 6.2.1). Fetch on demand when the cache is empty for the requested object.
  - Size 1.16 MB is small for `chrome.storage.local` (quota 10 MB by default; **inference** from Chrome docs, check). Use `unlimitedStorage` if the quota is a problem.
  - Change check for details: no `ETag`, so compare a hash per object. Check on open (async) and in the hourly refresh.
  - Scope of "once across browsers" (user intent: across all browser sessions, including incognito):
    - Normal windows: `chrome.storage.local` is shared by all windows and sessions of one Chrome profile. This meets the need.
    - Incognito: decision: allowed. The cache holds public schema data only, with no record data and no credentials, so shared storage is acceptable.
    - **Inference:** an extension runs in incognito only if the user turns on "Allow in Incognito" for it. With the default `spanning` incognito mode, the extension has one storage for normal and incognito windows. Basis: Chrome extension docs (https://developer.chrome.com/docs/extensions). Add a setup note to the install steps.
    - Different Chrome profiles, and other browsers (Edge, Firefox): each has its own storage and its own cache. The extension fetches and caches again there. Cost: about 1.2 MB, 8 s.
    - `chrome.storage.sync` has a small quota (about 100 KB total; **inference**, check docs). It does not fit this data.
    - A cache shared between profiles and browsers needs a server. Out of scope.
- UI: plain HTML and JS, or a small framework. No remote code (MV3 rule).
- Errors: show HTTP status and URL. Retry button.

## 7.1 Icons and store assets

- Source files in the project folder: `icon.png` (263 x 263), `tile.png` (440 x 171), `banner.png` (1400 x 171).
- Manifest: `icons` = 16, 32, 48, 128 (PNG). `action.default_icon` = 16, 32.
- Store needs: icon 128 x 128, small tile 440 x 280, marquee 1400 x 560 (optional), 1 to 5 screenshots at 1280 x 800 or 640 x 400.
- Gap: `tile.png` and `banner.png` have a height of 171 px. The store sizes need 280 px and 560 px. Acknowledged by the user.
- The three source images stay unchanged. Resized icon copies go in `icons/`.
- Logo rights: acknowledged by the user.
- Source: https://developer.chrome.com/docs/webstore/images

## 8. Non-functional requirements

- Open the list in under 1 second from cache.
- The change check runs async. It must not block the first render.
- Popup size: about 792 px x 445 px (Chrome popup maximum is 800 px wide).
- No data leaves the browser except the calls to Workfront hosts.
- No API key and no password stored in v1.
- Accessible: keyboard navigation and visible focus.

## 9. Backlog

### 9.1 v2: context menu on selected text

- Trigger: the user selects text in a browser window and opens the right-click menu.
- Match: compare the selected text with the cached object list (`objCode`, `name`, `label`; case-insensitive).
  - **Inference:** The match rule is not defined in the request. Proposed: exact match, case-insensitive. Confirm.
- Match found: show the menu item "Workfront API explorer". It has a submenu with 5 items: Fields, References, Collections, Search, Actions.
- Click a submenu item: show the list from that tab for the matched object.
- No match: do not show the menu item.
- Technical notes (**inference**, not tested):
  - Chrome builds context menus before it knows the selection. Use `chrome.contextMenus` with `contexts: ["selection"]`. Update the menu on `selectionchange` from a content script, or on the `onShown` event if available. Check the Chrome docs.
  - Needs permissions `contextMenus` and a content script or `activeTab`.
  - Showing the list: open the popup (`chrome.action.openPopup`), a side panel, or an injected overlay. Decide in v2.
  - The list must come from cache so the menu check is fast.

### 9.3 v2: cluster selector

- Options page with a text field for the cluster, default `cl01`.
- Host form is always `https://api-{cluster}.my.workfront.com`. No other host forms.
- Free text, no validation (decision 2026-11-14: wrong input is the user's problem).
- Metadata could differ per cluster. The cache key already includes the host, so each cluster has its own cache.
- Deferred: behavior when a cluster is down. Address when this is built.
- Needs `host_permissions` for `https://*.my.workfront.com/*`.

### 9.2 Send a request (authenticated)

Status: backlog. Not part of v1.

Context:

- Adobe plans to end API keys (user statement; source not verified).
- The extension needs an authenticated browser session with the target instance.
- Login uses Adobe SSO. Do the login in a popup window.

Proposed approach (design only, not tested):

1. User selects an instance host.
2. Extension opens the host in a popup window for SSO login.
3. Extension calls `https://{host}/attask/api/v22.0/{OBJ}` with `credentials: 'include'`.
4. If that fails, run the call in the page of an open Workfront tab with `chrome.scripting.executeScript`. Permissions: `scripting`, `activeTab`.
5. Show the response. Read-only first.

Open tests:

- Does the session cookie authenticate API calls? Test `GET /attask/api/v22.0/user?action=count` after login.
- Does the extension service worker send the cookie? Check `SameSite` rules.
- What is the Adobe-supported way to authenticate after API keys end? Check Adobe developer docs.
- Can IBM policy allow session reuse by an extension? Ask IT and security.

Safety rules (if built):

- Read-only by default (GET).
- Block POST, PUT, DELETE until the user confirms.
- Never store session tokens in extension storage.
- Show the exact URL before sending.

## 10. Test plan

- Version dropdown shows 9 options (v15.0 to v22.0, API Unsupported).
- First load: dropdown is set to the highest version (v22.0).
- List loads: 174 objects. List scrolls.
- Open popup a second time: list shows from cache at once. Async check runs.
- Change the cached list (test hook): next open updates the list.
- Version options come from the Explorer page. With the page blocked: cached options, then the hard-coded list.
- Version probe: v23.0 appears in the dropdown and is selected on first load. v24.0 does not appear.
- No object selected: right panel content is hidden.
- Loading indicators show while the list, a detail, or the version options load.
- Click an object: right panel shows 5 tabs. Fields is active.
- Click each tab: items show for that tab.
- Object search: the list filters while typing (about 200 ms). "proj" finds Project.
- Tab search: filters the items in the active tab while typing. Selecting another object clears it.
- Change the version: the list and the cache switch to that version.
- Open the popup right after install (empty cache): list loads in the foreground. A clicked object loads on demand.
- Prefetch: after about 10 s all 174 details are in cache (`ACTLOG` as "Needs login").
- Hourly alarm: change a cached hash (test hook). After the run the detail is updated.
- Incognito (with "Allow in Incognito" on): the cache is available.
- Click outside the popup: popup closes.
- `PROJ` detail: 183 fields, 11 actions (as of 2026-11-11).
- `TASK` detail: 20 actions.
- `ACTLOG`: shows "Needs login".
- Search `proj` returns Project and similar labels.
- Click a `typeObjCode` link: opens the linked object.
- Version change reloads data.
- Offline: shows cache, then an error if no cache.

## 11. Open questions

- No open questions block v1 build.
- v2 match rule for selected text (exact, case-insensitive)?
- Why does the Explorer hide queries? (No Adobe source found.)
- How are queries called over HTTP?
- Does Adobe allow third-party tools to use the metadata endpoint? Check Adobe terms.
- Name and icon of the extension.
- Distribution: Chrome Web Store, or load unpacked for internal use?

## 12. References

- API Explorer: https://developer.adobe.com/workfront/api-explorer/
- Explorer frame: https://developersupport.workfront.com/page-api-explorer.html
- Explorer script: https://developersupport.workfront.com/explorer.js
- Explorer docs source: https://github.com/AdobeDocs/workfront-api-explorer
- Metadata list: https://api-cl01.my.workfront.com/attask/api/v22.0/metadata
- Metadata example: https://api-cl01.my.workfront.com/attask/api/v22.0/PROJ/metadata
- Chrome extension docs: https://developer.chrome.com/docs/extensions
