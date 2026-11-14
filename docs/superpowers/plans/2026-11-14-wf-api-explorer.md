# Workfront API Explorer Extension (v1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chrome MV3 toolbar popup that shows Workfront API object metadata (same data as the API Explorer, plus Queries).

**Architecture:** Plain ES modules, no bundler, no framework. Logic lives in `extension/lib/*.js` (pure, testable with `node --test`, `fetch` and `chrome.storage` injected). Service worker and popup both import the same lib modules. UI is plain HTML/CSS/JS.

**Tech Stack:** Chrome MV3, ES modules, `node:test` (Node 24), ImageMagick `convert` for icons.

**Spec:** `docs/spec.md` (v0.5). Mockup: `docs/mockup/mockup-v4-latest.png`.

## Global Constraints

- Manifest V3. No remote code.
- Permissions: `storage`, `alarms`. Add `unlimitedStorage` only if quota is a problem.
- `host_permissions`: `https://api-cl01.my.workfront.com/*`, `https://*.workfront.com/*`, `https://*.my.workfront.com/*`.
- Host: fixed constant `https://api-cl01.my.workfront.com` (no host setting, no options page). Metadata URL: `{host}/attask/api{versionValue}/metadata` and `{host}/attask/api{versionValue}/{OBJCODE}/metadata`. `versionValue` is `/v22.0` or `-unsupported`.
- Version options source: `<select ng-model="apiversion">` in `https://developersupport.workfront.com/page-api-explorer.html`. Fallback: v15.0 to v22.0 + "API Unsupported".
- Version probe: request `v{highest+1}.0` until not HTTP 200. v23.0 = 200, v24.0 = 400 today.
- Cache: `chrome.storage.local`, key = host + version + objCode. Hash = hash of response text.
- Concurrency for prefetch: 5. User fetch goes before queued prefetch. `ACTLOG` (401) = "Needs login", no retry.
- Hourly alarm: `chrome.alarms`, period 60 min, selected version only. Write only when hash changed. Run on browser start if last run older than 60 min.
- Popup about 600 px x 445 px. Search debounce 200 ms. No "Go" button.
- Tabs in order: Fields, References, Collections, Search, Actions, Queries (keys `fields`, `references`, `collections`, `search`, `actions`, `queries`). Hide `label` in expanded item.
- Texts: "No objects found matching that filter", "No items", "No items match", "Needs login", "Offline, showing cached data", "Select an object".
- Do not modify `assets/source/*`.
- No Claude attribution in commits.

## Review Focus

- Malformed or empty Explorer HTML: parser returns `[]`, fallback list is used.
- Network offline on first open (empty cache): error with status/URL and Retry, no blank screen.
- Version change while a detail fetch is in flight: stale response must not render.
- Object list change drops the selected object: right panel clears, no exception.
- Popup closed mid-prefetch: SW prefetch continues independent of popup; no half-written cache entries.

## Decisions (user-confirmed 2026-11-14)

1. Version options parsed with regex in the service worker.
2. No 24 h expiry. The hourly refresh is the full cache check. Keep a Refresh button (forces the same full re-sync).
3. No custom host. Host is a constant. No options page. Removed from spec and test plan.
4. Item counts in tab labels: included.
5. Tests: `node --test` for lib; user does UI checks.
6. Execution: native.

7. Deep link and omnibox: dropped from spec. (v2 context menu shows the lists in its submenus; it does not open the explorer.)

Open: cluster setting (see conversation 2026-11-14): options page with a cluster field, default `cl01`. Not yet in plan.

## File Structure

```
extension/
  manifest.json
  lib/
    versions.js    parse options, fallback, probe, highest, URL builder
    hash.js        sha256 hex of text
    cache.js       storage wrapper: get/set by key, list/detail/versions/lastRun
    api.js         fetchList, fetchDetail, in-flight dedupe, error type
    sync.js        checkAndStore, prefetchAll (queue), refresh (hourly)
    filter.js      filterObjects, filterItems
    config.js      HOST, EXPLORER_URL constants
  background/sw.js
  popup/popup.html, popup.css, popup.js, render.js
  icons/icon{16,32,48,128}.png
test/*.test.js
package.json  (scripts.test = "node --test test/")
```

---

### Task 1: Scaffold, manifest, icons

**Files:** Create `extension/manifest.json`, `extension/icons/icon{16,32,48,128}.png`, `package.json`, `.gitignore`, `README.md`.

**Interfaces:** Produces the loadable shell: manifest references `background/sw.js` (type module), `popup/popup.html`, `icons`, `action.default_icon` (16, 32).

- [ ] **Step 1:** Write `manifest.json` with name "Workfront API Explorer", permissions and host_permissions from Global Constraints, `action.default_popup`, `background.service_worker` + `"type": "module"`.
- [ ] **Step 2:** Create icons: `convert assets/source/icon.png -resize {N}x{N} extension/icons/icon{N}.png` for 16, 32, 48, 128.
- [ ] **Step 3:** Check icon reads at 16 px: open `icon16.png` zoomed (`convert ... -scale 800%`) and view it. Expected: shield shape recognisable. If not, raise with user.
- [ ] **Step 4:** `package.json` (`"type": "module"`, `test` script), `.gitignore` (`node_modules/`, `*.zip`), `README.md` (load unpacked steps, "Allow in Incognito" note).
- [ ] **Step 5:** Verify: `chrome://extensions` > Load unpacked > `extension/` loads without manifest errors (stub files for sw/popup exist).
- [ ] **Step 6:** Commit `feat: scaffold MV3 extension and icons`.

### Task 2: versions.js

**Files:** Create `extension/lib/versions.js`; Test `test/versions.test.js`.

**Interfaces:** Produces:
- `FALLBACK_VERSIONS: Array<{value: string, label: string}>` (9 entries, table in spec section 2).
- `parseVersionOptions(html: string): Array<{value, label}>` (regex on `<option value="...">label</option>` inside the `ng-model="apiversion"` select).
- `highestVersion(options): {value, label}` (highest `/vN.M`, ignores `-unsupported`).
- `probeVersions(options, fetchFn, host): Promise<Array<{value, label}>>` (appended hits, label `API Version N.0`).
- `metadataUrl(host, versionValue, objCode?): string`.

- [ ] **Step 1:** Tests: parse a fixture of the real select (9 options, `/v22.0` selected) returns 9 entries with exact value/label; parse of `""` and of HTML without the select returns `[]`; `highestVersion` of the 9 returns `/v22.0`; `probeVersions` with fake fetch (v23.0 → 200, v24.0 → 400) returns `[{value:'/v23.0', label:'API Version 23.0'}]`; fetch rejection returns `[]`; `metadataUrl('https://h','/v22.0')` = `https://h/attask/api/v22.0/metadata`, with `'PROJ'` = `.../v22.0/PROJ/metadata`, `'-unsupported'` = `https://h/attask/api-unsupported/metadata`.
- [ ] **Step 2:** `node --test test/versions.test.js` → FAIL (module missing).
- [ ] **Step 3:** Implement per signatures.
- [ ] **Step 4:** Run → PASS. Commit `feat: version parsing and probe`.

### Task 3: hash.js and cache.js

**Files:** Create `extension/lib/hash.js`, `extension/lib/cache.js`; Test `test/cache.test.js`.

**Interfaces:** Produces:
- `sha256(text: string): Promise<string>` (hex, `crypto.subtle`).
- `createCache(storageArea): Cache` where `storageArea` has `get(keys)` / `set(obj)` (chrome.storage.local shape; tests pass an in-memory fake).
- `Cache`: `getList(host, ver)`, `setList(host, ver, {hash, data, fetchedAt})`, `getDetail(host, ver, code)`, `setDetail(host, ver, code, entry)`, `getVersions(host)`, `setVersions(host, entry)`, `getLastRun()`, `setLastRun(ts)`. Entries: `{hash, data, fetchedAt}`, or `{needsLogin: true}` for 401. Key format `list|host|ver`, `detail|host|ver|code`.

- [ ] **Step 1:** Tests: `sha256('abc')` equals known SHA-256 hex; set-then-get round trip for list/detail/versions; get of missing key returns `undefined`; keys for two versions of the same object do not collide; `needsLogin` entry round-trips.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS. Commit `feat: hash and cache`.

### Task 4: api.js

**Files:** Create `extension/lib/api.js`; Test `test/api.test.js`.

**Interfaces:** Consumes `metadataUrl`. Produces:
- `class ApiError extends Error { status: number|null, url: string }`.
- `createApi(fetchFn): { fetchList(host, ver): Promise<{text, data}>, fetchDetail(host, ver, code): Promise<{text, data}> }`.
- `fetchDetail` throws `ApiError` with `status: 401` for `ACTLOG`-like responses; non-2xx throws `ApiError`; network failure throws `ApiError` with `status: null`.
- Same `(host, ver, code)` requests in flight share one promise (dedupe).

- [ ] **Step 1:** Tests: 200 returns `{text, data}` parsed from `data` key; 401 → `ApiError.status === 401` and `url` set; fetch reject → `status === null`; two concurrent `fetchDetail` for one code call fetch once.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS. Commit `feat: metadata api client`.

### Task 5: sync.js

**Files:** Create `extension/lib/sync.js`; Test `test/sync.test.js`.

**Interfaces:** Consumes `api`, `cache`, `sha256`. Produces `createSync({api, cache, now}): Sync`:
- `checkList(host, ver): Promise<{changed: boolean, entry}>` (fetch, compare hash, write only if changed).
- `checkDetail(host, ver, code): Promise<{changed, entry}>` (401 → stores `{needsLogin:true}`, `changed` false on repeat).
- `prefetchAll(host, ver, codes: string[], {concurrency = 5}): Promise<void>` (skips cached codes and `needsLogin` codes; `prioritise(code)` moves a code to the queue front).
- `refresh(host, ver): Promise<void>` (list + all details; sets `lastRun`).
- `refreshIfStale(host, ver, maxAgeMs = 3600000): Promise<boolean>`.

- [ ] **Step 1:** Tests: unchanged hash → `changed:false` and `setList` not called (spy); changed hash → written; `prefetchAll` with 12 codes never runs more than 5 fetches at once (fake delayed fetch tracks max); cached codes skipped; ACTLOG 401 stored as `needsLogin` and not refetched on second run; a prioritised code runs before queued ones; `refreshIfStale` returns false when `lastRun` is 59 min old, true at 61 min.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS. Commit `feat: sync, prefetch, refresh`.

### Task 6: filter.js and config.js

**Files:** Create `extension/lib/filter.js`, `extension/lib/config.js`; Test `test/filter.test.js`.

**Interfaces:** Produces:
- `filterObjects(objects: Array<{name,label,objCode,url}>, q: string)`: label starts with q (case-insensitive) OR objCode contains q case-insensitive; empty q returns all.
- `filterItems(entries: Array<[name, attrs]>, q: string)`: match on name or `attrs.label`, case-insensitive substring.
- `config.js`: `HOST = 'https://api-cl01.my.workfront.com'`, `EXPLORER_URL = 'https://developersupport.workfront.com/page-api-explorer.html'`.

- [ ] **Step 1:** Tests: `"proj"` finds Project (label) and PROJ (code); `"zzz"` returns `[]`; empty returns all; item filter matches name and label.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS. Commit `feat: filters and config`.

### Task 7: Service worker

**Files:** Create `extension/background/sw.js`.

**Interfaces:** Consumes `createApi`, `createCache`, `createSync`, version helpers, `HOST`, `EXPLORER_URL`.

- [ ] **Step 1:** On `runtime.onInstalled` and `runtime.onStartup`: fetch Explorer page (`https://developersupport.workfront.com/page-api-explorer.html`), parse options (fallback: cached, then `FALLBACK_VERSIONS`), run probe, cache versions, choose highest, `checkList`, `prefetchAll`, `alarms.create('refresh', {periodInMinutes: 60})`.
- [ ] **Step 2:** On `alarms.onAlarm` `refresh`: re-read versions + probe, `refresh(host, selectedVersion)`. On startup also `refreshIfStale`.
- [ ] **Step 3:** Store the selected version in `chrome.storage.local` key `selectedVersion` (popup and SW share it).
- [ ] **Step 4:** Verify manually: load unpacked, open SW devtools. Expected: after about 10 s `chrome.storage.local.get(null)` holds `list|...` and about 173 `detail|...` keys; ACTLOG is `needsLogin`; `chrome.alarms.getAll()` shows `refresh` at 60 min.
- [ ] **Step 5:** Commit `feat: service worker load, prefetch, alarm`.

### Task 8: Popup shell, object list, version dropdown

**Files:** Create `extension/popup/popup.html`, `popup.css`, `popup.js`, `render.js`.

**Interfaces:** `render.js` produces `renderObjectList(el, objects, onSelect)`, `showState(el, 'loading'|'error'|'empty', info)`. `popup.js` consumes lib modules.

- [ ] **Step 1:** Layout per mockup v4: title left, version dropdown right, left panel (search + list rows: label + objCode), right panel hidden with hint "Select an object". Size 600 x 445.
- [ ] **Step 2:** Open flow (spec 6.2.1): cache hit → render at once, then `checkList` async and re-render only if changed (keep selection if still present; else clear right panel). Cache miss → loading state, foreground fetch. Fetch fail with cache → "Offline, showing cached data"; without cache → error with status, URL, Retry.
- [ ] **Step 3:** Version dropdown: disabled until options exist; on change set `selectedVersion`, clear right panel, show cached list or load, start `prefetchAll`. Ignore responses from a previous version (token check).
- [ ] **Step 4:** Object search: 200 ms debounce, "No objects found matching that filter".
- [ ] **Step 5:** Verify manually against test plan items: 174 rows, scrolls, version default highest (v23.0), second open instant, offline (DevTools offline) shows cache, "proj" finds Project. Commit `feat: popup object list and version selector`.

### Task 9: Detail panel

**Files:** Modify `popup/popup.js`, `popup/render.js`, `popup.css`.

**Interfaces:** `renderDetail(el, detail, activeTab, query)`, `renderItem(name, attrs, expanded)`.

- [ ] **Step 1:** On object click: cached detail renders at once and `checkDetail` runs async; uncached → `prioritise(code)` + loading + foreground fetch. 401 → "Needs login". Ignore stale responses (selection token).
- [ ] **Step 2:** Header: label, objCode, flags, operations. Six tabs with item counts, Fields active by default. Tab search (200 ms debounce), cleared when another object is selected. Empty → "No items"; no match → "No items match".
- [ ] **Step 3:** Row: label, name, type, flags. Expand shows all attributes except `label`, incl. `possibleValues`. Actions/Queries show `arguments` (`name: type`) and, for actions, `resultType`.
- [ ] **Step 4:** `typeObjCode` is a link that selects that object (if present in list).
- [ ] **Step 5:** Verify manually: `PROJ` = 183 fields, 11 actions, 3 queries; `TASK` = 20 actions, 2 queries; `ACTLOG` "Needs login"; type link opens linked object. Commit `feat: popup object detail tabs`.

### Task 10: Utilities and final checks

**Files:** Modify popup files.

- [ ] **Step 1:** Copy-as-JSON button per item and per object (`navigator.clipboard.writeText`). `/` focuses the object search box (not while typing in an input). Refresh button (forces `refresh`, decision 2).
- [ ] **Step 2:** Accessibility: keyboard navigation of list and tabs, visible focus.
- [ ] **Step 3:** `npm test` (all pass). User runs the UI checklist from `docs/spec.md` section 10.
- [ ] **Step 4:** Take 1280 x 800 screenshots for the store into `assets/store/`. Commit `feat: utilities and verification`.

---

## Self-review

- Spec coverage: sections 6.0 to 6.7, 7, 7.1, 8, 10 map to Tasks 1 to 10. Backlog 9.1, 9.2 excluded (per hand-off). Custom host (6.5) removed (cluster setting pending). Deep link and omnibox dropped.
- Test split: pure lib logic under `node --test`; UI and chrome APIs verified manually by the user.
