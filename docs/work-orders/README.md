# Work orders — index and session handoff

**Read this before starting work in this directory.** It exists because work on
these orders spans many sessions, and a session that starts from a fresh clone
inherits the repository and nothing else — no prior conversation, no plan file,
no task list. Everything a new session needs to avoid redoing settled work, or
repeating a mistake that has already been paid for, has to be written down here.

Last updated 2026-09-19.

---

## 0. Who is working on what — claim your lane here

Sessions cannot message each other. This table is the only coordination
mechanism, so **claim before you start and release when you stop.** Keep entries
to one line; edit only your own row to limit merge conflicts.

| Lane | Session | State |
|---|---|---|
| **D6 — P0 closures from the 2026-09-24 security audit, this session's tranche** (`docs/security/REMEDIATION_AND_ENHANCEMENT_PLAN_2026-09-24.md` §1). Landed on trunk, one commit per item, each red-then-green under `docs/evidence/D6/2026-09-24-p0/<item>/`: P0-1 `7c4faf2a`, P0-13a `d7f08922`, P0-7 `b33ec50d`, P0-5 `423aff25`, P0-6 `cc1cb31a`, P0-11 `df479b5f`, P0-3 `a96fbea0`, P0-4a `613c6e00`, P0-16a `14639fa3`, P0-9a/P0-8a-sweep `e8724680`, P0-12 part 1 `8ebe3040`, auth follow-ups `872c8648`, P0-2d `5c10785e`; register and plan rows carry the commits (`aadcae18`). P0-8a archive door (the session-settable bypass replaced by a SECURITY DEFINER function, ledger and enforced floor; sixteen `tests/db` teardowns converted to an owner-side trigger disable, edited inside their windows because CI's `test:db` would otherwise go red) landed as `054c1764`. **Hand-offs (files inside other lanes' 24 h windows or other lanes' scope):** wire `scripts/ci/check-trivyignore-hygiene.mjs` as `ci:trivyignore-hygiene` in `package.json` + `.husky/pre-push` (windows close 16:51 / 21:18 UTC 09-25); P0-12 every-write confirm tier (`routes/ana-ri/utility.ts`, `command-executor.ts`, `post-processing.ts`, client sign-off; design in `P0-12/README.md`) and the erasure handler's transaction bug (`command-executor.ts` ~1694); P0-18 QMS trigger (`migration-set.mjs`); P0-4b `session_version` (migration); P0-8 `app_service` DELETE grant (`provision-app-role.mjs`; `APPEND_ONLY_TABLES` should name `public.audit_logs` and `public.audit_log_archives`) and the anchored chain head; `chain.ts` verifier vs archived rows (D5 lane); `migration-set.mjs` comment still names the old setting; **W2:** `AUDIT_TRAIL_ENABLED` / `AUDIT_REQUIRE_ENFORCE` in the task definition and preflight, Trivy `if: always()`, a path-scoped `DS002` exception, P0-10, P0-13b, P0-15, P0-17 key set; **D8:** P0-2 (a)–(c); **founder:** `MCP_CLIENT_REDIRECT_ALLOWLIST` origins, P0-14, P0-17. Not touched: `routes/auth.ts` was cold by the time P0-4 landed; `environment.ts`, `terraform/**`, `.github/workflows/**`, `c2c/artifacts.ts`, `mdx-qms.ts`, `AnaToolExecutor.ts`, `audit/chain.ts` untouched | `…session_0194UQPxy9Er2ibRAjog8Ven` | **released** 2026-09-25 02:40 UTC — row **D6** (D5 for P0-7/P0-12/P0-8a); fourteen items landed, evidence index `docs/evidence/D6/2026-09-24-p0/README.md` |
| **D6 — P1 tranche from the 2026-09-24 security audit, this session** (`docs/security/REMEDIATION_AND_ENHANCEMENT_PLAN_2026-09-24.md` §2; one commit per item, red then green under `docs/evidence/D6/2026-09-25-p1/<item>/`, index in that folder's README). **Landed:** P1-14 `ee35804a`; P1-6 `eeaa8267`; P1-9 `901f9c9e`; P1-4 `414f203e`; P1-21 vocabulary half `3d09bf2a`; P1-3 `1219a144`; P1-2 (recovery codes `fdc1e53e`, login routes part 2); P1-17 (metrics/gateway health, then the IAM-18 residuals 4/5/9/10); P1-5 (gate `check-upload-guards.mjs` + `stability.router.ts`, then two sweeps: 13 unguarded sites → 4 in 3 files); P1-20 (audit reads/exports for owners, admins, managers; client events from the server's vocabulary); P0-12 part 2 server half (every AnA write is a proposal; confirm tier in `part11-governance.ts`, `command-rbac.ts`, `governed-tool-gate.ts`, `routes/ana-ri/{utility,stream}.ts`); P0-12 part 2 client half (the confirm-only step in `GovernedActionSignoff.tsx`); P1-20 `/ledger` reader gate; P1-27 second part (browser Sentry scrubber `client/src/utils/sentryScrub.ts`; the `Math.random` organisation API-key mint removed from `tenants-simple.ts`); P1-1 (`services/session-inactivity.ts`: tenant idle window and 12-hour lifetime at both authenticators, `verifyLiveToken` and `/refresh`; session claims `sid`/`sst`/`idl` on every mint; client `IdleSessionGuard` warning and sign-out reason, 18 locales); P1-22 (retention sweep scheduled at boot, `retention_until` at admission, `/api/vault/legal-holds` place/lift, each disposition one transaction with its chained audit row); P1-1 OQ-PROJ-19 written; IAM-18 (7) (the 50 MB Concept2Cure parser behind the auth boundary); IAM-18 (6) (SSO session in the URL fragment, adopted by the sign-in page; SAML `InResponseTo` `always`); P1-13 documents half (IR-004 §3a breach-notification matrix with one 72-hour tenant clock, `INCIDENT_LOG.md`, AC-002 §4a access-review procedure, `TRAINING_RECORD.md`, SIG G.4). P1-1 concurrent-session limit (`openSession` registers every sign-in; the oldest session beyond the tenant's limit, five by default, is superseded and refused as `SESSION_SUPERSEDED`); P1-26 (VMP-001 v0.2 §7a declares Amazon Time Sync and the one clock rule for audit and signature timestamps); the security-auditor follow-up on P1-1 (atomic Redis registration, Redis the sole decider, SAML sessions read the tenant's settings, `optionalAuth` verifies fully, `/select-organization` rotates); P1-2 sign-up verification (no session until the e-mail link is opened; `pending_verification` → `active` once; `AUTH_EMAIL_UNVERIFIED`; 503 when the deployment cannot mail); trunk's ESLint warning ratchet back under its baseline (6434 → 6424 by paying down ten warnings in this lane's files, baseline locked at the new total; the per-push ratchet nets per file, so a growing file can ride a shrinking one onto trunk and only the whole-tree run sees it); the dependency-risk ledger re-sealed to the current `package-lock.json` (the Dependabot fold of 09-25 changed the lockfile without re-sealing, so trunk's Security Scan step and one CI guard self-test were red; the four high advisories on record are the same reviewed, unreachable `image-size` pair); P1-2 common-password and context checks (a bundled list, no outside call); the authenticated password change writes its audit event (IAM-17's last engineering residual); the security contract suite green again (red on trunk since the P1-1 server half: its legacy-authenticator tokens carried no session and the idle rule answered before the password rule; the legacy authenticator now answers in the main one's order, and the tokens carry a session); P1-27 server half (the logger masks e-mail and IP addresses in every log value, in both the TypeScript logger and its hand-kept JavaScript mirror); trunk's Test job: the four files this lane's P1-1 and P1-22 broke are green again (two session-currency suites whose tokens now carry a session within the lifetime; the pre-P1-22 retention test, which modelled drizzle inserts and a file audit logger, ported onto the transactional sweep's harness as `server/jobs/__tests__/retentionCron.policies.test.ts` and retired; the unreferenced-modules baseline regenerated after `academic-resource-upload.ts` became referenced). trunk's Lint guardrails: the four this lane tripped are green again (the unbacked-tables scan read `extract(epoch FROM …)` in the account-standing statement as a table name, now `date_part`; the two P1-22 tables entered in the unkeyed-request-tables baseline with their reasons, `vault.retention_policies` global and `vault.document_archives` derived, its own organisation column a follow-up by amending `20260608_vault_retention.sql` in place; the retention sweep's tenant-entry-point justification re-read against the P1-22 rewrite and its digest refreshed; `/api/vault/legal-holds` on the request's own client, `requestPgClient(req)`, instead of the shared pool). The three Lint guardrails that were other lanes' are green again (their lanes: `9ef1514e` moved the four routes onto the request's client, `6ce7c30b` scoped the leaf-program read and the audit fixture); at 18:55 UTC 09-26 every guardrail this lane watches passes on trunk (leaks 119/76, security patterns 0, tenant isolation 8/9, requestdb 228/229, sign ceremony 23, unreferenced modules). Still red on trunk and not this lane's: the full-history secret scan (one finding, four live history credentials, P0-17 founder), and six Test files (canonical-document chain, run-pq, signer-org-scope, two client canvas suites). P1-8 landed 2026-09-26 (drafting tasks written and read only through the organisation's own program; stability result PATCH/DELETE on the tenant's own row, one transaction with its `stab_audit` record; the unmounted duplicate `routes/templates.ts` and the unkeyed file audit logger deleted). P1-7's `x-org-uuid` half was closed by lane `…01W5zW66` (`b1618c69`, the AnA routes read the session's tenant key); its `x-client-id` half (the workspace header verified against the organisation before feature toggles trust it) is this lane's next item. Weekly security lens run 2026-09-26 (P1-18; `docs/evidence/reviews/2026-09-26/security.md`, audited `1463b91a`): the tranche's closures hold, with residuals; five new ids IAM-19, DP-36…DP-39 registered with plan rows P1-33…P1-38; DP-08 re-opened in part (the directly registered AnA write tools are outside the propose-only partition, P1-34); DP-37 is the submission lane's (the tenant-isolation gate's one red); DP-06 and INF-04 recorded as closed by the W2 lane's Terraform. P1-19a found done by lane `…01KnUGoX` (VR-02, `3c7fb27c`; the export reads both stores) and the plan, register and control map reconciled; P1-19b (key id, own secret, KMS signature) queued behind `environment.ts` (02:48 UTC 09-27) and `.env.example` (12:15 UTC 09-27). P1-17 paydown landed 2026-09-26 (leak baseline 145 → 120 sites / 89 → 77 files: the first 25 cold sites in 12 files onto `serverError()`, the two coded 503s in `ana-features.ts` static with the detail logged; red-then-green under `P1-17-paydown/`; 7 sites in 4 hot files wait on their windows; the gate now runs in `.husky/pre-push`). IAM-18 (4) re-checked and polished 2026-09-26 (dead skip list deleted; the impersonation audit row keeps its `/api` prefix through the new shared `requestFullPath`, five readers; real-token end-to-end proof through `applyAuthBoundary`; the unmounted second detector `tenantIsolation.ts` deleted). IAM-18 (8) closed at the enterprise door and P1-3's resend cap landed 2026-09-26 (one shared bcrypt pad for unknown e-mail and null-hash at both sign-in doors; `users.email_otp_resends` with at most 3 re-issued codes per challenge in one conditional UPDATE, `/mfa/resend` → 429 `MFA_RESEND_LIMIT` audited; the column by amending `20260923_users_mfa_totp_last_step.sql` in place, Rule 1, `migration-set.mjs` hot; the client's `ApiClient` reads nested error bodies; `IAM-18-8/`). P1-34 (DP-36): this lane's cold-file registry half (`propose-only-tools.ts`, 195 tools classified) was **withdrawn before pushing** when lane `…01471vSK` landed `aa4d5552` at 13:35 — one register of all 763 tools enforced at the wrapper, the stream gate and `/governed-action` (zero duplication; the P1-34 row and DP-36 are that lane's closure). Kept from this lane: the count correction and `docs/evidence/D6/2026-09-25-p1/P1-34/superseded-cross-check.md`, twelve classification disagreements handed to that lane (acts this lane read as a person's own that the register confirms; `retire_qms_document` confirm-plus-reason in chat beside the signed HTTP door of P1-29). P1-7's `x-client-id` half landed 2026-09-26 (`P1-7b/`: the workspace header verified against the session's organisation by one predicate at the feature gate and in the two routes that wrote it unverified, 403 on a foreign workspace; `workspace-trust-header` gate rule red (4) then green; deferred `cortex-unified.ts:128` until 04:43 UTC 09-27; the two-tenant dbtest awaits a database run). P1-36 landed 2026-09-26 (`POST /api/audit/signatures` behind `requireAuditRecorder`, 403 for a viewer before the body is read; `P1-36/`). P1-37 landed 2026-09-26 (the logger masks the message string and array elements too, both mirrors; `P1-37/`). P1-29 HTTP and legacy doors landed 2026-09-26 (retiring a controlled QMS document is the approve ceremony with its own digest, signature row and chained ledger pair in one transaction; the legacy transition door refuses `retired`; the SOP register retires through `EsignModal`; OQ-QMS-10 credentialed; `P1-29/`); the AnA door `retire_qms_document` waits for `AnaToolExecutor.ts` (03:15 UTC 09-27) and is already a refusal in P1-34's registry. P1-38 landed 2026-09-26 (every access-token mint under `server/` is a registered session: setup through `openSession`, the connector through `openConnectorSession`, the dead `server/auth.ts` `login()` deleted; the contract test scans every `jwt.sign`; the enterprise `/verify-mfa` reads the enrolment first; `P1-38/`). Also landed by lane `…01471vSK`: `69f93d98` at 12:39 (the wrapper gate and the stream door for five direct write tools) and `aa4d5552` at 13:35 (the full register, above). P1-15 scope written 2026-09-26 (`docs/security/PEN_TEST_SCOPE_2026-09-26.md`, Draft for the founder's vendor RFP: the launch catalog by mount from the surface registry, the auth doors, the connector, the sockets, the signed export and uploads in scope; 48 closed register ids with a retest door, 43 open ids as known; every route verified at `6eeee017` red-then-green, `P1-15/`; the 2026-05-01 BETA scope points at it; found on the way: CloudFront does not route `/socket.io/*`, so the socket retests need a staging decision from W2; the engagement, the report and the retest letter remain the founder's and the vendor's). P1-17 paydown 2 landed (leak baseline 146 → 121 sites / 83 → 68 files on the stricter gate of `4cebf1b4`, 96 / 62 with another lane's paydown `87905b9d`, 119 → 94 before it: the next 25 cold sites in 15 files onto `serverError()`, the three coded `GOVERNED_EXPORT_FAILED` 500s static with the detail logged, three leak-pinning tests flipped to containment, the two raw `body.error` reads in `useCerLiterature.ts` through `serverMessage()`; `P1-17-paydown-2/`; two hot sites in the span skipped until 2026-09-27 04:43 UTC). P1-19b (key-id half of P1-19) landed — `auditExportKeyPosture.ts` (key id `'k1'`, `_PREV` rotation slot, frozen legacy chain, production posture with no accept flag, applied at signing) and `signedAuditExport.ts` (`signingKeyId` in the signed manifest, verification by the manifest's id, `timingSafeEqual`; every issued export verifies unchanged), 63/63 with the four neighbouring suites; its boot half landed 2026-09-30 (production refuses to start without the key; Terraform provisions it with plan-time checks, `terraform test` 25/25 and the preflight proof green; both deploy preflights, the CI boot smoke and the compose files require it; the export route names the key). **Operator:** set `TF_VAR_audit_export_signing_key` before the next plan. The KMS asymmetric offline-verifiable signature remains a founder/W2 decision. **Reporting & analytics is the seventh launch app** (founder decision of 2026-09-26, quoted in `docs/evidence/D2-REPORTING-LAUNCH-APP/2026-09-30/README.md`): `LAUNCH_APPS` gains `reporting` (surfaces `insights`, `compliance-reports`), so the existing rail entry shows for every organisation; `ci:launch-scope` counts seven; the canvas claims `/api/insights-canvas`; the report type registry is seeded by a generated migration in the set (runs no longer 404 on a deployed database); Report-OS run, finalize, PDF and bundle exports are recorded on the chain, finalize is role-gated and atomic, and the dev seed route is deleted (plan P1-40). **Audit & compliance reports** landed beside it (plan P1-39, `docs/evidence/D6/2026-09-30-compliance-reports/`): eight reports an auditor or regulator asks for, deterministic, recorded on the chain before anything leaves, sealed, each listing what the platform does not record; reviewed by three lenses and every must-fix answered; register DP-45 to DP-57. **Disclosed edit inside another lane's window:** `server/services/ana/ana-launch-scope.inventory.json` (last touched 2026-09-30 23:49 UTC by lane `…01GCu8tc`, which added two tool names) — this lane moved the six Reporting tools from the hidden list to in-scope, which `ana-launch-scope.test.ts` requires once Reporting is a launch surface; different entries, no other change. **Founder instruction 2026-10-01 ("stop waiting and do the work"):** this lane no longer defers to other lanes' 24-hour windows; every such edit is disclosed here. Done under it: `docs/LAUNCH_DEFINITION_OF_DONE.md` row D2 now names seven apps (last touched 2026-10-01 02:00 UTC by lane `…01DiJJAk`, inside its window; one sentence changed). **Hand-off to whoever holds `server/routes/tenant-users.ts` (lane `…01GCu8tc` until 2026-10-01 23:49 UTC):** P1-41 / DP-49, a chained audit row for role change and removal. **Hand-off to validation:** OQ-001, URS-001, TM-001, VMP-001 and VSR-001 say six launch apps; OQ-PROJ-13 now checks seven. **Hand-offs:** SMTP as a production boot requirement (sign-up and the emailed second factor both need it; today each refuses at use, not at boot); the org-level "require an authenticator app" policy key in `tenant-config.ts` (window closes 02:42 UTC 09-27); a breach-corpus lookup for chosen passwords (a k-anonymity range query sends five hex characters of a SHA-1 to a third party on every change; founder's call, and a sub-processor line if yes); Redis as a production boot requirement so the session limit and idle store hold across tasks (P1-3, founder); the DPA §7.1 figure aligned to 72 h (counsel; `docs/commercial/DATA_PROCESSING_ADDENDUM.md` is inside another lane's window until 02:48 UTC 09-27), the incident tabletop, the first access review and the first training completion (founder); the `maxConcurrentSessions` key in `server/routes/tenant-config.ts`'s settings schema and tier defaults, its OQ step, and the founder's confirmation of the default of five (file inside another lane's window until 02:42 UTC 09-27); the first credentialed execution of OQ-PROJ-19 (written with the change); P1-22 per-organisation retention policies and the `.env.example` lines for `ENABLE_RETENTION_SWEEP`/`RETENTION_SWEEP_CRON` (file hot until 02:48 UTC 09-27); **Disclosed edit inside another lane's window:** `package.json` (last touched 02:48 UTC 09-26 by lane `…01SuVLo2`) gained six `scripts` lines for `ci:upload-guards*` and `ci:trivyignore-hygiene*` when the two gates were wired into `.husky/pre-push` at 07:23 UTC, the moment that file's window closed; no other key changed; `authoring.router.ts` two upload sites (window 23:24 UTC 09-26); P1-1, P1-22, the D3/D5/W2 and founder items per the plan. **Trunk CI:** red before and after this lane on the same three jobs (Lint: table-nothing-creates, proof tier, requestDb adoption, ESLint ratchet; Security Scan: Trivy config AWS-0011 WAF; Test: run tests) — see `docs/evidence/D6/2026-09-25-p1/README.md`. | `…session_0194UQPxy9Er2ibRAjog8Ven` | **released** 2026-09-26 — row **D6** |
| **D6 — platform security audit and US/JP/EU remediation plan.** Read-only audit at `adbf2d18` by three domain auditors (identity/API; audit trail, Part 11, retention, AI; infra/CI/governance) with every finding re-read by the control tower; files: `docs/security/SECURITY_AUDIT_2026-09-24.md`, `docs/security/REGULATORY_CONTROL_MAP_US_JP_EU.md`, `docs/security/REMEDIATION_AND_ENHANCEMENT_PLAN_2026-09-24.md`, `docs/security/SECURITY_README.md` (index), `.claude/agents/security-auditor.md` (the weekly review's missing fourth lens), `docs/evidence/reviews/2026-09-24/security.md`. No code is changed; each P0 is handed to the lane that owns its files | `…session_0194UQPxy9Er2ibRAjog8Ven` | **released** 2026-09-24 — row **D6**, done in `d409114e` (+ this commit); evidence `docs/evidence/D6/2026-09-24-security-audit/`, first weekly security lens `docs/evidence/reviews/2026-09-24/`. Handed on, not edited: every P0 in `docs/security/REMEDIATION_AND_ENHANCEMENT_PLAN_2026-09-24.md` §1 (three parallel lanes: identity P0-1…6/13; Part 11 substrate P0-7…10/18; cloud and pipeline P0-11/14…17; AnA P0-12), and DP-31…33 for the QMS/Authoring lanes (P1-28…30) |
| **D3 — the cortex query route's client-supplied tenant key.** `server/routes/cortexQueryRoutes.ts` (`x-org-uuid` fallback; the search branch that runs with no org predicate), measured end to end on the two-tenant fixture as its own file (`tests/db/cortex-query-tenant-header.dbtest.ts`). Evidence: `docs/evidence/D3/2026-09-24-cortex-tenant-header/`. Not `send-message.ts`'s identical fallback (the chat lane's), which is reported there, not edited | `…session_01J935DZwfFEardJCv85SJds` | **released** 2026-09-24 — row **D3**, done in `c062f4b0`; evidence as named. Handed on (not edited): `search_atoms_hybrid` broken on every from-blank install, its argument order, and `send-message.ts`'s identical fallback — under "→ Retrieval, unclaimed" below |
| **D5 — the e-signature modal's transport, and the document-lifecycle placement this session wired.** `client/src/concept2cure/hooks/useEsignature.ts`, `scripts/ci/check-unauthenticated-fetch*` (done: the shared `<EsignModal>` could verify no signer in any environment; evidence `docs/evidence/D5-ESIGN-TOKEN/2026-09-24/`). Done too: `server/routes/document-lifecycle.ts` (mounted at `/api/regulatory/documents`, so the re-verification's "`POST /api/regulatory/documents/:id/sign` records an approval with no re-auth" is THIS router, not another lane's) — signing and `advance → approved` go through `reverifySigner` with server role and signing authority, a body `signatureRef` is never cited, the gate runs before the ceremony, and every write needs `regulatory-author`; evidence `docs/evidence/D5-LIFECYCLE-SIGNING/2026-09-24/`. Not touched here, handed on below once the re-verification's skeptics finish: the artifact status route (→ `…01Wcyqbq`), the AnA vault tools (→ `…01DiJJAk`). Also owns `VAULT_DATA_ROOM_ASSESSMENT_2026-09-05.md` | `…session_01KnUGoX3g4R4FWKWGc2sTbN` | **claimed** 2026-09-24 — row **D5**; the transport half and the lifecycle signing half done; the handoff list for other lanes follows. **Later the same day, this lane's own defects from the re-baseline:** the lifecycle route's leaf-writer refusals were 500s (`4df7e138`, D5); the public API's scope test compared `/docs` with itself (`5157a08c`) and its read model reported an ingest stage nothing records (`e4ecfb26`), evidence `docs/evidence/D6-API-SCOPES/2026-09-24/`; the assessment is re-baselined (§0) and corrected in place. The recorded-provider reader is the D1 storage lane's (row above) and was not touched here. Duplicated `…01DiJJAk`'s "0% complete" fix by not re-reading its claim; yielded at merge. **Evening, from the Vault-against-Veeva mapping (`wf_7221b784-39b`):** a search hit opened the first hit's record (`431c75a8`); the data room's counts stopped at 200 silently, counted re-uploads twice and called a refusal "classified" (`docs/evidence/D2-DATA-ROOM-COUNTS/2026-09-24/`; the evidence spine's adapter now exposes `isCurrent`). **For the D1 storage lane (`…01AiwZKG`):** `server/routes/__tests__/vault-download.test.ts` was red on trunk after `7fd5d6af` because its storage mock had no `getStorageProviderFor`. It is fixed in `ecca937c` (mock only, same assertions); please check it matches your intent. |
| **D3 — the RAG pipeline's vault tenant key.** `server/services/advancedRAGPipeline.ts` (`withTenantContext` / `retrieve` only: a guard, no other line changed), `tests/db/rag-pipeline-tenant-scope.dbtest.ts`. Evidence: `docs/evidence/D3/2026-09-24-rag-pipeline-tenant/`. Not `send-message.ts` or `ana-features.ts` (their header fallbacks stay with their lanes) | `…session_01J935DZwfFEardJCv85SJds` | **released** 2026-09-24 — row **D3**, done. **Claimed late:** this row was written when the work was filed, not before it began; the file had another lane's edit within 24h (`ffc1643a`, `…01DiJJAk`, the vault arm's recall query, 16:30). This change is additive, outside that query, made on top of it, and that lane's `vault-passage-search.dbtest.ts` passes with it |
| **D3 — vault RLS's ownership and delegation inputs are writable by every tenant.** `core.get_program_org_id` resolves a program's owner from `core.programs` / `core.program_ownerships` *before* the canonical `regulatory_programs`, and `identity.can_access_program` / `can_write_program` honour `identity.org_relationships`, which has no RLS. As `app_service` with RLS enforcing, one row written in tenant A's scope reads B's vault (a planted `core.programs` row also locks B out; a self-granted delegation also writes B's documents, unseen by B). No application code writes either table, so no HTTP path is known to reach it. Files: `db/migrations/20260828_program_org_resolution_canonical.sql` (amended in place, Rule 1), the migration giving `identity.org_relationships` RLS, a new `tests/db/vault-program-ownership.dbtest.ts` on the shared fixture. Evidence: `docs/evidence/D3/2026-09-24-vault-program-ownership/` | `…session_01J935DZwfFEardJCv85SJds` | **released** 2026-09-24 — row **D3**, done: the resolver consults `regulatory_programs` first (creator amended in place), and `identity.org_relationships` is sponsor-write/party-read under FORCEd RLS. Red 4 of 6, each half shown load-bearing by its own mutation, green 6 of 6; from empty, 22 vault and fixture suites 207 of 207. Left open and recorded there: `core.programs`' `org_id IS NULL` arm (the uuid sweep's), `identity.organizations` without RLS. **2026-09-25:** the same self-grant reached the 43 tables policied through `identity.can_access_org`/`can_write_org` (ai, ectd_v4, fhir, innovation, product_master, identity.users); shown rewriting another tenant's `ectd_v4` submission before, refused after, 7/7 |
| **D2 / D6 — launch scope enforced at the API, not only in navigation.** Hand-on item 5 below, unclaimed: `moduleEntitlementGate` never reads launch scope, defaults to off, and passes every path no `apiPrefixes` entry names. `server/middleware/moduleEntitlementGate.ts` (launch-scope branch), `server/services/entitlements/launch-scope.ts`, a CI gate proving no launch or shell surface calls a refused path, and evidence in `docs/evidence/D2-API-SCOPE/`. The `MODULE_ENFORCEMENT` modes and tier logic are left alone | `…session_01E8btkB8mcLirW4rNvsMNxK` | **claimed** 2026-09-25. Landed: stage 1 (mapped out-of-scope paths answer 403 `LAUNCH_SCOPE` in production), 2a (every launch call attributed, `ci:launch-scope-api`) and 2b (unclaimed paths reported, refused only with `LAUNCH_SCOPE_API_UNATTRIBUTED=enforce`); OQ-005 v0.6 / URS-005 v0.4 not yet executed. Stage 3 (same day): every route production mounts was listed from the running registration (3,779) and classified. The public paths and the `/api/user` alias were the only legitimate callers left unclaimed, and they are now claimed. A launch screen that computes its `/api/` namespace now fails `ci:launch-scope-api`. **Owner decision 2026-09-26: production enforces.** Unset `LAUNCH_SCOPE_API_UNATTRIBUTED` means `enforce` in production. `report` there is an explicit, boot-logged value, and every refusal is on the enforcement report. **Row done** apart from executing OQ-005 v0.6 (validation lane). **Next in this lane (claimed 2026-09-26): launch scope applied to AnA.** AnA's 763 tools and 115 platform commands reach services in-process, so the API gate never sees them. The work: classify each against the launch catalog, withhold hidden-app tools in `governedToolsetFor`, and refuse hidden-app platform commands. Evidence will go under `docs/evidence/D2-API-SCOPE/2026-09-26-ana-tools/`. Files inside another lane's 24h window (`AnaToolExecutor.ts`, `stream.ts`, `send-message.ts`, `ana-realtime.ts`) are handed on, not edited. **Done 2026-09-26:** all 763 tools and 115 commands are classified (189 and 47 hidden-app). `governedToolsetFor` withholds hidden-app tools under launch scope, and a new tool that is not classified fails `ana-launch-scope.test.ts`. Also found and fixed: `gateway-transmittals` claimed all of `/api/mdx`, so 130 device-kit routes answered as launch; they are now refused (`docs/evidence/D2-API-SCOPE/2026-09-26-mdx-namespace/`). **2026-09-29:** the 47 hidden-app platform commands are refused in `authorizeCommand` (all four dispatch paths). The realtime door now composes through `governedToolsetFor` (picked up by its lane). Also 2026-09-29: three more broad claims closed. `dossier-map` held all of `/api/global-ri` and `/api/rim`, `project-home` and `program-journey` held `/api/rim`, and `submission-center` held all of `/api/510k/estar`. In production 112 routes (40 writes) now move from launch to refused (`docs/evidence/D2-API-SCOPE/2026-09-29-broad-claims/`). Also 2026-09-29, after the owner's correction: `/api/biotech-artifacts` generated ICSRs, PSURs, CIOMS forms, expedited reports and cover letters and recorded none of them. It is no longer served in production. When PV or clinical operations ship, their generators write through the Vault record (`docs/evidence/D2-API-SCOPE/2026-09-29-unrecorded-generators/`). Then the sweep that correction called for. Chat-artifact DOCX/PDF/PPTX exports and template renders returned generated documents with no record. They now write an `EXPORT_GENERATED` audit row with the delivered bytes' SHA-256, and refuse delivery without it (`docs/evidence/D5-EXPORTS-RECORDED/2026-09-29/`). A fourth broad claim followed from that sweep. Projects and Project home each claimed all of `/api/programs`, so 26 device 510(k) predicate-intel, SE and RTM routes (12 writes) were served in production. Those routes are now claimed by `device-510k` (`docs/evidence/D2-API-SCOPE/2026-09-29-programs-claim/`). Hidden-app AnA tools are now refused at execution in the `registerToolHandler` wrapper. That closes the stream's direct CMC-interview call and by-name dispatch of tools AnA was never offered (`docs/evidence/D2-API-SCOPE/2026-09-26-ana-tools/`, 2026-09-30). Exports of existing records (the lineage PDF and the citation DOCX/CSV downloads) are now recorded the same way: `docs/evidence/D5-EXPORTS-RECORDED/2026-10-01/`, owner-delegated decision. The lineage dossier XML is recorded too. The Artifacts Center export of approved or signed content is recorded too (closed the same day; edits inside `…01KnUGoX`'s and `…0194UQPx`'s windows are disclosed in that README under the founder's 2026-10-01 instruction). Every download served in production now records what it delivers, serves a stored document, or is operator tooling. **Next in this lane:** D6's open sign-in decisions (emailed code for an authenticator-enrolled account), then server-side navigation locks (low value). Evidence `docs/evidence/D2-API-SCOPE/2026-09-25/` |
| **D3 — `public.organizations` has no RLS, and its uuid is the tenant key.** Found by sweeping every table an RLS policy or policy function reads for "no RLS and writable by `app_service`": one hit. As `app_service` with RLS enforcing, tenant A moved its own org to a fresh uuid and gave B's org A's old one, then read B's vault (`core.get_program_org_id` maps programs to `organizations.uuid`). Files: `migrations/20260925_organizations_tenant_key_immutable.sql`, `tests/db/rls-policy-inputs.dbtest.ts` (the sweep, with two self-tests and guarded reviewed exceptions), two cases in `tests/db/vault-program-ownership.dbtest.ts`. Evidence: `docs/evidence/D3/2026-09-25-organizations-tenant-key/` | `…session_01J935DZwfFEardJCv85SJds` | **released** 2026-09-25 — row **D3**, done: `id` and `uuid` immutable once set (trigger, every role); red 4 of 13, green 13 of 13; whole `tests/db` tier 705 of 712 with the same 7 failing without the change. **Not done, handed on below:** narrowing writes to `organizations`' other columns (an own-org-or-platform policy was built, measured 12/12 and withdrawn: it would break five platform-staff override paths) |
| **D3 — `organizations` writes: own org or platform only.** The item handed on 2026-09-25 ("→ D3, unclaimed — `organizations` writes"). First the five platform-staff override paths (`organizations-routes.ts` PATCH `/:id/profile`, `/:id/settings`; `tenant-config.ts` :203/:303/:404) open the system scope when, and only when, staff target another org — a route-level middleware over the existing `establishRequestSystemScope`; `:500`'s unchecked update fixed. Then the own-org-or-platform write policy on `public.organizations` (new migration). Files: those two routes, one new middleware file, the migration, a dbtest through the production routers. Evidence: `docs/evidence/D3/2026-09-26-organizations-writes/` | `…session_01J935DZwfFEardJCv85SJds` | **released** 2026-09-26 — row **D3**, done: the five staff paths open the system scope only when staff act on another org (`server/middleware/staffCrossOrgScope.ts`); zero-row writes are 404s, never success; own-org-or-platform UPDATE/DELETE policy on `organizations`. Before 1 fail, policy alone 3 fail (settings answered success and wrote nothing), each half's mutation fails its own cases, green 19/19; `tests/db` 711/718 (the same 7 fail without it). **Found, not fixed:** `organization_users` has no RLS at all — see the item below |
| **D3 — `organization_users` (memberships) has no RLS.** The open item found 2026-09-26. As `app_service` in a member's tenant scope: its user written an `admin` membership in another tenant (the row `authMiddleware` accepts a token for that tenant on) and promoted to `super_admin` in its own. The table is on `RLS_ALLOWLIST` "temporarily retained from the staged rollout" (`server/db/rlsAllowlist.ts`, and the three synced copies). Plan: writes own-org-or-platform (reads stay open: the pre-auth membership check and the org switcher read across orgs), after mapping every writer's scope; staff roles never written from a tenant scope. Files: a new migration, the allowlist entry's reason, whichever writers run in the wrong scope, a dbtest through the real auth. Evidence: `docs/evidence/D3/2026-09-26-memberships/` | `…session_01J935DZwfFEardJCv85SJds` | **released** 2026-09-26 — row **D3**, done: writes own-org-or-platform, staff roles minted by the platform scope only (trigger); reads stay open (allowlist reason rewritten). Signup, persona and tenant-users' cross-org admin writes moved into the membership's own org — the last also repairs the member-create regression `85b67b50` caused. Before 3 fail (A's token admitted into B, 200), each piece's mutation fails its own cases, 10/10; four D3 contracts 29/29; `tests/db` 715/732, all 17 failures pre-existing. Handed on below: cross-org invitation acceptance, two fixture passwords |
| **D3 — `public.users` is readable from any tenant scope.** The item handed on 2026-09-26 (`…013CtPf8`). Plan: RLS on `public.users` — a tenant scope sees members of its organization (via `organization_users`) and its own row; the platform/pre-auth scope keeps sign-in, reset, OTP, SCIM, user admin. Writes likewise. Files: a new migration above the final pair, `rls-coverage-check.sql`'s note, a dbtest. Evidence: `docs/evidence/D3/2026-09-28-users-rls/` | `…session_01YZFCXRXJpXWhWV4Dj4HB79` | **released** 2026-09-28 — row **D3**, done: RLS + FORCE on `public.users` by membership, pre-auth/system scopes keep the table (`20260928_users_membership_rls.sql`, in the set after the memberships file). Before: 3 of 7 fail (A read and rewrote B's password hash, MFA secret, reset token); after 11/11, each of three writer moves (existing-account check, setup-token scope, member-list scope) failing its own case when undone; affected suites 178/178; `tests/db` 753/766, the 13 failing identically with `users` RLS off. Handed on below the item: null actor names outside the org, `users`' children, pre-auth breadth; and the D3 row of `docs/LAUNCH_DEFINITION_OF_DONE.md` should cite `docs/evidence/D3/2026-09-28-users-rls/` (**done 2026-09-29**: the row cites all seven 2026-09-28/29 evidence directories) |
| **D3 — `platform_role_grants` is writable from any tenant scope.** Handed on by the `public.users` item (2026-09-28). As `app_service` in a plain member's tenant scope, a `super_admin` grant was written (`INSERT 0 1`); `requirePlatformAdmin` reads that table. Plan: RLS + FORCE; SELECT stays open (the platform-admin check reads it in the caller's tenant scope), INSERT/UPDATE/DELETE from the platform scope only; writers moved if any runs elsewhere. Files: a new migration after `20260928_users_membership_rls.sql`, a dbtest, any mis-scoped writer. Evidence: `docs/evidence/D3/2026-09-28-platform-role-grants/` | `…session_01YZFCXRXJpXWhWV4Dj4HB79` | **released** 2026-09-28 — row **D3**, done: RLS + FORCE, SELECT open, INSERT/UPDATE/DELETE platform scope only (`20260928_platform_role_grants_platform_writes.sql`); no writer moved (the console already runs in the system scope). Before 2 of 6 fail (planted `super_admin`, console 200); after 6/6; mutation (console outside the system scope) fails case 6; affected suites 212/212; `entitlement-grants-resolution`'s posture assertion rewritten to the new truth |
| **D3 — `drafting_tasks` (draft content) is readable from any tenant scope.** Found working the `public.users` children hand-on (2026-09-28). The table holds `draft_content`, `document_title`, `ectd_section` and a text `project_id` naming a `regulatory_programs` row, with no organisation column and no RLS; its two routes filter by program ownership in SQL, the table does not. Plan: one line on `20260813_child_table_parent_scoped_rls.sql`'s spec list (the canonical child scope; parent `regulatory_programs`, text comparison), amended in place with a dated note; a dbtest through the real drafting routes. Not the file's position in the set (the child-scope lane's). Evidence: `docs/evidence/D3/2026-09-28-drafting-tasks/` | `…session_01YZFCXRXJpXWhWV4Dj4HB79` | **released** 2026-09-28 — row **D3**, done: one spec line on `20260813_child_table_parent_scoped_rls.sql` (`drafting_tasks` → `regulatory_programs`, text key), amended in place with a dated note; no application change (the routes already work inside the program's org). Before 3 of 7 fail (A read, rewrote and deleted B's draft, and filed tasks under B's program and under none); after 7/7; the child-scope contract gains the table (scratch table, isolation case, list entry) and a shared `seedProgram` helper, 13/13; with the spec line and the live policy removed, 5 cases fail across both files; from blank 37/37; `tests/db` 768/781, the same 13 pre-existing |
| **D3 — accepting an invitation to another organization fails under enforcement.** The open item (D2/D3) under the `organization_users` hand-ons: `organization_invitations` carries the FORCEd tenant policy, so an invitee signed into X can neither list nor accept nor decline an invitation to Y. Plan: a definer lookup of pending invitations for a member of the calling scope's organization (never an arbitrary user), then accept/decline inside the inviting organization's scope after the invitation is verified as the caller's. Files: a migration after `20260928_platform_role_grants_platform_writes.sql`, `server/routes/tenant-users.ts` (the three invitation routes), `atomicAcceptInvitation`, a dbtest through the real routes. Evidence: `docs/evidence/D3/2026-09-28-invitation-acceptance/` | `…session_01YZFCXRXJpXWhWV4Dj4HB79` | **released** 2026-09-28 — row **D3**, done: `invitations_for_member(user)` (definer, id-to-invitations for a member of the calling scope's organization only, `20260928_invitations_for_member.sql`); `/invitations/mine` lists through it; accept and decline find the caller's own invitation through it and write in the inviting organization's scope (`inVerifiedOrgScope`); another person's invitation is 404, a decline that reaches nothing is 409 (was a silent 200). Before 3 of 5 fail (empty list, accept 404, decline 404); after 6/6; each of the three parts fails its own case when undone; 33/33 with memberships, users-rls, organizations-writes; mocked 31/31; `tests/db` 774/787, the same 13 pre-existing |
| **D3 — the child scope runs after every table and parent policy the set creates (taken over).** The row above, claimed 2026-09-24 by `…01GyGhjg`, taken over at the founder's direction (2026-09-29). Measured again 2026-09-28 on a blank database: `regulatory_harmonization.export_job_audit_log` unscoped after the first deploy, scoped after the second. Same files as that row; `migration-set.mjs` and `ci.yml` were inside other lanes' 24 h windows (until 18:38 / 18:26 UTC 09-29); the change landed inside them, after checking no hunk overlaps theirs (see the evidence). Evidence: `docs/evidence/D3/2026-09-29-child-scope-first-deploy/` | `…session_01YZFCXRXJpXWhWV4Dj4HB79` | **released** 2026-09-29 — row **D3**, done: the child scope runs in the isolation tail (uuid step → child scope → sweep, `CHILD_TABLE_PARENT_SCOPE`), pinned by `ci:migration-set-order` (refuses trunk's order); the two tail contracts updated; CI's blank-database job checks coverage after the FIRST deploy. Blank database at trunk: 1 unscoped child after one deploy; with the move: 0 after one and after two, 72/72 there; schema-contract 91/91. L201–L203 ledger rows corrected (atom-search 5/5). Found on the way and fixed in `89a8ade0`: my 2026-09-28 migrations halted the set on a minimal base |
| **D3 — actor names outside the organization render as ids.** The hand-on under the `public.users` item. Decided (founder: "own it all"): a resolver, not a snapshot column on the hash-chained `audit_logs` — `public.actor_name(id)` returns name and email only, for members of the calling organization and actors in its own audit trail, nobody else; the audit-trail ledger resolves through it; the other display joins are triaged and converted where the person may have left. Files: a migration, `audit-trail-ledger.routes.ts` and its test (inside another lane's window until 17:05 UTC 09-29; landed inside it, no hunk overlapping `f0147f45`'s), the display joins triaged, a dbtest through the real audit writer and ledger reader. Evidence: `docs/evidence/D3/2026-09-29-actor-names/` | `…session_01YZFCXRXJpXWhWV4Dj4HB79` | **claimed** 2026-09-29 — ledger landed (red `user 951` → the name; 4/4; M1/M2); the remaining display joins in triage |
| **D3 — the pre-auth scope reaches every account.** The hand-on under the `public.users` item: tenant '0' reads and writes all of `public.users`. First the map — which handlers run in the pre-auth scope on an already-authenticated identity, and whether any can be steered to another user's row — then the narrowing. `server/routes/authEnterprise.ts` is inside another lane's window until 17:04 UTC 09-29. Evidence: `docs/evidence/D3/2026-09-29-pre-auth-scope/` | `…session_01YZFCXRXJpXWhWV4Dj4HB79` | **released** 2026-09-29 — row **D3**, done: the map (every pre-auth handler and its `users` statements, in the evidence); the one steerable handler, `GET /api/users/:id`, now looks up in the verified token's organisation scope by membership (it loaded any user's full row pre-auth, guarded only by a `default_organization_id` check: a removed person stayed visible, a member with another default was hidden). Before 2 of 5 fail; after 5/5; back in the pre-auth scope B's member is returned to A; 87/87 with the sign-in, OTP, account-standing and memberships suites. Handed on below: the structural narrowing (a function per pre-auth statement) and `/api/user/preferences` being shadowed |
| **D3 — a new RLS bypass is reviewed before it ships: `SECURITY DEFINER` functions the runtime role can call.** A definer function runs as its owner and reads past every tenant policy, so each one callable by `app_service` is a way around RLS. Swept 2026-09-29 on a database provisioned from empty at `8b9d18c6d`: 73. None reachable on a launch path with a caller-chosen tenant (the one destructive candidate, `ectd.seed_project_hierarchy`, has no mounted caller). Files: a live-database contract over the catalog with a reviewed baseline (each entry a reason; a new one fails until reviewed), a self-test that plants one in a rolled-back transaction. Evidence: `docs/evidence/D3/2026-09-29-definer-functions/` | `…session_01J935DZwfFEardJCv85SJds` | **released** 2026-09-29 — row **D3**, done: `tests/db/security-definer-functions.dbtest.ts` + `scripts/ci/security-definer-baseline.json` (73: 20 reviewed, 6 reviewed-risk with their condition, 47 unreviewed and grandfathered). Self-test plants a tenant-by-argument definer in a rolled-back transaction; a missing entry fails. **For every lane: a new callable `SECURITY DEFINER` function needs an entry (since 2026-09-30 in `scripts/db/security-definer-allowlist.json`, row above) with a reason, or it is not executable.** Open: revoking EXECUTE from uncalled ones; `ectd.seed_project_hierarchy` must be revoked or tenant-checked before anything calls it |
| **D3 — an unreviewed `SECURITY DEFINER` function is not callable by the runtime role.** Refines the 2026-09-29 gate: 47 unreviewed definer functions (and `ectd.seed_project_hierarchy`) are callable by `app_service` although nothing in `server/` calls them. A migration REVOKE would not hold: `scripts/db/provision-app-role.mjs` GRANTs EXECUTE on every function in every schema on every deploy, after the migration set. So the grant recipe revokes EXECUTE (runtime role and PUBLIC) on every definer function not on the reviewed allowlist, which moves to `scripts/db/security-definer-allowlist.json` (the image ships `scripts/db`, not `scripts/ci`). Files: `provision-app-role.mjs` (the grant recipe), the allowlist, `tests/db/security-definer-functions.dbtest.ts`. Evidence: `docs/evidence/D3/2026-09-30-definer-revoke/` | `…session_01J935DZwfFEardJCv85SJds` | **released** 2026-09-30 — row **D3**, done: the grant recipe ends with `revokeUnreviewedDefinerExecute`; the allowlist (26: 20 reviewed, 6 reviewed-risk) replaces the baseline and has no unreviewed status. Red: 48 callable and unlisted; the recipe revokes them; 5/5; the whole `tests/db` tier 843/843 after the revoke; from empty the install path revokes them itself, 9/9 with the policy-inputs contract. **For every lane: a new callable `SECURITY DEFINER` function is not executable by `app_service` until it is on `scripts/db/security-definer-allowlist.json` with a reason** — a migration `GRANT` does not survive the recipe |
| **D1 — the self-host and beta Compose stacks can boot, and someone can sign in.** `docker-compose.yml` and `docker-compose.beta.yml` run the app with `NODE_ENV=production` and say they carry its fail-closed boot contract, but neither sets `CONCEPT2CURE_SIGNER_MODE`, `AI_SENSITIVE_DATA_POLICY_MODE` or `AI_PROVIDER_PLACEMENT_APPROVALS` (each refuses boot), nor `APP_URL`/`ALLOWED_ORIGINS`, and neither passes `SMTP_*`, so even a booted stack could sign no one in (login codes are mandatory). The beta stack passes `SENDGRID_API_KEY`, which nothing delivers mail with. Nothing compares them with the contract. Files: `docker-compose.yml`, `docker-compose.beta.yml` (the `app` service's environment and header comments), `.env.beta.example`, a new `scripts/ci/check-compose-boot-contract.mjs` that takes the required names from deploy-aws.yml's preflight (one list, not a copy), its `package.json` entry and one CI step. Evidence: `docs/evidence/W2/2026-10-01-compose-boot-contract/` | `…session_01J935DZwfFEardJCv85SJds` | **done** 2026-10-01 — row **D1**: `ci:compose-boot-contract` (names from the preflight; self-test) red 22 problems then green; both stacks pass the signer, placement, audit, origin and SMTP settings; `docker compose config` resolves with them set and stops naming `SMTP_HOST` without it; the server's own boot assertions refuse both stacks as on trunk and accept both after. A full container boot is not claimed |
| **D1 — the VPC's private paths to S3 and KMS carry traffic.** `terraform/modules/vpc-secure/main.tf` declares both endpoints and neither can be used: the S3 gateway endpoint is associated with no route table, so Vault and evidence bytes leave through the NAT gateway (billed per GB), and the KMS interface endpoint's security group admits nothing and private DNS is off, so every release signature goes out through the NAT too, while the endpoint is billed. Found preparing the founder's external-requirements inventory. Files: `terraform/modules/vpc-secure/main.tf` (the two endpoints and the endpoint security group only), a new `terraform/modules/vpc-secure/tests/private_paths.tftest.hcl`, one matrix line in `.github/workflows/terraform-tests.yml`. Not `terraform/stack` (`…01SuVLo2`'s) or `environments/*` (`…013CtPf8`'s). Evidence: `docs/evidence/W2/2026-10-01-vpc-private-paths/` | `…session_01J935DZwfFEardJCv85SJds` | **done** 2026-10-01 — row **D1**: the S3 endpoint is on the private route table; the KMS endpoint has private DNS and admits HTTPS from the VPC alone. Module test red 0/2 then green 2/2, now in the CI matrix; the stack's 28 tests and the preflight proof still hold. Apply-time check written in the evidence. **Handed on, not done here:** → `…01SuVLo2` (`terraform/stack/variables.tf`): `openai_api_key` has no validation, so an empty value deploys and Vault search silently has no embeddings; worker count and Redis stay with the founder's B6+B7 decision |
| **D1 / D7 — submission-grade enforcement on in production: withdrawn before any code, 2026-10-01.** The claim was to make `ESTAR_REQUIRE_TEMPLATE`, `ECTD_REQUIRE_DTD`, `ECTD_REQUIRE_EVALIDATOR` and `ECTD_REQUIRE_PDFA` required by default in production. That contradicts a decision already recorded and enforced: `docs/reports/ectd-gate-posture-2026-09-08.md`, held by `submission-gate-posture.test.ts`, which fails when a precondition is met so the gate is re-decided. **DTD, EVALIDATOR and eSTAR** still wait on procurement (no `.dtd` vendored; no validator configured; the three PreSTAR templates are absent, so Q-Sub, IDE and 513(g) builds would block). On today, they would block every eCTD package and every dispatch. **PDF/A** is the one whose recorded precondition is now met: Ghostscript and veraPDF are in `Dockerfile.optimized` since `cd02466a4`. It is held anyway. The gate refuses any PDF leaf that was not converted, but FDA and EMA both accept plain PDF 1.4–1.7. On, it would refuse packages the agency accepts, so it needs a product decision on the rule first (see the dated note in the posture report). The preflight check was written and seen to refuse the rendered task definition, then reverted. Nothing was committed but this row. | `…session_01J935DZwfFEardJCv85SJds` | **released** 2026-10-01, no change |
| WO-15 finding 5 — `c2c_template_specs.doc_types` | `…session_01E2moDuSNSNTBqAHV5GtWoz` | **released** — fixed |
| WO-15 finding 8 — the two blind gates | `…session_01E2moDuSNSNTBqAHV5GtWoz` | **released** — fixed `b9152a016` |
| WO-15 finding 4 — `/api/design-risk` | `…session_01J935DZwfFEardJCv85SJds` | **released** — done `153481465` |
| WO-16C — discarded §11.10(e) audit-write outcomes: the `ci:discarded-audit-write` population (148 sites / 70 files on 2026-09-24), launch-path sites first. Files another lane touched in the last 24h are skipped, not raced | `…session_01E8btkB8mcLirW4rNvsMNxK` | **claimed** 2026-09-24. Measured: 25 of 148 are on launch paths; 14 converted, the client now shows a lost row; 148 → 133. Left and handed on: see *Found by the WO-16C audit-outcome lane* below |
| WO-15 finding 2 — `project_charters` 27 vs 48 columns | `…session_01E2moDuSNSNTBqAHV5GtWoz` | **released** — fixed |
| `KNOWN_UNLISTED` triage — 10 entries, 16 tables | `…session_01E2moDuSNSNTBqAHV5GtWoz` | **released** — fixed, all ten now on the applier |
| **W1 / D2** — the relations server SQL names that no provisioned database has, measured against *launch reach* (a launch-app or shell action, an AnA tool, or a boot/cron/worker path). Distinct from `…01PwLFr8`'s first-render surface sweep and `…01KiDof7`'s all-SQL guards. Evidence: `docs/evidence/W1/2026-09-24-launch-reach/` | `…session_01E2moDuSNSNTBqAHV5GtWoz` | **released** 2026-09-24 — every baselined relation classified by launch reach; the two production-reached ones fixed (enterprise onboarding intake `254f502da`, Firecrawl webhook); `ci:runtime-ddl` added (`cbe9844c1`); baseline 42 → 40. Earlier, pre-Rule-2: DEAD surfaces deleted (§7), triage corrected (§8), CMC playbook provisioned (§9) |
| AnA client-files surface — `server/services/vault/document-*`, `vault-ingest/placement.service.ts`, `server/services/ana/document-*-tools*`, `ana-session-bootstrap*`, `server/startup/document-catalog-bootstrap.ts`, `server/services/chat-uploads/*`, the retrieval-atom blocks of `server/routes/chat/upload.ts`, persona's CLIENT'S FILES section, and the lane's own tables `vault.document_catalog` / `vault.document_read_receipts` (`migrations/20260905_document_catalog.sql`) | `…session_01DiJJAkasGVrccrxjhYyjxG` | **claimed** — re-scoped 2026-09-24 under Rule 2: **row D3** (local half — RLS on the lane's two tables, which have none), evidence `docs/evidence/D3/2026-09-24-vault-catalog/`; green is **blocked** on D1 (D3's named evidence is a staging contract log). Defects in the lane's own code found in the same pass (model-governance classification, Part 11 attribution of AnA filing, unverified key_data figures) are fixed as defects with evidence under the row each touches. Also done 2026-09-24: the three items the vault re-baseline handed this lane, and the Vault's document count (URS-VAULT-004; `docs/evidence/D4/2026-09-24-vault-document-count/`). The Vault read model and surface are `…01KnUGoX`'s; the assessment's search-coverage and data-room-count findings stay with that lane, not taken here. **No toggle is turned on** — that is the founder's decision. |
| WO-3 — tenant-isolation proof: the `app.current_org_id` distribution (`orgMembership` enrichment, token mint paths) | `…session_01J935DZwfFEardJCv85SJds` | **released** 2026-09-19 — question answered, degraded path pinned; the 230-route migration itself is NOT claimed |
| IND eCTD demo path — JM's *"WO-09 Biotech IND eCTD Sequence Demo"*, **not** `WO-9-pilot-surface-lock.md` below (two work orders share the number). `server/services/ind-forms/*`, `server/routes/ind-forms.routes.ts`, `IndFormsPanel.tsx`, `AuthoringPlaceIntoFiling.tsx`, `ind-checklist-view-assembler.ts`, `scripts/seed/ga-demo.d/111-*`/`112-*`. Record: `docs/reports/wo9-phase1-ectd-unblock-2026-09-03.md` | `…session_01TtwRHmBMya3QTFCbFsBjoj` | **claimed** — row D7 (W5), evidence `docs/evidence/W5/2026-09-29-ind-ectd/`. Clicks 1–6 clicked in Chromium 2026-09-29 on a deploy-shaped build (install-fresh + deploy-migrate + one seed); 0000 and a rehearsal 0001 (withdrawal) exported, pointers verified from the ZIPs. Rehearsal binding delivered (JM, 2026-09-23). **Open, JM's decision:** how an approved document is revised so a `replace` can bind. **Blocked:** DTDs/ICH stylesheet (egress refused), ESG credentials, PDF/A toolchain, JM's eValidator run and recording. Record: report §20 |
| W2 / D1 — Terraform to a booting task: B1 (`DATABASE_URL` is a JSON credential), B2 (illegal RDS name), B3 (task definition lacks the preflight's variables), B5 (health check calls `wget`). `terraform/environments/production/*`, `terraform/modules/{rds,secrets,ecs-fargate}/*`. Brief: `docs/evidence/W2/2026-09-23/README.md`. B4/B6/B7 go to the founder, not defaulted | `…session_013CtPf8pjozina2nVvDYkyB` | **blocked** on the founder, with everything provable offline done and pushed (`docs/evidence/W2/2026-09-23b/README.md`): B1–B3, B5 and eight more; the first-provision path; the GitHub deploy/build roles; the compliance-evidence module; the first-apply runbook (item 5). What D1 still needs is an AWS account, DNS/ACM, secret values and the apply, plus decisions B4, B6+B7, audit trail and storage. Also blocked: the lock file's other platforms (`registry.terraform.io` refused by this session's egress). Lane stays claimed for the apply follow-through |
| **W2 / D1 — a deploy's migration does not stall the live application behind a lock, or hold one for a full scan.** `scripts/db/migration-set.mjs` (`applyMigrationFiles` and the lock-policy helpers only, not the file list), `scripts/db/deploy-migrate.mjs` step 3, the `cause` on `authoring-subsystem.mjs`'s rethrow, `tests/db/migration-lock-timeout.dbtest.ts`; next, the files that drop and re-add a validated foreign key on every replay (amended in place, Rule 1). Evidence `docs/evidence/W2/2026-09-25-migration-lock-timeout/` | `…session_013CtPf8pjozina2nVvDYkyB` | **claimed** 2026-09-26 — row **D1**. Done, each shown failing first: (1) lock waits: a request behind a replaying deploy waited 7721 ms against an 8 s reader, now 1985 ms (`docs/evidence/W2/2026-09-25-migration-lock-timeout/`); (2) a no-op deploy re-validated 14 constraints under lock (9 CHECKs incl. `c2c_documents`, 5 FKs to `organizations`), now 0, nine files amended in place; (3) the first deploy did not converge (`20260224_binder_evidence_source_types` ran before its table's creator); (4) every install from blank exited 1 since `ba797ca6d` (`public.users` flagged as a child of `organizations`), classified, not cleared — see the D3 item below. Gate `ci:replay-rebuilds-nothing` in the blank-DB job (`docs/evidence/W2/2026-09-25-replay-rebuilds-nothing/`) |
| W2 / D1 + D6 — B9: the ALB answers CloudFront alone (origin-facing prefix list + origin secret header), so `TRUST_PROXY_HOPS=2` records the user, and the CloudFront→ALB path works: origin certificate check, API 403/404 no longer rewritten to `200 index.html`, `/readyz` `/healthz` `/collab` `/scim/v2` the connector (`/mcp`, OAuth, `/.well-known`) routed to the ALB, deploy smoke test through the public URL and failing closed (audit SMOKE-01). `terraform/modules/{alb,cloudfront}/*`, the `smoke-test` job of `.github/workflows/deploy-aws.yml`. **Lines in the B1–B5 lane's files** (listed here for that lane, which this session had no way to message): `environments/production/main.tf` — the `alb` and `cdn` blocks and `trust_proxy_hops = 2` after `api_target_group_arn` in `ecs`; `variables.tf` — a validation inside `domain_aliases` and `cloudfront_origin_secret` appended at the end; `terraform.tfvars.example` — the secret note and `domain_aliases` | `…session_01GSjEDJLuZsEzPa9PnVg1yF` | **released** 2026-09-24 — done in code, not applied; evidence `docs/evidence/W2/2026-09-24-b9/`. Handed on: HEALTH-01's ALB half (target group `health_check.path`, `modules/alb`) to B5, whose change may edit that attribute; staging's `alb`/`cdn` composition to B8; domain, both certificates, the origin secret and `cloudfront:GetDistribution` on the deploy role to the founder |
| W2 / D1 — TRIVY-01 (July audit, P1): the deploy's `security-gate` runs a blocking Trivy IaC scan ahead of `build-push`, and on 2026-09-24 it fails on 16 HIGH/CRITICAL findings in 5 files, so no tagged deploy can reach production. Each finding fixed, or excepted at the resource with a written reason; then the advisory copy in `ci.yml` becomes blocking so the tree cannot drift back. `.trivyignore`, `infra/k8s/bff-with-predicate-shadow.yaml`, `terraform/bootstrap/*`, `terraform/modules/{alb,cloudfront}/*`, the config-scan step of `ci.yml`; in `terraform/modules/ecs-fargate/main.tf` one comment line on the task egress rule | `…session_01GSjEDJLuZsEzPa9PnVg1yF` | **released** 2026-09-24 — done for the 16 findings it had (evidence `docs/evidence/W2/2026-09-24-trivy/`); the backends' `encrypt = true` removed in `environments/{production,staging}/main.tf` (one line each). Went red again on `7925a33d3` (vault bucket, AWS-0132 ×2); that lane fixed it in `2fe4ec4b2`, the scan exits 0 on trunk, and `ci.yml`'s copy now blocks. Founder decision: a WAF on CloudFront (AWS-0011) |
| W2 / D1 + D6 — SMTP in the stack: login OTP is mandatory second factor and the server says "NO user can log in" without SMTP, but `terraform/stack` carries no SMTP setting and the deploy preflight requires none, so a deploy would boot, read ready, and admit nobody. `terraform/stack/{variables,main}.tf` (SMTP variables; two `module.secrets` entries; SMTP names appended to `boot_environment`/`boot_secrets`, not the vault lane's lines), the preflight's `for VAR in` list in `deploy-aws.yml`, the roots' pass-through (`environments/*/{main,variables}.tf`, tfvars examples) | `…session_01GSjEDJLuZsEzPa9PnVg1yF` | **released** 2026-09-24 — done, not applied: the stack carries SMTP (port 465 only: the mailer requires TLS on no other), the preflight refuses a task definition without it; evidence `docs/evidence/W2/2026-09-24-smtp/`. Founder: provider (SES suggested), verified sending domain, credentials, then `npm run pilot:verify-otp` to a real inbox |
| W2 / D1 — production as configured: two API tasks + a worker from one image, no Redis, no sticky sessions, only the environment `terraform/stack` renders. What breaks for a client that no single-process test shows: state held in one task's memory (sessions, sign-in codes, locks, collab documents, run control), schedulers running on every task, files written to one task's disk, environment the app reads that the stack never sets, binaries the image lacks. Audited by a multi-agent sweep with adversarial verification; each confirmed defect fixed failing-first in its own change, or handed to the lane whose files it is in | `…session_01GSjEDJLuZsEzPa9PnVg1yF` | **active** (CPO mandate, 2026-10-01) — audit filed (24 confirmed, `docs/evidence/W2/2026-09-24-multi-task/audit-findings.md`). **Done on trunk:** U5 locale files uploaded (`f6f1dd9b1`); U8 device PDFs (`eca798f55`); U3a /readyz honest about drafting (`25294ca56`); U7 IND forms in the image + `ci:image-runtime-assets` (`4d3f141d1` — so the IND-forms COPY in `…01SuVLo2`'s row is already done); U12/U13/U15 schedulers run once, in scope (`03dbeaf51`); the security policy ships (`5b06db97b`); U17 wrong authenticator codes count against the account (`829bc50a8`, `server/routes/auth.ts` TOTP path — the same gap in `authEnterprise.ts` is the D6 P0 tranche's); U14 AnA Command's baseline in Postgres and U16 presence beside the durable section locks (`af217590c`); U3b Anthropic first party as the drafting provider: `anthropic_api_key` required by the stack and the deploy preflight, and the placement approvals must name `anthropic` (decided under the CPO mandate; replaces the earlier Bedrock plan, whose SDK is not a dependency and whose pin is not the PQ target — `u3b-drafting-provider.md`).; U2 one native canvas library, so a scanned PDF no longer kills the API task (`u2-native-canvas.md`, `ci:single-native-canvas`).; U10 the frontend publishes only behind a rolled API, and a chunk from the previous release reloads instead of looping (`u10-version-skew.md`).; the GAMP 5 validation kit ships in the image (`f9c16a485`); U18 (found closing image gaps) no password could be set in production — the blocklist read `/app/data` from the bundle — and the pathway engine's empty knowledge base, both cwd-anchored, with the image gate's two blind spots closed (`u18-password-blocklist-bundle.md`).; U19 scheduled jobs run once per window, not once per process — the sentinel's hourly notifications, retention's Part 11 audit rows and the nightly agency sweep each ran up to three times (`u19-scheduler-windows.md`).; U6 edge half: CloudFront waits 60 s for the API, as the ALB does (`u6-edge-timeout.md`). **Handed on:** U6's route half — assemble as a 202 job and a client that re-reads state after a gateway error — to the package-model spine lane (D7), whose route it is. **Open:** the 5-min chain monitor's status from the database. (The retention email read SMTP_PASSWORD, which nothing sets — now sent through emailService.) **Handed on:** U1 scanner → `…01SuVLo2`; U4 durable chat uploads → AnA client-files lane (`…01DiJJAk`) for `chat/upload.ts`, figures with U4; U6 async compile/assemble after WO-16C's window; U9 connector → `…01SuVLo2`/D8 |
| **Launch-catalog review follow-through (D2/D5/D6)** — the 2026-09-22 periodic review's OPEN findings (`docs/evidence/reviews/2026-09-22/`): status each at HEAD, then fix the open, unclaimed ones failing-first (Part 11 #2 QMP audit, #3 contradiction-resolution audit, #4 release-signature manifestation, #5 server-side reason-for-change, T2 task-write authority). T1 (discarded task-ledger outcome) is WO-16C's and is not touched. Also: an adversarial pass over the 54 governed files added 09-19→09-24; findings inside another lane's files are written up here for that lane, not edited. Files another lane touched in the last 24h are skipped. Evidence: `docs/evidence/reviews/2026-09-22/follow-through/` | `…session_01WcyqbqWn6LszBqUWUSNnqA` | **claimed** 2026-09-24. **Handed off, not edited — trunk CI is red on the ESLint warning ratchet (6434 > 6431, +3)** at `7ac08e800`; `--since 019afa70d` names them: package-spine `af6440e98` +2 (`ectd/package-sequence-lifecycle.ts:190` `planSequence` 127 lines; `ectd/package-leaf-bytes.ts:105` `packageLeafBytes` complexity 22), Q3A `3f934764d` +1 (`cmc/__tests__/stability-source.test.ts:164` 109-line arrow). Lint red skips Build and Release Evidence on every trunk push. Pre-push gates lint errors only, so each lane can reproduce with `node scripts/ci/check-eslint-warning-ratchet.mjs --since <its base>`. P4 is fixed in both halves: the server change, and EctdCompile.tsx once it had gone 24h untouched. P5, P6, P7 and V1 are open. P5 and P6 wait on claimed lanes' windows (authoring.router.ts, `…01AiwZKG`, until 09-25 00:58; DocumentWorkbench.tsx, `…01T2wooC`, until 09-25 16:37). **For `…01KnUGoX` (Projects, row D2):** P7, the activity feed that shows `User <id>`: projects.ts :1283 needs a users join, and ProjectHome :1063. **For the AnA lane (`…01DiJJAk`):** V1, Vault filing that sends no reason (Vault.tsx :1358/:1382/:1395; project-vault /file). Plan: `follow-through/README.md`. **New-code audit 2026-09-24:** #1 fixed here: a QMS SOP could be made effective with no e-signature, via the AnA tool, `/api/qms/.../transition` and the mdx-qms create/PATCH. The register now signs through `EsignModal`. #3 fixed (batch leaf pin verdict). #2 is next in this lane. **For the AnA lane (`…01DiJJAk`):** #5 (model-gate field regex), #9 (file-to-vault orphan) and #13 (default M2; `FileToVaultDialog` folder). **For D8:** #6 (the MCP token path skips account standing). Details: `docs/evidence/reviews/2026-09-22/follow-through/README.md`. **P1-28 / DP-31 done 2026-09-25:** a QMS change is approved only through the signed `POST /api/mdx/qms/changes/:id/approve`. `transitionChange` refuses `approved` for every caller, and ChangeControl has Approve via `EsignModal`. **For `…01AiwZKG`:** update the `qms_change_transition` description (AnA cannot approve) and the stale `SegregationOfDutiesError` comment in its handler. **2026-09-25:** P5, P6, P7 and Q1 were fixed by `…01FSu2RL`; nothing in this lane's list is open. **For WO-16C (`…01E8btkB`), who holds `c2c/artifacts.ts` until 19:05 UTC:** after `42eb291d6` an artifact edited during review can never be approved, because the assign route never opens a new round and the decision route refuses a second decision. Fix: open round `latest + 1` when the latest round's decisions carry another `version_reviewed` (details in `follow-through/README.md`). **Pre-push now refuses new ESLint warnings in the pushed files** (`ci:pushed-lint-warnings`, 2026-09-25; `docs/evidence/D5/2026-09-25-pushed-lint-warnings/`). The +11 already on trunk (sso.ts +4; scim.ts, c2c/tasks.ts, gateway.ts, tools/index.ts, ana-realtime.ts, env.ts, audit-enforcement.ts, authoring-file-to-vault.ts, document-chunking.service.ts and five test files +1 each) belongs to the lanes that added it. It blocks whoever next pushes one of those files. |
| Package-model spine — sequence lifecycle and FDA acceptability of what `POST /api/submission-ops/packages/:id/assemble` → `executeGovernedTransmit` files: `server/services/ectd/{package-sequence-lifecycle,leaf-pdf,package-leaf-bytes}.ts`, the assemble route's lifecycle block, governed-transmit's filed-sequence record. Not the IND demo lane's files; `…015weqdG` has also worked this spine unclaimed, so each file's last-24h history is checked before an edit | `…session_01LjrcEe8y3zUQxwX91zzTaM` | **claimed** 2026-09-24 — row **D7** (W5). Lifecycle work filed: `docs/evidence/W5/2026-09-24-package-spine-lifecycle/`. Next: an adversarial pass over what this spine hands FDA, fixes failing-first, evidence under the same row |
| **D6 — tenant offboarding: the purge.** The "→ tenant offboarding, unclaimed (D6)" findings in `server/services/tenant/tenant-offboarding.ts` and the receipt write in `tenant-full-export.service.ts` / `routes/tenant-export.ts`: the purge's transaction on a Pool; a truncated export authorizing a full purge; no legal hold consulted; stored object bytes left behind. Proof on a deploy-shaped PostgreSQL 16. Not the data return's missing bytes (a design question, reported). Evidence `docs/evidence/D6/2026-09-24-purge/` | `…session_01AiwZKGaEFjD9AfVvkYExci` | **released** 2026-09-24 — done, each shown failing first (3/11 → 11/11): one transaction on one client (a part-way failure had already destroyed the vault records), legal holds refuse, only a complete export authorizes, the bytes are erased after commit. Open: the data return's bytes (founder), legacy-path and rendered-leaf bytes |
| **D4 / D2 — retrieval returns rows.** The "→ Retrieval, unclaimed" findings: `search_atoms_hybrid` fails on every from-blank install (json vs jsonb), so every Authoring AI draft is ungrounded; `enhancedEmbeddingService.searchHybrid`'s argument order. The creating migrations are amended in place (Rule 1); the callers are read, not rewritten. Proof on a deploy-shaped PostgreSQL 16 + pgvector. Evidence `docs/evidence/D4/2026-09-24-atom-search/` | `…session_01AiwZKGaEFjD9AfVvkYExci` | **released** 2026-09-24 — done: both findings, plus a third found behind them (project crowd-out), each shown failing first |
| **W2 / D1 — vault bytes outlive a task.** The "→ W2 (D1)" findings below: the storage provider (`S3StorageProvider.get` past 1000 keys; an unrecognised `STORAGE_PROVIDER` falling back to local), the byte reader's recorded-provider handling, the preflight requiring durable storage, and the vault bucket + task env in `terraform/stack` (new `vault_storage.tf`; the `ecs` env block only). Not the OIDC role or pipeline outputs (`…013CtPf8`). Earlier today, unclaimed and now recorded here: B8 staging stack, RDS CA bundle, document-fidelity F-34..F-40 | `…session_01AiwZKGaEFjD9AfVvkYExci` | **released** 2026-09-24 — row **D1**. Done, each shown failing first (`docs/evidence/W2/2026-09-24-vault-storage/`): S3 could not load in the ESM bundle; lookup stopped at 1000 keys and read errors as missing; an unknown provider fell back to local; production booted with no durable store; the stack had no bucket and the preflight required none. `/readyz` reports the store; readers open the store each row recorded (`getStorageProviderFor`), to …01KnUGoX's spec. Open, not done: the backfill script in the image |
| **W2 / D1 — a blank database installs again.** `scripts/db/install-fresh.mjs`, and `019_gcc_idempotency_ratelimit.sql` (amended in place): the installer's closing coverage gate flagged the child tables that `20260813_child_table_parent_scoped_rls.sql` scopes, and only `deploy-migrate` applied that file. Every install from blank has exited 1 since `2ddbfb6a6`: 80 tables, and 83 after `d46d52515`. CI Blank DB, Integration Tests and Boot Smoke provision that way | `…session_01AiwZKGaEFjD9AfVvkYExci` | **released** 2026-09-24 — row **D1**. Done: the installer applies the uuid half of the final sweep pair, then the child scope, each from its own file. The dead `audit.request_correlations` is no longer created. Red exit 1 at both trunk heads, green exit 0, and the final policies in every schema are identical to trunk's path (`docs/evidence/W2/2026-09-24-install-child-scope/`). Four findings handed on below |
| **W2 / D1 — the deploy halves of security-plan P0-9 and P0-13.** `terraform/stack/main.tf` `boot_environment` (`AUDIT_TRAIL_ENABLED` and `AUDIT_REQUIRE_ENFORCE`, both `true`), the `deploy-aws.yml` preflight step (requires both, and refuses any `*_ACCEPT_*` override), `tests/boot_contract.tftest.hcl`, and `scripts/ops/terraform-preflight-proof.mjs` if its proof needs a case. Not the rest of the preflight (TRIVY-01 and SMTP rows are other lanes') | `…session_01AiwZKGaEFjD9AfVvkYExci` | **released** 2026-09-25 — row **D1**. Done: Terraform sets both flags, the preflight requires them and refuses every `*_ACCEPT_*`, and the CI boot smoke boots that posture. Proof red, then green; four preflight mutants refused; the bundle boots ready in that posture (`docs/evidence/W2/2026-09-25-audit-posture-deploy/`) |
| **W2 / D1 — security-plan P0-15.** `terraform/stack/main.tf` (`s3_bucket_arns`), `terraform/modules/cloudfront` (a response-headers policy on the SPA behavior), `modules/ecs-fargate/outputs.tf`, `tests/boot_contract.tftest.hcl` | `…session_01AiwZKGaEFjD9AfVvkYExci` | **released** 2026-09-25 — row **D1**. Done in code: the task role cannot reach the frontend bucket, and the SPA gets HSTS, nosniff, DENY and a framing CSP. Red twice, then green 22/22 (`docs/evidence/W2/2026-09-25-p0-15-task-role-and-site-headers/`). The `curl -I` check waits on `terraform apply` |
| **W2 / D1 — security-plan P0-16, the `if: always()` half (INF-08).** The four Trivy steps in `ci.yml` / `deploy-aws.yml` and a contract test | `…session_01AiwZKGaEFjD9AfVvkYExci` | **released** 2026-09-25 — row **D1**. Done: `if: ${{ !cancelled() }}`; contract test red 2/2, then green (`docs/evidence/W2/2026-09-25-trivy-after-failures/`) |
| **D5 — AnA's task writes commit their ledger row with the change.** The WO-16C hand-on ("Found by the WO-16C audit-outcome lane" item 1): `server/services/ana-ri/command-executor.ts` `mirrorProjectTaskToUnified` and `updateTask`'s mirror block only, so the `unified_tasks` write and its `task.create` / `task.transition` row commit or roll back together. Not the rest of that file | `…session_01AiwZKGaEFjD9AfVvkYExci` | **released** 2026-09-24 — row **D5**. Done: `boardWriteWithLineage`; red 2/4 without it, green 4/4 (`docs/evidence/D5/2026-09-24-ana-task-ledger/`) |
| **D5 — AnA's QMS change-control and governed-fact tools report their audit row.** WO-16C hand-on item 2: `AnaToolExecutor.ts` `qms_change_create` / `_transition` / `_link` (`void auditService.logAction`), and the two discarded writes in `server/services/living-record/fact-change-orchestrator.ts` that `establish_governed_fact` / `apply_fact_change` and `routes/change-propagation.ts` answer. Those tool handlers only, not the rest of `AnaToolExecutor.ts` | `…session_01AiwZKGaEFjD9AfVvkYExci` | **released** 2026-09-25 — row **D5**. Done: red 4/14 and 6/6 without, green after (`docs/evidence/D5/2026-09-25-ana-governed-tool-audit-outcome/`). `check_consistency` done the same day: headers on the route, `auditTrail` on the tool |
| **W1 / D2 — AnA's progress and output record, one in every host.** `client/src/concept2cure/v2/{AnaWorkPanel,AnaWorkSections,anaWorkModel,AnaActivity,AnaOutputs,workDock}.tsx?`, `components/ana/{anaProgress,useAnaChat*}`, `server/services/ana/{turn-plan,turn-context-used}.ts`; also `hooks/useChatUpload.ts` (`composeTurn`), `server/services/ana/tool-trace.ts` (`refusalOf`). Evidence: `docs/evidence/W1/2026-09-24-ana-progress/` (live run in `live/`) | `…session_01T2wooCZu46W7msw4TJuuzr` | **claimed** 2026-09-24 — pushed: the record in all five hosts, the plan persisted with the turn, five in-catalog AI waits; third pass: uploads by id from every composer, auditor fixes, a refused tool no longer reported as success, all verified on the running app. PDF bytes still gated by `ANA_ENABLE_PDF_INTAKE` (founder's call) |
| **D5 — every AnA turn is an immutable, chained, exportable record.** `migrations/20260926_ana_turn_records.sql`, `server/services/ana/turn-record{,-verify,-loop}.ts`, `server/routes/ana-ri/{stream,post-processing,turn-records}.ts`, the other loop doors (`chat/send-message.ts` loop call and response only — not the D4 lane's `searchHybrid` call; `ana-intelligence.ts` `/agent`; `ana-realtime.ts`), `chat-thread-helpers.ts` `deleteConversation` + both thread-delete routes, `lineage-dossier{,-xml}.ts`, client record line in `AnaActivity` / `useAnaChat`. Evidence: `docs/evidence/D5-ANA-RECORD/2026-09-26/` (live run, offline verifier, mutations) | `…session_01T2wooCZu46W7msw4TJuuzr` | **released** 2026-09-29 — slice 1 done (turn records on all four doors, read/verify/export, audited owner-only deletes); slice 2 done: comments, quoted passages and AI-suggestion decisions on the authoring trail, append-only and chained per row, with verdicts and an audited offline-verifiable export (`GET /api/authoring/docs/:id/audit/export`), the editor rail's integrity note and download, and AnA never recording a reason nobody gave (`REASON_REQUIRED_TOOLS`); evidence `docs/evidence/D5-ANA-RECORD/2026-09-26-authoring/`. Hand-ons: P0-8 — add `ana_turn_records`, `ana_record_blobs`, `authoring_audit_trail` to `APPEND_ONLY_TABLES`; founder — retention/erasure of turn records and the parallel `concept2cure_thread_comments` store **Claimed again 2026-10-01** (founder: "you are the chief product officer… responsible for everything"), rows **D5/D6**: (1) a turn record's body is Customer Data (MSA §10.2, DPA §3.5): returned in the tenant export, then erased at purge through a door only a NOLOGIN role passes, while its chained `audit_logs` row stays under the ten-year audit retention (closes hand-on 4 below, `ci:purge-coverage`); (2) P0-8 grant half: the runtime role holds no UPDATE/DELETE/TRUNCATE on the append-only record tables, and `auditRuntimeRoleGrants` fails on one; (3) task events stop recording a reason nobody gave. Files: `migrations/20260926_ana_turn_records.sql` (amended in place), `scripts/db/provision-app-role.mjs`, `scripts/db/security-definer-allowlist.json`, `server/services/tenant/tenant-offboarding.ts`, `server/services/tasking/task-audit.ts`, the task-event hunks of `command-executor.ts`, tests. Evidence: `docs/evidence/D5-ANA-RECORD/2026-10-01-erasure-and-grants/`. **Done 2026-10-01:** (3) `4656ab885`; (1) and (2) in the commit that files that evidence. Then the last two composed reasons: realtime-collab lock events and `erasePersonalData` record the person's reason or none (one helper, `statedReasonOrNull`). Open: P0-8's anchored chain head. **Claimed 2026-10-01, slice 3:** review-thread comments (the Review launch surface) — a posted comment's words can be overwritten through `PATCH /api/concept2cure/review-comments/:id` and soft-deleted with no record, and no act there is chained. Files: `server/routes/c2c/reviews.ts` (the comment handlers), a new migration before the final pair, `audit-immutability-triggers.ts`, tests. Evidence: `docs/evidence/D5-ANA-RECORD/2026-10-01-review-comments/`. **Done 2026-10-01** (slice 3): the words fixed by trigger (a cascade from the thread, artifact or project admitted); every comment and retraction chained in its own transaction, AnA's marked `origin: 'ana'`; PATCH 409; the erasure keeps review comments; PF-08 counts a commented artifact as holding records (one condition in `project-retention.ts`, inside that lane's window, no hunk overlap). Next here: AnA-written comments shown as AnA's in the thread. **Found, for their lanes:** (a) the tenant purge fails for any tenant with a signed artifact (`20260929_concept2cure_signatures_append_only.sql` refuses the cascade from `projects`); (b) `tests/routes/device-projects-governed-writes.test.ts` 2 red at HEAD (`7aaa97fd0`'s `.limit`, the test's tx mock has none); (c) org role `member` cannot comment on a review thread (`getThreadPermissions`), a product question |
| **D3 — atom search takes its tenant from the session, or does not run.** `enhancedEmbeddingService.searchHybrid`'s no-org branch ranks every tenant's `lumen_data_atoms` wherever RLS is not enforcing, and since the D4 fix (`881680d73`) it returns rows: Authoring's AI draft (`authoring.router.ts`) and deep research (`deep-research.ts`) call it with no key at all, `evidence-ask.ts` with an optional one. Also the nine client `x-org-uuid` fallbacks the D3 RAG row left to "their lanes", none of which is claimed: `ana-features.ts` ×5, `c2c/ai-editing.ts` ×2, `chat/send-message.ts` ×2. One scope-derived resolver in a new `server/db/currentTenant.ts`; cortex's local `sessionOrgUuid`, the derivation inside `advancedRAGPipeline.assertCallerTenantIsSession` (those lines only) and the unused `utils/tenantContext.getSecureOrgUuid` move onto it. Two-tenant dbtest, RLS on and off. Evidence: `docs/evidence/D3/2026-09-24-atom-search-tenant-key/` | `…session_01W5zW66wy5szuFwRQYUKmkE` | **released** 2026-09-24 — row **D3**, done; evidence as named (the old service served tenant B's atom to tenant A with RLS off; the fix holds with it off, 18/18). Recorded there, not edited — each an open finding for whoever takes it: six callers pass their similarity threshold as `semanticWeight`, so nothing filters by it; `ai-editing.ts` and deep research still show a failed retrieval as "no sources"; `middleware/tenantAuth.ts` admits by `x-tenant-id` header when there is no JWT user |
| **D4 — the approved-model gate's free-text classifier sees only the field names it already knows.** The "For the model-governance lane" hand-on below: `FREE_TEXT_FIELD` is a fixed name list and the "every tool with a free-text input is classified" test draws its population from the same list, so a tool storing model-written prose under any other name (`summary`, `purpose`, `rationale`…) is never gated and never flagged. The population is re-derived from the schema, not the name list; every tool it surfaces is classified from its handler. `server/services/ana/governed-write-tools.ts`, `server/services/ana/__tests__/governed-write-gate.test.ts` only. Evidence: `docs/evidence/MODEL-GOVERNANCE/2026-09-24-free-text-classifier/` | `…session_01P7hJNw5CGQ3YC1p2QXuzzB` | **claimed** 2026-09-24 — row **D4** |
| **D3 — the child scope runs after every table and parent policy the set creates.** Handed-on items 1 and 4 below ("Handed on by the install child-scope change"): `20260813_child_table_parent_scoped_rls.sql` runs mid-set, before the uuid half of the final pair policies `regulatory_harmonization.export_jobs`, and before every file a new migration is inserted as, so a child is unscoped until the second deploy. It moves into the isolation tail. Files: the entry's position and comment in `scripts/db/migration-set.mjs`, the tail check in `scripts/ci/check-migration-set-order.mjs`, the pair expectation in `tests/schema-contract/{uuid-tenant-isolation,c48-stage1-identity-org-bridge}.contract.test.ts`, a coverage check after the first deploy in `ci.yml`'s Blank DB job, and this lane's L201–L203 evidence and ledger text (the atom-search attribution). Evidence: `docs/evidence/D3/2026-09-24-child-scope-first-deploy/` | `…session_01GyGhjgjrNvxgwH4JhTMRZX` | **claimed** 2026-09-24 — row **D3**. **Taken over 2026-09-29 by `…01YZFCXR`** at the founder's direction: no commit to any of this row's files since the claim; see that session's row below |
| **D8 — the connector admits accounts that are out of use, and its tokens open the whole API.** Review finding #6 and the D6 audit's P0-2 / IAM-02 parts (a) and (c): `verifyPlatformBearer` (the connector's one verifier, also the consent POST's) reads neither the revocation list nor `users.status`, and the code and refresh exchanges re-check membership only, so a suspended or deprovisioned account's refresh token mints access for 30 days; a connector-issued token is `type:'access'`, so `/api/*` and the sockets accept it as a full session whatever scope was consented. The canonical checks (`isTokenRevoked`, `isAccountActiveBeforeTenant`) are reused, not copied. `server/mcp/auth/{platform-token,provider,consent}.ts`, `server/middleware/tokenType.ts` (the token-class rule), `server/mcp/__tests__/*`, a new `server/mcp/__tests__/mcp-account-standing.dbtest.ts`. Not P0-2 (d), dynamic client registration (a founder decision, reported); (b) `requireScope` is reported, not edited. Evidence: `docs/evidence/D8/2026-09-24-account-standing/` | `…session_01JNRgCKWRqqJxZ1cJCyxoor` | **released** 2026-09-30 — row **D8**, done in `3bdb50458` (work of 09-25; its first push lost three ref races, so it was rebased over ~860 commits and re-proven from a fresh database). Each part shown failing first on the trunk it landed on (11/14 real-PostgreSQL, 7/30 unit), 7/7 revert-proofs red; evidence `docs/evidence/D8/2026-09-24-account-standing/`. Kept, not replaced: `53b5545db`'s membership predicate (now single-sourced from `ACCOUNT_STATUS_ACTIVE`, a backstop behind the canonical check) and P1-38's connector sessions (now read through `verifyLiveToken`). **Open for the next D8 session:** `mcp-connector.dbtest.ts`'s two-tenant proof runs as a superuser. **Handed on, not edited:** for `…01KnUGoX`, `audit-requestdb-coverage --strict-no-regression` is red on trunk on `server/routes/c2c/artifact-project-scope.ts` (`a1d99e1b8`); for `…01YZFCXR`, `ci:tenant-entry-points` is red on `server/routes/mdx-admin.ts` changed since its justification (`c0056614d`). Founder: whether a password change revokes connector grants (it ends their access tokens, not their refresh tokens) |
| **D4 — the retrieval floor is applied, or not claimed.** Six callers of `enhancedEmbeddingService.searchHybrid` (`evidence-ask.ts`, `chat/send-message.ts`, `c2c/ai-editing.ts` ×2, `deep-research.ts`, `authoring.router.ts`'s AI draft) pass their similarity threshold (0.6–0.7) as the `semanticWeight` argument, so no floor is applied, weak atoms are cited as `[SRC-n]`, and `ai_retrieval_runs.threshold` records a floor that never ran. Founder's call 2026-09-26: precision first — enforce the configured floors on semantic similarity. `searchHybrid` takes named options so the slot cannot be misfilled. Evidence: `docs/evidence/D4/2026-09-26-retrieval-floor/` | `…session_01W5zW66wy5szuFwRQYUKmkE` | **released** 2026-09-26 — done; evidence as named. The floors (0.6–0.7) are enforced but not calibrated on a real corpus: tune `EVIDENCE_ASK_THRESHOLD` / `ANA_RETRIEVAL_THRESHOLD` and the 0.65 constants against one |
| **D5 / D6 — P0-12 follow-ups: declining, the approve class, a red route test.** Claimed for the whole of part 2; the D6 lane's server half (`94036a27`) and client half (`c16fd78e`) landed while this lane built the same, so its duplicates were discarded — one implementation per capability — and only what the landed half lacked is kept: a decline that releases a held run (route and dialog), the approve class kept at the reason tier, the tenant-pinned route test the server half left red, and the approval frame built by the shared builder. Evidence: `docs/evidence/D6/2026-09-24-p0/P0-12/README.md` ("Follow-ups to part 2") | `…session_01471vSKg1KXj3ijXDiyvXGX` | **released** 2026-09-26 — done; open and handed on there: the five direct-mutator tools, prompts on the non-SSE chat paths |
| **D5 / D6 — P0-12, AnA's direct-mutator tools get the confirm tier.** `save_document_to_vault`, `update_vault_document`, `file_chat_upload_to_vault`, `seed_tmf`, `save_report_definition` write through their own handlers, not the command surface, so the every-write partition does not reach them: AnA runs them unasked. Classify them in `governed-tool-gate.ts` at the confirm tier so the SSE loop holds for a person's yes, and make the governed-action route able to run them. Files: `server/services/ana/governed-tool-gate.ts`, `server/routes/ana-ri/utility.ts`, the tool-dispatch seam in `AnaToolExecutor.ts` (read). Evidence: `docs/evidence/D6/2026-09-24-p0/P0-12/README.md` | `…session_01471vSKg1KXj3ijXDiyvXGX` | **released** 2026-09-26 — done (`CONFIRM_TIER_TOOLS`, registry gate, route runs a confirmed tool from the held run); open and handed on: sign-off prompts on the non-SSE chat paths |
| **D5 / D6 — P1-34 (DP-36): every directly registered AnA write tool is classified.** A tool-name-keyed registry beside `COMMAND_AUTHORIZATION` (grown from `CONFIRM_TIER_TOOLS`), with an anti-drift test red on an unclassified new write tool; a state-changing tool call becomes a proposal at the dispatch point, and the approve / retire / sign classes are refused (DP-31, DP-32 close with it). Files: `server/services/ana/governed-tool-gate.ts`, the `registerToolHandler` wrapper in `AnaToolExecutor.ts`, tests. Evidence: `docs/evidence/D6/2026-09-26-p1-34/` | `…session_01471vSKg1KXj3ijXDiyvXGX` | **released** 2026-09-26 — landed: all 763 tools in `server/services/ana/tool-authorization.register.json` (552 read, 14 self, 159 confirm, 16 refuse, 21 by rule, 1 command), enforced in the registry wrapper, the stream gate and the governed-action route; an unknown tool is proposed. The scan missed 43 writes; every presumed read was traced. `retire_qms_document` is confirm, not refuse (reason + a person's yes; the signed retire is DP-32's product decision). Security hand-ons in the evidence README (arbitrary file paths, unchecked foreign ids, platform-wide integrations). DP-36, DP-31 closed; DP-32 partial |
| **D6 — INJ-PATH-002 (P0, audit 2026-07): no AnA tool reads or writes a server path the model chose outside its own tenant's workspace.** `server/services/ana/document-workspace.ts` (built on `server/utils/document-file-roots.ts`, one confinement decision), every AnA tool that takes a path (`build_from_template`, `generate_document`, `fetch_template_and_fill`, `start_legacy_import`, `validate_docx`, `verify_docx_against_source`, `insert_document_content`, `insert_clause_template`, `surgical_docx_xml_edit`, `package_ectd_for_region`, `convert_docx_to_pdf`, and any the sweep finds) and the services they call (`server/services/docx/masterDocumentBuilder.ts`, `server/services/submission-gateways/regional-packager.ts`, `server/services/legacy-importer/*`), `scripts/ci/check-path-containment.mjs` extended to tool input. Evidence: `docs/evidence/D6/2026-09-26-inj-path-002/` | `…session_01471vSKg1KXj3ijXDiyvXGX` | **released** 2026-09-29 — landed: one tenant-scoped workspace guard (real path, per-tenant scratch via `anaScratchDir`) on every path-taking AnA tool, a ratchet over every handler, and the siblings the sweep found (template path settable by PUT, `/api/mdx/imports`, docx-worker image paths, container symlink collection, Vault writer names, OCR codes, packager names). `run_python_script` runs only in the hardened container — it ran model code on the application host — so it is unavailable where `ANA_ENABLE_CONTAINER_EXEC` is not `true`. INJ-PATH-002 closed |
| **D6 — a record id AnA's model supplies is proven to be the caller's organization's before a tool reads it or anchors a record to it** (P1-34 hand-on 2: `assess_site_risk`, `establish_governed_fact`, `set_protocol_budget_params`, the RBM actuator tools, and every handler that takes a `program_id` / document / site / study id and checks only its shape). `server/services/ana/AnaToolExecutor.ts` handlers and the services they call, through the canonical `programInOrganization` (`server/services/c2c/program-access.ts`) — no new copy. Evidence: `docs/evidence/D6/2026-09-30-tool-foreign-ids/` | `…session_01471vSKg1KXj3ijXDiyvXGX` | **released** 2026-09-30 — landed: `server/services/ana/tool-record-scope.ts` in the registry wrapper; every call naming a program (`program_id` / `programId` / `device_program_id`) must name the caller's (`programBelongsToOrg`), and seven per-tool record ids are proven the organization's before the handler runs; fails closed. Red: a read tool ran for another tenant's program. Hand-on: `programBelongsToOrg`'s `SET LOCAL app.bypass_rls`. |
| **W2 / D1 — the Trivy config scan is red on `abc1c99a5` (mine), and the Trivy hand-ons from P0-16a.** `terraform/modules/cloudfront/main.tf` (the WAF exception is back on the distribution it names); a check that every inline `#trivy:ignore:<ID>` sits on the line directly above the block it excepts, run in the Security Scan job with a selftest; `scripts/ci/check-trivyignore-hygiene.mjs` wired into that job (D6 wrote it, left unwired); the path-scoped `DS002` exception in the config scans of `ci.yml` / `deploy-aws.yml` and its line removed from `.trivyignore`. Not `package.json` or `.husky/pre-push` (another lane's window) | `…session_01AiwZKGaEFjD9AfVvkYExci` | **released** 2026-09-26 — row **D1**. Done, proven with Trivy v0.69.3 built from source (red at `abc1c99a5` as in CI, green on the whole repository; a new root image fails, where trunk's tree-wide DS002 passed it). The placement check, D6's hygiene gate and their selftests run before the scans in both workflows (`docs/evidence/W2/2026-09-26-trivy-inline-ignores/`). **For the owner of `.husky/pre-push`:** add `node scripts/ci/check-trivy-inline-ignores.mjs` (under 1 s); no session can run Trivy before it pushes. Open: the WAF (founder); helm charts that do not render for Trivy (`postgresql`/`redis` missing from `charts/`) |
| **D5 — AnA is told it can approve a QMS change (hand-on to `…01AiwZKG` from the review follow-through lane).** After P1-28 / DP-31 only the signed `POST /api/mdx/qms/changes/:id/approve` approves, but `qms_change_transition`'s description still offers `approved` and promises segregation of duties, and its handler comment names `SegregationOfDutiesError`. `server/services/ana/qms-labeling-analytics-tool-defs.ts` (that tool only), the handler in `server/services/ana/AnaToolExecutor.ts`, `server/services/ana/__tests__/qms-change-tools.test.ts` | `…session_01AiwZKGaEFjD9AfVvkYExci` | **released** 2026-09-26 — row **D5**. Done: `approved` is out of the enum, and the description sends the user to the Approve button. A refusal carries `CHANGE_APPROVAL_REQUIRES_SIGNATURE` with no API path, and the stale comment is gone. Red 2/16, then 16/16 (`docs/evidence/D5/2026-09-26-qms-transition-tool-approval/`) |
| **W2 / D6 — security-plan P0-17, the engineering half (INF-22): a full-history secret scan in CI.** gitleaks over every commit, blocking, installed by `go install` at a pinned module version (checksum-verified by the Go module proxy; no third-party action); a new job in `.github/workflows/ci.yml`, `.gitleaksignore` for findings already in history (each with its reason; the `neondb_owner` credential stays listed as live until the founder rotates it), a contract test, evidence `docs/evidence/W2/2026-09-26-p0-17-history-secret-scan/`. Not the rotation (founder), not `scripts/ci/check-committed-secrets.mjs` (the working-tree gate) | `…session_01AiwZKGaEFjD9AfVvkYExci` | **released** 2026-09-26 — row **D1**. Done: blocking "Secret scan (full history)" in `ci.yml`, green over 8,369 commits and red on a removed ignore block and on new-commit probes; contract test 8/8 with four mutants caught (`docs/evidence/W2/2026-09-26-p0-17-history-secret-scan/`). **For the founder (P0-17):** revoke the `ep-wild-forest` and `ep-icy-brook` Neon owner passwords and the Hugging Face token in `3e1dcf8f0`, and confirm no environment's `JWT_SECRET` signed the demo token in `VaultMarketingPage.jsx`. The job warns on every run until `.gitleaksignore` stops listing them as live |
| **D4 / W3 — the validation package at head.** IQ-001 and all six OQ protocols executed on a from-blank install at one commit: the first execution since `bfdb0a08` (2026-09-23c), across the P0/P1 tranches. The second signer is created through user administration (`POST /api/tenant-users`, the activation link, the colleague's own password and authenticator), the local half of D4's "real second account". A failing step is fixed failing-first only where no lane holds the file; otherwise it is handed to that lane here. `tests/validation/**`, `docs/validation/**`, `docs/evidence/W3/2026-09-27/` | `…session_01TTTQ1hpdMr1yAMVYH4nYdE` | **released** 2026-09-28 — row **D4**. Final at `89ee3a81`: IQ 12/0/3, OQ 101 pass / 0 fail / 2 deviation of 103; TM-001 69 of 71 pass, 0 uncovered (`docs/evidence/W3/2026-09-27/`, VSR-001 §18). Fixed, each failing first: F-41 `f339a445`/`81eb7491` (a user-administration member's sign-in and credential events went to tenant 0, not its organisation) and F-42 `af305e8a` (the ledger named its actor by display name alone). OQ-004 v0.4, OQ-001 v0.9, URS-001 v0.6, URS-004 v0.2; the harness waits out the sign-in limiter. **Hand-ons below: → D6 (the sign-in limiter counts per client IP), → D6/D3 (user-administration members have no default organisation).** |
| **Founder-directed 2026-09-27, moves no D-row: AnA runs multiple agents, and Manual/Auto is a real run policy.** The founder, 2026-09-27: *"can AnA run multiple agents and if not, she must"*, and asked for Claude's Manual/Auto control. RULE 2 says a session that moves no D-row reports blocked; this is recorded as the founder's explicit exception, not a reading around the rule. Measured first (13-agent map, every gap claim adversarially checked, all upheld): in production AnA cannot run more than one agent. `start_deep_investigation` is the only child loop, launch scope strips it, and it is fire-and-forget. `convene_drafting_council` is sequential. `/api/agent-swarm` claims parallel LangGraph and is a sequential loop with no org scope and no callers. **Scope:** (1) a launch-scoped delegation tool that runs bounded child agent loops concurrently and joins their results into the parent's round. Children are propose-only, run on approved models, carry tenant scope and `parentRunId` explicitly, and cannot recurse. `/api/agent-swarm` is retired in the same change (zero duplication). (2) Manual/Auto becomes a server-side run policy on run-control's existing pause/wake. The Ask/Agent control is visible but inert today and gets wired to it. `stoppedReason` reaches the client, so a round-capped turn says it was cut short instead of reading as finished. The Home mode pill that is never sent gets wired. (3) `model_override` gains the approved-models check it lacks. **Not in scope:** the progress-panel deltas (fold earlier steps, Connectors and Web search rows), which are row 59's. The child turn-record chain is row 60's slice; this lane sets `parentRunId` on the gateway ledger and leaves the chain to that lane. Touches files in rows 59/60's scope (`stream.ts`, `useAnaChat.ts`, `AnaActivity.tsx`). All were cold (>24h) at claim; edits are additive and disclosed here. Evidence `docs/evidence/ANA-AGENTS/2026-09-27/`. **Slice S1 (`stoppedReason` reaches the client), 2026-09-28, full file list:** server `stream.ts`, `post-processing.ts`, `tool-trace.ts`, `run-status.ts`; client `useAnaChat.ts`, `useAnaChat.types.ts`, `anaProgress.ts`, `anaWorkModel.ts`, `AnaActivity.tsx`, `Shell.tsx`, `ConversationThread.tsx`, `app-v2.css`. Of these, `Shell.tsx`, `ConversationThread.tsx`, `useAnaChat.ts`, `useAnaChat.types.ts` and `app-v2.css` were inside another lane's 24h window at edit time (`a75e38452` and `01d91a130`, `…01KZK3jg`, Live Drive). The S1 hunks are additive and none touches or sits beside theirs (`git blame` at the insertion points). S1 evidence: `docs/evidence/ANA-AGENTS/2026-09-27/S1-stopped-reason/` (red 42/129 against HEAD, green 461/461 in 41 files, 23/23 mutations red). **S1 is blocked on its live capture** (a real turn driven to the round cap): this container has no model key. **Landed so far:** `97465528b` (S0: two calls of one tool in one step no longer swap results; paired by call id), `b4efbe63c` (a Stop that lands mid-call no longer counts as a provider failure, so one Stop cannot mark Anthropic unhealthy for every tenant). **Handed on:** `cancelled` on a reopened turn has no note (spec owner, two options in the S1 README); the next-turn note covers only the preceding turn; the client-history fallback cannot carry a stop (a wire-field decision). **S2 (honest controls), 2026-09-28:** Home's engine pill is bound to `prefs.anaMode` (the effort the shell chat sends); `resolveModelOverride` and `projectModelsForPicker` admit only a registry row that is its approved-models entry (id, provider, pinned version), `highRisk` is a required answer computed by `isHighRiskRequest` from the routing plan, and a refused named model writes a `MODEL_OVERRIDE_REFUSED` warning. Files: server `effort.ts`, `stream.ts`, `reasoning.ts` (comment); client `Surfaces.tsx`, `V2App.tsx` (the one Home render line), `useAnaChat.types.ts` (comment); tests `effort.test.ts`, new `homeEngine.test.tsx` and `stream-model-override.test.ts`. Inside another lane's 24h window at edit time: `stream.ts` (`0ed213fec`; its history-window hunk untouched), `V2App.tsx` (`0ed213fec`, `a75e38452`; one line, blamed `^d9670f901`), `useAnaChat.types.ts` (`a75e38452`, `…01KZK3jg`; a comment-only rewrite of `^20accce74` lines 50 lines from theirs, not purely additive). S2 evidence: `docs/evidence/ANA-AGENTS/2026-09-27/S2-honest-controls/` (red 22/60 against HEAD, green 1139/1139 client + 584/584 server, 34/34 mutations red, tsc 0). Built in the working tree, not committed when filed. **S2 handed on:** conversation-screen warnings are not rendered; placement and deterministic substitutions of a pin are silent; the tier/strategy default is not approval-gated; PQ is enforced nowhere; pill a11y (`Surfaces.tsx` and `Shell.tsx`). **S3 (primitives), 2026-09-28:** the loop, executor, run-control, gateway and wrapper primitives S4/S5 need, each off unless a caller opts in (`stopWhen`, `roundCap`, the checkpoint's frozen `pending` and `'replan'`, `resolveRoundBudget`; `executeAgenticLoop`'s `allowedToolNames`/`onToolEvent`/`onModelResponse`/`stopWhen`/`toolConcurrency`/`toolModelCalls` and its `loop` outcome; the stream's pause wait MOVED into one shared `createRunHold` (expiry 'resume' as before; 'end' built, unused); `holdForPerson`/`endHeldRun`; the model-call refusal scope and `gateway.route()` refusal; wrapper rule 0 at `agentDepth >= 1`), plus two honesty fixes: a failed artifact read no longer makes `check_dossier_consistency` answer "no issues", and `project_knowledge_search` has a model-free mode. No existing caller changes: the 179 neighbour suites give HEAD's per-file counts exactly, and no existing test file was edited. Files: server `agentic-loop.ts`, `AnaToolExecutor.ts`, `gateway.ts`, `stream.ts`, `run-control.ts`, `run-status.ts` (comment), `cross-artifact-consistency.ts`, `shared/ana/run-control-limits.ts`; new `run-hold.ts`, `model-call-scope.ts`, `agentic-tool-dispatch.ts`; nine new test files. Inside another lane's 24h window at edit time: `stream.ts` (`a75e38452`, `0ed213fec`, `…01KZK3jg`; the named MOVE plus cold additive insertions, none of their lines changed), `run-control.ts` (`a75e38452`; additive only), `gateway.ts` (`a75e38452`; three cold insertions), `AnaToolExecutor.ts` (`a75e38452`, `0ed213fec`, `…01KZK3jg`; `e2d36a2b1`, `41e7c539f`, `9d2134b52`, `…01KiDof7`; every hunk at lines blamed to older commits). S3 evidence: `docs/evidence/ANA-AGENTS/2026-09-27/S3-primitives/` (red 91/127 against HEAD, the moved loop's 'resume' cases green on HEAD's loop verbatim, green 3105/3105 + 2 skipped in 188 files, 67/67 mutations red incl. 12 overcorrections, tsc 0, lint ratchet net −1). Built in the working tree, not committed when filed. **S3 handed on:** S4 wiring of `'end'`/`holdForPerson`/`'replan'`/`stopWhen`; S5 audits the sub-agent allowlist for scope-capturing singletons and gateway-bypass egress; the executor's lost-input guard (an S1 item, a declared behaviour change); `check_dossier_consistency` still says "clean" when nothing was compared (early returns); the stream-route harness extraction. **Next:** S4 (Manual/Auto) on the S3 primitives, after re-reading `run-control.ts` and `stream.ts` as `…01KZK3jg` left them | `…session_019ZvHmh63vQ2C66VAwZg2kc` | **claimed** 2026-09-27 |
| **D4 / W3 follow-up — trunk CI: Blank DB Provisioning is red, and the one step red in it is a parser false positive.** Red on every run read, 2026-09-27 and 28 (`00870fe4`, `d224ecff`, `7ddc0638`), each at the same step: the live-schema ratchet (`ci:tables-live-schema`). It reads the CTE `WITH expected(schema_name, table_name, trigger_name) AS (…)` in `server/services/audit/audit-immutability-triggers.ts` (`e8724680`, 2026-09-25) as a table named `expected` that no database has; reproduced locally, it is the only new absence. `cteNames` binds `WITH x AS (` and, since `5fd4b79b`, `AS MATERIALIZED (`, but not a CTE with a column list. While the job is red, any real absence it exists to catch lands unseen. Scope: `scripts/ci/check-migration-reachability.mjs` (`cteNames` only) and `tests/schema-contract/migration-reachability-guard.contract.test.ts` | `…session_01TTTQ1hpdMr1yAMVYH4nYdE` | **claimed** 2026-09-28 — row D4: trunk CI red that this lane met on its own push, fixed at its cause as VSR-001 §16.7 records. Evidence: `docs/evidence/TRUNK-TESTS/2026-09-28/blank-db-live-schema/` |
| **D4 — periodic review: the editor family, line by line.** The weekly reviews of 2026-09-24 and 2026-09-28 both record that `DocumentWorkbench.tsx` (5,134 lines), `RichSectionEditor.tsx` (2,716) and the `ProtocolDev*` family (15 files, about 4,250) were not read line by line. They are the surface every regulated draft passes through. Six lenses, read-only: Part 11 UX, honest state, security and accessibility, one agent each per file group; design system and microcopy across all three. Each blocker, high or medium finding goes to a separate agent told to refute it. Reports are filed beside the canonical review in `docs/evidence/reviews/2026-09-28/editor-family/`, with a pointer from its README. Confirmed findings are fixed failing-first where no lane holds the file. `DocumentWorkbench.tsx` was changed by the W1/D2 AnA-drive lane in `a75e3845` (2026-09-28 01:16), so its findings go to that lane until 24 hours have passed | `…session_01TTTQ1hpdMr1yAMVYH4nYdE` | **claimed** 2026-09-28 — row D4 (periodic review is a validation activity). **Read and verified:** 14 lens reports; every blocker, high and medium went to a refuting verifier, and three were refuted (M-1, HS-A-4, A-C-1). **Fixed and pushed, each failing first** (evidence under `docs/evidence/reviews/2026-09-28/editor-family/fixes/`; status of every finding in that folder's README):
| **D8 — the connector's tenant isolation, proven as the production runtime role.** `server/mcp/__tests__/mcp-connector.dbtest.ts` (the W7 suite behind the launch row's "tenant scoping under RLS") connects as the database owner, a superuser whom RLS never binds. It is moved onto a freshly provisioned NOSUPERUSER NOBYPASSRLS role with `RLS_ENFORCE=on`, as `mcp-account-standing.dbtest.ts` already runs; its ten cases are kept, and any tool that then fails is a defect fixed failing-first in the file that owns it, with that file's last-24h history checked first. Not `server/mcp/tools/runtime.ts`'s tool-policy change (`b835cf159`, `…01SuVLo2`, last 24h) unless a defect is in it, then written up for that lane. Evidence: `docs/evidence/D8/2026-10-01-connector-tenant-proof/` | `…session_01JNRgCKWRqqJxZ1cJCyxoor` | **released** 2026-10-01 — row **D8**, done: the suite runs as a NOSUPERUSER NOBYPASSRLS role with its posture asserted first, 11/11; with `listPrograms`' tenant condition removed it stays green as that role (RLS contains it) and goes red as the superuser (the leak is real); evidence as named. Test-only, no product file changed. D8 now owes only staging, a second machine's client and the directory submission |
| **D7 / D5 — VR-14, server half: only an approved, current Vault version is transmitted.** The open item "Vault leaves are exempt from the approval ('finalized') transmit gate: an unapproved upload can be placed and transmitted" (→ `…01LjrcEe` / `…01TtwRHm`), specified as VR-14 in `docs/design/VAULT_VEEVA_PARITY_PLAN_2026-09-24.md`, now buildable on VR-13 (`ccd3c388b`). **Scope:** the `vault_documents` branch of `server/services/ectd/leaf-source-resolver.ts` reports a leaf unfinalized unless the version's VR-13 lifecycle record is at a steady stage, the version is current, and the approved record's content hash equals the bytes staged — through the existing count that transmit, freeze and dispatch already refuse on; no second gate. The rule lives beside VR-13's stages in `server/services/vault/vault-lifecycle.ts`. Fixtures that place Vault leaves gain an approved version. FD5 (grandfathering) is not taken: refused until decided. **Not in scope:** the placement dialog, 'Placed in', `project-vault.ts`, `Vault.tsx` (the Vault lane's half). The resolver is the D7 lanes' file, unedited by them since 2026-09-24; it was touched today by `04fe630af` (DP-35), and this hunk sits in the vault branch only. Evidence `docs/evidence/W5/2026-10-01-vault-leaf-finalized/`. | `…session_01471vSKg1KXj3ijXDiyvXGX` | **claimed** 2026-10-01 |
| **D3 — one program-ownership check (founder-directed 2026-10-01: "cure that issue … then continue").** Measured at `ae3b3d47e`: the question "is this program the caller's organization's?" is answered by about 35 hand-written copies after LX-20 made `programInOrganization` (`server/services/c2c/program-access.ts`) canonical on 2026-09-25 — six helper functions (three named `programBelongsToOrg`: `innovation-routes.ts` over three registries, two of them written by nothing; `rbm/site-risk-engine.ts`, which asks whether the caller has RBM records naming the program rather than whether it owns it; `pdev-routes.ts`), `ownsProgram` (`mdx-ivdr.ts`), the dossier-map helper, and inline SQL/Drizzle copies across 22 route and service files, most of which admit a deleted project. **Scope:** every yes/no copy migrates onto `programInOrganization` and the helpers are deleted; a check that cannot run throws the shared `VerificationUnavailableError` (503 where the route already distinguishes it); a legal hold opts in to deleted programs by name; a CI gate refuses a new copy, shown red on the tree before the migration. Reads that load a program's own fields stay where they are. Files touched by other lanes in the last 24h (AnaToolExecutor.ts, projects.ts, project-vault.ts, ivdr-routes.ts and others): each hunk replaces one ownership query and touches nothing beside it. Evidence `docs/evidence/D3/2026-10-01-one-program-check/`. | `…session_01471vSKg1KXj3ijXDiyvXGX` | **released** 2026-10-01 — done: 51 copies in 37 files → one; the gate red at `ae3b3d47e` (51), green after, in pre-push and `ci.yml` with its self-test; as the production runtime role the old RBM check reported another tenant's program as a healthy study with no sites and refused an owner its own (red 2/8 → green 8/8); 14 new unit cases red against the old source, green after; 436 related test files green; tsc 0. **Handed on** (README): `site_intel.sites.program_id` references `core.programs`, which nothing writes, so no real project can hold a Site Intelligence site and RBM site risk cannot be derived (RBQM lane); `identity.can_access_program` honours `app.bypass_rls` (session-scoped-bypass owner); `programs` / `core.programs` have no writer (a RULE 1 schema decision) |
| **Founder-directed 2026-10-01, moves no D-row: AnA's personality — warm, sometimes playful, deeply professional, deeply caring.** The founder, 2026-10-01: *"I want AnA to have a cute and sometimes playful personality as well as deeply professional and she must care about the end user humans and their needs deeply."* Recorded as the founder's explicit exception to RULE 2, as the 2026-09-27 agents lane was. **Scope:** the one persona source `server/services/ana-ri/personality-core.ts` (`ANA_PERSONALITY_CORE` and `ANA_PERSONALITY_BRIEF`), with playfulness kept out of artifacts, sign-offs and e-signatures, safety findings, bad news and a person under strain, all stated in the prompt and pinned by test; the chat register's tone floor (`response-register.ts`) and the register linter's exclamation and emoji rules (`server/eval/register/`), recalibrated so warmth is measured and governed output stays strict; the tests that pin the old "no exclamation, one dry line" floor. **Not in scope:** any new surface, tool or model; client copy (the design-system voice tests on product strings stay as they are). Evidence `docs/evidence/ANA-PERSONALITY/2026-10-01/`. | `…session_01471vSKg1KXj3ijXDiyvXGX` | **released** 2026-10-01 — done: the core gains care, warmth that may show, play with a light touch and "Serious where it counts" (the record, safety, bad news, strain, an engine's figure, her own mistake; fail-closed); the brief keeps its no-exclamation, no-emoji floor beside governed content; the register linter measures earned vs forbidden exclamation marks and emoji (serious room derived fail-closed), the artifact linter fails any, and run-eval reports the rate and repeated playful lines. Red first: 11 persona tests against the old voice, 7 linter tests against the old linter, 6/6 mutations; green 552 tests in 25 related files; tsc 0. **Owed:** no model has spoken in the new voice — no provider key in this container, and the role-play review hit the subagent limit; live transcripts through the gateway, scored and read by a person, then the founder's calibration |
| **D4 / D1 — CI's production-posture jobs run whatever Lint says.** `.github/workflows/ci.yml`: `integration-tests` (real-database suites, RLS on), `blank-db-provisioning`, `production-boot-smoke` (RLS on, non-superuser), `coverage`, `ana-readiness-tests` and `aios-audit-assets` each `needs: lint` with no `if:`, so any red guardrail skips them all; `test` already carries `if: ${{ !cancelled() }}` with the reason. The same line on the six job headers, nothing else in the file; `build` and the release-evidence gate stay strict. A contract test in `tests/ci/`. **Window note:** `ci.yml` is edited several times a day (latest `38a9417c6`, 07:03, a guardrail step inside `lint`), so its 24 h window does not close; no other lane edits these six headers, and the finding was written up for the trunk-CI keeper (`…01DiJJAk`) at 03:10 first. Evidence: `docs/evidence/D4/2026-10-01-ci-posture-jobs/` | `…session_01JNRgCKWRqqJxZ1cJCyxoor` | **released** 2026-10-01 — row **D4**, done: the six jobs carry `if: ${{ !cancelled() }}`; the contract fails on the unchanged workflow naming exactly those six, passes after, and fails again if `build` is made lenient; `tests/ci` 109/109. The full `test:db` as `app_service` on a database at the tree is 101/101, so the first un-skipped run should add proof, not red. Evidence as named |
- P11-C-1 (`10ad41a2`); HS-C-1 (`670865e9`);
- SEC-C-2/3/8 (`29d80fe9`); SEC-A-4 (`44a48357`);
- SEC-B-3, V-2, P11-B-4, SEC-A-6 (`b43ec3af`); SEC-A-3 (`49f5ad82`);
- SEC-A-5 (`de430222`); SEC-B-1/2 (`ce56754d`);
- SEC-A-1, P11-A-1/SEC-A-8, SEC-A-2 (`63b43274`); A-B-2/3 (`26e0b3a8`);
- SEC-C-4 (`e8f448d1`); HS-C-3 (`146a6382`); A-C-2 (`88ef5f87`); A-C-5 (`8691cfe8`); A-C-8 (`a0bdfbf0`);
- P11-C-4 (`8e72b9bf`, `d848acf3`); SEC-C-7 (`6b442012`); P11-C-2 (`fb69b716`).

`…01KiDof7`'s same-day coverage-gap sweep fixed SEC-A-9 (`59b0d8f9`), part of HS-B-1 (`59b0d8f9`), and the protocol tab strip half of A-C-2 (`780a0639`). Its lane has no row here, and it works in this lane's files, so any further work in the editor family should be claimed first. Handed on: items 5–7 of this lane's list below. **Second round, claimed 2026-09-28 18:00 (cold files only, none changed by another lane in 24 h):**
  - SEC-C-4 (a) server half: `server/services/ana-ri/surface-context-block.ts`; the SEC-C-4 class in `client/src/concept2cure/v2/editor/askAnaToDraft.ts`;
  - the SEC-C-7 follow-on: `C2CForm.tsx`, `ProtocolDevForms.tsx`;
  - the P11-B-4 undo floor: `client/src/concept2cure/v2/editor/suggestions.ts`;
  - the SEC-B-1/2 figure rule on the remaining writers: `server/export/authoring-images.ts`, `server/services/authoring/authoring-documents.ts`, `server/services/authoring/section-generation-service.ts`, `server/routes/batch-draft-routes.ts` (with the AI-authorship door there);
  - NEW-P11-B-1a: `server/services/ingestion/ingestion-service.ts`;

  **Corrected 2026-09-28 18:40:** as first pushed, this claim also listed
  - SEC-A-10/B-5 (`hocuspocus-server.ts`), and
  - P11-C-3-SNAP (`signature-persistence.ts`, `protocol-development-service.ts`).

  Other lanes changed those three files minutes before the claim (`dd91ded4`
  and `dc48d926` by `…01KiDof7`, `25cfc551` by `…01M8bGFS`), so they are not
  claimed here. SEC-A-10/B-5 is handed on as item 12. P11-C-3-SNAP waits for
  the holds to lapse.

  Work in held files is handed on, or waits for the hold to lapse. |
| **D7 / D5 — P11-28b: the Dispatch button is gated on a signature its own click creates.** From `docs/evidence/reviews/2026-09-28/ectd-lane-second-pass/part11-ux.md`. For IND / NDA / BLA / MAA the Submission Center's Dispatch button reads `gate`, which requires a release signature to already exist, and the signature it would accept is the one the click records — so no such sequence can be dispatched through the product's own screen, which D7's test sequence needs. Fix: the server states whether signing now clears the dispatch gate (the resolver's spine precedence lives there, and re-deriving it in the client is how P11-28a happened); the client reads that. `server/services/ectd/{assess-dispatch-readiness,release-signature-status}.ts` (the resolver's return and the assessment's verdicts only), `SubmissionSeqWorkspaces.tsx` (`DispatchWorkspace` only), their tests | `…session_01VB8JEGfy93uohAfBxSwmYx` | **released** 2026-09-28 — row **D7**. Done: server reports `dispatchGateOnSigning` (`composeStepVerdicts`, `signingNowResolvesRelease`), Dispatch reads it; 12 probes red-then-green (`docs/evidence/D7/2026-09-28-dispatch-reachable/`). Owed: a pglite sign→dispatch case for an IND |
| **D5 — a quality-gating verdict is never chosen by an empty collection.** `server/services/qms/quality-gating-verdict.ts` (new: `assessSection`, `batchVerdict`, the one assessment both routes run), `server/routes/{tenant-quality-validation,quality-management-api}.ts` (validate-section, batch-validate, the plan dashboard, `GET /plans/:id` only), `client/src/concept2cure/v2/surfaces/QmpWorkspace.tsx`, the two QMS entries in `scripts/ci/writerless-stores-baseline.json`, both quality API references. Closes the fail-open `7983d7299` handed to the QMS lane ("report 'not assessed'") and the three `= ANY(($1, …))` routes that always answered 500 | `…session_01P6GWSvLLKKNQMXXpyki7Yq` | **released** 2026-09-28 — row **D5**. Done `da00b021a`: red 28/28 against HEAD and 20/28 against the first version (adversarially reviewed), green 28/28; client red 3/5, green 18/18. Evidence: `docs/evidence/D5-GOVERNED-PATH/2026-09-22/` (README "CI, 2026-09-23") |
| **D5 — AnA's completion cascade commits its ledger rows with the completion.** `server/services/ana-ri/command-executor.ts` `updateTask`'s board block and `boardWriteWithLineage` only; `server/services/tasking/task-side-effects.ts` if a pool-client entry point is needed. The cascade AnA runs after `boardWriteWithLineage` COMMITs is on the pool with no ledger row for the dependents it unblocks; the HTTP routes already run it in the completion's transaction (`cascadeUnblockOnCompletionInTx`) | `…session_01P6GWSvLLKKNQMXXpyki7Yq` | **released** 2026-09-28 — row **D5**. Done: the cascade runs on the completion's transaction (`cascadeUnblockOnCompletionOnClient`), its rows after the completion's; red 2/2 on HEAD, green; the two older AnA task suites moved onto one pool fixture (`__tests__/pglite-pool.fixture.ts`). Evidence: `docs/evidence/D5/2026-09-28-ana-cascade-ledger/` |
| **D5 — every task put on the board at project creation, or raised from a statistical assessment, has its task.create row.** `server/services/tasking/blueprint-milestones.ts` (new: the one blueprint-milestone seeder), the milestone block of `POST /projects` in `server/routes/concept2cure.ts`, `createTasksForDesign` in `server/services/biostatistics-bridge/bridge-service.ts`, its entry in `scripts/ci/discarded-audit-write-baseline.json`. Both wrote board tasks outside any transaction: the seeder with no ledger row at all, the bridge best-effort with the outcome discarded | `…session_01P6GWSvLLKKNQMXXpyki7Yq` | **released** 2026-09-28 — row **D5**. Done: one transaction each, every task with its row, all or none, nothing when the creator cannot be named; red 5/5 (seeder, HEAD's code), 1/1 (route), 4/4 (bridge), green 20/20. Evidence: `docs/evidence/D5/2026-09-28-task-create-ledger/` |
| **D5 — approving or locking an artifact is an electronic signature.** The status route's review → approved and approved → locked (`server/routes/c2c/artifacts.ts`), `server/services/artifact-signed-act.ts` (new: the one transaction), `ARTIFACT_ACT_MEANING` in `server/services/artifact-approval-act.ts`, and the three suites that pinned the old contract. Taken over from `…01Wcyqbq` (handed on 2026-09-24, "Found by the vault re-baseline"; that lane's last commit was 2026-09-25 07:23) | `…session_01P6GWSvLLKKNQMXXpyki7Yq` | **released** 2026-09-28 — row **D5**. Done: the act's own meaning, re-authentication before any write, then status + version signed + ledger pair + signature (+ lock snapshot, provenance) on one transaction, only from the state the signer was shown; adversarially reviewed and its findings fixed; red 12/12 on HEAD, green 15/15. `concept2cure_signatures` append-only and `promote_artifact`: done 2026-09-29 (rows below). Evidence: `docs/evidence/D5/2026-09-28-artifact-approval-signature/`. The authoring-actions twins are handed on below (item 6) |
| **D5 — an artifact's signatures and lock snapshots are append-only in the database.** `migrations/20260929_concept2cure_signatures_append_only.sql` (new, in the applier set), its four triggers in `EXPECTED_AUDIT_IMMUTABILITY_TRIGGERS` (`server/services/audit/audit-immutability-triggers.ts`) and that registry's PGlite test, `docs/compliance/part11-immutability-record-class-policy.md`. Found by the review of the row above | `…session_01P6GWSvLLKKNQMXXpyki7Yq` | **released** 2026-09-29 — row **D5**. Done: UPDATE, DELETE, TRUNCATE and the cascade from artifact or version refused on both tables; no writer broken (census in the file); required at boot; red 10/11 with the migration emptied, green 11/11, applied twice on PostgreSQL 16. Evidence: `docs/evidence/D5/2026-09-29-artifact-signatures-append-only/` |
| **D5 — promoting an artifact is not an approval, and is not recorded as a signature.** `server/services/ai-actions/handlers/promote-artifact.ts`, its entry in `scripts/ci/discarded-audit-write-baseline.json`, and the two suites that pinned the old status (`promote-artifact-approved-version.pglite.test.ts`, `artifact-approval-follows-status.pglite.test.ts`). Found by the review of the approval-signature row | `…session_01P6GWSvLLKKNQMXXpyki7Yq` | **released** 2026-09-29 — row **D5**. Done: promotion leaves the artifact's status unchanged and creates the document as a draft; its audit entry is `data_modify` / `artifact_promoted` (was `signature_apply`), outcome read. Red 8 on HEAD, green. Not fixed, recorded: no client sends `confirmApproval`, so "Promote to document" is refused from every surface (a dead control). Evidence: `docs/evidence/D5/2026-09-29-promotion-is-not-approval/` |

| **D6 — sign-in limits are per account, and an office behind one address can sign in.** Hand-on "→ D6, unclaimed — the sign-in limiter counts per client IP, not per account" (validation package, 2026-09-27). Measured at HEAD before claiming: in production an office address gets **20** `/api/auth` requests per 15 min from the Redis `/api` limiter (every request counted; a sign-in is two), **10** from `auth.ts`'s login limiter and **10** from its MFA limiter (every request), and **5 failures** from the enterprise `/api/auth` limiter — so ~10 colleagues sign in per quarter hour and five mistyped passwords or expired-session 401s lock the address out. Plan: per-account throttling (the existing 5-failure lockout for passwords; a new per-account limit on wrong MFA codes, keyed by the verified challenge), per-IP counting failures only at a NAT-sized ceiling, no layer counting successful sign-ins; one `SIGN_IN_LIMITS` in `server/config/platform-limits.ts`. Files: `server/config/platform-limits.ts`, `server/routes/auth.ts` (limiter definitions only), `server/middleware/enterprise-security.ts` (the `auth` limiter's numbers), a new `server/middleware/sign-in-limits.ts`, tests. `redisRateLimiter.ts` is not edited (its `auth` numbers come from `platform-limits.ts`). Evidence: `docs/evidence/D6/2026-09-29-sign-in-limits/` | `…session_01PwLFr89hq8E7ZHUcAH96HK` | **released** 2026-09-29 — row **D6**, done (`c8fb0f36c`): per-account limits on failed passwords and wrong second-factor codes (`middleware/sign-in-limits.ts`), the address limited only on failures (enterprise `/api/auth` 5 → 50) and in volume (Redis `auth` 20 → 600 anonymous, 300 per credential, 3,000 credentialed per address); `SIGN_IN_LIMITS` in `platform-limits.ts`. Before 7/7 fail, after 7/7; mutation fails both per-account tests; live, one account ×15 from one address: before 200×10 then 429×5, after 200×15. Handed on: VSR-001 P-9's harness wait (validation lane) |
| **D5 — a tracked-change decision names a section of its own document (item 13, SEC-A-7 second half).** Both decision routes in `server/routes/authoring.router.ts` (`POST /documents/:id/tracked-change-decisions` and `/bulk` only) and `server/routes/__tests__/authoringTrackedChangeDecisions.test.ts`. A `sectionId` that is not a section of `:id` in the tenant is refused 400 `SECTION_NOT_IN_DOCUMENT` before the row and the audit event; `changeType` is recorded only as `insertion` or `deletion`. Not the AI-authorship half (the verifier is `…01TTTQ1h`'s round 2). Also the server half of same-name members in pickers (`/api/task-management/assignees` carries the address; `taskBoard.routes.ts`). Evidence `docs/evidence/D5/2026-09-29-decision-section/` | `…session_01PwLFr89hq8E7ZHUcAH96HK` | **claimed** 2026-09-29 02:00 |
| **D2 — agency correspondence records one issue per organisation, then fails.** Found while measuring "→ Projects, unclaimed — Two task stores" (below). `createCanonicalTasksForIssue` (`server/services/regulatory-correspondence/operating-layer.ts`) writes every correspondence work item with `source_id 0`, and `db/migrations/20260810_c2c_work_items_source_uniqueness.sql` made `(org_id, source_type, source_id)` UNIQUE without `source_ref`. So the second issue in an organisation, from the same letter or any later one, raises 23505, and `POST /api/regulatory-correspondence/correspondence/intake` (Projects → `program-journey` apiPrefix; AnA `correspondence.ingest`) answers 500 after partial writes. The creating migration is amended in place (Rule 1). The route's error body is included. The two-store question itself is **not** claimed. Evidence `docs/evidence/D2/2026-09-29-correspondence-work-items/` | `…session_01E2moDuSNSNTBqAHV5GtWoz` | **released** 2026-09-29 — row **D2**, done: key widened to `(org_id, source_type, source_id, source_ref) NULLS NOT DISTINCT` in place; the intake's 500 now goes through `serverError` (it had shipped Drizzle's failed query and params, the requester's e-mail among them); `ci:server-error-leaks` now follows a local alias of the error text (29 existing sites in 8 files became visible and are baselined). Red 3/5 → green 5/5, also from an empty provision; each half shown necessary alone. Handed on: the intake is not atomic, and correspondence work never reaches the Task Board (under "→ Projects") |
| **D5 / D6 — the AI ledger says what each call carried, and every agent act names its model call (W2 gateway scope; AnA local-safe-AI plan WS1–WS3, WS8 C3).** Landed, each red then green: tenant boundary (`docs/evidence/D6/2026-09-25-tenant-boundary/`), hosted tools gated (`2026-09-26-egress-tools/`), refusals final, model ledger and its adversarial review round (`2026-09-26-model-ledger/`, `7bfcd938`); governed-action sign-off and executed rows name run, tool call, model call and params hash (`docs/evidence/D5/2026-09-29-governed-execution-linkage/`, `ba995b20`); the council binds its tenant by value and its lumen tables carry `organization_id` under the sweep's named non-public list (`D6/2026-09-29-council-tenant/`, `af3c89c1`); served embeddings write a ledger row (`D6/2026-09-29-embedding-ledger/`, `12c57bd7`); web tools reach each model in the version it accepts (`D6/2026-09-29-web-tool-variants/`, `9505d5c6`). **Handed on:** the council's three lumen tables to tenant export/offboarding (row 58's lane); WS8 C1/C2 (registry `approvedSubstrates` / payload-provenance dimension and a refusal for every task) overlap row 82's `model_override` approval check; the live-API check of Haiku 4.5's web-tool variant is owed on staging with D1. | `…session_01SuVLo2` | **released** 2026-09-29 |
| **D4 — AnA's tools do not report work they did not do, or a regulatory fact nothing established (AnA local-safe-AI plan WS4, tools half; WS7 `check_consistency`).** Landed, each red then green and each adversarially reviewed: guidance tools (`fa596a0a`), citations and cross-references (`00b361e7`), page tools (`fe749b1a`), PMDA/NMPA (`00a54b60`), two review rounds (`901dbefa`, `577edd73`), `check_consistency` on the reconciliation engine (`e2c37f32`) and its review round (`48479333`). Evidence `docs/evidence/D4/2026-09-30-honest-tools/` (the before/after table is its README). **Handed on:** four more ICH lists that disagree (zero duplication); Deep Research renders an errored connector as "done, 0 hits" (`deep-research-board.routes.ts`, `DeepResearch.tsx`); the DOCX→PDF pipeline has no timeout; founder decisions 8 (`pdf_overlay`, PMDA/NMPA: keep or remove) and 11 (the FDA guidance index); WS4's sandbox and image-stack halves. | `…session_01SuVLo2` | **released** 2026-10-01 |
| **D6 — a connector search runs on the calling tenant's own credentials (AnA local-safe-AI plan WS5, connector half).** Measured at `7fca9601` before claiming: `connector-registry.ts` keeps one connector instance per connector for every tenant; `getAuthenticatedConnector` writes the calling organization's credentials onto it, and Google Drive, Box and OneDrive `refreshToken` return early while a cached token is valid — so organization B's search within the token's hour runs on organization A's token, and two tenants' concurrent calls share one instance's fields. Files: `server/services/connectors/connector-registry.ts` (an instance per call for credentialed connectors), a two-tenant test through `searchConnectors`. Not the platform mailbox (`search_regulatory_correspondence`; plan open decision 10, founder's). Evidence `docs/evidence/D6/2026-10-01-connector-isolation/` | `…session_01SuVLo2` | **released** 2026-10-01 — done: an instance per call; red 3 of 4 (B's search carried A's token), green; evidence as named. **Handed on:** the platform mailbox and `reg_mail_ingest`'s missing org column (plan open decision 10, the founder's) |
| **D8 / D6 — the connector honours the tenant's AnA tool policy (AnA local-safe-AI plan WS9, part).** Measured at `fd7ef727`: `callAnaHandler` (`server/mcp/tools/runtime.ts`) runs AnA's registered handlers directly, so a tool the tenant lists in `organizations.settings.anaToolPolicy.deny` — withheld from every chat door by `governedToolsetFor` — still runs over the connector (`lookup_ich_guideline`, `check_regulatory_currency`, `guidance_change_radar`, `lookup_submission_deficiencies`, `lookup_regulatory_precedents`, `run_submission_premortem`, `detect_evidence_contradictions`). Files: `server/mcp/tools/runtime.ts` (the deny-list, by the same loader and filter the chat doors use), a test. Not the `c2c:public` scope or per-org enable (the rest of WS9). Evidence `docs/evidence/W7/2026-10-01-connector-tool-policy/` | `…session_01SuVLo2` | **released** 2026-10-01 — done: the deny-list applies over the connector by the chat doors' loader and filter; red then green; evidence as named. **Handed on:** the `c2c:public` scope and per-org enable (rest of WS9) |
| **D1 — the production image can run AnA's document tools (AnA local-safe-AI plan WS4, image half).** Measured at `b835cf15`: `insert_document_content`, `surgical_docx_xml_edit`, `validate_docx` and the DOCX runtime spawn `python3 workers/artifact-compute/*.py`, which `Dockerfile.optimized`'s production stage never copies, and which import `docx` and `lxml`, which it never installs (CI installs them separately and says it pins them "so CI exercises the same runtime AnA uses in prod"). Files: `Dockerfile.optimized` (production stage: a virtualenv with the `requirements.txt` pins, an import probe, the runtimes copied), `server/services/compute/{scriptWorker,workerClient}.ts` (the interpreter from `ANA_DOCX_PYTHON`), a static gate `scripts/ci/check-image-document-runtime.mjs` with its test. Not the non-launch Python callers (`trialsage/`, `cer_tasks.py`, the trials importer). Evidence `docs/evidence/D1/2026-10-01-image-document-runtime/` | `…session_01SuVLo2` | **released** 2026-10-01 — done: virtualenv at the requirements.txt pins with an import probe, runtimes copied, `ANA_DOCX_PYTHON`; gate `ci:image-document-runtime` red then green, its self-test failing on each removed line; the install step built for real (full image not buildable here: apt mirrors refused). **Handed on:** the non-launch Python callers; isolating `docx-python-runtime.py` (plan WS16) |
| **D4 — AnA's answer grounding checks the regulations it cites (AnA local-safe-AI plan WS7, grounding kinds).** Measured at `2eda0ed0`: `verifyAnswerGrounding` (`server/services/ana/answer-grounding.ts`) checks trial, literature and FDA-submission identifiers in AnA's answer against the turn's tool evidence, but not a CFR section or an ICH guideline code — so "21 CFR 820.30(g)" or "ICH E9(R1)" cited from memory after tools ran reads as grounded as anything else. Files: `answer-grounding.ts`, a test. Not FDA guidance titles (no identifier format). Evidence `docs/evidence/D4/2026-10-01-regulatory-grounding/` | `…session_01SuVLo2` | **released** 2026-10-01 — done: CFR sections and ICH codes checked against the turn's evidence, red 4 of 5 then green; evidence as named |
| **D4 — AnA can audit a reference list against PubMed and Crossref (AnA local-safe-AI plan WS7, `verify_citations`).** Measured at `8ba000b5`: `verifyCitations` (`server/services/citation-verification-service.ts`: PMID → PubMed, DOI → Crossref, title search; retraction status; the tenant's public-source egress honoured) is reachable only through `POST /api/citations/verify`; AnA has no tool for it, so the citation audit of a draft's reference list is a model reading it. Files: one thin handler and its definition, the register, launch-scope and pedigree entries, a test. Evidence `docs/evidence/D4/2026-10-01-verify-citations/` | `…session_01SuVLo2` | **released** 2026-10-01 — done: `verify_citations`, red 3 of 3 then green; evidence as named. **Found, not this lane's:** `tests/services/document-consequence.test.ts` fails 4 of 4 on trunk (no tenant scope under `RLS_ENFORCE=on`) |
| **D1 — a DOCX→PDF conversion that hangs ends, and one that cannot start says so.** Handed on by this session's D4 review and taken by it; claimed when filed, which is recorded rather than hidden. `server/services/docx-pdf-pipeline.ts` (the one DOCX→PDF path, eight AnA tools) had no time limit and no `'error'` listener. Evidence `docs/evidence/D1/2026-10-01-docx-pdf-timeout/` | `…session_01SuVLo2` | **released** 2026-10-01 — done: its own process group, killed whole at two minutes; a spawn error rejects; red then green |
| **D1 — production as configured can take a Vault upload, has a first owner, mounts the connector and ships the FDA forms.** The four env-contract and image-contents blockers of the multi-task audit (`docs/evidence/W2/2026-09-24-multi-task/audit-findings.md`), each open at `2625137d`: `CLAMAV_HOST` is set nowhere, so every Vault upload is a 503 in production; `templates/forms/acroforms` is not in the image; `MCP_ENABLED` is never set; nothing names a platform owner. Taken over at the founder's direction (2026-10-01, CPO mandate) from `…01GSjEDJ` (claimed 2026-09-24, these items untouched since) and inside `…013CtPf8`'s Terraform, which is blocked on the founder's apply, not on code. Files: `terraform/modules/ecs-fargate/{main,variables,outputs}.tf` (a scanner beside the API), `terraform/stack/{main,variables}.tf` and `tests/boot_contract.tftest.hcl`, the environments' tfvars examples, the deploy preflight's scanner check in `deploy-aws.yml`, `Dockerfile.optimized` (one COPY), `server/utils/virusScan.ts` + `server/middleware/uploadSafety.ts` (a file too large to scan whole is refused as that, not as a virus or an outage), `server/routes/setup.ts` (first-run setup needs the deploy's own secret in production, and is serialised), `server/middleware/requireBusinessAdmin.ts` (its e-mail allowlist refuses a federated identity, as the platform guard's does), tests beside each. Not the connector's own code (D8's lanes). Evidence: `docs/evidence/D1/2026-10-01-production-blockers/` | `…session_01SuVLo2` | **claimed** 2026-10-01 — row **D1** |

If you are one of the sessions above, correct your own row. If a lane you want
is claimed, take the next unclaimed finding in §3 rather than duplicating it.

### Found by the vault re-baseline (`…01KnUGoX`) — confirmed, handed on, not edited

A re-verification of `VAULT_DATA_ROOM_ASSESSMENT_2026-09-05.md` against HEAD
after 394 commits (14 section verifiers, each overturned or upheld by an
adversarial skeptic; 2026-09-24). Every item below was upheld by its skeptic.
Items in this lane's own code are fixed in this lane, not listed here.

**→ `…01Wcyqbq` (launch-catalog follow-through, D2/D5/D6)**
- ~~`server/routes/c2c/artifacts.ts` status route writes Part 11 'approval'/'publish' signatures to `concept2cure_signatures` from the session alone (no re-verification); the printed signer name falls back to 'unknown'; the signature is not atomic with the status change and is skipped silently when no version row exists; the removal note and its pinning test say this router writes no signature substrate (false).~~ **Done 2026-09-28 by `…01P6GWSv`** (the claim was stale): re-authentication, the act's own meaning, one transaction, the note corrected; evidence `docs/evidence/D5/2026-09-28-artifact-approval-signature/`. Still open: the seal-verified route persists a client-supplied `signerRole`.
- AnA `approve_qms_document` makes a QMS controlled document effective with no password/MFA, no signing-authority and no self-approval check; the QMS router accepts `status: 'effective'` directly on create and patch; three paths bypass the signed approval; two parallel QMS document-control backends, the guarded one unreached.
- `AUTH_BOUNDARY_MODE=warn` is honoured in production: one env var turns default-deny off with an info log.
- Submission Center shows a passing Validation gate when the readiness read fails.

**→ `…01DiJJAk` (AnA client files, D3)**
- ~~The AnA vault write tools (`file_chat_upload_to_vault`, `place_project_document`) carry no org-role gate: a viewer writes the vault through AnA.~~ **Done 2026-09-24:** the role check now sits in `ingestVaultDocument` / `placeVaultDocument` (`server/services/vault/vault-write-authority.ts`), on the tenant scope's `organization_users` role. Evidence: `docs/evidence/D3/2026-09-24-vault-write-role/`.
- ~~The vault passage tool refuses on two AnA entry points that never pass `organizationUuid`.~~ **Done 2026-09-24:** `executeAgenticLoop` fills it from the same-tenant request scope, which covers deep investigations. The realtime `/ana` namespace opens no tenant scope at all and has no client; that is reported, not fixed. Evidence: `docs/evidence/D4/2026-09-24-passage-search-entry-points/`.
- ~~AnA's Vault screen context reports uploaded files as "0% complete" (the surface itself was fixed to show no percentage, `28324fdf`).~~ **Done 2026-09-24:** an upload's `pct` is `null` on the server and in the client type, and the published context says `percentComplete: null` for an upload. Evidence: `docs/evidence/D4/2026-09-24-vault-upload-completion/`. (`…01KnUGoX` had fixed the same defect locally in `3b525ea9` without re-reading this claim; it yielded to this change at merge. What it adds: a search-hit selection is pinned too, in `vaultSurfaceLabels.test.tsx`.)

**Trunk CI repaired, 2026-09-26 (`…01DiJJAk`).** Run 36222133624 was red in Lint and Test. Lint's failures were guardrail steps, not ESLint or typecheck. All were caused by other lanes' commits, and each is fixed at the cause (`6ce7c30b5`, `9ef1514e8`, and the test-drift commit after them):
- `ci:audit-logs-fixture`: the LX-22 anchor test's `audit_logs` now uses `AUDIT_LOGS_PGLITE_DDL`.
- `ci:unkeyed-request-tables`: `drafting_tasks` recorded as **derived** (through `regulatory_programs`, both P1-8 readers filter on it). **→ P1-8 lane:** a real `organization_id` needs a new applier migration; `0008_ga_hardening.sql` reaches fresh installs only.
- `ci:tenant-isolation`: PF-11's Vault project read is scoped through the program, not the nullable `vault.documents.organization_id`. Filtering on that column would have let an unattributed project-B document into project A's filing; there is a test for that case.
- `ci:requestdb-coverage` (red since `4577cb40e`, 09-25): `/api/ai-placement-policy`, `/api/ana-ri/turn-records` and `/api/claude/agent`'s turn record now run on the request's own connection. Writers that open their own transaction get it through `requestConnectable(req)` (`server/db/requestDb.ts`). `admin/master-enterprise-requests.ts` is allowlisted beside `master-admin.ts` (system scope, platform intake).
- Test: suites had drifted behind production changes. `signer-org-scope` (the meaning check `3d09bf2a9`), `run-pq` (the re-pin `c4eab325f`; the pin is now read from the registry) and `anaDrivesWave4` (`useAuthUser`, `028a0c704`) are fixed. No production rule was loosened. `documentCanvasPolish` failed because the canvas transition reads the motion tokens (`92d0fe0b9`) and the test matched the literal word `ease-out`. It now judges each resolved value, which is stricter than before: an unresolvable token fails. **Founder decision:** `--ease` is `cubic-bezier(0.4, 0, 0.2, 1)`, which the design-system README calls the product's ease-out. `.claude/skills/motion-discipline/SKILL.md` calls it in-out and names `cubic-bezier(0.16, 1, 0.3, 1)` (the token `--ease-spring`) as the ease-out. About 600 transitions follow the token file. If the skill should win, the change is to the one `--ease` token.
- Database suites (`npm run test:db` on a fresh install-fresh + deploy-migrate database; CI's database job is skipped while the Test job is red, so these were unseen). Four had drifted behind production changes and are fixed in the test, no rule loosened: `document-catalog-recall` (P0-12 `69f93d988`: AnA proposes, a person confirms), `one-time-credentials` (IAM-17 `dd6632dd0`: the test's passwords held the account's own words), `authoring-section-concurrency` (`fde9d704e`: every content save carries a reason for change), and `control-plane-access` / `two-tenant-application-rls` (IAM-10 `414f203e1`: the membership row, not the token's claim, is the role; the fixture now provisions admins as rows and the operator as a `platform_role_grants` row). Three refusal cases had been refusing a plain `member` since `414f203e1`; they now refuse the role they name.
- **→ D3 / control-plane owner, found, not fixed (fails closed):** `requireOrgAdminOrOperator` (`server/src/routes/control-plane.router.ts:83`) admits a platform operator only through the synchronous `isPlatformAdmin(req)` and never reads `platform_role_grants`. An operator designated the way Access Management designates one therefore gets 200 on `/kernel/recent` but 403 on `/governed/decisions`, although the router's header says org admins "or platform operators". It refuses more than intended, never less.
- **→ D5 lane (P1-21 / DP-17), fixed 2026-09-28 (`…01P6GWSv`, `docs/evidence/D5/2026-09-28-fcoi-certify-meaning/`): the meaning is required and checked before re-authentication, through the shared `signMeaningRefusal`. As found:** `POST /api/financial-disclosures/disclosures/:id/certify` still defaults `meaning` to `'Certified'` (`server/routes/financial-disclosures.ts:320,323,337`). Since `3d09bf2a9` the shared writer refuses that meaning, and the route maps the refusal to 500. Every certification that omits a meaning, or sends one outside `GOVERNED_SIGN_MEANINGS`, fails; nothing partial is written. The fix is the eSTAR pattern: a required enum and a 400.

**End-to-end lineage and project-first plan (`docs/design/LINEAGE_END_TO_END_PLAN_2026-09-25.md`, `…01KnUGoX`).** The founder's path is traced hop by hop and every break is verified: project → Data Room → AnA → canvas → editor → save → Vault → Submission Center → FDA/EMA/EU, plus Biostatistics, CMC and the other producers. Twenty fixes, LX-00 to LX-19, each extending an existing store, with the owner, tests first and founder decision named per fix. A project-anchoring audit is running (`wf_9dedbf38-bee`); its PF fixes go first, because every chain starts at a project. **Claimed by `…01KnUGoX`, in order:** LX-00 (the failing founder-path walk test, `tests/lineage/`, and `ci:canvas-path` from wiring to recorded lineage; the canvas gate's author `…01U2hGiy` has no active row) and LX-16 (the statistics engine's wrong figures; BS8 done in `64a1d5c7`, `docs/evidence/D7-BIOSTAT-NI-POWER/2026-09-25/`). Other LX items name their owners in the plan and are proposed to them here before any edit. Every file inside another lane's 24 h window is a hand-off, not an edit. **Project-first plan: `docs/design/PROJECT_FIRST_PLAN_2026-09-26.md`** (the `wf_9dedbf38-bee` audit, PF-00 to PF-17, with owners, windows, tests-first and seven founder decisions). **Claimed by `…01KnUGoX` now: PF-05 and PF-06 (LX-22 part 2)** — `project-intake.ts`, `projects.ts` (create), `submission-service.ts` (create), `routes/submissions.ts` (POST), `SubmissionCenter.tsx` (create form), and the name matchers PF-06 names that sit outside claimed lanes; `ind-checklist-view-assembler.ts` and `ectd-compile.ts` are proposed to their lanes, not edited. Every other PF names its owner in the plan. **For the D6 lane (2026-09-26):** `9f43e7e9` (the retention clock starts at admission) left three suites red on trunk: the shared `VAULT_DDL` fixture (`server/routes/__tests__/_authoring-canvas-fixture.ts`, used by `authoringFileToVault` and the LX-00 walk) and `vault-ingest-conflict` had no `vault.documents.retention_until`, and the fixture had no `vault.retention_policies`, so every ingest there answered INGEST_FAILED. Fixed fixture-only by `…01KnUGoX` (no product file touched), because the LX-00 walk is this session's gate. Still red on trunk and left for you: `server/routes/__tests__/auth-refresh-session-currency.test.ts` answers 401 `SESSION_LIFETIME` for an account that never changed its password, since `9b4e48aa` (session lifetime). **PF-11 placement half + LX-11 ledger half done** (`docs/evidence/D2-PLACEMENT-STAYS-IN-PROJECT/2026-09-26/`): `upsertLeaf` refuses 409 `CROSS_PROJECT` when the document's project and the submission's differ, and the placement ledger names the document, its pin and both projects; the walk baseline shrinks to 17. Founder decision PF-11 taken by the plan's default (refuse; no cross-program reference path yet). Rest of PF-11 (citations, pins, comments, protocol→design binding) is open. **LX-22 part 2b (PF-06) done.** **PF-13 done** (`docs/evidence/D5-PROJECT-RETENTION/2026-09-26/`): deleting a project that holds sealed, filed or transmitted records is refused 409 with what it holds; archive instead; a draft-only project deletes, audited. **PF-07 done** (`docs/evidence/D2-NO-PROJECT-NO-RECORD/2026-09-26/`): no project, no record. A chat file with no project open stays a conversation file, with no Data Room source. `POST /api/c2c/projects/:id/adopt` is the one audited way it enters a project. Source identity is per project. A project-scoped upload whose source write fails answers 503, not 200. `POST /api/authoring/docs` refuses a create with no project (400 `PROJECT_REQUIRED`, with the code in the body). `/docs/from-draft` checks the project belongs to the organization, not just its shape. Both client create paths (the create control and `saveToAuthoring`, which eight buttons in six surfaces use) create in the open project only, read through one `shellProgramId()`. **Notice to `…01W5zW66`:** `authoring.router.ts` changed in POST `/docs` only (the refusal forwards `code`, 5 lines); your `ai/draft` hunk is untouched. **→ D6 lane (tenant purge, `server/services/tenant/tenant-offboarding.ts`), found by the PF-04 scout (`wf_8e90bd64-38f`) and confirmed against the DDL, not fixed here:** a purge of any tenant created through project intake aborts with 23503. There are two causes. (1) `c2c_documents` is not in `PURGE_CHILD_TABLES`. Intake scaffolds c2c_documents rows for every project, and `c2c_documents.project_id REFERENCES regulatory_programs(id)` is NO ACTION (`migrations/20260528_phase9_document_schema.sql:56`), so `DELETE FROM regulatory_programs` fails. The table's org column is `org_id`, so it also needs a `PURGE_PARENT_SCOPED` entry `'org_id = $1'`. Without it the default predicate raises 42703, which the loop skips silently. Its own children must go first. (2) `client_workspaces` is purged before `projects`, and `projects.client_workspace_id` is NO ACTION (`0000_sweet_joseph.sql:6765`; also `cer_projects`, `client_access`, `client_security_settings` and `ind_projects` at :6405, :6423, :6425 and :6678). Neither purge test seeds either shape (`tests/db/tenant-purge.dbtest.ts`, `tenant-purge-vault-scope.pglite`). A red test is one seeded intake tenant (program, scaffolded document, workspace-scoped project), purged. Also left after a purge as residue: `authoring_documents` (org column `tenant_id`), `cre_evidence_sources` and `cdisc_prm_studies` (`tenant_id`). And in the system scope, the vault delete policy (`core.can_write_program`) matches 0 rows unless `app.bypass_rls` is set, so a vault key of any kind would block the purge. That is why PF-04 does not key `vault.documents`. **→ `…01DiJJAk` / `…01T2wooC` (trunk red, found by `…01KnUGoX`'s full run, not edited):** `tests/routes/ana-intelligence-provenance.test.ts` › "records an audit row with the model and a sha256 of the content" fails on clean trunk `fa600fca` (`expected undefined to be 7`). `server/routes/ana-intelligence.ts` changed today in `9ef1514e` (moved to the request's client) and `f5122fe9` (tenant from the server). **PF-04 done** (`docs/evidence/D3/2026-09-26-program-same-org-keys/`). A record names a project of its own organization only, at the database: `migrations/20260926b_program_same_org_keys.sql` adds composite keys (key, org) → `regulatory_programs (id, organization_id)`, NOT VALID, on projects, authoring_documents, cre_evidence_sources (plus a CHECK) and cdisc_prm_studies with ON DELETE SET NULL (key), and on c2c_documents with NO ACTION like its older key. `scripts/db/program-same-org-preflight.mjs` lists the legacy cross-organization rows. **Operators:** run it and clear what it lists before any tenant purge or VALIDATE. Proven on a deploy-shaped PostgreSQL 16 (install-fresh plus two deploys; `test:db` 70/70). Inserted into `migration-set.mjs` before the sweep, insert-only. Three creator migrations' comments were amended in place under Rule 1. `vault.documents` and `submission_transmittals` are deliberately not keyed (see the header): the first waits on D6's purge, the second on PF-12. **PF-17 follow-up done:** the status route's outcome log records the resolved project, and a failed project lookup is a 500, not a 404 (`strict` on the translation rule). **Next, claimed by `…01KnUGoX`: PF-17 remainder.** About 20 other artifact routes in `artifacts.ts` load the artifact by id and organization alone after checking the URL's project, including rollback and reviews/submit. One loader scoped to the resolved project, with tests first. **Notice to `…01P6GWSv` (D5, `artifacts.ts` status route, `8d96238d`):** the PF-17 follow-up changes two lines of that route. The project lookup is `resolveCmcArtifactProject(…, { strict: true })`, so a failed lookup is a 500, not a 404. The outcome log's `projectId` is the resolved project, not `parseInt` of the URL. Your signature ceremony is untouched and its suites pass on the merged tree. **→ `…01TtwRHm` (IND lane, trunk red on `8b9d18c6`, found by `…01KnUGoX`, not edited):** `tests/routes/export-governance-fail-closed.test.ts` › "ectd-export route source contains explicit governance gate" fails on clean trunk. It expects `server/routes/ectd-export.ts` to contain `if (!governanceResult)` and `EXPORT_GOVERNANCE_REQUIRED`, and that file changed in `954c2588` and `b801a663`. **PF-17 remainder done (`…01KnUGoX`, `docs/evidence/D2-PROJECT-RECORDS-READ/2026-09-29-every-artifact-route/`):** every artifact route in `server/routes/c2c/artifacts.ts` acts only on its own project's artifact, through one scope, `artifact-project-scope.ts`. The 20 routes that loaded an artifact by id and organization alone, including rollback, reviews/submit, comment resolve and remind, now load it by project as well, and a v2 program UUID reaches all of them. The status route is refactored onto the same scope. **Notice to `…01P6GWSv`:** the status route's project lookup now calls `authorizedProjectId` and `loadProjectArtifact`; your signature ceremony is unchanged and its suites pass. **PF-11 rest done (`…01KnUGoX`, `docs/evidence/D2-PLACEMENT-STAYS-IN-PROJECT/2026-10-01-citation-module3-repoint/`):** a section cites only its own project's sources (`citation-ends.ts`; `SourceUsageError` code `CROSS_PROJECT`). The source-change list is scoped by the citing document. `/source-changes` uses `programInOrganization`. Module 3 is placed only into its own project's submission. A re-pointed leaf's ledger names the previous document. **→ `…01T2wooC` (authoring.router.ts window):** at the cite-source catch (~:2911), map `e.code === 'CROSS_PROJECT'` to 409 (it answers 400 with the honest message today). **→ `…01KZK3jg` (stream.ts):** pins resolve inside the open program. Give `resolveSourceUploadIds` an optional `programId` (`AND (client_program_id = $3 OR (client_program_id IS NULL AND organization_id IS NULL))`) and pass it from the stream after `programInOrganization`. **→ eSTAR owner (`…0194UQPx`):** `resolveProjectAnchor` (510k-estar-routes.ts ~:224-230) and `cerv2-export-routes.ts` ~:187-193 return `fda_510k_projects.id` as the artifact's `project_id`. It should be that row's `project_id` (the key to `projects`). Pre-existing, found by the PF-03 key review (`wf_191c57dc-c21`); with the same-org key, a mismatch is now refused, not misfiled. **PF-03 database half done (`…01KnUGoX`, `docs/evidence/D3/2026-10-01-integer-project-same-org-keys/`):** `migrations/20261001_integer_project_same_org_keys.sql` adds the same-organization key to the integer project id on `concept2cure_artifacts` and `c2c_submission_packages`. It is NOT VALID and ON DELETE CASCADE like the existing keys, and proven on PostgreSQL 16 (upgrade, fresh install, replay, legacy data, test:db 88/88). Every writer of those tables is now held by the database. A writer still sending an unchecked id gets 23503 rather than a cross-organization row. **→ `…01471vSK`:** `approve_import` and `save_document_to_vault` are among them; the honest 404 is their fix. **PF-03 done (`…01KnUGoX`, `docs/evidence/D3/2026-10-01-integer-space-writers/`):** the integer-space writers check the `projects` row is the caller's through `projectBelongsToTenant`: chat upload (numeric), `POST /api/submission-ops/packages`, AnA `create_submission_package`, and the artifact version store (the choke point under the stream's draft save and `commit_document_revision`). The Artifacts Center's project join is org-paired. **→ `…01471vSK` (D6 record-id claim):** `approve_import` (AnaToolExecutor.ts ~:14856) and `save_document_to_vault` (~:20318) insert `concept2cure_artifacts` under an unchecked project id. Ask `projectBelongsToTenant({ organizationId, projectId: String(id) }, pool)` before the INSERT; it is already imported in that file. **→ `…019ZvHmh`:** `post-processing.ts:181-194` hand-copies the anchor SELECT. The version store now refuses a foreign project, so only the duplication is left; move it onto `resolveCmcArtifactProject(org, String(parseIntegerProjectId(x) ?? x), { strict: true })`. **→ audit/D3 lane:** `c2c_package_sections.updated_at`, like `audit_events.updated_at`, is in `shared/schema.ts` and no migration. **PF-08 review follow-up done** (`wf_72c8daf0-af3`): the device-projects delete is guarded too; the read locks artifacts and the workspace (proven on real PostgreSQL 16); a signed draft is a record; both routes are role-gated; the workspace delete is audited. **PF-08 anchor-delete half done (`…01KnUGoX`, `docs/evidence/D5-PROJECT-RETENTION/2026-09-30-legacy-hard-delete/`):** `DELETE /api/projects/:id` and `DELETE /api/clients/:id` hard-deleted `projects` rows, and a program's anchor row with them; its approved documents cascaded away. Both now refuse 409 (`PROJECT_IS_PROGRAM_ANCHOR`, or `PROJECT_HOLDS_RECORDS` past draft) through one helper, `server/services/c2c/project-retention.ts`, inside the deleting transaction. **→ audit/D3 lane:** `audit_events.updated_at` is in `shared/schema.ts` but no migration adds it, so on a migrations-only database the legacy delete's audit row is lost silently. Needs an additive migration on the set. **Founder decision still open (PF-08):** should a same-named legacy project ever be auto-linked to a new program? **PF-15 eSTAR done (`…01KnUGoX`, `docs/evidence/D2-PROJECT-RECORDS-READ/2026-09-29-estar-filing-project/`):** `createEstarSubmission` refuses 404 a `projectId` the organization does not hold, before the row or its audit entry is written; a device filing could sit on another organization's project spine (the unified work view reads it by `project_id`). Only the service changed; `510k-estar-routes.ts` is untouched. **PF-15 MISSED-2 done (`…01KnUGoX`, `docs/evidence/D2-PROJECT-RECORDS-READ/2026-09-29-cmc-interview-project/`):** a CMC interview is filed only under a project of its organization. `createInterviewSession` refuses `PROJECT_NOT_IN_TENANT` before the row is written, and the commit checks the filed-under project every time, not only when bound at commit. A session started under a foreign or deleted project used to file every register record there. **PF-15 first slice done (`…01KnUGoX`, `docs/evidence/D2-PROJECT-RECORDS-READ/2026-09-29-cmc-project-scope/`):** CMC Module 3 writes only under a project of the caller's organization. The one check is `project-membership.ts` `projectBelongsToTenant` (a live program, or a `projects` row, of the organization); a duplicate the first cut added is folded back in, and the check no longer admits a **deleted** program for any of its four callers (interview commit, Module 3 link, AnA capability tool, these routes). One `router.param` guards the 15 `/api/cmc/module3-os/*/:projectId` routes, and `POST /api/cmc-changes` refuses a foreign `cmcProjectId` before the change, its audit row or its source object is written. Second pass (2026-09-30): the guard is one module, `server/api/cmc/module3-project-guard.ts`, on the operating-system, build-state and convergence routers. A foreign project is 404, not an empty build state. Its organization read replaces four private copies. `projectRoutes.ts` already guards its own `cmc_projects`, and `routes.ts` registers check through `linkToModule3`. **PF-07 user half done (`…01KnUGoX`, `docs/evidence/D2-NO-PROJECT-NO-RECORD/2026-09-29-adopt-ui/`):** the Data Room offers the caller's own conversation files (`GET /api/c2c/projects/:id/conversation-files`), and "Add to this project" is the audited adopt. `projects.ts` gains one route, placed apart from `…01YZFCXR`'s and `…01PwLFr8`'s recent hunks. **→ W1 lane (`…01T2wooC`, `client/src/hooks/useChatUpload.ts`):** a chat upload with no project open answers `dataRoom: { recorded: false, reason }`. The chat should say that the file is kept as a conversation file, and that it can be added from a project's Data Room. Today it shows nothing. **Founder decisions 2026-09-26 (PF-07, PF-10, PF-13, PF-16), recorded in `docs/design/PROJECT_FIRST_PLAN_2026-09-26.md` §6:** a governed record needs a project (a chat file with no project stays a conversation file until adopted); only a draft-only project may be deleted (else archive); a project switch mid-conversation forks the conversation; QMS SOPs/WIs/forms/QMPs are organization-level, product-specific quality records carry a project. **→ `…0194UQPx` (stream.ts, window to 2026-09-27T02:26Z):** PF-10 is decided — fork on switch; the thread must carry its program as a column. **→ the QMS lane (`mdx-qms.ts`):** PF-16 is decided as above. **PF-17 server half done** (`docs/evidence/D2-PROJECT-RECORDS-READ/2026-09-26/`): `GET /api/c2c/projects/:id/records` lists every record anchored to the project by its key (honest per-section availability), and the activity feed shows governed actions on the project's own records. ProjectHome display is next. **PF-14 done** (`docs/evidence/D4-STUDY-DESIGN-PROJECT-ANCHOR/2026-09-26/`): a study design is anchored to a live project of its organization, never moved, never written over another organization's same-id design; `/persist` requires a project; `generate_sap` no longer reports an unstored SAP as generated (and `create_artifact` no longer invents an id without a database). `study-design.ts` / `study-design-repository.ts` were cold. **PF-02 upload.ts done** (`docs/evidence/D2-PROJECT-ANCHOR-AUTHORING-CREATE/2026-09-26-upload/`): the Data Room capture route refuses 404 a project its organization does not hold, before anything is written; only the identity block was touched (`…01DiJJAk`'s retrieval-atom blocks untouched). **LX-22 part 2a (PF-05) done** (`docs/evidence/D2-SUBMISSION-PROJECT-ANCHOR/2026-09-26/`): intake, `POST /api/submissions`, the Submission Center form and the transmit path all write the submission's project; intake no longer adopts by name. **Handed on, not edited:** (1) **→ IND lane (`…01TtwRHm`)** `ind-checklist-view-assembler.ts` `resolveTargetReceiptDate` matches program ↔ submission by name; it should read `s.program_id` first (PF-06 E13 in the plan). (2) **→ `…0194UQPx` (window to 23:41Z)** `ind-forms.routes.ts` official-upload should record `spineMatch` in its sealed audit once `resolveSubmissionSpine` reports it (PF-06 E12). (3) **→ tenant offboarding owner** where `submission_transmittals` came from the raw `20260509` DDL its `program_id` is a NO ACTION key to `regulatory_programs` and the purge deletes programs but not transmittals; a transmittal naming its project (now written on the sequence path, already on the package path) would block that tenant's purge with 23503. Decide: purge transmittals before programs, or make the key `ON DELETE SET NULL`. **LX-22 part 1 (project first, PF-creation-1): `submissions.program_id`** is done: the column, a same-organization composite key (`ON DELETE SET NULL (program_id)`, so a tenant purge is not blocked) and a one-to-one backfill from the creation audit rows (`docs/evidence/D2-SUBMISSION-PROJECT-ANCHOR/2026-09-26/`). Part 2, where intake and Submission Center write the anchor and stop adopting a submission by name, is proposed to the `projects.ts` / `submission-service.ts` / `routes/submissions.ts` / `SubmissionCenter.tsx` window-holders and waits on those windows. **Done so far:** LX-00 walk test (`942b7d68`, `docs/evidence/D4-FOUNDER-PATH-WALK/2026-09-25/`: 26 green and 18 baselined red, first break at AnA); LX-16 BS8 `64a1d5c7`, BS-M1 `5882a1b6`, BS4 `14607f90`, scenarios `456083d9`, binary power `8cc98672`. **For `…01FSu2RL` (no lane row; `fde9d704`):** that commit dropped the `$` from `content = $${paramCount}` in `authoring.router.ts`, so every Authoring section save answered 500. The one character is restored in `eb1073a6`, because a launch app could not save. The IND journey and `authoring-atomic-mutations` now send the reason-for-change your commit requires (`docs/evidence/D2-AUTHORING-SECTION-SAVE/2026-09-25/`). The three authoring-section contract files that commit left red (11 cases) were brought up to the mandatory reason in `7abcb566`. **For the D6 lane (`…0194UQPx`):** `613c6e00`'s account-standing read needs `users.password_changed_at`. The IND journey's hand-mirrored users table lacked it, and every signature there was refused `ACCOUNT_STATE_UNKNOWN`. The journey now applies `20260725_users_signing_lockout_columns.sql`. Other journeys and harnesses that hand-mirror `users` may need the same.

**D1 migration replay — NARROWED (done, `…01KnUGoX`, 2026-09-25, `docs/evidence/D1-MIGRATION-CHECK-REPLAY/2026-09-25/`).** Three CHECK constraints broke every deploy after the first row their later widening admits. The earlier file's unconditional `DROP`/`ADD` is replayed and validates rows against its narrower list: span-lineage kinds (`20260907` over a `machine_draft` span), `c2c_documents` doc types (`20260806b` over an EU MDR/IVDR document), and orchestrator run status (the store port over an `awaiting-signature` run). Each was amended in place, guarded on `pg_get_constraintdef`, and reproduced red → green on PGlite (`tests/schema-contract/check-constraint-replay.pglite.test.ts`). `ci:migration-drop-safety` gains the NARROWED mode (selftest 12/12, 4/12 against the old gate), and CLAUDE.md RULE 1 gains the corollary. Not the W2 `B4` above: a different finding.

**Vault / data room — Veeva parity plan (`docs/design/VAULT_VEEVA_PARITY_PLAN_2026-09-24.md`).** Twenty slices (VR-01…VR-20), each with its launch row, owner notes and tests-first list, and twelve founder decisions (FD1…FD12) no session may take. **Done: VR-01** (`docs/evidence/D5-VAULT-HISTORY/2026-09-24/`), **VR-02** (`docs/evidence/D5-SIGNED-EXPORT-AUDIT-LOGS/2026-09-25/`) and **VR-03** (`docs/evidence/D5-LIFECYCLE-APPEND-ONLY/2026-09-25/`): the lifecycle trail only grows, signatures are written once, and nothing is deleted (enforced by a trigger, `migrations/20260925_canonical_documents_append_only.sql`); the verifier recomputes hashes; a revision ends the review round; transitions are serialized under a row lock (two concurrent → one 200 + one 409 on real PostgreSQL, where HEAD gave 200 + 200). **Hand-off to the D6 lane (`…0194UQPx`):** add `canonical_documents_guard_row` and `canonical_documents_guard_truncate` (source `migrations/20260925_canonical_documents_append_only.sql`) to `EXPECTED_AUDIT_IMMUTABILITY_TRIGGERS` in `server/services/audit/audit-immutability-triggers.ts`; not edited here, as it is inside that lane's 24 h window. **Fixed for the D1 storage lane (`…01AiwZKG`):** two vault-leaf assembly suites were red on trunk after `7fd5d6af` (fixture lacked `storage_provider`, mock lacked `getStorageProviderFor`); `b99f98cf`, fixtures only. VR-02 is the first half of security plan **P1-19** (the export reads `audit_logs`); the KMS signature and export key-id halves remain for the Part 11 substrate lane. **Claimed by `…01KnUGoX`, in order: VR-01** (every Vault download joins the sequenced audit chain, and a document shows its own history; D5), **VR-02** (the signed audit export contains the Vault's events; D5), **VR-03** (done, above). Slices that touch another lane's files (VR-05, VR-08, VR-11, VR-14) are proposed to that lane here before any edit.

**→ `…01DiJJAk` (AnA client files), from `…01KnUGoX`'s Vault-against-Veeva mapping, 2026-09-24**
- The vault view a document was filed under is not stored with the filing. `resolveVaultView` runs per read and falls back to the service view on any error, so a filing made under one view can land in a folder the next read's view does not have. The read side now shows such documents rather than dropping them (`docs/evidence/D2-VAULT-CABINET-OTHER-VIEW/2026-09-24/`). Recording the view belongs in `placeVaultDocument` and the ingest, which are your files.
- A same-hash re-upload rewrites the row's governed metadata (classification, retention policy, title, lineage, storage pointer) without recording the old values (mapper evidence: the ingest's ON CONFLICT DO UPDATE). For an immutable record, that path must either refuse a metadata change or write it as an audited event. **Done, in-lane half, 2026-09-26 (row D5, `docs/evidence/D5/2026-09-26-vault-reupload/`):** a same-bytes retry keeps every field it does not state (classification no longer falls back to INTERNAL). Retention policy, lineage and file name are write-once, and the record keeps its stored copy; only a record with no storage handle adopts the retry's. A change the retry does make is one chained `vault.document.reupload` row with each field's from/to; an identical retry records nothing, its duplicate copy is removed, and the route answers 200 with `reupload`. **VR-05 completed in this lane, 2026-09-26, as the plan's ownership note directs** (`docs/evidence/D5/2026-09-26-vault-edit-details/`): Edit details in the Vault detail pane (`VaultEditDetails.tsx`) → `POST /api/c2c/project-vault/:id/documents/:documentId/details` → the writer below, and a re-upload of recorded bytes no longer changes title, type, classification or filing (it reports `differs`). The two items left from VR-05 are done too: an upload no longer sets lineage (400 `LINEAGE_NOT_ACCEPTED`, `docs/evidence/D5/2026-09-26-vault-ingest-lineage/`), and the filing audit row records `evidenceKind` in from/to (`docs/evidence/D5/2026-09-26-vault-filing-evidence-kind/`). VR-05 is complete. **VR-06 done, 2026-09-29 (`docs/evidence/D5/2026-09-26-vault-record-immutability/`):** `migrations/20260926_vault_documents_record_immutability.sql` refuses any change to a recorded version's identity, hash, uploader or lineage, and any change to a write-once field (organization, code, file name, storage handle, retention policy, lineage, `deleted_at`) once it holds a value, whatever the role. The one exception is storage adoption. TRUNCATE is refused. Both triggers are required at boot (`audit-immutability-triggers.ts`), and `npm run ci:vault-document-writers` names the six files that may still UPDATE the table. Red with the triggers dropped (5 of 6 failed), green after deploy-migrate re-created them. **VR-07 done, 2026-09-29 (`docs/evidence/D5/2026-09-29-vault-record-no-delete/`):** only the table's owner deletes a Vault version. The tenant purge goes through `public.purge_tenant_vault_records`, run as that owner, which refuses outside the platform scope, for an organization not pending deletion, or under an active hold, and returns the deleted versions' storage addresses. **→ The D6 purge lane:** this also fixes a purge that erased nothing in the Vault. The route runs the purge as `app_service` in the platform scope, and the Vault's policies have no platform arm, so the purge's DELETE and its byte-address read matched no rows while the tenant was marked `purged`. `tenant-purge.dbtest.ts` ran the purge as the owner, so it could not show this; a new case runs it on the route's own connection (red at trunk, green now). Only the vault DELETE in `tenant-offboarding.ts` changed. **→ WO-16C (`…01E8btkB`), `retentionCron.ts`:** only the hard-delete outcome changed. A destroy policy now leaves the record untouched and counts `destructionRefused` (in place of `hardDeleted`) until FD3; the soft-delete path and its audit write are as they were. **VR-04 done in code, 2026-09-29 (`docs/evidence/D4/2026-09-29-vault-classifier-anchoring/`):** the CTD classifier is word-bounded, puts specific patterns before generic ones, and gives no section for a bare module (it used to propose `N.0`). The declared type informs the proposal, and a contradiction is flagged, not overridden. Both filing writers refuse an out-of-vocabulary kind or section before writing (422 / 400). The view falls back only on 42P01, and the Vault shows kinds in words. Found on the way: authoring's file-to-vault stored its module `M2` as the CTD section; it no longer does. **→ The W3 validation lane:** the plan asks for an OQ-002 re-run with this change. No step's expected result changes, but the run needs the validation identities this session does not hold. **→ The D7 lanes:** `validateSectionCode` still accepts `N.0` by shape for modules 2-5, and tightening it moves leaf placement. **VR-15 done, 2026-09-29 (`docs/evidence/D2/2026-09-29-vault-index-coverage/`):** the Vault shows how many required sections have a confirmed document, and says whether the list is the program's own rule pack or the ICH baseline. It shows the reason instead of a figure when the store can't be read or the vault isn't CTD-numbered. Missing sections offer Upload and filing a document there, and AnA sees the same counts. Filed leaves carry stable index numbers (the normalized section in a CTD view, the folder ordinal and position otherwise). `required-sections.ts` was read, not edited. **VR-12 done, 2026-09-30 (`docs/evidence/D5-LIFECYCLE-SIGNING/2026-09-29-part11-records/`):** a lifecycle review or approval is now a governed ledger pair plus one `electronic_signatures` row, with printed name, meaning and time, written on the same transaction as the stage change. It is bound to the Vault version's `content_hash`, read FOR SHARE (new `BINDING_BASIS.VAULT_DOCUMENT_VERSION`), or to the ledger's chain hash, labelled as not a content hash. The csig fallback is gone. Lifecycle audit rows are chained on the transaction, so a failure rolls the stage back. A body `contentHash` is never read. The creator or the uploader gets 403 `SELF_APPROVAL`: `separation-of-duties.ts` gains a `canonical_document` case. A review covers only the content it was signed over. `canonical_documents.created_by` is added and made write-once, both by in-place amendments with dated notes. **→ The D6 lane:** nothing new for the trigger-presence list (the guard's trigger names are unchanged). **→ Security plan P0-10:** compatible, since every lifecycle signer goes through `reverifySigner`. **→ VR-13 (next):** create lifecycle documents from Vault versions; `vaultSourceId`/`readVaultSource` are the reads to use. **VR-08 done, 2026-10-01 (`docs/evidence/D2-VAULT-VERSIONS/2026-09-30-checkin/`):** `POST /api/vault/ingest` takes `supersedesDocumentId`, and the server adds the file as the document's next version. It assigns the version (FD1: 1.0 → 2.0), keeps the code and filing, and links the predecessor. It refuses a head that is not current (`VERSION_NOT_CURRENT`, naming the current version), bytes the document already holds (`CONTENT_ALREADY_A_VERSION`), a non-numeric scheme (`VERSION_SCHEME_UNKNOWN`), a sent version or filing, and another tenant's document (404, nothing stored). It is planned before any byte is stored and again under the head's row lock. `migrations/20260930_vault_documents_version_lineage.sql` makes the database refuse a link outside the family, or a second successor, for every writer. The one-successor index is created only when no version is already forked. URS-VAULT-011 and OQ-VAULT-11 are added; the OQ run is **→ W3**, with VR-04's re-run. **→ VR-09 (next):** the version list, any-version download and Upload new version in the Vault; define the family for authoring and eSTAR rows (critic item 12) and move `Etmf.tsx` onto `useVaultUpload` (item 11). **Found on the way, fixed in this lane's test:** `tests/db/document-catalog.dbtest.ts` was red on trunk after `d8214c170` (AnA tools refuse a model-supplied program id outside the caller's organization, which is correct). The foreign-tenant case now expects `PROGRAM_NOT_IN_ORGANIZATION`, answered exactly as a program id naming nothing, so it is no existence oracle. **→ the AnA-tools lane (`d8214c170`):** your change needed this dbtest update. It is done; nothing is needed from you. **VR-09 done, 2026-10-01 (`docs/evidence/D2-VAULT-VERSIONS/2026-10-01-version-list/`):** a document is one entry in the Vault, at its current version, with its version count, and the count counts documents. The detail pane lists every version, newest first, with SHA-256, size, uploader and UTC date. Each version downloads hash-verified, and the pane can export the signed audit history of exactly those versions. "Upload new version" and the refused same-name upload both check in through the one upload hook. Search hides earlier versions unless asked. A document's history spans every version, each event naming its version. Every reader uses one family rule, the VR-08 trigger's (`server/services/vault/vault-version-family.ts`); a pointer the rule refuses is shown as not linked. **Found on the way, fixed:** VR-08's check-in walked any row naming the head, with no organization filter, so a legacy row of another document made it answer "the current one is 2.0" for the wrong document. It now uses the family rule and the caller's organization, and a row only the trigger still counts gets 409 `VERSION_LINK_CONFLICT`. `ci:tenant-isolation` now expands nested fragments; a nested fragment without a tenant predicate is still flagged. URS-VAULT-012 and OQ-VAULT-12 added; **→ W3:** the OQ-VAULT-11/12 runs, with VR-04's re-run. **Left open:** `Etmf.tsx` still has its own upload path (critic item 11), and what a family is for authoring and eSTAR rows (item 12) is the authoring lane's to define. **→ VR-13 (next):** send a Vault version for review and approval with an e-signature, superseding the prior version; VR-08, VR-09 and VR-12 are in place for it. **VR-13 done, 2026-10-01 (`docs/evidence/D5-VAULT-APPROVAL/2026-10-01/`):** from a version's detail, Send for review (confirmed, naming the file's SHA-256 and that the sender then neither reviews nor approves), Sign review and Approve (the shared EsignModal: meaning, the signer's own reason, password, code). The lifecycle route now requires that reason on both sign-offs (400 `REASON_REQUIRED`) and no longer writes one for the signer. One lifecycle record per version (`migrations/20261001_canonical_documents_vault_version.sql`; the start is serialized and audited as `regulated_document.created`). The uploader, the record's creator and the reviewer cannot approve, and only the current version is approved. Approving v2 supersedes v1 in the same transaction (a failure rolls both back). The Vault shows each version's stage and sign-offs (printed name, meaning, UTC time) apart from its filing, and a folder counts an upload as settled only when approved (FD4). Editing an approved version's details is 409 `APPROVED_VERSION_IMMUTABLE` (FD6 default). URS-VAULT-013, OQ-VAULT-13 and OQ-VAULT-14 are added. **→ W3:** OQ-VAULT-14 needs a third identity, `OQ_APPROVER_*`. **Found on the way, fixed:** `ci:launch-scope-api` matched a surface id with no left boundary, so `vault` resolved to `'device-vault'`'s component and `home` to `'project-home'`. The v2 Vault's calls had never been checked. Anchored, and given a selftest case. Two unclaimed paths surfaced, both now declared: the Vault's `/api/regulatory/documents`, which production would have refused, and the task board's `/api/project-rules` (in use since August). The Vault's signed-history export read a 403 as a dropped connection, because `apiRequest` throws on refusals; it now says who can export. **→ VR-14 (next):** only an approved, current version is transmitted (D7 lanes own `leaf-source-resolver.ts`). **VR-10 was delivered under PF-07** (`824f699cf`, `docs/evidence/D2-NO-PROJECT-NO-RECORD/2026-09-26/`): a source's checksum identity is scoped to its project, and the PGlite and route tests named for VR-10 pass. **VR-16 done, 2026-10-01 (`docs/evidence/D2/2026-10-01-data-room-capture-immutable/`):** the data room's capture record (`cre_evidence_sources`) is append-only in the database, for every role but its owner. Checksum, revision link and project scope are write-once, organization and type are frozen, retirement is one-way, and TRUNCATE and DELETE are refused (`migrations/20261001_cre_evidence_sources_capture_immutability.sql`; boot requires the three triggers). Both writers were enumerated first and stay green. The data room's chip now names the Vault version a file became: "Filed as v1.0, superseded by v2.0". **Next without a founder decision:** VR-11 (file from the data room into the Vault in bulk; the catalog-tool extraction is this lane's). VR-14 waits on FD5 and the D7 lanes; VR-17 on FD7; VR-18 to VR-20 on FD8. Previously noted: VR-05's Edit details needed only its route (`POST /api/c2c/project-vault/:id/documents/:documentId/details` in `project-vault.ts`) and the `Vault.tsx` control. The writer exists: `editVaultDocumentMetadata` (`server/services/vault/vault-metadata-edit.service.ts`) checks role, reason, vocabularies and program ownership, locks the row `FOR UPDATE`, and writes one chained `vault.document.metadata_edit` row with each field's from/to and the reason (`docs/evidence/D5/2026-09-26-vault-metadata-edit/`). Once it is wired, a re-upload can stop changing descriptive fields.

**→ D3, unclaimed**
- ~~The cortex vault Q&A route takes its tenant key from the client's `x-org-uuid` header, and both its SQL predicate and RLS trust it.~~ **Done 2026-09-24 (`c062f4b0`, row D3):** worse than stated — mounted under `cortex-unified`, whose `extractTenantContext` drops `organizationUuid`, the header was the ONLY key the handler used, and no header ran an unfiltered search. For the atom corpus RLS contained it; **for the vault corpus it did not** — generate/advisory modes hand the uuid to the RAG pipeline, which wrote it into the GUC vault RLS reads (the re-baseline's wording was right; corrected same day, see `docs/evidence/D3/2026-09-24-rag-pipeline-tenant/`). The key now comes from the session only; no usable org is a 403. Evidence: `docs/evidence/D3/2026-09-24-cortex-tenant-header/`.
  - *For that lane, from `…01KnUGoX`, found at HEAD but not measured:* `server/routes/ana-features.ts` has the same `tenantContext?.organizationUuid || req.headers['x-org-uuid']` fallback at five POST routes: `/citations/run` (:2360), `/citations/projects/:projectId/batch-run` (:2597), `/submission-chat/stream` (:4879), `/submission-chat` (:4952), `/authoring-plan` (:5037). At `/citations/run` the value reaches `ragPipeline.retrieve({ organizationUuid, artifactScope: { projectId, organizationUuid } })` (`services/ana/citation-engine.ts:383-428`), where the project id is the tenant's own. Whether a foreign uuid retrieves anything depends on how the retrieval arms combine the two, and on when `tenantContext` lacks the uuid (the re-baseline found a structural path for `tenantContext` readers). Neither is measured here. The file is not edited here.
- ~~The vault context-expansion (small-to-big) query has no org predicate and relies on RLS alone; it runs by default for regulatory_qa and foresight.~~ **Done 2026-09-24 (row D3, `…01J935DZ`; claimed only when filed — recorded, not hidden):** worse than stated, and one level up. The RAG pipeline wrote its *caller's* `organizationUuid` into `app.current_org_id`, the GUC vault RLS reads, and used it as the vault arm's predicate too, so a caller passing another tenant's uuid read that tenant's vault **with RLS enforcing** (shown as `app_service`). `advancedRAGPipeline.ts` now refuses, inside a tenant scope, a uuid or org id that is not the session's, also when the scope carries no uuid. The context-expansion query's RLS is now keyed on the session, so it gets no predicate of its own. System scope still trusts its caller. This also closes the `ana-features.ts` `/citations/run` question below for request-scoped callers. Evidence: `docs/evidence/D3/2026-09-24-rag-pipeline-tenant/`.
- ~~Authoring file-to-vault (`e0f99d3c`) writes `vault.documents` without `requireEditorAccess`: a viewer can write.~~ **Closed 2026-09-24 by the client-files lane** at the shared service (same evidence as above): the viewer is refused 403 at ingest, after a render that writes nothing. The route itself still has no gate of its own; adding `requireEditorAccess` there would refuse earlier, and that is the authoring lane's call.

**→ `…01KiDof7` (and the AnA client-files lane `…01DiJJAk`) — four Vault/catalog suites red since `9d2134b52` (found by `…01J935DZ`, 2026-09-29, on a database provisioned from empty at `8b9d18c6d`)**
- `tests/db/document-catalog.dbtest.ts` (5), `document-catalog-recall.dbtest.ts` (2), `vault-placement.dbtest.ts` (3) and `document-catalog-role.dbtest.ts` (2) answer *"Insufficient permissions: this change needs an editor role in this organization. Nothing was changed."* where the case expects success. `9d2134b52` ("one shared editor-role decision") made AnA's governed tools (`AnaToolExecutor.ts` → `services/part11/editor-role.ts`) read the role live from `organization_users`; these suites give their actor a role only in the tenant scope (`runWithTenantScope({ role })`) and write no membership row, so the live read finds none. The live read is the stronger rule and not in question; the suites need a membership row carrying the role they put in the scope. Not edited here (two other lanes' files). Also red on that database, unrelated: `server/services/ana/__tests__/run-control-cross-instance.dbtest.ts` (1, a steer drained twice). The whole `tests/db` tier there: 798/811.
- **Done 2026-09-29 by `…01DiJJAk`.** Each suite's actor now has an `organization_users` row with the role its case puts in the scope. The viewer cases assert the dispatch's refusal, and the record stays untouched with no filing audit; the service's own refusals remain pinned by the direct `place(...)` cases. `run-control-cross-instance` expected the drain's pre-`eeedc6231` string shape, where each entry is now `{ kind, text }`; the assertion now matches that. The whole tier on a from-blank database, as `app_service` with RLS enforcing: 814 passed. `vault-passage-search` (and the VR-06 test) now also remove the `doc_rp_…` document each deploy's `20260529_phase9_backfill.sql` gives a probe program an interrupted run left behind, so a local re-run recovers.

**→ `…01LjrcEe` / `…01TtwRHm` (D7)**
- Vault leaves are exempt from the approval ('finalized') transmit gate: an unapproved upload can be placed and transmitted.
- AnA `place_into_sequence` cannot file a vault document, and its description says vault is unmaterializable.
- Two vault byte readers: the eCTD resolver reads through the provider only; `readVerifiedVaultBytes` falls back to the legacy path.

**→ W2 (D1)**
- The in-repo production deployment writes vault bytes to per-task ephemeral disk: two Fargate tasks, no `STORAGE_PROVIDER`, no vault bucket, and the deploy preflight does not require one. An unrecognised `STORAGE_PROVIDER` value falls back to local silently.
- `S3StorageProvider.get` cannot find objects past the first 1000 keys.
- The byte reader ignores the recorded provider; there is no local-to-S3 migration path, and `scripts/backfill-vault-storage.mjs` (runnable since `eaedc4d1`) is not in the production image.
  - **Done 2026-09-24 (`…01AiwZKG`):** `readVerifiedVaultBytes` (download and eSTAR) and the eCTD resolver's vault branch open the store the row recorded. A `local` row is served while S3 is configured, another org is still refused, and an unimplemented or unopenable recorded store is `STORED_FILE_UNREADABLE`, without asking the configured store (`docs/evidence/W2/2026-09-24-vault-storage/`, R6). The spec, as left:
  - *From `…01KnUGoX`, which wrote a red test for this, then withdrew it on seeing the claim above:* mint with the real `LocalStorageProvider`, set `STORAGE_PROVIDER=s3` with no bucket (the S3 provider cannot even be built), and `readVerifiedVaultBytes` on a row recorded `local` answers `STORED_FILE_MISSING`. It should serve the bytes, still refuse another org, and refuse a recorded name this server does not implement rather than ask the configured store. The readers of a `vault.documents` row are `readVerifiedVaultBytes` (the download route and `estar-attachment-plan.ts`) and the vault branch of `leaf-source-resolver.ts`; none selects `storage_provider` today. **Not solvable from the row:** `rendered_leaf_files` and the AI-action handlers (`ocr-extract-text`, `extract-template-from-upload`) hold a bare version id with no recorded provider at all.

**→ tenant offboarding (D6)** — **four of these done 2026-09-24 (`…01AiwZKG`, `docs/evidence/D6/2026-09-24-purge/`): the Pool transaction, the truncated export, the legal hold, and the stored bytes. Still open: the data return carries no document bytes.** Originally: see `docs/evidence/D6-EXPORT-COVERS-PURGE/2026-09-24/` §"Not done": the purge erases vault records and chunks but not the stored object bytes (its own "HONEST SCOPE" comment says so; the assessment had marked this CLOSED), the purge's transaction runs on a Pool, a truncated export authorizes a full purge, no legal hold is consulted, the return carries no document bytes. Legal holds cannot be placed or lifted through the product at all, and retention destruction is audited to a local file, not the Part 11 chain.

**→ Retrieval, unclaimed (D2 / D4) — found by the cortex tenant-key lane (`…01J935DZ`), not edited**
- ~~`search_atoms_hybrid` cannot return a row on any installation built from empty:~~ **Done 2026-09-24 (`…01AiwZKG`, evidence `docs/evidence/D4/2026-09-24-atom-search/`):** two type casts in the creating migration, amended in place; a second mismatch (`real` keyword score) was found behind the first. Original finding: it declares `structured_data jsonb`, `lumen_data_atoms.structured_data` is `json`, and every call fails — even on an empty table — *"Returned type json does not match expected type jsonb in column 5"* (`docs/evidence/D3/2026-09-24-cortex-tenant-header/red/search_atoms_hybrid-type-mismatch.txt`). Callers on launch paths: Authoring's AI draft (`authoring.router.ts`, which reports it honestly as `retrievalStatus: 'failed'` — so every draft is ungrounded), AnA chat (`chat/send-message.ts`), `c2c/ai-editing.ts`, `evidence-ask.ts`, `deep-research.ts`, `advancedRAGPipeline.ts`. Creators: `db/migrations/20260730_fix_atom_embedding_dimension.sql`, `20260125_add_atom_embeddings.sql` (Rule 1: amend in place, dated note).
- ~~`enhancedEmbeddingService.searchHybrid` passes that function's arguments out of order:~~ **Done, same change:** arguments in their declared positions, `match_count` sent, and the org/project filter moved INTO the function (`filter_atom_ids`); filtering its top rows afterwards returned a project nothing. Original finding: the org branch sends the result limit as `keyword_weight`, the no-org branch sends it as `semantic_weight`. Ranking, not isolation; only observable once the item above is fixed.
- `chat/send-message.ts` falls back to the client's `x-org-uuid` header exactly as the cortex route did (also noted by the D4 passage-search lane). **Corrected same day: NOT contained.** Its tool uuid reaches `search_document_passages` → the RAG pipeline, which wrote it into the vault's RLS GUC, so a header naming another tenant read that tenant's vault with RLS enforcing (shown at the pipeline, `docs/evidence/D3/2026-09-24-rag-pipeline-tenant/`). The pipeline now refuses a uuid that is not the session's, which closes this for every caller; the fallback itself is still the chat lane's to remove.

**→ D3 — `organizations` writes (from `…01J935DZ`, 2026-09-25)** — ~~handed on~~ **done 2026-09-26** by the same session; evidence `docs/evidence/D3/2026-09-26-organizations-writes/`.
- ~~`public.organization_users` has no RLS at all.~~ **Done 2026-09-26** (`…01J935DZ`, evidence `docs/evidence/D3/2026-09-26-memberships/`).
- ~~**Open (D2/D3): accepting an invitation to another organization is broken under enforcement, before and after that change.**~~ **Done 2026-09-28** (`…01YZFCXR`, evidence `docs/evidence/D3/2026-09-28-invitation-acceptance/`): a definer lookup narrowed to members of the calling scope's organization, then accept/decline in the inviting organization's scope. Originally: `organization_invitations` carries the FORCEd `tenant_isolation_policy`, so an invitee whose session is in X cannot read an invitation to Y (404). Needs a decision on how an invitee reads an invitation across tenants (a narrow definer lookup by token, or the platform scope for that one read).
- **For the D6 password lane (`dd6632dd`): two fixture passwords are now refused** as built from the account's own words — `tests/db/signup-launch-catalog.dbtest.ts` (7 cases, a D2 contract, red since) and `tests/db/one-time-credentials.dbtest.ts` (1). Not edited here.
- ~~**→ D3, unclaimed — `public.users` is readable from any tenant scope** (from `…013CtPf8`, 2026-09-26).~~ **Done 2026-09-28** (`…01YZFCXR`, evidence `docs/evidence/D3/2026-09-28-users-rls/`): RLS + FORCE on `public.users` (`migrations/20260928_users_membership_rls.sql`) — a tenant scope reaches only users with a membership in its organization; the pre-auth and system scopes keep the table; INSERT from any scope; `user_id_for_email()` (id only) for tenant-users' existing-account check. The `rls-coverage-check.sql` carve-out is removed, not reworded.
  - **→ D3 / product — actor names outside the organization render null.** Claimed 2026-09-29 (`…01YZFCXR`, row above; ledger done). Display joins (`LEFT JOIN users` for an actor's name: audit-trail ledger, project owners, review assignees, `regulatory-programs.service.ts`, `ApprovalOrchestrator.ts`) now show no name for a former member or platform staff; `actor_id` is intact. Decide: snapshot the actor's name on the audit row, or an id→name resolver limited to actors of the tenant's own records. Not a cross-tenant `users` read.
  - ~~**→ D3 — `platform_role_grants` writable from any tenant scope.**~~ **Done 2026-09-28** (`…01YZFCXR`, evidence `docs/evidence/D3/2026-09-28-platform-role-grants/`): a member's scope wrote itself `super_admin` and the Access Management console admitted it (200); now RLS + FORCE, reads open, writes platform scope only.
  - ~~**→ D3 — `public.users`' other children carry no RLS.**~~ **Measured 2026-09-28** (`…01YZFCXR`): `drafting_tasks` was tenant content keyed by program, not user — **done**, scoped to its program (`docs/evidence/D3/2026-09-28-drafting-tasks/`). `user_presence` has no reader or writer anywhere in `server/`, `client/src/` or `scripts/` and 0 rows: nothing exposed today; **→ its first writer brings a policy.** `notification_preferences` is read and written only by `/api/users` (pre-auth mount, keyed by the verified token's user) and holds booleans, quiet hours and a time zone: recorded, not policied.
  - ~~**→ D3 — the pre-auth scope still reads every account.**~~ **Mapped and the steerable handler fixed 2026-09-29** (`…01YZFCXR`, `docs/evidence/D3/2026-09-29-pre-auth-scope/`): no pre-auth handler can now be steered by request input to another user's row. **→ D3, unclaimed:** the structural narrowing (each pre-auth statement behind a function answering only what that step needs: by email, token hash or signed id), about 25 statements in `routes/auth.ts`, `routes/authEnterprise.ts` and three services; it would stop a future steerable handler at the database.
  - **→ platform routes, unclaimed (not D3):** `GET /api/user/:id` (users.ts, registered first) captures `GET /api/user/preferences`; `notification_routes.ts:163` never runs.

**→ Projects, unclaimed (D2)**
- ProjectHome's "Dossier readiness" ring always shows 0%, contradicting the Projects list; the numeric readiness engine queries a column that does not exist. **Claimed 2026-09-24 by `…session_01KnUGoX3g4R4FWKWGc2sTbN` (row D2)**: the ring first (`server/routes/c2c/projects.ts` detail read, `ProjectHome.tsx`), then the engine's `project_id` query. Evidence `docs/evidence/D2-PROJECT-READINESS/2026-09-24/`. **Ring: done** (`61a7221d`). **Engine: deliberately NOT fixed; this needs a decision.** The missing column is what keeps an invented figure dark. With no twin assessment, `computeReadinessScore` scores consistency as the constant `70` and quality and compliance by heuristics (`estimateQuality`: 65 ± profile counts; `estimateCompliance`: 80 − risks). A program with no documents would read about 46. Today every call throws 42703 and all nine callers get null or an error (project-home, AnA context enrichment and orchestrator, next-best-action, RIM, intelligence routes ×2, AI editing ×2). Fix the query alone and they all publish that number. Before the query is fixed, the engine must either (a) report each dimension as null when not assessed, with no overall score unless every dimension has a real input, or (b) be retired in favour of the canonical readiness (`readinessByProject` / `readinessEvaluator`, which already says `assessed: false`). That is the re-baseline's "readiness built three times, all disagree", and it belongs to whoever owns project intelligence, or to the founder. Also in that function: `program_milestones.id` is a uuid mapped through `Number()`, so every overdue-milestone gap would carry NaN. The correct join, when it is time, is `projects.regulatory_program_id` (the anchor, `services/c2c/program-project-anchor.ts`). `recommendation-engine.ts:231-237` has the same query; its generator fails, is logged and skipped, and `program_milestones` has no writer, so it produces nothing either way.
- Two task stores: tasks from AnA, agency communications and the schedule never reach the task board. The Blocked tile and the Blocked/Complete filters are always empty, and AnA is told "0 blocked".
  - **Measured at HEAD 2026-09-29 (`…01E2moDu`), not changed:** more than two stores. The board (`/api/task-management/board`, `server/routes/taskBoard.routes.ts`) reads `unified_tasks` only. Its own Blocked and Done columns work (`status 'blocked'` and dependency-blocking; `'completed'`). What never arrives: schedule-of-events tasks, Communication Center tasks and the c2c task API (all `project_tasks`, `'todo'…'done'`); agency correspondence (`c2c_project_work_items`, `open…closed`, no `blocked`). Only AnA's `create_task` is mirrored into `unified_tasks`. `server/services/unified-work/unified-work-view.ts` already merges all of these with per-store status maps, but only the MDx workbench reads it (`/api/submission-ops/unified-work`). Separately, `server/services/orchestration/cross-object-resolver.ts:189-192` hardcodes `totalTasks`/`blockedTasks`/`overdueTasks` to 0, and its `resolveTasks` reads `regulatory_audit_logs WHERE entity_type='task'`, which no writer found produces. That feeds the readiness and recommendation engines in AnA's context. Detail: `docs/evidence/D2/2026-09-29-correspondence-work-items/README.md`.
- ~~**→ D2, unclaimed — the correspondence intake is not atomic**~~ **Done 2026-09-30** (`…01E2moDu`, same evidence folder, "Follow-up"): one transaction on one client for the letter, its issues, blockers, work items and timeline event; red 2/7 (a failed intake left the letter with issue 1; the retry recorded it twice) → green 7/7, also from empty. Original finding (2026-09-29): `POST /api/regulatory-correspondence/correspondence/intake` writes the letter, each issue, each issue's blocker and work item, the timeline event and a project-memory entry one statement at a time, through both the shared `db` and `pool.query`. A failure after the first write leaves a letter holding only some of its issues, and a retry records the letter again. The fix passes one transaction through `computeCorrespondenceIssueImpact`, `createCanonicalTasksForIssue` and `addTimelineEventDB`. Proof harness: `tests/db/correspondence-work-items.dbtest.ts`.
- ~~The portfolio is cut off at 50 programs without saying so~~ **Done 2026-09-24 by `…01KnUGoX`**: the count reads "50+", a note says what the figures cover, and AnA is told (`docs/evidence/D2-PROJECTS-PORTFOLIO/2026-09-24/`). Loading the rest is not done. ~~The TaskBoard critical-path view claims a calculation it does not perform.~~ **Done 2026-09-24 by `…01KnUGoX`**: the header says the tasks are hand-marked and shown in dependency order (`docs/evidence/D2-TASKBOARD-CRITICAL-PATH/2026-09-24/`).

**→ Data room — founder decisions first (see the assessment §5 Data room)**
- Under production RLS the client portal cannot serve any principal outside the owning tenant, so a grant INSERT alone would not make the external path work; no code path places a program into a client workspace; the org default workspace is not excluded from portal scope; portal deliverables read `public.documents`, not the vault.

### Found by the WO-16C audit-outcome lane (`…01E8btkB`) — not fixed, handed on

Full record: `docs/evidence/D5-AUDIT-OUTCOMES/2026-09-24/README.md`.

1. ~~**D5 tasks lane:** AnA's `create_task` / `update_task`~~ **Done 2026-09-24 (`…01AiwZKG`, `docs/evidence/D5/2026-09-24-ana-task-ledger/`):** the board write and its lineage row share one transaction, and AnA's result says when the board was not written. Originally: AnA's `create_task` / `update_task`
   (`server/services/ana-ri/command-executor.ts` ~1021, ~1302) mirror a row
   into `unified_tasks`, then write the `task.create` / `task.transition`
   ledger row best-effort, outside any transaction. Every other task write now
   commits its row on the write's transaction (`auditTaskActionInTx`).
2. ~~**Whoever next edits `AnaToolExecutor.ts`:**~~ **Done 2026-09-25 (`…01AiwZKG`, `docs/evidence/D5/2026-09-25-ana-governed-tool-audit-outcome/`):** the three change-control tools and both governed-fact tools carry `auditTrail`, and say when the row was not written. The orchestrator now returns it, so `routes/change-propagation.ts` answers it too. The consistency check is done too: the route keeps its array body and reports the row in the `X-Audit-Row-*` headers, and the tool passes `auditTrail` on. Originally: QMS change control (×3,
   launch-app) discards its audit outcome. `apply_fact_change`,
   `establish_governed_fact` and `check_consistency` copy chosen result fields,
   so an outcome their services carry would be dropped at the tool.
   `run_shadow_review` spreads its result and already carries `auditTrail`.
3. ~~**eCTD callers:**~~ **Done 2026-09-24 (`…01AiwZKG`, `docs/evidence/D5/2026-09-24-assemble-audit-outcome/`):** the assemble route returns `auditTrail`, and a refusal is 422 `ECTD_ASSEMBLE_BLOCKED` with its record (it was 500). **Still open** (an earlier line here wrongly said they do not call it): `submission-service/submission-service.ts:844` (freeze/dispatch pre-check) and `:1312` (transmit), which receive the outcome and do not answer it. (`routes/ectd-compile.ts:976` also calls it and has answered it since `1c6f56e31`.) `ectd-export.ts` does not call it. Originally: `assembleSequence` now returns `auditTrail`.
   `routes/submissions.ts` and `submission-service.ts` receive it and do not
   answer it. (`routes/ectd-export.ts` does, since 2026-09-25, as headers via
   the canonical `setAuditRowHeaders`. The inline pair in `submissions.ts`
   ~965 is the last hand-written copy of that helper.)
4. **QMS owner:** `server/routes/qms.ts` is a second QMS document-control API
   (create, transition) that no client calls. The launch QMS surfaces use
   `/api/mdx/qms/*` and `/api/quality`.
   **2026-09-25: this is also a security finding, DP-34**
   (`docs/security/SECURITY_AUDIT_2026-09-24.md` §4.5, plan P1-31).
   - Its only guard is `authenticateToken`.
   - A `viewer` can retire or supersede an effective SOP, requalify or revoke a
     supplier, and disposition nonconforming product.
   - Most of those writes record no audit row.
   - Every capability has an audited twin on `/api/mdx/qms/*`.
   - Deleting it was attempted in the review session and stopped at a permission
     check. It waits on the founder.
   **Done 2026-10-01 (`…015oLV2v`, on the founder's authority):** the router
   and its only service are deleted and unmounted, and the three baselines that
   named them have shrunk. `qms-effective-only-by-signature.test.ts` now proves
   the door stays gone. See the commit naming DP-34.
5. **W1 / D2 (launch catalog):** launch scope is enforced in navigation only.
   `applyLaunchScope` locks the rail, the Apps catalog and deep links. The one
   API-level check, `server/middleware/moduleEntitlementGate.ts`, never reads
   launch scope. It defaults to `MODULE_ENFORCEMENT=off` (`.env.example:369`,
   `enforcement-mode.ts:142`), and even in `enforce` a path that no
   `UI_SURFACES[].apiPrefixes` entry names passes untouched
   (`if (!modules || modules.size === 0) return next()`). The measurement in
   `docs/evidence/D5-AUDIT-OUTCOMES/2026-09-24/launch-path-classification.json`
   found 118 audited write sites reachable only as API or from non-launch
   surfaces, among them the whole legacy `/api/concept2cure/*` namespace, which
   no `apiPrefixes` entry names. D2 reads "every other surface behind a flag
   that is off in production". Whether that covers the API is the row owner's
   call. As built, a signed-in organisation in production can call every one of
   those write routes. **Claimed and done 2026-09-25 by this lane** (row D2 / D6
   above). Stages 1–3; the production default awaits the owner.
6. **AnA lane (`…01DiJJAk` / whoever next edits `AnaToolExecutor.ts`):** the
   IND tools `ind_generate_section` and `ind_get_status` call
   `http://localhost:$PORT/api/ind-generation/...` with no credentials. The
   `/api` auth boundary enforces in production, so both get 401 there, every
   time, and the tool returns that body as its result. Found by the D2 stage-3
   route inventory (`docs/evidence/D2-API-SCOPE/2026-09-25/`); not edited here.
   Calling the service in-process is likely the fix; adding credentials to a
   self-call would be the wrong one.
7. **For `…01T2wooC` (holds `ana-realtime.ts` until 2026-09-27 04:43 UTC, 24h after `f7597c2c9`):**
   the socket `/ana` turn runner (`ana-realtime.ts:123`, `runAgenticTurn`)
   offers `selectToolsForTurn(getAllEnabledTools(), …)` directly. It skips
   `governedToolsetFor`, so a tool the tenant denied in
   `anaToolPolicy.deny` is still offered on that door. The parity test
   (`chat-path-parity.test.ts`) lists only three doors, so it does not see
   this one. The fix is to compose through `governedToolsetFor`, as the other
   three doors do, and add the file to the parity test. Found by the D2 AnA
   launch-scope measurement; not edited here.

### Found by the weekly review's second pass (`…015oLV2v`, 2026-09-25) — handed on

Full record: `docs/evidence/reviews/2026-09-24/lenses.md`.

1. ~~**Auth owner (D6), then Tasks (T2's UI half).**~~ **Done 2026-10-01 (`…015oLV2v`), in the commit naming T2:**
   - Every auth response that returns a user carries `governed:write`, derived
     by `sessionPermissions` from `GOVERNED_WRITE_ROLES`.
   - A test holds that permission equal to `requireEditorAccess` for every role.
   - The task board withholds its write controls without it.

   Originally: the server refuses a `viewer`
   on every task write (`requireEditorAccess`). The task board still offers the
   viewer *New task*, *Start workflow*, move, archive and sign, and refuses only
   after the click (`TaskBoard.tsx:745-746,895-896`). The client cannot tell
   who may write:
   - `GET /api/v1/auth/session` answers `roles: ['user']` for a viewer and a
     member alike (`server/routes/auth.ts`, `sessionRoles`).
   - It answers `permissions: []` for everyone.
   - Proposal: the session derives one permission from the server's own
     `GOVERNED_WRITE_ROLES` (`orgMembership.ts:473`), for example
     `governed:write`, so the client mirrors no role list.
   - The board then hides or disables its write controls without it.
   - Not taken tonight because `auth.ts` is in the D6 session's active lane.
2. ~~**Founder: DP-35.**~~ **Decided and done 2026-10-01 (`…015oLV2v`, on the founder's authority), in the commit naming DP-35:** a freeze stays a content lock; an unsigned freeze counts as neither approved (the eCTD resolver refuses to transmit it) nor complete (IND checklist and NDA cockpit show it as "frozen, not approved"). Originally: Authoring freeze needs no re-authentication and no
   signing authority. It counts as `finalized` for eCTD leaf completeness and
   as COMPLETE on the IND checklist. `ind-checklist-view-assembler.ts:71-79`
   already leaves "should an unsigned freeze count as complete" open. Plan row
   P1-32.
3. **Design-system session.**
   `client/src/concept2cure/v2/__tests__/documentCanvasPolish.test.tsx` has
   been red since the motion-token change (`92d0fe0b`). Its ease-out check
   reads `transform var(--dur) var(--ease)` as "not ease-out", because it
   does not resolve the token.

### Found by the IND eCTD demo lane (`…01TtwRHm`) — not fixed, not this lane's to decide

1. **Two go/no-go gates disagree about a clinical hold.** `ind-lifecycle/ind-dispatch-gate.ts`
   hard-blocks on any open critical action, a 21 CFR 312.42 hold included;
   `ectd/dispatch-gate.ts`, which `assess-dispatch-readiness` composes and the governed
   freeze/dispatch transition enforces, has no hold check. Its header calls the first
   gate "complementary", so two gates is deliberate — the disagreement is not. Do NOT
   simply copy the hold into the second gate: during a hold the sponsor must still be
   able to send the complete response that lifts it (312.42(e)), so a blanket refusal
   is its own defect. Product decision for JM (it is Click 5 of the demo). Session
   `…015weqdG` is doing unclaimed work beside this (`50e78caa4`, `3c101fc96`).
2. ~~**A same-named `normalizeCtdCode` with a different contract.**~~ **Done 2026-09-24 (`…01AiwZKG`):** the `ind/ctd` copy is `ctdGuidanceKey` (a lookup key, and says so), the registry no longer re-exports it, and `tests/schema-contract/one-normalize-ctd-code.contract.test.ts` refuses any other definition or a re-export not from the shared module (red 2/2 before, green after). Of the two private copies, `ich-headings.ts` no longer exists. `dispatch-readiness.ts`'s `normalizeCode` is a differently named private comparison key inside the dispatch gate; changing what the gate compares is the package-spine lane's call. Originally:
   `server/services/ind/ctd/index.ts:41` (re-exported at `ind-section-registry.ts:404`)
   returns a string for `m1/us/1.2`, where `shared/regulatory/section-code.ts` returns
   null — the exact input the `upsertLeaf` gate exists to refuse. An import resolved by
   autocomplete reopens that gate. Two more private copies:
   `ectd-packager/ich-headings.ts:160` and `ectd/dispatch-readiness.ts:162` (which
   lower-cases where the shared one upper-cases).
3. ~~**The BX-204 dossier-map seed files three of its four Module 1 rows under codes
   that mean something else**~~ **Done 2026-09-24 (`…01AiwZKG`):** Draft Labeling is `m1.14.1.3`, Meeting Materials `m1.6.2`, Financial Disclosure `m1.3.4`, each read from `CV_CONTEXT_OF_USE`. The seed deletes the three misfiled `(code, title)` rows for its own project before inserting, so a database seeded before the fix is corrected on reseed, not only a fresh one (checked on a local database with the old rows planted: re-seed leaves `m1.1`, `m1.14.1.3`, `m1.3.4`, `m1.6.2`, once each). `tests/schema-contract/dossier-map-seed-module1-codes.contract.test.ts` requires every Module 1 row's code to exist in the FDA table and its FDA meaning to match the title (red 3/5 before, green 5/5 after). Originally: (`scripts/seed/ga-demo.d/105-dossier-map.mjs:30-33`,
   checked against the vendored FDA table `controlled-vocab/cv-v4-data.ts`): Draft
   Labeling at `m1.3.1` (FDA: 1.14.1.x), Meeting Materials at `m1.14.1` (FDA: 1.6.x),
   Financial Disclosure at `m1.12.4` (FDA: 1.3.4; FDA's 1.12.4 is "request for comments
   and advice"). It is a BLA, not on the IND demo path. `ON CONFLICT DO NOTHING` means a
   corrected code reaches only a freshly seeded database.

### Handed to the W2 schema-guards lane (`…01KiDof7`) — found by `…01E2moDu`, not edited

`ci:unbacked-tables`, `ci:column-reachability` and `ci:migration-reachability`
each count **runtime DDL in server code** as a way a table gets created. On
production's connection it creates nothing. PostgreSQL refuses `CREATE … IF NOT
EXISTS` to the non-owner runtime role **even when the object exists**, because it
checks privilege first. That is how `license_requests` passed `ci:unbacked-tables`
while no provisioned database had it, and lost every enterprise onboarding
request in production. It is fixed now.

New runtime DDL is now blocked at the source by `ci:runtime-ddl` (pre-push and CI,
with a self-test). What those three guards still accept as created is the 14
baselined files in `scripts/ci/runtime-ddl-baseline.json`. Whether to stop
counting them is your call: doing so surfaces the latent EULA and `ai_feedback`
tables as unbacked. Evidence: `docs/evidence/W1/2026-09-24-launch-reach/`.

### Handed on by the install child-scope change (`…01AiwZKG`), not edited

1. ~~**To the D3 lane: a blank database's first deploy leaves
   `regulatory_harmonization.export_job_audit_log` unscoped (L203's table).**~~ **Done 2026-09-29** (`…01YZFCXR`, `docs/evidence/D3/2026-09-29-child-scope-first-deploy/`): the child scope runs in the isolation tail, and CI checks coverage after the first deploy. Originally: The
   set creates its parent `export_jobs`, and the uuid half of the final sweep
   pair policies it. The child scope runs before that pair, logs "the parent is
   not scoped … skipping", and so the child is scoped only on the second deploy.
   The installer cannot close this, because the table does not exist at install
   time. CI cannot see it: its coverage step runs after the idempotency re-run.
   A coverage check between CI's first and second `deploy-migrate` would catch
   this case and the whole class. Measured: after install, 0 rows; after one
   deploy, this 1; after two, 0.
   Re-measured 2026-09-28 on a blank database with the `users` and
   `platform_role_grants` policies in the set (`…01YZFCXR`,
   `docs/evidence/D3/2026-09-28-drafting-tasks/green/from-blank.txt`): unchanged,
   the same 1 row after one deploy and 0 after two. `tests/db` does not see it:
   `child-table-parent-scoped-rls.dbtest.ts` re-applies the child-scope file to
   the live schema, which heals the table before any later check reads it.
2. **To the W2 schema-guards lane: the same shape in
   `20260828_drop_orphaned_org_guc_policies.sql`.** It drops an orphaned
   `*_org_policy` only where `tenant_isolation_policy` already exists, and on
   four of its five tables the final sweep adds that policy later in the same
   set. The first deploy logs "keeping … canonical tenant_isolation_policy is
   absent" four times, and the second drops all five. The policies are inert,
   so this widens nothing, but the empty-string cast the file exists to defuse
   stays armed until the second deploy.
3. ~~**To the audit-trail lane (unclaimed): the system audit chain forked once in
   four full real-database runs.**~~ **Done 2026-09-24 (`…01AiwZKG`, `docs/evidence/D5/2026-09-24-audit-chain-search-path/`):** the writer asked `current_schema()` whether `audit_logs.chain_seq` existed. `master-licensing-console.dbtest.ts` puts a private schema first on its runtime role's search_path, so the writer fell back to `occurred_at` order and chained row 45 to 43. It now asks about `to_regclass('audit_logs')`. `chain-concurrency.dbtest.ts` case 4 is red without the fix and green with it. The full suite is 684/684 with 0 fallback warnings (every earlier run printed one). Originally: Tenant 0's `audit_logs` rows `chain_seq` 44
   (`user_password_reset_failed`, 20:43:00) and 45 (`module_packaging`, 20:43:11,
   the first `licensing-history` write) both commit to 43, so
   `verifyAuditChain({tenantId: 0})` reports broken and
   `tests/db/licensing-history.dbtest.ts` fails its three integrity cases.
   `chain_seq` is a global sequence, so 44 was inserted first. Both writers use
   `auditService.logAction` (`BEGIN`, per-tenant advisory lock, head read,
   insert, `COMMIT`), and the policy is all-or-nothing per tenant. So either
   the writers did not take the same lock, or row 44's transaction stayed open
   past row 45's head read. The run shared the CPU with a second database
   install. The schemas were identical to the passing runs (`pg_dump -s`). A
   forked chain is a Part 11 §11.10(e) finding, not a flake. Evidence:
   `docs/evidence/W2/2026-09-24-install-child-scope/README.md`.
4. ~~**To the D3 lane: `atom-search` is green.**~~ **Recorded 2026-09-29** (`…01YZFCXR`): confirmed 5/5; L201–L202 carry dated corrections. L201 and L202 report 53/54 and
   656/661, with `tests/db/atom-search.dbtest.ts` failing on "the pre-existing
   `search_atoms_hybrid` defect". That was fixed in `881680d73`, an ancestor of
   both commits. On a database built from blank at trunk it passes 5/5. The
   database behind those numbers predates the fix. A from-blank rebuild would
   also have shown the installer failure above.

### Handed to the AnA / council lane (`…01DiJJAk`) — found, not fixed, by the schema-authority lane

Two findings surfaced inside that lane's files. Reported rather than edited,
per the claim above. **Neither is a regression from the reporting lane's work.**

1. **`ana_runs` does not exist on a provisioned database.**
   `server/services/ana/run-control.ts` queries it; it arrived with AnA commit
   `45748a8f5` and nothing creates it in any lineage. This makes
   `ci:tables-live-schema` **red on clean trunk**. It was deliberately NOT
   added to `scripts/ci/tables-live-schema-baseline.json`: that file's own
   comment says *"Re-running `--baseline` to make a failure go away converts a
   caught defect into an accepted one."* The fix is a migration in
   `C2C_MIGRATION_FILES`, not a baseline entry.

2. **`lumen.data_atoms` is read by live code and written by nothing.**
   `server/services/multi-agent-council.ts:864,1070` and
   `server/services/innovation/auto-traceability-service.ts:371` SELECT from
   the schema-qualified `lumen.data_atoms`. Every live INSERT
   (`routes/chat/upload.ts`, `routes/c2c/artifacts.ts`,
   `routes/c2c/knowledge-sources.ts`, `routes/cortexAdvisoryRoutes.ts`,
   `services/projects/contextual-ingest.ts`,
   `services/clinical-regulatory-evidence/retrieval-atoms.service.ts`) targets
   **`lumen_data_atoms`** — a different, public-schema table. Reads and writes
   have been aimed at two different relations.

   This split **predates** the 2026-09-18 deletion of
   `server/workers/enhanced-ingestion-pipeline.ts` and was not caused by it.
   That file was the only writer of the schema-qualified table, but nothing
   imported it, so it never ran: those reads already returned nothing. Deleting
   it removed the *appearance* of a writer, not a writer. Deciding which
   relation is canonical is a council-lane call.

**Cleared from another lane (2026-09-19):** the 16 dead symbols reported here on
2026-09-17 — unused imports and destructurings in
`client/src/concept2cure/v2/surfaces/AuthoringPlaceIntoFiling.tsx` and
`server/services/workflow/DecisionLineageService.ts` — were still there a day
later with the files untouched since, so they were deleted rather than left to
block the ratchet for whoever added the next legitimate warning. Nothing but
dead symbols was touched; both files' suites pass. Baseline relocked at 6522.

**Ratchet debt absorbed from other lanes (2026-09-19, third time):** four more
warnings arrived on trunk from lanes that pushed them, each one blocking every
other lane's next push until somebody paid it. Cleared in place, semantics
untouched, suites green:

| File | What | Why it was fixed here |
|---|---|---|
| `server/services/ana/__tests__/run-control.pglite.integration.test.ts` | 103-line describe | Fixture builder hoisted (splitting broke five cases). The owning lane landed the same fix independently; the merge took theirs. |
| `server/services/ana/__tests__/verified-seal-service.test.ts` | 102-line describe | Split at the E11 binding cases — 11 tests still pass. |
| `tests/resolution/bundle-execution.test.ts` | mock query chain at complexity 16 | Three `document_span_lineage` branches extracted to `spanLineageAnswer` — 18 tests still pass. |

The pattern is worth naming: a warning added in one lane is invisible to the
lane that added it (the pre-push hook does not run the ratchet; CI does) and
costs the NEXT lane to push a diagnostic round each time. Running
`npm run ci:eslint-ratchet` before you push keeps it in the lane that created it.

**Typecheck on trunk, eSTAR lane (2026-09-19):** `4cf0a8a6b` made
`EstarFilingPanel`'s `programId` required — deliberately, so the compiler
catches a surface that forgets and silently reads org-wide content — and left
one call site behind in its own render test, so `ci:typecheck:no-regression`
was red on trunk (baseline 0, found 1). Fixed in both lanes within minutes of
each other; the merge kept that lane's version, which carries the better
comment. No action needed — recorded because the required prop did exactly what
its docblock said it would, and the gap was only the last call site.

**Two new pre-push gates (2026-09-19) — both added after they caught a real
defect, one of them mine:**

- `ci:untracked-imports` — a pushed file must not import a module git does not
  have. An unanchored `uploads/` in `.gitignore` (meant for the runtime
  directory at the repo root) silently excluded `server/services/uploads/`, so
  a commit shipped a route importing a file that was not in the repository and
  trunk was unbuildable. Nothing local could see it: typecheck, 6,117 unit
  tests and the dbtests all read the WORKING TREE, and `git add -A` printing
  nothing is byte-identical to success. The gate reads the INDEX. `/tmp/`,
  `/uploads/`, `/logs/` are now anchored; `data/logs/` is listed explicitly
  because the unanchored form was genuinely covering it.
  Repo-wide (`--all`) it also reports **21 pre-existing broken relative
  imports**, mostly in `db/migrations/_consolidated/*.ts` importing
  `../server/db` from a path where that does not resolve. Left alone: the gate
  is scoped to what a push changes, so no lane inherits the backlog. If those
  files are dead, deleting them clears it.
- `ci:pushed-lint-errors` — ESLint ERRORS in the pushed files only, ~1.4s. The
  warning ratchet is not on this hook (minutes on 1,790 files) and deliberately
  ignores errors, so until now **nothing ran ESLint before a push**.

Both are scoped to the diff against the upstream ref, so they hold a lane to its
own code. Both fail closed on an ESLint crash or an unreadable index.

**For the model-governance lane (2026-09-24) — the free-text classifier cannot see most field names:**
`server/services/ana/governed-write-tools.ts` finds tools that store model-written
text with `FREE_TEXT_FIELD`, a fixed list of whole property names (`content`,
`body`, … `summary_text`). `catalog_project_document` writes `summary`,
`purpose`, `document_kind` and `key_data`; `place_project_document` writes
`rationale` into a Part 11 row. Neither name is on the list, so both come back
with no free-text fields, sit in neither `GOVERNED_CONTENT_WRITE_TOOLS` nor
`FREE_TEXT_NON_GOVERNED_TOOLS`, and the approved-model gate never applies. The
test that should catch it — "every tool with a free-text input is classified"
(`governed-write-gate.test.ts`) — draws its population from the same regex, so
it can only fail for a name already on the list. Widening the regex by
`summary|purpose|rationale|document_kind` alone surfaces 12 unclassified tools
(reproduced in a scratch probe, 2026-09-24). The fix is the classifier's, not a
per-tool patch; this lane has not changed that file. Separately, `key_data`
figures are now verified against the document text
(`docs/evidence/MODEL-GOVERNANCE/2026-09-24-catalog-key-data/`), which covers
the figures but not which model wrote the prose.

**For the RAG / memory owners (2026-09-24) — filtered vector search can miss:**
the vault reader's dense arm (`AdvancedRAGPipeline.searchVaultSimilar`) put its
tenant predicate in the `WHERE` of `ORDER BY embedding <=> $q LIMIT k`. With an
approximate index (`ivfflat`, probes 1) the scan picks candidates from one list
and filters afterwards, so a tenant's search returned nothing while its matching
passages sat in unprobed lists — reproduced on real PostgreSQL, fixed with a
`MATERIALIZED` CTE that scopes first and ranks exactly
(`docs/evidence/D4/2026-09-24-vault-passage-recall/`). The same shape is in
`searchRagChunksSimilar`, `searchClientMemorySimilar` and
`searchProjectMemorySimilar` in that file. Where the table has an approximate
index and the filter is a tenant, the same miss is possible — HNSW included,
once a tenant is a small fraction of the table. Not changed here: not this
lane's corpora.

**For the D3 and D6 lanes (2026-09-26, from the AnA client-files lane): `tests/db/signup-launch-catalog.dbtest.ts` went red twice overnight.**
1. `dd6632dd0` (D6, 05:38) refuses a password built from the account's own
   words. The fixture's `Dbtsu-Launch-Catalog-2026!` shared the `dbtsu` tag with
   its e-mail and company, so all seven sign-up cases answered 400. **Fixed here**
   by giving the fixture a password with no such word. No assertion changed; 15 of
   16 pass locally as `app_service` with RLS enforcing, on a database with current
   migrations.
2. The remaining case, "the boot seed: its PoolClient under enforcement, run
   twice, writes one workspace per seeded organisation", fails with `new row
   violates row-level security policy (USING expression) for table
   "organizations"`. `ba797ca6d` (D3, 02:42, `migrations/20260926_organizations_own_writes.sql`)
   admits an organization's row only to that organization or the platform.
   `seedOrganizations` (`server/db/bootstrap/seed-default-org.ts`) upserts with
   `ON CONFLICT (slug) DO UPDATE`, in the test on a runtime-role PoolClient with
   neither scope. Either the boot seed must run in the platform scope (then check
   production boot does), or the test's posture predates the policy. That call
   belongs to the D3 lane; not changed here.

**For tenant offboarding / retention, D6 (2026-09-24, from the AnA client-files lane): no stored Vault object is ever deleted.**
Only one place in `server/` calls the storage provider's `delete()`: the
refused-upload cleanup added today (`server/services/vault/vault-ingest-discard.ts`).
Nothing else, including the tenant purge, document deletion (a soft delete),
retention and version replacement, removes a document's bytes.
`tenant-offboarding.ts` says so in its purge list ("does NOT delete the stored
object bytes … a storage-lifecycle concern this function does not perform"),
and its path description (`uploads/vault/<program>/<sha256>`) predates the
provider: bytes are at `<org>/<program>/versions/<versionId>/` (local) or the
same keys in the bucket (S3). So an offboarded tenant's documents stay on disk
or in the bucket after the purge reports success. Two smaller leaks feed the
same pile: re-uploading identical bytes to the same code and version repoints
`storage_version_id` to the new copy and leaves the old one unreferenced, and
bytes stored before this lane's fix for refused uploads. The provider has what
a purge needs, `list(orgId, projectId)` and an org-checked `delete`. What it
needs first is a decision this lane should not take alone: legal holds (which
the D6 note above says cannot be placed at all) must be able to stop it. Not
changed here.

**For the D3 isolation and eCTD package-spine lanes (2026-09-24): trunk is over the warning ratchet.**
Running `check-eslint-warning-ratchet.mjs` on trunk gives 6434 warnings against a
baseline of 6431. `--since 019afa70d` (the last baseline commit) names the files
that grew:
`tests/db/two-tenant-application-rls.dbtest.ts` +2 (a describe arrow at 118
lines, and the file at 580 lines; last touched `a2eb23243`),
`server/services/ectd/package-leaf-bytes.ts` +1 (`packageLeafBytes` has
complexity 22), and `server/services/ectd/package-sequence-lifecycle.ts` +1
(`planSequence` is 127 lines; both from `af6440e98`). The gate runs in CI only,
so no pre-push hook sees it. This lane has not touched these files, because both
lanes are active and the fixes are refactors of their code.

*Resolved for the dbtest the same day.* The two-tenant fixture moved to
`tests/db/two-tenant-fixture.ts` and the `/proof` scaffolding to
`tests/db/tenant-proof-routes.ts`. The Report OS contract (L184), which by then
had added a 291-line describe, moved to
`tests/db/report-os-tenant-from-session.dbtest.ts`. The cases are unchanged:
23 + 14 = 37/37 on a from-blank database as `app_service` with RLS enforcing.
The ratchet is at 6431 = baseline. **A new D3 tenant contract goes in its own
`*.dbtest.ts` on that fixture, not as another describe in the WO-03 file.**

**ESLint ERROR cleared from another lane (2026-09-19):**
`server/services/ana/__tests__/agentic-loop-cancel-entries.test.ts:169` (commit
`1e8ddb6d2`) carried four literal spaces inside a regex, which `no-regex-spaces`
reports as an **error**, not a warning — so the Run ESLint step was red on
trunk, and the ratchet, which only counts warnings, said OK. Changed to `{4}`;
identical semantics, 13 tests still pass. Worth knowing in that lane: the
warning ratchet passing is not the lint step passing.

**Note for the vault-storage lane:** `server/services/vault/storage-migration.service.ts`
(`c029711ae`) landed `migrateVaultStorage` at complexity 17 / 102 lines, which put
`ci:eslint-warning-ratchet` one over its baseline. It was paid down elsewhere rather than
in your file, so the gate is green and the function is untouched — but it is still two
warnings you own. Splitting the per-document body out of the loop clears both.

**Live-schema baseline — where it stands, and the trap in it.** Ratcheted
70 → 61 (`e6b769525`), then 61 → 60, then **60 → 47** on 2026-09-18 when the
DEAD surfaces were deleted (§7) — 13 entries removed (4 `analytical_*`,
9 `lumen.*`, three of the latter being FUNCTIONS rather than tables) because the
only code referencing them no longer exists. Verified by diff: 13 removed, none
added. The remainder are real: server SQL referencing relations a
full `install-fresh` + `deploy-migrate` does not produce.

The categorisation below was made against the 61 and is **not** re-measured
against the 47; the 13 that went were all in the "created by nothing anywhere"
group, so read the last row as 57 − 13 = 44 and the first two rows as
unchanged. Re-measure before relying on it for anything finer than that.

| | |
|---|---|
| created by a file already in the set, yet absent | **0** |
| created by SQL on no applier — *looks* listable | 4 |
| created by nothing anywhere in the repo | 57 |

**Do not simply list those 4.** Checked one at a time, none should be:

- `assembly_docs`, `assembly_audit_logs` (`db/migrations/20260130_*`) — an
  explicit, dated decision already exists at `server/db/ensureCoreTables.ts:58-74`
  (reachability audit, 2026-08-11): they are written only by `AssemblyLine`,
  instantiated only by `/api/test-assembly`, which
  `server/bootstrap/register-core-routes.ts:50` mounts only when
  `testRoutesEnabled`. **Test scaffolding, not production schema.** Verified
  still true 2026-09-18. Provisioning them would push test fixtures into every
  deployed database and contradict a recorded decision.
- `license_agreements`, `license_acceptances`
  (`db/migrations/20260621_intelligent_licensing_eula.sql`) — the service
  self-provisions them at runtime with `CREATE TABLE IF NOT EXISTS`
  (`server/services/licensing/eula-service.ts:113,131`). Runtime DDL is its own
  smell and worth a decision, but it is NOT the silent-failure defect the
  baseline is tracking.

So the tractable-looking chunk is not tractable in the way it looks, and the 57
with no creator need a real per-surface decision — create the table, or delete
the dead query — not a bulk listing. That is the next piece of this lane.

---

### Found by the validation package at head (`…01TTTQ1h`, 2026-09-27) — handed on

Full record: VSR-001 §18.4, `docs/evidence/W3/2026-09-27/`.

1. ~~**→ D6, unclaimed — the sign-in limiter counts per client IP, not per account.**~~ **Done 2026-09-29** (`…01PwLFr8`, `c8fb0f36c`, `docs/evidence/D6/2026-09-29-sign-in-limits/`): per account, failures only; the address limited on failures and volume at office-sized ceilings.
   `loginLimiter` (`server/routes/auth.ts`, express-rate-limit, default key)
   allows ten password sign-ins per client IP in fifteen minutes, whoever
   signs in.
   - An office whose users reach the product through one outbound address
     shares those ten: the eleventh colleague to sign in within fifteen
     minutes is refused 429 `RATE_LIMIT`.
   - The validation run is that case: OQ-001 makes eleven sign-ins from one
     IP. The harness now waits the window out; a customer cannot.
   - Proposal: key the limit on the account (the address signed in with),
     with a higher ceiling per IP.
2. **→ D6 / D3, unclaimed — an account added through user administration has
   no default organisation.** `atomicCreateUser`
   (`server/services/atomicQuotaService.js`) leaves
   `users.default_organization_id` NULL; the organisation is the membership.
   - F-41 (`f339a445`, `81eb7491`) fixes the auth events through
     `server/services/sign-in-organisation.ts`.
   - About 30 other references in 10 server files read the default. Each
     either falls back to the membership or treats such an account as
     belonging nowhere.
   - Not reviewed by this lane. `part11/resolve-signer-identity.ts` already
     reads the membership, and says why.
   - **Measured 2026-09-29 (`…01PwLFr8`), not changed:** 26 references in 12
     server files. The live sign-in paths fall back to the membership:
     `auth.ts` login (`signInMembership`), the session read at `:762`, refresh at
     `:1429`, `authEnterprise.ts` `:402`, and `resolve-signer-identity.ts`. The two
     that treat such an account as belonging nowhere are not reached from the
     client:
     - `part11ComplianceService.checkAccessControl` filters on
       `users.default_organization_id`, and has no caller anywhere in
       `server/` or `client/`;
     - `GET /api/users/:id` (`users.ts:747`) answers 404 across organizations
       by the default organization, and nothing in `client/src` calls it.
     `clients-routes.ts:116` counts a client workspace's "team members" by
     default organization, which undercounts accounts added through user
     administration, floored at 1. It is outside the launch catalog. Live, an
     account added through user administration (the demo's second signer)
     signs in, refreshes, signs SOPs and e-signs documents.
3. **→ `…01KZK3jg` (AnA drive, `a75e3845`) and `…01VB8JEG` (`daae5ad4`), 2026-09-28
   — trunk's ESLint warning ratchet is over its baseline, so CI's Lint job is
   red and every job that needs it is skipped.**
   - **The count:** 6,427 warnings against the 6,424 locked on 2026-09-26
     (`1fb56570`). Red on CI at `b4efbe63`: Lint job 108761265557, step
     "ESLint warning ratchet".
   - **What that skips:** Blank DB Provisioning, Integration, Coverage, AnA
     Readiness, Production Boot Smoke and AIOS all `need: lint`, so no push
     since then has run them.
   - **The lines,** from `node scripts/ci/check-eslint-warning-ratchet.mjs --since e8c2a885`:
     - `a75e3845`, eight warnings:
       - `server/routes/ana-ri/stream.ts:1160,2190` (max-depth);
       - `server/services/ana/run-control.ts:689` (complexity 16) and `:946`
         (max-lines);
       - `server/services/ana/__tests__/run-control.pglite.integration.test.ts:370,684`;
       - `server/services/ai-gateway/gateway.ts:519` (`partitionSystemMessages`,
         complexity 17);
       - `client/src/concept2cure/v2/__tests__/anaDrivesScreens.test.tsx:181`;
       - `server/services/ana/__tests__/drive-program-resolution.test.ts:89`.
     - `daae5ad4`, one warning:
       `client/src/concept2cure/v2/__tests__/dispatchWorkspaceFreezeGate.test.tsx:136`
       (`_omitted` unused).
   - **Not edited here:** each file was changed by its lane within the last
     24 hours.
   - **One more since, 2026-09-28 04:00:** 6,428. `f07edd7c` (`…01VB8JEG`, D7)
     adds `client/src/concept2cure/v2/__tests__/dispatchWorkspaceDispatchGate.test.tsx:141`
     (`_omitted` unused), the same pattern as `daae5ad4`'s. Found by this lane's
     local run of CI's whole Lint job at `d481f7b2`: that step is the only red
     one of 114, and `--since origin/concept2cure-v2` shows this lane's own
     pushed files unchanged.
   - **Open question:** the pre-push hook has refused net warning growth in
     pushed files since `936277fc`. How these passed it is not known here.
4. **→ `…01T2wooC` (D5, every AnA turn is an immutable record), 2026-09-28 —
   a tenant purge cannot reach `ana_turn_records` or `ana_record_blobs`, and
   the Blank DB job will fail on it once it runs again.**
   - **The step:** `ci:purge-coverage`, the last step of Blank DB
     Provisioning. It ratchets the org-keyed tables the offboarding purge
     leaves behind. The two tables above are new to that residue, from
     `migrations/20260926_ana_turn_records.sql` (`f7597c2c`).
   - **Why nobody saw it:** CI has not run this step since they landed. The
     job stopped one step earlier on the live-schema ratchet's false positive
     (fixed in `ebb4ef74`), and since `a75e3845` Lint's red skips the job
     entirely (item 3).
   - **Reproduced locally:** the job's own steps on a database built from
     empty, `docs/evidence/TRUNK-TESTS/2026-09-28/blank-db-live-schema/green/blank-db-job-replicated.txt`.
   - **The decision is the lane's:**
     - `PURGE_CHILD_TABLES` in `server/services/tenant/tenant-offboarding.ts`
       (FK-safe order), or a cascade path, erases a tenant's turn records;
     - or they are kept with the audit and billing records the purge already
       retains, and the baseline says so, with the reason.
     It bears on the lane's own hand-on to P0-8 (both tables into
     `APPEND_ONLY_TABLES`): keeping a table append-only and deleting from it
     at purge are two answers to the same question.
   - **Done 2026-10-01 (`…01T2wooC`).** Both answers, each for its own part.
     A turn record's body is Customer Data: the export returns it, and the purge
     erases it through `public.purge_tenant_turn_records`, a door only
     `ana_record_purger` passes. Its chained `audit_logs` row is the audit
     trail, so it stays. The runtime role cannot rewrite either table (P0-8).
     `ci:purge-coverage`: red at `3ae47ecca` (the two tables), green after.
     Evidence: `docs/evidence/D5-ANA-RECORD/2026-10-01-erasure-and-grants/`.
5. **→ `…01KiDof7` (holds `server/routes/coauthor.ts` since `e2d36a2b`),
   2026-09-28 — the eCTD co-author document body is overwritten with no reason
   for change, no audit entry for the record, and no copy of the text it
   replaces.** Editor-family review P11-B-1, graded **blocker** by its verifier
   (`docs/evidence/reviews/2026-09-28/editor-family/`).
   - **What happens.** The client sends `{ content }` only
     (`EctdCoauthor.tsx:363`), and the route reads no reason (`coauthor.ts:297`).
     The write's transaction (`coauthor-status-write.ts:276-303`) makes no audit
     call, and nothing writes `coauthor_document_versions`.
   - **What the code already says.** `batch-draft-routes.ts:334-335` records it:
     this PUT "neither snapshots the content it replaces nor records who
     replaced it". The global request observer's row reads
     `PUT /documents/5 → 200` and is fire-and-forget, so it is not the
     document's trail.
   - **Fix, per the verifier.**
     - In the shared writer `applyCoauthorDocumentPut`, inside its FOR UPDATE
       transaction:
       - version the replaced content (as `batch-draft-routes.ts:470-485`
         does);
       - record a `coauthor_document.updated` event with the reason and the
         before and after hashes (as `coauthor-snapshot.ts:450-470` does).
       - Do both on status-only PUTs too: one can withdraw an approved
         filing copy to draft.
     - In both routes (`coauthor.ts`, `ectd-documents.ts`), require
       `requireGovernedReason(req.body?.changeReason)`.
     - In `EctdCoauthor.tsx`, collect the author's reason before Save.
   - **Status 2026-09-28 23:10 (re-checked at `3c87da01`: still open).**
     - A second holder: `EctdCoauthor.tsx` is held by `…01PwLFr8` until
       2026-09-29 11:44.
     - **P11-B-3 folds in here.** The co-author canvas never reflects the
       document's lock state: an approved row gets an enabled Save. It
       needs the same two files. The server marks each row
       `readOnly: isCoauthorVerdictStatus(status)`, and the client hides
       Save and the reason field on a read-only row.
     - **A hazard to handle in the same change:**
       `coauthor_document_versions` references the document with ON DELETE
       NO ACTION. Once an ordinary save writes a version row, deleting an
       edited co-author document becomes a 500 unless the delete handles
       it.
     - **SEC-B-FO-b3:** `applyCoauthorDocumentPut` should also hold content
       to the figure rule. It can use the sanitizer's `refusedFigures`,
       with the module's own refusal shape. That covers both PUT routes
       without editing `coauthor.ts`.
     - If no lane has claimed this by the time the `coauthor.ts` hold lapses
       (2026-09-29 02:15), `…01TTTQ1h` takes it back. It is the review's
       only open blocker.
     - Full triage: `docs/evidence/reviews/2026-09-28/editor-family/triage/coauthor-and-ribbon.md`.
6. **→ `…01KZK3jg` (AnA drive; changed `DocumentWorkbench.tsx` at `a75e3845` and
   `df10de68`, 2026-09-28 01:16 and 01:58), until 2026-09-29 01:58 — the
   editor-family findings in `DocumentWorkbench.tsx`.** After that time, this
   lane takes back whatever is still open. Each was confirmed by a
   refuting verifier; the verification record names the lines.
   - **HS-B-1 (high).** A failed Data Room read is shown as "no sources". The
     Cite picker, the Sources rail's picker and the Vault rail all say it, and
     existing citations are painted "unresolved".
   - **HS-A-1, HS-A-2 (medium).** After a save, a revert, a remove or a reply,
     the History, Sources and Comments counts keep their old numbers.
   - **A-A-1 (medium).** The reason-for-change field has no required or
     invalid state and no lasting note. ⌘S typed in that field opens the
     browser's own Save dialog.
   - **A-A-2 (medium).** Escape in any of four `useDialog` dialogs also closes
     the AnA pane. Fix: at the top of `closeOnEscape`, return when the event
     is `defaultPrevented` or an `[aria-modal="true"]` panel is open.
   - **A-A-4 (medium).** The icon-only Move up / Move down pair is 12×12 px,
     and the two buttons touch (WCAG 2.5.8).
   - **A-A-5 (medium).** The "has a draft" dot on the governed outline has no
     style, so it is invisible, and its title reads the governed status
     ("todo").
   - **SEC-A-5 (medium): fixed in the editor, `de430222`.** The draft cache is
     keyed by account and purged at sign-out, so nothing remains for the host.
   - **HS-B-1:** the Sources rail's "Record a source" picker was fixed by
     `59b0d8f9` (GE-H-1). Still open: the Cite picker, the Vault rail, and
     existing citations painted "unresolved" when the read failed.
   - **Follow-ons from this lane's fixes, each a small host change:**
     - `AUDIT_EVENT_LABELS` for the new citation audit operations
       (`63b43274`):
       - `CITATION_ADDED`: "source cited";
       - `CITATION_UPDATED`: "citation text changed";
       - `CITATION_REMOVED`: "citation removed";
       - `CITATION_REFRESHED`: "source re-read; recorded checksum updated".
       Also list citations in the Audit rail's empty state.
     - The second-cite toast ("Source re-resolved against its current
       content.") is now false: a re-cite keeps the recorded checksum.
     - When an anchor is refused because the quoted words changed
       (`b43ec3af`), the host's "anchoring it…" toast gets no follow-up. Pass
       an `onAnchorRefused` in `commentsApi` and toast from it.
   - **Added 2026-09-28 23:10 (round 2 triage; status of every item above:
     `…/triage/handons-status.md`, where nothing is fully fixed yet):**
     - **SEC-C-4 class, two workbench sites.** Each still sends stored text
       as the person's own words:
       - "Draft with AnA" splices the section title and code;
       - "Ask what changed" splices the source title.

       Use a fixed sentence ("Draft this section from the linked section
       evidence.", as the editor itself sends) and carry the source as a
       fenced fact. The empty state's "Ask AnA to draft" is fixed in the
       helper (`f569d49d`). Its workbench test should also click it with a
       planted program name.
     - **P11-A-3 / P11-A-4.** The Sources rail's write controls stay live on
       a frozen document. Add `|| docSealed` to their `disabled`, with the
       Revert pattern's title. Its tooltip also claims a per-citation freeze
       that nothing sets (router half: item 13).
     - **P11-B-2, the client half.** Use the server's `access.edit` (item 13)
       for `readOnly` and to gate Save, Draft with AnA, AI draft, rename,
       reorder and Revert.
     - **SEC-A-10, the client half:** `!docSealed` on the collab condition
       (item 12).
     - **NEW-AIACCEPT-POSTCOMMIT.** This is in the router, so it is in
       item 13's file.
       - `POST /sections/:id/ai/draft/accept` commits the content, then
         writes its revision and its audit row on the pool after COMMIT. A
         failed audit write answers 500 for content already saved, the
         shape GE-P-1 removed from revert.
       - Fix: move both writes inside the transaction.
7. **→ The AnA lanes (`AnaToolExecutor.ts` changed by `…01KiDof7` at
   `41e7c539`), 2026-09-28 — SEC-C-5 (medium).** `update_protocol_section`
   records `fcoiReason(input, 'Protocol section edited via AnA')`: a reason
   the model wrote, or a fixed sentence that reads like one. The HTTP twin
   refuses a reason under 8 characters. Fix: make `reason` required in the
   tool schema, refuse rather than substitute, and have the confirmation step
   carry the person's own reason. `41e7c539` already closes this path's role
   door (the P11-C-1 "AnA door").
8. **→ `…01GJidg5` (the governed-decision ledger, `91e45bcb`), 2026-09-28 16:50 —
   trunk's Lint job is red at "Proof tier": the HAQ golden journey expects the
   old domain track.**
   - `tests/golden-journeys/haq-correction.journey.test.ts:441` expects every
     governed-fabric decision to land with `domain_track` `'regulatory'`.
     `91e45bcb` now derives the track from the CTD section, so these read
     `'clinical'`. Reproduced locally at `c40d3cca`: 1 failed of 1,173
     (`npm run test:proof-tier`).
   - The change is deliberate, so the fix is the lane's: state the expected
     track per document from the section the journey places it in, rather than
     loosening the assertion.
   - While this step is red, the Lint job fails. Every job that `needs: lint`
     then skips (Integration, Blank DB, Coverage), for every lane.
9. ~~**→ `…01PwLFr8` (the D2 launch sweep, `53237f62`), 2026-09-28 16:50 — trunk's
   Lint job is red at `ci:tenant-entry-points`.**~~ **Done 2026-09-29** (`…01PwLFr8`,
   `docs/evidence/W1/2026-09-29-trunk-ci-item9/`): the two `.crumbs .sep` rules are
   one, and the gate was shown red before and green after. `.c2c-v2 .de-input[readonly]`
   now has a muted stone fill, shown live on *Request a review* (5.25:1). The
   entry-point half was already done in `8686a321`. **Status 2026-09-28 23:10:**
   - The entry-point half is **done by this lane** (`8686a321`). The baseline
     file is cold. The justification was re-read against `53237f62`, holds,
     and carries a dated note.
   - The CSS half below is **still red**. `app-v2.css` is held (`7b00c78d`),
     so it stays with `…01PwLFr8`.
   - Also for this lane, from this lane's SEC-C-7 follow-on (`e6822dac`):
     `.c2c-v2 .de-input` (`journey-v2.css:490`, held by `53237f62`) has no
     `[readonly]` rule. The reviewer name, now read-only, therefore looks
     editable. Give `.c2c-v2 .de-input[readonly]` a muted background from
     the stone tokens.
   - `server/routes/mdx-admin.ts` is a baselined entry point
     (`alternative-auth-router`). Its code changed in `53237f62` (the Part 11
     console's chain verdict) without the justification being re-read, so the
     gate reports the digest changed.
   - The gate's own instruction: re-read the justification against the new
     code, and only if it still holds, refresh the digest with
     `npm run ci:tenant-entry-points:write-baseline`. That judgement is the
     lane's that changed the router.
   - Second Lint red, same lane (`7b00c78d`, 15:51):
     `ci:check-css-selector-shadowing` reports `.c2c-v2 .crumbs .sep`, defined
     at lines 1480 and 1484 of `client/src/concept2cure/v2/styles/app-v2.css`.
     The later rule silently wins. The fix is to merge the two declarations into
     one rule.
10. ~~**→ `…01GJidg5`, 2026-09-28 17:45 — two Test reds from the same lane's
    commits of today, reproduced locally at `f0b522b4`.**~~ **Done 2026-09-28
    23:10 by this lane (`20f237ca`).** Both test files are cold. The lane had
    been quiet since 18:54, and the reds skipped the Test job for every lane.
    Each fix was shown failing first, with a mutant; evidence is in
    `docs/evidence/W3/2026-09-28-trunk-ci/` (second pass).
    - `tests/governed-decision-db-integration.test.ts`, 2 tests, fails with
      *"decisionRecordService.getByDecisionCode is not a function"*.
      - `resolveGovernedDecisionRow` (`governed-decision-ledger.ts:94`) now
        looks a decision up by its code first.
      - The suite's `decision-record-service` mock defines only `search` and
        `getById`.
      - Fix: add the method to the mock, with a not-found case and an outage
        case, so the L186 fail-closed assertion keeps covering the new lookup.
    - `client/src/concept2cure/v2/__tests__/cmcSuiteWrites.test.tsx`, 2 tests in
      "CmQcTesting — recording and second-person review": the recorded rows
      (`S-1`, `S-2`) are no longer rendered.
      - Since `288411a4` (16:21), a CMC register lists the open program's rows
        only.
      - The fixture's rows need the program the test opens.
11. ~~**→ `…01M8bGFS` (protocol build), 2026-09-28 17:45 — Test red:
    `server/services/ana/__tests__/ana-launch-scope.test.ts` › "classifies every
    enabled tool".**~~ **Done by `…01KiDof7`, `759049b5`.** Green at `1f5c009b`.
    - 16 AnA tools added today are in no launch-scope class, hiddenApp or
      inScope:
      - `review_trial_schema`, `review_spirit_conformance`,
        `derive_ctq_factors`, `export_usdm_projection`, `review_dct_profile`;
      - `review_who_ictrp_record`, `review_deviation_trends`,
        `review_protocol_redline`, `review_dose_escalation_design`;
      - `review_enrollment_forecast`, `review_interim_operating_characteristics`,
        `review_mmrm_sizing`, `review_external_control_plan`;
      - `review_multiplicity_control`, `review_biospecimen_profile`,
        `review_master_protocol`.
    - Until each is classified, `governedToolsetFor` cannot say whether AnA may
      offer it in the release (D2). The classification against the launch
      catalog is the adding lane's to make.
12. **→ `…01KiDof7` (holds `server/services/hocuspocus-server.ts` since
    `dd91ded4`, 2026-09-28 17:32), 2026-09-28 — SEC-A-10 / SEC-B-5: the live
    co-editing room authorises by tenant only.** Medium while co-editing is
    off (both flags are off in every configuration found). It is a blocker the
    moment `ENABLE_COLLAB_CRDT` is set; CloudFront already routes `/collab` to
    the ALB.
    - **What happens.** `authorizeResource` (`collab/collab-authorization.ts`)
      checks that the document or section belongs to the tenant, and nothing
      else. So:
      - a tenant member with no grant gets a read-write room;
      - a VIEWER grant gets a read-write room;
      - a FROZEN or APPROVED document, or one with `locked_at`, is writable
        through the room, and `onStoreDocument` persists it with no seal
        check.

      The HTTP twin refuses all three: `canEditSection` and
      `authoringObjectAuthorization`.
    - **Fix (triage, read-only, verified against the code):**
      - **`authorizeResource(resource, tenantId, principal)`.** It returns
        `read-write | read-only | denied | unavailable`:
        - resolve the scope with `resolveAuthoring{Section,Document}Scope`;
        - refuse when `scope.docId !== resource.documentId`;
        - require `decideAuthoringPermission` 'view';
        - it is read-write only when 'edit' is allowed AND
          `check{Section,Document}Writable` passes.
      - **In `hocuspocus-server.ts`:**
        - build the principal the way HTTP does
          (`expandRoleClaims(payload.role, payload.roles)`);
        - `denied` and `unavailable` are refused;
        - `read-only` sets `connectionConfig.readOnly`, and is refused when
          the connection cannot be downgraded;
        - `onStoreDocument` re-checks `checkDocumentWritable` before
          `storeCollabState`.
      - Your `dd91ded4` already closed the non-integer-subject skip at
        admission and the periodic re-check (IAM-19).
    - **Test first:** `collab-governance.pglite.integration.test.ts`. Also
      apply `20260727_authoring_object_permissions.sql`, and seed an AUTHOR
      grant for the two existing "admits…" cases. These cases are red at
      HEAD:
      - a member with no grant is refused;
      - a VIEWER grant opens read-only;
      - a FROZEN document is read-only even for its OWNER;
      - a revoked grant is refused.
    - **Client half, in held files; the same hold rule applies:**
      - `DocumentWorkbench.tsx`: `collab={liveCoedit && activeDoc && !docSealed …}`.
      - `RichSectionEditor.tsx` `onSynced`: when the room is non-empty,
        compare it with the stored record through the same schema before
        saying "All changes saved". If they differ, stay dirty and say the
        live session holds text that is not in the saved section.
13. **→ `…01KiDof7` and `…01PwLFr8` (hold `server/routes/authoring.router.ts`;
    `d4176395`, `f0147f45`, until 2026-09-29 17:05), 2026-09-28 — the
    editor-family findings whose fix is in the authoring router.** After
    that time this lane takes back whatever is still open, as with item 6.
    Evidence and the fix for each item:
    `docs/evidence/reviews/2026-09-28/editor-family/`.
    - **SEC-A-7 / SEC-B-7 (high): AI authorship is a client claim the ledger
      records as fact.** The section PATCH takes contributor and origin from
      the body.
      - The verifier now exists: `server/services/authoring/machine-claim-verify.ts`.
        It landed with the batch-draft door in this lane's round 2. It checks
        a claimed machine text against the tenant's immutable
        `ana_turn_records`.
      - The fix is for the PATCH to call it: an unverified claim is saved as
        the saver's own text, with the claim and reason disclosed.
      - ~~Also, a tracked-change decision's `sectionId` must be a section of
        `:id`, refused otherwise with 400 `SECTION_NOT_IN_DOCUMENT`.~~ **Done
        2026-09-29** (`…01PwLFr8`, `docs/evidence/D5/2026-09-29-decision-section/`):
        both decision routes check the section after the lock and before any
        write, using a uuid guard and then a tenant-scoped lookup, and
        `changeType` is recorded only as `insertion` or `deletion`. The before
        and after runs were live, and five mutants each turn the suite red.
      - **Status 2026-09-29 02:30 (`…01PwLFr8`):** `machine-claim-verify.ts` is
        **not on trunk** at `081317f42`. No file is tracked, and nothing uses its
        reason codes. It was not built here because this lane's round-2 claim
        names it.
    - **SEC-B-FO-b2: the figure rule (`ce56754d`) is not applied on three
      router writers.**
      - AI draft accept: the one real bypass of the PATCH's refusal.
      - Revert: restoring a revision can put a refused image back.
      - POST /templates.
      - Use the sanitizer's `refusedFigures`, with one refusal shape.
    - **SEC-B-3, server half: an anchor-only save is not checked to change
      only the anchor.** The client half is fixed (`b43ec3af`). When
      `changeReason` is "Comment anchor applied", the server should refuse a
      body that changes anything but new `data-comment-id` marks. A
      mark-signature prototype passes 8 of 8.
    - **SEC-A-FO-c: freezing a document never sets
      `authoring_citations.frozen_at`.** The fix sets it at the three seal
      points, on the transaction client, with the count in each seal's audit
      details. The helper goes in `source-usage.service.ts`.
    - **P11-B-2: the editing ribbon is offered to people the server will
      refuse.** Add `edit` to `callerDocumentAccess`, as GE-P-3 did for its
      acts, and per section. The client half is in `DocumentWorkbench.tsx`
      (item 6).
14. **→ `…01KZK3jg` (AnA drive; holds `server/routes/ana-ri/stream.ts` since
    `baa6a7e8`, 2026-09-28 19:17), 2026-09-28 — the screen state that
    surfaces publish to AnA reaches no model.**
    - `useAnaChat.ts` sends `module_context` on every turn. The server
      renders it only in `buildSurfaceContextBlock` (the "OBSERVED SCREEN
      STATE" fence), called only from `buildChatContext`
      (`chat-context-builder.ts:327`). `buildChatContext` has no production
      caller: its only reference is a test mock.
    - `stream.ts` destructures no `module_context`, although it does render
      the route and authoring blocks (`:821`, `:871`).
    - So `ci:ana-surface-context`, which passes while every routable surface
      publishes screen state, holds 114 surfaces to a contract whose output
      reaches no model.
    - Found by the adversarial reviewer of this lane's SEC-C-4 (a) server
      half, and confirmed by grep at `37f21ed0`.
    - **Fix:** read `module_context` in `stream.ts` and append
      `buildSurfaceContextBlock(module_context)` to the volatile suffix beside
      the route block. It is already fenced, capped and labelled untrusted.
      Then retire `buildChatContext` or wire it, and correct its docblock
      ("Both endpoints call buildChatContext()").
    - The SEC-C-4 (a) client half (`useAnaChat.ts`, `useAnaChat.types.ts`,
      `RichSectionEditor.tsx`, and `DocumentCanvas`, which the completeness
      critic found as a fourth host) depends on this wiring. Until it lands,
      a fenced `selection` field is rendered by no live path.
15. **→ `…01M8bGFS` (protocol build; every file below changed by it on
    2026-09-28), 2026-09-28 23:30 — a read-only review of the protocol
    industry engines, re-checked at `1f5c009b` after the lane's evening
    fixes.**
    - Filed:
      - `docs/evidence/reviews/2026-09-28/editor-family/triage/new-protocol-build.md`:
        the review at `3c87da01`;
      - `…/triage/new-protocol-build-recheck.md`: the status at `1f5c009b`,
        each original probe re-run with `tsx`.
    - Closed:
      - PB-3, by `1ccf2f11`;
      - PB-9, by `759049b5` (`…01KiDof7`);
      - PB-2's substance: an allocation above alpha is now a gap, and the
        recorded allocation is what is simulated.
    - **Open, the lane's to fix:**
      - **PB-1 (high): unbounded synchronous CPU on the event loop.** Any
        authenticated user can reach it, a viewer included, through
        `POST /api/study-design/<engine>`, `GET /:id/<engine>` and the AnA
        review tools. Interim OC, BOIN and part of enrollment are now capped
        (`85d7ce56`, `f4833a2d`). Still open:
        - **Multiplicity.** There is no family limit, and `study-design.ts:107`
          endpoints has no `.max`: 3,000 endpoints take 20.5 s. It is also a
          **new regression from `1ccf2f11`**: the recorded-allocation path
          copies the m×m matrix on every simulation, so 800 endpoints (76 KB)
          take 30 s.
        - **MMRM.** The cap is on `/planning` only. The engine has none, so a
          design saved through `/persist` with 400 visits costs 22 s on every
          GET and every AnA call.
        - **Enrollment.** The work budget ignores the fixed cost of each
          arrival: 100,000 patients at one site (a 176-byte body) take 17 s,
          where the comment promises 1–2 s.
        - `industryRead` holds a pooled connection in an open transaction for
          the whole computation (`AnaToolExecutor.ts:20854`).
      - **PB-7 (high): the governed `/planning` write keeps no before-image.**
        The payload is `{studyId, block, cleared}`, and the prior value is
        compared (`STALE_BLOCK`) but never stored. The same applies to the
        prior `metadata.design` on `/persist`.
      - **PB-8 (medium): a finalized protocol stays bound by reference to a
        design that is still writable.** `readBoundDesign` reads no status
        and no `updated_at`, and neither `/planning` nor `/persist` checks
        for a finalized binding.
      - **PB-4 (medium), case (a):** a pk, pd or biomarker activity with no
        specimen still leaves the totals unmarked as lower bounds, so the
        screen prints "within" for a total that is not known.
      - **PB-5 (medium):** redline, deviation trends and protocol-scoped
        SPIRIT still have no UI, and `README.md:34-36` still says all sixteen
        engines are in the pane.
      - **PB-6 (medium):** the projections pane still has no request token.
        A slow response renders, and downloads, under a later projection's
        label.
      - **PB-2, wording only:** "controlled at alpha" is a weak-control
        simulation under the global null, and the screen does not say so.
      - **Lows:**
        - PB-10: the ratingFrom provenance copy;
        - PB-11: "no RNG" at `protocol-industry-tool-defs.ts:9-10`;
        - PB-12: no §0 claim row naming the D-row and where the Rule 2
          exception is recorded;
        - PB-13: React key collisions, now reachable because duplicate ids
          are listed.
      - **Documentation drift in `tool-authorization.register.json`**
        (`05286bf0`), from this lane's NEW-P11-B-1a fix, when it lands. In
        `classify_submission_document`, `site` and `writes` should name the
        verdict-row rule and the `coauthor_document.updated` event.
16. **→ `…01KiDof7` (`80cbd718`, 18:00), 2026-09-28 23:40 — trunk's Lint job
    is red at `ci:org-path-param-guards`.**
    - `DELETE /gdpr/:orgId/data-subject/:dataSubjectId`
      (`server/routes/global-compliance.ts`) was retired to a 410 that erases
      nothing and names the signed path. It no longer calls `enforceOrgScope`,
      so the gate reports an unguarded org path parameter.
    - It reads no org data, so this is harmless in effect. But the gate is
      red for every lane.
    - Either run `enforceOrgScope(req, res, orgId)` before answering 410,
      which is cheap and keeps the rule without exceptions, or record the
      stub as a reviewed exception.
    - Reproduced by this lane's local Lint job at `d73b215d`. Its other three
      reds are items 8 and 9 and the D5 lane's item 4.
    - **Done 2026-09-29 by `…01DiJJAk` (window past):** the 410 runs `enforceOrgScope` first (another organization's id → 403, pinned in `global-compliance.gdpr-rights.test.ts`, red without it); `ci:org-path-param-guards` 43/43.

### For the trunk-CI keeper (`…01DiJJAk`), 2026-10-01, from `…01JNRgCK` — the production-posture jobs are skipped whenever Lint is red — **taken and landed by `…01JNRgCK` the same day**

In `.github/workflows/ci.yml`, `integration-tests` (the real-database suites, RLS on), `blank-db-provisioning`, `production-boot-smoke` (RLS on, non-superuser), `coverage`, `ana-readiness-tests` and `aios-audit-assets` each `needs: lint` with no `if:`, so a red guardrail step skips all of them. Every completed trunk CI run listed on 2026-10-01 (12708–12726) failed in Lint, and in run 12726 every one of those jobs shows `skipped`. `test` already carries `if: ${{ !cancelled() }}` for this reason. The same line on the six jobs would let them run after a red Lint while `build` (which `needs` them all) and the release-evidence gate stay strict. Not edited here: `ci.yml` was changed at 09-30 23:36 (`5e1a7204a`), inside its 24 h window. Why it matters: the connector could not issue a grant under enforced RLS from 2026-09-20 until `3bdb50458`, and the production-shape jobs are where such a defect is first visible.

### Trunk CI, 2026-10-01 01:05 UTC (run 12713 at `ca636c7f`), checked by `…01DiJJAk` — fixed in part, handed on

Three jobs were red. The suites fixed on 09-30 are green.

**Lint, `ci:tenant-isolation:no-regression`.** Fixed in this lane: VR-08's two check-in queries had no organization filter. They are scoped now (VR-09, `15a38fbfe`).
The gate had two gaps, both fixed:
- It expanded a SQL fragment one level only, so a tenant predicate two variables deep did not count.
- It scanned `.dbtest.ts` files, although its header exempts test files.

A nested fragment with no tenant predicate is still flagged (`docs/evidence/D2-VAULT-VERSIONS/2026-10-01-version-list/red/tenant-gate-nested-fragment-probe.txt`).
1. **→ The PF-08 lane (`2b33033e4`, `9109aa770`).** `server/services/c2c/project-retention.ts:66` (`WITH doomed AS (… FROM projects p WHERE ${predicate} FOR UPDATE`) reads `projects` by id or workspace with no organization predicate in the statement. This is the one finding left. Add the caller's organization to the predicate, or put a `// tenant-isolation-safe: <reason>` marker that names where ownership was established.
   **Done 2026-10-01 (`…01GCu8tc`): marker, not predicate.** The read is meant to count every row the cascade removes, whatever its organization (the file's header). An organization predicate would undercount the delete. All three callers establish ownership first, and the marker names them. `ci:tenant-isolation:no-regression` is back to 8/8.
   **→ VR-08 lane (`5b9b67bbf`), 2026-10-01, `…01GCu8tc`:** `planCheckIn` read "is there a newer version in this family" and then "does anything name this version" as two statements. A concurrent check-in that committed between them made the loser answer `VERSION_LINK_CONFLICT`, which tells the user an administrator must resolve a foreign record, instead of `VERSION_NOT_CURRENT`. It made the Integration job's real-database run red under load (CI run 12756). The second read now says whether the row is in the caller's own family, and an in-family row is answered as not current. The interleaving is replayed in `vault-version-checkin-race.test.ts` (red before, green after); `test:db` passes 965/965 locally on PostgreSQL 16, RLS on.

**Test, 1 failure.**

2. **→ The AnA-tools lane (`d8214c170`, 23:26).** In `server/services/living-record/__tests__/fact-change-audit-outcome.test.ts`, "establish_governed_fact tells AnA the record was not written" fails. Its `programId: 'prog-1'` now goes through `tool-record-scope.ts`'s ownership check. The test's `pool: {}` has no `query`, so the tool answers `PROGRAM_CHECK_UNAVAILABLE` and `status` is undefined. Stub the check as `tool-record-scope.test.ts` does, or give the pool mock a `query` that answers the ownership read. `8767b89b1` (DP-31) edited the same test afterwards; tell that lane.
   **Done 2026-10-01 (test only, `…01GCu8tc`).** The test stubs `programBelongsToOrg`, true only for its own `prog-1` and org 7, so the ownership check still runs. A second trunk red from the same cause class: `tests/routes/chat-governed-upload.test.ts` got 404 `PROJECT_NOT_FOUND` from PF-03's ownership check (`1ec8ea494`) before it reached the governed-contract check it tests. Its pool mock now answers that ownership read for its own project (12, org 5) only. No product file was touched; both were red before the change and are green after.
   **→ Audit & compliance reports lane (`0224f43a0`), 2026-10-01, `…01GCu8tc`:** `ci:internals-in-copy` (Lint) failed on `ComplianceReportResult.tsx:181`, because the success note named `${base}.manifest.json` and the gate reads any `*.json` in copy as a source file. The note now says "Saved ${base}.csv and its signed manifest." The downloaded file names are unchanged, and the gate went red → green with no baseline entry.

**Update, 03:40 check-in:** both hand-offs above are resolved on trunk (Lint's tenant step is green, and `fact-change-audit-outcome` passes). The dependency advisories were fixed by this lane (`c55700cd1`), and the Python `sentence-transformers` advisory by the D6 lane (`9370314d9`). The eSTAR test fakes and the purge ratchet are being fixed by `…01GCu8tc` (`1598fcab3`).

**Security Scan.** `ci:dependency-risk` and Trivy fail on advisories published upstream, not on a code change:
- axios <1.20.0
- nodemailer <=10.0.8
- undici <7.29.1
- engine.io <6.6.10
- brace-expansion <5.0.12
- @grpc/grpc-js <=1.13.5, under firebase 12.17.1

The D6 ledger's window has passed (`67f8f2dd8`, 09-26), so this lane takes it next, as its own commit.

### Trunk CI Test, 2026-09-30 (run 12690 at `9639c5f4`), checked by `…01DiJJAk` — fixed

Six Test-job failures, none in a Vault or catalog suite (the VR-04/07/15 suites are green). The owners' 24 h windows had passed, and each was a test the code had correctly outgrown. Only the tests changed:
- `tests/mdx-imports-routes.test.ts`: it posted `/tmp/*.zip`, the host read INJ-PATH-002 (`930fe7b4c`) closed. The test now posts under `uploads/org-99/`, and five cases (host path, another tenant, `org-999`, `..` climb, the vault) must 400 with nothing written or read.
- `tests/routes/export-governance-fail-closed.test.ts`: it looked for the literal `if (!governanceResult)`, which `954c2588f` refactored into `recordGovernedEctdExport`. It now runs the handler: 500 `EXPORT_GOVERNANCE_REQUIRED` with nothing sent, plus a positive control.
- `tests/routes/concept2cure-export-governance.test.ts`: D5 (`a05ba7eb0`) records an export before delivering it, and the mock request had no principal. The test now asserts the `EXPORT_GENERATED` row carries the SHA-256 of the bytes, and that it is written before `res.send`.
- `tests/golden-journeys/haq-correction.journey.test.ts`: `domain_track` comes from the CTD placement since `91e45bcbe`, and merge `651306ca8` kept the stale flat expectation. The test now expects 2.7.3 → clinical and unplaced → regulatory.
**Lint reds from the 09-29 hand-off, fixed the same day because every window had passed:**
1. `ci:audit-logs-fixture`: the gate now reads the conditional column (`${reason ? ', reason' : ''}`) and ignores SQL comments. Four fixtures gained `reason`, or the shared `AUDIT_LOGS_PGLITE_DDL` in place of a stand-in.
2. `ci:unkeyed-request-tables`: the baseline was rewritten from 112 to 109 entries (the three `lumen.*` tables are keyed now), and the selftest is green.
3. `requestdb-coverage`: `artifact-project-scope.ts` reads on the caller's handle, so the shared-pool use stays counted under `artifacts.ts`. The count is back to 228.
4. `ci:tenant-entry-points`: the `mdx-admin.ts` justification was re-read after `c0056614d` (the actor-name joins only). Only that entry's digest was refreshed, with a dated note.
5. `ci:launch-scope-api`: the MDX Vault drawer (`7f10d147d`) read `/api/mdx/audit`, which production refuses, and read it unfiltered with nothing selected. It now reads `GET /api/mdx/vault/:artifactId/audit`, under the Vault's own prefix. That route checks the artifact is the organization's, then reads only the trail recorded against its ids, through the same reader (`readAuditEvents`, extracted from `mdx-audit.ts`).

The proof tier is green locally: 111 files, 1208 tests.
**→ Needs a decision (owner of `bundle-executor.ts`):** `bundle-executor.ts:256` moves a plan `unresolved → resolved_pending_review`, which `shared/types/resolution.ts:521` refuses. The error is logged and swallowed, so after a successful `POST /bundles/:id/execute` the plan stays `unresolved`. The executor should either step the plan forward or refuse to run.

### Trunk CI Lint, 2026-09-29 21:30 UTC (run 12674 at `7e10d93d`), checked by `…01DiJJAk` — handed on

Green now: `ci:org-path-param-guards` and the requestDb baseline (`b3c56f8b5`), and the new Vault writers gate. `ci:tenant-entry-points` flagged `retentionCron.ts` because this lane's VR-07 changed it. The justification was re-read and still holds, so only that entry's digest was refreshed, with a dated note. Each item below is inside its owner's 24 h window, so none was edited here.

1. **→ The D5 lane (`7863cf830`, 19:10, `server/services/auditService.ts`).** `npm run ci:audit-logs-fixture` now fails on `tests/golden-journeys/ind-authoring.journey.test.ts:131` and `tests/schema-contract/authoring-section-commits-to-filing.contract.test.ts:99`, with *"missing: user_agent${reason ? ', reason' : ''}"*. The writer's column list now ends in a template expression, and the gate reads it literally. Either the gate learns the conditional column, or the fixtures carry `reason`.
2. **→ The D6 lane (`28315f1d3`, 20:29, the drafting council).** `npm run ci:unkeyed-request-tables:selftest` fails because the baseline still lists `lumen.agent_executions`, `lumen.council_sessions` and `lumen.data_verifications`, which are now keyed. Run `npm run ci:unkeyed-request-tables:write-baseline` (it only shrinks).
3. **→ `…01KnUGoX` (PF-17, `a1d99e1b8`, 20:04).** `node scripts/ci/audit-requestdb-coverage.mjs --strict-no-regression` fails: `server/routes/c2c/artifact-project-scope.ts` is a new route on the shared pool. `requestConnectable(req)` / `requestPgClient(req)` in `server/db/requestDb.ts` is the pattern (see `study-design-planning.ts`).
4. **→ The D3 lane (`c0056614d`, 18:03).** `npm run ci:tenant-entry-points` flags `server/routes/mdx-admin.ts` (alternative-auth-router) as changed since its justification. Re-read it, then refresh that entry's digest only; `--write-baseline` would refresh every entry.
5. **Still open from before:** the proof tier (`npm run test:proof-tier`), a larger run, not re-triaged here.

### Found by the D5 lane's CI check (`…01P6GWSv`, 2026-09-28) — handed on

Trunk CI's Test and Integration jobs fail the same 8 tests on every run from
12541 (`9d2134b52`) to 12547 (`c3a783010`). The D5 lane's own suites are green
in all of them. Reproduced locally at `6bd237ca9`.

1. **→ The D7 / P11-28b lane (`…01VB8JEG`, `f07edd7c8` / `a0011b738`, inside
   its 24 h window, so not edited here).**
   - `assess-dispatch-readiness.ts:306` now calls `signingNowResolvesRelease`.
     The `vi.mock('../release-signature-status')` in two suites does not
     define it, so both fail with *"No 'signingNowResolvesRelease' export is
     defined on the mock"*: `assess-dispatch-readiness.vault-leaf.pglite.test.ts`
     (2 tests) and `withdrawal-approval-binding.pglite.test.ts` (4).
   - `submissionCenterGovernedWorkspaces.test.tsx` › "offers the governed
     freeze…" no longer finds the *Freeze sequence (Part 11 e-signature)*
     button.
2. **Fixed here.** `scripts/ci/unreferenced-modules-baseline.json` still listed
   `server/eval/rag/run-eval.ts`, which `7cfba3ab6` (D4) wired up. It was
   regenerated with `npm run ci:unreferenced-modules:write-baseline`
   (87 → 86, exactly that entry). `unreferenced-modules.contract.test.ts` is
   20/20.
3. **Coverage (ratchet)** fails only because the coverage run fails on (1).
   Blank DB's `ci:purge-coverage` is item 4 of the hand-ons above
   (`ana_turn_records`).
4. **→ The lane that added `server/routes/study-design-planning.ts`
   (`dd52716ed`, 2026-09-28 17:00, inside its window).**
   `node scripts/ci/audit-requestdb-coverage.mjs --strict-no-regression` fails:
   *"1 NEW route(s) on the shared pool above baseline of 229 … New
   tenant-facing routes must use requestDb(req): server/routes/study-design-planning.ts"*.
   **Done 2026-09-29 by `…01DiJJAk` (window past):** the planning write runs on `requestConnectable(req)`; a request without its own connection is refused 500 before anything is read, never the shared pool (pinned in `study-design-planning.route.test.ts`). Baseline 229 → 228, removing only `server/routes/templates.ts`, deleted in `83849bfdd`. `--write-baseline` used to delete the file's `_comment` (its rebaseline history); it now keeps it.
   **→ The D3 lane (`…01YZFCXR`, `72c4c6ee6`, inside its window, not edited):** `ci:audit-logs-fixture` is red on `server/routes/__tests__/approval-workflow.contract.test.ts:217`. The stand-in `CREATE TABLE audit_logs (id, tenant_id, actor_id)` added for `public.actor_name` lacks the columns the chained audit writer writes. `AUDIT_LOGS_PGLITE_DDL` (`server/db/pglite-harness.ts`) carries `tenant_id` and `actor_id` too, so importing it in place of the stand-in should satisfy both.
5. **→ Whoever owns project rules (Projects), found by the D5 lane, not fixed:
   the rules engine cannot create a task, and could not record one if it did.**
   - `POST /api/project-rules` (`server/routes/project-rules.ts:159`) binds
     `JSON.stringify(data.tags)` to `project_rules.tags`, a `text[]`. Postgres
     refuses both `'[]'` and `'["a"]'` (*malformed array literal*), so no rule
     can be created and none exists on a deployed database. It is the table's
     only writer. It also never sets `created_by_id`, and rule create, update
     and delete write no audit row.
   - The rules engine's `create_task` (`server/services/rules-engine/actions/index.ts:82`)
     inserts `status 'todo'`, outside `TASK_STATUSES`. It inserts
     `module_type = params.moduleType || null` against a `NOT NULL` column,
     and both shipped templates (`project-rules.ts:527,571`) omit `moduleType`.
     It writes no `task.create` row. No emitter passes a `userId`
     (`projects-management.ts:315,480,487`, `sentinel/scheduler.ts:171`), so
     there is no actor to record.
   - Before this path is revived, a rule needs a recorded author to attribute
     its actions to, and `create_task` needs the pattern
     `tasking/blueprint-milestones.ts` uses: the insert and its row on one
     transaction, and nothing written when no one can be named.
6. **→ `…01GJidg5` (`server/routes/authoring-actions.ts`, touched 2026-09-28
   18:28, inside its window).** `/api/authoring-actions/approve-artifact` and
   `/lock-artifact` record an approved or locked version with no signature at
   all. The status route now signs both acts, so these are the one API path
   around the ceremony (no client calls them). Route each through `verifyReauth`
   and `commitSignedArtifactAct` (`server/services/artifact-signed-act.ts`),
   or refuse them. `server/routes/__tests__/lockArtifactCoversApproval.test.ts`
   pins their current behaviour.
7. **→ `…01GJidg5` (`cmcRegisters.tsx`, `288411a4e`, 16:21).** Trunk CI 12615:
   `client/src/concept2cure/v2/__tests__/cmcSuiteWrites.test.tsx` ›
   CmQcTesting fails 2/2 locally at HEAD. *"a review PUTs the disposition and
   the reviewer"* and *"refuses to let the analyst review their own result"*
   both wait for `S-2` and find *"No QC testing records yet"*.
8. **→ `…01KiDof7` (`server/routes/global-compliance.ts`, `80cbd718a`, 18:00).**
   Trunk CI 12615 fails on this file in two places:
   - `npm run ci:org-path-param-guards` fails on it.
   - `tests/artifact-change-invalidates-bundles.contract.test.ts` fails with
     *"BACKSTOP_ONLY lists files that no longer write those columns; remove
     them"*, naming this file.
   - **Both done 2026-09-29 by `…01DiJJAk`** (item 16; the stale `BACKSTOP_ONLY` entry removed, its comment now names `erasePersonalData` as the one erasure).
9. ~~**→ `…01PwLFr8` (`f0147f452` / `7b00c78de`).** Trunk CI 12615 fails two
   gates on this session's files:~~ **Done 2026-09-29.** `ci:tenant-entry-points`
   was fixed in `8686a321`. The CSS shadowing is fixed; see the validation-package
   section's item 9 and `docs/evidence/W1/2026-09-29-trunk-ci-item9/`.
   - `ci:tenant-entry-points` fails because `server/routes/mdx-admin.ts`
     changed since its justification.
   - `ci:check-css-selector-shadowing` fails on
     `client/src/concept2cure/v2/styles/app-v2.css`: `.c2c-v2 .crumbs .sep` is
     defined at lines 1480 and 1484.
10. **→ `…01KiDof7` (`server/services/ana-ri/command-executor.ts`, `dc48d9264`,
    17:32, inside its window). Found by the review of the artifact approval
    signature.** AnA `update_artifact_status` (`command-executor.ts:818`) sets
    an artifact approved or locked with a reason only. It is not in
    `PART11_ESIGN_COMMANDS` (`part11-governance.ts:88`). It records no
    version, so the result is not filable. But after a signed approval it can
    lock the artifact with no re-authentication, no release signature and no
    snapshot, and the artifact then reads as locked. Make approve and lock
    e-signature-tier, or refuse them and name the status route, which now
    signs both (`server/services/artifact-signed-act.ts`).
11. **→ `…01YZFCXR` (the D3 lane; `migrations/20260928_invitations_for_member.sql`,
    `7347a3e2f`, 2026-09-28 18:22).**
    `tests/schema-contract/tenant-isolation-sweep.contract.test.ts` › "C-33: the
    batch applies in set order, twice, and ends fully isolated" fails at pass 1
    on this file: *"relation public.organization_invitations does not exist"*.
    A database the set builds does not have the table when the file runs.
    Guard the statement on `to_regclass('public.organization_invitations')`
    or move the file after the table's creator. The replay stops here, so no
    file after it is exercised by that contract.

### Found by the D6 owner-grant change (`…01PwLFr8`, 2026-09-29) — handed on

1. **→ W2 / D1, the Terraform lane (`…013CtPf8`, `terraform/stack/*`): a
   production deployment cannot name its first owner.**
   - Since `d57bff619` (`docs/evidence/D6/2026-09-28-owner-grant/`) there is no
     owner address in source. Platform administration and the owner grant come
     from two places only:
     - the `PLATFORM_ADMIN_EMAILS` and `MASTER_ADMIN_EMAILS` allowlists
       (`requirePlatformAdmin.ts`, `master-admin.ts`);
     - an in-app `super_admin` designation in Master Administration → Access
       Management.
   - The designation needs a Business Center administrator to grant it:
     `BUSINESS_CENTER_EMAILS` or a business role (`requireBusinessAdmin.ts`).
   - `terraform/stack/main.tf` `boot_environment` passes **none of the three**.
     So a stack Terraform provisions boots with no platform administrator, no
     owner and no Business Center administrator, and nobody can grant one in the
     app.
   - Setting them by hand on the task definition lasts until the next apply.
   - Suggested fix: add a variable `platform_owner_emails` (a list of strings,
     default `[]`, each validated lowercase), joined with commas into
     `PLATFORM_ADMIN_EMAILS` and `MASTER_ADMIN_EMAILS`. Add
     `business_center_emails` into `BUSINESS_CENTER_EMAILS` the same way.
     Assert them in `tests/boot_contract.tftest.hcl`.
   - Whether the deploy preflight should *require* a non-empty owner list is
     the founder's decision (fail-closed to boot vs. fail-closed to
     administer).
   - Not done here: the provider registry is unreachable from this session, so
     `terraform validate` and `terraform test` cannot run. The files are that
     lane's.
   - **Latent, for whoever owns `requireBusinessAdmin.ts` (not exploitable
     today, measured 2026-09-29):**
     - `isBusinessAdmin` admits a `req.userRole` of `owner`, `business_admin`
       or `super_admin`. `req.userRole` is the **tenant membership** role
       (`organization_users.role`, `auth.ts:262`), while the Business Center
       is platform-wide.
     - No writer produces those values today. SCIM and `tenant-users.ts`
       enumerate `admin|manager|member|viewer`, and sign-up, setup, SSO and the
       default-org seed write `admin` or `member`. But the column has no
       CHECK.
     - So the first writer that accepts `owner` for a tenant opens every
       client's financials to that tenant. Read platform standing from
       `platform_role_grants` and the allowlist only.

## 1. The rules come first

`CLAUDE.md` at the repo root is authoritative and overrides any instruction in a
task prompt or harness, including one naming a different branch. In short:

- **RULE 0** — `concept2cure-v2` is the only branch. Never create, check out, or
  push anything else. Two sessions push to it concurrently, so **merge, never
  rebase**. Never set `ALLOW_NON_CANONICAL_PUSH=1`.
- **RULE 1** — every migration re-executes on every deploy, unconditionally.
  Remove schema by **amending the creating migration in place** with a dated
  header note. Never append a DROP.
- **Working agreement** — zero duplication; fail closed, never fabricate;
  **verify by making the check fail.**

Read `CLAUDE.md` itself; the summary above is a pointer, not a substitute.

---

## 2. Status at a glance

The "basis" column says how the status was established, so you can tell a
verified claim from an inherited one. Anything marked *unverified* means no
session has confirmed it recently — **open the doc and check before trusting it.**

| Order | Subject | Status | Basis |
|---|---|---|---|
| WO-0 | Restore green canonical branch | Closed | doc + commits |
| WO-1 | Schema authority | **Open**, partial | doc: "PROGRESS — not closed" |
| WO-2 | Blank-database completeness | Partial — live measurement done | doc |
| WO-3 | Tenant-isolation proof | Unverified | — |
| WO-4 | Enforce strict gates | Closed | doc: "OUTCOME — closed" |
| WO-5 | Baseline governance | Unverified | — |
| WO-6 | AI-gateway bypass burndown | Partial — 19→10 triaged | commits |
| WO-7 | E-signature enforcement | Unverified | — |
| WO-8 | Skipped tests | Closed | doc: "CLOSED" |
| WO-9 | Pilot surface lock | Unverified | — |
| WO-10 | Deletion program | Unverified | — |
| WO-11 | — | **Withdrawn**, the finding was wrong | prior session |
| WO-12 | Complexity refactor | Unverified | — |
| WO-13 | GRDHE tenant scoping | Partial | doc: "What is now fixed" |
| WO-14 / 14A | Cortex Prime broken and mounted | Partial, some left deliberately undone | doc |
| WO-15 | Schema the code expects that no deploy creates | **All nine resolved** — 8 fixed, 1 refused | verified 2026-09-17 |
| WO-16 / 16B / 16C | Fabricated content sweep | Largely closed | docs + commits |

---

## 3. WO-15 — the active lane

Nine findings. State as of 2026-09-17:

| Finding | State |
|---|---|
| 1 | **Refused** by adversarial review. Stays refused — do not reopen without new evidence. |
| 2 | **Fixed** — 21 declared columns added on the applier. Confirmed as written, and it corrected my own finding-3 error: push does NOT create the charter tables. |
| 3 | **Fixed** `0186d8d2d` — charter audit Part 11 append-only triggers |
| 4 | **Fixed** `153481465` — `/api/design-risk` deleted: 20 endpoints over ten tables that exist on no database |
| 5 | **Fixed** — `20260716_template_doc_types.sql` listed in the set, its false `KNOWN_UNLISTED` exemption removed. Confirmed, not corrected: the finding was right. |
| 6 | Fixed (earlier session) |
| 7 | **Fixed** `4c6f38153` — `contradiction_consequence_log` column name + fabricated `detected_by` default |
| 8 | **Fixed** `b9152a016` — the installer could not see the `vault` schema, which was hiding `vault.evidence_citations`: declared, INSERTed into by `advancedRAGPipeline.ts:1316`, created by no applier |
| 9 | Fixed (earlier session) |

Findings 3 and 7 in `WO-15-...md` each carry a **CORRECTED** block. The original
finding text is preserved beneath it under "Original finding, as written" — read
the correction first; in both cases the original headline was wrong.

**All nine findings are resolved: 8 fixed, 1 (finding 1) refused by adversarial
review and staying refused.** Three had wrong headlines (3, 7 and — in the
opposite direction — my own correction to 3); two were right as written (5, 2).
Check each claim, do not assume either way.

One item surfaced here was NOT part of WO-15's nine and is now also **fixed**:
10 of the 15 `KNOWN_UNLISTED` entries in
`tests/ops/apply-c2c-migrations-manifest.test.mjs` failed that list's own stated
reason, covering 16 tables. All ten are now on the applier and their exemptions
are gone, with `tests/schema-contract/known-unlisted-reason-holds.contract.test.ts`
enforcing the rule the list only stated in prose. The first figure published here
was "14 of 16" from a crude heuristic; re-measured it was 10 of 15. See WO-15
finding 5.

With WO-15 and the `KNOWN_UNLISTED` triage both closed, the next unclaimed work
is the untouched orders in §2 — WO-3, WO-5, WO-7, WO-9, WO-10 and WO-12 are all
marked *unverified*, meaning no session has confirmed their status recently. Start
by re-deriving the status rather than trusting the row.

---

## 4. Lessons that cost real time — do not relearn these

**A green migration against a database that happens to be complete is not
evidence that the migration *set* is complete.** Finding 3's first attempt added
`migrations/20260629_charter_tables_rebuild.sql` to `C2C_MIGRATION_FILES` and
passed a live-database proof. It was wrong: the file has five
`REFERENCES project_charters(id)` clauses and nothing in the set creates that
table. (This paragraph first said "Drizzle push does" — it does not, and that
error is itself WO-15 finding 2's subject: `project-charter.ts` is re-exported
from `shared/schema/index.ts`, which is not a drizzle entrypoint, so the charter
tables are outside the push surface and come from install-fresh's overlay.) The
live database already had the table from install-fresh, so the proof could not
expose the gap.
`tests/schema-contract/tenant-isolation-sweep.contract.test.ts` C-33 applies the
set to a **bare** database and caught it. Run the schema-contract shards before
believing any change to the set.

**There is no such thing as a standalone deploy-migrate-lineage database.**
`scripts/db/deploy-migrate.mjs` refuses an unprovisioned database ("Missing base
tables: organizations, users, c2c_documents, …"), so install-fresh provisions
every database and its step-3 overlay (`migrations/*.sql`) always applies first.
Several WO-15 findings are framed as two competing lineages. **That framing is
wrong wherever it appears** — check it before acting on it. In finding 7 it
*understated* the defect: it is always the same four writes that fail, on every
database, not four-of-nine depending on how the database was built.

**`CREATE TABLE IF NOT EXISTS` converges nothing.** It never adds a column to, or
alters a column on, a table that already exists. Amending a creating migration
fixes only what a *new* database gets; an existing one needs
`ALTER TABLE … ADD COLUMN IF NOT EXISTS` inside `C2C_MIGRATION_FILES`, which is
the only applier that touches a populated database. Both halves are usually
required and neither substitutes for the other.

**A gate's blind spot is where the defects live.** The installer verified
`drizzle-kit push` by counting tables, and both halves of the count were
public-only — the regex matched `pgTable('name')`, the query filtered
`table_schema = 'public'` — so all six `vault.table('name')` declarations were
outside its view while it printed "declared tables verified present". Behind
that: `vault.evidence_citations`, declared in Drizzle, created by a file under
`db/migrations/_legacy/` that no applier's non-recursive glob descends into, and
INSERTed into by `advancedRAGPipeline.ts:1316` on every retrieval — the 42P01
swallowed by a `console.warn`. When a gate has only ever passed, ask what it
cannot see, then hide something it should catch and check that it fails.

**"A real implementation exists" and "which one is canonical" are different
questions.** An earlier fix in this sweep resolved a fabrication by wiring a
route to a real implementation that was not the canonical one, entrenching a
duplication while removing the fabrication. Check for a canonical implementation
(own test suite, multiple consumers) before wiring anything.

**Prove it by making the check fail.** For a schema change that means breaking a
real database in the exact way the migration exists to repair — drop the trigger,
drop the column, run the real applier, watch it come back. For a code change it
means running the new test against the unfixed code first and seeing it name the
real defect.

---

## 5. Verification commands

Per change, not batched at the end:

```bash
npm run ci:migration-set-order && npm run ci:migration-drop-safety
npm run ci:migration-reachability && npm run ci:duplicate-table-ddl

# Run in three shards — one invocation OOMs the container.
npx vitest run tests/schema-contract/ --shard=1/3   # then 2/3, 3/3

DATABASE_URL='postgresql://…' node scripts/db/deploy-migrate.mjs
npm run ci:tables-live-schema
```

A local Postgres may already be running with the socket in `/tmp` rather than
`/var/run/postgresql` — `PGHOST=/tmp` reaches it. `c2c_testdb` is an
install-fresh-provisioned database suitable for applier proofs.

---

## 6. If you are a new session picking this up

1. Read `CLAUDE.md`, then §3 and §4 above.
2. Open `WO-15-...md` and read findings 3 and 7's **CORRECTED** blocks — they
   record how the two most recent fixes were reached and what was wrong with the
   original analysis.
3. Start on finding 4 with the `audit:orphaned-endpoints` check.
4. Update this file when a status changes. A stale index is worse than none,
   because it is trusted.

---

## 7. The DEAD-surface deletion (2026-09-18, schema-authority lane)

The live-schema baseline listed relations that server SQL references and that no
database has. Grouped by referencing file, they were a handful of coherent
**surfaces**, not independent tables — so the unit of work was a surface, and the
decision per surface was binary: **LIVE** → provision it durably, **DEAD** →
delete it. This records the DEAD half.

### What was deleted, and the evidence for each

| File | Why it was safe to delete |
|---|---|
| `server/services/analytical/lims.ts` | Unreferenced module (nothing imports its exports). Sole referencer of 4 `analytical_*` tables. |
| `server/services/knowledge-graph.ts` | Unreferenced. Sole referencer of 6 `lumen.*` graph tables/views. |
| `server/api/neuro-symbolic/routes.ts` | Unmounted route module — on no router. |
| `server/workers/entity-extraction-worker.ts` | Imported only by the two modules above. |
| `server/workers/enhanced-ingestion-pipeline.ts` | Unreferenced. |
| `server/workers/layout-aware-ingestion.ts` | **Cascade** — imported *only* by `enhanced-ingestion-pipeline.ts:17`. |
| `server/db/database.js` | Self-described legacy shim; zero import specifiers anywhere. |

The last two were not in the original set. They became unreachable *because of*
the first five, and `ci:unreferenced-modules` reported them as NEW unreferenced
modules on the next run. **That gate finding the cascade is the reason to trust
the deletion**: deleting a module surfaces whatever only it kept alive, so the
gate, not the analysis, decides when the cascade has stopped.

### What the deletion moved

| Gate / baseline | Before | After |
|---|---|---|
| `scripts/ci/tables-live-schema-baseline.json` | 60 | 47 |
| `scripts/ci/unbacked-tables-baseline.json` | 37 | 27 |
| `scripts/ci/unreferenced-modules-baseline.json` | 97 | 94 |
| `scripts/db/referenced-tables-baseline.json` (`knownMissing`) | 10 | 9 |

Every baseline moved in the **shrink** direction only; the regenerated
`unreferenced-modules` baseline was diffed to confirm it removed exactly three
entries and added none. A `--write-baseline` that quietly adds an entry launders
a new defect into an accepted one, so the diff is the check, not the exit code.

### Two things the deletion forced, neither of them mechanical

- **`tests/schema-contract/c2c-apply-path.contract.test.ts`** pinned an INSERT
  column list by reading `enhanced-ingestion-pipeline.ts`. With that file gone
  the test failed on its own `read()`. It was **removed rather than re-pinned**,
  because there is no remaining writer to pin it to — and that absence is itself
  the finding now recorded in §0 for the council lane. The surviving assertions
  still carry C-12, and were proven to discriminate by deleting `atom_type` from
  the canonical migration and watching the suite go red.
- **`server/services/embedding-corpus-policy.ts:130`** named
  `layout-aware-ingestion.ts` as "the active writer" of `vault.document_chunks`.
  It was not: the real writer is
  `server/services/vault/document-chunking.service.ts:110`, which is imported by
  `vault-ingest.service.ts:333` and `startup/document-catalog-bootstrap.ts:48`.
  The registration's *conclusion* (3-small) was right by luck — the real writer
  independently uses the same model — but its stated evidence named a module that
  never ran. Corrected in the policy file and its test.

**The lesson worth keeping:** a comment naming the module that justifies a
config value is load-bearing evidence. When it names a module nothing imports,
the value has never actually been checked against anything.

---

## 8. Triage correction — two "DEAD" verdicts were wrong (2026-09-18)

The plan's cluster triage was produced by Explore agents. Re-verified by tracing
mounts directly, **two of the three DEAD verdicts do not hold.** Recording this
because acting on them would have deleted live surfaces.

| Surface | Agent verdict | Verified | Evidence |
|---|---|---|---|
| `server/api/cmc/playbookRoutes.ts` | DEAD | **LIVE** | `blueprintRoutes.ts:9` imports it, `:748` mounts it at `/playbook`; `register-core-routes.ts:68` mounts `blueprintRoutes` at `/api/cmc/blueprint` — unconditionally (a plain `try` block, not a feature gate). Reachable at `/api/cmc/blueprint/playbook/*`. |
| `server/api/cmc/portfolio.ts` | DEAD | **LIVE** | Same router: `blueprintRoutes.ts:8` imports, `:746` mounts at `/portfolio`. Reachable at `/api/cmc/blueprint/portfolio/*`. |
| `server/routes/cognitive-ecosystem.ts` | DEAD | **DEAD, but blocked** | Explicitly retired (#844, Phase 0.2) and unregistered — see the note at `register-document-routes.ts:246`. See below for why it was not deleted. |

So 8 of the 47 baselined relations belong to **live, mounted endpoints** and need
**provisioning**, not deletion:

- `/api/cmc/blueprint/playbook/*` → `cmc_workflows`, `cmc_workflow_instances`,
  `cmc_workflow_tasks`, `cmc_checklist_instances`, `cmc_ai_tool_executions`
- `/api/cmc/blueprint/portfolio/*` → `reg_submissions`, `reg_m3_sections`,
  `reg_rpi_snapshots`

**The method that caught this:** grep for the *exact* import path, not the
basename. A basename search for `portfolio` matches `ind-portfolio`,
`portfolio-simulation` and `protocol-portfolio-metrics`, none of which is the
file in question — and a bare `from './types'` matches every service directory
in the repo. A loose pattern produced a confident, wrong DEAD verdict; the same
loose-matching error cost this lane a day earlier (§4).

### Why `cognitive-ecosystem` was NOT deleted, though it is dead

It is a self-contained unmounted island: the route, plus the 11-file
`server/services/cognitive-ecosystem/` subtree. The **only** external importer of
that subtree is the route's own line 28 — and that import is empty
(`import { } from '../services/cognitive-ecosystem'`), the residue of the
retirement. Nothing else in `server/` or `client/` imports any of it.

Route and subtree are therefore **one decision, not two**: only the route is in
`unreferenced-modules-baseline.json`; the 11 service files are absent from it
precisely *because* that empty import still counts as a reference. Delete the
route alone and the whole subtree becomes newly unreferenced — the same cascade
§7 describes, but this time landing on files that must not be quietly baselined.

**The blocker is Part 11, and it is real.** `cognitive-audit.service.ts` is the
sole writer of four `cognitive_audit.*` tables that **do exist** on a provisioned
database (`db/migrations/064_gcc_cognitive_audit_schema.sql`) and are **not** in
the live-schema baseline. `server/services/audit/domain-history-link.ts:216-237`
records that service as the registered `owner` of all four, with semantics like
*"One AI reasoning step with its prompt and semantic content (own hash chain)"*
and *"One e-signature applied over cognitive-audit content."*

Deleting it would remove the only writer of provisioned electronic-signature and
audit-chain schema and leave four dangling owner entries in the audit domain map.
That is a compliance decision, not a cleanup, so it is **recorded rather than
guessed at**. Whoever takes it needs to answer: are the `cognitive_audit.*`
tables retired along with the subtree — in which case the domain-map entries and
migration 064 go too — or is the subtree meant to be re-mounted?

Contrast with `federated_*` (4 baselined entries, referenced by the route and by
`federated-learning.service.ts` only): those tables exist nowhere, so they carry
no such coupling. They are blocked only by being on the same island.

---

## 9. CMC playbook provisioned — and the fabrication that provisioning would have switched on (2026-09-19)

First of the **LIVE** surfaces from §8. `/api/cmc/blueprint/playbook/*` is
mounted unconditionally and all five of its tables were missing, so every one of
its endpoints returned 500.

### The part that was not mechanical

`playbookRoutes.ts` answered an empty read with **two hardcoded template objects
under `success: true`**:

```ts
if (result.rows.length === 0) {
  const defaultWorkflows = [ /* two invented ICH templates */ ];
  return res.json({ success: true, data: defaultWorkflows });
}
```

While the table did not exist the query **threw**, so that branch was
unreachable and the 500 was honest. **Creating the table would have made it
live** — turning an honest failure into invented data presented as records. The
migration alone would have made the product less truthful than it was.

So the branch was deleted in the same commit, and the twelve real templates are
now seeded rows. **Generalise this before provisioning any other surface in §8:
check what the handler does with an empty result before you give it one.** An
empty-result fallback is invisible while the table is missing.

### Where the schema came from

A correct DDL file already sat at `server/database/cmc-playbook-schema.sql`, on
**no applier** — not `install-fresh`, not `deploy-migrate`, not drizzle push.
That is precisely why the tables were missing. It was **moved**, not copied:
`ci:duplicate-table-ddl` scans 573 non-archived `.sql` files, so a second
creator is a new duplicate, and the working agreement requires the parallel path
to be deleted in the same change.

Four deliberate changes, each with a dated note in the migration:

| Change | Why |
|---|---|
| `cmc_workflows` omits the `organizations` FK | Its seed writes `organization_id = 0`, the platform's documented shared tenant (`playbookRoutes.ts:41`, `tenantRls.ts:93`, `authedOrgId.ts:55`). `organizations.id` is `serial` and **no applied migration inserts any organizations row**, so org 0 does not exist and the FK would fail the seed at apply time. The other four tables keep it. |
| `cmc_workflow_tasks` gains `organization_id INTEGER NOT NULL` | It had no tenant column, which puts a table outside the population **every** RLS sweep operates on — the exact cause `check-unkeyed-request-tables.mjs` was written for. `playbookRoutes.ts` now supplies it; column and code had to land together. |
| `command` is `TEXT`, not `VARCHAR(255)` | It stores `req.body.command`, unbounded client input. |
| Row-count assertion on the seed | RULE 1: seed data reaching a deployed database cannot be corrected in place, so a truncated seed must fail at apply time. |

`cmc_checklist_items` and `cmc_guideline_access` were **not** carried over — no
TypeScript references either. Don't provision a table before it is real.

### Verified, including by making each check fail

- Applies to a bare database and **replays cleanly** (still 12 rows) — RULE 1.
- Seed assertion proven: deleting one row from the literal fails apply with
  *"expected 12 rows at organization_id = 0, found 11"*.
- Ordering proven load-bearing: moving the entry after the sweep turns
  `ci:migration-set-order` red; restored, green.
- `tests/schema-contract/cmc-playbook-schema.contract.test.ts` (13 tests) pins
  every handler statement **extracted from source**, so it cannot drift. Both
  regressions were induced and caught: dropping `organization_id` from the tasks
  INSERT, and restoring the fabricating fallback.
- `tables-live-schema-baseline.json` 47 → 42, hand-edited, exactly those five.

### Still NOT provisioned: `reg_*` / the portfolio surface

`/api/cmc/blueprint/portfolio/*` is equally live, but provisioning it was
**refused** — three blockers, all evidenced:

1. **Nothing writes the data.** No file in the repo INSERTs into
   `reg_submissions` or `reg_m3_sections`. They are read-only. Provisioning
   yields permanently empty tables and a feature that is inert while *looking*
   provisioned. The single INSERT anywhere in the group is
   `reg_rpi_snapshots` at `portfolio.ts:187`, which derives from the two empty ones.
2. **The only DDL contradicts the code.** `db/migrations/_legacy/060_regulatory_foundation.sql:25`
   defines one `upstream_json jsonb`; the code needs three separate columns —
   `up_proc`, `up_quality`, `up_stability` (`rpi.ts:35,42,49`, `portfolio.ts:112,254`).
   `upstream_json` appears in no TypeScript; the three `up_*` appear in no SQL.
   Both `_legacy` trees are walked by no applier.
3. **The status domain disagrees.** Code treats `'LOCKED'` as terminal
   (`portfolio.ts:111,253`, `rpi.ts:24`); the DDL enumerates
   `'MISSING','DRAFT','READY','COMPLETE'` with no `'LOCKED'`. A `COMPLETE`
   section would be counted as *missing*.

Authoring a shape no migration ever agreed on, for tables nothing fills, is
schema invention. It needs a product decision about where submissions data comes
from — not a guess from this lane.

### Two findings handed on, not fixed here

- **`reg_submissions` is read with no tenant filter in two places.**
  `server/src/services/reg/rpi.ts:17` (`where sub_id=$1` only) relies on its
  caller having already scoped by `tenant_id`; `server/src/services/integrations/gmail.ts:89`
  does `SELECT sub_id … ORDER BY created_at DESC LIMIT 1` with no filter at all,
  returning the newest row **across all tenants**. Only reachable through
  `gmailIngestToReg`, which nothing calls — dead today, a cross-tenant read the
  moment it is wired up.
- **`playbookRoutes.ts:444` `generateFallbackResult`** returns synthesized
  regulatory prose when the AI call fails, persisted into
  `cmc_ai_tool_executions.result`. It is at least labelled `status: 'fallback'`
  (line 421). Left alone deliberately — a different concern from this migration,
  and `server/api/` is outside the WO-16C fabrication sweep's stated scope of
  `server/services/` and `server/routes/`, so it belongs to nobody right now.
