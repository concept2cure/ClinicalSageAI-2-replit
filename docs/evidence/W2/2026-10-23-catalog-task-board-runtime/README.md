# W2 / D1 — catalog and task-board runtime recovery

Status: bounded source fixes implemented; integration/publication in progress. No deployed incident cause or deployment readiness claimed. Contract: `docs/design/CATALOG_TASK_BOARD_RUNTIME_2026-10-23.md`. Baseline `381a42fda`.

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

Browser, native missing-store recovery, final compiler/build and publication results follow after canonical catch-up. Local dev-auth qualification does not establish production authentication/MFA or regulated human-use acceptance.
