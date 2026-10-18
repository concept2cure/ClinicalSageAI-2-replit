## Lane: Security & tenant isolation

Repo root for every path below: <repo> (HEAD 92ccdba1, checked out on branch claude/busy-carson-kr611v). Read-only; scratch output is under the assigned scratchpad/security/.

**Baseline handling.** My system instructions said to read docs/security/SECURITY_AUDIT_2026-09-24.md first. Your cold-evaluation rule forbids any file with AUDIT in its name. I followed your rule and did not open it, so every finding uses a fresh SEC-NN id. Where code comments cite baseline ids (IAM-xx, DP-xx, INF-xx) I say "closed in code (id taken from a code comment)". That means I re-read the closing code, not the document.

**How this was verified.** Everything is from reading code, Terraform and CI at HEAD, plus the 19 read-only gates and one `npm audit --package-lock-only`.

**Not verified** (no live DB, AWS, Redis, KMS or running server):
- actual RLS, trigger and grant state in a deployed database;
- whether the 103 "unreviewed" tables below are policed;
- whether an antivirus daemon exists outside Terraform;
- whether python3 is in the production image;
- whether the leaked credentials were rotated;
- GitHub branch-protection settings.

### Readiness score: 6.5/10

The authentication core is unusually strong and I re-verified it in code. It has:
- default-deny boundary with positive token-class assertion;
- server-enforced idle, absolute-lifetime and concurrent-session limits;
- mandatory MFA on the password door;
- revocation that outlives the token;
- membership and role re-read from the database on every request;
- hardened WebSocket transports;
- FORCE-RLS with boot-time catalog assertions;
- a fail-closed AnA tool-authorization register;
- SSRF and XSS sinks that are actually centralised.

What holds the score down is not the main doors but the second doors and the platform posture:
- Legacy and secondary routers were never brought up to the standard of the main path (QMS, Projects, MCP, first-run setup).
- The Terraform-defined production hands the API task the DB owner credential and both audit HMAC keys.
- That production has no Redis, no antivirus and no detective controls, and some Part 11 stores have no DB-level immutability.

Most fixes are small; a few are L.

### What is genuinely strong (keep)

- **Default-deny boundary.**
  - server/middleware/authBoundary.ts:57-75 forces enforce mode in production, and server/startup/env.ts:35-64 refuses AUTH_BOUNDARY_MODE=warn and the mock-route flags at boot.
  - The public allowlist is one module: server/middleware/public-api-allowlist.ts:29-74.
- **Token class, revocation and session end.**
  - authenticateToken asserts type=access (server/middleware/auth.ts:161), and HS256 is pinned (server/utils/jwtVerify.ts:87-92).
  - Revocation lives max(24h, token exp), so refresh tokens stay revoked (server/services/token-revocation.ts:57-68).
  - A password change ends older sessions (auth.ts:209). Idle, lifetime and superseded are enforced server-side per request (server/services/session-inactivity.ts:467-484). Refresh is not activity (auth.ts:1408-1420).
  - The role is taken from the membership row, not the token (auth.ts:284-310).
- **Login.**
  - MFA is always issued on /login (server/routes/auth.ts:647-697).
  - Failure limits are per account (server/middleware/sign-in-limits.ts).
  - A bcrypt timing pad closes account enumeration (server/services/login-timing-pad.ts). Lockout is 5 failures for 30 minutes.
  - Email OTP is capped at 5 attempts and 3 resends, with a 10-minute expiry (server/services/emailOtpService.ts:41-56).
  - TOTP steps are single-use via an atomic UPDATE (server/services/mfaService.ts:~300).
  - /mfa/setup refuses to overwrite an enrolled factor (auth.ts:1976-1992).
- **Dev auth.** It requires NODE_ENV=development and ALLOW_DEV_AUTH=1 (server/auth/dev-auth-policy.ts:22-27). ECS hard-sets NODE_ENV=production (terraform/modules/ecs-fargate/main.tf:142).
- **Tenant scope and RLS.**
  - Scope comes from the verified membership (server/middleware/establishRequestTenantScope.ts:201-278).
  - Pre-auth scope grants no role (server/db/tenantStore.ts:98-100).
  - The request client clears its GUCs on release and discards a connection released mid-transaction (server/middleware/lazyRequestDbClient.ts:96-135).
  - The boot posture check refuses a superuser, BYPASSRLS, or an owner of non-FORCE tables (server/db/rlsEnforcement.ts).
  - A trigger blocks minting staff roles in organization_users (migrations/20260926_organization_users_own_writes.sql:69).
- **Transports.**
  - socket.io: live-verified token, class check, membership and lifecycle checks, and a periodic re-check (server/socketServer.ts:243-330).
  - hocuspocus is flag-off by default; when on it has 7-step admission and a re-check timer (server/services/hocuspocus-server.ts).
- **Federated identity.**
  - SAML is bound to the tenant that owns the config, and IdP email cannot grant platform admin (server/routes/sso.ts:830-870; server/middleware/requirePlatformAdmin.ts:69-73).
  - SCIM tokens are per-tenant, hashed, with an IP allowlist.
- **SSRF.** DNS-pinned, per-hop re-validated safeFetch (server/utils/safeFetch.ts).
- **XSS.** All 12 non-trivial dangerouslySetInnerHTML sinks go through renderSafeMarkdown (marked plus DOMPurify allowlist, chat images stripped) (client/src/concept2cure/components/ana/renderSafeMarkdown.ts). The client bundle has no VITE secrets. CSP is nonce plus strict-dynamic.
- **AnA governance.** 568 read, 158 confirm, 17 refuse; an unknown tool defaults to confirm (server/services/ana/tool-authorization.ts:1-45). Confirm and e-signature tiers (server/routes/ana-ri/utility.ts:574-640). Tenant deny-list and launch-scope withheld tools (server/services/ana/governed-toolset.ts).
- **Governed writes done right.** These are the pattern to copy:
  - legal holds: server/routes/vault-legal-holds.ts:150-225;
  - vault ingest: fail-closed antivirus and a chained audit row in the same transaction;
  - QMS document approve, retire and change approve: server/routes/mdx-qms.ts:595, 1446;
  - submission sign-release: server/routes/submission-sign-release.ts:164;
  - tenant purge with legal-hold and export preconditions.
- **Infra and CI.**
  - Release signing uses an asymmetric KMS key, so the task can sign but no human can (terraform/stack/release_signing.tf).
  - CloudTrail is multi-region and KMS-encrypted. RDS has force_ssl and pgaudit. The vault bucket is KMS-encrypted and versioned. Deploy roles use OIDC with an environment-bound subject.
  - Deploy preflight rejects any *_ACCEPT_* variable, RLS_ENFORCE!=on, and missing audit flags (.github/workflows/deploy-aws.yml:~400-470).
  - Trivy is blocking with expiring ignores (2 entries, exp 2026-11-25). Gitleaks scans full history. The dependency-risk ledger gate blocks.
  - npm audit: 0 critical, 2 high (pptxgenjs/image-size, documented unreachable), 28 moderate.

### Route guard coverage sample

R = <repo>. "Session" means the org id is taken from req.user/req.tenantContext (the JWT boundary plus a DB membership re-check). Every row is behind the /api boundary unless noted.

| Route | File:line | Auth | Tenant source | Role/authority check | Verdict |
|---|---|---|---|---|---|
| POST /api/vault/ingest | R/server/routes/vault-ingest.ts:148; mount R/server/bootstrap/register-inline-routes.ts:863 | authMiddleware | session | requireEditorAccess; extension allowlist; magic bytes; antivirus fail-closed | PASS (antivirus service absent, SEC-01) |
| POST /api/vault/legal-holds, /:id/lift | R/server/routes/vault-legal-holds.ts:246-248 | authMiddleware | session | holdAuthority; chained audit in txn | PASS |
| GET /api/mdx/vault, /:artifactId | R/server/routes/mdx-vault.ts:105,324; requireTenantContext at register-inline-routes.ts:1200 | boundary | session (org in SQL) | read only | PASS |
| POST /api/chat/upload (Data Room) | R/server/routes/chat/upload.ts:100-160 | boundary | session | signature check; antivirus fail-open when unconfigured | FAIL (SEC-01) |
| POST /api/authoring/docs/:docId/freeze | R/server/routes/authoring.router.ts:4033 | own verifier (nonAccess only) plus boundary | session, `tenant_id` in SQL | governed reason required | PASS (see SEC-23) |
| POST /api/authoring/docs/:docId/e-sign | R/server/routes/authoring.router.ts:4249, INSERT at ~4306 | boundary | session | assertSigningAuthority, reverify, same-txn chained audit; writes authoring_signatures directly, no DB immutability trigger | PARTIAL (SEC-04) |
| GET /api/projects | R/server/routes/projects-management.ts:65 | boundary | session | none (read) | PASS |
| POST / PATCH /api/projects | R/server/routes/projects-management.ts:150,408 | boundary | session | none, so a viewer can write | FAIL (SEC-06) |
| DELETE /api/projects/:id | R/server/routes/projects-management.ts:336-397 | boundary | session (org compared) | none; hard delete; audit after delete in a swallowed catch with userId null | FAIL (SEC-06) |
| POST /api/project-sections/initialize, /milestones | R/server/routes/project-sections.ts:122,496 | boundary | session | none (12 write routes, 0 guards) | WEAK |
| POST /api/submissions | R/server/routes/submissions.ts:226 | boundary | session | requireRole(regulatory-author) (35 of 35 write routes gated) | PASS |
| POST /api/submissions/:id/sign-release | R/server/routes/submission-sign-release.ts:164 | boundary | session | DB role + signing authority + reverify | PASS |
| POST /api/ectd/export/:submissionId | R/server/routes/ectd-export.ts:560 | boundary | requireTenant | validateExportGovernance | PASS |
| GET /api/dossier-readiness/:projectId | R/server/routes/dossier-readiness.ts:66 | boundary | session | none (read); integer-id guard | PASS |
| POST /api/submission-readiness/assess | R/server/routes/submission-readiness.ts:20 | boundary | n/a | requireRole(regulatory-author) | PASS |
| /api/submission-center/* | R/server/routes/submissionCenter.routes.ts:40,309 | NOT MOUNTED (register-governance-routes.ts:51-64) | none: table has no tenant column | none | PASS by unmounting; landmine (SEC-25) |
| POST /api/qms/documents/:id/transition | R/server/routes/qms.ts:91 | authenticateToken | session | none; effective/retired refused in service; audit via logAction after commit | PARTIAL (SEC-05) |
| POST /api/qms/suppliers/:id/approval | R/server/routes/qms.ts:148 | authenticateToken | session | none; unsigned; no audit call at all | FAIL (SEC-05) |
| POST /api/qms/training | R/server/routes/qms.ts:106 | authenticateToken | session; userId taken from body | none | FAIL (SEC-05) |
| PATCH /api/mdx/qms/suppliers/:id (approvalStatus) | R/server/routes/mdx-qms.ts:925 | boundary | session | none; unsigned; audit after commit | FAIL (SEC-05) |
| PATCH /api/mdx/qms/nonconforming/:id/disposition | R/server/routes/mdx-qms.ts:1200 | boundary | session | none; unsigned | FAIL (SEC-05) |
| POST /api/mdx/qms/documents/:id/approve; /changes/:id/approve | R/server/routes/mdx-qms.ts:595,1446 | boundary | session | signing authority + reverify + self-approval block + txn chained audit | PASS |
| PATCH /api/mdx/qms/documents/:id | R/server/routes/mdx-qms.ts:449 | boundary | session | requireEditorAccess; status limited to draft/in_review | PASS |
| GET /api/c2c/actions/verify-chain | R/server/routes/c2c/actions.ts:761 | authMiddleware | system scope, all tenants | none | FAIL (SEC-09) |
| POST /api/setup/initialize | R/server/routes/setup.ts:62 | PUBLIC | system scope | none | FAIL (SEC-02) |
| POST /api/tenant-users | R/server/routes/tenant-users.ts:346 | boundary | body org, membership verified | admin of the target org | PASS |
| DELETE /api/tenants/:id, /purge | R/server/routes/tenants-simple.ts:381,479 | boundary | path | requirePlatformAdmin; purge has hold and export checks; uses the owner-role connection | PASS (SEC-03) |
| GET /api/admin/audit/siem | R/server/routes/admin/audit-siem.ts:~117 | authMiddleware | JWT org | requireRole(admin…) | PASS |
| POST /mcp and OAuth endpoints | R/server/mcp/index.ts:184-196 | own Bearer provider (before the core stack) | token principal | per-tool scope; editor role on governed tools; no revocation, lifecycle or password-change check | PARTIAL (SEC-07) |
| GET /api/v1/csr/search | R/server/routes/public-api.ts:439 | X-API-Key (public prefix) | key row | requireScope plus quota | PASS |
| /scim/v2/* | R/server/routes/scim.ts | per-tenant hashed bearer, IP allowlist | token to org | n/a | PASS |
| socket.io (/, /ana) | R/server/socketServer.ts:243-330 | live token | verified principal | membership, lifecycle, re-check | PASS |

### Findings (most severe first)

**SEC-01 (P0, unverified at runtime): no antivirus service exists in the Terraform-defined production, so Vault uploads fail with 503.**
- Evidence:
  - server/middleware/uploadSafety.ts:20-40 documents that with CLAMAV_HOST unset production returns 503 by design.
  - server/services/vault/vault-ingest.service.ts:222-230 calls assertUploadSafe.
  - Nothing under terraform, deploy-aws.yml, Dockerfile.optimized or the Helm charts provisions or requires clamd or CLAMAV_HOST (grep is empty).
  - The Data Room upload is the opposite failure: server/routes/chat/upload.ts:128-155 logs "Virus scan bypassed" and admits the file, so unscanned bytes reach the AnA context.
- Impact: either the launch-catalog Vault cannot ingest a file in production, or someone ships an out-of-tree scanner nobody has evidenced. The chat path is a malware and prompt-injection door.
- Fix: add a clamd Fargate service or sidecar with signature updates. Inject CLAMAV_HOST and require it in the deploy preflight. Add a readiness check with an EICAR test. Make chat/upload use assertUploadSafe.
- Effort: M. Depends on infra ownership.

**SEC-02 (P1): unauthenticated first-run setup creates an admin session with no MFA and no email verification.**
- Evidence:
  - server/routes/setup.ts:62-160.
  - /api is public at server/middleware/public-api-allowlist.ts:39.
  - It is mounted unconditionally under system scope (register-platform-routes.ts:142).
  - "Self-closing" is only `userCount()>0` (setup.ts:29-33, 92). A fresh Terraform deploy has zero users, because the demo user is seeded only with SEED_DEMO_USER=true (server/db/bootstrap/seed-default-org.ts:89-134).
  - The response is a 24h admin access token (setup.ts:139-160) for an enterprise-tier organisation (setup.ts:99).
  - The count-then-insert is also a race.
  - If PLATFORM_ADMIN_EMAILS names the same email, the token is a platform-admin token (requirePlatformAdmin.ts:69-73).
- Impact: whoever reaches a fresh deployment first owns its first tenant, may lock the operator out (409), and gets an MFA-free admin token.
- Fix: require a one-time SETUP_TOKEN secret (constant-time compare) or remove the route from SaaS builds. Never mint a session there; return "sign in" instead. Wrap the check in a transaction with an advisory lock. Add a failing-first test that a zero-user database refuses without the token.
- Effort: S.

**SEC-03 (P1): the API and worker tasks hold the database OWNER credential, the audit HMAC keys and the MFA key together, so DB-level immutability and RLS are not a hard boundary against an app-process compromise.**
- Evidence:
  - The task secrets include DATABASE_URL (owner c2c_admin), AUDIT_HMAC_KEY, AUDIT_HMAC_SECRET and MFA_ENCRYPTION_KEY (terraform/stack/main.tf:198-210, 295-306). The stack's own comment admits the owner exposure (main.tf:43-47).
  - server/routes/tenants-simple.ts:66-72 opens a second `postgres` connection on DATABASE_URL at module load. It bypasses the instrumented pool and RLS, and lists organizations and users.
  - RLS keys off session-settable GUCs: `app.rls_enforce` (a pass-through when it is not 'on') and `app.current_user_role='app_super_admin'` (db/migrations/20260801_tenant_isolation_sweep.sql:139-152). Any SQL-execution primitive can turn RLS off. This is fine as defence-in-depth but not as an isolation guarantee.
  - The owner can DISABLE TRIGGER, so audit immutability holds only against non-owner roles.
- Impact: RCE or SQL injection in the API means cross-tenant read and write, audit and signature rewrite, and HMAC re-sealing. This contradicts the tamper-evidence claim.
- Fix:
  1. Remove DATABASE_URL and the HMAC secrets from the runtime task. Run migrations in a separate one-off task role.
  2. Move tenants-simple to the pooled runtime role; drop the second connection.
  3. Put the audit seal key behind KMS Sign or HMAC (a sealing sidecar or Lambda), not in the API's environment.
  4. Optionally replace the GUC bypass with SET ROLE per tenant, or add a SECURITY DEFINER guard.
- Effort: L.

**SEC-04 (P1): the Authoring e-signature, frozen-approval and audit stores have no DB-level immutability, and the runtime role has full DML.**
- Evidence:
  - No trigger, rule or revoke on authoring_signatures, frozen_documents or authoring_audit_trail. A scan of every migration's CREATE TRIGGER finds none; only audit_logs, audit_events, electronic_signatures, audit.tamper_proof_log and concept2cure_signatures are protected (list at server/services/audit/audit-immutability-triggers.ts:48-72).
  - The app_service role gets SELECT, INSERT, UPDATE and DELETE on every non-audit schema; only audit.tamper_proof_log is append-only by grant (scripts/db/provision-app-role.mjs:118-153).
  - e-sign writes authoring_signatures with a direct INSERT (authoring.router.ts:~4306) instead of server/services/part11/signature-persistence.ts:327. ci:sign-ceremony does not see it.
  - No server code updates or deletes these rows, so the protection is convention only.
- Impact: 21 CFR 11.10(e), 11.50 and 11.70; Annex 11 §9. A compromised app or an insider with runtime DB rights can alter a signed Authoring record.
- Fix: add BEFORE UPDATE/DELETE/TRUNCATE triggers on authoring_signatures, frozen_documents and authoring_audit_trail, and register them in EXPECTED_AUDIT_IMMUTABILITY_TRIGGERS. Route Authoring signatures through signature-persistence. Revoke UPDATE and DELETE on these tables from app_service.
- Effort: M.

**SEC-05 (P1): the QMS second door is under-guarded and the quality decisions are unsigned.**
- Evidence:
  - The legacy /api/qms router (server/routes/qms.ts, mounted at register-document-routes.ts:271) uses authenticateToken only. Any org member, including a viewer, can:
    - set supplier approval_status to approved (qms.ts:148-160): no role check, no signature, no audit call;
    - set an NC disposition, including scrap and use_as_is (qms.ts:208-219): no audit call;
    - record training against any userId taken from the body (qms.ts:106-120);
    - create audits and management reviews with no audit row.
  - Transition audit is logAction after commit (qms.ts:96-102).
  - server/services/qms/qms.service.ts:61-90 blocks 'effective' and 'retired' in the service. Its comment says the router is slated for deletion (P1-31) but it is still mounted.
  - In server/routes/mdx-qms.ts, 16 of 20 write routes have no requireEditorAccess (:890-1552). Supplier approvalStatus, NC disposition, audits and management reviews are unsigned, with audit "beside" the committed row (:925-985, :1200-1230).
  - AnA is stricter than REST here: register_supplier only creates a pending supplier.
- Impact: ISO 13485 §7.4, 21 CFR 820, Part 11 §11.10(d),(e),(g). A viewer can qualify a supplier and forge a training record.
- Fix: delete /api/qms (canonical is /api/mdx/qms). Add requireEditorAccessForWrites at the mdx-qms router top. Make supplier approval and NC disposition signed, transactional governed writes with a chained audit row. Derive the training userId from the session or an authorised trainer.
- Effort: M.

**SEC-06 (P1): Projects have no role gate, and DELETE is a hard, cascading, weakly audited delete.**
- Evidence:
  - server/routes/projects-management.ts:336-397 has an org-equality check but no role check. It runs `db.delete(projects)`.
  - Child tables such as review threads, tasks and report_os_* reference projects ON DELETE CASCADE (migrations/0001_phase13_full.sql:26,62; 0014_report_os_foundation.sql:26).
  - The audit row is written AFTER the delete inside a try/catch that only logs, with `userId: null` and a plain auditEvents insert (:363-393), not a chained row.
  - No legal-hold or retention check, unlike tenant purge and vault legal holds. POST and PATCH (:150,:408) also have no role check.
- Impact: Annex 11 §17, GDPR Art. 5(1)(e), Part 11 §11.10(e). A viewer can destroy a regulated programme with no attributable, tamper-evident record.
- Fix: require an editor or admin role; route the delete through the retention and legal-hold check (soft-delete). Write the audit row in the same transaction with writeChainedAuditRow, using the session user id. Fix POST and PATCH the same way.
- Effort: S-M.

**SEC-07 (P1 when MCP is enabled; Terraform does not enable it): MCP bearer verification omits the session-end controls, and DCR plus consent make phishing easy.**
- Evidence:
  - server/mcp/auth/platform-token.ts:84-121 verifies HS256, class, audience and membership only. It does not check revocation, account standing, password change, idle/lifetime/superseded, tenant lifecycle or storage quota.
  - First-party access tokens carry all three scopes (read, draft, file) (:100-105). A logged-out or password-reset token keeps working on /mcp for up to 24h.
  - Connector refresh tokens live 30 days (server/mcp/config.ts:~126) and are never revoked on logout or password change. Nothing outside store.ts touches mcp_oauth_refresh_tokens.
  - A rotated refresh token that is reused just gets invalid_grant, with no family revocation (provider.ts:112-135).
  - Dynamic registration is open in production unless MCP_CLIENT_REDIRECT_ALLOWLIST is set (index.ts:109-126; config.ts:140). That is a warn log only.
  - The consent page auto-fills the app's localStorage session with no re-authentication (consent.ts:104-112). A registered attacker client plus a one-click Allow yields draft and file scopes.
  - c2c_file_draft_for_review writes via upsertLeaf and audits after the write, flagged "audit not persisted" but not rolled back (runtime.ts:175-190).
- Impact: Part 11 §11.10(d), 11.300, Annex 11 §12; a pending_deletion (read-only) tenant can still be written through MCP.
- Fix: replace verifyPlatformBearer's checks with verifyLiveToken plus enforceTenantLifecycle. Revoke connector grants on logout, password change and deprovision. Require the allowlist in production (boot refusal). Force a fresh MFA at consent. Add refresh reuse detection. Make the governed write transactional with a chained row.
- Effort: M.

**SEC-08 (P1): no Redis in the Terraform-defined production, so session and rate-limit enforcement are per task.**
- Evidence:
  - grep of terraform finds no elasticache or redis, and REDIS_URL is not in the task definition. The example tfvars runs api_desired_count=2 (production/terraform.tfvars.example:34).
  - Activity, the concurrent-session registry and the superseded markers fall back to per-process memory (server/services/session-inactivity.ts:213-330).
  - With two tasks, one that has never seen the session measures idle from the token's iat (:479-481). It then revokes the token globally (auth.ts:218).
  - The result is active users signed out about every idle window (default 15 minutes) at random, and a concurrent-session limit that does not hold. Rate limiters also multiply per task (redisRateLimiter.ts:101,296).
- Impact: Part 11 §11.10(d) and Annex 11 §12.4 controls become unreliable, and the product is unusable in the stated topology.
- Fix: provision ElastiCache (TLS, auth) and inject REDIS_URL. Make the boot assert refuse production without Redis when replicas are greater than 1. Add the deploy-preflight check.
- Effort: M.

**SEC-09 (P1): any authenticated user can trigger an estate-wide audit-chain scan under system scope.**
- Evidence:
  - GET /api/c2c/actions/verify-chain (server/routes/c2c/actions.ts:761-790) has no role check and runs verifyAuditChain on a super-admin-scoped connection.
  - readChainRows loads every tenant's audit_logs rows with no limit (server/services/audit/chain.ts:634-653).
  - The response discloses platform totals (`tenants`, `rowsChecked`) and, on a break, the id and hash of another tenant's row (chain.ts:720-733).
- Impact: a multi-tenant denial-of-service (memory and CPU) and metadata leak by a viewer.
- Fix: platform-admin only. Add a per-tenant mode, bound it with pagination, and rate-limit it.
- Effort: S.

**SEC-10 (P1, founder action): live credentials remain in git history by the repo's own record.**
- Evidence: .gitleaksignore has 4 "status: live" blocks. Two are Neon OWNER passwords (endpoints ep-wild-forest-ahbojhu4 and ep-icy-brook-aha5br78), one is a Hugging Face token, one is an unverified HS256 session-shaped token. The file says "No record that it was rotated". The tree itself is clean (ci:committed-secrets passes).
- Impact: SOC 2 CC6.1 and a vendor-diligence red flag.
- Fix: revoke and rotate the Neon passwords and the HF token, and confirm no environment's JWT_SECRET matches the old token. Record it, then remove the "live" markers.
- Effort: S. Depends on the founder.

**SEC-11 (P1): the Terraform baseline has no detective or preventive edge controls.**
- Evidence: grep across terraform finds no WAF, GuardDuty, AWS Config, VPC flow logs, CloudWatch alarms, SNS or Redis. ALB access logs default to off (`access_logs_bucket = ""`, terraform/modules/alb/variables.tf:40; the stack does not set it). CloudTrail is present. RDS uses the default KMS key.
- Fix: add WAFv2 (managed rules plus a rate rule) on CloudFront, GuardDuty, Config, flow logs, ALB access logs, and alarms (5xx, auth failures, RDS, audit-chain sweep failure).
- Effort: M.

**SEC-12 (P1, verification work): 103 request-read tables with no tenant column are "unreviewed".**
- Evidence: scripts/ci/unkeyed-request-tables-baseline.json has 112 entries: 103 unreviewed, 6 global, 3 derived. It was 115 six days ago (a shrink of 3). The file itself calls "unreviewed" a defect awaiting triage.
- Named examples: capa_records, chat_messages, knowledge_documents, q_submissions, conversation_os_*, clinical_ops.*, and audit.tamper_proof_log (no tenant key).
- Whether each is policed by the child-scope migration or a parent policy is UNVERIFIED; that needs a live database.
- Fix: run the RLS coverage query against a deploy-shaped DB. Classify each table as global, derived, or add a tenant column. Drive the count to 0.
- Effort: L.

**SEC-13 (P2): the launch-scope API gate is case-sensitive while Express routing is not.**
- Evidence: server/middleware/moduleEntitlementGate.ts:112 has `if (!pathname.startsWith('/api/')) return false`.
- I ran a minimal Express 5 app: `/API/x` reaches `app.use('/api/x')` and skips the gate. The auth boundary still requires a token (its allowlist is also case-sensitive), so the bypass is authenticated-only. Entitlement gating is bypassed the same way.
- Not reachable through the Terraform CloudFront, whose path patterns are case-sensitive (terraform/modules/cloudfront/main.tf:8-23). It is reachable on any other topology (Helm, compose, direct ALB with the origin secret).
- The out-of-scope surface it would expose includes the 18 unsigned research and IRB "approve" writes baselined in scripts/ci/sign-ceremony-baseline.json.
- Fix: lowercase-normalise the path for every path-based control, or set `app.set('case sensitive routing', true)` plus `strict routing`. Add a failing-first test.
- Effort: S.

**SEC-14 (P2): password expiry and mustChangePassword are advisory only.**
- Evidence: `isPasswordExpired` (PASSWORD_MAX_AGE_DAYS=90) is only returned in the enterprise verify-password body (server/routes/authEnterprise.ts:391,467). /api/auth/login does not return it. mustChangePassword is only echoed to the client (auth.ts:642,833,1809). No server middleware enforces either, so the session is minted regardless.
- Impact: 21 CFR 11.300(b), NIST 800-63B.
- Fix: gate all routes except /password/change with a 403 PASSWORD_CHANGE_REQUIRED.
- Effort: S.

**SEC-15 (P2): the default second factor is email OTP.**
- Evidence: users without TOTP get a code by email (auth.ts:680-697). The reset link goes to the same mailbox, so a mailbox compromise defeats both factors. SAML sign-in skips platform MFA and does not verify that the IdP asserted MFA (sso.ts:530-560).
- Fix: require TOTP or WebAuthn for admin and signer roles. Check the SAML AuthnContext, or a per-tenant "IdP enforces MFA" attestation.
- Effort: M.

**SEC-16 (P2): access and refresh tokens (7d) live in localStorage, and refresh has no reuse detection.**
- Evidence: client/src/concept2cure/auth/ZenLogin.tsx:203-205; Concept2CureLogin.tsx:243-245. The rotated refresh token is revoked, but presenting a revoked one does not end the session family (auth.ts:1336-1343).
- CSP is strict, which mitigates this.
- Fix: keep the refresh token in an HttpOnly, SameSite, Secure cookie with reuse detection. Keep the access token in memory.
- Effort: M.

**SEC-17 (P2): no zip-bomb limits on user-supplied archives.**
- Evidence: adm-zip `readAsText` and JSZip `loadAsync` are unbounded at server/services/templates/templateExtractor.ts:119,276,360 (10MB upload cap at server/api/templates/routes.ts:45), and in the eCTD validators and importers. There are no uncompressed-size checks anywhere.
- Impact: a task OOM by any user with upload rights.
- Fix: cap entry count, total uncompressed bytes and ratio before reading.
- Effort: S.

**SEC-18 (P2): posture is opt-in in code, guarded only by the ECS preflight.**
- Evidence: production honours AUDIT_SEAL_ACCEPT_UNSEALED, AI_GOVERNANCE_ACCEPT_PERMISSIVE, STORAGE_ACCEPT_LOCAL_DISK, CONCEPT2CURE_SIGNER_ACCEPT_HMAC and ENABLE_TEST_ROUTES=true (server/startup/env.ts:134).
- The audit trail is enforced only if AUDIT_REQUIRE_ENFORCE=true (default: warn; server/startup/audit-enforcement.ts:60,91-100). MFA_REQUIRE_DEDICATED_KEY is optional (mfaService.ts:129).
- docker-compose.beta.yml sets STORAGE_ACCEPT_LOCAL_DISK: 'true' (line 157). The Helm and compose paths do not get the preflight.
- Fix: make each a boot refusal in production. Add a deploy check for every deployment path.
- Effort: S.

**SEC-19 (P2): CI honesty.**
- ci:org-path-param-guards FAILS at HEAD. It flags DELETE /gdpr/:orgId/data-subject/:dataSubjectId, a 410 stub (server/routes/global-compliance.ts:558) added by 80cbd718 on 2026-09-28. The gate has a baseline of 0 and runs blocking in ci.yml:581, so trunk lint is red.
- Semgrep is `continue-on-error: true` and advisory (semgrep.yml:34-41). CodeQL uploads alerts but nothing fails on them without branch-protection rules I could not verify.
- repo-health auto-refresh commits use [skip ci].
- Fix: make the stub gate-clean, ratchet Semgrep to blocking, require CodeQL in branch protection.
- Effort: S.

**SEC-20 (P2): the AnA tool `run_python_script` exec()s model-authored code in the API container.**
- Evidence: server/services/ana/AnaToolExecutor.ts:7227; server/services/compute/scriptWorker.ts:67-80; server/services/compute/sandboxEnv.ts:1-40.
- The sandbox strips the environment but runs as the same OS user with no container, and the code itself says the Python network guard is bypassable. That allows reading /proc/<node pid>/environ and reaching the task-role credential endpoint.
- The register makes it `confirm`. python3 is not installed explicitly in Dockerfile.optimized. Whether libreoffice pulls it in is UNVERIFIED.
- Fix: delete the tool from production or run it in an isolated job (Fargate task with no secrets and no network).
- Effort: M.

**SEC-21 (P2): non-atomic audit on governed writes is baselined debt.**
- ci:discarded-audit-write: 122 baselined sites across 54 files (72 to 54 files in six days).
- Examples: submission-service createSubmission, createSequence and upsertLeaf use `recordAuditRow` after the write (server/services/submission-service/submission-service.ts:189-233,328). mdx-qms uses the same pattern.
- ci:server-error-leaks: 117 baselined sites across 75 files.
- Fix: keep converting to writeChainedAuditRow on the same client, as sequence transitions (:592-630) already do.
- Effort: L, incremental.

**SEC-22 (P2): gateway bypass baseline is 8 entries (was 9).**
- Examples: nanoBananaService image generation to Google with relaxed safety, LiteLLM as the gateway's else-branch (a boot refusal without an acknowledgement in production), rerankers, and the shared Anthropic and OpenAI client factories (scripts/ci/gateway-bypass-baseline.json).
- Fix: route them through getGateway or delete them.
- Effort: M.

**SEC-23 (P3): local JWT re-verifiers skip class, revocation and membership checks.**
- Evidence: approval-workflow.ts:30-52 also has `isDev && !token` returning user 1 / org 2, keyed on NODE_ENV alone, so ci:no-dev-auth-in-prod does not catch it. Also contentAssembly.routes.ts:27, fieldSync.routes.ts:98, cortex-unified.ts:1199.
- Reachable only behind the boundary, so defence-in-depth debt. optionalAuth uses the lenient nonAccessTokenReason.
- Fix: replace with req.user from the boundary.
- Effort: S.

**SEC-24 (P3): `/api/v1` is a public prefix protected by per-route convention.**
- Evidence: the allowlist duplicates in server/bootstrap/register-platform-routes.ts:245-278 and public-api-allowlist.ts. Two routers share the prefix. All pyramid.routes.ts routes are guarded today.
- Fix: delete the redundant second gate. Add a test that every /api/v1 route carries authenticateToken or an API-key guard.
- Effort: S.

**SEC-25 (P3): dormant submissionCenter.routes.ts has unscoped SQL and no tenant column.**
- It is unmounted (register-governance-routes.ts:51-64) but still imported and kept.
- Fix: delete it (see the repo rule that removal must name a reachable replacement; /api/submissions is the replacement).
- Effort: S.

**SEC-26 (P3): SSRF guard gaps.**
- Evidence: server/utils/ssrfGuard.ts:47-61 does not block `::` (unspecified) or NAT64/6to4 embeddings. It also false-positives any hostname starting with fc or fd, such as fda.gov or fcc.gov.
- Fix: parse the address properly (ipaddr) and classify.
- Effort: S.

**SEC-27 (P3): the HTTP audit observer has dead skip patterns and a wrong resourceType.**
- Evidence: under app.use('/api'), req.path is mount-relative, so SKIP_PATH_PATTERNS never match and `resourceType = path.split('/')[1]` yields the id (server/startup/audit-trail.ts:32-40,111-118). It logs the raw query string. It is fire-and-forget on finish, and only runs when AUDIT_TRAIL_ENABLED=true.
- Fix: use requestFullPath and drop or redact the query.
- Effort: S.

**SEC-28 (P3): small items.**
- Legacy brand origins (trialsage.com, concept2cure-ri.ai, clinicalsage.ai) are hard-coded in the production CORS and CSRF allowlist (server/middleware/enterprise-security.ts:44-56).
- Public /readyz does a DB `select 1` with no rate limit (server/startup/inline-endpoints.ts:50).
- METRICS_TOKEN is compared with `===` (operator-endpoints.ts:26-29).
- tenants-simple stores a plaintext organizations.api_key (:177, unused).
- JWT_SECRET_PREVIOUS has no expiry (jwtVerify.ts:44-47).
- Base images are not digest-pinned.
- client-intelligence trusts a query clientWorkspaceId unverified, and tenantContext trusts an x-client-id header (within-org only).
- The users table is global by email, so a tenant IdP or admin can squat an address.
- Signup creates the Stripe customer before tenant admission.
- Effort: S each.

### Recommended work orders, in order

1. **WO-1: clamd in production (SEC-01).**
   - Goal: uploads work and scan, with no silent bypass.
   - Scope: infra service, env injection, preflight, an EICAR readiness check, chat/upload on assertUploadSafe.
   - Acceptance: with the scanner down, POST /api/vault/ingest returns 503; with it up, EICAR returns 422 and a clean PDF returns 201. Show the 503 first.
   - Effort M.
2. **WO-2: close first-run setup (SEC-02).**
   - Goal: no unauthenticated admin mint.
   - Scope: SETUP_TOKEN or removal, advisory lock, no session in the response.
   - Acceptance: an empty DB refuses without the token (test written first, showing today's 201); a concurrent pair creates at most one.
   - Effort S.
3. **WO-3: separate the credentials (SEC-03).**
   - Goal: the runtime cannot alter its own evidence.
   - Scope: drop DATABASE_URL and the HMAC secrets from the runtime task, move tenants-simple to the pool, migrate task role, seal via KMS.
   - Acceptance: an integration test as app_service fails on `DISABLE TRIGGER` and on `UPDATE authoring_signatures`; a boot refusal if DATABASE_URL owner appears in the runtime environment.
   - Effort L. Depends on SEC-04.
4. **WO-4: immutability for every Part 11 store (SEC-04).**
   - Goal: parity with electronic_signatures.
   - Scope: triggers, grants, register in EXPECTED_AUDIT_IMMUTABILITY_TRIGGERS, signature-persistence for Authoring.
   - Acceptance: UPDATE and DELETE on authoring_signatures raise for app_service, and the boot probe reports the triggers (failing first on today's schema).
   - Effort M.
5. **WO-5: QMS and Projects second doors (SEC-05, SEC-06).**
   - Scope: delete /api/qms, requireEditorAccessForWrites at the top of mdx-qms and projects-management, signed supplier and NC decisions, soft-delete with legal-hold and retention check and same-transaction chained audit.
   - Acceptance: a viewer gets 403 on every write; DELETE on a project with a hold returns 409; the audit row carries the user id and is chained (tests failing first).
   - Effort M.
6. **WO-6: MCP lifecycle (SEC-07).**
   - Scope: verifyLiveToken plus lifecycle guard, grant revocation on logout, password change and deprovision, mandatory redirect allowlist, consent re-auth.
   - Acceptance: a token revoked, password-reset or suspended-tenant returns 401 or 403 on /mcp; registration with an unlisted origin returns 400.
   - Effort M.
7. **WO-7: Redis and edge detective controls (SEC-08, SEC-11).**
   - Scope: ElastiCache, WAF, GuardDuty, Config, flow logs, ALB logs, alarms.
   - Acceptance: a two-task compose test shows idle enforcement is consistent across tasks; Terraform plan shows the resources; preflight requires REDIS_URL.
   - Effort M.
8. **WO-8: platform-admin-only verify-chain, plus tenant-table triage (SEC-09, SEC-12).**
   - Acceptance: a viewer gets 403; the unreviewed count in the baseline reaches 0 with per-table evidence.
   - Effort S then L.
9. **WO-9: rotate the leaked credentials (SEC-10).**
   - Acceptance: the credentials are revoked (evidence attached) and the gitleaksignore "live" count is 0.
   - Effort S.
10. **WO-10: authentication hardening bundle (SEC-13 to SEC-18).**
    - Scope: case-normalised paths, enforce password expiry, TOTP or WebAuthn for privileged roles, cookie refresh with reuse detection, zip limits, boot refusals for accept flags.
    - Acceptance: each has a failing-first test: /API/… returns 403 LAUNCH_SCOPE; an expired password gets 403 on non-change routes; a bomb docx is rejected.
    - Effort L.
11. **WO-11: CI honesty (SEC-19).**
    - Acceptance: trunk lint is green, Semgrep is blocking, CodeQL is a required check.
    - Effort S.

### Gate table

All run as read-only npm scripts at HEAD. I ran no write-baseline.

| Gate | Result | Baseline size / direction |
|---|---|---|
| ci:committed-secrets | PASS (tree clean; history has 4 live-credential blocks, SEC-10) | 0; .gitleaksignore 36 fingerprints, .trivyignore 2 CVEs with expiry |
| ci:no-dev-auth-in-prod | PASS (but misses the NODE_ENV-only check in approval-workflow.ts, SEC-23) | 0 |
| ci:unauthenticated-fetch | PASS, 70 fetches | 0 |
| ci:path-containment | PASS | 3 baselined |
| ci:org-path-param-guards | FAIL (exit 1): 43 routes, 42 guarded; the 1 unguarded is the 410 stub in global-compliance.ts:558 | baseline 0; regression since 2026-09-28 |
| ci:jwt-verify-pinned | PASS | n/a |
| ci:client-ip-single-source | PASS | n/a |
| ci:server-error-leaks | PASS | 117 sites, 75 files; flat |
| ci:discarded-audit-write | PASS | 122 sites, 54 files; shrinking (72 files to 54 in six days) |
| ci:sign-ceremony | PASS | 24 sites in 21 files (18 defects, all outside the launch catalog but reachable by SEC-13); shrink-only |
| ci:regulated-delete-audit | PASS (does not see the swallowed-catch, null-user audit at projects-management.ts:363-393) | n/a |
| ci:gateway-bypass | PASS | 8 (was 9) |
| ci:dead-audit-catch | PASS | 0 |
| ci:session-scoped-rls-bypass | PASS | 34 occurrences in 7 unmounted services |
| ci:drizzle-tenant-scope | PASS | 125 sites all baselined; 26 fixed but not banked |
| ci:tenant-entry-points | PASS | 14 entry points; 9 do not consider entitlement (baseline 9) |
| ci:tenant-isolation:no-regression | PASS | 8 candidates = 8 baseline; 32 inline suppressions |
| check:security-patterns | PASS, 0 violations in 2911 files | 0 |
| check:compliance-claims | PASS, 933 files | 0 |
| npm audit (prod, lockfile) | 0 critical, 2 high (pptxgenjs/image-size, ledger says unreachable), 28 moderate (mostly @opentelemetry, uuid, nodemailer, csv-parse, @anthropic-ai/sdk) | dependency-risk ledger gate blocks in ci.yml |
| Not in the requested list, read only | unkeyed-request-tables baseline 112 (103 unreviewed), was 115 | SEC-12 |

**Baseline ids re-verified as closed in code.** These ids come from code comments, not the audit document. I re-read the closing code for each:
- IAM-03: SAML tenant binding and the platform-admin email exclusion for federated sessions.
- IAM-04: revocation TTL and password-change invalidation.
- IAM-06: server-enforced idle, lifetime and concurrent-session limits (with the Redis dependency in SEC-08).
- IAM-08: authenticator accounts cannot complete with an emailed code.
- IAM-09: OTP resend and attempt carry-over.
- IAM-10: role read from the membership row.
- IAM-12 and IAM-19: socket re-checks.
- IAM-16: AUTH_BOUNDARY_MODE=warn refused in production.
- IAM-17: email verification.
- IAM-18: timing pad, pre-boundary body limit, impersonation detector placement, metrics auth.
- INF-11: trivyignore expiry.
- INF-17: preflight refusal of *_ACCEPT_* variables (the code still honours them, SEC-18).
- The users-login, users-register and enterprise-electronic-signature parallel doors are closed (410 or 307).

**Not closed:**
- INF-22 (live credentials in history, SEC-10).
- IAM-02 (MCP registration): an allowlist exists but is optional and warn-only.

### Open questions and needs from the founder

1. Who owns antivirus (SEC-01)? Is there an existing scanning service or vendor to point CLAMAV_HOST at?
2. Rotate the Neon owner passwords and the Hugging Face token now (SEC-10).
3. Is MCP in the first paid pilot? If yes, which origins may register (e.g. claude.ai and claude.com), and do you accept a fresh MFA at consent?
4. Do you want open self-service signup on the SaaS at all? It currently mints an admin and a free-tier organisation from an email-verified address alone.
5. Mandatory TOTP or WebAuthn for admin and signer roles, or is email OTP acceptable to your target buyers?
6. Multi-task production means Redis. Confirm 2 or more API tasks, and approve ElastiCache.
7. Is there a plan to move the audit seal key behind KMS? Buyers asking about tamper-evidence will probe this.
8. Third-party items I cannot decide from code:
   - an external penetration test before the first paid pilot, including an authenticated tenant-isolation test with two tenants;
   - a SOC 2 platform and auditor (Type I first);
   - BAAs with AWS, Anthropic and OpenAI (HIPAA) and DPAs, SCCs and zero-data-retention terms;
   - a vulnerability-disclosure and bug-bounty stance (security.txt already exists);
   - APPI (Japan) transfer terms if you sell there.
9. Please confirm branch protection on concept2cure-v2 (required checks: CodeQL, Semgrep, the security scan). I could not read GitHub settings.
10. Decision needed on the 18 out-of-catalog unsigned "approve" writes and the gateway-bypass surfaces. Either delete them or hard-disable them at the router (not only by API path scope).