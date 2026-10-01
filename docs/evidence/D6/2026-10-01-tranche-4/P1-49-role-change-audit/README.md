# P1-49: every role and configuration change is recorded in its own transaction

Row **D6**. Plan **P1-49**, finding **DP-58**. 21 CFR 11.10(e); EU GMP Annex 11 §12.4.
Audited on `concept2cure-v2` at HEAD `28e1eb43`, 2026-10-01. Nothing is committed;
the control tower commits.

## What was wrong

P1-41 made the in-product changes (a member's role, a removal, tenant
configuration) write their chained audit row inside the change's transaction. Three
other writers of the same facts did not:

1. **SCIM group membership** (`server/routes/scim.ts`, `PATCH /scim/v2/Groups/:role`).
   This is how an identity provider assigns roles. Each role was written with a
   bare `UPDATE organization_users SET role …` on the pool, and nothing recorded it:
   no `audit_logs` row and no `audit_events` row.
2. **SCIM account writes** (`POST /Users`, `PUT` and `PATCH /Users/:id`,
   `DELETE /Users/:id`, and the shared-account membership removal). Each wrote
   first and then called `auditScim`, which ran on its own connection after the
   commit, and logged and swallowed any failure. An account could be provisioned or
   deprovisioned with no record of it.
3. **The AnA platform controller** (`server/services/ana-platform-controller.ts`,
   mounted at `/api/ana/platform`). It had its own settings writer: a shallow
   `{ ...current, ...updates }` merge on the shared pool, then a best-effort
   `ana:update_settings` row through `auditService.logAction`, whose failure it
   ignored. The organisation's configuration could change with no record. The
   shallow merge also erased the fields of a section that the update did not name
   (the DP-62 defect, which the tenant-config writer had already fixed).

A SCIM group role change also left the role cached for up to 60 s per server task
(`middleware/orgMembership.ts`). The tenant-users PATCH drops that cache entry after
its commit (c1f2cb9c). The group path did not.

## What changed

| File | Change |
|---|---|
| `server/routes/scim.ts` | `PATCH /Groups/:id`: every role change in the request goes through `changeMemberRole` (the canonical membership writer, `services/tenant/membership-change.ts`). That function writes one chained `member_role_changed` row with `writeChainedAuditRow` on the same client. All of the request's changes run in one `transaction` (a SCIM PATCH is atomic, RFC 7644 §3.5.2). The actor is the identity provider, so there is no user id. The record carries the caller's address and user agent. The reason is `SCIM group '<role>' <op> by the identity provider`. A refused row rolls back the whole request and returns 500 with the existing calm SCIM error. After the commit, each member whose role **changed** is dropped from the membership cache. Nothing is dropped when nothing changed or the request was rolled back. `auditScim` now takes the transaction client, and every user write (provision, PUT, PATCH, DELETE, `removeMembership`) records its `audit_events` row inside that write's own transaction. A refused event rolls the write back. The cache is dropped after the commit. `removeMembership` takes its membership as one object, so it stays within `max-params`. |
| `server/services/tenant/membership-change.ts` | `changeMemberRole` gains `onlyFrom`. A SCIM group removal demotes only a member who holds that group's role, as the old `… AND role = $3` did. A member with any other role is left unchanged and unrecorded. |
| `server/services/tenant/tenant-settings-writer.ts` (new) | The settings writer, moved **verbatim** out of `server/routes/tenant-config.ts`: `writeTenantSettings` (row lock, write, chained `tenant_settings_changed` / `tenant_settings_reset` row, one transaction on the request's own connection), `overlaySettings` (DP-62 key preservation), `asSettings`, `VALUE_AUDITED` and the audit-detail helpers. This is the one writer. |
| `server/routes/tenant-config.ts` | Imports the writer and no longer defines it. Its routes, `tenantSettingsSchema` and `defaultSettingsFor` are unchanged. The schema stays in the route because the writer does not use it. |
| `server/services/ana-platform-controller.ts` | Every settings write (`updateSettings`, `toggleModule`, `configureAI`, `setComplianceDefaults`, `onboardOrganization`, `executeAction` → settings/feature/ai_config/compliance/onboarding) goes through `writeTenantSettings` with `overlaySettings`. It takes the request (`via`), so the write runs on that request's connection and tenant scope and records its actor. A key given `undefined` is not named, so it is kept, not erased. `toggleModule` computes the module lists from the settings read under the writer's row lock, so it does not overwrite a concurrent toggle. The best-effort `ana:update_settings` row is gone, because the writer's row is the record. `verifyPaidAccess` is unchanged. |
| `server/routes/ana-platform-control.ts` | The owner/admin gate (IAM-20) is unchanged. The settings-writing routes pass `req` to the controller. A write that throws is answered with 500 and calm copy ("The settings could not be saved.", "Onboarding did not complete.", "The action could not be completed."), never as success and never with the error's text. |

Settings records are now identical in shape: a controller change writes the same
`tenant_settings_changed` row, with the same columns and the same `details` keys, as
`PATCH /api/tenant-config/:id/settings/:section`. The administrative changes report
already reads that action.

## Tests: red, then green

| Test | Red | Green |
|---|---|---|
| `tests/db/role-config-change-audit.dbtest.ts` (real PostgreSQL 16, `app_service` NOSUPERUSER NOBYPASSRLS, `RLS_ENFORCE=on`; SCIM under the system scope as production mounts it, the controller and tenant-config behind the real `/api` auth boundary; "same transaction" read from the database as equal `xmin`; the chain link recomputed with `deriveChainHash`) | `red/role-config-change-audit.dbtest.txt`: **12/12 failed** on unchanged server code (HEAD c81212ac, the test alone) | `green/role-config-change-audit.dbtest.txt`: **12/12** |
| `server/__tests__/security/scim-group-role-cache.test.ts` (ordered recorder: transaction statements, audit writes, cache invalidations) | `red/scim-group-role-cache.txt`: **6/7 failed** on the Groups handler as the earlier attempt left it (bare UPDATEs, no record, cache dropped inside the loop before any commit) | `green/scim-group-role-cache.txt`: **7/7** |
| `server/__tests__/routes/ana-platform-control.test.ts` (extended: the request reaches the controller; a refused write is 500, `success:false`, no error text) | `red/ana-platform-control.txt`: **13/24 failed** on the unchanged route and controller | `green/ana-platform-control.txt`: **24/24** |

One red case is partly an artifact. In `scim-group-role-cache` red, "a user who is
not a member … is not given the role" logs `UPDATE 999 admin` only because the
recorder logs every UPDATE it is sent. On PostgreSQL the old `UPDATE … WHERE` matched
no row. The case still fails at HEAD for the real reason, which is that there was no
transaction.

Neighbours:

- `green/unit-neighbours.txt`: 12 files, **157/157**. These are every SCIM suite
  (group cache, IP allow-list admin and enforcement, provisioning contract,
  tenant-scoped writes contract, tenants admin), ana-platform-control,
  tenant-isolation-tenant-users, tenant-config-audit, tenant-users-audit,
  establishRequestTenantScope and routes-reach-the-bundle. Two SCIM contract
  suites had fakes that predated the in-transaction writes, and they were brought
  up to date. `scim-provisioning.contract` now reads the DELETE's audit event and
  the group UPDATE from the transaction's client and asserts the chained
  `member_role_changed` row on that client. In `scim-tenant-scoped-writes.contract`,
  a transaction's statements reach the same fake pool unless a test gives the
  client its own answers. Its assertions did not change.
- `green/db-neighbours.txt`: 11 files, **121/125**. The 4 failures are not this
  item's:
  - `project-scope-boundary` ×2: `PATCH /api/ana/platform/projects/:id` with the
    fixture's default `member` token is refused by the IAM-20 owner/admin gate
    (9fbc9aa8). That route and `updateProject` are unchanged here.
  - `mcp-account-standing` ×2: the failure is at the consent step, before any SCIM
    call ("This session has ended"). It comes from P0-4b's in-flight session-end
    work in the shared tree.
- `green/gates-and-eslint.txt`: the gates and ESLint (below).

## Gates

All exit 0: `check:security-patterns` (0 violations), `ci:server-error-leaks` (no
file gained a site), `ci:sign-ceremony`, `ci:launch-scope-api`,
`ci:unreferenced-modules` (82 = baseline), `ci:untracked-imports` (nothing
committed yet). No migration, so the migration gates do not apply.

`node scripts/ci/check-untracked-imports.mjs --all` **fails on exactly this
change's new import**, as it should while the new module is untracked:
`server/routes/tenant-config.ts:22` and `server/services/ana-platform-controller.ts:40`
→ `tenant/tenant-settings-writer`. **The commit must include
`server/services/tenant/tenant-settings-writer.ts`.**

ESLint: 0 errors. 0 warnings in every changed file except `server/routes/scim.ts`,
which has 5 warnings. HEAD had 6, and each of the 5 is one HEAD already had (scimAuth
complexity, a nested block, `auditScim` max-params, max-lines, the PATCH /Users
complexity). The PUT handler's complexity warning is gone, and `removeMembership`'s
new seventh argument was folded into an object instead of adding a warning.

Focused type-check (a scratch tsconfig extending `tsconfig.json`, with `files` set to
the six changed server modules): no diagnostic in any of them. The two diagnostics
printed are `jsonwebtoken` declaration lookups in `token-revocation.ts` and
`jwtVerify.ts`, which the scratch config's empty `include` causes.

## What remains (residuals)

- **R1 (closed in the fix round, below). The compliance reports still say a SCIM-group role change is not recorded.
  After this change, that is false.** These files are not this item's, so the
  exact changes are listed here (`observations/review-round-1-after-P1-49.txt`
  shows the pinning test failing 1/18 now):
  - `server/services/audit/compliance-reports/queries/administrative-changes.ts:152`:
    replace `'A role change that arrives through a SCIM group is not recorded.'`
    with `'A role change that arrives through a SCIM group is listed with the role before and after; it has no person as actor, and its reason names the group. Those made before the product began recording them were not recorded.'`
  - `server/services/audit/compliance-reports/queries/access-review.ts:119`:
    replace the last sentence, from `A role change made through a SCIM group…`,
    with `A role change made through a SCIM group, which is how an identity provider assigns roles, is listed there too, with no person as actor; those made before the product began recording them were not recorded.`
    Also update the header comment at lines 15–17, which says the handler "writes no row".
  - `server/services/audit/compliance-reports/__tests__/review-round-1.test.ts`:
    lines 112–113 should recognise the canonical writer:
    `/UPDATE organization_users SET role|changeMemberRole\(/` and
    `/auditScim\(|writeChainedAuditRow\(|INSERT INTO audit_|changeMemberRole\(/`.
    Line 79 should pin the new access-review sentence. Line 100 should accept
    `/made by an administrator in the product|made through a SCIM group/`.
    With those changes, the `it.each` at line 120 requires that the disclosure be
    gone, which is the flip it was written for.
- **R2 (refusal closed in the fix round, below). P1-47 (connector enablement), working concurrently.**
  `tenant-config.ts` now imports the writer, so `writeTenantSettings` keeps its name
  and signature there. P1-47's `VALUE_AUDITED` entry
  (`claudeConnector: ['enabled']`, which its test expects as values before and after)
  now goes in `server/services/tenant/tenant-settings-writer.ts`. Its refusal of
  `claudeConnector` on the general doors must also cover the AnA controller. The
  controller's `updateSettings` writes any top-level key, as it did before this
  change, through `PATCH /api/ana/platform/settings` and `/execute`
  (category `settings`), with owner **or admin**. The narrowest fix is one refusal
  in the shared writer, or in `AnaPlatformController.updateSettings`.
- **R3. The AnA controller writes arbitrary keys without a schema.** This item did
  not change that, and P1-47's key makes it more pressing. The controller can write
  `security.*` (gated by owner/admin, the same as tenant-config's PATCH) with no
  type check. For example, `security.mfaRequired: "no"` would be stored as given.
  This was true before.
- **R4. The controller no longer bumps `organizations.updated_at`** on a settings
  write, because the shared writer never did and the route's behaviour was to stay
  unchanged. The chained row's `occurred_at` is the record of when.
- **R5. `project-scope-boundary.dbtest.ts`** (IAM-20 lane): its two AnA
  project-update cases need an admin token since 9fbc9aa8.
- **R6.** `onboardOrganization` remains several transactions (settings, project,
  modules) with a best-effort `ana:onboard_organization` summary row. Each
  settings step is recorded in its own transaction. A failure partway leaves the
  steps before it in place, and the route says "Onboarding did not complete."
  instead of reporting success.

## Fix round (2026-10-01)

Review found three must-fix items. Two are behaviour, done red first. The third is
about how the commit is built: nothing here commits, so it is set out for the
control tower under "Committing" below.

### 1. The compliance reports said a SCIM-group role change is not recorded

**What was wrong.** Since this item, `PATCH /scim/v2/Groups/:id` writes one chained
`member_role_changed` row per changed member, in the change's own transaction. The
administrative changes report reads that action, and a row with no actor is kept by
the `LEFT JOIN LATERAL` in `actorJoin` (`queries/section.ts:35`). Both reports still
told a customer's auditor that such a change "is not recorded"
(`queries/administrative-changes.ts:152` and `queries/access-review.ts:138`). The
tripwire written for this flip, `review-round-1.test.ts` ("the SCIM group handler is
where the test thinks it is"), was failing 1 of 18 because it only recognised a bare
`UPDATE organization_users SET role` in the handler.

**What changed.**

| File | Change |
|---|---|
| `server/services/audit/compliance-reports/queries/administrative-changes.ts` | The `notRecorded` line now reads: "A role change that arrives through a SCIM group is listed with the role before and after; it has no person as actor, and its reason names the group. Those made before the product began recording them were not recorded." The header's writer map names `routes/scim.ts PATCH /Groups/:id` as a writer of `member_role_changed` (no actor) and `services/tenant/tenant-settings-writer.ts` as the writer of `tenant_settings_*` for tenant-config and the AnA controller. A dated note records the change. |
| `server/services/audit/compliance-reports/queries/access-review.ts` | The role-history `notRecorded` line's last sentence now reads: "A role change made through a SCIM group, which is how an identity provider assigns roles, is listed there too, with no person as actor; those made before the product began recording them were not recorded." The header comment (lines 16–20) no longer says the handler "writes no row". P1-43's hunks in this file were left alone. |
| `server/services/audit/compliance-reports/__tests__/review-round-1.test.ts` | The tripwire recognises the canonical writer. The handler counts as changing a role if it has `UPDATE organization_users SET role` or `changeMemberRole(`. It counts as recording if it has `auditScim(`, `writeChainedAuditRow(` or `INSERT INTO audit_`, **or** if it calls `changeMemberRole(` and `changeMemberRole` in `membership-change.ts` both makes the UPDATE and writes its row (`recordMembershipChange(` / `writeChainedAuditRow(`). The canonical writer is read too, so the disclosure is required again if that writer stops recording. A new case pins that the handler records through the canonical writer. Item 4 pins the new access-review sentence. The sentence check accepts `made through a SCIM group` beside `made by an administrator in the product`. A new case pins the administrative-changes sentence. With these changes the `it.each` requires the disclosure to be **absent**. P1-43's hunk (lines 81–86) was left alone. |

**Tests.**

| Test | Red | Green |
|---|---|---|
| `review-round-1.test.ts` | `red/fix-round/review-round-1.txt`: the updated tripwire on the unchanged copy, **4 failed / 16 passed**. The failures are: item 4's pinned sentence; the `it.each` for both reports (disclosure present while the handler records); and the new administrative-changes sentence. | `green/fix-round/review-round-1.txt`: **20/20** |
| Tripwire mutant | `red/fix-round/review-round-1-tripwire-mutant.txt`: the test's own recognisers, run on the real files and on an in-memory copy of `membership-change.ts` whose `changeMemberRole` no longer calls `recordMembershipChange`. Real tree: `recordsIt: true`, so the disclosure is not required. Mutant: `canonicalRecords: false`, `recordsIt: false`, so the disclosure is required. The working tree was not modified. | n/a |

### 2. A second door to P1-47's connector switch, through the controller this item owns

**What was wrong.** `AnaPlatformController.updateSettings` writes any top-level key
through `writeTenantSettings`, and owners and administrators can reach it. It is reached
from `PATCH /api/ana/platform/settings`, `PATCH /ai-config` (through `configureAI`,
which passes its body straight through) and `POST /execute` with category `settings`
or `ai_config`. `claudeConnector` is the owner's setting, with one door
(`connector-enablement.ts`). `platform-token.ts` reads it on every request. An
administrator who is not the owner could still turn the connector on through this
controller, and the change was recorded as an ordinary `tenant_settings_changed`.
This door existed before this item. P1-49 moved it onto the shared writer without
adding the refusal. `PATCH /api/organizations/:id/settings` had the same hole:
`requireOrgAdmin` admits an administrator, and the route writes the key with a
shallow merge.

**What changed.**

| File | Change |
|---|---|
| `server/services/ana-platform-controller.ts` | `updateSettings` begins with `if (namesClaudeConnector(updates)) return { success: false, action: 'update_settings', error: CONNECTOR_NOT_A_GENERAL_SETTING }`. Nothing is read or written and no row is recorded. The route already answers `success: false` with 403. Every arbitrary-key path in the controller reaches this method (`PATCH /settings`, `/ai-config`, and `/execute` for settings and ai_config). `toggleModule`, `setComplianceDefaults` and `onboardOrganization` write fixed keys only. The refusal is in the controller, not in the shared writer, because the owner's door uses that same writer. |
| `server/routes/organizations-routes.ts` | `PATCH /:id/settings`: after the "non-empty object" check, a body (bare or `{ settings, reason }`) that names the key gets 403 `{ success: false, error: CONNECTOR_NOT_A_GENERAL_SETTING }`, before any read or write. This is the narrow fix. Moving this door onto the shared writer is DP-69, and this round does not do it. |

Both use P1-47's `namesClaudeConnector` and `CONNECTOR_NOT_A_GENERAL_SETTING`
(`server/mcp/auth/connector-enablement.ts`). That means one rule and one message, the
same ones tenant-config's general door uses.

**Tests.**

| Test | Red | Green |
|---|---|---|
| `tests/db/role-config-change-audit.dbtest.ts`, new describe "the connector for Claude is not a general setting on these doors" (real PostgreSQL, `app_service` NOBYPASSRLS, `RLS_ENFORCE=on`, administrator token). There are 7 doors: AnA `PATCH /settings`; the same with another key beside it (refused whole, so the other key is not stored either); `PATCH /ai-config`; `POST /execute` with settings; `POST /execute` with ai_config; organizations `PATCH /:id/settings` with a reason; and the same bare. Each must answer 403 with the message, leave `organizations.settings` equal to before with no `claudeConnector`, and leave the organisation's `audit_logs` count unchanged. A control case shows the same administrator still changes another key on the AnA, `/execute` and organizations doors. | `red/fix-round/role-config-change-audit.dbtest.txt`: **8 failed / 12 passed**. Every door answered **200** and stored `claudeConnector: {"enabled":true}`. The organizations door answered with `auditTrail: {persisted:true, chained:true}`, so the change was recorded as an ordinary settings change. The control case fails only as a cascade, because the doors before it had stored the key. | `green/fix-round/role-config-change-audit.dbtest.txt`: **20/20** |
| P1-47's `server/mcp/__tests__/mcp-connector-enablement.dbtest.ts`. Its R1 and R2 cases were kept red on purpose for these two doors. | P1-47's own `green/mcp-connector-enablement.dbtest.txt`: 2 failed / 19 passed (those two cases) | `green/fix-round/mcp-connector-enablement.dbtest.txt`: **21/21**. Both doors now return 403, nothing is stored, and the connector token is still refused at `/mcp`. |

### 3. Committing (for the control tower)

`node scripts/ci/check-untracked-imports.mjs --all` fails as it should while
these files are untracked (`green/fix-round/gates-and-eslint.txt`). The lines that
concern this item:

- `server/routes/tenant-config.ts:22`, `server/services/ana-platform-controller.ts:40`
  → `server/services/tenant/tenant-settings-writer.ts` (P1-49, untracked).
- `server/routes/tenant-config.ts:29`, `server/services/ana-platform-controller.ts:41`,
  `server/routes/organizations-routes.ts:13` → `server/mcp/auth/connector-enablement.ts`
  (P1-47, untracked).
- `server/services/audit/compliance-reports/queries/access-review.ts:31` →
  `./review-record` (P1-43, untracked).

So:

1. The P1-49 commit must add `server/services/tenant/tenant-settings-writer.ts`,
   `tests/db/role-config-change-audit.dbtest.ts`,
   `server/__tests__/security/scim-group-role-cache.test.ts` and this evidence
   directory. All four are untracked.
2. `tenant-config.ts` holds P1-49's extraction and P1-47's connector routes.
   `ana-platform-controller.ts` and `organizations-routes.ts` now import P1-47's
   `connector-enablement.ts`. **P1-49 and P1-47 therefore land in one commit, or
   P1-49's commit includes `connector-enablement.ts`.** The refusal must not land
   after the connector switch, because between the two commits an administrator
   could open the connector.
3. `access-review.ts` and `review-round-1.test.ts` hold P1-43's hunks beside this
   round's. P1-49's lines are: in `access-review.ts`, header lines 16–20 and the
   second `notRecorded` entry; in `review-round-1.test.ts`, the comment and sentence at
   item 4's first assertion (lines 78–81), the sentence check at "P1-41 fix round: no
   sentence…", and the additions to the "P1-41 fix round — both reports disclose…"
   describe. In both files git joins P1-43's lines and P1-49's into a single hunk
   (`access-review.ts` @@ -16,2 +16,11; `review-round-1.test.ts` lines 78–87).
   Splitting them by item therefore needs `git add -p` in edit mode. The simpler
   option is to commit these two files with P1-43 (`queries/review-record.ts` is
   P1-43's untracked import). The copy change and the tripwire must land in the same commit as
   the SCIM handler change, or the tripwire goes red on trunk.

### Neighbours and gates (fix round)

- `green/fix-round/unit-neighbours.txt`: **24 files, 338/338**. This covers every SCIM
  suite, ana-platform-control, tenant-isolation-tenant-users, tenant-config-audit,
  tenant-users-audit, establishRequestTenantScope and routes-reach-the-bundle. It also
  covers all eight compliance-reports suites (review-round-1 among them),
  audit-compliance-reports, organizations-profile-settings, and P1-47's
  tenant-config-claude-connector and mcp-connector-enablement unit tests.
- `green/fix-round/db-neighbours.txt`: **13 files, 165/167**. The 2 failures are
  `project-scope-boundary` ×2. The IAM-20 owner/admin gate (9fbc9aa8) refuses the
  fixture's member token on `PATCH /api/ana/platform/projects/:id`. That route and
  `updateProject` are unchanged here (residual R5). `mcp-account-standing`, which
  failed in the first round because of P0-4b's in-flight work, now passes.
- `green/fix-round/gates-and-eslint.txt`:
  - `check:security-patterns`: 0 violations.
  - `ci:server-error-leaks`: OK, no file gained a site.
  - `ci:sign-ceremony`: OK.
  - `ci:unreferenced-modules`: 82, equal to the baseline.
  - `ci:untracked-imports`: nothing committed against origin.
  - `ci:launch-scope-api`: **exit 1**, but only on `[unmapped] /api/tenant-config/:p/claude-connector` from P1-47's `ClaudeConnectorSetting.tsx`. That is P1-47's residual R3, not this item.
  - `--all` untracked imports: exit 1, as listed in "Committing".
  - ESLint, 15 files: 0 errors.
    - `scim.ts` has 5 warnings, unchanged from the first round.
    - `organizations-routes.ts` has 1 warning, as at HEAD. It is the same `complexity` warning on the same handler, which went from 22 to 23 with the new branch. The pre-push ratchet counts warnings, so the count did not grow.
    - Every other file has 0 warnings.
  - Focused tsc on the six files changed in this round: no diagnostic in them. The only output is three `jsonwebtoken` declaration lookups in unchanged files, caused by the scratch config.

### What remains after the fix round

- **R2a (P1-47 lane, not this item's file).** P1-47's README still lists R1 and R2
  as open and says its two dbtest cases are "kept red on purpose". Both now pass
  (`green/fix-round/mcp-connector-enablement.dbtest.txt`). That README should be
  updated to say they are closed.
- **R7 (DP-69).** `PATCH /api/organizations/:id/settings` is still a second
  settings writer beside `tenant-settings-writer.ts`. It does a shallow,
  section-replacing merge on the shared handle, and its `data_modify` row records
  section names only, not in the write's transaction. The connector refusal closes
  the immediate hole. Moving the door onto the shared writer is the
  zero-duplication fix and is DP-69's work.
- **R8 (observation).** `server/routes/ana-tool-policy.ts:92` writes
  `organizations.settings` whole (only its own `anaToolPolicy` key) with a raw
  `UPDATE` outside the shared writer. It cannot name the connector, so it is not a
  door to it. It is another settings writer that does not record its change in its
  transaction. Not in this item's scope.
- R3–R6 from the first round are unchanged.
