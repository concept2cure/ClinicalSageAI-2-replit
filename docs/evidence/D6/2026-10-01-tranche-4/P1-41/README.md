# P1-41 (DP-49, DP-57, Medium): access and configuration changes leave an audit row

Tranche 4, 2026-10-01. Launch row D6. Base: HEAD `9e9a9614e` plus other lanes' uncommitted work in the same tree (none of it in the files below).

## What was wrong (verified at HEAD before any change)

- **DP-49.** `server/routes/tenant-users.ts` `PATCH /:organizationId/:userId` (role change) and `DELETE /:organizationId/:userId` (removal) ran one `pool.query` each and wrote **no audit row**. They took no reason, so nothing recorded why either. Red runs: a PATCH with no reason answered 200 and changed the role. A PATCH with a reason answered 200 and wrote zero `audit_logs` rows (`red/admin-change-audit.dbtest.txt`, `red/route-tests.txt`).
- **DP-57.** `server/routes/tenant-config.ts` `PATCH /:tenantId/settings`, `PATCH /:tenantId/settings/:section` and `POST /:tenantId/settings/reset` wrote `organizations.settings` with **no audit row**. That covers the second-factor requirement, password policy, session timeout, IP restrictions and audit-trail retention. Red runs: a security-section change answered 200 and left zero rows. With the audit writer refusing, the setting still changed.
- The compliance reports said so in their "not recorded" lines. `access-review.ts`: *"A removal or a role change made by an administrator in the product is not written to the audit trail"* and *"role changes are not recorded"*. `administrative-changes.ts`: *"A change to a member's organisation role … are not recorded"* and *"Settings changed through the tenant configuration are not recorded …"*. Red run: the administrative changes report, after a real role change, removal and settings change, contained none of them (`red/compliance-reports.dbtest.txt`).

## What is true now

| Change | Route | Audit row (one, chained, same transaction) |
|---|---|---|
| Member role change | `PATCH /api/tenant-users/:org/:user` with `{ role, reason }` | `member_role_changed`, table `organization_users`, record = target user id, `reason` column. `new_values` = `{ targetUserId, previousRole, newRole, reason }` |
| Member removal | `DELETE /api/tenant-users/:org/:user` with `{ reason }` | `member_removed`, same shape, `newRole: null` |
| Settings write | `PATCH …/settings`, `PATCH …/settings/:section` | `tenant_settings_changed`, table `organization_settings`, record = org id |
| Settings reset | `POST …/settings/reset` | `tenant_settings_reset` |

- **Reason required (DP-49).** A missing, empty or blank reason gets 400 `REASON_REQUIRED` ("… Nothing was changed.") before any write. The order is: authZ (403), then self-change (400 `SELF_ROLE_CHANGE` / `SELF_REMOVAL`), then reason, so no existing refusal changes.
- **Same transaction.** Member changes run in `transaction()` (`server/db/runtime.ts`, the canonical helper) inside `inVerifiedOrgScope`, so the target organisation's tenant variables are set at BEGIN. The role is read `FOR UPDATE`, then the UPDATE runs, then `writeChainedAuditRow` on the same client. Settings writes run on the request's own connection (`requestPgClient` + `requestDb`): BEGIN, `SELECT … FOR UPDATE`, UPDATE, `writeChainedAuditRow`, COMMIT. A refused audit row throws and the change rolls back. The 500 carries no error text.
- **Values recorded only where the item asks.** The settings row names the sections written and the *names* of the fields that changed. It carries values before and after only for `security.{mfaRequired, passwordPolicy, sessionTimeoutMinutes, ipRestrictions}` and `qmp.auditTrailRetentionDays` (`VALUE_AUDITED` in `tenant-config.ts`). Two cases are pinned, and a mutation that drops the filter fails both (`red/mutation-value-filter-removed.txt`): a Slack webhook URL is never in the row, and neither is an unexpected key stored inside the security section.
- **An unchanged role writes nothing and records nothing.** The response is 200 with `unchanged: true`.
- **Reports.** `ADMINISTRATIVE_ACTIONS` now includes the four action strings, checked against the writers by the route tests and end to end by the dbtest. The closed "not recorded" lines are gone. Each report now says where these changes appear, that ones made before recording began were not recorded, and, for configuration, that only the security and retention values are kept.

## Red / green

| Check | Red (HEAD) | Green |
|---|---|---|
| `server/routes/__tests__/tenant-users-audit.test.ts` + `tenant-config-audit.test.ts` (new) | 18 failed / 2 passed. The 2 that passed are vacuous at HEAD: no row at all. | 21 / 21 |
| Mutation: settings value filter removed | 4 failed, including webhook-not-recorded and stored-secret-not-carried | (file restored) |
| `tests/db/admin-change-audit.dbtest.ts` (new; app_service, RLS on) | 9 / 9 failed | 9 / 9 |
| `tests/db/compliance-reports.dbtest.ts` (new P1-41 case) | 1 failed / 16 passed | 17 / 17 |
| `review-round-1.test.ts` (items 4, 5) | 5 failed / 9 passed | 14 / 14 |
| Related: contract test, all compliance-report unit tests, `audit-compliance-reports.test.ts` | — | 140 / 140 |
| Related dbtests: memberships, organizations-writes (staff cross-org settings write in the system scope), users-rls, invitation-acceptance | — | 33 / 33 |

The dbtest proves "one chained row in the org's chain" by re-deriving it. The row's `sha256_chain` must equal `deriveChainHash(row, previous head of ORG_A by chain_seq)`. Its `payload_hash` must equal `hashPayload(new_values)`, its `chain_seq` must be set, and there must be no row on ORG_B. It proves "a failure rolls the change back" by switching `writeChainedAuditRow` to refuse: the role, the membership and the settings are each unchanged afterwards, and no row is written.

## Gates (`green/gates.txt`)

Pass: `ci:server-error-leaks`, `ci:drizzle-tenant-scope`, `ci:client-ip-single-source`, `ci:org-path-param-guards`, `ci:tenant-entry-points`, `ci:no-mock-in-prod-routes`, `ci:audit-logs-fixture`, `ci:audit-route-mounts:no-regression`.

Fail, none in this change's files:
- `ci:regulated-delete-audit`: `server/routes/authoring.router.ts:5507`, another lane's uncommitted edit.
- `ci:fabricated-identity`: crashes on ENOENT for `server/routes/qms.ts`, which another lane deleted (uncommitted).
- `ci:tenant-isolation:no-regression`: `server/services/c2c/project-retention.ts`, committed at HEAD 10-01 00:37.
- `ci:internals-in-copy`: `client/src/.../ComplianceReportResult.tsx:181`, clean at HEAD (0224f43a).

ESLint on every touched file: 0 errors. The warnings are the same as HEAD: the tenant-users POST handler's length and complexity, and the contract test's `fakeQuery`. The `max-lines` warning on tenant-users.ts is cleared by moving the change logic to `server/services/tenant/membership-change.ts`.

## Commands

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run server/routes/__tests__/tenant-users-audit.test.ts server/routes/__tests__/tenant-config-audit.test.ts
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run server/services/audit/compliance-reports/__tests__/ server/routes/__tests__/audit-compliance-reports.test.ts server/__tests__/security/tenant-isolation-tenant-users.contract.test.ts
TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:5432/c2c_testdb?sslmode=disable' \
APP_DATABASE_URL='postgresql://app_service:local-testdb-app-service-password@127.0.0.1:5432/c2c_testdb?sslmode=disable' RLS_ENFORCE=on \
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run --config vitest.db.config.ts \
  tests/db/admin-change-audit.dbtest.ts tests/db/compliance-reports.dbtest.ts \
  tests/db/memberships.dbtest.ts tests/db/organizations-writes.dbtest.ts tests/db/users-rls.dbtest.ts tests/db/invitation-acceptance.dbtest.ts
```

## Client call sites

There are none. `grep -rn "tenant-users" client/src` finds only `POST /api/tenant-users` (AdminAccess invite, Onboarding) and `GET /api/tenant-users/:orgId` (ProtocolDevWrites). No surface calls the PATCH or DELETE member routes, so there was no reason field to add. Any future role-change or remove-member control must send `reason`, or it gets 400 `REASON_REQUIRED`.

## Residuals

- `PATCH /api/organizations/:id/settings` (`organizations-routes.ts`) still records section names only. Its not-recorded line stays.
- A role change does not invalidate the auth membership cache; a removal does. A demotion takes effect at the cache TTL. This is pre-existing, outside this item, and needs a one-line `invalidateOrgMembershipCache(userId, organizationId)` after the PATCH commits.
- Still not recorded, and still stated: SCIM-group role changes, invitation acceptance, SCIM token and IP allow-list administration. The access review does not reconstruct a past role from the new rows.
- No migration and no manifest change.
- **Test rows left in the local shared test DB.** `tests/db/memberships.dbtest.ts` (role change by its multi-org admin) and `tests/db/organizations-writes.dbtest.ts` (staff cross-org settings write) now produce one real chained row each on fixture org 90302. Neither suite's `afterAll` removes audit rows by actor. From this session's run there are two rows on 90302: `member_role_changed` (actor 359) and `tenant_settings_changed` (actor 381). Their removal was declined by the session's permission policy, so they are still there. They are inert (fixture org, deleted actors). Proposed fix for both suites' `afterAll`, before their users are deleted: in one owner transaction with `trg_audit_logs_no_delete` disabled, `DELETE FROM audit_logs WHERE tenant_id = ANY($1::int[]) AND actor_id = ANY($2::int[])` with `FIXTURE_ORGS` and the suite's own provisioned user ids. This is the pattern `admin-change-audit.dbtest.ts` and `compliance-reports.dbtest.ts` already use.
