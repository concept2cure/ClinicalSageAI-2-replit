# Actual-component browser qualification plan

## What already exists

The approved design inventories the existing drawer, shared uploader/transport/parser, local store, canonical account/shell guards and styles. This harness imports that shipped `DossierDrawer`; it does not render a parallel upload implementation. It reuses the retained actual-component Vite server in `docs/evidence/D2-WORKFLOW-NAVIGATION/2026-10-23/ui/browser-server.mjs` and the repository's `scripts/visual-qa/playwright.mjs` Chromium resolver. No backend, database, new production dependency or generated application bundle is introduced.

## Root-owned commands

From `/workspace/Concept2Cure`, with the repository-supported Node 22 on PATH:

```sh
node docs/evidence/D2-DEVICE-ATTACHMENT-FEEDBACK/2026-10-30/ui/browser-server.mjs
```

The server uses loopback port 5201 and strict-port admission. If that retained Vite server is already running, reuse it instead of starting a second one. In a second root-owned command:

```sh
node docs/evidence/D2-DEVICE-ATTACHMENT-FEEDBACK/2026-10-30/ui/browser-check.mjs
```

Optional command-scoped selectors: `DEVICE_ATTACHMENT_BROWSER_BASE` chooses another already running compatible Vite base; `DEVICE_ATTACHMENT_BROWSER_OUT` selects the result directory relative to `ui` (for example `browser-red` before the production correction, then `browser-result`). Existing `PLAYWRIGHT_CORE` and `PLAYWRIGHT_CHROMIUM` selectors retain the shared launcher's meaning. Do not install a repository dependency merely to run this harness. A missing browser/launcher is an environment blocker, not a semantic red result.

## Meaning and boundaries

The eight checks use actual Chromium file-chooser keyboard activation, browser `File`/`FormData`/XHR, the shipped drawer and shared hook/parser, actual local attachment metadata, and accessible rendered status/alert output. API interception admits only the exact synthetic section-version GET and explicit Vault-ingest POST. Every POST must carry the original project/file code, multipart boundary and synthetic bearer. Other requests fail closed and are reported. No hook or session guard is replaced. The null fixture account is allowed by the retained guard semantics; there is no hosted authenticated session or account-transition proof in this browser cohort.

Coverage: known refusal; malformed and explicit uncertain commits with check-before-retry guidance; valid HTTP201 and unchanged HTTP200 receipts; pending native chooser/input disablement; ignored overlapping programmatic input/drop; ordinary Document/Activity tab changes preserving pending/result state; mixed success/refusal; and a deliberate later selection clearing an earlier alert. The exact source/test manifest and unit ownership cohort remain root-owned and complementary.

Screenshots cover 1440px desktop and 390px mobile in light/dark themes. Layout checks include drawer/page horizontal fit and wrapping of a long outcome filename. These are actual component captures, not authored screenshots. `result.json` records selected before/after source hashes, every check/request, unexpected requests, browser errors and failure details. The planned extracted component is pinned as `exists:false` on an unchanged pre-correction baseline, so absence cannot masquerade as a missing-input harness failure. A semantic baseline red should reach the actual drawer and fail on the absent native Choose files button/feedback behavior.

This is synthetic browser engineering evidence only. It does not qualify hosted login, real bytes admitted/stored by the server, native storage/RLS, durable dossier linkage, client acceptance, signed OQ, deployed runtime, complete agency compliance or agency acceptance. This author did not start a server, launch Chromium, run checks, mutate Git, or claim a red/green result. The root owns execution and its final evidence attribution.
