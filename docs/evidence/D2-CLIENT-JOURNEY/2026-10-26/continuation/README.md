# D2 client journey: continuation of the 2026-10-26 handoff

Base: `6f7477656801aa84bf774e6926287457574de745`, branch `concept2cure-v2`.
Scope: handoff items 3–4 and the outstanding source review of A.1. No product capability, entitlement or database fallback changes.

## What already exists

| Path | Existing behavior | Limit |
| --- | --- | --- |
| `server/index.ts`, `server/middleware/authBoundary.ts`, `server/middleware/auth.ts` | The global API boundary authenticates before route registration; successful authentication installs the tenant context in warn and enforce modes. | A failed authentication in development warn mode deliberately continues to per-route guards. |
| `server/middleware/establishRequestTenantScope.ts`, `server/db/requestDbLease.ts` | Bind a lazy request client and release it once its response/retainers finish. | An ambient tenant scope alone does not guarantee a request client. No uninterrupted client JWT path producing that condition was established. |
| `server/db/requestDb.ts` | Refuses a missing request client with `REQUEST_DB_CONTEXT_REQUIRED`. | Intentionally has no shared-pool fallback. |
| `tests/db/mdx-qms-request-rls.dbtest.ts` | Exercises real authentication, request-bound QMS operations, current access, foreign records and recovery as `app_service`. | Its explicit synthetic missing-client case is not evidence of an authenticated production defect. |
| `server/middleware/__tests__/auth-establishes-scope.integration.test.ts` | Exercises the real authenticators and tenant scope with a stub SQL transport. | Previously did not compose the global boundary with an actual downstream request-client query. |
| `tests/e2e/launch-walk-no-lock.e2e.ts`, `client/src/concept2cure/v2/projectDoors.ts` | Walk fresh biotech/medtech organizations; canonical shared names for navigation buttons. | The old walk matcher missed lower-case editor/review destinations and device job names, including navigation beginning with Run/Export. |

Searched request-context installers, route mounts, client assignments and related deleted implementations (`git log --all --diff-filter=D`). The handoff's QMS commits change periodic-review internals, not these mounts; no active ownership claim was found.

## Item 3: current-head reproduction

Provisioned a fresh isolated PostgreSQL 16/pgvector database with `scripts/db/provision.mjs` (fresh install followed by deploy migrations). The readiness schema contract passed; 1,314 application relations met runtime privilege checks. The full development server used the non-superuser, non-bypass `app_service` role, `RLS_ENFORCE=on`, `LAUNCH_SCOPE_ENFORCE=on`, and development's default warn auth boundary.

With `ALLOW_DEV_AUTH=1` on this local development server only, created a fresh medtech organization through real signup and login. Created an IND project through the canonical `/api/c2c/projects` route. Every reported read returned HTTP 200:

- `/api/mdx/qms/documents`
- `/api/mdx/qms/changes`
- `/api/mdx/qms/documents/review-due`
- `/api/mdx/qms/training/compliance`
- `/api/mdx/notifications/unread-count`
- `/api/concept2cure/projects/:programId/unified-work`
- `/api/concept2cure/projects/:programId/schedule-of-events`

Responses: `native-http-results.json`. These uninterrupted HTTP reads did not reproduce `REQUEST_DB_CONTEXT_REQUIRED`. These fresh empty-state reads prove request composition, not populated-domain completeness. Native QMS tests separately passed 11/11, including foreign/private-record refusals, training and signature recovery. Middleware baseline passed 44/44; QMS/notifications/schedule route suites passed 78/78. The final pinned-dependency run, including the added coverage, passed 181/181 across nine files (`unit-final.txt`).

**The browser walk reproduced the log message during cancelled requests.** Its trace records `net::ERR_ABORTED` for requests at the corresponding QMS and unified-work error times; completed duplicate reads return 200. `browser-context-summary.json` contains only sanitized paths, times and statuses, with no bearer tokens or cookies. Response `close` releases and clears the request client; a pending auth/route continuation can subsequently request it. This explains the observations with high confidence, but the precise close/continuation ordering has not been instrumented. No completed target HTTP 500 was observed. The walk also encountered rate-limit responses, so a green launch-lock walk is not a claim that every domain read succeeded.

**Result: a missing-mount defect affecting completed authenticated reads is not established.** The observed failures are associated with browser cancellation. No auth gates were widened, client lifetime weakened, or shared-pool fallback introduced. An error on an active page still needs its revision, request trace and response status.

Extended the existing auth composition suite with six cases (warn/enforce × the three URL families): downstream request-client SQL works, a second mount authenticator preserves the same client, tenant/UUID/isolation settings are applied, and finish+close release once. Its SQL backend is mocked. Clearing the bound client before the read made all six fail with the reported error; the fixture mutation was restored. Final suite: 29/29.

## Item 4: repair the walk's door coverage

The walk now recognizes exact navigation names from the existing shared `STEP_DOORS` and `DEVICE_DOORS`, then applies its previous generic matcher to other names. It excludes the Tasks heading and still refuses similarly prefixed mutation/download actions. No production button behavior changed.

The old matcher failed 15 focused assertions. The repaired matcher passes all 30, including editor, review, device evidence/pathways, and negative mutation cases. Red/green logs are filed here.

Both live browser walks passed (`walk-run.txt`): biotech 140 visits, medtech 138, zero launch locks in either. Each recorded 50 subscription locks, retained as the founder's entitlement decision rather than bypassed. The biotech walk now records the renamed editor door. Fresh empty projects and unavailable subscription features do not render every possible door; the focused tests cover those names without claiming a live visit. Visit lists: `walk-biotech.json`, `walk-medtech.json`.

Harness: Node 22, Chromium `/usr/bin/chromium`, `BASE_URL=http://localhost:5000`, `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`, `WALK_EVIDENCE_DIR` set to a temporary output directory. Playwright 1.58.2 was installed outside the repository and linked only into ignored `node_modules`; `npm ci` restored the repository's pinned dependencies before the final tests/walk. Signup used development-only `ALLOW_DEV_AUTH=1`; no mail or AI-provider configuration was required. `/readyz` reported database/schema/storage ready and AnA unavailable because no provider was configured.

## Outstanding source reviews

Read-only review of `4626be1f9` and `03a263d6c` against information-architecture sections 9/12 found no additional concrete regression in labels, navigation destinations or `/features` aliasing. The server sweep's 128 changed non-test TypeScript files retained syntax, identifiers and numeric values when literal text was ignored; sampled refusal strings showed no changed identifier/domain term. This was a source review, not a substitute for the already recorded affected-set runs or a broad visual review.

## Remaining work

Repository pre-commit and all pre-push gates passed, including scoped lint, warning ratchet and the full typecheck (zero errors). See `pre-push.txt`. Production implementation files and dependency manifests are unchanged.

Slice A.2 remains unstarted; use `.design/client-journey/SLICE_A2_PLAN.md` and re-check its cited paths before implementation. Founder decisions about self-serve feature grants, sponsor landing and section 5.9 remain pending.
