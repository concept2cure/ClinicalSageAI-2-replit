# D3 — Report OS took the tenant from the request (ledger L184)

**Row:** D3 (Tenant isolation proven), `docs/LAUNCH_DEFINITION_OF_DONE.md`.
**Date:** 2026-09-24. **Database:** the PostgreSQL 16 install used by
`../2026-09-24-governed-decisions/`, provisioned from empty by `install-fresh` +
`deploy-migrate` at `e0e42ec4`. The runtime connects as `app_service` (not
superuser, no BYPASSRLS) with `app.rls_enforce=on`. See `posture.txt`, read
from the catalog.

**What this is not:** the row's closing evidence. D3 closes on the contract
passing against staging with the production image, which is owed with D1.

## The audit L184 asked for: a verdict on each of the 19 schemas

| File | Schemas | Verdict |
|---|---|---|
| `server/routes/authEnterprise.ts` | 1 | **Safe by design.** `/select-organization` exists to let a user choose an org. The choice is checked against `organization_users` for the verified token's user; a non-member gets 403. |
| `server/routes/regulatory-correspondence.validation.ts` | 4 | **Safe.** The field is accepted and never read. Every handler takes the org from `requireActorContext` → `getSecureOrgId`, and every anchor lookup is scoped `organization_id = $org`. |
| `server/routes/unifiedTasks.routes.ts` | 1 | **Safe.** The body is spread and then overridden with `organizationId: org`, from `requireEditorAccess`'s resolved org. Every service read filters on that org. |
| `server/routes/pharmacovigilance-routes.ts` | 4 | **Safe.** Every handler calls `getOrgId(req)`, which reads `req.tenantId`, `req.tenantContext` or `req.user`. All three are set only from a verified JWT or API key (`server/auth.ts`, `establishRequestTenantScope`, `enterprise-security`). |
| `server/routes/report-os.ts` | 9 | **Seven were used.** They are fixed here; see below. The other two (`reportBundleRecordSchema`, `reportDeliveryRecordSchema`) parse stored JSON, not requests, and that JSON is loaded by an org-filtered query. |

## What Report OS did

The seven request schemas carried an `organizationId`, and every handler
behind them used it:

- `GET /runs` listed the runs of the org the query named, including each run's computed summary.
- `POST /runs` computed a report over the named org's data and returned it. It calls `computeInitialRun`, `computeDomainReport`, and for document scope `buildDocumentLineageDossier`. It then inserted the run under that org.
- Program groups were created under the named org, with any project ids as members.
- Snapshots of a group were read and written under the named org, and returned the group's project ids.
- Bundles, deliveries and correspondence capture read runs and wrote bundles, correspondence and project memory under the named org.

Two more defects came with them:
- **PATCH with no org check.** `PATCH /program-groups/:id` had no schema and no org scope. It renamed, archived and re-membered any group by id.
- **Actor from the body.** `createdBy` and `requestedBy` came from the body, so a caller could sign as anyone.

## The fix

| Change | Detail |
|---|---|
| Org and actor come from the session | The org comes from `requireSessionOrg` (`authedOrgId` → `usableOrgId`, 403 when absent); the actor comes from `getUserId`. Neither field is in any request schema now. Zod strips unknown keys, so a client that still sends them is ignored, not refused. The live one does: `Insights.tsx` sends `organizationId`. |
| Referenced ids must belong to the caller's org | Group members, a delivery's project, and a captured letter's project and submission are checked; an id from another org reads as not found. `POST /runs` over another tenant's project is 404, not an empty report about it. |
| PATCH and snapshot are scoped | `PATCH /program-groups/:id` and `POST /program-groups/:id/snapshots` are scoped to the org; another tenant's group is 404. |
| Project joins carry the org | The member joins in `GET /program-groups` and in the portfolio rollup (`portfolio/fetch.ts`) now filter `projects` by org. Without that, a membership naming another tenant's project brings back that project's name. Memberships are not RLS-protected; see below. |
| Bundles really persist | `POST /bundles` never set `projectIds`, so `persistBundleRecord` wrote nothing and every bundle answered 201 and was never seen again. The new positive control is what showed this. It is fixed; a bundle with no project to be stored under is now 422. |

## What the database contained, and what it did not

Of the 14 new cases, **4 pass against the unfixed router in production
posture**: RLS contained them (the runs list, the PATCH, and the foreign bundle
and delivery). **9 fail without a leak:**
- six are positive controls, where tenant B was refused (500 from `WITH CHECK`) or served nothing for its own data;
- three name A's objects and got a 500 from the database where the answer is 404.

**The tenth is a real leak with RLS on.** B created a group, in B's own
org, holding A's project: *"no group of tenant B may hold tenant A's project:
expected 1 to be +0"*. The reason is that `report_program_group_projects`:
- has no organization column and no RLS policy;
- has a foreign key to `projects` that is checked without RLS.

Mutation E removes only the member check from the fixed router and shows this
check is the only control in production posture.

Its consequence under RLS is a dangling cross-tenant reference, not a read. The
`projects` join is RLS-filtered, and every orchestrator query is scoped by org.
**Without RLS, the same row leaked the project's name** through
`GET /program-groups` and the portfolio rollup. Both joins now carry the org, so
rows written before this fix are covered too.

The rest of the exposure needed RLS to be off. That is a real state, as
`../2026-09-24-governed-decisions/README.md` sets out: `app.rls_enforce` is set
only when `RLS_ENFORCE=on`, and D3 is the row saying production has not been
shown running that way. Mutation B is that state. All 14 new cases fail in it,
and each message names the leak:

- `tenant A's run must never be listed to tenant B: expected [ 32 ] to not include 32`
- `nothing may land in tenant A: expected 3 to be 2`: `POST /runs` computed over A's project and wrote into A
- `tenant A's group must be exactly as tenant A left it`: the PATCH changed it
- `tenant A's run must not be bundled for tenant B: expected [ 32 ] to not include 32`
- `a delivery of tenant A's run must not be recorded in tenant A: expected 90301 not to be 90301`
- `no letter may land in tenant A: expected 1 to be +0`: an agency letter planted in A's inbox

## The evidence

| File | Router | RLS on the 9 Report OS tables | Result |
|---|---|---|---|
| `red/contract-before-fix-rls-on.txt` | before the fix | on | 27 of 37 pass. The new cases fail as described above. |
| `green/contract-37-of-37.txt` | fixed | on | **37 of 37**: the 23 existing cases and the 14 new ones. |
| `green/mutation-A-fixed-rls-off-37-of-37.txt` | fixed | **off** | 37 of 37. The app layer holds with no help from the database. |
| `red/mutation-B-before-fix-rls-off.txt` | before the fix | **off** | 23 of 37 pass. All 14 new cases fail with the leaks listed above. |
| `red/mutation-D-patch-without-org-rls-off.txt` | fixed, except PATCH scoped by id alone | off | 36 of 37 pass. B changed A's group. |
| `red/mutation-E-member-check-removed-rls-on.txt` | fixed, except the member check | **on** | 36 of 37 pass. The database does not refuse the membership. |

For the mutations, `app.rls_enforce` stays `on` for the session; RLS is disabled
on nine named tables only (`posture.txt` lists them). Every mutation was
reverted, and `rls=true force=true` was restored and re-read on all nine,
before the final green run. That run is on the exact tree committed. Teardown
was verified to leave no fixture row in any of these tables, and no fixture
report type.

Each case tests one behaviour, with its leak assertion ahead of its status
assertion. So in every file above a leak reports as a leak, and no failure
hides another. Every request is also valid under the old schemas, which
required `organizationId`, so a red result comes from the handler, never from a
400 in validation.

## Recorded, not fixed here

These were found on the way and are outside D3. Each has a ledger row:

- **L188.** No migration seeds `report_type_registry`. It has 0 rows on a deployed database, so every report type the Insights canvas offers answers 404 from `POST /runs`.
- **L189.** Insights sends a project id under `scope: 'program'`, and the router resolves it as a program-group id.
- **L190.** A `platform_send` delivery is recorded as `sent` whether or not its correspondence persisted.

## For operations

Cross-tenant memberships written before this fix can be listed with this query,
run as the owner role:

```sql
SELECT m.program_group_id, g.organization_id AS group_org, m.project_id, p.organization_id AS project_org
  FROM report_program_group_projects m
  JOIN report_program_groups g ON g.id = m.program_group_id
  JOIN projects p ON p.id = m.project_id
 WHERE p.organization_id <> g.organization_id;
```

Since this fix they are inert on read. Deleting them is a data decision for the
owning tenants, not a migration.

## Reproduce

```
# a disposable database provisioned by install-fresh + deploy-migrate with
# APP_SERVICE_DB_PASSWORD set, then:
TEST_DATABASE_URL=<owner url> APP_DATABASE_URL=<app_service url> \
  npx vitest run --config vitest.db.config.ts tests/db/two-tenant-application-rls.dbtest.ts
```

Later the same day, the fourteen Report OS cases moved, unchanged, into
`tests/db/report-os-tenant-from-session.dbtest.ts` on the shared
`tests/db/two-tenant-fixture.ts`, because the combined file had crossed the
ESLint 500-line limit. The 37 cases are now split 23 + 14, so to re-run
everything recorded here, pass both files to the command above.
