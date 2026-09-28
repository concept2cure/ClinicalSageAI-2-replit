# D3: the other ways a request could name an organization

**Row:** D3 (Tenant isolation proven), `docs/LAUNCH_DEFINITION_OF_DONE.md`.

**Date:** 2026-09-24.

**Database:** the from-blank PostgreSQL 16 install used by
`../2026-09-24-report-os-tenant/`. The runtime connects as `app_service` with
`app.rls_enforce=on`. See `posture.txt`.

**What this is not:** the row's closing evidence. That is the contract against
staging, owed with D1.

## Why there was more to find

Ledger L184 counted request schemas that declare `organizationId` by hand.
There are three other ways a request can put an organization into a write:

1. **A drizzle-zod insert schema parsed from the request.** `createInsertSchema(table)` accepts every column, and that includes the tenant key. `.partial()` keeps it.
2. **A direct read.** For example `req.body.organizationId`, or `req.query.org_id`, or the same through `req.params`.
3. **An UPDATE that spreads a parsed body into `.set()`.** The WHERE finds the caller's own row. The SET then decides which organization that row belongs to afterwards.

A fourth variant came out of the red run: a foreign key. RLS checks the new
row's organization on UPDATE, but a foreign-key check does not go through RLS.
So a reference to another tenant's parent row is accepted even with RLS enforcing.

## The sweep, and its verdicts

**Direct reads: 59 matches in 15 files.**

- 4 of the matches are comments and 8 are log lines.
- 2 are server-side checks, not places the request picks the org:
  - `requireOrgAccess` (`server/middleware/auth.ts`) returns 403 on any mismatch.
  - `getTenantContext` (`server/utils/tenantContext.ts`) reads the header and query org only to raise a mismatch alert. The org it returns always comes from the JWT.
- Every route that takes the org from its path checks it against the caller:
  - `global-compliance` (18): `enforceOrgScope` on every handler.
  - `pm-settings` (4): compares the path org with `authedOrgId`.
  - `tenant-config` (4) and `tenant-ctq-factors` (3): an org admin must match the tenant.
  - `tenant-users` (3): `authorizeOrgAccess` checks membership.
  - `grdhe` (5): the tenant UUID must equal the authed org's UUID.
  - `client-branding` (1): the path org must equal the JWT org.
  - `tenants-simple` (1): the caller must be a platform admin or own the org.
  - `admin/licensing-history` (1): a platform-admin router.
- **One defect:** `server/api/cmc/projectRoutes.ts`. `POST /api/cmc/projects/:projectId/documents` built the org as `Number(req.body.organizationId) || orgFromSession`, so the body won. `router.param` proved the project was the caller's. The document was filed under whatever org the body named.

**Insert schemas: 6 non-test files.**

- CMC (`register-writes.ts`, `api/cmc/routes.ts`) strips the tenant key already.
- `charters.ts` mentions one in a comment only.
- `tenant-traceability` create overrides the tenant key after the spread.
- **Defects:**
  - **`tenant-traceability` update:** `PUT /:id` spread `insertQmpTraceabilityMatrixSchema.partial()` into `.set()`. That let a request set both `organizationId` and `qmpId`.
  - **QC creates:** all five create handlers in `qc.routes.ts` parsed the body with a `createInsertSchema` and inserted it as is. The org was whatever the body sent.

**UPDATE sites in `server/storage.ts`: 16.** Audited here and verified by call-site search.

- **5 QC updates, fixed.** They took raw `req.body` into `.set()`. Their WHERE was org-scoped, so they were not IDORs, but the body could move the caller's own row out of its org.
- **2 QC reference-standard actions, fixed.** `qualify` and `dispose` updated by id alone.
- **9 methods have no caller.** `export-service.ts` imports the storage singleton and never uses it. Of these, 8 have an id-only WHERE, which is an IDOR the day something calls them.
- **2 are safe:** one is a global catalog table, the other is written from server-built data.

**UPDATE sites in routes and services: 72.** These are still being audited, as ledger L192.

## Reachability

- **QC:** every `qc_*` table is **absent**. No file in the migration set creates it, so no deployed database could be reached through these paths. The first deploy with those tables would have been.
- **CMC documents:** the route cannot write anything on a deployed database. Its model declares a `project_id` column that `regulatory_documents` does not have (`posture.txt`).
- **Traceability:** live. Its tables exist with RLS enforced.

## The fixes

| Where | Change |
|---|---|
| `server/api/cmc/projectRoutes.ts` | The org comes from the session only. |
| `server/routes/tenant-traceability.ts` | The update drops the tenant key (`withoutOrgId`). A changed `qmpId` must name one of the tenant's QMPs, as create already required. The CTQ check validates against the QMP the item will belong to. |
| `server/routes/qc.routes.ts` | Creates take the org from the session (`withoutTenantKey` on the schema). Updates drop the tenant key. `qualify` and `dispose` are org-scoped at the route. |
| `server/storage.ts` | `qualifyReferenceStandard` and `disposeReferenceStandard` require the org, and their UPDATEs are scoped by it. |
| `server/utils/authedOrgId.ts` | `withoutTenantKey` and `withoutOrgId` moved here from `server/services/cmc/register-writes.ts`, which re-exports them, so every router uses the same pair. |

## What the database contained

`tests/db/traceability-update-boundary.dbtest.ts` is a new contract file on the shared fixture (`tests/db/two-tenant-fixture.ts`), with one file per tenant contract, as that fixture's author set up. It has two cases, each run from tenant A against A's own item.

**Red, before the fix, production posture:**

- The org move was refused. RLS `WITH CHECK` rejected the new row, so the item stayed A's. It also refused the whole update: *"the rest of the update must go through, not be refused as a whole: expected 500 to be 200"*. The legitimate part of the edit was lost with the illegitimate one.
- **The QMP re-point was not refused:** *"tenant A's item must not reference tenant B's QMP: expected 12 to be 11"*. It went through with RLS enforcing.

**Mutation B**, before the fix, with RLS off on `qmp_traceability_matrix`: *"tenant A's item must remain tenant A's: expected 90302 to be 90301"*. The item moved to tenant B. The re-point case then passed, but only because the item had already left A's reach, so its evidence is the red run above.

**Mutation A**, the fix with RLS off on that table: both pass. The app layer holds on its own.

## The evidence

| File | Router | RLS on `qmp_traceability_matrix` | Result |
|---|---|---|---|
| `red/traceability-before-fix-rls-on.txt` | before the fix | on | 0 of 2 pass: a 500 on the org move, and a completed QMP re-point |
| `red/mutation-B-traceability-before-fix-rls-off.txt` | before the fix | **off** | 1 of 2 pass: the item moved to tenant B |
| `green/mutation-A-traceability-fixed-rls-off.txt` | fixed | **off** | 2 of 2 pass |
| `green/contract-39-of-39.txt` | fixed | on | **39 of 39** pass across the three fixture suites (23 + 14 + these 2), on the tree committed |

RLS was re-enabled and forced on the table, then re-read, before the green run.
Teardown was verified to leave no fixture row.

## Recorded, not fixed here

- **L192:** the remaining UPDATE-site audit (72 sites). It also records the 9 uncalled storage methods, 8 of them with an id-only WHERE.
- **L193:** the CMC documents route cannot insert on a deployed database. Separately, every QC handler takes its actor (`performedBy`, `qualifiedBy`, `disposedBy` and similar) from the body. That is a Part 11 attribution defect for whenever those tables ship.

## Reproduce

```
# a disposable database provisioned by install-fresh + deploy-migrate with
# APP_SERVICE_DB_PASSWORD set, then:
TEST_DATABASE_URL=<owner url> APP_DATABASE_URL=<app_service url> \
  npx vitest run --config vitest.db.config.ts tests/db/two-tenant-application-rls.dbtest.ts \
    tests/db/report-os-tenant-from-session.dbtest.ts tests/db/traceability-update-boundary.dbtest.ts
```
