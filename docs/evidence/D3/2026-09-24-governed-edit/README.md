# D3: an edit writes content, never the row's tenant, parent or approval

**Row:** D3 (Tenant isolation proven), `docs/LAUNCH_DEFINITION_OF_DONE.md`.
**Date:** 2026-09-24.
**Database:** the from-blank PostgreSQL 16 install of
`../2026-09-24-update-boundary/`. The runtime connects as `app_service` with
`app.rls_enforce=on`. See `posture.txt`.

**What this is not:** the row's closing evidence. That is the contract against
staging, owed with D1.

## Where this came from

Ledger L192 audited every UPDATE site that spreads a request-derived object
into `.set()`: 16 in `server/storage.ts` and 72 in routes and services. Each
site got a verdict, and every non-SAFE verdict was re-read against the code
before being acted on. This change closes the two worst: three PATCH handlers
that let any org member write a row's organization, its parent, and its
approval.

| Endpoint | What the body could set |
|---|---|
| `PATCH /api/pccp/plans/:planId` | Organization. The program the plan belongs to. `status`, `locked`, `approvedBy`, `signatureId`, marking an AI/ML PCCP approved **without `approvePlan` and its `validatePccp` gate**. |
| `PATCH /api/pccp/modifications/:modificationId` | `planId`: the modification moves into any plan. `ai_ml_modifications` has no organization column and no RLS policy, so its plan *is* its tenancy. |
| `PATCH /api/post-market/documents/:documentId`, and the AnA tool `post_market.document.update`, which shares its service function and which a `member` can run | Organization, program, `status`, `locked`, `approvedBy`, `signatureId`. The tool's description invited the model to "patch … arbitrary fields". |

No role is required for any of the three. The only check was that the row
was the caller's.

## The fix

The service functions `updatePlan`, `updateModification` and `updateDocument`
now write only an **allow-list** of content columns. An allow-list and not a
deny-list: stripping named fields is how the CRO routes still let a foreign key
through (L192), and a column added later should not be writable until someone
decides it is. `updatedBy` is a server-supplied argument, not a body field. Each
UPDATE's WHERE now also carries the organization, as a second guard.

The allow-list helper is `pickWritable`, in `server/utils/authedOrgId.ts`, next
to `withoutTenantKey` and `withoutOrgId`. It is typed against the row type, so a
misspelt column fails to compile.

The AnA tool's description now says what it can edit, and that approval goes
through `post_market.document.approve`.

## What the database contained

`tests/db/governed-edit-boundary.dbtest.ts` is a new contract file on the
shared two-tenant fixture, with seven cases. Every case runs as tenant A against
A's own rows. **Each case has its own row.** A forged approval locks the row it
lands on, and a locked row answers 409 to every later edit. For the same reason
the org move and the parent re-point are separate requests: RLS refuses the
first, and a refused UPDATE writes nothing, which would hide the second. The
first draft of this file shared rows, and on the unfixed routers three of its
failures were those 409s rather than the defects.

**Red, unfixed routers, production posture: 7 of 7 fail.**

| Case | Result | Stopped by RLS? |
|---|---|---|
| plan edit approves the plan | `expected { status: 'approved', … }` | **no**: a same-org write |
| plan edit moves it to org B | 500; the content edit is lost with it | yes |
| plan edit hangs it from org B's program | program id changed | **no**: a foreign key |
| modification edit moves it into org B's plan | plan id changed | **no**: no policy on the table |
| document edit approves it | `expected { status: 'approved', … }` | **no** |
| document edit moves it to org B | 500 | yes |
| document edit hangs it from org B's program | program id changed | **no** |

**Mutation B** (unfixed, RLS off on the plan and document tables): 7 of 7
fail. Both org moves land: *"tenant A's plan must remain tenant A's: expected
90302 to be 90301"*, and the same for the document.

**Mutation A** (fixed, RLS off on those tables): 7 of 7 pass. The app layer
holds on its own.

**Green:** 46 of 46 across the four fixture suites (23 + 14 + 2 + 7), on the
tree committed.

## The evidence

| File | What it shows |
|---|---|
| `posture.txt` | RLS on the four tables, from the catalog. `ai_ml_modifications` has none. Also the foreign keys the re-parent cases write through. |
| `red/contract-before-fix-rls-on.txt` | The table above. |
| `red/mutation-B-before-fix-rls-off.txt` | The org moves themselves. |
| `green/mutation-A-fixed-rls-off.txt` | 7 of 7 without the database's help. |
| `green/contract-46-of-46.txt` | The four suites, fixed, RLS on. |

RLS was re-enabled, forced and re-read on both tables before the green run.
Teardown was verified to leave no fixture row. It deletes the fixture programs,
which cascade to plans, modifications and documents.

## Reproduce

```
TEST_DATABASE_URL=<owner url> APP_DATABASE_URL=<app_service url> \
  npx vitest run --config vitest.db.config.ts tests/db/two-tenant-application-rls.dbtest.ts \
    tests/db/report-os-tenant-from-session.dbtest.ts tests/db/traceability-update-boundary.dbtest.ts \
    tests/db/governed-edit-boundary.dbtest.ts
```
