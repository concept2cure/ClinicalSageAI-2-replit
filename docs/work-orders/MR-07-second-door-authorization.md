# MR-07 — Bring every second door up to the main door's standard

| | |
|---|---|
| Phase | Phase 0 (stage 1), Phase 3 (stages 2–5), Backlog (stages 6–7) |
| Highest open severity at head | P2 |
| Human testing | Degrades: first-run setup on the `docker-compose.yml` and `docker-compose.beta.yml` stacks always returns 403 `SETUP_CLOSED`, because compose passes no `SETUP_TOKEN`; on Terraform staging the step is API-only with a header (SEC-02). Workaround: run `scripts/seed-admin.mjs` from the host checkout, or set `SETUP_TOKEN` in a local `docker-compose.override.yml`. Every other finding here is reachable only by direct API call or a non-active tenant state. |
| Owner | engineering |
| Effort | L in total: S + S + M + M + M + S + S |
| Depends on | MR-03 (SEC-08 Redis, for stage 6's limiter to hold across tasks); F-11 and F-12 inform stage 3; one NEW founder decision (tenant-level suspend) gates the optional half of stage 4 |
| Findings | 10 total — open 1 · partially fixed 7 · fixed 1 · refuted 0 · unverifiable 1 |
| Basis | cold audit at `92ccdba1`; every status re-verified at `94b4f9238` on 2026-10-13 — [evidence](../evidence/reviews/2026-10-13-market-readiness/) · [findings register](MR-findings-2026-10-13.json). The branch moves about 1,500 commits a day: re-confirm each finding at the current head before starting its stage. |

## Goal

Every route that changes a governed record, grants or removes access, or
admits an outside client applies the same checks as the main path: a writing
role on the server, a live and standing session, the tenant's lifecycle state,
an electronic signature where the act is a GxP decision, and one chained audit
row written in the same transaction as the change. A buyer's security or
quality reviewer can pick any side entrance — first-run setup, the legacy
`/api/projects` router, QMS supplier and nonconforming-product decisions,
platform suspension, invitation acceptance, the MCP connector, on-demand chain
verification — and find the same standard, with a test that shows it failing
before the fix.

## Why it matters

- **A viewer can rename or archive a regulatory program's anchor project.**
  `POST` and `PATCH /api/projects` carry no role gate
  (`server/routes/projects-management.ts:153,433`), and the delete and update
  audit rows record `userId: null` (`:391,479`), so the trail cannot say who did
  it. That fails the Part 11 attributability question in any audit.
- **An editor can approve a supplier or disposition a nonconforming lot
  `use_as_is` with no signature.** `POST`/`PATCH /api/mdx/qms/suppliers` and
  `PATCH /qms/nonconforming/:id/disposition` (`server/routes/mdx-qms.ts:906,941,1216`)
  write with a plain `pool.query`, then audit after commit. A medtech buyer
  under ISO 13485 / 21 CFR 820 will reject this at GA.
- **Access grants and platform suspensions are missing from the customer's own
  audit trail.** Invitation acceptance writes no audit row at all
  (`server/services/atomicQuotaService.js:422`), and a platform suspension is
  logged under tenant 0, best-effort, after commit
  (`server/routes/admin/master-admin.ts:408-460`). The organisation's access
  review cannot show who was granted or suspended.
- **The MCP connector is on in production Terraform but ignores tenant
  lifecycle.** An organisation that `/api` treats as read-only (`pending_deletion`,
  `past_due`) can still file a governed draft over `/mcp`, and a stolen refresh
  token stays usable for 30 days with no reuse detection
  (`server/mcp/auth/provider.ts:132,144`).
- **First-run setup mints a one-day admin session with no MFA**, possibly a
  platform-admin session (`server/routes/setup.ts:211-236`), and the compose
  stacks the README tells testers to use cannot reach first-run setup at all.

## State at head

| Finding | Status at head | Severity (pilot) | Tester impact | Evidence at head |
|---|---|---|---|---|
| SEC-02 | Partially fixed | P3 | Degrades | `server/routes/setup.ts:211-236` still signs a 1-day admin JWT with no MFA; `docker-compose.yml:87`, `docker-compose.beta.yml:82` pass no `SETUP_TOKEN` |
| SEC-06 | Partially fixed | P2 | None (API only) | `server/routes/projects-management.ts:153,433` no role gate; `:391,479` audit `userId: null`, post-commit, swallowed (`:411,499`) |
| SEC-05 | Partially fixed | P2 | None (no client screen) | `server/routes/mdx-qms.ts:873-878,906,941,950` unsigned supplier approval; `:1216` unsigned NC disposition; `:1051,1120` unsigned |
| P11-06 | Partially fixed | P2 | None | `server/routes/admin/master-admin.ts:408-460` suspension audited under tenant 0 after commit; `server/services/atomicQuotaService.js:316,422` grants unaudited |
| SEC-07 | Partially fixed | P2 | None on the pilot path | `server/mcp/index.ts:247-253` no lifecycle check; `server/mcp/auth/store.ts:143-171` refuses only `suspended`; `provider.ts:132,144` no reuse detection; `consent.ts:103-104` localStorage shortcut |
| SEC-09 | Partially fixed | P3 | None | `server/services/audit/chain.ts:634-702` unbounded walk, cross-tenant legacy context at `:687-700`; route at `server/routes/c2c/actions.ts:799` has no own limiter |
| SEC-23 | Partially fixed | P3 | None | `server/routes/approval-workflow.ts:40` still re-verifies the JWT locally with `verifyJwtWithRotation` |
| SEC-24 | Unverifiable | P3 | None | Not re-checked; at basis the `/api/v1` allowlist was duplicated in `server/bootstrap/register-platform-routes.ts:245-278` and `public-api-allowlist.ts` |
| SEC-25 | Still open | P3 | None | `server/routes/submissionCenter.routes.ts` still imported at `server/bootstrap/register-governance-routes.ts:9,64`, unmounted |
| GTM-03 | Fixed | None | None | `server/routes/tenant-users.ts:575-695` and `server/services/tenant/membership-change.ts:48-159`; 25/25 in `tenant-users-audit.test.ts` |

## Already done at head — do not redo

- **GTM-03 (fixed).** Member re-role and removal require a reason, run under
  `inVerifiedOrgScope` in one transaction, write a sha256-chained row via
  `writeChainedAuditRow` before COMMIT, refuse the last administrator with 409
  (`wouldLeaveNoAdministrator` locks every admin row `FOR UPDATE`), and revoke the
  membership cache after commit. Commits `8167aef12`, `c1f2cb9ca`, `ddc8c0db5`.
  UI: `client/src/concept2cure/v2/surfaces/AdminMemberActions.tsx:175-215`,
  wired at `AdminAccess.tsx:536`. The over-claiming banner at
  `AdminAccess.tsx:409` belongs to GTM-14 in MR-16, not here.
- **SEC-02, closed half.** `SETUP_TOKEN` gate with timing-safe compare
  (`server/routes/setup.ts:70-129`), advisory-lock race guard (`:175-180`),
  Terraform-generated 48-character secret (`terraform/stack/main.tf:82-85,137-140,434`).
  Commit `b221cd641`. Keep the 14 passing tests in `setup.test.ts`.
- **SEC-05, closed half.** `server/routes/qms.ts` and `server/services/qms/qms.service.ts`
  are deleted (`c6f2028b2`); every `mdx-qms.ts` write route carries
  `requireEditorAccess`; document and change approvals are signed
  (`mdx-qms.ts:556,602,1482`; `cf950eeb9`, `0f961354c`). Do not reintroduce
  `/api/qms`.
- **SEC-06, closed half.** `DELETE /api/projects/:projectId` needs an editor and
  refuses under `projectDeletionHolds` / `projectDeletionRefusal`
  (`server/routes/projects-management.ts:341,369-379`;
  `server/services/c2c/project-retention.ts:55-131`). Commits `2b33033e4`,
  `9109aa770`, `0ecc058c5`.
- **SEC-07, closed half.** `/mcp` bearer checks go through `verifyLiveToken`
  (`server/mcp/auth/platform-token.ts:134`), refresh and code exchanges apply
  account standing (`provider.ts:175-205`), dynamic registration is closed in
  production without an allowlist (`config.ts:148`, `index.ts:114-119`), per-org
  enablement is off by default, and Terraform sets the redirect allowlist to
  Claude's origins (`terraform/stack/main.tf:275-277`).
- **SEC-09, closed half.** The estate-wide walk is platform-admin only; members
  get their own organisation's verdict (`server/routes/c2c/actions.ts:807-832`;
  `server/routes/decision-lineage.ts:188-222`). Commits `f97d49331`, `f0209791a`.
- **P11-06, closed half.** Same as GTM-03 for role change and removal, plus SCIM
  removal audited in its transaction (`server/routes/scim.ts:416-440`).
- **SEC-23, closed half.** The `isDev && !token` user-1 bypass is gone from
  `server/routes/approval-workflow.ts`.

## Work, in order

### Stage 1 — First-run setup ends in sign-in, and compose can reach it (Phase 0 · S · engineering) — closes SEC-02

1. Re-confirm SEC-02 at the current head (statuses here are from 94b4f9238).
2. Failing first: in `server/routes/__tests__/setup.test.ts`, change the test
   "POST /initialize mints the bootstrap token as a registered session ...
   (P1-38)" to assert `res.body.token === undefined`, `res.body.next === 'sign_in'`
   and that `openSession` was not called. Add a test that a login immediately
   after setup returns `mfaRequired: true`. Run
   `npx vitest run server/routes/__tests__/setup.test.ts` and record the red.
3. `server/routes/setup.ts`: delete the `openSession` + `jwt.sign` block
   (about `:211-229`) and the now-unused `jwt` and `openSession` imports. Return
   `res.status(201).json({ success: true, next: 'sign_in', organization, user })`.
   The replacement for the bootstrap session is the normal sign-in at
   `POST /api/auth/login` (`server/routes/auth.ts`), which always issues the MFA
   challenge (`auth.ts:704-740`); name that path and `setup.test.ts` in the commit
   message, as the deletion rule requires. Update the module header (`:1-26`) and
   `terraform/stack/outputs.tf:121` to say "then sign in".
4. `docker-compose.yml` and `docker-compose.beta.yml`: add
   `SETUP_TOKEN: ${SETUP_TOKEN:?SETUP_TOKEN must be set (32+ characters) for first-run setup}`
   to the app service environment, and add `SETUP_TOKEN` to the "Required .env"
   header list (`docker-compose.yml:18-23`). Update the operator note at
   `docker-compose.yml:27-29` to show the `X-Setup-Token` header.
5. `scripts/ci/check-compose-boot-contract.mjs`: add a rule that a
   `NODE_ENV=production` app service must carry `SETUP_TOKEN`. Run
   `npm run ci:compose-boot-contract` before step 4 and record it failing, then
   passing.
6. Optional (P3): make the gate durable. Keep the user count and also refuse
   when any `organization_users` row with role `admin` has ever existed, or
   record completion in an existing settings row in the same transaction. Add a
   test that deleting every user does not reopen setup.

**Acceptance**

- `setup.test.ts` asserts a 201 from `/initialize` carries no token; red on
  HEAD, green after. The existing token-gate and concurrency tests still pass.
- A login right after setup returns `mfaRequired: true`.
- `ci:compose-boot-contract` fails on a compose app service without
  `SETUP_TOKEN` (shown failing first), then passes on both compose files.
- On a compose stack started with `SETUP_TOKEN` set, `POST /api/setup/initialize`
  with the header returns 201; without it, 403.

### Stage 2 — Legacy `/api/projects` writes: role gate and attributable, in-transaction audit (Phase 3 · S · engineering) — closes SEC-06

1. Re-confirm SEC-06 at the current head (statuses here are from 94b4f9238).
2. Failing first: add `server/routes/__tests__/projects-management-governed-writes.test.ts`,
   modelled on `server/routes/__tests__/device-projects-delete-ownership.test.ts`.
   Cases: (a) a viewer gets 403 on `POST`, `PATCH` and `DELETE` and nothing
   changes — `POST` and `PATCH` return 2xx at HEAD; (b) an editor `DELETE` of a
   drafts-only project writes one `audit_logs` row whose `actor_id` is the
   session user and whose chain fields are set; (c) with `writeChainedAuditRow`
   forced to throw, `DELETE` returns 500 and the project row still exists. Record
   the red.
3. `server/routes/projects-management.ts`: import `requireEditorAccessForWrites`
   and `governedActorId` from `../middleware/orgMembership` (line 11 already
   imports `requireEditorAccess`). Add `router.use(requireEditorAccessForWrites);`
   directly after `const router = Router();` (line 38). `GET` stays open to viewers.
4. `DELETE` (`:341-431`): read `const actorId = governedActorId(req)` before the
   transaction and answer 401 when it is null. Inside the `db.transaction` at
   `:369`, after `tx.delete(...)`, call
   `writeChainedAuditRow(queryableFromDrizzle(tx), { tenantId: organizationId, userId: actorId, action: 'project_delete', resourceType: 'project', resourceId: String(projectId), details: { oldValues: existingProject, reason: 'Project deleted' } })`
   (`server/services/auditService.ts:269`). Delete the post-commit `auditEvents`
   insert and its swallowed catch (`:383-414`).
5. `PATCH` (`:433-520`): wrap the UPDATE and a `writeChainedAuditRow`
   (action `project_update`, `userId: governedActorId(req)`, details
   `{changedFields, oldValues, newValues}`) in one `db.transaction`. Add
   `and(eq(projects.id, projectId), eq(projects.organizationId, organizationId))`
   to the UPDATE's where-clause. Remove the swallowed insert at about `:466-501`.
6. `POST` (`:153-330`): replace the swallowed catch at `:312` with the same
   chained write, in the same transaction if `atomicCreateProject`
   (`server/services/atomicQuotaService.js`) can take a client; otherwise answer
   500 with `auditTrail: { persisted: false }`. Never return 201 silently.
7. Extend `scripts/ci/check-regulated-delete-audit.mjs` to refuse an audit insert
   in a delete handler whose user field is the literal `null`. Show its selftest
   failing on `projects-management.ts:391` before step 4.
8. Out of scope here, recorded for MR-14/MR-05: a drafts-only delete still
   hard-cascades non-governed children (tasks, review threads, `report_os_*`)
   with no legal-hold check. Do not widen this stage to fix it.

**Acceptance**

- A viewer gets 403 on `POST`, `PATCH` and `DELETE /api/projects` (red first:
  2xx for `POST` and `PATCH` at HEAD).
- Every successful project create, update and delete has exactly one chained
  `audit_logs` row carrying the session user id, written in the same
  transaction; a forced audit failure leaves the project unchanged and returns
  500.
- `ci:regulated-delete-audit` fails on a null-user delete audit (selftest shown
  red) and passes after the fix.

### Stage 3 — QMS supplier approval and NC disposition become signed governed writes (Phase 3 · M · engineering) — closes SEC-05

1. Re-confirm SEC-05 at the current head (statuses here are from 94b4f9238).
2. Failing first: add `server/routes/__tests__/mdx-qms-supplier-nc-signed.test.ts`.
   Supplier cases: (a) editor `PATCH /api/mdx/qms/suppliers/:id {approvalStatus:'approved'}`
   returns 422 and the row is unchanged (200 at HEAD); (b)
   `POST /qms/suppliers/:id/approval` with no password returns 4xx and writes
   nothing; (c) with a valid signature it returns 200, writes one signature row
   and one chained `audit_logs` row, and `approval_status` is `approved`; (d)
   with the audit insert forced to throw it returns 500 and `approval_status` is
   unchanged. Write the same four cases for NC disposition, plus a fifth:
   re-dispositioning a dispositioned NC returns 409. Record the red.
3. `server/routes/mdx-qms.ts:873-886`: remove `approvalStatus` and
   `approvalDate` from `supplierCreate` (and so from `supplierPatch`, which is
   `supplierCreate.partial()`), and drop them from the `PATCH` COL map at `:950`.
   `POST /qms/suppliers` (`:906`) inserts the literal `'pending'` in place of
   `COALESCE($6,'pending')`. A body that still carries `approvalStatus` gets 422
   `SUPPLIER_STANDING_REQUIRES_SIGNATURE`; do not ignore it silently.
4. Add `POST /qms/suppliers/:id/approval` with body
   `{approvalStatus, reason, meaning, password, totp?}`, copying the
   `/qms/changes/:id/approve` handler (`:1482-1524`): `getUserId`,
   `verifyApprovalSigner(res, userId, orgId, body)` (`:556`), `pool.connect`,
   `BEGIN`, then a new `approveQmsSupplierSigned(client, {...})` in
   `server/services/qms/supplier-approval-signature.ts`, modelled on
   `approveQmsChangeSigned` (`server/services/qms/change-approval-signature.ts:157`).
   Inside the transaction it updates `qms_suppliers` (`approval_status`,
   `approval_date = now()`, scoped by `id`, `organization_id`, `deleted_at IS NULL`;
   404 when no row), persists the signature through the same persistence
   `approveQmsChangeSigned` uses, and writes the chained audit row on the same
   client. `COMMIT`; `ROLLBACK` on any throw.
5. Replace `PATCH /qms/nonconforming/:id/disposition` (`:1216-1240`) with a
   signed `POST /qms/nonconforming/:id/disposition` using the same ceremony.
   Refuse with 409 when disposition is no longer `pending` unless the body
   carries `reopen: true` and a reason. No client calls the `PATCH` (client/src
   calls only `mdx/qms/{documents,changes,templates,training}`), so removing it
   removes no user-facing capability; name the new `POST` route and the new test
   file in the commit message as the replacement.
6. `PATCH /qms/internal-audits/:id` (`:1051`) when status moves to `completed`,
   and `POST /qms/management-reviews` (`:1120`): at minimum, wrap the write and
   a `writeChainedAuditRow` (`server/services/auditService.ts:269`) in one
   `pool.connect` transaction in place of `recordAuditRow` after commit.
7. Minor: training-ack (`:757`) accepts a self-reported `quizScore` from the
   body. Leave it for MR-12 (QMS training) unless the fix is a one-liner there.
8. Run `npm run ci:sign-ceremony` and `npm run ci:discarded-audit-write`. The
   new routes pass, and both baselines shrink, not grow.

**Acceptance**

- A viewer and an editor both get 422/403 when they change supplier
  `approval_status` or NC disposition through the unsigned routes, and the row
  is unchanged (red first: 200 at HEAD).
- The signed routes return 200 only with a verified signature, write a
  signature row and a chained `audit_logs` row in one transaction, and roll back
  completely when the audit write fails.
- Re-dispositioning a dispositioned NC returns 409.
- `ci:sign-ceremony` passes with no new baseline entries.

### Stage 4 — Every access grant and suspension lands on the tenant's own chain (Phase 3 · M · engineering, optional half needs a founder decision) — closes P11-06

1. Re-confirm P11-06 at the current head (statuses here are from 94b4f9238).
2. Failing first: extend the `server/routes/__tests__/tenant-users-audit.test.ts`
   pattern to the new paths and add cases to `tests/db/admin-change-audit.dbtest.ts`:
   (a) a platform suspend writes a row on each of the member's organisations'
   chains and appears in the Administrative changes report; (b) with
   `writeChainedAuditRow` forced to throw, `users.status` is unchanged and the
   route answers 500; (c) creating a member and accepting an invitation each
   write one chained `member_added` row, and a forced audit failure leaves no
   `organization_users` row. Record the red.
3. Platform suspension, `server/routes/admin/master-admin.ts:408-460`
   (`PATCH /users/:id/status`): run `SELECT status ... FOR UPDATE`, the
   `UPDATE users` and the audit inside one `transaction(async client => ...)`
   (`server/db/runtime.ts`). Write `writeChainedAuditRow(client, ...)` for tenant
   0 and one chained row per organisation the user belongs to
   (`SELECT organization_id FROM organization_users WHERE user_id = $1`), each
   inside that organisation's verified scope (`inVerifiedOrgScope` /
   `runWithTenantScope`) so RLS admits it. Actions `member_suspended` /
   `member_reinstated`, details `{from, to, reason, actorScope: 'platform'}`.
   Audit failure rolls back and returns 500. After commit, call
   `invalidateOrgMembershipCache(id)`.
4. Add the action constants to `server/services/tenant/membership-change.ts`
   and to the action lists in
   `server/services/audit/compliance-reports/queries/administrative-changes.ts`
   (`:66-67`) and `access-review.ts` (`:17`).
5. Membership grants, `server/services/atomicQuotaService.js`: in
   `atomicCreateUser` (`:165-330`, INSERT at `:316`) and `atomicAcceptInvitation`
   (`:364-440`, INSERT at `:422`), before COMMIT, write a chained row on the same
   client: action `member_added`, resourceType `organization_users`, resourceId
   the user id, details `{targetUserId, previousRole: null, newRole, via: 'direct_invite' | 'invitation_accept', invitationId?, invitedBy?}`.
   Import `writeChainedAuditRow` the way the file resolves its other server
   imports. An audit failure rolls the membership back. Keep the post-commit
   invite log in `server/services/tenant/invitation-delivery.ts:120-139` only if
   it records something the new row does not; otherwise delete it (zero
   duplication).
6. Optional, only if the founder adopts tenant-level suspend (see Founder
   decisions): add `suspended_at TIMESTAMPTZ`, `suspended_by INTEGER` and
   `suspension_reason TEXT` to `organization_users` in a new additive migration
   (`ADD COLUMN IF NOT EXISTS`), inserted in `C2C_MIGRATION_FILES` before the
   final tenant-sweep pair (`ci:migration-set-order`). Treat a suspended
   membership as non-member in the `server/middleware/orgMembership.ts` lookup
   (fail closed, 403). Add `suspendMember` / `reinstateMember` to
   `membership-change.ts` with an in-transaction chained row, a
   `PATCH /api/tenant-users/:organizationId/:userId/status {status, reason}`
   route with `requireAdmin`, the self-change refusal and the last-administrator
   guard, and a Suspend action in
   `client/src/concept2cure/v2/surfaces/AdminMemberActions.tsx`.
7. Known residual, not fixed here: membership-cache revocation is per instance;
   other instances converge within the 60 s TTL
   (`server/middleware/orgMembership.ts:26-28,45`). It closes when MR-03 brings
   Redis (SEC-08) and the cache is invalidated through it.

**Acceptance**

- A platform suspend or reactivate writes exactly one chained `audit_logs` row
  in each organisation the user belongs to, plus tenant 0, in the same
  transaction, carrying from, to, reason and actor. With
  `writeChainedAuditRow` forced to throw, the route returns 500 and
  `users.status` is unchanged. Red on HEAD.
- Creating a member and accepting an invitation each write one chained
  `member_added` row before COMMIT; a forced audit failure leaves no
  `organization_users` row. Red on HEAD.
- The rows appear in the organisation's signed audit export and in the
  Administrative changes and Access review reports.
- If tenant suspend is adopted, the suspended member's next request on the same
  instance returns 403.

### Stage 5 — The MCP connector applies tenant lifecycle, refresh-reuse detection and fresh consent (Phase 3 · M · engineering) — closes SEC-07

1. Re-confirm SEC-07 at the current head (statuses here are from 94b4f9238).
2. Failing first: extend `server/mcp/__tests__/mcp-account-standing.dbtest.ts`:
   (a) `organizations.status = 'pending_deletion'`: read tools succeed and
   `c2c_file_draft_for_review` is refused with the posture reason (it succeeds
   at HEAD); (b) status `inactive`: `/mcp` answers 401; (c) `payment_status`
   `past_due`: the governed write is refused; (d) rotate a refresh token, then
   present the old one: `invalid_grant`, and the newly issued refresh token is
   refused too; (e) two concurrent exchanges of one refresh token: exactly one
   succeeds. Add a consent test that the rendered page no longer reads
   localStorage, or that a stale session token is refused. Add a test that a
   forced chained-audit failure on `c2c_file_draft_for_review` leaves no leaf.
   Record the red.
3. Lifecycle on the bearer: in `server/mcp/auth/platform-token.ts`
   `verifyPlatformBearer` (`:213-245`), after the enablement check at `:224`,
   call `getTenantAccessPosture(organizationId)`
   (`server/services/tenant/tenant-lifecycle.ts:354`). On `null`, throw
   `ServerError('Organization status could not be verified. Try again.')` (fail
   closed). On `decision === 'deny'`, throw `InvalidTokenError(posture.reason)`.
   Add `tenantDecision: 'allow' | 'read_only'` and `tenantReason: string | null`
   to `McpPrincipal` (about `:75`) and set them. The consent POST
   (`consent.ts:152`) is covered because it goes through `verifyPlatformBearer`.
4. Write refusal: in `server/mcp/tools/runtime.ts` `registerTool`, next to the
   governed role check at `:226`, refuse any tool whose
   `spec.annotations.readOnlyHint === false` (which covers every `spec.governed`
   tool) when `principal.tenantDecision !== 'allow'`. Return
   `refused(principal.tenantReason)` and `writeAudit(... outcome 'denied')`,
   exactly as the scope refusal does.
5. Lifecycle on `/token`: in `server/mcp/auth/provider.ts`
   `liveGrantorMembership` (`:175-205`), after `findGrantMembership`, read the
   same posture; throw `InvalidGrantError(reason)` on `deny` and `ServerError` on
   `null`.
6. Refresh reuse detection: (a) `server/mcp/auth/store.ts` `revokeRefreshToken`
   (`:357-366`) returns `(result.rowCount ?? 0) === 1`. (b) Add
   `store.revokeRefreshFamily(token)`, which inside `inGrantTenant` runs a
   `WITH RECURSIVE` over `mcp_oauth_refresh_tokens.rotated_from` (the column
   exists: `migrations/20260920_mcp_oauth.sql`, `store.ts:300`) to collect
   ancestors and descendants of `sha256Hex(token)` and sets `revoked_at = now()`
   on all of them. No migration is needed. (c) In
   `provider.exchangeRefreshToken`: when `stored.revoked` (`:132`), call
   `revokeRefreshFamily`, log a security event (`logger.warn` with clientId,
   userId, organizationId) and throw `InvalidGrantError`; when
   `store.revokeRefreshToken(refreshToken)` at `:144` returns false, call
   `revokeRefreshFamily` and throw `InvalidGrantError` before `issueTokens`.
7. Consent re-authentication: in `server/mcp/auth/consent.ts`, delete the
   localStorage shortcut at `:103-104` so the login form, with its MFA step,
   always renders. If that breaks an existing flow, the alternative is: in
   `consentHandler` (`:132+`) refuse a platform token whose session start
   (`sessionStartSecondsOf`, `server/services/session-inactivity.ts:159`) is more
   than 300 s old and re-render the login form with "Sign in again to authorise
   this connection." Pick one; do not ship both.
8. Atomic governed write: give `upsertLeaf`
   (`server/services/submission-service/submission-service.ts:2878`) an optional
   pg client parameter. In `server/mcp/tools/governed.ts`, open `pool.connect`,
   `BEGIN`, call `upsertLeaf` with the client and `writeChainedAuditRow` with the
   same client, then `COMMIT`. Return `refused(...)` and `ROLLBACK` when the
   chained row fails, in place of the "audit NOT persisted" flag that
   `runtime.ts:249` `writeAudit` raises today. Every existing `upsertLeaf` caller
   keeps working without a client (one implementation, not a parallel MCP copy).

**Acceptance**

- On `/mcp`, a token of an org in `pending_deletion`, `past_due`, `unpaid` or
  `canceled` runs read tools and is refused on every write tool; an org in
  `inactive`, `purged`, `deleted` or an unrecognised status gets 401 /
  `invalid_grant` on `/mcp` and `/token`. Red at HEAD, green after.
- Presenting a rotated refresh token revokes its whole family; two concurrent
  rotations of one token yield exactly one success.
- The consent page requires a fresh sign-in with MFA.
- A forced audit failure on `c2c_file_draft_for_review` leaves no leaf.

### Stage 6 — On-demand chain verification is bounded and tenant-local (Backlog · S · engineering) — closes SEC-09

1. Re-confirm SEC-09 at the current head (statuses here are from 94b4f9238).
2. Failing first, in `server/services/audit/__tests__/chain-head-on-demand.test.ts`
   next to the IAM-26 block (`:342`): (a) the seventh request from one org within
   the window gets 429; (b) a tenant whose row count exceeds `maxRows` gets 503
   and the walk's row SELECT is never issued (assert on the mocked client's
   query log); (c) a non-admin in a tenant with legacy rows causes no query with
   `tenant_id IS DISTINCT FROM`. Record the red.
3. Limiter: put a per-organisation limiter in front of
   `router.get('/verify-chain', ...)` at `server/routes/c2c/actions.ts:799`, built
   with `createRedisRateLimiter` (`server/middleware/redisRateLimiter.ts:521`),
   `perOrganization: true`, one rule (6 requests per 10 minutes per org);
   platform admins get their own small allowance. Wire the same limiter on
   `server/routes/decision-lineage.ts:227`.
4. Ceiling: add `maxRows?: number` to `VerifyAuditChainOptions`
   (`server/services/audit/chain.ts:629-632`). In `readChainRows` (`:634`), run a
   `SELECT count(*)` with the same WHERE first and throw a new
   `AuditChainTooLargeError` when it exceeds `maxRows`. Pass `maxRows` through
   `verifyTenantChainOnAdminScope` (`server/services/audit/tenant-chain-verdict.ts:77`)
   from `actions.ts:808` and `decision-lineage.ts` `chainVerdictFor` (`:203`),
   using `AUDIT_CHAIN_ON_DEMAND_MAX_ROWS` (default 250000). Map the error to 503
   `{ error: 'AUDIT_CHAIN_TOO_LARGE_FOR_ON_DEMAND', detail: 'The daily integrity sweep is the authoritative verdict for a chain this size.' }`.
   Never return a partial verdict or `ok: true`.
5. Legacy context: keep the cross-tenant legacy read (`chain.ts:687-700`) for
   platform admins only. For a non-admin whose tenant has legacy rows, return
   the latest daily-sweep verdict for that org (recorded by
   `server/jobs/auditChainIntegritySweep.ts`) or 503 "verify on the operator
   path".

**Acceptance**

- Each new test fails at HEAD and passes after; the four existing IAM-26 tests
  still pass.
- A viewer's seventh request in the window returns 429. An over-ceiling tenant
  returns 503 `AUDIT_CHAIN_TOO_LARGE_FOR_ON_DEMAND`, never `ok: true`. A
  non-admin request issues no cross-tenant SELECT on `audit_logs`.
- The limiter holds across ECS tasks only once MR-03 provisions Redis (SEC-08);
  until then record it as per-task in the evidence.

### Stage 7 — Retire the residual side gates: local JWT re-verifiers, the `/api/v1` double gate and the dormant Submission Center router (Backlog · S · engineering) — closes SEC-23, SEC-24, SEC-25

1. Re-confirm SEC-23, SEC-24 and SEC-25 at the current head (statuses here are
   from 94b4f9238). SEC-24 was not re-checked in the light pass: settle it by
   confirming whether the `/api/v1` allowlist still exists in both
   `server/bootstrap/register-platform-routes.ts:245-278` and
   `public-api-allowlist.ts`, and by the route-enumeration test in step 4. If
   only one gate remains and the test passes, record SEC-24 as fixed with that
   evidence.
2. SEC-23: in `server/routes/approval-workflow.ts:40`, delete the local
   `verifyJwtWithRotation` re-verification and read the principal from
   `req.user` as set by the boundary. Do the same for the other local
   re-verifiers the audit named at basis — `contentAssembly.routes.ts:27`,
   `fieldSync.routes.ts:98`, `cortex-unified.ts:1199` — after re-confirming each
   still exists; skip any that MR-14 has already removed. Where `optionalAuth`
   uses the lenient `nonAccessTokenReason`, switch it to the access-token check
   used by the boundary. Failing first: a test that a revoked access token, or a
   token of a user no longer in the org, gets 401/403 on one of these routes
   (it passes the local verifier at HEAD).
3. Extend `ci:no-dev-auth-in-prod` to flag a `NODE_ENV`-only dev-auth branch,
   the shape SEC-23 found in `approval-workflow.ts`. Show its selftest catching a
   constructed `isDev && !token` fixture before reporting it works.
4. SEC-24: delete the redundant second `/api/v1` gate, keeping one allowlist as
   the single source. Add a test that enumerates every route registered under
   `/api/v1` (both routers sharing the prefix, including `pyramid.routes.ts`) and
   asserts each carries `authenticateToken` or an API-key guard. Show it failing
   on a constructed unguarded route first.
5. SEC-25: delete `server/routes/submissionCenter.routes.ts` and its import and
   commented mount at `server/bootstrap/register-governance-routes.ts:9,64`. It
   is unmounted, so no user-facing capability is removed; Submission Center is in
   the launch catalog and is served by the `/api/submissions` routes. Run
   `git log --all --diff-filter=D -- 'server/routes/*ubmission*'` first, and name
   in the commit message the file that mounts `/api/submissions` and the test or
   CI gate that proves it reachable.

**Acceptance**

- A revoked or de-membered access token is refused on every route that used a
  local re-verifier (red first).
- `ci:no-dev-auth-in-prod` catches the `NODE_ENV`-only fixture (shown failing
  first).
- The `/api/v1` guard test fails on a constructed unguarded route and passes on
  the real route table; one allowlist remains.
- `submissionCenter.routes.ts` is gone, the build and route tests pass, and the
  commit names the `/api/submissions` replacement and its gate.

## Definition of done

- No write route on `/api/projects`, `/api/mdx/qms`, platform admin or
  `/mcp` admits a viewer or a read-only or denied tenant, each shown by a test
  that was red at the head where the stage started.
- Supplier approval, NC disposition, internal-audit completion and management
  review, project create/update/delete, member grant, invitation acceptance and
  platform suspension each write one chained, attributed audit row in the same
  transaction as the change, and roll back when it fails.
- First-run setup returns `next: 'sign_in'` and no token, and both compose
  stacks reach it with `SETUP_TOKEN`.
- `ci:sign-ceremony`, `ci:discarded-audit-write`, `ci:regulated-delete-audit`,
  `ci:compose-boot-contract` and `ci:no-dev-auth-in-prod` pass with baselines
  that shrank, each new rule shown failing first.
- Every finding in this order has `statusAtHead` FIXED or REFUTED in
  `docs/work-orders/MR-findings-2026-10-13.json`, with the closing commit.

## Founder decisions this order needs

- **NEW: tenant-level suspend.** Does the pilot need tenant administrators to
  suspend a member, rather than remove them? Removal already revokes access with
  a chained audit row. Recommended: no for the pilot; yes before enterprise GA.
  Blocks only the optional step 6 of stage 4.
- **F-11 (QMS positioning).** If the pilot is the "controlled SOP register with
  signed approval and training", supplier and NC decisions stay off the pilot
  path and stage 3 is a GA item for medtech buyers, as phased here. If the
  founder sells QMS more broadly, move stage 3 into Phase 2.
- **F-12 (signing roles and segregation of duties).** Stage 3 reuses
  `verifyApprovalSigner`; whichever approver/qa roles F-12 adopts in MR-06 apply
  to supplier approval and NC disposition with no further work here. It does not
  block stage 3.
- **F-13 (second factor for signers and admins)** is what makes stage 1's
  "sign in after setup" an MFA-protected admin session. Already decided; no
  block.

## Do not

- Do not "fix" the unsigned supplier or NC routes by hiding them in the client:
  no client calls them today, which is exactly why the server must refuse.
- Do not add a second, MCP-only `upsertLeaf` or a second signature ceremony for
  suppliers; extend the existing `upsertLeaf` and copy the
  `approveQmsChangeSigned` pattern into a sibling service that shares its
  signature persistence.
- Do not keep `recordAuditRow` after commit as a "belt and braces" second
  write beside the new in-transaction chained row; one audit row per act.
- Do not return a partial or `ok: true` verdict when the on-demand chain walk
  hits its ceiling, and do not let a missing tenant posture admit a request on
  `/mcp`: both fail closed.
- Do not add the tenant-suspend columns by any route other than a new additive
  migration placed before the final sweep pair, and do not append a DROP to
  undo them; amend the creating migration in place with a dated header note if
  they must go (Rule 1).
- Do not delete `submissionCenter.routes.ts` or the `/api/projects` `PATCH`
  without naming the reachable replacement and its gate in the commit message.

## How to run this order

- Claim it with one line in `docs/work-orders/README.md` §0 before starting; release it when you stop.
- Commit to `concept2cure-v2` only; merge, never rebase.
- Show each acceptance check failing on the current code before the fix, then passing; file that evidence under `docs/evidence/MR-07/<date>/`.
- When a finding closes, update its `statusAtHead` in `docs/work-orders/MR-findings-2026-10-13.json` with the closing commit.
