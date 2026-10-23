# W2 / D1 — catalog and task-board runtime recovery

Status: engineering correction qualified on merged canonical source `66110e1a7`; source change `bf47a6964`. No deployed incident cause or deployment readiness claimed. Contract: `docs/design/CATALOG_TASK_BOARD_RUNTIME_2026-10-23.md`. Baseline `381a42fda`.

## What already exists

- `client/src/utils/authToken.ts` resolves the active tab/remembered bearer and already has a JWT organization reader. Its generic organization/header readers prefer shared browser storage, which can disagree with a tab's bearer. `client/src/lib/queryClient.ts` supplies these headers to catalog, board, query and upload requests. Extend these readers; do not introduce another session store.
- `client/src/services/portal/authService.tsx` and the existing login surfaces own login/logout/refresh. Session tokens can be per-tab while organization selection is global. Existing captured-actor headers protect governed ceremonies. Keep those protections and token storage semantics.
- `server/middleware/enterprise-security.ts` refuses an organization header that differs from the verified bearer. The global auth boundary establishes identity and tenant scope. These checks remain authoritative; client claims are only consistency hints.
- `client/src/concept2cure/v2/surfaces/AdminSurfaces.tsx` already reaches `/api/module-subscriptions/catalog`, license and navigation through the canonical Apps surface. `server/routes/module-subscriptions.ts`, `server/services/license-manager.ts`, `available_modules` and `module_subscriptions` own the catalog and grants. Routes are statically mounted before service startup. Their required incremental migrations are in the deploy set. No static catalog fallback or fabricated entitlement is permitted.
- `client/src/concept2cure/v2/surfaces/TaskBoard.tsx` reaches the existing authenticated board route. `server/routes/taskBoard.routes.ts` reads its own tasks/dependencies and composes `server/services/unified-work/unified-work-view.ts`. It already reports unread stores explicitly, but its missing-table check misses Drizzle's wrapped driver error. The client already has shared shape guards in `dataConnect.tsx`; an invalid successful response must not become an empty board.
- Existing token/transport, catalog, board, cross-store and native database suites cover the separate layers, but mock boundaries leave the shared header drift and real Drizzle wrapping unproven. Existing catalog/board UI failure states hide HTTP distinctions. No parallel board, catalog, task writer, auth boundary or AnA tool is needed.
- Searches covered apps/module catalog/license, task board/task management, tenant/auth headers, route registration, services, schema/migrations, canonical UI and AnA references. Deleted-history searches found retired AppsPage, ProjectTaskBoard, MissionControl board and service shells; none replaces the canonical implementations above.

## Verification

Red/green, runtime and publication results will be recorded here. All runtime data is synthetic and loopback-only.

## Initial reproductions and review

- Auth red: 9 failing checks before the resolver change. Auth/transport/session/switch/tenant-guard cohorts: 123 passed across 10 suites (`auth/`).
- Board red: wrapped driver missing-store error, omitted request database, malformed successful payload and hidden partial-empty metadata reproduced before each correction. Final board cohort: 95 passed across 7 suites; final parameterization 6/6 (`board/`). Lint has zero errors and the same ten existing warnings.
- Independent source review found the partial-empty problem; it is fixed and reviewed. No remaining blocking finding. The shared shape guard checks the container and first row's keys, not every record value; shared null/204 semantics remain unchanged.
- `http.json` exercises the actual application startup/router/auth/tenant/DB layers with a dev-issued synthetic session and non-superuser runtime role, `AUTH_BOUNDARY_MODE=enforce`, `RLS_ENFORCE=on`. Catalog (87 entries), license, navigation and board (14 cards) answer 200 for the matching header, 403 `TENANT_MISMATCH` for a stale header, 401 without a bearer. All four mismatch denials report persisted/chained audit rows. This establishes the failure mechanism locally, not the user's deployed incident cause.
- Runtime DB: a dedicated clone of the existing local synthetic `concept2cure-ri_dbtest` fixture, copied to `c2c_catalog_runtime_20261023`, then migrated using the canonical deploy applier and populated through the existing local-only demo seed. No live/customer database was accessed. The migration/readiness check passed, including 1314 runtime grants and zero audit privilege excesses. Runtime process uses an environment-clean working directory without repository env files or external provider credentials.

## Final integration results

Canonical catch-up `66110e1a7` retains `5ff6d2252` selected-source document starts and same-session eSTAR export recovery. Only the work-order claim row conflicted; both lanes' rows were preserved. `qualified-inputs.json` pins the exact source/tests and existing shared dependencies; source remained unchanged during qualification.

- `qualified-tests.log.gz`: **141 passed / 12 suites** on the merged tree, including canonical catalog/entitlement routes, Apps/rail, auth/transport, board recovery and incoming task-drawer creation. Worker and root counts overlap and must not be summed.
- `build.log.gz`: production client, server and audit-chain verifier build passed; existing chunk warnings remain.
- `typecheck.log`: normal complete-program incremental TypeScript gate, **0 errors**, unchanged zero baseline. No tests/build ran concurrently with the compiler.
- `browser.json`: both real canonical screens loaded in Chromium without intercepted responses or uncaught errors. The initial stale selection was restored during bootstrap, so that screen pass alone does not establish persistence of the drift.
- **`browser-cross-tab.json`** closes that gap: after bootstrap completed, a second tab wrote organization `100391` into shared storage while the original tab retained its real organization `391` session. Using the product's Tasking and account-menu Apps controls, both screens loaded saved data. Actual catalog/license/board reads returned 200 with header 391; shared storage remained 100391. No uncaught errors. No header/server access check was bypassed.
- `native-board.json`: the real app with native PostgreSQL and the non-superuser RLS runtime recovered from missing own-task and dependency relations with `partial: true` and an unread own store. A permission denial remained a 500 failure. Relations/grants were restored in `finally`; the restored board read all 14 cards. Twenty concurrent complete board reads returned 200 (561 ms for this local batch; not a production capacity qualification).
- `browser-recovery.json`: with the real task table temporarily unavailable, the existing screen said the board was incomplete, named its own tasks and offered retry; it never claimed no tasks existed. Restoring the table and pressing the existing retry button showed the saved task on the same screen. No intercepted API responses or uncaught errors.
- Independent read-only source review found no remaining blocking issue after the partial-empty correction. The existing response guard's first-row/key-presence limit is recorded in the design and board evidence.

## Harness findings and limits

The first development browser attempt failed because the custom test port 5198 was absent from the existing CORS allowlist, which defaults to ports 3000/5000. The test server was restarted with its explicit `ALLOWED_ORIGINS=http://127.0.0.1:5198`; no application CORS rule changed. An initial attempt to run the production bundle without production-only signing/encryption configuration correctly refused startup; the qualified runtime uses the actual source development server, real auth/tenant middleware and native database. Existing local-only dev authentication was explicitly enabled to issue synthetic sessions. This is not production authentication/MFA qualification.

The affected deployed URL/logs were not supplied. GitHub has no deployment record naming it. These results establish and fix reproducible failure mechanisms, not the live incident's cause or deployment status. D1 hosted apply/verification, human testing acceptance and regulated-use qualification remain open. No dependency, schema, migration, entitlement fallback, task write, approval or signoff behavior changed.

Normal canonical push gates enforce publication; no PR, force, bypass or baseline change is used. The final Git commit and remote verification are reported in the session handoff.

## Canonical publication catch-up

The normal push of `1d4c12d02` passed every gate, including a repeated full-program **0-error** compiler check, then was rejected because another session advanced the branch (`first-push.log.gz`). No force or bypass was used. Canonical `9f8cae7f0` was merged at `246fc58d3`, preserving company-settings session continuity and its source-host recovery tests. The catalog/board implementations and their shared transport/read dependencies remain byte-identical to the browser/native-qualified source.

On this final integration, `catchup-tests.log.gz` records **170 passed / 15 suites**, including the prior 141-check cohort plus real transport normalization and company session boundary/continuity checks. `catchup-build.log.gz` records successful client/server/audit-verifier builds. Independent review found no shared-boundary incompatibility: unguarded `apiCall` callers retain their normalized result, and company owner guards agree with active-bearer headers. `publication-catchup.json` records scope and results. The normal final push hook repeats compiler and publication gates on the resulting tree. The session handoff states the accepted remote commit; no affected hosted deployment or incident resolution is claimed.
