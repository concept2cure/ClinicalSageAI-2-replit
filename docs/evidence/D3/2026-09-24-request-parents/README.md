# D3: a request cannot name another tenant's parent, or write another user's row

**Row:** D3 (Tenant isolation proven), `docs/LAUNCH_DEFINITION_OF_DONE.md`.

**Date:** 2026-09-24.

**Database:** the from-blank PostgreSQL 16 install of
`../2026-09-24-update-boundary/`. The runtime connects as `app_service` with
`app.rls_enforce=on`. See `posture.txt`.

**What this is not:** the row's closing evidence. That is the contract against
staging, owed with D1.

## What these six have in common

RLS refuses none of these writes. The audit (ledger L192) found each one, and
each was re-read against the code before being fixed.

| Endpoint | The defect | Why RLS does not stop it |
|---|---|---|
| `POST /api/capa-mdr/mdr-events` | `sourceComplaintId` is taken as given, and the event then writes `complaints.linked_mdr_event_id` on that id. | `complaints` has no organization column and no policy. |
| `PATCH /api/users/me/notifications` | The raw body goes into `.set()` / `.values()`, so `userId` moves the row onto another user, or creates one for them. | `notification_preferences` is keyed on `user_id` alone and has no policy. |
| `POST /api/client-intelligence/ana/user-profile` | The raw body goes to `upsertUserProfile`. `userId` plants a profile, whose `personalInstructions` the context builder presents as overriding company defaults, into a colleague's AnA. | A same-org write. |
| `POST` / `PUT /api/concept2cure/projects/:id/tasks` | `parentTaskId` is taken as given. | A foreign key, which Postgres checks without RLS. |
| `POST` / `PUT /api/cro/studies`, `/submissions`, `/milestones` | `clientId` / `studyId` / `submissionId` pass through `normalizeBody`, a deny-list. | Foreign keys. The other tenant's row can then not be deleted, and the 200 against 500 tells the caller which ids exist. |
| AnA tool `gspr.mapping.upsert` | `programId` is checked only for being a UUID. The HTTP route proves ownership; the tool did not. | A foreign key. |

## The fix

| Where | Change |
|---|---|
| `createMdrEvent` | The source complaint must be one `getComplaint` can see for this org (a program join). Otherwise 404, before anything is inserted. |
| notification preferences | An allow-list of the 21 preference columns (`pickWritable`). The session user is written last. |
| `upsertUserProfile` | An allow-list of the eight profile fields. The caller's `userId` and `organizationId` are written last. |
| c2c tasks | A parent task must be a task of this project in this org (`isOwnProjectTask`), on create and on update. |
| CRO | `foreignParent` checks each named client, study and submission against the org, on the three creates and the three updates. |
| GSPR tool | Proves ownership through the canonical `programBelongsToOrg` before writing: NOT_FOUND if the program is not the caller's, OWNERSHIP_UNVERIFIABLE if the check could not run. That mirrors how `AnaToolExecutor` reports the same guard. `upsertMapping`'s lookup now also carries the org. |

## What the database contained

`tests/db/request-parent-boundary.dbtest.ts` is a new contract file on the
shared two-tenant fixture. It has six cases, each from tenant A, naming tenant
B's row, or for the profile a colleague in A. In every case the leak assertion
comes before the status assertion.

**Red, unfixed code, production posture: 6 of 6 fail, each on the leak itself.**

- *"tenant B's complaint must not be linked to tenant A's MDR event: expected '1e10c040-…' to be null"*
- *"no preference row may be written for tenant B's user: expected 1 to be +0"*
- *"no profile may be planted onto a colleague's AnA: expected 1 to be +0"*
- *"no task may hang from tenant B's task: expected 1 to be +0"*
- *"no study of tenant A may name tenant B's client: expected 1 to be +0"*
- *"no mapping may be written against tenant B's program: expected 1 to be +0"*

The red run already shows each leak with RLS on, so no RLS-off mutation was
needed. None of these defects depends on RLS being off.

**Green:** 58 of 58 across the five fixture suites (29 + 14 + 2 + 7 + 6), on the
tree committed.

The tool's unit tests gain the two refusal paths, NOT_FOUND and
OWNERSHIP_UNVERIFIABLE. Both fail against the unfixed handler
(`red/unit-gspr-tool-without-ownership-check.txt`), because it writes anyway.

## The evidence

| File | What it shows |
|---|---|
| `posture.txt` | From the catalog: which of these tables have RLS (`complaints`, `mdr_events` and `notification_preferences` have none), and the foreign keys the pin cases write through. |
| `red/contract-before-fix-rls-on.txt` | The six leaks above. |
| `red/unit-gspr-tool-without-ownership-check.txt` | The two new unit cases failing against the unfixed tool. |
| `green/contract-58-of-58.txt` | The five suites, fixed. |

The fixture teardown now clears these tables by org, or through the fixture
programs for `complaints`, `mdr_events` and `vigilance_events`, which have no org
column. It also removes the fixture GSPR requirement. It was verified, after the
red run's cross-tenant rows, to leave none of them.

## Recorded, not fixed here

- **L195** (open): actor forgery. CMC `validatedBy` / `approvedBy` / `initiator`, `submission-ops` `resolvedById`, and the GSPR HTTP route's `decidedBy` / `reviewedBy` are all taken from the body. Also the RLS-contained findings, and `/api/users/me*` not checking the token type.
- **L197:** `gspr_requirements` has 0 rows on a deployed database. Only `scripts/seed-gspr.ts` fills it, and CLAUDE.md RULE 1 says a `scripts/seed-*` runs on laptops only. The GSPR mapping surface has no catalog in production.

## Reproduce

```
TEST_DATABASE_URL=<owner url> APP_DATABASE_URL=<app_service url> \
  npx vitest run --config vitest.db.config.ts tests/db/two-tenant-application-rls.dbtest.ts \
    tests/db/report-os-tenant-from-session.dbtest.ts tests/db/traceability-update-boundary.dbtest.ts \
    tests/db/governed-edit-boundary.dbtest.ts tests/db/request-parent-boundary.dbtest.ts
```
