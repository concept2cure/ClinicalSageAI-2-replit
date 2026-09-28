## Security-gaps lens — 2026-09-28, HEAD `232ecae9c`

### Most severe first

**GS-S-1 (High) — MCP connector's one governed write is a second door around today's `writeRoleRefusal` fix**
`server/mcp/tools/governed.ts:53` (`c2c_file_draft_for_review`) calls `submission-service.upsertLeaf` directly — never through `AnaToolExecutor.ts`'s `getToolHandler`/`registerToolHandler` map, so the same-day fix `writeRoleRefusal` (`server/services/ana/AnaToolExecutor.ts:390-404`) never runs for it, even though `place_into_sequence` — the chat tool that reaches the identical `submission_leaves` write — is class `confirm` and is gated by it (`tool-authorization.register.json:2624-2627`). The MCP wrapper (`server/mcp/tools/runtime.ts:169-246`) checks only OAuth *scope*, never `organization_users` role; `server/mcp/auth/consent.ts` grants scope with no role check; and `resolveScopes` (`server/mcp/auth/platform-token.ts:100-102`) hands a first-party session token (an ordinary user's own login JWT) **every** connector scope, by design. `upsertLeaf` itself does no RBAC — the equivalent REST route supplies it via `requireRole(AUTHOR)` (`server/routes/document-lifecycle.ts:163`). Net effect: a viewer-role org member, via their own session token against the MCP endpoint, can create a governed leaf placement that both the chat and HTTP paths for the same write refuse them for. Untested: `server/mcp/__tests__/mcp-connector.dbtest.ts` only ever uses an `admin` principal. 21 CFR 11.10(d); regression-adjacent — it defeats the intent of `41e7c539f` (same-day fix) for one specific write, not a regression of a previously-closed item. Fix: check the principal's live `organization_users` role against `GOVERNED_WRITE_ROLES` inside `registerTool`/`governed.ts` for any `governed:true` tool, or route the MCP tool through `getToolHandler('place_into_sequence')` so it inherits the AnA gates.

**GS-S-2 (Medium, accepted-debt, unchanged) — DP-02's 23 sign-ceremony writers, read individually**
`npm run ci:sign-ceremony` / `--list`: exactly 23 non-ceremonied sites, matching `scripts/ci/sign-ceremony-baseline.json` byte for byte — no new site, no drift. 21 of 23 are outside the launch catalog (CMC, research-administration, IACUC/IBC/IRB, RIM, biopharma) with written DEFECT reasons, unchanged. The two launch-catalog-adjacent "proof across a boundary" entries were individually re-read at HEAD: `server/routes/510k-estar-routes.ts:2043-2086` → `advanceEstarSubmission` (its only importer) runs `verifyReauth` first; `server/routes/mdx-submission-gateway.ts:195-248` and `server/services/ana-ri/mdx-command-handlers.ts:724-853` (the AnA caller of the same `executeGovernedTransmit`) both derive `reauthVerifiedAt` from a real re-authentication, never `new Date()`. Both hold correctly at HEAD; no regression.

**GS-S-3 (Low, accepted-debt, unchanged) — IAM-02 residual: connector bearer verification skips revocation/status**
`server/mcp/auth/platform-token.ts` `verifyPlatformBearer` (lines ~110-133) still checks neither a revocation list nor `users.status`; confirmed by grep (no matches for revocation/status logic in the file). Unchanged from baseline; exploitable only where `MCP_ENABLED=true` (row D8).

### P1-22 legal-hold routes — re-verified, still closed, no second door found
`server/routes/vault-legal-holds.ts` (place/lift/list, mounted behind `authMiddleware` at `server/bootstrap/register-inline-routes.ts:873-875`) is the only writer of `vault.legal_holds`; role-gated to `AUDIT_READER_ROLES ∪ platform-admin`, org-scoped via `authedOrgId`, target-ownership checked (`targetOwned`), each write is one transaction with `writeChainedAuditRow` and rolls back on audit failure. The retention sweep (`server/jobs/retentionCron.ts:164-228`) fails closed if the hold table can't be read and checks holds before any delete. The tenant-offboarding purge (`server/services/tenant/tenant-offboarding.ts:431-457,536`) refuses inside its own transaction when an active hold exists. No AnA tool, MCP tool, or second route was found writing `vault.legal_holds` or deleting `vault.documents` outside these paths (grepped the whole `server/` tree and the AnA tool directory for `legal_hold`/`retention`/hard-delete patterns). This item is genuinely closed, not merely documented as closed.

### IAM-02/03/05 — re-verified, still closed, no regression
- **IAM-03 (SAML):** `server/routes/sso.ts` — `getSamlConfig` no longer falls back to the default IdP for an unconfigured slug (`orgSlug !== DEFAULT_SAML_ORG_SLUG → null`); `resolveOrgIdForSlug` throws rather than defaulting to org 1; `SamlUserNotInOrganisationError`/`SamlAccountInactiveError` refuse an assertion whose account isn't a member of the config's own org or isn't active; every branch calls `recordAuthEvent`. `server/middleware/requirePlatformAdmin.ts:44-53` excludes the SAML provider from the platform-admin email allowlist. All hold.
- **IAM-05 (SCIM):** `server/routes/scim.ts` — `POST /Users` no longer resets `status`/`name` for an existing account it is only adding a membership to (comment at line ~636 names IAM-05 explicitly); `PUT /Users/:id` distinguishes sole-org (full replace) from shared-account (membership-scoped, refuses a rename via `SHARED_NAME_DETAIL`) correctly. `signature-persistence.ts` uses a signer-name snapshot, not a live global join. Holds.
- **IAM-02 residual:** confirmed still open (GS-S-3 above), unchanged size/direction.

### Gate table (this session, read-only)
| Gate | Result | Baseline size / direction |
|---|---|---|
| `ci:sign-ceremony` | OK | 23 sites, unchanged |
| `check:security-patterns` | OK | 0 violations, unchanged |
| `ci:gateway-bypass` | OK | 8 baselined sites, unchanged |
| `ci:org-path-param-guards` | OK | 43 routes, 43 guarded / 0 not, unchanged |
| `ci:jwt-verify-pinned` | OK | every production call pins an algorithm |
| `ci:tenant-entry-points` | OK | 14 entry points, 9 unclassified-tolerated, unchanged |
| `ci:no-dev-auth-in-prod` | OK | 0 |
| `ci:unauthenticated-fetch` | OK | 70 scanned, 0 baselined, unchanged |
| `ci:discarded-audit-write` | OK | 125 baselined / 56 files, unchanged |
| `ci:dead-audit-catch` | OK | 0 baselined, unchanged |

None of these gates catch GS-S-1: it is a cross-module authorization gap (MCP tool vs. AnA registry vs. HTTP route), not a lexical pattern any current gate scans for.

### Baseline ids re-verified as still closed
IAM-03, IAM-05 (both fully); P1-22/DP-20 (fully, including the offboarding-purge hold check); DP-02's two launch-catalog-adjacent entries (`estar-submission-service.ts`, `governed-transmit.ts`).

### Baseline ids re-verified as still open, unchanged
IAM-02 (parts a-c, revocation/status check absent from `verifyPlatformBearer`); DP-02 (21 non-launch-catalog sign writers, exact count unchanged at 23 total).

### Not re-opened / explicitly excluded
IAM-19 — excluded per task instruction (being fixed now).

---

**Covered.** Read and re-verified at HEAD (232ecae9c, concept2cure-v2): (1) P1-22 legal-hold routes end-to-end — server/routes/vault-legal-holds.ts (place/lift/list), its mount in server/bootstrap/register-inline-routes.ts:873-875, the retention sweep's hold check in server/jobs/retentionCron.ts:164-228, and the offboarding purge's hold guard in server/services/tenant/tenant-offboarding.ts:431-457,536 — and searched for any second writer of vault.legal_holds or any AnA/second-route path that deletes vault documents without consulting it. (2) DP-02: ran `ci:sign-ceremony`/`--list` to enumerate the exact 23 baselined non-ceremonied sign writers; individually re-read the two "proof across a boundary" entries that are launch-catalog-reachable (Submission Center/Readiness) — server/services/pathway-engines/estar/estar-submission-service.ts + server/routes/510k-estar-routes.ts:2043-2086, and server/services/submission-gateways/governed-transmit.ts + server/routes/mdx-submission-gateway.ts:195-248 + server/services/ana-ri/mdx-command-handlers.ts:724-853 — and confirmed both still gate re-authentication correctly. (3) IAM-02/03/05: re-read server/routes/sso.ts (org-slug resolution, membership binding, SamlAccountInactiveError/SamlUserNotInOrganisationError, recordAuthEvent calls), server/middleware/requirePlatformAdmin.ts (SAML-provider exclusion from the email allowlist), and server/routes/scim.ts (POST/PUT status handling, sole-org vs shared-account branching) — the 2026-09-25 fixes hold; confirmed IAM-02's residual (no revocation/users.status check in server/mcp/auth/platform-token.ts verifyPlatformBearer) is still open and unchanged. (4) Adversarially traced every caller of AnaToolExecutor.ts's registerToolHandler/getToolHandler/toolHandlers map, the preHandlerRefusal/writeRoleRefusal wrapper (lines 300-433), the CONDITIONAL_RULES table in tool-authorization.ts (checked each input-dependent class resolution for a governed-write role gap), and the one internal handler-to-handler chain (assemble_crl_premortem_artifact → author_docx_native at line 1278, ctx passed through unforged). Also read the whole MCP connector tool surface (server/mcp/tools/*.ts, server/mcp/index.ts, server/mcp/auth/platform-token.ts, consent.ts) since it is exactly the kind of "second door" the task named. Ran the read-only gates: ci:sign-ceremony, check:security-patterns, ci:gateway-bypass, ci:org-path-param-guards, ci:jwt-verify-pinned, ci:tenant-entry-points, ci:no-dev-auth-in-prod, ci:unauthenticated-fetch, ci:discarded-audit-write, ci:dead-audit-catch — all green at their existing baseline sizes, no regressions. No file was edited; git was used read-only (log/show/status). The local reference Postgres was not needed for this lens's findings (all reproducible by static reading) and was not touched.

**Not covered.** Did not re-read all 21 of DP-02's non-launch-catalog baselined sites (CMC, research-administration, IACUC/IBC/IRB, RIM, biopharma) line-by-line, since the task scopes this review to the six launch-catalog apps and those files carry written "outside the launch catalog" reasons already in the baseline — only spot-verified the two launch-catalog-adjacent ("proof across a boundary") entries. Did not exhaustively check every one of the ~60+ route files with a `router.delete` for a legal-hold bypass beyond the vault.documents-touching routes found by grep (mdx-vault.ts, c2c/project-vault.ts, c2c/projects.ts) — none contained a hard-delete of vault.documents, but a manual per-file audit of all delete routes across the repo was not performed. Did not run a live server, live KMS, staging, or the MCP OAuth flow end-to-end against the local reference Postgres to literally reproduce the viewer-role MCP write (GS-S-1) with a captured token and HTTP response; the finding is established by static code reading of the full call chain (auth → scope resolution → tool dispatch → service write) rather than execution. Did not re-audit IAM-19 per the task's instruction (being fixed now). Did not review client-side code for any of these four areas. Did not check GitHub branch protection/CI or Terraform for this lens (out of the security-gaps assignment's scope, which was routes/services only).

## Independent verification

Each finding went to three agents, each told to refute it through one lens: reachability, reproduction or intent. A finding is confirmed when two of the three could not. Low findings had one reproduction verifier.

### GS-S-1 — **confirmed** (2 of 3)

- **reach** — not real: Refuted under the REACHABILITY lens. The code-level claim is accurate, but no launch-catalog user can reach it in the production configuration.

1. The only mount is gated by a flag. `server/index.ts:120` reads `if (process.env.MCP_ENABLED === 'true') app.use(createMcpRouter());`, and `server/mcp/config.ts:128` makes the same strict `=== 'true'` comparison. Nothing turns it on by default.
2. No deployment source sets that flag. At head 59b0d8f9a, grepping for MCP_ENABLED/mcp_enabled across terraform/, .github/, helm/, deploy/, infra/, app.yaml, docker-compose*.yml, config/, .env* and Dockerfile.optimized returns nothing. The only MCP hits under terraform/ are CloudFront path routing (`terraform/modules/cloudfront/main.tf` plus its tftest). The flag is set only in tests: `mcp-connector.dbtest.ts:130`, `mcp-auth-contract.test.ts:22` and `mcp-client-registration.contract.test.ts:61-66`. This is already recorded: `docs/evidence/W2/2026-09-24-multi-task/audit-findings.json:510-541` says "MCP_ENABLED is never set, so the connector … is not mounted in production" and names shipping it at launch as an open founder decision. `docs/evidence/reviews/2026-09-24/security.md:25` also records "MCP is off unless MCP_ENABLED=true".
3. So in production, `/mcp`, `/authorize`, `/token` and `/register` do not exist. A viewer who sends their session JWT to `/mcp` hits no MCP handler, and `c2c_file_draft_for_review` cannot run.
4. Every mounted door to the same write is role-gated. The Submission Center REST route `server/routes/submissions.ts:934` (`PUT /sequences/:seqId/leaves`) uses `requireRole(AUTHOR)` and requires a governed reason. `document-lifecycle.ts:163` uses `requireRole(AUTHOR)`. AnA's `place_into_sequence` passes through `writeRoleRefusal`, confirmed at `server/services/ana/AnaToolExecutor.ts:390-409`, which checks `GOVERNED_WRITE_ROLES` at `:371-372`.

What I confirmed is true in code:
- `governed.ts:59` calls `upsertLeaf` directly.
- `runtime.ts:196-200` checks only `principal.scopes.includes(spec.scope)`.
- `platform-token.ts:100-102` gives a first-party (non-`mcp`) token all scopes.

This is a latent defect. It becomes a live high-severity bypass (a viewer could create a submission_leaves placement) at the moment `MCP_ENABLED=true` is shipped. It is not IAM-02 as recorded, which covers revocation, session and status only. Whoever flips the flag should fix it first.

Coverage: I read `governed.ts` in full, `runtime.ts:150-246`, `platform-token.ts:60-160`, `mcp/config.ts:1-140`, the `index.ts` mount, the `submissions.ts` leaf route and every `upsertLeaf` caller. I grepped every deploy/config tree for the flag and checked prior reviews for duplicates. I did not boot the server, did not execute the MCP dbtest with a viewer role, and did not check the database.

- **repro** — real: I reproduced this at head 59b0d8f9a. The finding is not recorded as open anywhere in docs/evidence/reviews/2026-09-2{4,6,8}/: nothing there mentions governed.ts, c2c_file_draft_for_review, or a role gate on the MCP connector. The 2026-09-28 security.md:16 covers only MCP calls routed through callAnaHandler/getToolHandler, which do pass the AnA wrapper.

Code trace:
(1) server/mcp/auth/platform-token.ts:114-115. A login access token carries no token_use:'mcp' claim, so tokenUse is 'platform' and resolveScopes (:100-101) returns every connector scope, c2c:file included. verifyPlatformBearer's only role-related check is findMembership (server/mcp/auth/store.ts:88-111). That checks that the membership exists and that the user and organisation are active. It does not look at the role.
(2) server/mcp/tools/runtime.ts:198. registerTool checks only principal.scopes.includes(spec.scope). Nothing reads principal.role or checks GOVERNED_WRITE_ROLES.
(3) server/mcp/tools/governed.ts:56-71. This calls submission-service.upsertLeaf directly and never goes through getToolHandler.
(4) submission-service.ts:1945-1951. upsertLeaf starts with the sequence lookup and the lock check. It has no RBAC.
(5) The database adds no role check either. The only policy on submission_leaves is tenant_isolation_policy, which is organisation-only. organization_users.role has no CHECK constraint, so 'viewer' is a valid role. auth.ts:383 maps viewer to no grants.
(6) The two sibling doors do refuse. REST PUT /sequences/:seqId/leaves (server/routes/submissions.ts:934) requires requireRole(AUTHOR). AnA's place_into_sequence is class 'confirm' (tool-authorization.register.json:2624-2627) and is refused by writeRoleRefusal (AnaToolExecutor.ts:390-404).

Live reproduction: I ran a scratch vitest outside the repo. It mocked only findMembership (role 'viewer'), resolveSignerOrgRole ('viewer'), auditService, and upsertLeaf/getSequence as spies. No database was touched and no repository files changed. I signed an ordinary {userId:'42', organizationId:'5', role:'viewer', type:'access'} JWT with activeJwtSecret() and passed it through the real verifyPlatformBearer, then called the real registerTool wrapper for the real fileDraftForReview.
- The principal came back as role 'viewer', scopes ["c2c:read","c2c:draft","c2c:file"], tokenUse 'platform'.
- The call returned success with the message "Draft leaf #777 filed at 2.5 ... Audit row persisted." upsertLeaf was called once with {organizationId:5, userId:42}.
- In the same run, getToolHandler('place_into_sequence') with the same viewer and humanConfirmed:true returned {"error":"Insufficient permissions: this change needs an editor role in this organization. Nothing was changed."} and upsertLeaf was not called.
Both tests passed.

Separately, the OAuth path also never checks the role. server/mcp/auth/consent.ts has no role reference, so a viewer can consent to c2c:file for a connector-issued token and reach the same write.

What this does not reach:
- I did not run the full HTTP transport with the real Postgres upsertLeaf, because that would commit rows outside BEGIN/ROLLBACK. The mocks stand in only for the membership lookup, the service write and the audit write. Everything that makes the decision (token verification, scope resolution, the scope gate and the tool's run()) was real code.
- The written leaf is a draft placement in an unlocked sequence. Freeze, sign and dispatch still need a Part 11 signature in the app. So the impact is an unauthorised governed record write, attributed to the viewer, not a submission.

- **intent** — real: I tried to refute this under the INTENT lens and could not. I read the code at head 59b0d8f9a.

(1) server/mcp/tools/governed.ts:53-92: the run() of c2c_file_draft_for_review calls submission-service upsertLeaf directly. It does not go through callAnaHandler/getToolHandler (runtime.ts:87-98), so it never reaches the registerToolHandler wrapper (AnaToolExecutor.ts:406-413). That wrapper is where writeRoleRefusal (AnaToolExecutor.ts:390-404) runs, and editorRoleRefusal (363-376) with it.

(2) server/mcp/tools/runtime.ts:169-246, registerTool: the only authorization after the principal is resolved is `principal.scopes.includes(spec.scope)` at line 202. Nothing there reads principal.role or GOVERNED_WRITE_ROLES. principal.role is passed only into runWithTenantScope, as RLS context (line 194).

(3) server/mcp/auth/platform-token.ts:100-102, resolveScopes: any token that is not token_use==='mcp', meaning a user's ordinary login access JWT, gets [...ALL_MCP_SCOPES], which includes c2c:file. verifyPlatformBearer (104-134) only requires that a membership row exists (findMembership). It records membership.role but does not check it.

(4) server/mcp/auth/consent.ts has no role check. It only renders scope descriptions.

(5) upsertLeaf has no RBAC of its own. The REST twin, PUT /sequences/:seqId/leaves at server/routes/submissions.ts:934, uses requireRole(AUTHOR). The comment at server/routes/document-lifecycle.ts:159-162 says explicitly that a viewer holds no regulatory-author grant and that leaf writes must be gated. AnA's place_into_sequence is class 'confirm' (tool-authorization.register.json:2624-2627), so writeRoleRefusal refuses it for a viewer.

(6) GOVERNED_WRITE_ROLES (server/middleware/orgMembership.ts:503-510) excludes 'viewer'. This is pinned by role-claims.test.ts:152.

I found no deliberate design decision behind the gap:
- Commit 41e7c539f frames the rule as covering "every handler and every way of reaching one", but only the AnA registry doors get it.
- The connector commits (0e83825ca, ab31dd333, fc5f5d31f) never mention role.
- docs/connector/DIRECTORY_SUBMISSION.md:53 relies on scope only ("Do not grant c2c:file to the reviewer account"), and that scope gets bypassed anyway for first-party tokens.
- The connector DB test (mcp-connector.dbtest.ts:56-57,136,144) seeds only 'admin'.

It is not already recorded as open. The only related entry is docs/evidence/reviews/2026-09-24/security.md:25 (IAM-02/03/05), which covers token minting, SAML and SCIM, not role enforcement on the governed MCP tool. The 2026-09-28 security.md DP-36 row says the MCP door "dispatches through the same wrapper". That is true for callAnaHandler tools, but it is exactly what governed.ts does not do.

Resulting failure: a user whose organization_users.role is 'viewer' presents their own login access token as the MCP bearer and calls c2c_file_draft_for_review. The call passes the scope check, and upsertLeaf creates a submission_leaves row in an unlocked sequence of their organization. Both the REST route and AnA refuse that same write for that same user. This breaks CLAUDE.md "zero duplication / one canonical rule" and Part 11 authority checks (§11.10(g)).

Mitigating factor: the connector is off unless MCP_ENABLED=true (server/mcp/config.ts:128). That lowers present exposure, but the connector is W7 launch scope. I did not execute a live DB reproduction; everything above comes from reading the dispatch path.

### GS-S-2 — **refuted** (0 of 3)

- **reach** — not real: GS-S-2 does not describe a defect. Its own failure text says there is no new site, no regression and no drift, and its proposed fix is "No action needed". I re-checked it at the checked-out HEAD (59b0d8f9a; the task names 232ecae9c) and it holds:
(1) `npm run ci:sign-ceremony` prints "OK — no new sign write without the ceremony. 23 baselined site(s) remain, exactly as baselined."
(2) In server/routes/510k-estar-routes.ts around lines 2048-2078, `verifyReauth(userId, reauth)` runs first. If it fails, the route returns 401 with `WWW-Authenticate: ReAuth required`. The signing method and second factor are recorded from what was actually verified. Only then is `advanceEstarSubmission` called, so the launch-catalog eSTAR boundary does re-authenticate before signing.
(3) The 23-writer population is already open as DP-02 in docs/security/SECURITY_AUDIT_2026-09-24.md:93 (item 2 of the verdict table), which is inside the 2026-09-24 recorded-open set. So even the accepted-debt part is not new.
Nothing here is a user-, auditor- or attacker-reachable failure beyond what is already recorded. I did not re-read the mdx-submission-gateway.ts or mdx-command-handlers.ts line ranges the finding cites. That would only bear on a failure the finding does not claim, and the default under uncertainty is not real.

- **repro** — not real: This is not a defect report. The "finding" says the accounting is correct and proposes "No action needed", and at head that holds. Checked at head 59b0d8f9a (the task named 232ecae9c; the tree has moved since).

1. `npm run ci:sign-ceremony` prints "OK — no new sign write without the ceremony. 23 baselined site(s) remain, exactly as baselined." There are no new sites and the population has not drifted.

2. The eStar filing path is correct. `advanceEstarSubmission` has one caller, `server/routes/510k-estar-routes.ts:2077`. When `status==='filed'`, that route first calls `verifyReauth(userId, reauth)` (lines 2055-2060) and returns 401 if it fails. It records `authenticationMethod` and `secondFactorVerified` from the factors that were actually presented (lines 2066-2072). I found no way to reach the signature write without re-authenticating.

3. The MDX gateway path is correct. In `server/routes/mdx-submission-gateway.ts`, `verifyReauth` runs at line 215 and `reauthVerifiedAt = new Date()` is set at line 224, after a successful check. That timestamp is the moment of verification, not an invented one. In `server/services/ana-ri/mdx-command-handlers.ts:753-754`, the handler takes `ctx.signoff?.verifiedAt` and refuses unless it is a valid Date. It then passes it to `executeGovernedTransmit` (line 839).

4. The underlying problem, 23 sign writers that skip `reverifySigner`, is already recorded as open DP-02 in `docs/security/SECURITY_AUDIT_2026-09-24.md:93` (§3.2 row 2). Under the task rules it is not new.

Nothing here fails for a user, auditor or attacker. What I covered: the gate run and the two call sites the finding calls launch-catalog-reachable. What I did not cover: I did not re-read the 21 non-launch-catalog baselined sites one by one; they are already open under DP-02.

- **intent** — not real: GS-S-2 does not report a defect. It restates DP-02, which is already open in docs/security/SECURITY_AUDIT_2026-09-24.md:93 (the verdict table, row 2, "23 HTTP-reachable 'sign' writers skip reverifySigner ... ci:sign-ceremony baseline 23"). The task rules say an item already open in the 2026-09-24 review is not new, and this one is. The finding's own conclusion is "No action needed", "no new site, no regression, no drift". I checked it at the checked-out head (59b0d8f9a). `npm run ci:sign-ceremony` prints "OK — no new sign write without the ceremony. 23 baselined site(s) remain, exactly as baselined." In server/routes/510k-estar-routes.ts, near lines 2040-2090, the handler calls verifyReauth(userId, reauth) and returns 401 on failure. It records the method actually verified ('password+totp' or 'password') and only then calls advanceEstarSubmission, so the boundary proof the baseline cites holds. Each of the 21 non-launch baseline entries is accepted debt with a written reason in scripts/ci/sign-ceremony-baseline.json. That is the documented, deliberate mechanism CLAUDE.md and the gate use for known exceptions. No file:line shows a failure a user, auditor or attacker would hit that is not already recorded. What I covered: the audit doc row, the gate output, and the eSTAR reauth ordering. I did not re-read mdx-submission-gateway.ts or mdx-command-handlers.ts. Whatever they contain, this finding would still not be a new defect.

### GS-S-3 — **refuted** (0 of 1)

- **repro** — not real: Checked at the actual HEAD, 59b0d8f9a. The brief said 232ecae9c; neither server/mcp/auth file changed between them in a way that affects this. The finding has two halves, and neither is a new, reproducible defect.

(1) The users.status half is refuted. verifyPlatformBearer (server/mcp/auth/platform-token.ts:106-133) calls findMembership (server/mcp/auth/store.ts:88-124). That query joins users and requires `u.status = 'active' AND COALESCE(o.status,'active') <> 'suspended'` (store.ts:103-108). Commit 53b5545db added this with the comment "a suspended or deactivated user ... is not a member for the connector's purposes". When the membership is null, the verifier throws InvalidTokenError('The token subject is no longer a member of the organisation') at platform-token.ts:113. The auditor's grep for the literal 'users.status' in platform-token.ts missed it because the check lives in store.ts.

Reproduced against the reference DB c2c_full inside BEGIN/ROLLBACK. I took an active member and ran the exact findMembership WHERE clause: it returned 1 row. After `UPDATE users SET status='suspended'` on that user, the same query returned 0 rows, so the verifier would throw. Rolled back; no data left. A suspended user's unexpired token does NOT authenticate to the connector.

(2) The revocation half is true but already recorded as open. No path under server/mcp/ calls isTokenRevoked or verifyLiveToken (server/services/token-revocation.ts:187,282). So after logout, a token that has not expired would still pass the connector while MCP_ENABLED=true. That is exactly IAM-02:
- docs/evidence/reviews/2026-09-24/security.md:25 (row 7, "still open")
- docs/evidence/reviews/2026-09-26/security.md:31 and :165 (register's "revocation/suspension gap")
- docs/evidence/reviews/2026-09-28/security.md:7
- server/services/session-inactivity.ts:436, which says "The connector's own verifier is IAM-02's."

Under the task rules this is not new.

Covered: platform-token.ts in full to line 200, findMembership in store.ts, jwtVerify.ts, the revocation and live-token calls in the REST middleware (server/middleware/auth.ts:179-226), a grep of server/mcp for revocation checks, the git log for the two MCP auth files, and the rolled-back DB reproduction of the status filter.

Not covered: a live MCP server (none was running), so the revocation half was established by reading the code, not by an HTTP request with a logged-out token.

