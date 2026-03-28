# CLAUDE.md

## What is this?

Chrome Extension (Manifest V3) that captures bearer tokens from UiPath portal HTTP requests. Internal dev tool for extracting and inspecting OAuth/JWT tokens.

## Architecture

- `manifest.json` — Extension config. Scoped to `*.uipath.com` domains.
- `background.js` — Service worker. Intercepts `Authorization: Bearer` headers via `chrome.webRequest.onBeforeSendHeaders`. Stores tokens per tab in a `Map`. Decodes JWTs, classifies token types, handles auto-cleanup timers.
- `popup.html` / `popup.js` / `popup.css` — Popup UI. Displays captured tokens, tenant info, settings modal. Communicates with background via `chrome.runtime.sendMessage`.
- `create_icon.py` — One-off script that generated the extension icons.

## Key concepts

**Token types** (classified by `client_id` in JWT payload):
- `UserAccessToken` — client_id `1119a927-...`
- `PortalPkceToken` — client_id `73ba6224-...`
- `IdToken` — from `id-alpha/id/id-staging.uipath.com` URLs
- `Unknown` — everything else

**Tenant extraction**: Uses `chrome.scripting.executeScript` in `MAIN` world to call `PortalShell.AccountAndTenants.getCachedAccount()` on the UiPath page.

**Settings** (persisted via `chrome.storage.local`): auto-cleanup timer, token masking.

## Development

**Chrome extension**: No build step. Load as unpacked extension in `chrome://extensions` with Developer Mode on. Reload after editing; background service worker changes require explicit reload.

**Dev server** (preferred for iteration):
```
cd dev && npm install && npm start
```
Opens at http://localhost:3000. Serves the popup as a regular web page with Chrome APIs shimmed. Live-reloads on file changes. Extension source files are NOT modified — the shim is injected at serve time.

### Token file for testing: `.dev-token`

Path: **`dev/.dev-token`** (inside the `dev/` folder, alongside `server.js`). This file is gitignored and should never be committed.

It contains a raw "Copy as fetch()" output from browser DevTools — the full `fetch("https://...", { headers: { "authorization": "Bearer eyJ..." } })` string.

**To provide/refresh a token:**
1. Go to a UiPath portal page, open DevTools → Network tab
2. Right-click any request with an `Authorization: Bearer` header → "Copy as fetch()"
3. Paste the entire output into `dev/.dev-token` (overwrite any previous contents)

### Running tests

```
cd dev && npx playwright test
```

The Playwright config auto-starts and stops the dev server. 11 tests run deterministically using sample tokens (no real credentials needed). 1 integration test uses `dev/.dev-token` — it is automatically skipped if the file is missing, the token is expired, or the JWT is invalid.

**Dev script** (whitelisted, run with `--help` for details):
- `node dev/claude/check-token.js` — check if `dev/.dev-token` exists and isn't expired

**After making changes, always run `cd dev && npx playwright test` to verify.** If the integration test is skipped and you need it to run, ask the user to refresh `dev/.dev-token`.

### Human testing workflow

1. Start the dev server: `cd dev && npm start`
2. Open http://localhost:3000 in a browser
3. Paste a "Copy as fetch()" string into the dev toolbar textarea — it auto-injects on paste
4. The token appears in the UI with correct type classification and expiry
5. Click "Fetch Tenants" to pull real tenant data from UiPath using the injected token
6. Use sample token buttons for quick UI-only testing without a real token
7. Edit any source file — the page auto-reloads

### Testing a new feature (Claude Code workflow)

After implementing a feature, verify it works in three steps:

**Step 1: Manual verification with Playwright MCP**
1. Start the dev server: `cd dev && npm start &`
2. `browser_navigate` to `http://localhost:3000`
3. Interact with your new feature using `browser_click`, `browser_fill`, `browser_evaluate`, `browser_snapshot`
4. Confirm it works as expected visually via snapshots
5. Kill the server: `pkill -f 'node server.js'`

**Step 2: Write a Playwright test**
1. Add a new `test()` to `dev/tests/dev-server.spec.js` (or a new `.spec.js` file in `dev/tests/`)
2. Use sample tokens via `injectSampleToken(page, 'UserAccessToken')` — no real credentials
3. If the feature requires a real token, guard with the `getTokenStatus()` pattern and `test.skip`
4. Tests must be deterministic and parallel-safe — all state lives in the page, no server-side state

**Step 3: Run the full test suite**
```
cd dev && npx playwright test
```
All existing tests must still pass. The new test must pass. If the integration test is skipped due to an expired token, that's fine — it's not a failure.

### Dev server architecture

The server is **stateless** — it serves files, injects the Chrome API shim at serve time, and proxies tenant API calls. All token state lives in the browser page. The only server-side endpoint is `POST /api/tenants` which accepts `{token, url}` in the request body and proxies to the real UiPath tenant API. WebSocket is used only for live reload on file changes.

## Conventions

- Plain vanilla JS, no frameworks or bundlers.
- All popup ↔ background communication uses `chrome.runtime.sendMessage` with an `action` field.
- Sender validation in background.js rejects messages not from the extension itself.
- URL navigation validates protocol (HTTP/HTTPS only) before `chrome.tabs.update`.
