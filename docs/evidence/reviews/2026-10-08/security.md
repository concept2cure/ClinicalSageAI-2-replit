# security lens — weekly launch-catalog review, 2026-10-08

Head reviewed: `373c9af51`. Auditor run read-only. Every blocker, high and medium finding that is new or still open went to a separate verifier told to refute it; its verdict follows each finding. Low findings were not independently verified.

## Coverage, as the auditor reported it

Lens: security and tenant isolation. HEAD 373c9af51, checkout of concept2cure-v2, 2,206 commits after aff7eae16. Nothing was edited and no write-baseline flag was run.

**Open items from 2026-09-28.** All three are fixed at HEAD:
- IAM-19: `/ana` now re-checks its session. `ana-realtime.ts:293` calls `startSessionRecheck`, the shared implementation in `server/socket/sessionRecheck.ts`.
- SEC-0928-1: `retire_qms_document` is class `refuse` in the register (about line 5593), and its handler is a `refuseSignatureInChat` stub (`AnaToolExecutor.ts:14339`).
- SEC-0928-2: `authEnterprise.ts` now uses `auditOrganizationOf(user)` at lines 282, 295, 311, 342 and 380.

**Reporting review 2026-10-01.** I re-read the fix for SECURITY-2, 4, 5 and 12 and found each in place:
- SECURITY-2: `part11-compliance.ts:705-706` applies `requireAuditRecorder` and `clientEventRefusal`.
- SECURITY-4: `mdx-audit.ts:212` applies `requireAuditReader`.
- SECURITY-5: the registry at `ui-surface-registry.ui-v2.ts:855` claims only `/api/report-os/runs` and `/api/insights-canvas`.
- SECURITY-12: `report-os-insights.ts:311` refuses with `FORECAST_NOT_SCOPED`.
- SECURITY-3 (finalize) is signed through `signGovernedAct`; I saw `requireRole(...REPORT_FINALIZE_ROLES)` at `report-os.ts:2074`.
- The SECURITY-6/7/8/9/10/11 fixes are taken from the README's commit list. I did not open each commit.
- SECURITY-1 residual: still open at low severity (see the findings).

**Sweep.** I read in full:
- the new gateway-accounts route and service
- `governed-transmit.ts`
- the `/api/c2c/actions` handler
- the `/api/c2c/documents` lock route
- the tenant-users and invitation flow
- the P-18 role change
- the refresh and `verifyLiveToken` token-class call sites

I confirmed every `verifyLiveToken`/`jwt.verify` call in `auth.ts` and `authEnterprise.ts` applies `requireAccessTokenReason` or the refresh-type check. I used the repo's own `launchScopeApiVerdict` to test whether suspected doors are reachable in production. That showed `/api/ana/authoring-plan/*` is out-of-scope (403 in production), so I dropped a suspected ungoverned authoring-plan approve finding. It showed the lock and transmit doors are `launch`.

**Not covered.**
- I did not read the 2,141 changed server files line by line.
- I did not re-read the individual DP-02 sign-ceremony writers beyond the gate.
- Nothing ran against a live server, database, KMS, AWS or GitHub, so branch protection, CI run history and deployed task definitions are unverified.
- Immutability triggers and runtime-role DELETE grants were sampled only. The tenant-purge function is gated by a session-set `app.current_user_role`, but it also requires `pending_deletion` and no legal hold. I judged it acceptable.
- AI egress: the gateway enforces approved-models at every risk level (`model-governance.ts`) and `ci:gateway-bypass` passes. I did not trace every model call site.
- Upload and outbound-`fetch` checks rest on the gates (`ci:upload-guards`: 1 baselined, `vault-ingest.ts`, guarded in the service). I did not audit each site.

**Gates.** All 19 read-only gates passed, plus `ci:upload-guards`.

| Gate | Result | Baseline, direction |
|---|---|---|
| `ci:committed-secrets` | pass | none |
| `ci:no-dev-auth-in-prod` | pass | none |
| `ci:unauthenticated-fetch` | pass | 71 sites, 0 baselined; was 70 |
| `ci:path-containment` | pass | 3 baselined, flat |
| `ci:org-path-param-guards` | pass | 45 of 45 guarded; was 43 |
| `ci:jwt-verify-pinned` | pass | none |
| `ci:client-ip-single-source` | pass | none |
| `ci:server-error-leaks` | pass | 10 sites in 10 files; was 119 in 76, down (genuine paydown in `55518c70d` and others) |
| `ci:discarded-audit-write` | pass | 112 in 50 files; was 125 in 56, down, 5 files below count and unbanked |
| `ci:sign-ceremony` | pass | 20 sites; was 23, down |
| `ci:regulated-delete-audit` | pass | none |
| `ci:gateway-bypass` | pass | 8, flat |
| `ci:dead-audit-catch` | pass | 0, flat |
| `ci:session-scoped-rls-bypass` | pass | 34 in 7 files, flat |
| `ci:drizzle-tenant-scope` | pass | 110 sites; was 125, down, 17 fixed and unbanked |
| `ci:tenant-entry-points` | pass | 14 entry points, 9 not considering entitlement, flat |
| `ci:tenant-isolation:no-regression` | pass | 7 current vs baseline 8, down |
| `check:security-patterns` | pass | 0 violations in 3,083 files |
| `check:compliance-claims` | pass | 1,146 files |
| `ci:upload-guards` (extra) | pass | 1 baselined |

CI honesty: the `continue-on-error` steps I found are SBOM generation, SARIF upload, preview-DB and Neon steps, not gates. The Semgrep full-scan step fails on a non-zero exit. CI runs on push, pull request, merge group and a nightly schedule.

**Baseline ids re-verified as still closed:**
- IAM-04 and IAM-06, the refresh and revocation path: standing, idle and token class checked at `auth.ts:1415-1530`.
- IAM-12 and IAM-19, socket re-check.
- DP-31 and DP-32 (QMS retire, now signed on both doors).
- DP-36, the tool-authorization register: 'refuse' tier added.
- DP-38 and DP-18, the audit and part11 audit-trail recorder gates.
- DP-34, `/api/qms` removed.
- DP-49 and DP-57 for role change and removal: in-transaction chained audit, `tenant-users.ts:603-686`. DP-49 is not closed for account creation (see the findings).
- SEC-0928-2.
- INF-04 SPA headers: `response_headers_policy` is present in the cloudfront module.

**Still open and unchanged (two of the findings below):**
- DP-05
- INF-05

## Findings

### SEC-1008-1 — POST /api/mdx/gateways/:region/:gateway/transmit sends to the agency with no signing-authority check, and writes its e-signature row only after the send, inside a swallowed catch

- **Status:** new · **Severity (auditor):** high · **App:** Submission Center · **Row:** D5 (D7)
- **Where:** `server/routes/mdx-submission-gateway.ts:219-251 (route); server/services/submission-gateways/governed-transmit.ts:656-696 (send), 737-853 (signature written after send, failure swallowed)`
- **What:** Clauses: 21 CFR 11.10(g), 11.50, 11.70, 11.200(a). The only gates on the irreversible FDA ESG/EMA send are requireEditorAccess (excludes only 'viewer'), a password/TOTP verifyReauth, and assertTransmitterIndependent (package creator cannot transmit). No isSigningAuthorized or assertSigningAuthority call exists in mdx-submission-gateway.ts, governed-transmit.ts or signature-persistence.ts (grep: the only callers in the submission area are submission-sign-release.ts:182 and ana-ri/seal-verified.ts:118, which do check). A 'member' or 'manager' can therefore transmit a package to a regulator with a password and a free choice of meaning, and the system then persists an electronic_signatures row (persistGovernedActionSignature at governed-transmit.ts:797) attesting a signature by someone the signing policy says may not sign. The sibling path POST /api/submissions/sequences/:seqId/transmit (submissions.ts:1841) is safe because it consumes a prior signed signatureActionId, so the HTTP door is a second door beside it. Reachability: launchScopeApiVerdict('/api/mdx/gateways/fda/esg/transmit') returns 'launch', and client/src/concept2cure/v2/surfaces/GatewayTransmittals.tsx drives it. Separately, the ledger pair and signature row are written after the send and a failure only sets ledgerWriteFailed (governed-transmit.ts:846-853), so bytes can reach the agency with no signature row. The route surfaces the flag, so this is disclosed rather than hidden, but the send is not ceremony-gated before it happens.
- **Fix:** Call the one signing-authority check (resolveSignerOrgRole + isSigningAuthorized, as submission-sign-release.ts:174-186 does) before verifyReauth and before executeGovernedTransmit, in the HTTP route and in executeGovernedTransmit itself so the AnA k510 handler (ana-ri/mdx-command-handlers.ts:827) inherits it. Add a test that a manager and a member get 403 ESIGNATURE_NO_AUTHORITY with nothing sent.
- **Verifier:** confirmed, severity high. server/routes/mdx-submission-gateway.ts:219: the only middleware on the route is requireEditorAccess. That middleware (server/middleware/orgMembership.ts:569) admits every GOVERNED_WRITE_ROLES role, and that set includes manager and member (:506-510). The handler then runs only verifyReauth (:238). executeGovernedTransmit (governed-transmit.ts) has no role or authority check: grep finds no isSigningAuthorized, resolveSignerOrgRole or signingAuthority in it. Its only separation-of-duties check is assertTransmitterIndependent at :653, and gw.transmit at :656 sends with authorization {kind:'governed-http'} and no role. persistGovernedActionSignature (part11/signature-persistence.ts:752) checks meaning but not role. The mount at bootstrap/register-inline-routes.ts:1226 adds no gate. Ordering is as described: the ledger, signature row and transmittal metadata are written after the send (governed-transmit.ts:734-843), and a failure only sets ledgerWriteFailed (:844-853). The comment at :729-733 says this is intentional. GatewayTransmittals.tsx drives the route, and ana-ri/mdx-command-handlers.ts calls executeGovernedTransmit directly, so that path inherits the gap. The send is irreversible and goes to the agency, so high is justified.

### SEC-1008-2 — POST /api/c2c/documents/:id/lock sets status='locked' for any member: password only, no signing authority, no electronic_signatures row, no meaning

- **Status:** new · **Severity (auditor):** high · **App:** Authoring / Vault (filing outline documents) · **Row:** D5
- **Where:** `server/routes/c2c/documents.ts:866-940 (route, UPDATE at ~917); server/routes/c2c/actions.ts:114 (SIGNATURE_COMMANDS excludes 'lock'), 448-640 (writeMutation writes a signature row only for sign/revoke-signature)`
- **What:** Clauses: 21 CFR 11.10(g), 11.50, 11.70, 11.200; EU Annex 11 s.14. 'Locked' is a terminal governed state. This route (and the twin POST /api/c2c/actions/lock) requires only verifyReauth and assertSignerIsNotAuthor, then writeMutation('lock') writes the ledger pair, and the route UPDATEs c2c_documents.status. The route has no role gate (router has no router.use and no requireEditorAccess/requireRole; grep). The commit cf950eeb9 on 2026-10-08 added signingAuthorityRefusal to /api/c2c/actions but only for SIGNATURE_COMMANDS = {sign, revoke-signature}, so lock is still ungoverned. A viewer who knows their own password can lock a controlled document, and the locked record carries no signature manifestation (who, meaning, reason). Compare 7038fec50/8d96238d0, which made authoring approve/lock a signature on every door. Reachability: launchScopeApiVerdict('/api/c2c/documents/1/lock') returns 'launch'; the launch filing-outline/document-canvas client reads /api/c2c/documents. The UPDATE at documents.ts:~917 is also keyed WHERE id = $1 only (the org predicate lives in the earlier docCheck), which is safe today but not defence in depth.
- **Fix:** Treat lock as a signing act: route it through signGovernedAct (services/part11/governed-signature-ceremony.ts) with a closed meaning, signing authority, a persisted electronic_signatures row and the status change in one transaction; or add isSigningAuthorized to both lock doors and write the signature row. Add org_id to the UPDATE predicate. Test: viewer and member get 403; a manager-signed lock produces one signature row.
- **Verifier:** confirmed, severity medium. server/routes/c2c/documents.ts:868-940: there is no router.use, requireEditorAccess or requireRole in the file. The mount at register-inline-routes.ts:819 adds only authMiddleware. authoringObjectAuthorization covers only /authoring paths (middleware/authoringObjectAuthorization.ts:38-42). The route's gates are verifyReauth (:886), the org-scoped docCheck (:893) and assertSignerIsNotAuthor (:900). It then runs writeMutation('lock') and an UPDATE ... WHERE id = $1 with no org predicate (:917-919). In actions.ts, SIGNATURE_COMMANDS is {sign, revoke-signature} (:114), signingAuthorityRefusal returns null for lock (:660), and executeGovernedWrites persists a signature row only for sign or revoke-signature (:526). So a viewer, or any member, can lock a document with a password, and the lock carries no electronic_signatures row. Lock is terminal: section PATCH refuses locked documents (:532-536) and no unlock route exists. I lowered the severity to medium because no client calls /c2c/documents/:id/lock (grep of client/src found nothing), and the lock is still re-authenticated, separation-of-duties checked and written to the ledger. The real defect is a missing role gate on an irreversible state change, not a forged signature.

### INF-05 — No detective controls in Terraform: no GuardDuty, AWS Config, Security Hub, VPC flow logs, CloudWatch alarms, ALB access logs or CloudFront logging

- **Status:** still-open-from-2026-09-28 · **Severity (auditor):** high · **App:** Platform (all launch apps) · **Row:** D1/D6
- **Where:** `terraform/** (grep for aws_guardduty, aws_config_configuration_recorder, aws_securityhub, aws_flow_log, aws_cloudwatch_metric_alarm, logging_config, aws_wafv2: no matches); terraform/modules/alb/variables.tf (access_logs_bucket exists, never passed from terraform/stack/main.tf)`
- **What:** Clauses: HIPAA 164.312(b); NIST AU-2/AU-6/SI-4; Annex 11 s.12. Nothing in the repository's infrastructure detects or pages on an intrusion, anomalous API activity, or a break in the audit pipeline. The only INF-04 half closed is the SPA response-headers policy (modules/cloudfront has response_headers_policy). Not verified against a live account.
- **Fix:** Add GuardDuty (with S3 and RDS protection), an AWS Config recorder with the conformance packs needed, VPC flow logs, ALB and CloudFront access logs to an immutable bucket, and CloudWatch alarms with an SNS target for 5xx, auth-failure spikes, audit-write failures and chain-anchor staleness.
- **Verifier:** confirmed, severity high. grep over terraform/ finds no aws_guardduty, aws_config_*, aws_securityhub, aws_flow_log, aws_cloudwatch_metric_alarm, aws_sns_topic, aws_wafv2 or CloudFront logging_config. The alb module has an access_logs block that is enabled only when access_logs_bucket is set (modules/alb/main.tf:41-44). terraform/stack/main.tf:363-374 never passes it, so ALB access logs are off. One mitigating fact the finding leaves out: modules/compliance-evidence/main.tf:312 creates an aws_cloudtrail with log-file validation that streams to CloudWatch Logs, and stack/main.tf:511 wires it in. That is audit logging of API activity, but nothing alerts or pages on it. infra/alerts/*.yml holds app-level alert rules outside terraform. The listed controls are all absent as stated. I did not verify against a live account.

### DP-05 — The API task holds the database owner credential and every audit key beside the rows they seal

- **Status:** still-open-from-2026-09-28 · **Severity (auditor):** high · **App:** Platform (audit integrity) · **Row:** D6
- **Where:** `terraform/stack/main.tf:316 (DATABASE_URL = owner role c2c_admin; header comment :39-48), :321-324 (AUDIT_HMAC_KEY, AUDIT_HMAC_SECRET, AUDIT_EXPORT_SIGNING_KEY, AUDIT_ATTESTATION_KEY)`
- **What:** Clauses: 21 CFR 11.10(c),(e); HIPAA 164.312(c)(1); Annex 11 s.9. A code-execution bug in the API process yields the owner role (which can disable the append-only triggers) and the HMAC keys, so the chain seal and the new audit-integrity attestation are verified by the same process that could forge them. Per the file's own header the owner URL stays in the task so migrations can run as it. Unchanged since the baseline.
- **Fix:** Run migrations from a separate one-off task; remove DATABASE_URL (owner) from the API task definition; move seal and attestation verification to a task or KMS-backed signer that the API cannot read.
- **Verifier:** confirmed, severity high. terraform/stack/main.tf:43-47: the header comment confirms DATABASE_URL is the owner role c2c_admin, used by migrations and by the API at boot (DDL, and tenants-simple.ts outside RLS), and calls this 'A known exposure'. Lines :315-324 put DATABASE_URL beside APP_DATABASE_URL in boot_secrets, together with AUDIT_HMAC_KEY, AUDIT_HMAC_SECRET, AUDIT_EXPORT_SIGNING_KEY and AUDIT_ATTESTATION_KEY. The API and the worker share boot_secrets (comment at :312-313). A table owner can disable the triggers on its own tables, so code execution in the API yields both the means to alter the audit rows and the keys that seal them. Unchanged as stated.

### DP-49 — Member creation has no chained audit row; the invitation audit is a post-commit logAction whose failure is only a warning, and the 202 pending-invitation path writes none

- **Status:** still-open-from-2026-09-28 · **Severity (auditor):** medium · **App:** Projects / admin (membership) · **Row:** D6
- **Where:** `server/routes/tenant-users.ts:379-555 (POST /); server/services/tenant/invitation-delivery.ts:90-143 (auditService.logAction after the account is committed, `Audit log write failed (non-fatal)`); server/services/atomicQuotaService.js (atomicCreateUser, no audit write)`
- **What:** Clauses: 21 CFR 11.10(e), 11.10(d); HIPAA 164.312(b). Role change and removal were fixed (changeMemberRole/removeMember write the chained row in the same transaction, tenant-users.ts:603-686). Creating a user account plus its organization_users membership, including with a signing role now that P-18 makes approver and reviewer assignable, commits first, and the only record is a logAction afterwards that may silently not persist. The account and membership exist with no audit row. The pendingInvitation (202) branch at tenant-users.ts:~500 writes no audit row at all. ci:discarded-audit-write does not see this because the result is read and merely logged.
- **Fix:** Write the chained audit row (writeChainedAuditRow) inside the atomicCreateUser transaction, with role and inviter; make the invitation event a second row, and return 503 / roll back when the first cannot be written. Add an audit row for the cross-org pending invitation.
- **Verifier:** confirmed, severity medium. server/routes/tenant-users.ts:467-476: atomicCreateUser commits the users and organization_users inserts (atomicQuotaService.js, the INSERTs about 296 and 316). The only audit write in that function is a project-attribution comment, not a user audit. The 202 pendingInvitation branch (:501-509) writes only log.debug and returns. On the 201 path, issueInvitation runs only when createdNewUser is true (:526). It calls auditService.logAction, and a failed write only produces log.warn 'Audit log write failed (non-fatal)' (invitation-delivery.ts, about :120-139). It is also post-commit, inside a try/catch that turns any error into a delivery:'failed' field. One more gap the finding does not mention: an existing user with no other org membership gets added with createdNewUser false, and that path writes no audit row at all. I found no DB trigger on organization_users that audits inserts. The only one, organization_users_staff_role_platform_only, is a role guard. Medium is appropriate.

### SEC-1008-3 — An org admin receives the activation link of an invited member in the API response when SMTP is not configured, and can re-issue it for any unactivated member

- **Status:** new · **Severity (auditor):** low · **App:** Projects / admin · **Row:** D6
- **Where:** `server/services/tenant/invitation-delivery.ts:90-143 (setupUrl returned when emailSent is false), 150-200 (reissueForUnredeemedInvitee); server/routes/tenant-users.ts:412-426`
- **What:** Clauses: 21 CFR 11.100(a), 11.200(a)(2) (a signature must be used only by its genuine owner). Deliberate and documented (QA 2026-10-08 j9), but it means an admin who creates a person and assigns a signing role (approver/reviewer, P-18) holds the link that sets that person's first password, and can re-issue it until the person redeems it. The admin could set the password and sign as that person. The audit row records reissued:true and delivery:'link' but no later control compares the first sign-in to the intended person. Production with SMTP configured does not echo the link.
- **Fix:** In production refuse to return setupUrl; require an email transport (as APP_URL is required), or bind first sign-in to a second factor sent out of band. At minimum, block a signing role until the invitee has activated.

### SEC-1008-4 — Report-OS and Insights configuration writes still write no tenant chain row (SECURITY-1 residual)

- **Status:** new · **Severity (auditor):** low · **App:** Reporting & analytics · **Row:** D6
- **Where:** `server/routes/report-os.ts:1231 (POST /program-groups), 1278 (PATCH, membership DELETE+INSERT outside a transaction), 1367 (snapshots), 2215 (POST /bundles); server/routes/report-os-insights.ts:288, 394, 423 (predictions/run, subscriptions)`
- **What:** Clauses: 21 CFR 11.10(e). `writeReportEvent` is called only for run creation (report-os.ts:478), PDF export (:661) and deliveries (:2705), so program-group, snapshot, bundle-record and subscription changes are visible only to the global request observer (no organisation). Writes are editor-gated, the actor is the session, and nothing is sent, so the consequence is a missing tenant-visible trail for configuration, not a data leak. Reported low by the 2026-10-01 verifier; unchanged.
- **Fix:** Wrap each write in inTenantTransaction plus writeReportEvent (program_group_created/updated, snapshot_created, bundle_created, subscription_created/toggled) and move the membership rewrite into the same transaction.

### SEC-1008-5 — LITELLM_ENABLED with LITELLM_UNGOVERNED_ACK is honoured in production and the deploy preflight does not refuse it

- **Status:** new · **Severity (auditor):** low · **App:** Platform (AI egress) · **Row:** D6
- **Where:** `server/services/ai/LiteLLMAdapter.ts:51; .github/workflows/deploy-aws.yml:599-640 (preflight lists *_ACCEPT_*, AI_GATEWAY_DETERMINISTIC, LAUNCH_SCOPE_ENFORCE only); scripts/ci/gateway-bypass-baseline.json (LiteLLMAdapter entry)`
- **What:** Clauses: ISO/NIST CM-6; project Rule 2 (approved-models governance). With the flag on, every routed call bypasses the gateway's placement decision, PII/PHI screen, approved-models check and gateway audit row. Terraform sets neither variable and production refuses to boot without the acknowledgement string, so it is latent. The acknowledgement string is not named *_ACCEPT_*, so the preflight loop that refuses every *_ACCEPT_* flag does not see it. Same class as INF-17.
- **Fix:** Add LITELLM_ENABLED and LITELLM_UNGOVERNED_ACK to the deploy preflight's refused-by-name list, as AI_GATEWAY_DETERMINISTIC is, and make production boot refuse the combination outright.
