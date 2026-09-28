# Security lens — weekly run, 2026-09-26 (P1-18)

**Audited commit:** `1463b91a286335b5abe15dcfb15d37baaad3f5c4` (`concept2cure-v2`, merge commit dated
2026-09-26 12:25:33 +0000). `git status` clean at read time.

**Baseline register:** `docs/security/SECURITY_AUDIT_2026-09-24.md` (audited `adbf2d18`, 1 Critical / 23 High / 38
Medium / 22 Low net open, later annotated in place with tranche "closed by …" notes through 2026-09-26).
**Previous run:** `docs/evidence/reviews/2026-09-24/security.md` (same commit as the baseline; re-verified the ten
§3.2 items as all still open, sampled 11 mutation routes, found no second door added in 48h, raised DP-31/32/33).
**Remediation tranche under review:** `docs/security/REMEDIATION_AND_ENHANCEMENT_PLAN_2026-09-24.md`, evidence
`docs/evidence/D6/2026-09-24-p0/` and `docs/evidence/D6/2026-09-25-p1/`.

**Scope / method:** read-only; no file edited; no gate run with `write-baseline`. Every citation below was read at
HEAD in this session (not inherited from the register's own annotations, which were themselves treated as leads).
**Time box:** ~40 minutes, exceeded (see §5 for what that cost). Not verified by this session: a running server or
socket listener, a live database, branch protection / CI history via network (no `gh`, `--network` disallowed to
gates), any deployed AWS environment or KMS.

---

## 1. The ten §3.2 findings, re-verified at HEAD

| # | Id | State at HEAD | Evidence |
|---|---|---|---|
| 1 | IAM-01 | **closed** at the `/ana` namespace itself; **new residual reported as IAM-19** | `server/services/ana/ana-realtime.ts:208-260`: handshake reads `socket.handshake.auth?.token` only (no query fallback), calls `requireAccessTokenReason` (line 228) to refuse refresh/mfa_challenge/mfa_partial tokens, then `checkOrgMembership` (242) and `shouldProcessTenantInBackground` (249), fail-closed on indeterminate. This is a genuine fix of the exact defect IAM-01 named. **But**: unlike the main namespace (`server/socketServer.ts:199-221,377-379`, `startSessionRecheck`/`sessionEndReason` on a timer, `SOCKET_SESSION_RECHECK_MS`), `/ana` has no periodic re-check after `connection` (grep for `setInterval`/`sessionRecheck`/`session:ended` in `ana-realtime.ts`: zero hits). A duplex chat session is explicitly designed to "stay open" (file header, lines 1-16); logout, password change, org-membership removal or tenant suspension during an open `/ana` socket does not end it, so the governed tool loop keeps running under a session the rest of the platform has already ended. See IAM-19 below. |
| 2 | DP-02 | **still open** | `npm run ci:sign-ceremony` at HEAD: "23 baselined site(s) remain, exactly as baselined." Not individually re-read this session beyond the gate (time box); the register's citations (`server/routes/c2c/artifacts.ts:2505-2523,2817-2836`; `promote-artifact.ts:246,446`) were not re-opened. |
| 3 | DP-03 | **closed** | `db/migrations/20260730_esign_audit_db_level_immutability.sql:33-41,78`: the trigger's permitted-column check now explicitly subtracts `is_valid`, `verification_status`, `verification_date` alongside `superseded_by`/`updated_at` from the diff it inspects — the file itself documents the in-place amendment ("every revocation raised … now permits the write-once supersession … and only to the invalid, revoked state"). Matches CLAUDE.md Rule 1's required pattern (amend in place, not append a fix). Not re-executed against a live Postgres this session (baseline's reproduction stands as the last execution). |
| 4 | DP-04 / DP-05 | **still open** (register's own "partial" stands) | `scripts/db/provision-app-role.mjs:138-144`: `SCHEMA_PRIVILEGE_OVERRIDES` restricts only `audit` (append-only) and `extensions` (read-only); `DEFAULT_TABLE_PRIVILEGES` (`SELECT,INSERT,UPDATE,DELETE`) still applies to `public`, where `audit_logs` lives. The runtime role still holds DELETE on `audit_logs`. `db/migrations/20260617_audit_logs_immutability.sql` bypass setting and DP-05's owner-credential-in-task point were not re-read this session; taking the register's "SECURITY DEFINER door" partial-closure claim (P0-8a) as unverified-by-me. |
| 5 | DP-06 | **more closed than the register states** | `terraform/stack/main.tf:166-167`: `AUDIT_TRAIL_ENABLED=true` and `AUDIT_REQUIRE_ENFORCE=true` are now set in `boot_environment`, and `.github/workflows/deploy-aws.yml:380,398` preflights both as required vars with a boot-refusal error message. The register (as last annotated) says this half was "W2's" and still pending — at HEAD it is present in Terraform. I did not verify the file's git blame/date to confirm this landed inside vs. after the reviewed tranche, and did not verify a real `terraform apply`/deployed task reads it. Reported as a positive change the register has not yet caught up to, not as independently proven in a running environment. |
| 6 | DP-07 | **still open (Terraform/DPA half)** | Not re-read this session beyond the register; `embedding-provider.ts` default-OpenAI path and the Terraform/DPA gap were not re-opened at HEAD due to time box. Carried as the register states it (app-side closed by `df479b5f`, Terraform Anthropic key / DPA Annex III open). |
| 7 | IAM-02 / IAM-03 / IAM-05 | **mixed, as the register states — not independently re-opened this session** | Time did not allow re-reading `sso.ts`/`scim.ts`/`platform-token.ts` beyond what P1-2/IAM-18(6) touched (see §2). IAM-02 (MCP connector tokens skip revocation/session controls) is corroborated indirectly: `server/mcp/auth/platform-token.ts:155-173` mints `type:'access'` with no `sid`/`sst`/`idl` claims and is not in the `openSession(` call-site list (`grep -rn "openSession(" server/` — 8 hits, none in `mcp/`), so a connector token also sits outside the new P1-1 idle/lifetime/concurrent-session controls, on top of the register's own revocation/suspension gap. |
| 8 | IAM-04 / IAM-06 | **largely closed by P1-1, with residuals** | See §2 (P1-1). Confirmed: `sst`-based absolute lifetime survives token rotation (`server/services/session-inactivity.ts:129-134,151-154`), idle window enforced server-side (`:412-429`), concurrent-session limit with supersession (`:356-367,388-390`). Residuals: the MCP connector mint (above) and `server/routes/setup.ts:147-158` (first-run bootstrap token, single-use/self-closing per its own status check at `:50-59`, but mints `type:'access'` with no session claims and no `openSession` call — low severity given it is a one-time, self-closing install action, but it means "every mint via `openSession`" is not literally true). |
| 9 | INF-01 / INF-02 | **not independently verifiable this session** | No network access to GitHub's API for branch-protection or CI-run history (the definition's gates scan the tree only); not re-read from workflow YAML this session beyond confirming `ci:dead-audit-catch` and `ci:server-error-leaks` gate status (§4). Carried as the register/previous run found it. |
| 10 | INF-04 / INF-05 / INF-06 | **INF-04 closed; INF-05/06 still open** | `terraform/modules/cloudfront/main.tf:111-147,191-197`: `aws_cloudfront_response_headers_policy.spa` (HSTS w/ preload+subdomains, `nosniff`, `frame_option DENY`, `referrer-policy strict-origin-when-cross-origin`, CSP `frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'`) is now attached via `response_headers_policy_id` on `default_cache_behavior` (line 197). This closes INF-04 as the register describes it (register still lists it "open" in §3.2 — this is a change since that annotation). INF-05 still open: `grep -rn "guardduty\|aws_config\|securityhub\|flow_log\|cloudwatch_metric_alarm" terraform/` = zero hits; no `logging_config` on the CloudFront resource; no `access_logs_bucket =` assignment anywhere. INF-06 not re-checked this session (carried as open per register/previous run). |

---

## 2. Tranche closures, re-verified adversarially

| Item | Verdict | file:line | Failure path sought | What was found |
|---|---|---|---|---|
| **P0-1** — `/ana` namespace token-class + membership gate | **holds, with residual (new IAM-19)** | `server/services/ana/ana-realtime.ts:198-260` | A second door beside the fixed handshake: does the socket re-verify anything after `connection`? | No periodic re-check exists on `/ana` (unlike the main namespace's `startSessionRecheck`, `socketServer.ts:199-221,377-379`, added by the same tranche's P1-9). A revoked/logged-out/demoted/tenant-suspended session keeps a live governed tool channel for the socket's lifetime. New finding IAM-19 (§3). |
| **P0-12** — every AnA write is a proposal | **does not hold** as stated; **holds only for the `execute_platform_command` command-registry surface** | Gate: `server/services/ana/governed-tool-gate.ts:80-89` (own docstring); dispatcher: `server/services/ana-ri/command-executor.ts:5339-5343`; single writer: `server/routes/ana-ri/utility.ts:575-608` | Is there a caller of `executeCommands`/the propose-only partition that a directly-registered tool handler bypasses? | Yes, structurally: `PROPOSE_ONLY_COMMANDS` (`command-rbac.ts:439-443`) is derived only from `COMMAND_AUTHORIZATION`, which is keyed by the ~110 command names reachable through the one `execute_platform_command` bridge tool (`AnaToolExecutor.ts:5123-5158`). `governed-tool-gate.ts:80-89` says outright that tools with their own handlers ("saving a document to the vault, seeding a TMF") are "NOT treated as governed here, and that is the existing judgment rather than an omission." Cross-checked: 724 `registerToolHandler(` call sites in `AnaToolExecutor.ts`; zero overlap between those names and the `COMMAND_AUTHORIZATION` keys (disjoint namespaces). Confirmed by direct read that `qms_change_transition` (DP-31) and `retire_qms_document` (DP-32) — both flagged by the 09-24 weekly lens as ungoverned approvals/retirements — are registered exactly the same way today, at `AnaToolExecutor.ts:13795` and `:13668`, with no `humanConfirmed` check, no propose-only classification, and only a model-authored 3-character (or optional) reason. `save_document_to_vault` (`:19631`), `update_vault_document` (`:19757`), `draft_authoring_document` (`:19749`), `create_qms_document` (`:13544`) are the same shape. The `execute_platform_command` path itself is genuinely solid: `humanConfirmed` is assigned in exactly one file (`utility.ts:592`, enforced by `propose-only-partition.test.ts`), gated behind `reverifySigner` for the e-signature tier and a persisted sign-off audit row before execution. **Register impact: this re-opens DP-08 (baseline marked it "closed by the P0-12 part-2 commits… every write is a proposal") and confirms DP-31/DP-32 are unchanged, not newly closed by this tranche.** See DP-36 (§3). |
| **P1-1** — idle timeout, absolute lifetime, concurrent-session limit, `openSession` on every mint | **holds, with residuals** | `server/services/session-inactivity.ts` (idle: `:412-429`; lifetime: `:129-154`; concurrency: `:349-367,388-390`); callers: `server/routes/auth.ts:627,828,1150,1761`; `authEnterprise.ts:576`; `sso.ts:548,800` | A mint that bypasses `openSession` | Two: `server/mcp/auth/platform-token.ts:155-173` (connector tokens — already IAM-02's territory) and `server/routes/setup.ts:147-158` (first-run bootstrap — self-closing per `:50-59`, low severity). `authEnterprise.ts`'s `/refresh-token` (`:1029-1040`) and `routes/auth.ts`'s `/refresh` (`:1479-1496`) correctly use `continuedSessionClaims`/`session` spread rather than `openSession`, preserving `sst` so the absolute-lifetime clock is not reset by rotation — this is correct, not a gap. |
| **P1-2** — recovery codes once, no emailed code for TOTP, signup `pending_verification`, common-password check | **holds on `routes/auth.ts`; residual on the enterprise twin** | `server/routes/auth.ts:1699-1719` (`authenticatorAccount` gate before trying email OTP); `mfaService.ts:449-475,522-531` (`verifyLoginSecondFactor`, single conditional-UPDATE redemption); `routes/auth.ts:1854,1883-1894` (`/mfa/resend` refuses an emailed code for a TOTP account) | The enterprise route's equivalent ordering | `server/routes/authEnterprise.ts:524` (`POST /verify-mfa`) still tries `emailOtpService.verifyEmailOtp(userId, code)` **unconditionally, before** checking whether the account is a TOTP account — the literal shape of the original IAM-08 defect. Not currently exploitable in the normal flow because the sibling `/verify-password` step (`authEnterprise.ts:412-420`) correctly gates `createEmailOtp` behind `!hasTotpSetup`, and `/mfa/resend` (the only other minter) also refuses for TOTP accounts, so no emailed OTP row exists for such an account to redeem. But the ordering itself was not fixed on this door, only on `routes/auth.ts`'s. Signup `pending_verification` and common-password checks were not independently re-read this session (time box); no evidence found that contradicts the register's closure claims for those two. |
| **P1-3** — conditional lockout, fails closed | **holds** | `server/services/auth-security-service.ts:200-254` | Read-then-write race reintroduced? | No — one UPDATE with a `CASE` expression evaluated against the pre-statement row value (`:226-232`); an unrecorded failure throws (`:249-253`), not silently "not locked." |
| **P1-4** — role from the database in `admitLiveSession` | **holds** | `server/middleware/auth.ts:284-310` | A per-mount authenticator that still trusts the token's role claim | `applyOrganizationRole` runs after `enforceOrgMembership` confirms the row and overwrites `user.role`/`user.roles` from `organizationRole` (`:305-310`), called from `admitLiveSession` (`:284-289`) on every request through this authenticator. Not cross-checked against every other per-mount `authenticateToken` variant in the tree (time box). |
| **P1-6** — webhook delivery through `safeFetch` | **holds** | `server/services/automation/webhook-notifications.ts:17,257` (import + call site) | A bare `fetch` still present | Not found; the only outbound call at the delivery site is `safeFetch(...)`. |
| **P1-8** — drafting task ownership, stability PATCH/DELETE tenant + audit | **holds** | `server/routes/misc-inline-routes.ts:416-476` (org-scoped via `regulatory_programs` join); `server/src/routes/stability.router.ts:2064-2163` (`ownResultForUpdate` predicate `tenant_id=$2 FOR UPDATE`, both PATCH and DELETE write a `stab_audit` row inside the same transaction) | In-memory fallback or an audit-free branch | None found in the read ranges. |
| **P1-9** — main socket namespace periodic membership re-check | **holds** | `server/socketServer.ts:180-221,337-379` | Whether the timer actually disconnects | `sessionEndReason` re-runs `verifyLiveToken` (activity:false), `checkOrgMembership`, `shouldProcessTenantInBackground` on an interval; a positive reason clears the timer, emits `session:ended`, and disconnects (`:204-213`). This is the control `/ana` (P0-1) still lacks — see IAM-19. |
| **P1-20** — audit read/export role gate, server vocabulary | **holds, one residual** | `server/services/audit/audit-api-authority.ts:23-81`; call sites `server/routes/audit-trail-routes.ts:225,247,271,303,366,543,583,609,663`; `server/routes/audit-trail-ledger.routes.ts:465-469` | An audit-writing route the gate missed | `POST /api/audit/signatures` (`audit-trail-routes.ts:469-536`) checks only `requireAuthedOrgId`, not `requireAuditRecorder` — any organisation member (viewer included) can insert a `signature.create` marker row into `audit_events` with `regulatory_significant:true`, `gxp_relevant:true`, and free-text `meaning`/`reason`/`metadata`. It is explicitly labelled non-authoritative and forgery-guarded against claiming `signed` status, but the DP-18/P1-20 policy text itself says "recording an audit event by hand is an administrative act, not something a session does in passing" — this route contradicts that. See DP-38 (§3). |
| **P1-22** — retention sweep scheduled, legal holds | **holds (not deeply re-verified)** | `server/jobs/retentionCron.ts:356-374` (`cron.schedule` called at boot per the file's own comment) | Not deeply probed this session beyond confirming the boot-scheduling call exists; `vault-legal-holds.ts` routes not re-read (time box). |
| **P1-27** — logger masks email/IP; browser Sentry scrub | **holds for the documented surface; one structural gap** | `server/utils/logger.ts:113-160` (`maskPersonalData`, `redactContext`); `.js` mirror present and consistent; `client/src/utils/sentryScrub.ts:22-46` (key denylist + value-pattern scrub) | Does the mask cover the log message itself, or only structured context? | `redactContext`/`maskPersonalData` are applied only to the `context` argument (`logger.ts:187-196`: `pinoLogger.info({ context: redactContext(...) }, message)` — `message` is passed through unmasked). A call site that interpolates an email or IP directly into the message string (rather than passing it in `context`) bypasses the mask entirely. Also: `redactContext` explicitly passes arrays through unscanned (`:142` comment, "Arrays are passed through"). No live exploit found this session (a targeted grep for message-string email interpolation returned nothing), but the guarantee as documented ("masks … wherever either appears as a log value") is narrower than stated. See DP-39 (§3). |
| **IAM-18(6)** — SSO handoff in URL fragment, adopted only via `GET /session`; SAML `InResponseTo` default | **holds** | `server/routes/sso.ts:576,815-816`; `server/services/saml-provider.ts:91-109` | A direct-adoption path bypassing `GET /session` | Not found in the read range; `inResponseToMode()` defaults to `ValidateInResponseTo.always` when `SAML_IN_RESPONSE_TO_MODE` is unset (`saml-provider.ts:102-109`). |
| **IAM-18(7)** — 50 MB Concept2Cure body parser mounted after the auth boundary | **holds** | `server/startup/middleware.ts:160-196` | An earlier, unauthenticated mount of the same path | `mountConcept2cureBodyParser` (large-body JSON/urlencoded) is called at `:162`, after `app.use('/api', validateTenantContext)` at `:160` inside `applyAuthBoundary`; the pre-auth parser explicitly skips `/api/concept2cure` (`:177-183`, `unlessConcept2cure`). Anonymous traffic to that prefix has its body unread. |

---

## 3. New findings (register numbering continued: IAM-19, DP-36…39)

### IAM-19 — Medium — the `/ana` duplex socket has no periodic session re-check; the main namespace's does

- **file:line:** `server/services/ana/ana-realtime.ts:197-311` (whole registration function; no `setInterval`/re-verify
  after `connection`, confirmed by grep). Compare `server/socketServer.ts:199-221,377-379` (`startSessionRecheck`),
  added for the main namespace by the same tranche (P1-9 / IAM-12).
- **Write path:** the same governed agentic loop as HTTP chat — `executeAgenticLoop`
  (`server/services/ana/AnaToolExecutor.ts:15237`) — runs for the life of the socket.
- **What is missing:** a session ended by logout, password change, MFA-triggered revocation, org-membership removal,
  or tenant suspension does not close an already-open `/ana` socket; the tool loop (subject to DP-36's gaps below)
  keeps running under a principal the rest of the platform has stopped trusting.
- **Regulatory hook:** 21 CFR 11.10(d); HIPAA §164.312(a)(2)(iii) (automatic logoff).
- **Fix:** call the same `sessionEndReason`/`startSessionRecheck` pair (or share the function) from
  `registerAnaRealtime`'s `connection` handler.
- **Regression status:** not a regression of a closed item — it is a residual of P0-1 (IAM-01), which closed the
  handshake but not the live-session question P1-9 answered for the sibling namespace in the same tranche.

### DP-36 — High — the propose-only / human-confirmation partition (P0-12) covers only the `execute_platform_command` command registry; ~40 directly-registered AnA write tools remain fully ungoverned — DP-08 is not closed, DP-31/DP-32 are unchanged

- **file:line:** classifier scope acknowledged in its own docstring, `server/services/ana/governed-tool-gate.ts:80-89`;
  disjoint namespaces confirmed by extracting all `registerToolHandler('...')` names in
  `server/services/ana/AnaToolExecutor.ts` (724 sites) against all `COMMAND_AUTHORIZATION` keys in
  `server/services/ana-ri/command-rbac.ts` (zero overlap).
- **Write path (examples, unchanged from the 2026-09-24 weekly lens):** `qms_change_transition` →
  `AnaToolExecutor.ts:13795-13820` → `changeControl.service.ts` (approves a change-control record with a
  model-authored ≥3-character reason, no signature, no human confirmation — DP-31); `retire_qms_document` →
  `AnaToolExecutor.ts:13668-13690` (optional reason — DP-32); `save_document_to_vault` → `:19631-19700` and
  `update_vault_document` → `:19757` (model-authored ≥8-character reason only).
- **What is missing:** the baseline register states DP-08 "closed by the P0-12 part-2 commits of 2026-09-26 (every
  write is a proposal; confirm tier server and client)." That claim is true of the ~110 commands dispatched through
  the one `execute_platform_command` bridge (a genuinely solid, single-writer, tested implementation — see §2), and
  false of the larger population of directly-registered tool handlers, which were never in scope for the propose-only
  partition by the module's own design note ("the existing judgment rather than an omission"). A model can still
  create, revise, save-to-vault, and (via DP-31/32) approve or retire governed records with no person confirming the
  action.
- **Regulatory hook:** 21 CFR 11.10(d); AI Act Art. 14/50; NIST AI RMF MANAGE 2.4 (same hooks as the original DP-08).
- **Fix:** either extend `isProposeOnlyCommand`-equivalent classification to every `registerToolHandler` write (a
  second, tool-name-keyed registry, kept in sync by the same anti-drift test pattern used for
  `propose-only-partition.test.ts`), or route these handlers' mutations through `execute_platform_command` so they
  inherit the existing gate.
- **Regression status:** this re-opens DP-08 as *not fully closed* (the baseline's closure claim overstates its
  scope); DP-31 and DP-32 are confirmed **unchanged**, not new regressions.

### DP-37 — Medium — a raw SQL leaf-program lookup for vault documents carries no tenant predicate; a second caller would leak cross-tenant `program_id`

- **file:line:** `server/services/submission-service/submission-service.ts:1843-1845`
  (`LEAF_PROGRAM_READS.vault_documents`: `SELECT program_id::text … FROM vault.documents WHERE id = ${ref.documentUuid}::uuid`
  — no `organization_id`/tenant predicate in the statement, unlike its two siblings at `:1846-1861` which both filter
  on `organizationId`).
- **Detected by:** `npm run ci:tenant-isolation:no-regression` — **FAIL**, 1 new finding above the baseline of 9
  (`server/services/submission-service/submission-service.ts#59f216b0a04a:documents`).
- **Write/read path:** called only from `leafSourceProgram` (`:1878-1888`), itself called only from one site
  (`:2059-2066`), which runs immediately *after* `verifyLeafSource` (`:2043-2050`) — a properly org-scoped check
  (`LEAF_SOURCE_UUID_VERIFIERS.vault_documents`, `:1734-1753`, `EXISTS (… rp.organization_id = $2 …)`) that throws
  `forbidRef()` for a document outside the caller's tenant. In the one call site that exists today, a cross-tenant
  `documentUuid` never reaches the unscoped query — it is rejected first.
- **Why it is still a finding:** the query is not self-contained; its safety depends entirely on caller ordering
  (`verifyLeafSource` before `leafSourceProgram`, always, everywhere) rather than on its own predicate. That is
  exactly the "second door" pattern the audit is watching for: a future caller, a refactor that reorders the two
  `await`s, or a second call site added under time pressure would resolve any tenant's `vault.documents.program_id`
  from an attacker-supplied UUID with no tenant check at all.
- **Regulatory hook:** GDPR Art. 32; 21 CFR 11.10(d) (tenant-key provenance).
- **Fix:** add `AND EXISTS (SELECT 1 FROM regulatory_programs rp WHERE rp.id = vault.documents.program_id AND rp.organization_id = ${organizationId})` to the query itself, matching its siblings, rather than relying on the caller.
- **Regression status:** new; not in the 2026-09-24 register or the 2026-09-24 weekly lens. `ci:tenant-isolation:no-regression`'s own baseline (9) predates it — this is a live gate failure at HEAD, not a baselined item.

### DP-38 — Low-Medium — `POST /api/audit/signatures` writes an `audit_events` row on `requireAuthedOrgId` alone, not `requireAuditRecorder`

- **file:line:** `server/routes/audit-trail-routes.ts:469-513`.
- **What is missing:** every other write path in the same file gates on `requireAuditRecorder` (owner/admin/manager
  or platform administrator, `server/services/audit/audit-api-authority.ts:23,75-81`) per the P1-20 closure's own
  stated rationale ("recording an audit event by hand is an administrative act"). This route only checks
  `requireAuthedOrgId` (`:471-472`), so any organisation member — a viewer included — can insert a
  `signature.create` marker with `regulatory_significant:true`, `gxp_relevant:true`, and body-supplied `entityType`,
  `entityId`, `meaning`, `reason`, `metadata` (bounded by nothing but JSON parsing). It is explicitly non-authoritative
  (claiming `signed` status is refused, `:478-487`) and `signed_by` is the authenticated principal, not a body field
  — so it is not a forgery vector for a binding signature — but it is a compliance-record write outside the role
  gate the same tranche just established for its siblings.
- **Regulatory hook:** 21 CFR 11.10(e); GDPR Art. 5(1)(f) (integrity/confidentiality of records naming other users).
- **Fix:** add `if (!requireAuditRecorder(req, res)) return;` after the existing org guard.
- **Regression status:** new; not previously identified (predates and is untouched by P1-20, which closed DP-18's
  other cited routes).

### DP-39 — Low — the server logger's PII mask covers the `context` object, not the log message string or array values

- **file:line:** `server/utils/logger.ts:187-196` (`pinoLogger.<level>({ context: redactContext(...) }, message)` —
  `message` itself is never passed through `maskPersonalData`); `:142` comment ("Arrays are passed through — array
  values usually don't contain named fields") means an array of strings inside `context` is not scanned either.
- **What is missing:** the P1-27 closure's stated guarantee ("masks an e-mail address … or an IP address … wherever
  either appears as a log value") holds for scalar string values under an object key, not for the primary message
  argument or array elements. A call site of the form `` log.warn(`Failed login for ${email}`) `` (message-only, no
  `context`) would log the raw address.
- **Search performed:** a targeted grep for `log.(warn|info|error)(\`...\${...email...` across `server/routes`,
  `server/services`, `server/middleware` returned no hits — no exploited instance was found this session, but the
  absence of a hit is not a proof of absence across ~2,800 files in the time available.
- **Regulatory hook:** GDPR Art. 5(1)(c), Art. 25 (data minimisation by design); HIPAA §164.312(b).
- **Fix:** run `maskPersonalData` over the `message` string too, and recurse into array elements in `redactContext`.
- **Regression status:** new; residual of P1-27, not a regression (P1-27 closed the previously-undefended case —
  no masking at all — this narrows what remained undefended).

### Residuals noted, not raised as new ids

- IAM-08 (baseline Medium, register "routes half closed"): `server/routes/authEnterprise.ts:524` still tries the
  emailed OTP before checking `hasTotpSetup`, the literal shape of the original defect, on the enterprise
  `/verify-mfa` door specifically (not exploitable today per §2's analysis, since no emailed OTP is ever minted for
  a TOTP account through either minting path checked).
- IAM-02 / IAM-06 (baseline register "open"/"closed"): the MCP connector token mint
  (`server/mcp/auth/platform-token.ts:155-173`) and the first-run setup bootstrap token
  (`server/routes/setup.ts:147-158`) both mint `type:'access'` tokens outside `openSession`, so neither carries the
  new idle/lifetime/concurrent-session controls. The MCP case is already inside IAM-02's scope; the setup.ts case is
  new but low severity (single-use, self-closing route).

---

## 4. Gate baselines (read-only; none run with `write-baseline`)

| Gate | Result | Baseline size and direction |
|---|---|---|
| `ci:committed-secrets` | pass | — |
| `ci:no-dev-auth-in-prod` | pass | — |
| `ci:unauthenticated-fetch` | pass | 70 raw `fetch()` sites scanned, 0 baselined (baseline was 64 at the 2026-09-24 lens; the count of sites scanned grew, the flagged count did not) |
| `ci:path-containment` | pass | 3 files match, 3 baselined (unchanged) |
| `ci:org-path-param-guards` | pass | 43 routes, 43 guarded, 0 unguarded (unchanged) |
| `ci:jwt-verify-pinned` | pass | — |
| `ci:client-ip-single-source` | pass | — |
| `ci:server-error-leaks` | **pass** | 145 sites / 89 files (was 146 baseline, red at 147 in the 09-24 lens on `commitments.ts:156`; register says fixed by `3625a205` and ratcheted to 145 — confirmed at HEAD: green, no growth) |
| `ci:discarded-audit-write` | pass | 125 sites / 56 files (down from 133/60 at the 09-24 lens; shrink, unbanked) |
| `ci:sign-ceremony` | pass | 23 sites, "exactly as baselined" (unchanged — DP-02 unmoved) |
| `ci:regulated-delete-audit` | pass | every regulated-table delete has an audit call or is operator-allow-listed (see DP-33's caveat on what that admits, and DP-38 on the class of gap the shape of this gate doesn't reach: a create with no equivalent role gate) |
| `ci:gateway-bypass` | pass | 8 baselined sites tolerated (unchanged) |
| `ci:dead-audit-catch` | **pass** | 0 baselined / 0 files (was red on `templateStore.ts:80` at the 09-24 lens; register says fixed by `3625a205`; confirmed green at HEAD — trunk CI's own blocking step for this gate should now be green too, not independently re-verified) |
| `ci:session-scoped-rls-bypass` | pass | 34 in 7 unmounted services (unchanged) |
| `ci:drizzle-tenant-scope` | pass | 125 sites, all baselined; 26 fixed since the baseline file was written and unbanked (baseline file still 151; direction down, one more fix than the 09-24 lens's 25) |
| `ci:tenant-entry-points` | pass | 14 entry points, 9 do not consider entitlement (unchanged) |
| `ci:tenant-isolation:no-regression` | **FAIL** | 9 candidates in the baseline; 1 previously-flagged finding resolved (down) **and 1 new finding above baseline** (`submission-service.ts` — DP-37). Net: not a clean pass; this is the one gate that regressed since the 09-24 lens, which reported it passing at "8 current vs 9 baseline." |
| `check:security-patterns` | pass | 0 violations / 2,854 files |
| `check:compliance-claims` | pass | 857 customer-facing files scanned, no unsupported claim |

**17 pass, 1 fail** (`ci:tenant-isolation:no-regression`, new finding DP-37). This is a change from the 09-24 lens
(17 pass / 2 red, both previously-known reds); `ci:dead-audit-catch` and `ci:server-error-leaks` are now clean, and
`ci:tenant-isolation:no-regression` is newly red.

---

## 5. What the time box did not allow

- No gate was re-executed against a live database, so DP-03's trigger fix and DP-04's DELETE-privilege claim are
  read-verified, not execution-verified, this session.
- No network access: branch protection (INF-01), GitHub Actions run history, and whether any deployed task actually
  reads `AUDIT_TRAIL_ENABLED=true` (DP-06) were not checked against GitHub or AWS.
- DP-02 (23 sign-ceremony writers), DP-07's Terraform/DPA half, IAM-02/03/05's SAML/SCIM/connector code, INF-05/06,
  and the P1-22 legal-hold routes were taken from the gate outputs and the register rather than individually
  re-opened at HEAD — flagged above wherever that substitution happened, not silently inherited.
- The DP-36 finding (propose-only gate's true scope) came from a structural/name-set comparison (724 tool handlers
  vs. the command registry) rather than executing the agent against a live model; the two directly-cited handlers
  (`qms_change_transition`, `retire_qms_document`) were read in full, the rest of the ~40-tool population was not
  individually re-read line by line.
- A full-history `git log` was not attempted; whether any second door was *added* by the tranche itself (as opposed
  to a pre-existing gap the tranche didn't reach) was assessed by reading the current code shape and the tranche's
  own stated scope (e.g., `governed-tool-gate.ts`'s docstring naming its own limit), not by diffing every commit in
  the tranche.
