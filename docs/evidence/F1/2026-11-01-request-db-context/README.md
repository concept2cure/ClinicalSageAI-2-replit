# F1: "Quality's reads fail with REQUEST_DB_CONTEXT_REQUIRED" (2026-11-01)

**Package:** F1 (repairs). **Completes:** `server/routes/mdx-qms.ts` (the Quality reads the walk reported); the fix is in `server/db/requestDb.ts`. Nothing new: no route file, service, table, mount,
migration or AnA tool. One error subclass and one helper are added inside existing files.

## The report

The slice 0 launch walk (2026-10-26, `docs/evidence/D2-CLIENT-JOURNEY/2026-10-26/slice0/README.md`, item 5) ran on a dev
server with `RLS_ENFORCE=on` and `DATABASE_URL` as `app_service`. Its server log showed these lines for a signed-in
organisation administrator:

- `[mdx-qms] doc-list failed`, `change-list failed`, `doc-review-due failed` and `training-compliance failed`. Once it
  showed "Cannot query a released request DB client" instead.
- `[mdx-notifications] unread-count failed`.
- `[project-schedule-of-events] loading unified work failed`.

Each line carried `{"err":"Request-scoped database context is required","code":"REQUEST_DB_CONTEXT_REQUIRED"}`.

## What this found, at HEAD

1. **A read that the browser waits for does not fail.** The six reads were sent through the production middleware
   chain, in warn and enforce boundary modes, with `RLS_ENFORCE=on`. Each was served on its own request connection,
   opened with the caller's tenant session variables (`'2', 'admin', <org uuid>`) and then running the handler's SQL.
   That is 12 of 12, green before the change. The 10-26 continuation found the same on a live server at `6f7477656`
   (`docs/evidence/D2-CLIENT-JOURNEY/2026-10-26/continuation/`). **No commit fixed it, because completed reads never
   failed.** `git log -S` traces the mechanism to `aac517c5c` (2026-08-07, the installer's pass-through),
   `8fb897868` (2026-10-22, the lease) and `11feb8d93` and `b927133ac` (2026-10-31, release at bind when the socket is
   gone). The 10-31 commits widened the case below: before them, a read cancelled before the bind leaked a connection
   instead.
2. **The logged lines are reads the browser cancelled.** They were reproduced exactly at `bf798a237`, through the
   same chain, over a real socket. The client's connection was closed while authentication was running, which is what
   a page navigating away or an aborted fetch does (`net::ERR_ABORTED` in the walk's trace,
   `browser-context-summary.json`). Six of six cases came back red with the walk's own lines:
   `error [mdx-qms] doc-list failed {"err":"Request-scoped database context is required","code":"REQUEST_DB_CONTEXT_REQUIRED"}`
   (`red/route-chain-cancelled-read.txt`). That closes the 10-26 continuation's open point, that "the precise
   close/continuation ordering has not been instrumented". It is now instrumented and reproduced on demand.
3. **The defect.** For a request whose caller had left, the refusal used the code for a route mounted with no scope
   installer, and `serverError` logged it as a server failure. Two sessions investigated a mount defect that did not
   exist. Meanwhile, the code that should name a real missing mount was being spent on cancelled requests.

## What already exists (RULE 3)

| Path | What it does today | What it did not do |
| --- | --- | --- |
| `server/middleware/establishRequestTenantScope.ts` | The one scope installer. It opens the per-user scope and binds a lazy request client (`attachLazyClient`). It passes a request through when `req.dbClient` is set or a real scope is already active (`aac517c5c`). | It cannot bind a usable client to a request that has already ended. The lease releases one at once. |
| `server/db/requestDbLease.ts` | Binds the client and releases it when the response ends: on `finish`, on `close`, or at once if the socket is already gone (`11feb8d93`, `b927133ac`). It then sets `req.dbClient = null`. Retainers (a detached AnA turn) hold it longer. | It did not let anything ask whether a client had been bound and then released. |
| `server/db/requestDb.ts` | `requestPgClient` and `requestDb` refuse when `req.dbClient` is missing (`MissingRequestDbContextError`, `REQUEST_DB_CONTEXT_REQUIRED`). They never fall back to the shared pool. | It gave the same answer for "no installer ran" and for "the client was released because the request ended". |
| `server/middleware/lazyRequestDbClient.ts` | Takes a connection on first query. After release, it throws "Cannot query a released request DB client". | Unchanged (see "Not changed"). |
| `server/lib/api-response.ts` (`serverError`) | Used by about 272 route catch blocks. It logs `<where> failed` at error level with the code, and answers a contained 500. | It treated an ended request as a server failure, and wrote a 500 to a response that had already ended. |
| `server/middleware/authBoundary.ts`, `server/middleware/auth.ts`, `server/auth.ts`, `server/bootstrap/register-platform-routes.ts:245` | The `/api` boundary (`authenticateToken`), the global gate (`authMiddleware`) and, on `/api/concept2cure`, the mount's own `authenticateToken`. Each reads the account's standing, which is asynchronous. | |
| `server/routes/mdx-qms.ts`, `mdx-qms-training.ts`, `mdx-notifications.ts`, `project-schedule-of-events.ts` | The six reads. Each takes its client synchronously when the handler starts, and reports failures through `serverError`. | Unchanged. |
| `server/middleware/__tests__/auth-establishes-scope.integration.test.ts` | Composes the boundary and the authenticator with a downstream read (the 10-26 continuation). | It drives the middleware directly with a stand-in response. No route handler runs, and no socket closes. |
| `server/db/__tests__/requestDbLease.test.ts`, `server/middleware/__tests__/establishRequestTenantScope.test.ts` ("a request whose connection is gone") | Prove that no connection leaks when the client leaves before or after the bind. The latter asserts that the handler still runs (`next` once) and fails closed. | They do not cover what the handler's failure is called. |
| `tests/db/mdx-qms-request-rls.dbtest.ts` | Native PostgreSQL proof of QMS reads on `app_service`, using `authMiddleware`. | No cancellation. |

**Searches run:**

- Code: `requestPgClient`, `MissingRequestDbContextError`, `REQUEST_DB_CONTEXT_REQUIRED`, `bindRequestDbClient`,
  `retainRequestDbClient`, `LazyRequestDbClient`, `isRealTenantScope`, `runWithTenantScope(` around `next`,
  `serverError`, `REQUEST_ENDED`, `ERR_ABORTED`, `aborted`, and the routers' own `router.use`.
- Evidence: the 10-26 slice 0 and continuation evidence (`docs/evidence/D2-CLIENT-JOURNEY/2026-10-26/`), and
  `docs/evidence/D2-OWN-THE-PRODUCT/2026-10-31-db-pool-leak/`.
- History: `git log -S` on the installer's pass-through, `socket?.destroyed` and `bindRequestDbClient`.
- Deleted files: `git log --all --diff-filter=D --name-only` on `*requestDb*`, `*RequestDb*`, `*lazyRequest*` and
  `*RequestEnded*` returned nothing. A content search of all history (`git log --all -S REQUEST_ENDED -- server
  shared`) did not finish in 20 minutes on this shared machine and was stopped. The review ran it scoped to the
  branch and to the paths the fix touches (`git log -S REQUEST_ENDED -- server/db server/lib server/middleware
  server/routes/mdx-qms.ts`). It finished in about a second and found nothing. The all-branches search is still not
  complete.
- No earlier handling of a request that ended before its database work was found in the current code or among
  deleted files.

## The mechanism, in order

For `GET /api/mdx/qms/documents`, the request passes these steps in order:

1. The boundary's `authenticateToken`. Its standing read is asynchronous.
2. The installer opens the scope and binds the client.
3. The global gate's `authMiddleware`. Its standing and membership reads are asynchronous.
4. The installer again. This time it is a pass-through.
5. The handler.

On `/api/concept2cure`, the mount's own `authenticateToken` runs a third time before the handler.

If the caller closes its connection during step 1, the bind in step 2 sees the socket destroyed and releases the
client at once (`11feb8d93`). If the caller closes during step 3, the socket's `close` releases the client that was
bound in step 2. Either way `req.dbClient` is `null`, but the real tenant scope is still active. The next installer
call takes its pass-through (`req.dbClient || isRealTenantScope(active)`), and the handler runs on a request nobody
is waiting for. It asks for its client and is refused.

That is the state the brief pointed at: "a real tenant scope already active without a `req.dbClient`". The only way
these routes reach it is a request that has ended.

## Why not "attach a client when a real scope is active but none is bound"

The brief offered this as the likely fix. The state above arises only once the response has ended, so the fix would
not help:

- `bindRequestDbClient` releases a client bound to an ended response at once (`11feb8d93`). A newly attached client
  would be `null` again before the handler ran.
- Without that release, the client would pin a pooled connection that nothing returns. That is the pool exhaustion
  the 10-31 commits fixed (17 of 20 connections in that investigation).

On every completed read in this test, the client was bound before the handler ran. The handler's failure is therefore
correct, and it fails closed, as 10-31 decided ("nobody is waiting for that response"). What was wrong was its name
and how it was logged.

## The fix

- `server/db/requestDbLease.ts`: `requestDbClientReleased(req)` is true when a client was bound and the lease has
  released it, meaning the response ended and no retainer holds it.
- `server/db/requestDb.ts`: `requestPgClient`, `requestDb` and, through them, `requestConnectable` now throw
  `RequestEndedError` (code `REQUEST_ENDED`, "The request ended before its database work ran") for that state.
  - It is a subclass of `MissingRequestDbContextError`, so every caller that fails closed on a missing context still
    fails closed. Those callers are `insights-canvas-routes.ts`, `mdx-engineering.ts`, `mdx-analytics.ts` and
    `review-board-routes.ts`.
  - `REQUEST_DB_CONTEXT_REQUIRED` now means only a request that never had a client.
- `server/lib/api-response.ts` (`serverError`): an error coded `REQUEST_ENDED`, on a request that was never
  answered (`!res.headersSent`), is noted at info level (`<where> stopped: the request ended before its database work
  ran`) and nothing is written to the ended response.
  - The check is keyed on the code, so any other error on a cancelled request is still logged as a failure.
  - It is also limited to a request that was never answered. A handler that sent its own response and then asked for
    its client lost work after that response, such as an audit row. That is a defect in the handler, and it stays a
    logged failure, as it was before this change. The review added this condition (see "Review").

**Unchanged:**

- No fallback to the shared pool.
- RLS and tenant scope.
- The lease.
- The installer.
- The handlers.
- The fail-closed refusal, and the rule that it takes no connection (each cancelled case asserts `connections === 0`).

## Tests: red first, then green

| Test | Red (before the change) | Green |
| --- | --- | --- |
| `server/routes/__tests__/request-db-context-ended-request.test.ts` (new). The production chain in production order: `applyAuthBoundary`, the global gate's `authMiddleware`, `/api/mdx` notifications and QMS, and `/api/concept2cure` with `authenticateToken` and the schedule router. It uses a real signed JWT and a real HTTP socket. | Builder, at `bf798a237`: 6 of 19 red. Every cancelled read logged the walk's line with `REQUEST_DB_CONTEXT_REQUIRED` at error level. 13 of 19 green: the 12 completed reads, and a route with no installer still `REQUEST_DB_CONTEXT_REQUIRED` (`red/route-chain-cancelled-read.txt`). The review added the sixth route's cancelled case (`doc-review-due`), so every route the walk named is cancelled once: 7 of 20 red at `9bf83a8f0` (`red/review-head-rerun.txt`). | 20 of 20 |
| `server/db/__tests__/requestDb.test.ts` (3 cases added): ended gives `REQUEST_ENDED` and is still instanceof the missing-context error; never bound gives `REQUEST_DB_CONTEXT_REQUIRED`; a retained client is served until its holder lets go. | 2 of 3 red (`red/unit-ended-request.txt`) | green |
| `server/lib/__tests__/api-response-500-containment.test.ts` (3 cases added): `REQUEST_ENDED` is noted, with no error log and no 500; after the handler's own response, `REQUEST_ENDED` is still a logged failure (added by the review); `REQUEST_DB_CONTEXT_REQUIRED` is still a logged 500. | 1 of 3 red at HEAD: the review's case passes at HEAD, where every such error is logged as a failure. Against the builder's change it was the one red case, 1 of 39 (`red/review-headers-sent.txt`). | green |

At HEAD, the three files are 10 of 39 red (`red/review-head-rerun.txt`). `green/f1-tests.txt` has all three files at 39 of
39, after the review's change.

**Mutations** (`red/mutations.txt`), each restored after its run:

- Removing the released-lease check from `requestDb.ts` fails 8 tests.
- Disabling the `serverError` branch fails 7 tests.

**Regression** (`green/regression.txt`):

- `server/db`, `server/middleware`, `server/lib`, every QMS, notification, schedule, insights-canvas, mdx-engineering,
  analytics and review-board route test, and every other unit test naming the changed contracts.
- 2,785 tests passed and 10 failed.
- The 10 failures are the same 10 with the three source files set back to their HEAD text, so they are not this
  change's.

**Typecheck and lint:**

- `tsc` over the changed files and everything they import shows no error in a changed file
  (`green/typecheck-scoped.txt`).
- ESLint is clean on all six files.

## Not changed, recorded

- **A cancellation while a handler is between queries.** The handler already holds the lazy client, so a later query
  throws "Cannot query a released request DB client". The walk saw this once. It is still logged as a failure, with
  no code.
  - The message is accurate.
  - Typing it would mean changing `lazyRequestDbClient.ts`, which the MCP tool runtime shares. There, `discard()` (an
    uncertain COMMIT) sets the same released flag, and that must stay a failure.
- **A handler still runs after its caller left during authentication.** `11feb8d93` and its installer test decided
  this (`next` once, fail closed, no connection). Stopping such requests at the installer would not cover the windows
  after it, such as the entitlement gate. It would also change, for every route, what a write sent by a departed
  client does. That is out of scope for a repair.
- **A stream whose client leaves after its headers were sent.** If such a handler then asks for a released client, it
  is still logged as a failure with `REQUEST_ENDED`, as it was before with `REQUEST_DB_CONTEXT_REQUIRED`. AnA's stream
  retains its client (`retainRequestDbClient`), so it does not reach this.
- **Not re-walked in a browser.** This run's constraints allow no server or browser. The route test drives the
  production chain over a real socket. The next launch walk should show `stopped: the request ended` at info for its
  cancelled reads, and no `REQUEST_DB_CONTEXT_REQUIRED`.

## Review (2026-11-01)

A second session checked the change against the plan and the hard constraints, and reran every result.

- **Scope.** All changed files are inside F1's ledger paths (`**`), and none is held by another session. Nothing on
  the hard-constraint list was touched. Nothing new was added: no route file, service, table, mount, migration or AnA
  tool.
- **What already exists.** The section's commits, files and evidence were opened and checked. They are real.
  `isRealTenantScope` and `attachLazyClient` are at `establishRequestTenantScope.ts:129` and `:164`.
- **Red and green, rerun.**
  - With the three source files at their HEAD text, then restored byte for byte (`sha256sum -c`), the run gave 10 of
    39 red. That run reproduced the walk's line for all six routes (`red/review-head-rerun.txt`).
  - With the change, the run gave 39 of 39 (`green/f1-tests.txt`).
- **Changed.** The builder recorded a trade-off: a handler that asked for its client after its own response had
  ended was noted at info, and no longer logged as an error. That case is lost work after the response, not a caller
  who left, so the review limited the info note to a response never answered (`!res.headersSent`). The test for it
  was red against the builder's change (`red/review-headers-sent.txt`) and is green now.
- **Lint and types.** ESLint is clean on the six files. The scoped `tsc` was rerun and shows the same six ambient
  errors, none in a changed file (`green/typecheck-scoped.txt`).
- **Affected tests.** Twenty files that import the changed modules or serve these routes gave 366 passed and 1
  failed. The failure is `qms-document-content-access`, which fails identically with the HEAD source
  (`green/review-affected.txt`), so it is not this change's.

## Files

- Source: `server/db/requestDb.ts`, `server/db/requestDbLease.ts`, `server/lib/api-response.ts`.
- Tests: `server/routes/__tests__/request-db-context-ended-request.test.ts` (new),
  `server/db/__tests__/requestDb.test.ts`, `server/lib/__tests__/api-response-500-containment.test.ts`.
- Evidence: this folder.
- Trailers: `Plan: F1`, `Completes: server/routes/mdx-qms.ts`.
