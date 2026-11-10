# The CSR narrative routes read on the request's own connection (F1, 2026-11-09)

**The finding.** CI's Lint step `audit-requestdb-coverage --strict-no-regression` has failed on trunk since the narrative
routes moved into `server/routes/csr-jobs-narratives.ts` (2026-10-29/30): "1 NEW route(s) on the shared pool above
baseline of 210". The step runs in CI, not pre-push, which is why it stayed red. It was found when CI's red guardrails
were re-run one by one on today's head (`docs/evidence/F1/2026-11-09-ci-copy-guards/`).

## What already exists (RULE 3)

- **`server/db/requestDb.ts`.** It provides `requestDb(req)`: Drizzle on the request's own tenant-scoped connection
  (`req.dbClient`, attached by `requireTenantContext`). With no connection, it throws `MissingRequestDbContextError`.
  It never falls back to the shared pool.
- **The precedent.** `9ef1514e86` moved four routes off the shared pool the same way.
- **The same router.** `server/routes/csr-jobs.ts` already reads on the request connection (`requestPgClient(req)` in
  `evidenceSourceRefusal`). So these routes run with request context, and the move needs no new mount or middleware.
- **The narrative services.** They take a `Queryable` and are unchanged. The background run
  (`startNarrativeRun`) keeps its own organisation-scoped connection (`withOrganizationTenantConnection`), as before.

## The change

In `csr-jobs-narratives.ts`:
- `q()` (`queryableFromDrizzle(db)` on the shared instance) becomes `q(req)`, which is
  `queryableFromDrizzle(requestDb(req))`.
- The read-access check (`requireCsrJobAccess`) gets `requestDb(req)`.
- The shared `db` import is gone.

The routes, their responses and the services are otherwise unchanged.

## Red, then green

`server/routes/__tests__/csr-jobs-narratives.pglite.test.ts`:
- The test app now attaches the request connection. It is the test's PGlite database, as `requireTenantContext` would
  attach it.
- `requestDb` is mocked to return that database only when `req.dbClient` is present. Otherwise it throws the real
  `MissingRequestDbContextError`.
- Every use of the shared `db` is counted.
- Two new cases:
  1. Status, QC and text reads touch the shared instance zero times.
  2. A read with no request connection is refused (500, "Could not read the narrative build.") and is not served from
     the pool.

| Run | Result | Detail |
|---|---|---|
| At HEAD (`red-at-head.txt`) | both new cases fail | 12 shared-pool uses; the context-less read answered 200 from the pool |
| At HEAD | the audit fails | 211 against a baseline of 210 |
| With the change (`green.txt`) | 18 of 18 pass | the audit reports "no new shared-pool routes (210 current, 210 baseline)" |

## Gates

- **CSR route and worker suites:** 15 files, 141 tests, all pass.
- **`ci:sql-interpolation` and `ci:tenant-resolvers`:** OK.
- **ESLint:** clean on both files.
