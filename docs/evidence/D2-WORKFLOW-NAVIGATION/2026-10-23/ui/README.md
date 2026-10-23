# Existing catalog browser qualification

## What already exists

`client/src/concept2cure/v2/surfaces/AdminSurfaces.tsx` exports the actual `Apps` catalog. This harness imports that component and the shipped CSS; it does not recreate the screen. The prior W5 market identity evidence already demonstrates the Vite + installed Chromium/Playwright actual-component pattern; this extends that qualification approach to workflow discovery.

## Method and limits

Vite binds `127.0.0.1:5201`; Playwright intercepts every `/api/**` request with synthetic catalog/licence records. A test-only rendered callback records navigation targets. The backend, authentication, tenant database, agency services and model providers are not started. The single permitted PUT is an intercepted synthetic confirmation response. No production write, live signature or transmission occurs. This is automated synthetic UI evidence, not human acceptance or authenticated deployed-client acceptance.

The check covers desktop overview, keyboard-operated disclosures and focus indication, dark search-field contrast, 390px mobile layout, nested feature search and original navigation IDs, unknown-row retention, launch lock preservation, distinct no-match/empty/error/malformed states, and a reason-bearing toggle after filtering/regrouping. Source hashes before and after browser execution detect selected-input changes during qualification. Screenshots and result JSON are written in `browser-result/`.

Run only after root has frozen implementation inputs:

```
node docs/evidence/D2-WORKFLOW-NAVIGATION/2026-10-23/ui/browser-server.mjs
node docs/evidence/D2-WORKFLOW-NAVIGATION/2026-10-23/ui/browser-check.mjs
```

Use the repository's supported Node 22 executable. Browser tooling is the existing `/opt/codex/cua_node/lib/node_modules/playwright-core` and `/usr/bin/chromium`; no dependency is added or installed.

## Executed result

Final fresh-server run: **11 checks passed**, zero browser page errors, 22 selected source input hashes unchanged before/after execution. Desktop 1440px and mobile 390px screenshots are retained; no horizontal mobile overflow remains. Dark search text is `rgb(250, 249, 245)` on `rgb(38, 38, 36)`, measured contrast **14.39:1**. Native disclosure keyboard focus has a 1px auto outline and Enter opens/closes it. Exactly one intercepted synthetic PUT targeted `/api/module-subscriptions/review/toggle` with its confirmed reason; no live backend was called.

`first-run/` retains the original real mobile overflow failure (390px viewport, 852px document), exact original browser-check source, log and screenshot. Root corrected responsive licence layout and dark-search tokens. `stale-server-run/` retains a subsequently rejected dark-contrast run: Vite had `watch: null` and was still serving earlier transformed modules despite source-file updates, so that run does **not** qualify final source. Restarting Vite loaded the corrected source and all checks passed. Restart this fixture server after every production change; source hashes alone cannot detect a stale Vite module graph.

`pre-settled-capture/` retains the first passing fresh-server result and exact check source. Its screenshots captured existing card background transitions mid-frame. Final `browser-check.mjs` uses Playwright screenshot `animations: 'disabled'` for settled visual artifacts; no behavior assertion was removed or weakened. The unchanged 11 behavior checks passed again. `browser-result/result.json` and `browser-execution-final.txt` are authoritative final outputs. Historical failure JSON/PNG remaining in `browser-result/` are also retained; they are not the final verdict.

The browser harness was stopped after qualification. This packet does not claim backend integration, login/session behavior, every client persona, screen-reader acceptance, deployment acceptance or agency support beyond the unchanged server contracts.
