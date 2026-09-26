# Platform security audit — 2026-09-24

**Audited commit:** `adbf2d186cf8136c786cd76377c1b2c15eb8bc69` (`concept2cure-v2`, 2026-09-24 19:34 UTC).
**Launch row:** D6 (security posture); findings for D3 and D5 are handed to those lanes on the work-order board.
**Evidence:** `docs/evidence/D6/2026-09-24-security-audit/` (gate outputs, test runs, reproductions, citation check).
**Companion documents:** `REGULATORY_CONTROL_MAP_US_JP_EU.md` (requirement → control → status, per jurisdiction) and
`REMEDIATION_AND_ENHANCEMENT_PLAN_2026-09-24.md` (staged plan with owners and acceptance tests).

## 1. Standing rule: no prior assessment was trusted

The founder's instruction for this audit was to believe no earlier assessment. So:

- Every finding below was verified at the audited commit by reading the code path, and where it could be, by
  running the gate, the test or the query that exercises it. A prior document (the June 2026 swarm audit, the July
  2026 technical audit, the tenancy assessment, the policies, the questionnaire, the trust statement, the DPA, the
  launch ledger) was a lead, never evidence. Items those documents marked closed were re-opened unless the closing
  code was found; items they marked open were re-tested rather than copied.
- §7 is a **claims register**: every control the policies mark "Implemented", every "Yes/Implemented" in the SIG-Lite
  questionnaire, every "in place today" bullet of the trust statement and every measure in the DPA's Annex II is
  marked **verified**, **partial**, **refuted** or **unverifiable here**, with the line that decides it.
- Two documents fail on their face and are superseded by this one (§11): the 2025 `CSRA-CORTEX-001` HIPAA/FDA
  assessment (marks "AES-256 at rest", "30 min timeout" and "TLS 1.3" as implemented; none is true of the platform
  as built) and the Replit-era `docs/security/SECURITY_README.md`.
- Where verification needs something this session did not have (a running production, a live KMS, staging), the
  report says so rather than inheriting a prior result.

## 2. Method

| Step | What was done | Where filed |
|---|---|---|
| Three domain auditors | Read-only audits of (a) identity, access, sessions and the HTTP/socket/MCP surface; (b) the audit trail, electronic signatures, retention, privacy and the AI layer; (c) infrastructure, CI/CD, supply chain and the governance documents. Each was told to verify every prior backlog item at HEAD and to cite `file:line`. Run at `67ff155e`; every citation re-checked at `adbf2d18`. | this document |
| Control-tower re-reads | Every finding that decides the verdict (§3) was re-read by the control tower, not taken from an auditor. | §3, §4 |
| Citation check | 297 `path:line` citations from the three reports resolved against `git ls-files` at the audited commit; 297 resolve, one auditor filename corrected (`server/mcp/tools/runtime.ts`). | `citations-verified.txt` |
| Gates | 31 read-only gates plus `npm audit`: 29 pass, 2 red (`ci:server-error-leaks`, `ci:dead-audit-catch`), `npm audit` 0 critical / 0 high / 32 moderate, GA readiness probe 6 of 41 ready with 18 blockers. | `gates/SUMMARY.txt` and one file per gate |
| Weekly lens | The new `security-auditor` definition run once on the launch catalog at the same commit; its report is `docs/evidence/reviews/2026-09-24/security.md` and its three new ids are §4.4. |
| Tests | `npm run test:security`: 45 files, 377 tests pass. The repository's own `qms-effective-only-by-signature` and `ana-cannot-sign` tests: 28 pass (they close DP-01, see §4.2). | `tests/` |
| Reproductions | Three defects reproduced by execution, one confirmed closed: IAM-01 against the real `/ana` namespace middleware; DP-03 and DP-04 against PostgreSQL 16.13 with the real trigger migrations; DP-01 shown closed by the repository's test. | `repro/` |
| GitHub | Branch protection and CI history read through the API: `concept2cure-v2` is unprotected; the ten most recent completed trunk CI runs sampled on 09-19 and 09-23 all failed; twelve runs were queued within twenty minutes on 09-24 from concurrent sessions. | §4.3 INF-01 |

Not verified in this session and stated as such throughout: anything that needs the deployed AWS environment (no
account exists yet, row D1), the live KMS signer, staging, or a browser session against a running server.

## 3. Verdict

The platform's preventive engineering is stronger than most products at this stage. Production refuses to boot
without its secrets, row-level security, audit seal keys and a signer mode; tenant isolation is two-layer with a
non-superuser role and 54 real-database proofs; there is one signing ceremony that re-verifies password and
second factor; the audit chain is per-tenant, sealed and lock-protected against forks; deploys are OIDC-only,
digest-pinned and pre-flighted; the evidence, vault and state buckets are on customer-managed keys with object lock
where it matters. None of that is disputed by this audit and §5 lists it with file references.

The defects sit **beside** those controls, not in them:

- a second door next to a guarded one (a socket namespace that skips the token-class check; 23 HTTP "sign" writers
  and a status route that skip the ceremony; the connector, SAML and SCIM not bound to a tenant or a scope);
- a session setting that turns an immutability trigger off for whoever sets it, on a table the runtime role may
  delete from;
- a revocation that the trigger it must pass through refuses;
- a production configuration that leaves the audit monitor, the request interceptor and seal verification off;
- an AI egress path (embeddings) that never consults the placement policy, on a provider the DPA says is off by
  default and which Terraform alone provisions;
- sessions that do not end (24-hour revocation memory against 7-day refresh tokens, perpetual renewal, no idle
  logoff);
- detection that is close to absent in the cloud design, and a production branch with no protection whose CI has
  been red on every sampled run.

Governance is drafted but unsigned and single-person; the breach-notification figures disagree between the DPA and
the incident policy; there is no Japan-specific, GDPR Art. 27/30/35, NIS2 or EU AI Act material at all.

**Readiness statement.** The platform is not ready for a production tenant until the P0 list in the remediation
plan is closed (one Critical, the High items that are exploitable at HEAD, and the branch and CI controls). It is
not defensible to an EU or Japanese buyer's QA and privacy review until the P2 items exist (residency, transfer
mechanism, the APPI and PMDA ER/ES files, the Annex 11 map with audit-trail review, the AI Act classification).

### 3.1 Counts

| Domain | Critical | High | Medium | Low | Total |
|---|---|---|---|---|---|
| Identity, access, sessions, API surface (IAM-01…18) | 1 | 6 | 8 | 3 | 18 |
| Audit trail, e-signatures, retention, privacy, AI layer (DP-01…30) | 0 | 10 | 13 | 7 | 30 |
| Infrastructure, CI/CD, supply chain, governance (INF-01…33) | 0 | 7 | 15 | 11 | 33 |
| **Total at the auditors' commit** | **1** | **23** | **36** | **21** | **81** |

Closed between the auditors' commit and the audited head by other lanes, and reported as closed: **DP-01**
(`e1c224f6`) and most of **DP-10** (`2ddb77b0`); see §4.2. The first weekly lens (§4.4) added DP-31…33 at the same
commit. Net open at `adbf2d18`: 1 Critical, 21 High, 38 Medium, 22 Low.

### 3.2 The findings that decide the verdict (each re-read by the control tower)

| # | Id | One line | Verified by |
|---|---|---|---|
| 1 | IAM-01 | The socket.io `/ana` namespace admits the 5-minute `mfa_challenge` token a correct password yields before the second factor, and runs the AnA agent loop with tenant tools. | reading `ana-realtime.ts:170-184`, `token-revocation.ts:218-226`, `socketServer.ts:241`; **executed** (`repro/IAM-01-…txt`, 3 of 3) |
| 2 | DP-02 | 23 HTTP-reachable "sign" writers skip `reverifySigner`; artifact approve/lock writes a session-only signature into a second table the ceremony gate cannot see. | reading; `ci:sign-ceremony` baseline 23 |
| 3 | DP-03 | Revoking a signature runs an UPDATE the `electronic_signatures` immutability trigger refuses. | reading; **executed** on PostgreSQL 16 (`repro/DP-03-DP-04-…txt` §4–5) |
| 4 | DP-04 / DP-05 | The runtime role can delete `audit_logs` rows by setting `app.audit_archive_bypass` itself; the API task also holds the database owner and both HMAC keys, so a compromised process can rewrite and re-seal the trail; no chain head is anchored outside the database. | reading; **executed** (`repro/…` §8–11: plain DELETE refused, bypassed DELETE succeeds as `NOSUPERUSER`) |
| 5 | DP-06 | `AUDIT_TRAIL_ENABLED` and `AUDIT_REQUIRE_ENFORCE` are absent from the task definition and the deploy preflight, so the request interceptor and the only `audit_events` checker never start; the daily sweep verifies the plain chain only. | reading `terraform/stack/main.tf:150-169`, `deploy-aws.yml:312-362`, `startup/services.ts:440-449` |
| 6 | DP-07 | Vault document text is embedded through OpenAI with no classification, placement decision or audit; Terraform provisions only `OPENAI_API_KEY`; the DPA says OpenAI is disabled unless ordered. | reading `embedding-provider.ts:25,101,130-151`, `document-chunking.service.ts:166-171`, `stack/main.tf:93-95,187`, `DPA:263,269` |
| 7 | IAM-02 / IAM-03 / IAM-05 | Connector tokens are full API sessions whatever scope was consented and skip revocation and suspension; SAML matches by email and falls back to the default IdP for any org slug; SCIM from one tenant writes the global `users` row. | reading `platform-token.ts:155-173`, `sso.ts:130-158,684-699`, `scim.ts:719-733` |
| 8 | IAM-04 / IAM-06 | Revocation entries live 24 h, refresh tokens 7 d; logout never revokes the refresh token; the enterprise refresh endpoint renews forever; no idle logoff, no absolute lifetime, no concurrent-session limit. | reading `token-revocation.ts:32,115,170`, `routes/auth.ts:79-80,1083-1086`, `authEnterprise.ts:928-983`, `authToken.ts` |
| 9 | INF-01 / INF-02 | The only branch has no protection; CI runs after the push and blocks nothing; several security gates run only on pull requests the branch never receives, or only in a client-side hook that was not installed in this checkout. | GitHub API (`protected: false`); `pr-checks.yml:4,16-24`; `core.hooksPath` unset |
| 10 | INF-04 / INF-05 / INF-06 | The SPA is served from S3 with no security headers; there is no GuardDuty, Config, Security Hub, flow log, access log or alarm; nothing pages anyone. | reading `modules/cloudfront/main.tf:151-173`, `modules/alb/variables.tf:40-43`, `startup/env.ts:83-89` |

## 4. Findings register

Severity: Critical = exploitable now with regulated-data or integrity loss; High = exploitable or a regulated
control failing; Medium = conditional or defence-in-depth with real risk; Low = hygiene. Status: **new** (not in a
prior document), **open** (a prior backlog item still open), **partial** (prior item partly closed), **closed at
head** (fixed between the auditors' commit and `adbf2d18`). Hooks name the clause the finding fails; the control map
carries the full mapping. Line numbers are at `adbf2d18` unless the citation check notes otherwise.

### 4.1 Identity, access, sessions, API surface

| Id | Sev | Finding | Evidence | Hook | Status |
|---|---|---|---|---|---|
| IAM-01 | **Critical** (High behind the Terraform CloudFront, which does not route `/socket.io/*`) | `/ana` namespace accepts pre-MFA and partial tokens and runs the agent loop; token also taken from the query string; no membership or lifecycle check; no first-party client uses the namespace. | `server/services/ana/ana-realtime.ts:170-184`; `server/services/mfaService.ts:583-604`; `server/routes/authEnterprise.ts:347-357`; `server/socketServer.ts:241,1061`; `server/services/token-revocation.ts:218-226` | 11.10(d), 11.300; HIPAA 164.312(d) | new; **reproduced**; **closed by `7c4faf2a`** (P0-1, 2026-09-25) |
| IAM-02 | High (if `MCP_ENABLED=true`, row D8) | Connector-minted tokens are `type:'access'` with `scope` and `token_use` claims the general verifier and middleware never read; `verifyPlatformBearer` and consent check neither revocation nor `users.status`; dynamic client registration is open. | `server/mcp/auth/platform-token.ts:155-173`; `server/utils/jwtVerify.ts:79-99`; `server/middleware/auth.ts:133-145`; `server/mcp/config.ts:66-67`; `server/mcp/auth/consent.ts:128-160`; `server/mcp/auth/store.ts:86-102`; `server/mcp/index.ts:81-90` | 11.10(d), 11.300(c) | new; **part (d) closed by `5c10785e`** (P0-2d, 2026-09-25: registration bound to `MCP_CLIENT_REDIRECT_ALLOWLIST`; parts (a)–(c) are the D8 lane's) |
| IAM-03 | High (if SAML configured) | Users matched by email alone and given their own org/role; `getSamlConfig()` falls back to the default IdP for any org slug, so a default-IdP user is JIT-provisioned into whichever org they name; an IdP asserting a platform owner's email passes the platform-admin check; SSO sign-ins write no auth event. | `server/routes/sso.ts:130-158,229-248,367-370,375-387,684-699`; `server/middleware/requirePlatformAdmin.ts:44-53` | 11.10(d)(e), 11.300(a) | open (July AUTH-09) + new variant; **closed by `a96fbea0`** (P0-3, 2026-09-25; the `admitLiveSession` provider carry follows in the same lane) |
| IAM-04 | High | Revocation TTL 24 h vs refresh lifetime 7 d; client logout sends no refresh token and the server revokes only `body.refreshToken`; enterprise `/refresh-token` renews any live access token without revoking it; no session versioning on password reset/change; `terminateOtherSessions`/`terminateAllSessions` ignored. | `server/services/token-revocation.ts:32,115,170`; `server/routes/auth.ts:80,1083-1086,2080-2096,2192,2275-2283`; `client/src/services/portal/authService.tsx:611-619`; `server/routes/authEnterprise.ts:928-983` | 11.300(c); HIPAA 164.312(a)(2)(iii) | partial (July AUTH-03); **part (a) closed by `613c6e00`** (P0-4a, 2026-09-25: revocation outlives refresh, refresh rotates, password change ends earlier sessions; `terminateAllSessions` / `session_version` open, P0-4b) |
| IAM-05 | High | SCIM DELETE/PATCH/PUT check membership in the calling org, then write `users.status`/`users.name` globally; POST with an existing email re-sets `status` (reactivating a platform-suspended account) and adds a membership; signature manifests print `users.name`. | `server/routes/scim.ts:546-576,601-621,642-694,719-733`; `server/services/part11/signature-persistence.ts:673-679` | 11.300(b), 11.50; Annex 11 §12 | new; **closed by `423aff25`** (P0-5, 2026-09-25, no-migration form) |
| IAM-06 | High (regulated) | No server-enforced inactivity timeout, absolute lifetime or concurrent-session limit; `sessionTimeout: 30min` never read; `sessionTimeoutMinutes` stored, not enforced; tokens are bearer JWTs in web storage with a 1-day lifetime. | `server/routes/auth.ts:79,1220-1228`; `server/middleware/enterprise-security.ts:108`; `server/routes/tenant-config.ts:52,272`; `client/src/utils/authToken.ts`; `server/config/environment.ts:331` | Annex 11 §12; 11.10(d); HIPAA 164.312(a)(2)(iii) | new; **closed 2026-09-26** (P1-1 commits: `services/session-inactivity.ts`; idle window from `sessionTimeoutMinutes`, 15 min default, enforced by both authenticators, `verifyLiveToken` and the refresh; 12-hour lifetime; the client's idle warning and sign-out reason; OQ-PROJ-19 written, execution pending; a concurrent-session limit of `settings.security.maxConcurrentSessions`, five by default, every sign-in registered through `openSession`, the oldest session superseded and refused as `SESSION_SUPERSEDED`; `docs/evidence/D6/2026-09-25-p1/P1-1/` and `P1-1-concurrency/`). Residual: the `tenant-config.ts` schema key for the limit (file inside another lane's window until 02:42 UTC 09-27) and the OQ step for it |
| IAM-07 | High | `GET /api/concept2cure/documents/download/:filename` and `/api/document-understanding/analyze {filePath}` have no ownership check; roots include shared `uploads/`, `exports/`, `generated_documents/`; generated files are named `<Title>_<type>_<YYYYMMDD>.docx` in one directory for all tenants and overwrite each other. | `server/routes/c2c/exports.ts:423-450`; `server/routes/document-understanding.ts:509-523`; `server/utils/document-file-roots.ts:50-56`; `server/services/docx/docxFactory.ts:653-656`; `server/services/tools/index.ts:1006-1012` | HIPAA 164.312(a)(1); GDPR 32 | new; **closed by `cc1cb31a`** (P0-6, 2026-09-25) |
| IAM-08 | Medium | `/mfa/verify` tries the emailed code first for every account; `/mfa/resend` mints an emailed code for TOTP challenges; recovery codes are issued and never accepted; no org policy to require an authenticator app. | `server/routes/auth.ts:1427-1438,1565-1606`; `server/routes/authEnterprise.ts:468-479`; `server/services/mfaService.ts:11,443-458,512-535` | 11.300; NIST 800-63B | open (D6 owner item); **recovery codes closed by the P1-2 commit of 2026-09-25** (redeemable once each at the login challenge via `verifyLoginSecondFactor`; the enterprise challenge wired, `routes/auth.ts`'s `/mfa/verify` waits on its window; the emailed-code fallback and the org policy remain); **routes half closed by the P1-2 part-2 commit of 2026-09-26** (recovery codes at `/mfa/verify`; no emailed code for an authenticator account; the org policy remains) |
| IAM-09 | Medium | Lockout counter is read-then-write (races; fails open on write failure); `/mfa/resend` resets the emailed-code attempt counter; limiters are per-task and per-IP; `/api/v1/auth` gets the auth router without the failures-only limiter. | `server/services/auth-security-service.ts:186-222`; `server/services/emailOtpService.ts:67-80`; `server/bootstrap/register-platform-routes.ts:91`; `server/middleware/enterprise-security.ts:1070` | 11.300(d) | open (AUTH-19) + new; **closed by `1219a144`** (P1-3, 2026-09-25: one conditional UPDATE, fails closed; a code re-issue keeps spent guesses; `/api/v1/auth` limited; a per-challenge resend cap and Redis in production remain) |
| IAM-10 | Medium | `admitLiveSession` builds roles from the token; a per-mount `authenticateToken` overwrites the DB role; `requireRole` reads `req.user.roles`, so a demoted admin keeps privileges for the token's life. | `server/middleware/auth.ts:203-211`; `server/routes/billing-dashboard.ts:764,800,894` | 11.10(g) | partial (AUTH-10); **closed by `414f203e`** (P1-4, 2026-09-25: the role is the membership row's, read on each request behind `authenticateToken`) |
| IAM-11 | Medium | `/api/v1/drafting/task_status/:task_id` has no tenant predicate; `start_task` no project ownership; `/api/stability/results/:resultId` PATCH/DELETE by id alone, no audit row. | `server/routes/misc-inline-routes.ts:417-476`; `server/src/routes/stability.router.ts:2054-2078` | 11.10(e) | partial (API-01), open (API-10) |
| IAM-12 | Medium | Main socket namespace: no membership re-check at handshake or after connect; tokens accepted in the query string; a removed member keeps the org room's events for the token's life. | `server/socketServer.ts:225-280` | 11.10(d) | new; **closed by `901f9c9e`** (P1-9, 2026-09-25: token from `auth` only, membership at handshake and on a timer, `session:ended` then disconnect) |
| IAM-13 | Medium | Webhook delivery checks the hostname, then a bare `fetch` follows redirects and returns 200 characters of the error body; the connectors use DNS-pinned `safeFetch`. | `server/services/automation/webhook-notifications.ts:16,243-270`; `server/utils/safeFetch.ts` | GDPR 32 | open (June §2.4 had cleared it); **closed by `eeaa8267`** (P1-6, 2026-09-25: `safeFetch`, redirects refused, bodies never echoed) |
| IAM-14 | Medium | 7 of 25 upload handlers run magic-byte + antivirus (`assertUploadSafe`); `stability.router.ts:85` has no size limit or filter (in-memory buffer); authoring image and docx uploads trust the client MIME type. | `server/src/routes/stability.router.ts:85`; `server/routes/authoring.router.ts:6238-6249,6389-6399`; `server/middleware/uploadSafety.ts:178-196` | integrity/availability | open, improved (2/28 → 7/25); **`stability.router.ts` closed and the population gated by the P1-5 commit of 2026-09-25** (`ci:upload-guards`: 13 unguarded sites across 12 files baselined with reasons, shrink-only; wiring into `package.json`/pre-push waits on their window; the sweep of the 12 files remains) |
| IAM-15 | Medium | Nine `x-org-uuid` header fallbacks remain as the tenant key when the session UUID is null; RLS contains them only while enforcement is on. | `server/routes/ana-features.ts:2360,2597,4879,4952,5037`; `server/routes/chat/send-message.ts:190,292`; `server/routes/c2c/ai-editing.ts:149,1073` | tenant key client-controlled | open (class fixed in `cortexQueryRoutes.ts`) |
| IAM-16 | Low–Medium | An explicit `AUTH_BOUNDARY_MODE=warn` is honoured in production with no boot refusal; the second, unconditional `/api` gate limits the blast radius to routes mounted before it. | `server/middleware/authBoundary.ts:126-130`; `server/bootstrap/register-platform-routes.ts:242-275` | 11.10(d) | open (AUTH-12/API-07); **boot refusal closed by `d7f08922`** (P0-13a, 2026-09-25; the deploy-preflight half is W2's) |
| IAM-17 | Low–Medium | Signup returns a 24-hour admin token with no email verification and no MFA; no breached-password screening; password change writes a log line, not an audit event; `mustChangePassword` is advisory. | `server/routes/auth.ts:991-1029,2285`; `server/services/auth-security-service.ts:45-88` | 11.100(b), 11.300(b), 11.10(e) | open (AUTH-18) + new |
| IAM-18 | Low | Grouped: `ci:server-error-leaks` red (147 vs 146 baseline, `server/routes/c2c/commitments.ts:156`); public `/api/ai-gateway/health` lists providers and echoes `err.message`; `/api/metrics` readable by any tenant's user; the `validateTenantContext` impersonation detector is mounted before auth and never runs; enterprise verify-password/verify-mfa record `user_login success` and mint a token for suspended accounts; SAML token returned in a query string and `InResponseTo` `ifPresent`; 50 MB JSON parsed before auth on `/api/concept2cure`; login timing reveals which emails exist; AI rate-limit bucket misses the main AI prefixes; `/api/ai-assistance` has no mount-level auth. | `server/startup/inline-endpoints.ts:53-69,693-717`; `server/middleware/enterprise-security.ts:541-563`; `server/index.ts:121,137`; `server/routes/authEnterprise.ts:245-563`; `server/routes/sso.ts:396-399`; `server/services/saml-provider.ts:100-109`; `server/startup/middleware.ts:95`; `server/routes/auth.ts:376-396`; `server/middleware/redisRateLimiter.ts:349-367`; `server/bootstrap/register-core-routes.ts:128` | 11.10(e); GDPR 32 | mixed; **(2) and (3) closed by the P1-17 commit of 2026-09-25** (`/api/metrics`, `/api/health/full`, `/api/health/jobs` need the scrape token or a platform administrator; the gateway health answers a status word, detail at `/detail` behind the same guard, no exception echo); **(1) closed on trunk by `3625a205`** and the leak baseline ratcheted 146 → 145; **(4), (5), (9), (10) closed by the IAM-18 residuals commit of 2026-09-26** (detector behind the boundary; enterprise steps refuse an inactive account; AI prefixes metered as AI; AI-assistance mount gated); **(6) closed 2026-09-26** (both callbacks hand the session over in the URL fragment to the sign-in page, which adopts it only when `GET /session` confirms it; SAML `InResponseTo` defaults to `always`; `docs/evidence/D6/2026-09-25-p1/IAM-18-6/`); **(8) closed by the P1-2 part-2 commit** (unknown e-mail pays the bcrypt cost); **(7) closed 2026-09-26** (the Concept2Cure 50 MB parser mounts after the auth boundary; anonymous bodies unread; `docs/evidence/D6/2026-09-25-p1/IAM-18-7/`) |

### 4.2 Audit trail, electronic signatures, retention, privacy, AI layer

| Id | Sev | Finding | Evidence | Hook | Status |
|---|---|---|---|---|---|
| DP-01 | High → **closed at head** | A QMS controlled document could be made effective by any member's POST/PATCH `status`, by the legacy `/transition` route, or by the AnA `approve_qms_document` tool, with no signature. Fixed by `e1c224f6` (2026-09-24 19:14): create/PATCH schemas no longer admit `effective`, an approved document changes only through a revision, the transition route no longer stamps the caller as approver, the AnA handler is replaced by a refusal. The repository's `qms-effective-only-by-signature` and `ana-cannot-sign` tests pass (28 of 28) at the audited head. Residual: no database constraint on `qms_documents` refuses `effective` without a signature row (defence in depth, plan P1). | `server/routes/mdx-qms.ts:128-160,474-491`; `server/routes/qms.ts`; `server/services/ana/AnaToolExecutor.ts:13587`; `tests/qms-effective-only-by-signature.txt` | 11.10(g), 11.50, 11.70, 11.200; Annex 11 §14 | closed at head |
| DP-02 | High | 23 "sign" ledger writers in 21 files skip `reverifySigner` and are mounted with `authMiddleware` only (the entitlement gate is permissive by design); artifact approve/lock writes `concept2cure_signatures` with `authenticationMethod:'session_jwt'`, `secondFactorVerified:false`, outside the `ci:sign-ceremony` gate's view; `promote-artifact` still carries its TODO. | `scripts/ci/sign-ceremony-baseline.json`; `server/bootstrap/register-inline-routes.ts:418-419,620-640`; `server/middleware/moduleEntitlementGate.ts:37-47`; `server/routes/c2c/artifacts.ts:2505-2523,2817-2836`; `server/services/ai-actions/handlers/promote-artifact.ts:246,446` | 11.50, 11.70, 11.200(a)(1); Annex 11 §14 | open (W3b §2; July §7.4) |
| DP-03 | High | The revocation UPDATE sets `is_valid`, `verification_status`, `verification_date` beside `superseded_by`; the trigger permits only `superseded_by`/`updated_at`; no test runs revocation against the trigger. **Reproduced on PostgreSQL 16:** the exact statement raises `IMMUTABILITY_VIOLATION`; the two-column control succeeds. | `server/services/part11/signature-persistence.ts:867-875`; `db/migrations/20260730_esign_audit_db_level_immutability.sql:47-58`; `server/routes/c2c/actions.ts:545`; `repro/DP-03-DP-04-postgres16-transcript.txt` §4–5 | 11.70, 11.10(e) | new; **reproduced**; **closed by `b33ec50d`** (P0-7, 2026-09-25, trigger amended in place) |
| DP-04 | High | The `audit_logs` no-delete trigger exempts any transaction that has `SET LOCAL app.audit_archive_bypass='on'`, an unregistered setting any role may set; the recipe grants the runtime role DELETE on public tables; no chain head is anchored outside the database, so truncating the newest rows is undetectable; the archive job's deletes would leave the verifier permanently "broken". **Reproduced:** as a `NOSUPERUSER NOBYPASSRLS` role, plain DELETE refused, bypassed DELETE succeeds (`rows_left 0`). | `db/migrations/20260617_audit_logs_immutability.sql:150-162`; `scripts/db/provision-app-role.mjs:139-152`; `server/services/audit/chain.ts:450-600`; `server/services/audit/audit-archive.service.ts:88-160`; `repro/…` §6–11 | 11.10(c)(e); Annex 11 §7.1, §9; HIPAA 164.312(c)(1) | new; **reproduced**; **sweep half closed by `e8724680`; archive bypass replaced by a SECURITY DEFINER door with its own ledger and an enforced 24-month floor (P0-8a, 2026-09-25, `054c1764`)**; `app_service` DELETE grant and the anchored chain head open |
| DP-05 | High | The API task carries the database owner URL (used for boot DDL) and both HMAC keys, so a compromised process can `DISABLE TRIGGER`, rewrite rows and re-seal; e-signature hashes are unkeyed SHA-256; the tamper-proof migration's header claims immunity "including a compromised application process". | `terraform/stack/main.tf:43-50,180-185`; `server/db/bootstrap/index.ts:28-40`; `server/services/part11/signature-persistence.ts:209,714`; `db/migrations/20260813_audit_tamper_proof_log.sql:136-139` | 11.10(c)(e), 11.70; Annex 11 §12.1; GDPR 32 | owner-in-task acknowledged (W2 09-23b); consequence new |
| DP-06 | High | `AUDIT_TRAIL_ENABLED` is absent from the task definition and the preflight: no request interceptor, no `chainIntegrityMonitor` (the only `audit_events` checker); production only warns unless `AUDIT_REQUIRE_ENFORCE`; the daily sweep verifies `audit_logs`' plain chain only (no seals, `audit_events` or `tamper_proof_log`); the on-demand verifier is scheduled by nothing; no startup check that the triggers exist. | `terraform/stack/main.tf:150-169`; `.github/workflows/deploy-aws.yml:312-362`; `server/startup/audit-trail.ts:77-96`; `server/startup/services.ts:440-449`; `server/startup/audit-enforcement.ts:44-66`; `server/jobs/auditChainIntegritySweep.ts:39` | 11.10(e); Annex 11 §9 | partial regression vs July §7.3; **startup self-check and multi-store sweep closed by `e8724680`** (P0-9a, 2026-09-25; task-definition and preflight flags are W2's) |
| DP-07 | High | Embeddings default to OpenAI with no classification, placement decision or audit; vault text is embedded on ingest; Terraform provisions only `OPENAI_API_KEY` and no Anthropic key; `OPENAI_ZERO_RETENTION=false`; the DPA says OpenAI is disabled unless a tenant orders it. | `server/services/ai-gateway/embeddings/embedding-provider.ts:25,101,130-151`; `server/services/enhancedEmbeddingService.ts:146,191`; `server/services/vault/document-chunking.service.ts:166-171`; `terraform/stack/main.tf:93-95,187`; `docs/commercial/DATA_PROCESSING_ADDENDUM.md:263,269` | GDPR 28(2)(4), 44; HIPAA 164.308(b); APPI 28 | bypass acknowledged (`AI_SENSITIVE_DATA_PLACEMENT.md:40`); contradiction new; **application half closed by `df479b5f`** (P0-11, 2026-09-25; Terraform key set and DPA Annex III open) |
| DP-08 | High | Model output runs write commands with no human confirmation: propose-only covers 15 of ~52 writes; `update_artifact`, `update_project`, `export_document`, `erase_personal_data` auto-run; the per-tenant Part 11 gate defaults off; the injection heuristic needs override verbs. | `server/routes/ana-ri/post-processing.ts:339-356`; `server/services/ana-ri/command-executor.ts:131-136,5280-5298`; `server/services/ana-ri/command-rbac.ts:135-220,439-448`; `server/services/ana/AnaToolExecutor.ts:5130-5145`; `server/services/ai-gateway/promptInjection.ts:1-45` | AI Act 14/50; NIST AI RMF MANAGE 2.4; FDA GMLP 7; 11.10(d) | partial (June §2.4); **erasure escalated by `8ebe3040`** (P0-12 part 1, 2026-09-25; every-write propose-only open, design in `docs/evidence/D6/2026-09-24-p0/P0-12/`); **closed by the P0-12 part-2 commits of 2026-09-26** (every write is a proposal; confirm tier server and client) |
| DP-09 | High | The AnA erasure command swallows query errors inside BEGIN…COMMIT (an aborted transaction commits nothing and the call returns `success:true`), the same bug the GDPR route documents as fixed; it overwrites `concept2cure_artifacts.content` with no hold or retention check and no chained audit row. | `server/services/ana-ri/command-executor.ts:1649-1771`; `server/routes/global-compliance.ts:571-596` | GDPR 5(1)(d), 17(3)(b); 11.10(c)(e) | new (regression); **contained by `8ebe3040`** (P0-12 part 1, 2026-09-25: e-signed and human-confirmed; the handler's transaction bug open) |
| DP-10 | High → mostly **closed at head** | At the auditors' commit the purge ran BEGIN/COMMIT on a pool, consulted no legal hold, accepted a truncated export and left object bytes. `2ddb77b0` (2026-09-24 19:34) fixes those four on one checked-out client with a legal-hold refusal. Residual at head: the purge writes no chained audit row (logger only); 611 org-keyed tables outside the 27-table purge set; S3 old versions never expire. | `server/services/tenant/tenant-offboarding.ts:432-569`; `server/routes/tenants-simple.ts:478-525`; `docs/reports/purge-coverage-baseline.json`; `terraform/stack/vault_storage.tf:14-16` | GDPR 17; 11.10(c)(e); Annex 11 §17 | mostly closed at head; residual open (lane `…01AiwZKG`) |
| DP-11 | Medium | Two disjoint stores: launch apps write `audit_logs`; the inspector-facing signed export reads only `audit_events`; the export key falls back to `JWT_SECRET`; a symmetric seal cannot be verified offline by an inspector. | `server/services/auditService.ts`; `server/services/audit/signedAuditExport.ts:115-125,269-297`; `server/routes/audit-trail-routes.ts:619-624` | 11.10(b)(e); Annex 11 §8.1, §9 | open + new |
| DP-12 | Medium | `audit_events` has a seal column and no writer; its record hash covers 9 fields and excludes `metadata`, `signature_status`, `signed_by`, `signature_meaning`, `changed_fields`, `organization_id`, `ip`; monitor and export check linkage only. | `db/migrations/20260617_audit_events_hmac_seal.sql`; `db/migrations/20260222_audit_events_hash_chain.sql:69-84`; `server/services/audit/chainIntegrityMonitor.ts:11-13,168` | 11.10(e), 11.70 | open (June §2.3) + new |
| DP-13 | Medium | The `audit_logs` chain trigger returns `NEW` when `sha256_chain IS NULL`, so unchained rows are accepted silently; `writeChainedAuditRow` hard-codes `old_values` NULL. | `migrations/20260921_audit_logs_chain_seq.sql:98-102`; `server/services/auditService.ts:288-310` | 11.10(e); Annex 11 §9 | open |
| DP-14 | Medium | `logAction` uses its own connection and never throws; 207 `logAction` sites vs 16 `writeChainedAuditRow`; 133 discarded-write sites baselined. | `server/services/auditService.ts:340-450`; `scripts/ci/discarded-audit-write-baseline.json` | 11.10(e) | open, improved |
| DP-15 | Medium | `linkDomainHistory` has no callers; no triggers on `authoring_audit_trail`, `workflow_history`, `document_audit_logs`, `regulatory_audit_logs`, `c2c_ana_actions`. | `server/services/audit/domain-history-link.ts:67-72` | 11.10(e); Annex 11 §9 | open (ledger L12) |
| DP-16 | Medium | `authoring_signatures` is protected by convention only and keys the signer by email; the `concept2cure_signatures` trigger exists only under `_legacy/`, on no apply path. | `db/migrations/20260725_authoring_signatures_and_workflow.sql:40-70`; `db/migrations/_legacy/20260128_concept2cure_signatures.sql:129-131` | 11.70, 11.100(a) | new |
| DP-17 | Medium | The governed sign accepts a null or free-text meaning. | `server/services/part11/signature-persistence.ts:683-688` | 11.50(a)(3) | new; **vocabulary half closed by `3d09bf2a`** (P1-21, 2026-09-25: the writer and the route refuse a missing or unknown meaning; the eSTAR default is gone; the first-signing acknowledgement is DP-22's half) |
| DP-18 | Medium | Audit read and export have no role gate (every member can export all users' names and IPs); `POST /audit/events` and `/batch` accept arbitrary `event_type`/`metadata`. | `server/routes/audit-trail-routes.ts:213-240,245-356,537,588`; `server/routes/audit-trail-ledger.routes.ts:398` | 11.10(d)(e); GDPR 5(1)(f) | residual new (F3/F4 closed); **closed by the P1-20 commit of 2026-09-26** (reads and exports for owners, admins, managers or a platform administrator; client-recorded events from the server's vocabulary with bounded object metadata; the ledger list route follows) |
| DP-19 | Medium | Individual data-subject export swallows errors (silently partial) and covers users plus four legacy tables only; erasure overwrites with no hold check and no chained audit; the route's role falls back to `user.title`. | `server/routes/global-compliance.ts:30-53,440-497,604-660` | GDPR 12/15/17(3)(b)/20; APPI 33-35 | new |
| DP-20 | Medium | The retention sweep is unscheduled (CLI entry only); nothing sets `retention_until`; policies are global; no API creates or lifts a legal hold; deletion audit goes to a file on the task's disk. | `server/jobs/retentionCron.ts:19-21`; `server/bin/run-retention.ts`; `shared/schema/vault.ts:256`; `server/utils/audit-logger.js:13-50` | Annex 11 §17; GDPR 5(1)(e); 11.10(c)(e) | open (July §7.3) + new; **closed 2026-09-26 but for per-organisation policies** (P1-22 commit: the sweep scheduled at boot, `retention_until` set at admission, legal-hold place/lift routes, each disposition one transaction with its chained row; `docs/evidence/D6/2026-09-25-p1/P1-22/`) |
| DP-21 | Medium | No audit-trail review workflow or review record. | `client/src/concept2cure/v2/surfaces/Part11Console.tsx:1-20` | Annex 11 §9; FDA data-integrity guidance 2018 Q7 | new |
| DP-22 | Medium | No user acknowledgement that an electronic signature is the legal equivalent of a handwritten one; no identity-proofing record. | repo-wide search | 11.10(j), 11.100(b)(c) | new |
| DP-23 | Medium | No key id or rotation for the audit HMAC keys; `field-encryption.ts` has no importers while `SECURITY.md:86-87` cites field-level encryption of identifiers. | `server/services/audit/audit-hmac-seal.ts:30,71`; `server/services/security/field-encryption.ts`; `SECURITY.md:86-87` | 11.10(c); HIPAA 164.312(a)(2)(iv) | open + new |
| DP-24 | Low | Blocking gate `ci:dead-audit-catch` is red on trunk (false positive on comment text). | `server/services/templates/templateStore.ts:80`; `.github/workflows/ci.yml:556-560`; `gates/ci_dead-audit-catch.txt` | — | new; **closed on trunk by `3625a205`** (the guard matches code, not comment text; gate green at `fdc1e53e`) |
| DP-25 | Low | Mixed clocks: application time for `audit_logs`/signatures/`tamper_proof_log`, database `now()` for `audit_events`; no declared time source. | `server/lib/tamper-proof-audit.ts`; `db/migrations/20260222_audit_events_hash_chain.sql` | 11.10(e) | new |
| DP-26 | Low | Browser Sentry session replay with no `beforeSend` scrubber (dormant, no DSN); server logger does not redact email/IP keys. | `client/src/utils/sentry.ts:6-15` | GDPR 25; HIPAA 164.312(b) | new; **browser half closed 2026-09-26** (P1-27 commit: `sentryScrub.ts` as `beforeSend`/`beforeBreadcrumb`, `sendDefaultPii: false`, replay masking stated; `docs/evidence/D6/2026-09-25-p1/P1-27/`); the logger key list is unchanged |
| DP-27 | Low | `organizations.api_key` minted with `Math.random`, stored plaintext (no reader found). | `server/routes/tenants-simple.ts:545-551` | GDPR 32 | new; **closed 2026-09-26** (P1-27 commit: the mint route removed; organisation API keys are `routes/api-keys.ts`, hashed and scoped; the column write at tenant creation remains, CSPRNG, unread) |
| DP-28 | Low | `tamper_proof_log` is one global chain with no tenant column. | `server/lib/tamper-proof-audit.ts:420-430` | 11.10(b) | new |
| DP-29 | Low | Approved-model enforcement depends on the caller's declared task type. | `server/services/ai-governance/approved-models.ts:291-298` | AI Act 17; GMLP | new |
| DP-30 | Low | Project archive/delete records no reason; the signer-mode boot check depends on route import order. | `server/routes/c2c/projects.ts:1663-1697`; `server/services/signature/signer-mode.ts` | Annex 11 §9 | new / open (W3b) |

### 4.3 Infrastructure, CI/CD, supply chain, governance

| Id | Sev | Finding | Evidence | Hook | Status |
|---|---|---|---|---|---|
| INF-01 | High | No enforced pre-merge control on the production branch: GitHub reports `concept2cure-v2` unprotected; CI runs after the push and blocks nothing; the ten sampled completed trunk runs (09-19, 09-23) all failed and commits kept landing; hooks are client-side, skippable with `--no-verify`, and not installed without `npm install` (`husky \|\| true`; `core.hooksPath` was unset in this checkout); no reviewer independent of the founder. | GitHub API `list_branches`; `package.json:297`; `CLAUDE.md:3-19`; `docs/security/policies/POLICY-CM-003-change-management.md:12` | NIST CM-3/CM-4/SA-10; ISO 27001 A.8.32; SOC 2 CC8.1; Annex 11 §10; HIPAA 164.308(a)(8) | new |
| INF-02 | High | Security gates that never run in CI on trunk (PR-only or pre-push-only): `ci:server-error-leaks` (146 baselined), `check:compliance-claims`, `ci:discarded-audit-write` (133), `ci:session-scoped-rls-bypass` (34), `ci:unauthenticated-fetch`, `ci:drizzle-tenant-scope` (151), Semgrep `p/ci`, Checkov (last ran 2026-06-15, failed). | `.github/workflows/pr-checks.yml:4,16-24,69,142,236-238,267`; `.husky/pre-push:217,253,269,349`; `.github/workflows/terraform-compliance.yml:3-6` | NIST SA-11/RA-5; ISO A.8.29 | new |
| INF-03 | High | The ECS task role holds `s3:PutObject` on the frontend bucket: a compromised API process could replace `index.html` for every tenant. | `terraform/stack/main.tf:259-263`; `terraform/modules/ecs-fargate/main.tf:79-90` | NIST AC-6; ISO A.5.15; SOC 2 CC6.3 | new |
| INF-04 | High | The SPA is served from S3 through CloudFront with no response-headers policy and no meta CSP: no HSTS, CSP, `frame-ancestors` or `nosniff` on the document; Helmet covers only ALB paths; signing and approval screens can be framed. | `terraform/modules/cloudfront/main.tf:151-173`; `client/index.html:6-8`; `server/middleware/enterprise-security.ts:166` | NIST SC-8/SI-10; SOC 2 CC6.6; HIPAA 164.312(e) | new (June "cleared" held for Express pages only) |
| INF-05 | High | No detective controls: no GuardDuty, Config, Security Hub, VPC flow logs or CloudWatch alarms; ALB access logs off (`access_logs_bucket` defaults `""`, never passed); CloudFront has no `logging_config`; WAF excepted pending a founder decision. | `terraform/modules/alb/variables.tf:40-43`; `terraform/stack/main.tf:212-223`; `terraform/modules/cloudfront/main.tf:111-117` | NIST AU-2/AU-6/SI-4; CSF DE.CM; ISO A.8.15/A.8.16; HIPAA 164.312(b); Annex 11 §12 | open |
| INF-06 | High | Nothing pages anyone: `SENTRY_DSN` and `REDIS_URL` only warn and Terraform sets neither; 11 Prometheus rules with no Prometheus or Alertmanager; without Redis, rate limits and the revocation memory tier are per task; on-call is "Planned". | `server/startup/env.ts:83-89`; `infra/alerts/*.yml`; `docs/security/policies/POLICY-IR-004-incident-response.md:43` | NIST IR-4/SI-4(5); SOC 2 CC7.3 | open (July 10.3/10.4) |
| INF-07 | High | Breach governance is incomplete and self-contradictory: the DPA says [48] h, IR-004 and SIG G.4 say 72 h; no HIPAA §164.410 business-associate timeline, no GDPR Art. 33/34 processor→controller procedure, no APPI Art. 26 PPC report; no tabletop, no incident log, one responder. | `docs/commercial/DATA_PROCESSING_ADDENDUM.md:172`; `POLICY-IR-004:32,40-44`; `docs/security/SECURITY_QUESTIONNAIRE_SIG_LITE.md:80` | NIST IR-6/IR-8; HIPAA 164.308(a)(6), 164.410; GDPR 33/34; APPI 26; Annex 11 §13 | partial; **documents half closed 2026-09-26** (P1-13: IR-004 §3a notification matrix with one 72-hour tenant clock, `INCIDENT_LOG.md` opened, AC-002 §4a access-review procedure, `TRAINING_RECORD.md` opened, SIG G.4 reworded). The DPA's bracketed figure (counsel), the tabletop, the first access review and the first training completion remain the founder's |
| INF-08 | Medium | The blocking Trivy fs and config scans have no `if: always()`, so any earlier failed step skips them (observed: run 35850422925). | `.github/workflows/ci.yml:1806-1856` | NIST RA-5 | new |
| INF-09 | Medium | A tag deploy does not check that CI or release-evidence passed for that SHA; the "SAST" security-gate runs no CodeQL or Semgrep; no `trivy image`, ECR scan results never read, no cosign or SLSA provenance; `deploy-aws.yml` has never run. | `.github/workflows/deploy-aws.yml:111-161,164-230`; `terraform/modules/ecr/main.tf:9-11` | NIST SA-11/SI-7/SR-4 | new |
| INF-10 | Medium | Semgrep is advisory: job-level `continue-on-error`, `semgrep/semgrep:latest`, no `--error`; SIG F.2 and CM-003 say "Implemented". | `.github/workflows/semgrep.yml:36,38-39,50-58` | SOC 2 CC2.3 | open (July 08) |
| INF-11 | Medium | `.trivyignore` entries with no expiry, including the S3 public-access checks (AVD-AWS-0086/0087/0091/0093), CloudTrail 0016, Dockerfile DS002 and the chromadb pre-auth RCE (CVE-2026-45829); a new public bucket would pass the "blocking" scan. | `.trivyignore:7-24` | NIST RA-5/CA-7 | new; **closed by `14639fa3`** (P0-16a, 2026-09-25; the `if: always()` half is W2's) |
| INF-12 | Medium | Pinning gaps: `actions/checkout@v4` and `actions/github-script@v7` float inside a `contents: write` workflow that pushes to trunk; Dependabot lacks `github-actions` and `docker` ecosystems; `node:22-slim` not digest-pinned; Lighthouse installed with unpinned `npm i -g`. | `.github/workflows/prune-agent-branches.yml:47-48,58,95`; `.github/dependabot.yml`; `Dockerfile.optimized:3,48`; `.github/workflows/cerv2-staging-deploy.yml:313` | NIST SR-3/SR-11 | partial (July 0/137 → 146/148 pinned) |
| INF-13 | Medium | `pgaudit.log` is set but `shared_preload_libraries` is not, so database-level auditing does nothing. | `terraform/modules/rds/main.tf:97-101` | NIST AU-2/AU-12; HIPAA 164.312(b); Annex 11 §9 | new |
| INF-14 | Medium | RDS uses the AWS-managed key (`kms_key_id` defaults `""`, never passed); SIG D.2 implies a customer-managed key; snapshots cannot be copied cross-account. | `terraform/modules/rds/variables.tf:67-71`; `terraform/stack/main.tf:193-208` | NIST SC-12/SC-28; HIPAA 164.312(a)(2)(iv) | new |
| INF-15 | Medium | Single region, no cross-region or cross-account backup copy, one NAT gateway; the DR proof is a synthetic CI Postgres (5 green weekly runs 08-28 → 09-21); no RDS point-in-time restore rehearsed; RTO/RPO unmeasured; DR evidence retained 7 days. | `.github/workflows/database-dr-restore-proof.yml:28-72`; `docs/operations/database-disaster-recovery.md:3-6`; `terraform/modules/vpc-secure/main.tf:57-67` | NIST CP-4/CP-9/CP-10; SOC 2 A1.2; HIPAA 164.308(a)(7); Annex 11 §7.2, §16 | partial |
| INF-16 | Medium | Placeholder secrets in `.env.example` pass the boot checks, which test length (≥32) only; SIG F.4 says the boot "refuses weak secrets". | `.env.example:290,294,298,307,317`; `server/config/environment.ts:126,268` | NIST IA-5(1) | new |
| INF-17 | Medium | Accepted-risk flags boot production with a log line and the deploy preflight does not reject them: `AUDIT_SEAL_ACCEPT_UNSEALED`, `AI_GOVERNANCE_ACCEPT_PERMISSIVE`, `CONCEPT2CURE_SIGNER_ACCEPT_HMAC`, `STORAGE_ACCEPT_LOCAL_DISK`, `DB_SSL_ALLOW_UNVERIFIED`. | `server/services/audit/auditSealPosture.ts:67-69`; `server/db/ensureCoreTables.ts:293-295`; `.github/workflows/deploy-aws.yml:341-423` | NIST CM-6/CM-7; Annex 11 §12 | new |
| INF-18 | Medium | Secrets Manager entries have no customer-managed key and no rotation; symmetric seal keys are not rotatable in code; Terraform-generated database passwords live in state (the state bucket is on a customer-managed key). | `terraform/modules/secrets/main.tf:13-26`; `terraform/stack/main.tf:67-81` | NIST SC-12/IA-5 | new |
| INF-19 | Medium | Evidence artifacts live only in GitHub (release evidence 90 d, SBOM 90 d, DR evidence 7 d); nothing exports them to the object-locked evidence bucket. | `.github/workflows/ci.yml:1798-1804,1993-1997`; `.github/workflows/release-evidence.yml:29-33` | Annex 11 §7.1, §17; NIST AU-11 | new |
| INF-20 | Medium | `cerv2-staging-deploy.yml` runs `ci:dependency-risk` with `continue-on-error` (contradicting WO-07); the RC job force-pushes tags with `\|\| true` under `contents: write`; the RC name is interpolated into shell. | `.github/workflows/cerv2-staging-deploy.yml:128-130,341,362-368`; `docs/security/WO-07-dependency-risk-decision.md:43-45` | NIST CM-3 | new |
| INF-21 | Medium | Sub-processor lists disagree (trust statement: AWS, Anthropic, GitHub; DPA Annex III adds Stripe, Sentry, OpenAI/Moonshot and drops GitHub/Neon; VM-006 adds Neon); the SCC and transfer annex are blank; Moonshot AI is a fallback lane. | `docs/security/TRUST_STATEMENT.md:55-59`; `docs/commercial/DATA_PROCESSING_ADDENDUM.md:259-275`; `POLICY-VM-006 §1` | GDPR 28/30/44-46; APPI 28; ISO A.5.19-22 | new |
| INF-22 | Medium | A `neondb_owner` password remains in git history; the repository's own note says it "must be treated as compromised and rotated"; no evidence it was; the committed-secrets gate scans the working tree only. | `docs/getting-started/AUTH_CREDENTIALS_LOCKED.md:24-34`; `scripts/ci/check-committed-secrets.mjs:14-26` | NIST IA-5/IR-4 | open (rotation, founder); **history scan in CI 2026-09-26** (P0-17 eng half, W2; it also found a second Neon owner password, a Hugging Face token and a non-expiring demo token: `docs/evidence/W2/2026-09-26-p0-17-history-secret-scan/`) |
| INF-23 | Low | `secret_arns` still defaults to `["*"]` in the module (the one caller overrides it). | `terraform/modules/ecs-fargate/variables.tf:93-97`; `terraform/stack/main.tf:258` | NIST AC-6 | open (June 2.7) |
| INF-24 | Low | CI installs with `npm install` rather than `npm ci` in Lint, Build, Security Scan (SBOM, Trivy), Nightly, db-schema-validation and neon-preview. | `.github/workflows/ci.yml:55,1747,1785,1872`; `.github/workflows/db-schema-validation.yml:63`; `.github/workflows/neon-preview-db.yml:174` | NIST SR-4 | new |
| INF-25 | Low | Container: `chown -R appuser /app` lets the runtime rewrite its own code; no read-only root filesystem; the raw `server/` tree with its tests ships in the image. | `Dockerfile.optimized:117,175` | NIST CM-7 | partial |
| INF-26 | Low | Compose files: Redis without a password on 6379; Postgres `sslmode=prefer`; beta shows demo login by default; staging uses privileged KinD, `:latest` images and a `LOCALSTACK…:-dev` token. | `docker-compose.yml:53-57,87`; `docker-compose.beta.yml:144`; `docker-compose.staging.yml:6-17,108` | NIST CM-7 | partial |
| INF-27 | Low | Committed demo credentials (founder e-mail plus `demo123` for an admin account); the master-admin e-mail is a hard-coded fallback and Terraform does not set `MASTER_ADMIN_EMAILS`. | `start.sh:66-67`; `start-platform.sh:77`; `server/services/entitlements/master-admin.ts:96` | NIST IA-5/AC-2 | new |
| INF-28 | Low | Stale deployment configurations remain (`app.yaml`, `.replit-ci.yml`, `charts/`, `helm/values-local.yaml`; `neon-preview-db.yml:175` calls a non-existent `test:unit`), and ten stale `claude/*`/`codex/*` branches survive on origin despite Rule 0. | as cited; GitHub `list_branches` | NIST CM-8 | open (July 10.5/10.6) |
| INF-29 | Low | The S3 gateway endpoint has no route tables; the KMS interface endpoint's security group has no ingress and private DNS is off (both ineffective); app log groups have no KMS key and 90-day retention; RDS pinned to PostgreSQL 15.4. | `terraform/modules/vpc-secure/main.tf:85-110`; `terraform/modules/ecs-fargate/main.tf:18-28`; `terraform/environments/production/main.tf:54` | NIST SC-7/SI-2/AU-9 | new |
| INF-30 | Low | Workflow secrets interpolated into `run:` text; the Neon URL with password written to `GITHUB_ENV` without `add-mask`; an unused `id-token: write`; baseline and prune bots push `[skip ci]` commits to trunk with `GITHUB_TOKEN`. | `.github/workflows/c2c-agent.yml:50`; `.github/workflows/neon-preview-db.yml:28,71-84`; `.github/workflows/terraform-compliance.yml:8-11`; `.github/workflows/repo-health-baseline-refresh.yml:26-27,54-65` | NIST AC-6/SC-28 | new |
| INF-31 | Low | 32 moderate advisories need major upgrades (`@sentry/node`, `@anthropic-ai/sdk`, `csv-parse`); `crypto-js`, `node-fetch@2` and `express-session` are unused production dependencies; the risk ledger carries two stale rows and a team-string owner expiring 2026-11-25; no license tooling. | `gates/npm-audit-json.txt`; `docs/security/dependency-risk-ledger.json`; `docs/security/WO-07-dependency-risk-decision.md:54` | NIST SI-2/SR-3 | partial (50 → 32) |
| INF-32 | Low | `security.txt` points its Policy at `/SECURITY.md`, which is not served, and builds Canonical from the Host header; `SECURITY.md` claims "secure cookies" and "short JWT expiration" (bearer tokens, 1 day); the trust statement's contact is "to be published". | `server/routes/well-known.ts:14-31`; `SECURITY.md`; `docs/security/TRUST_STATEMENT.md:61-63` | SOC 2 CC2.3 | new; **closed by `ee35804a`** (P1-14, 2026-09-25: Policy served at `/.well-known/security-policy`, Canonical from `APP_URL`; the questionnaire and trust statement corrected; the sub-processor list is INF-21's) |
| INF-33 | Low | `.gitignore` covers `*.tfstate` but not `*.tfvars`, while the Terraform README tells operators to copy one. | `.gitignore:167-168`; `terraform/README.md:36,46` | NIST CM-6 | new |

### 4.4 Added by the first weekly security lens, same commit (`docs/evidence/reviews/2026-09-24/security.md`)

The lens re-verified every §3.2 finding as still open at `adbf2d18`, sampled eleven launch-catalog mutation routes
(ten prove tenant ownership in the handler), enumerated the ~45 AnA write tools behind the six apps (three confirm
with a person), found no second door added in the last 48 hours, and raised three ids:

| Id | Sev | Finding | Evidence | Hook | Status |
|---|---|---|---|---|---|
| DP-31 | Medium | A QMS change-control record is approved with no ceremony on either door: the AnA tool `qms_change_transition` is ungoverned, its "reason" is three characters of model output and its audit write is fire-and-forget after the stamp; the HTTP twin's only control on `approved` is segregation of duties. | `server/services/ana/AnaToolExecutor.ts:13765-13790`; `server/routes/mdx-qms.ts:1351-1398`; `server/services/qms/changeControl.service.ts:203-215`; `server/services/ana/governed-tool-gate.ts:96-117` | 11.10(d), 11.50, 11.200(a)(1); Annex 11 §14; ICH Q10 3.2.3 | new |
| DP-32 | Low–Medium | An effective controlled document is retired without a ceremony from chat or HTTP; the AnA door's reason is optional. | `AnaToolExecutor.ts:13649-13690`; `mdx-qms.ts:680-700` | 11.10(d)(e), 11.50; Annex 11 §9, §14 | new |
| DP-33 | Low | `DELETE /api/authoring/docs/:docId` is authorised by a static `x-admin-token`, deletes with no tenant predicate and writes an actor-less audit row; contained today by `authoringObjectAuthorization` in front of it and by `ADMIN_TOKEN` being unset everywhere. `ci:regulated-delete-audit` is satisfied by a row an inspector cannot attribute. | `server/routes/authoring.router.ts:4882-4920`; `server/middleware/authoringObjectAuthorization.ts:174-178`; `.env.example:817` | 11.10(d)(e)(g); Annex 11 §17 | new |

With these, the register stands at **84** at the audited commit (1 Critical, 23 High, 38 Medium, 22 Low), two of the
Highs closed at head as noted. The lens's tool-layer evidence also widens DP-08: every "reason" an AnA write captures is
authored by the model.

### 4.5 Added by the weekly review's second pass, 2026-09-24 (`docs/evidence/reviews/2026-09-24/lenses.md`)

Found by the security-auditor lens at `5117c0cf` and re-traced by a second agent told to refute them. Both came in
as High, and the refuting agent confirmed each one and cut it to Medium.

| Id | Sev | Finding | Evidence | Hook | Status |
|---|---|---|---|---|---|
| DP-34 | Medium | `/api/qms/*` is a second QMS write API guarded only by `authenticateToken`. A `viewer` can retire or supersede an **effective** controlled document (no reason field, no signature, no `superseded_by_id`), requalify or revoke a supplier, and disposition nonconforming product. The supplier, nonconformance, training, audit and management-review writes record **no audit row**, and an omitted disposition rationale silently keeps the previous one. No client calls it. The canonical `/api/mdx/qms/*` doors carry the same capabilities with audit rows. | `server/routes/qms.ts:91-103,148-159,208-219`; `server/services/qms/qms.service.ts:61-89,150-162,224-234`; `server/bootstrap/register-document-routes.ts:270` | 11.10(d)(e)(g); 820.50, 820.90; Annex 11 §9 | new |
| DP-35 | Medium | Authoring freeze locks a document and makes it count as `finalized` for eCTD leaf completeness and the IND checklist, with no re-authentication and no org-level signing authority. A document owner (every creator) or approver suffices. The sibling `/e-sign` and `/sign` handlers call both checks. | `server/routes/authoring.router.ts:3673-3880` (vs `:3901,3923`, `:5526,5548`); `server/services/coauthor/coauthor-snapshot.ts:101-103`; `server/services/ectd/leaf-source-resolver.ts:140` | 11.10(d)(g); Annex 11 §12 | new |

With these, the register stands at **86**.

## 5. Verified strengths (with the file that proves each)

**Boot and posture.** Production refuses to start on: an unrecognised `NODE_ENV`; missing or short JWT, previous-JWT
and refresh secrets (refresh must differ); missing MFA key; `RLS_ENFORCE` not `on`; missing audit seal key and chain
secret; a permissive AI-governance or sensitive-placement posture; no durable storage; a missing or `dev` signer
mode; a missing connector key; forbidden dev-route flags; an invalid `TRUST_PROXY_HOPS`; a superuser runtime role
(`server/config/environment.ts:35-315,393`; `server/services/signature/signer-mode.ts`; `server/startup/env.ts:47-78`;
`server/config/trust-proxy.ts:34-40`; `server/db/rlsEnforcement.ts:311`).

**Identity and sessions.** Access tokens must declare their class and every HTTP verifier applies it
(`server/middleware/tokenType.ts:63-69` at `server/middleware/auth.ts:140`, `server/auth.ts:167`, every `/api/auth`
handler, `server/mcp/auth/platform-token.ts:74`, the collaboration socket); every HTTP authentication checks
revocation and account standing and answers 503 when it cannot (`server/middleware/auth.ts:168-187`;
`server/services/token-revocation.ts:218-226`); JWT algorithm pinned to HS256 with a rotation window
(`server/utils/jwtVerify.ts:79-99`); one-time credentials are compare-and-set (TOTP `server/services/mfaService.ts:305-317`,
emailed code `server/services/emailOtpService.ts:98-139`, reset token `server/routes/auth.ts:2080-2111`); MFA setup cannot
replace an enrolled factor and the QR code is drawn server-side (`mfaService.ts:374-404`); reset links only on `APP_URL`
(`server/routes/auth.ts:1889-1906`); a single trust-proxy source; a default-deny `/api` boundary with a strict matcher
plus a second unconditional gate (`server/middleware/authBoundary.ts:60-119`; `server/bootstrap/register-platform-routes.ts:242-275`);
`requireRole` allows no org-admin stand-in and the platform and business guards deny on database error
(`server/middleware/auth.ts:333-454`); the org-membership re-check fails closed (`server/middleware/orgMembership.ts:336-394`);
the collaboration socket checks class, membership, lifecycle and per-document authorization
(`server/services/hocuspocus-server.ts:211-300`); dev-login needs `NODE_ENV=development` and `ALLOW_DEV_AUTH=1`
(`server/routes/sso.ts:607,625`).

**Transport and input.** Strict production CSP with nonce and `strict-dynamic`, HSTS preload, Permissions-Policy, a
CORS allow-list (`server/middleware/enterprise-security.ts:213-398`); prototype-pollution scrub after the body parsers
(`server/startup/middleware.ts:104`); API keys hashed, all-scopes `requireScope`, admin-only creation, 503 on store
failure (`server/routes/api-keys.ts:55-57`; `server/services/api-key-service.ts:77-81`); antivirus fails closed in
production (`server/middleware/uploadSafety.ts:178-196`); DNS-pinned `safeFetch` for the connectors; a path-containment
helper (`server/utils/document-file-roots.ts:66-107`); DOMPurify as the single HTML sanitizer
(`client/src/concept2cure/components/ana/renderSafeMarkdown.ts:135-146`); Firecrawl, Stripe and SAML signatures fail
closed (`server/services/saml-provider.ts:115-139`); no `sql.raw` carries request data (`server/services/grdhe/grdheService.ts:1432-1458`).

**Tenant isolation.** RLS policies compile to enforcement under `app.rls_enforce='on'`, the runtime role is
`NOSUPERUSER NOBYPASSRLS`, the pool applies the tenant scope per statement, 54 real-database proofs under `tests/db/`
and the full-schema two-tenant contract run in CI (`server/db/rlsEnforcement.ts`; `scripts/db/provision-app-role.mjs`;
`tests/schema-contract/rls-two-tenant-full-schema.contract.test.ts`); export and purge share one vault predicate
(`server/services/tenant/vault-tenancy.ts`).

**Audit and signatures.** One per-tenant `audit_logs` chain with an advisory lock and a `chain_seq` trigger that refuses a
tenant mismatch (`server/services/audit/chain.ts:11-50`; `migrations/20260921_audit_logs_chain_seq.sql:91-120`); HMAC
seals keyed outside the database with a boot-gated key (`server/services/audit/auditSealPosture.ts`;
`server/lib/tamper-proof-audit.ts:302-312`); `reverifySigner` checks standing, lockout, password and enrolled factor,
fails closed and counts attempts (`server/services/part11/reverify-signer.ts:100-290`); one signature INSERT requiring a
digest and a binding basis (`server/services/part11/signature-persistence.ts:286-362`); atomic governed writes for QMS
approval, submission release, vault ingest and program archive (`server/services/qms/document-approval-signature.ts:22-33`;
`server/routes/submission-sign-release.ts:262-380`; `server/services/vault/vault-ingest.service.ts:440-649`;
`server/routes/c2c/projects.ts:1600-1650`); the signed export refuses to claim "intact" over unhashed rows; the retention
job loads legal holds before deleting and aborts if it cannot (`server/jobs/retentionCron.ts:95-167`); auth events are
audited in the user's tenant scope (`server/services/audit/auth-event-audit.ts`).

**AI governance.** The placement decision runs before every gateway dispatch with a production boot requirement
(`server/services/ai-gateway/sensitive-placement-policy.ts:117-127`); org residency defaults apply to every request
(`server/services/ai-gateway/gateway.ts:1112-1115,2852-2880`); the bypass gate matches calls, hostnames and client
factories; the PII screen blocks by default in production (`server/startup/ai-governance-posture.ts:18`); MCP tools carry
scope and governed flags and scope denials are audited (`server/mcp/tools/runtime.ts:185-201`).

**Cloud and pipeline (as written in Terraform; not yet applied).** OIDC-only deploy roles trusting one GitHub environment
and tightly scoped `RunTask`/`PassRole` (`terraform/modules/github-deploy-roles/main.tf:61-129`); the image pinned by
digest and a boot-contract preflight before the roll, with a smoke test through CloudFront that fails closed
(`.github/workflows/deploy-aws.yml:290-439,520-616,704-733`); an ALB that answers CloudFront alone, TLS 1.3/1.2, no
port 80 (`terraform/modules/alb/main.tf:23-85,117-142`); RDS encrypted, `force_ssl`, Multi-AZ, 35-day backups, deletion
protection, pinned CA and `verify-full` URLs; an evidence bucket with COMPLIANCE object lock for 2555 days and a
multi-region CloudTrail with log-file validation (`terraform/modules/compliance-evidence/main.tf`); a vault bucket on a
customer-managed key usable only through S3 (`terraform/stack/vault_storage.tf`); a KMS RSA-4096 release-signing key
only the task role may sign with (`terraform/stack/release_signing.tf:41-86`); a state bucket that refuses SSE-S3 and
non-TLS (`terraform/bootstrap/main.tf`); ECR immutable tags with scan-on-push; ECS Exec off; private subnets; a
multi-stage non-root image that verifies veraPDF's SHA-256 and refuses a bundle importing dev dependencies
(`Dockerfile.optimized:24,87-96,181`); 146 of 148 GitHub Actions pinned to a commit SHA, every workflow with
`permissions:`, no `pull_request_target`; CodeQL green per trunk commit; a lockfile-sealed dependency-risk gate.

## 6. Disposition of the prior assessments

| Source | Items | Verified closed | Still open | Regressed / newly wrong |
|---|---|---|---|---|
| June 2026 swarm §3 backlog (11 items) | storage org scoping; `project-sections` fallback; `document-data-center` routes; audit attribution; SQLi; token-type confusion; distinct refresh secret; API-key scopes; dedicated MFA key; `.gitignore` | 8 (P0-1, P0-2, P0-3, P1-6 parts, SQLi, `.gitignore`, MFA key, API-key scopes) | `audit_events` seal (DP-12); upload safety (IAM-14); error leaks (IAM-18); SSRF on webhooks (IAM-13); workflow permissions/SHA pins (closed except INF-12); Terraform `secret_arns` default (INF-23); prompt-injection on the tool loop (DP-08) | the swarm marked SSRF "cleared" and the webhook path is still bare (IAM-13) |
| July 2026 audit ch.15 stages 0–3 | 0.1–0.8; 1.1–1.11; 2.1–2.14; 3.1–3.7 | 0.1–0.5, 1.4, 1.5, 1.7 (as the ledger says); 2.1 (`SECURITY.md`, one line left, DP-23); 2.9 (146/148); 2.11 (PII block in production); 1.9 (citation SSRF not exploitable) | 0.6 env-var gate (still wired to nothing; CM-003 marks it Implemented); 0.7; 1.8 (IAM-14); 2.2 (RLS on, staging owed); 2.4/2.5 (INF-15/INF-06); 2.10 chromadb (INF-11); 3.1 promote-artifact (DP-02); 3.3 scheduling of verify/retention (DP-06, DP-20); 3.6 | 3.3 partly regressed: the request interceptor and monitor are off in the production configuration (DP-06) |
| Launch ledger D5 progress note ("every signing path re-verifies the signer through one ceremony") | — | the `electronic_signatures` writer, QMS approve, release, lifecycle route | 23 baselined writers, the artifact status route and `authoring_signatures` (DP-02, DP-16); revocation (DP-03) | the note overstates: "every" is not true at head |
| Launch ledger D6 progress note ("three sign-in defects closed…", "recovery codes unredeemable… open for the owner") | — | logout ends the access-token session; TOTP consume-once; client IP single source | recovery codes and email fallback (IAM-08); refresh-token residual (IAM-04) | logout does not end the refresh token, so "logout never ended a session (AUTH-03)" is only half closed |
| Work-order board hand-offs (2026-09-24) | `AUTH_BOUNDARY_MODE=warn` in production; AnA `approve_qms_document`; `x-org-uuid` fallbacks; purge defects; artifact status signatures | AnA QMS approval (`e1c224f6`); purge transaction, hold, truncated export, bytes (`2ddb77b0`) | `warn` in production (IAM-16); nine header fallbacks (IAM-15); artifact status signature (DP-02); purge audit row and coverage (DP-10 residual) | — |

## 7. Claims register

Every entry is a statement a buyer could be sent today. **Verified** = true at `adbf2d18` as written; **partial** =
true with a material caveat the document does not state; **refuted** = not true as written; **unverifiable here** =
needs a deployed environment or a live account. The correction to each refuted or partial document is a plan item
(P1-14 unifies the disclosure surface).

### 7.1 SIG-Lite questionnaire (`docs/security/SECURITY_QUESTIONNAIRE_SIG_LITE.md`)

| # | Claim (abridged) | Verdict | What decides it |
|---|---|---|---|
| A.1 | Documented information-security policy (DRAFT) | partial | eight policies exist, all unsigned 0.1 drafts; no recurring risk register (`policies/README.md`) |
| B.1 | Tenant data segregated by RLS, enforced at boot, non-superuser role | verified in code; unverifiable here in deployment | `server/db/rlsEnforcement.ts`; `scripts/db/provision-app-role.mjs:245`; nine client-supplied keys remain contained by RLS only (IAM-15) |
| B.2 | An isolation test exists | verified | 54 `tests/db/*.dbtest.ts`; full-schema two-tenant contract in CI |
| B.3 | AI provider placement honours residency; failover never crosses | partial | true for gateway dispatch (`sensitive-placement-policy.ts:117-127`); embeddings bypass the gateway entirely (DP-07) |
| B.4 | Retention and deletion policy documented; governed records immutable | partial | immutability triggers exist with a session-settable bypass (DP-04); retention clock and legal-hold API not implemented (DP-20) |
| B.5 | Customer data not used for training; ZDR lane available | partial | the ZDR lane exists (`gateway.ts:2318-2325`); the embeddings path sends vault text to OpenAI with `OPENAI_ZERO_RETENTION=false` (DP-07) |
| C.1 | Unique accounts | verified | `users.password_hash`; `resolve-signer-identity.ts` |
| C.2 | Password ≥12 with complexity; bcrypt cost 12 | verified (composition only) | `auth-security-service.ts:45-88`; no breached-password screening (IAM-17) |
| C.3 | TOTP with encrypted seeds; required at signing when enrolled; not mandatory | partial | a TOTP-enrolled account still signs in with an emailed code; recovery codes unredeemable (IAM-08) |
| C.4 | 5 failures → 30-minute lockout | partial | implemented as read-then-write: races and fails open on a write failure (IAM-09) |
| C.5 | SAML module exists, not wired for a customer | verified | and not tenant-bound when it is wired (IAM-03) |
| C.6 | Role-based access; signing authority is a policy | partial | `requireRole` routes read the role from a stale JWT (IAM-10) |
| C.7 | Signed JWT + distinct refresh secret, boot-enforced; access lifetime 1 day | verified for the secrets (`environment.ts:203-241`); partial for session management | logout does not revoke the refresh token; revocation memory is 24 h against a 7-day refresh; no idle logoff (IAM-04, IAM-06) |
| C.8 | Access reviews not yet performed | verified (honest) | — |
| C.9 | No production account yet | verified | — |
| D.1 | TLS 1.2/1.3 at the load balancer (Terraform, not applied) | verified as written | `terraform/modules/alb/main.tf:27` |
| D.2 | RDS encrypted with a KMS key; evidence bucket KMS + object lock | partial | RDS is on the AWS-managed key, not a customer-managed one (INF-14); the evidence bucket claim is verified |
| D.3 | MFA seeds and connector credentials AES-256-GCM under dedicated keys; boot refuses without them | verified | `mfaService.ts:190`; `connector-registry.ts:81`; `environment.ts:263-278` |
| D.4 | SOP-SEC-001; KMS signer implemented with a fake KMS, not executed live | verified as written | — |
| D.5 | Symmetric key rotation not supported | verified (honest) | DP-23 |
| E.1 | Immutable audit trail: three chained tables, UPDATE/DELETE refused by trigger; runtime role SELECT+INSERT only on the audit schema | **refuted** in part | the grant claim is true only for `audit.tamper_proof_log`; `audit_logs` and `audit_events` live in `public`, where the role holds DELETE, and the `audit_logs` trigger yields to a setting the role can set itself (DP-04, reproduced) |
| E.2 | SHA-256 chains plus HMAC seals; `audit_events` seal deferred | partial | as stated for `audit_logs` and `tamper_proof_log`; `audit_events` unsealed and its hash covers 9 fields (DP-12) |
| E.3 | Integrity verifiable on demand; proven by corrupting a row | verified | `docs/evidence/W3b/2026-09-20/`; note it is scheduled by nothing (DP-06) |
| E.4 | E-signatures: one write path, manifestation, binding, re-authentication, supersession; second route removed | partial | 23 HTTP writers and a status route skip the ceremony (DP-02); revocation is refused by the trigger (DP-03, reproduced); meaning may be null (DP-17) |
| E.5 | KMS RSA signature, verifiable online and offline; live path unexecuted | verified as written | — |
| E.6 | SIEM export admin-only, rate-limited | verified | `server/routes/admin/audit-siem.ts:42` |
| E.7 | Log retention same as the records | partial | immutability yes; no retention clock (DP-20) |
| F.1 | Single branch, CI gates, control-tower review; no independent reviewer | partial | the branch is unprotected and CI blocks nothing (INF-01); the answer omits both |
| F.2 | SAST: CodeQL and Semgrep in CI | partial | CodeQL yes; Semgrep is `continue-on-error` (INF-10) |
| F.3 | Dependency gate sealed to the lockfile | verified | `gates/ci_dependency-risk.txt` |
| F.4 | No secrets in source; boot refuses weak or absent secrets | partial | working tree clean (`gates/ci_committed-secrets.txt`); a database credential remains in history (INF-22); the boot check is length-only (INF-16) |
| F.5 | Separate staging and production | verified as Terraform | `terraform/environments/` |
| F.6 | Change control for the validated state: planned | verified (honest) | — |
| G.1 | Backups and a restore drill; not timed on production | verified as written | synthetic CI Postgres only (INF-15) |
| G.2 | RTO/RPO targets, not measured | verified (honest) | — |
| G.3 | Incident response plan (DRAFT), no tabletop | verified as written | — |
| G.4 | Breach notification 72 h to tenants | partial | the DPA says [48] h (counsel to align; INF-07); IR-004 §3a now states the regulator clocks and SIG G.4 answers from it (2026-09-26) |
| G.5 | Boot security self-test; readiness probe; CloudTrail; no GuardDuty/WAF | verified as written | and no alerting at all (INF-06) |
| H.1 | Provider list | verified | `approved-models.ts` |
| H.2 | Tenants can restrict providers and regions; never crosses | partial | embeddings (DP-07) |
| H.3 | Every governed action needs a human re-authenticated signature; figures from deterministic engines | partial | model output executes 37 write commands without confirmation (DP-08); 23 sign writers skip the ceremony (DP-02) |
| H.4 | PII screen default block in production | verified | `server/startup/ai-governance-posture.ts:18` |
| H.5 | BAA not signed | verified (honest) | — |
| H.6 | PQ evidence not filed | verified (honest) | — |

### 7.2 Trust statement (`docs/security/TRUST_STATEMENT.md`, "What is in place today")

| Bullet | Verdict | What decides it |
|---|---|---|
| Every audit table is append-only; triggers refuse updates and deletes | **refuted** in part | `audit_logs` deletes pass with a session setting (DP-04, reproduced); domain history tables and two signature stores have no triggers (DP-15, DP-16) |
| SHA-256 hash-chained and sealed with an HMAC key held outside the database | partial | `audit_events` unsealed (DP-12); the keys sit in the same task as the owner credential (DP-05) |
| An integrity verifier walks every chain; proved by corrupting a row | verified | W3b evidence; scheduled by nothing (DP-06) |
| One signature substrate; re-entry of password and TOTP at signing; binding; append-only supersession | partial | DP-02, DP-03, DP-16, DP-17 |
| Fail-closed production boot (secrets, RLS, seal keys, signer mode) | verified for those four; partial overall | `AUTH_BOUNDARY_MODE=warn` and five `*_ACCEPT_*` flags are honoured in production (IAM-16, INF-17) |
| Tenant isolation: RLS enforced, least-privilege role, CI gates | verified in code | deployment unverifiable here; IAM-15 residual |
| Governed AI: engines produce figures; approved registry; placement never crosses; PII screening on | partial | DP-07 (embeddings), DP-08 (auto-run writes), DP-29 |
| Secure development: single branch, CodeQL and Semgrep, sealed dependency gate, ratchet | partial | Semgrep advisory (INF-10); the branch is unprotected and trunk CI red (INF-01) |

### 7.3 DPA Annex II (`docs/commercial/DATA_PROCESSING_ADDENDUM.md`, technical and organisational measures)

| Measure | Verdict | What decides it |
|---|---|---|
| Emailed one-time code required at login for every user; TOTP opt-in | verified for the password path | `server/routes/auth.ts:602-646`; `docs/evidence/W2/2026-09-24-smtp/` |
| JWT session tokens with short expiry | **refuted** | 1-day access tokens, 7-day rolling refresh, perpetual enterprise renewal (IAM-04, IAM-06) |
| SSO/SAML configurable per domain | verified as existing | not tenant-bound (IAM-03) |
| RLS enforced under the app role; not yet proven on staging | verified (honest) | — |
| TLS at ingress; RDS volume encryption and KMS-managed keys | partial | AWS-managed key, not customer-managed (INF-14) |
| Append-only audit trail with chain and HMAC seal; chain verifier; signed exports with offline-verifiable attestation | partial; "offline-verifiable" **refuted** | the signed export covers `audit_events` only and uses a symmetric key an inspector cannot hold (DP-11); DP-04 |
| Compliance-evidence bucket, COMPLIANCE object lock, 7 years | verified as Terraform | `terraform/modules/compliance-evidence/main.tf` |
| RDS Multi-AZ, 35-day backups, deletion protection; documented restore drill | verified as Terraform; drill synthetic | INF-15 |
| Sentry monitoring; external uptime monitoring; `/readyz` | partial | no DSN in the deployment; uptime provider unnamed (INF-06) |
| Helmet; CSRF double-submit; Redis-backed rate limiting; Zod; parameterised queries; dependency and secret scanning | partial; "CSRF double-submit" **refuted** | `csrf.ts` is unmounted, the live control is an origin check (acceptable for bearer auth, but not what is written); Redis not provisioned (INF-06); no headers on the SPA document (INF-04) |
| Protected product branch, required CI gates, release ledger, break-glass | **refuted** | `concept2cure-v2` is unprotected with no required checks (INF-01) |

### 7.4 Policies (controls marked "Implemented" that are not fully true at head)

| Policy | Claim | Verdict | What decides it |
|---|---|---|---|
| IS-001 §3 | Production refuses to boot without its security posture | partial | IAM-16, INF-17 |
| IS-001 §3 | One canonical implementation: `electronic_signatures` single writer | partial | DP-02, DP-16 |
| AC-002 §1 | Dev-login never reachable in production | verified | two flags required; Terraform sets `NODE_ENV=production` |
| AC-002 §1 | Session tokens: signed JWT + refresh, distinct secrets | partial | IAM-04 |
| AC-002 §2 | Least privilege on the audit schema (SELECT+INSERT) | verified for `audit.*`; materially incomplete | the public audit tables carry DELETE (DP-04) |
| AC-002 §3 | Re-authentication at the moment of signing; client cannot assert its own authentication | partial | DP-02 (23 writers; `session_jwt` attestation) |
| CM-003 §2 | Static analysis: CodeQL, Semgrep, ESLint ratchet | partial | INF-10 |
| CM-003 §2 | Environment-variable documentation gate | **refuted** | no script or workflow invokes it (July 0.6 still open) |
| CM-003 §3 | Image built once, promoted staging → production | partial | `deploy-aws.yml` targets production only and has never run (INF-09) |
| IR-004 §2 | SIEM export; audit-chain verifier | verified | — |
| BR-005 §2 | Restore proof workflow in CI | verified (synthetic) | five green weekly runs |
| VM-006 §3 | Every model call goes through the gateway (CI-enforced) | partial | 8 baselined bypasses; embeddings outside the gate (DP-07) |
| VM-006 §3 | Placement never crosses residency/ZDR | partial | DP-07 |
| DR-007 §1 | Audit trails: UPDATE/DELETE refused by trigger | **refuted** in part | DP-04 |
| AI-008 §2 | Human-in-the-loop: the model cannot sign; governed actions require a human signature | partial | DP-08, DP-02 |

## 8. Gate and test results at `adbf2d18`

| Check | Result | Note |
|---|---|---|
| `npm run test:security` | 45 files, 377 tests pass | `tests/test-security.txt` |
| `qms-effective-only-by-signature` + `ana-cannot-sign` | 2 files, 28 tests pass | closes DP-01 |
| 29 read-only gates (list in `gates/SUMMARY.txt`) | pass | baselines: discarded-audit-write 133/60 files; sign-ceremony 23; session-scoped-rls-bypass 34; drizzle-tenant-scope 151 (25 fixes unbanked); gateway-bypass 8; tenant-isolation 8 current / 9 baseline |
| `ci:server-error-leaks` | **red** | 147 sites vs baseline 146 (`server/routes/c2c/commitments.ts:156`) |
| `ci:dead-audit-catch` | **red** | false positive on comment text (`templateStore.ts:80`); the gate blocks in `ci.yml:556-560` |
| `npm audit` | 0 critical, 0 high, 32 moderate | majors needed for `@sentry/node`, `@anthropic-ai/sdk`, `csv-parse` |
| `scripts/ops/ga-readiness-report.mjs` | 6 of 41 ready; 18 blockers; 17 advisories | includes "Database backup / restore rehearsal" as a blocker |
| `check:compliance-claims` | pass | 830 customer-facing files |

## 9. Reproductions (all filed under `docs/evidence/D6/2026-09-24-security-audit/repro/`)

| Id | How | Outcome |
|---|---|---|
| IAM-01 | The real `registerAnaRealtime` middleware driven with a JWT carrying the `createMfaChallengeToken` claims; the database-backed lookups inside `verifyLiveToken` stood in by the real `verifyJwtWithRotation` (neither lookup reads the token class) | the challenge token is admitted with `orgId`/`authUserId` set; the same token is refused by `nonAccessTokenReason`, which the main namespace applies and `/ana` does not (3 of 3) |
| DP-03 | PostgreSQL 16.13; `electronic_signatures` from the Drizzle baseline plus the three columns the companion migrations add; the trigger migration from the deploy set (index 54) | the exact revocation UPDATE raises `IMMUTABILITY_VIOLATION`; an UPDATE touching only `superseded_by`/`updated_at` succeeds |
| DP-04 | Same cluster; `audit_logs` from the baseline; the immutability migration (index 210); a `LOGIN NOSUPERUSER NOBYPASSRLS` role with the recipe's public-table privileges | plain DELETE refused; `BEGIN; SET LOCAL app.audit_archive_bypass='on'; DELETE; COMMIT` succeeds, `rows_left 0`; `has_table_privilege(... 'DELETE') = t` |
| DP-01 | The repository's own tests at `adbf2d18` | 28 of 28 pass: closed |

The scratch cluster had no `pgvector`, so the whole migration set was not applied; each reproduction applied only the
statements it needed and the transcript names them. The four are the only defects verified by execution; every other
row in §4 is verified by reading.

## 10. Open questions for the founder

1. Is `MCP_ENABLED=true` planned for launch (row D8)? If so IAM-02 is launch-blocking.
2. Which SAML configuration will production use, default `SAML_IDP_*` or `SAML_TENANTS`? It decides IAM-03's exposure.
3. Does any deployment expose `/socket.io` directly (staging, on-prem)? CloudFront does not route it; IAM-01 is
   Critical wherever the listener is reachable.
4. Should `AUDIT_TRAIL_ENABLED` and `AUDIT_REQUIRE_ENFORCE` be on in production? D5 and TM-001 assume the monitor runs.
5. Which model provider does production use, given Terraform provisions only an OpenAI key? Can embeddings move to a
   local or Bedrock lane before any tenant document is ingested?
6. Should signers be required to hold a second factor? Password-only signing is allowed when none is enrolled.
7. Will launch include Redis, a Sentry DSN, SMTP and an alert receiver? Is Moonshot reachable by default?
8. Has the `neondb_owner` credential in git history been rotated? Does the Neon default branch hold real data?
9. Who signs the eight policies, the trust statement and the SIG-Lite, and by when?
10. Time source: is Amazon Time Sync the declared trusted clock, and which clock rules the audit timestamps?

## 11. Documents this audit supersedes or corrects

- `docs/validation/CSRA-CORTEX-001-HIPAA_FDA_SECURITY_ASSESSMENT.md` (2025 draft): its "IMPLEMENTED" marks for
  automatic logoff, AES-256 at rest for the database, MFA and TLS 1.3 do not describe the platform as built. Retained
  for history; not to be sent to a buyer. The control map replaces its HIPAA table.
- `docs/security/SECURITY_README.md`: rewritten as an index of the live documents (it described Replit secrets, an
  `index-enhanced.ts` and a `setup-rls.js` that do not exist).
- `SECURITY.md` root policy: "secure cookies", "short JWT expiration" and "field-level encryption of identifiers" are
  corrected under plan item P1-14, because that file is what `security.txt` points a researcher at.
- The June swarm's "SSRF cleared" and the July audit's "monitor runs" statements are superseded by IAM-13 and DP-06.

*Prepared by the D6 security-audit session (`session_0194UQPxy9Er2ibRAjog8Ven`), 2026-09-24. No code was changed by
this session; every fix is an item in the remediation plan with an owner and an acceptance test.*
