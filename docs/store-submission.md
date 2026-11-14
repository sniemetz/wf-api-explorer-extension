# Chrome Web Store submission: draft answers

Status: DRAFT. Open decisions are marked **DECIDE**.

## Open decisions
Decided:
- Visibility: public.
- Privacy policy: `docs/privacy.md` in the public GitHub repo; use its GitHub URL in the store form.
- Publisher: personal account.
- `unlimitedStorage`: removed. v22 data is about 0.8 MB; the cache keeps 10 versions in total: `-unsupported` plus the 9 newest numeric ones (`MAX_CACHED_VERSIONS`), so it stays under the default 10 MB quota.
- Session cookies / user instances: out of scope for now (no authentication).

Open:
- **DECIDE** Clearance from Workfront for a public listing that names Workfront (to ask).
- Privacy policy URL for the store form: https://github.com/sniemetz/wf-api-explorer-extension/blob/master/docs/privacy.md

## Package checklist
- Zip the contents of `extension/` with `manifest.json` at the zip root.
- Exclude: `test/`, `docs/`, `assets/`, `.superpowers/`, `package.json`.
- Bump `version` in `extension/manifest.json` for each upload.
- Final icons (16, 32, 48, 128) in place.

## Listing text (draft)
- **Name:** Workfront API Explorer
- **Summary (max 132 chars):** Browse Workfront API object metadata: fields, references, collections, search, actions and queries. Works offline from cache.
- **Description:**
  Browse the Workfront API metadata in a compact popup.
  - Search objects and drill into fields, references, collections, search, actions and queries.
  - Pick the API version; the list follows the versions shown in Workfront's own API Explorer.
  - Data is cached locally, so it opens instantly and works offline.
  - Refresh button re-reads the version list and all cached data.

  Not affiliated with or endorsed by Adobe or Workfront. (**DECIDE** wording.)

## Privacy tab answers
- **Single purpose:** Show Workfront API object metadata (fields, references, collections, search, actions, queries) for the selected API version.
- **Permission justifications:**
  - `storage`: Cache downloaded API metadata and remember the selected version and the popup view state (selected object, tab, search text, scroll).
  - `alarms`: Check once an hour whether the object list changed and download metadata for new objects.
  - Host `https://api-cl01.my.workfront.com/*`: Read the public API metadata endpoints (`/attask/api/vNN.0/metadata` and `/<OBJCODE>/metadata`).
  - Host `https://developersupport.workfront.com/*`: Read the API Explorer page to find which API versions it offers.
- **Remote code:** No. All code ships in the package. Remote content is parsed as data (JSON, and one HTML page read with a regular expression) and rendered as text only.
- **Data collected:** None sent anywhere. The extension makes read-only requests to the two hosts above. It sends no user data, has no analytics and has no third-party servers. Local storage holds API metadata and view state only.
- **Authentication:** None. The extension reads public metadata endpoints and handles no credentials or cookies.
- **Certifications:** All three (no sale of data, no unrelated use, no creditworthiness use) are true.

## Pre-submit checks
- Load the zip (not the folder) as unpacked and run through: first open, version switch, Refresh, offline open.
- Confirm no console errors in the popup and in the service worker.
- Confirm the "Allow in Incognito" note in the README still matches behaviour.
- 1 to 5 screenshots at 1280x800 (or 640x400). Source: the popup, plus `assets/source/tile.png` / `banner.png` for the optional promo images (check their sizes: promo tile 440x280, marquee 1400x560).

## Review expectations
- Automated plus manual review: typically days, sometimes 1 to 2 weeks.
- Common rejection causes: unclear single purpose, permissions not justified, missing privacy policy, trademark in name/description.
- Later updates are reviewed too; unchanged permissions review faster.
