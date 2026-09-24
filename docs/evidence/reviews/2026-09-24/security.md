# Security lens: launch catalog, 2026-09-24

Produced by the `security-auditor` definition (`.claude/agents/security-auditor.md`) executed through a general-purpose agent, because the session began before the definition existed. Read-only: no file was written or edited, no gate was run with `write-baseline`.

**Audited commit:** `adbf2d186cf8136c786cd76377c1b2c15eb8bc69` (`concept2cure-v2`), the same commit `docs/security/SECURITY_AUDIT_2026-09-24.md` (the baseline) audited. Every line number below was re-read at this commit. The baseline's 81 findings are not repeated as new; §1 re-verifies the ten that decide its verdict, §2–§4 cover what it did not, §5 lists new ids, §6 the gates.

**Scope:** the six apps in `shared/constants/launch-scope.ts` (`LAUNCH_APPS`: Projects, Vault, Authoring, Submission Center, Submission Readiness, QMS controlled documents), resolved through `client/src/concept2cure/v2/surfaceViews.ts:386-581` to their components and from there to the mounted routers (`server/bootstrap/register-*.ts`): `/api/c2c/projects`, `/api/task-management`, `/api/c2c/project-vault`, `/api/authoring` (+ `authoringObjectAuthorization`), `/api/c2c/templates`, `/api/mdx` (vault, QMS, submission gateway), `/api/submissions`, `/api/ectd`, and the AnA tool-defs those surfaces delegate to.

**Time box:** about 25 minutes. What that did not allow is stated in §7 rather than inherited.

---

## 1. The ten §3.2 findings, re-verified at HEAD

Nothing in §3.2 is closed. The baseline audited this same commit, so "closed by" could only arise from a mis-citation; none was found.

| # | Id | State | Re-read at HEAD |
|---|---|---|---|
| 1 | IAM-01 | **still open** | `server/services/ana/ana-realtime.ts:168` (`io.of('/ana')`), `:170-184`: the middleware calls only `verifyLiveToken` and reads the token from `handshake.query?.token` (`:173`); no `nonAccessTokenReason`/`requireAccessTokenReason` anywhere in the file (grep: zero hits). `server/services/token-revocation.ts:218-226`: `verifyLiveToken` checks signature, revocation and account standing, never the token class. The main namespace applies the class check at `server/socketServer.ts:241`; `/ana` is still registered at `socketServer.ts:1062`. `/ana` is the only namespace beside the main one (`io.of(` has one hit in `server/`). |
| 2 | DP-02 | **still open** | `ci:sign-ceremony`: "23 baselined site(s) remain, exactly as baselined". `server/routes/c2c/artifacts.ts:2506-2523` (`PUT /projects/:projectId/artifacts/:artifactId/status`) and `:2819-2836` still insert into `concept2cure_signatures` with `authenticationMethod: 'session_jwt'`, `secondFactorVerified: false`; the file contains no `reverifySigner`/`verifyReauth` call on that route. `e020c69d` (09-23) narrowed which paths record `approved_version_id`; it did not add the ceremony. `promote-artifact.ts:246,446` TODOs remain. |
| 3 | DP-03 | **still open** | `server/services/part11/signature-persistence.ts:867-875` UPDATE sets `is_valid`, `verification_status`, `verification_date` beside `superseded_by`; `db/migrations/20260730_esign_audit_db_level_immutability.sql:53-59` permits only `superseded_by`/`updated_at`. Not re-executed here. |
| 4 | DP-04 / DP-05 | **still open** | `db/migrations/20260617_audit_logs_immutability.sql:156-158`: `current_setting('app.audit_archive_bypass', true) = 'on'` returns `OLD`. `scripts/db/provision-app-role.mjs:144` `DEFAULT_TABLE_PRIVILEGES` includes `DELETE`; the override (`:139-142`) covers the `audit` schema only and `audit_logs` is in `public`. `terraform/stack/main.tf:43-50` documents the owner `DATABASE_URL` in the API task; `:196-197` put `AUDIT_HMAC_KEY` and `AUDIT_HMAC_SECRET` in the same task. |
| 5 | DP-06 | **still open** | `AUDIT_TRAIL_ENABLED` / `AUDIT_REQUIRE_ENFORCE` appear nowhere in `terraform/stack/main.tf` or `.github/workflows/deploy-aws.yml` (grep: hits only in `server/startup/*`). `boot_environment` at `main.tf:158-171` sets `RLS_ENFORCE`, the AI placement flags, `APP_URL`, `ALLOWED_ORIGINS`. `server/startup/services.ts:440-449` skips the chain monitor unless the flag is `'true'`. |
| 6 | DP-07 | **still open** | `server/services/ai-gateway/embeddings/embedding-provider.ts:129-155`: default kind `openai`, no placement or classification call (the only "placement" text is a comment at `:51`). `server/services/vault/document-chunking.service.ts:165-171` embeds vault chunks through it. `terraform/stack/main.tf:93-95` provisions `openai_api_key`; no `anthropic` key in the stack (grep: zero hits). |
| 7 | IAM-02 / IAM-03 / IAM-05 | **still open** | `server/mcp/auth/platform-token.ts:155-173` mints `type: 'access'` with `token_use`/`scope` claims. `server/routes/sso.ts:130-158` falls back to `SAML_IDP_*` for any slug; `:684-699` matches by email and binds an unassociated user to the config's org. `server/routes/scim.ts:719-733` checks membership then `UPDATE users SET status='inactive' WHERE id=$1` (global). MCP is off unless `MCP_ENABLED=true` (`server/mcp/config.ts:61`). |
| 8 | IAM-04 / IAM-06 | **still open** | `server/services/token-revocation.ts:32` 24 h TTL, `:93,128-131` `expires_at` written from it, `:170` read honours it. `server/routes/auth.ts:79-80` `24h`/`7d`; `:1083-1086` logout revokes only `body.refreshToken`. `server/routes/authEnterprise.ts:928-983` re-mints a 24 h token from any live access token without revoking the old one. No idle timeout found. |
| 9 | INF-01 / INF-02 | **still open** (one detail differs) | Branch protection **not verifiable here** (`gh` is not installed; the definition allows no network). `.github/workflows/pr-checks.yml:3-5` is `pull_request` only, and `check:compliance-claims`, `ci:server-error-leaks`, `ci:discarded-audit-write`, `ci:session-scoped-rls-bypass` appear only there (`:69,142,236-238,267`). `ci.yml` (push on all branches) runs `ci:dead-audit-catch` and `ci:sign-ceremony` (`ci.yml:556-570`); `ci:dead-audit-catch` is red at HEAD (§6), so trunk CI is red on this commit. Difference from the baseline's checkout: here `core.hooksPath` is `.husky/_` (hooks installed by `npm install`); the hook is still client-side and skippable. |
| 10 | INF-04 / INF-05 / INF-06 | **still open** | `terraform/modules/cloudfront/main.tf:151-173`: default behaviour has no `response_headers_policy_id`. `terraform/modules/alb/variables.tf:40-43` `access_logs_bucket` defaults `""`. `guardduty`, `aws_config`, `securityhub`, `flow_log`, `cloudwatch_metric_alarm`: zero hits under `terraform/`. `server/startup/env.ts:81-86`: `SENTRY_DSN`/`REDIS_URL` missing is a `console.warn`. |

**Baseline ids re-verified as still closed:** DP-01 — `server/services/ana/AnaToolExecutor.ts:13587-13593` registers `approve_qms_document` as `refuseSignatureInChat`; `server/routes/mdx-qms.ts:468-480` edits a `qms_documents` row only while `status IN ('draft','in_review')` and answers 409 `QMS_DOCUMENT_CONTROLLED` otherwise. DP-10 (mostly closed by `2ddb77b0`) — the purge diff was read, not re-executed; the companion `server/routes/tenant-export.ts` is mounted at `/api/tenant-export` behind `authenticateToken` (`register-document-routes.ts:275`; `tenant-export.ts:54-57` takes the org from the JWT).

---

## 2. Object-level authorization: mutation routes across the six apps

Question asked of each: before it writes, does the handler prove the record belongs to the caller's organisation (session-derived), and answer 404 otherwise? Eleven routes were read (the task asked for eight).

| App | Route | Proof before the write | Verdict |
|---|---|---|---|
| Projects | `POST /api/c2c/projects/:id/archive`, `/:id/unarchive`, `DELETE /:id` → `transitionProgram` (`server/routes/c2c/projects.ts:1597-1642`) | `SELECT … FROM regulatory_programs WHERE id=$1 AND organization_id=$2 FOR UPDATE` (`:1619-1623`), 404 on miss; role check `allowProgramMutation` (`:1627`); UPDATE carries the org (`:1635-1638`); audit row on the same client (`:1640`). Org from `resolveOrgId(req)`. | pass |
| Projects / Tasks | `PATCH /api/task-management/tasks/:taskId` (`server/routes/taskManagement.routes.ts:334-395`) | fetch-first `eq(unifiedTasks.organizationId, organizationId)` (`:346-357`), 404; legal-transition check; approval-gated completion runs `requireTaskSignoff` and returns 428 until the ceremony verifies (`:373-393`). | pass |
| Projects / Tasks | `PUT /api/c2c/projects/:projectId/tasks/:taskId` (`server/routes/c2c/tasks.ts:265-312`) | org from session (`:283`); zod allow-list (`:285-297`); parent task proved own via `isOwnProjectTask` (`:300`); UPDATE `where(and(eq(id), eq(organizationId)))` (`:311`). | pass |
| Vault | `POST /api/c2c/project-vault/:id/file` (`server/routes/c2c/project-vault.ts:1538-1573`) → `placeVaultDocument` (`server/services/vault/vault-placement.service.ts:204-252`) | program `WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL` (`:225-229`, 404 `NOT_FOUND`); document joined to that program and org (`:244-252`, 404 `DOCUMENT_NOT_FOUND`). `requireEditorAccess` in front. | pass |
| Authoring | `PATCH /api/authoring/sections/:sectionId` (`server/routes/authoring.router.ts:1645-1676`) | `authoringObjectAuthorization` (mounted `register-inline-routes.ts:311`; `sectionMatch` at `authoringObjectAuthorization.ts:160-166`, scope SQL tenant-bound) runs first; the handler then reads `WHERE id=$1 AND tenant_id=$2` (`:1668-1671`). | pass |
| Authoring | `DELETE /api/authoring/docs/:docId` (`server/routes/authoring.router.ts:4882-4920`) | **The handler itself proves nothing**: it compares a static header `x-admin-token` to `process.env.ADMIN_TOKEN` (`:4884-4887`), then `SELECT … FROM authoring_documents WHERE id=$1` (`:4890-4893`) and `DELETE FROM authoring_documents WHERE id=$1` (`:4915`), with no tenant predicate and an audit row naming no tenant or actor (`:4907-4912`). What fences it is the middleware in front: `docMatch` (`authoringObjectAuthorization.ts:174-178`) resolves the document inside the caller's tenant and answers 404 for a foreign id. | fail in the handler; contained by the middleware — DP-33 |
| Authoring / Template library | `PUT /api/c2c/templates/:id`, `DELETE /:id` (`server/routes/c2c/templates.ts:198-234`) → `templateStore.ts:189-211` | `getTemplate(orgId, id)` then `UPDATE … WHERE id=$1 AND org_id=$2 AND is_active=true` (`:205-207`). | pass |
| Submission Center | `POST /api/mdx/gateways/:region/:gateway/transmit` (`server/routes/mdx-submission-gateway.ts:195-260`) | `verifyReauth` before anything (`:215-220`); bundle loaded by `loadStoredBundle(packageId, organizationId)` (`server/services/submission-gateways/governed-transmit.ts:228-234,443-445`). `requireEditorAccess` in front. | pass |
| Submission Center | `POST /api/submissions/sequences/:seqId/transition` (`server/routes/submissions.ts:888-901`) → `transitionSequence` (`server/services/submission-service/submission-service.ts:355-379`) | `eq(ectdSequences.organizationId, ctx.organizationId)` (`:379`); `requireRole(AUTHOR)`. | pass |
| Submission Readiness | `POST /api/ectd/:projectIdent/compile` (`server/routes/ectd-compile.ts:490-500`); `POST /api/submissions/:id/dispatch-qc` (`submissions.ts:1056-1069`) | `anchorFromRequest` resolves the ident org-scoped and 404s on a miss before any compile; the readiness assessment is keyed to the resolved sequence. | pass |
| QMS | `PATCH /api/mdx/qms/documents/:id` (`server/routes/mdx-qms.ts:443-480`); `POST …/:id/retire` (`:680-700`) | `WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL` (+ `status IN ('draft','in_review')` on PATCH), `notFoundInTenant` on miss. | pass |

Tenant key provenance on every sampled route is the session (`resolveOrgId`/`getOrgId`/`authedOrgId`/`ctxOf`), not a body, query or header field. The one route where the handler is unscoped is fenced by a mandatory middleware; that is the pattern the definition's item 1 warns about (correctness that lives in the door, not the handler), reported as DP-33.

---

## 3. The AnA tools the six apps delegate to: which write, which confirm

**The gate.** `server/services/ana/governed-tool-gate.ts:96-117` classifies every tool call: only `execute_platform_command` (declared in `bla-biologics-tool-defs.ts:779`) can be `NEEDS_APPROVAL`, and only when its command is in `PROPOSE_ONLY_COMMANDS` (`server/services/ana-ri/command-rbac.ts:439-448`: write commands with `requiresSignature`, `requiresReasonForChange`, or manager-tier `requiresConfirmation`). Every tool with its own handler is `UNGOVERNED` by construction; the file says so (`:82-94`, "the existing judgment rather than an omission"). `governed-write-tools.ts:35-66` gates 14 free-text tools on the **model's** approval status, which is a different control from user confirmation.

**Per tool-defs file** (names from the `name:` declarations; handlers in `AnaToolExecutor.ts` unless stated):

| File (app) | Tools | Write | Confirms with the user |
|---|---|---|---|
| `document-surface-tool-defs.ts` (Vault, Authoring, TMF) | 16 | `save_document_to_vault` (`:19577`), `update_vault_document` (`:19703`), `draft_authoring_document` (`:19695`), `seed_tmf`, `update_tmf_artifact_status` (`:19885`) | none. Each demands `reason` ≥ 8 chars from the tool **input** (`viewReason`, `:19572-19575`) — text the model writes. Org-scoped via `ctx.organizationId` + `setTenantContextTx`; governed-action row in the same transaction (`recordGovernedAction`). |
| `document-catalog-tool-defs.ts` (Vault) | 7 | `catalog_project_document`, `file_chat_upload_to_vault` (`document-catalog-tools.ts:547`), `place_project_document` (`document-placement-tools.ts:201`) | none; all behind `requireCatalog`, withheld when the catalog is off (`governed-toolset.ts:60-63,80-93`; off by default). |
| `qms-labeling-analytics-tool-defs.ts` (QMS) | 20 | `create_qms_document` (`:13525`), `approve_qms_document` (`:13587`), `ack_training` (`:13692`), `revise_qms_document` (`:13595`), `retire_qms_document` (`:13649`), `register_supplier`, `log_nonconforming_product`, `qms_change_create`, `qms_change_transition` (`:13765`), `qms_change_link`, `create_labeling_document`, `add_labeling_translation`, `add_labeling_symbol`, `project_csr_evidence` | **one**, by refusing: `approve_qms_document` → `refuseSignatureInChat` (DP-01). `revise_*`/`qms_change_transition` require a reason ≥ 3 chars ("ask the user for it" is prompt text, not enforcement); `retire_qms_document`'s reason is optional (`:13653`). See DP-31, DP-32. |
| `submission-center-tool-defs.ts` (Submission Center, Readiness) | 41 | `place_into_sequence` (`:9099-9140`) → `upsertLeaf` → `getSequence(id, ctx)` org-scoped (`submission-service.ts:322-326`, `:1840`) | none; no reason field either. The rest compute (`generate_stf` at `:8963` takes no `ctx`; `assess_dispatch_readiness`, `dispatch_qc_check`, `validate_ectd_package` read). |
| `protocol-design-tool-defs.ts` (Authoring / protocol-dev) | 5 | `bind_protocol_to_study_design` (`:20290`), `apply_protocol_design_derivation` (`:20343`) | none. |
| `notifications-study-memory-tool-defs.ts` (protocol-dev slice) | 25 protocol tools of 150 | `create_protocol_document`, `update_protocol_section` (`:11422`), `add_protocol_objective`, `add_eligibility_criterion`, `add_protocol_risk`, `create_protocol_amendment`, `finalize_protocol_document` (`:11514`), … | **one**, by refusing: `finalize_protocol_document` returns `signatureRequired: true` and writes nothing (`:11514-11545`). |
| `mutation-surface-tool-defs.ts` (device Q-Sub; only `link_program_clinical_study`, `set_program_metadata` touch Projects) | 16 | all 16 | none. |
| `bla-biologics-tool-defs.ts` | `execute_platform_command` | via commands | **yes**, for propose-only commands only (`NEEDS_APPROVAL`, tier `reason`/`esignature`). |

**Net:** about 45 write tools sit behind the six launch apps; three confirm (two by refusing, one through the command gate). The other ~42 run on the model's say-so, and where a "reason" is captured it is model-authored. This re-verifies **DP-08 as still open** and extends its evidence from the command layer (`AnaToolExecutor.ts:5130-5146` → `executeCommands`) to the tool layer.

---

## 4. Second doors added in the last 48 hours

Method: `git log --since='2026-09-22'` returns 319 non-merge commits, but the clone is **shallow** (`git rev-parse --is-shallow-repository` = true; 25 grafted boundary commits), and a boundary commit presents the entire tree as "added". Only the 294 commits whose parent is present were diffed. Files in scope are `server/routes`, `server/mcp`, `server/socket*`, `server/services/ana`, plus `server/bootstrap`, `server/startup`, `server/index.ts` for mounts.

- **Files added in scope:** three, all in `server/services/ana/`: `server-tool-steps.ts` (pure; labels Anthropic-executed web tools in the trace), `turn-plan.ts` (defines the `update_plan` tool; "the handler has no side effect", `:16-22`), `turn-context-used.ts` (pure event shaping). No database access in any of them.
- **New socket namespaces:** none (`+ io.of(` : zero hits in the window; the tree has one namespace beside main, `/ana`).
- **New production route mounts:** none. Every `+ app.use(` in the window is inside a `__tests__` harness (`fa9a9786`, `95aa4216`, `e020c69d`, `65010f91`, `24faac33`, `2dd78265`, `916027a9`, `c16c3cb6`).
- **New tool names:** none in `*tool-defs*.ts`, `AnaToolDefinitions.ts` or `server/mcp/tools` in the window. `server/mcp/*` is **not** a 48-hour addition; it appears in a naive `--since` listing only through the graft.
- **Modified routers in scope (72):** the direction is closing, not opening. Verified closings that touch the catalog and are not in the baseline's register: `67ff155e` adds a `router.param('projectId')` ownership guard to `client-intelligence.ts:44-63` and makes `/api/users/*` refuse non-access (pre-MFA) tokens (`users.ts:57-69`); `370d9a75` makes the shared write services refuse a viewer role; `95aa4216` puts `/api/regulatory/tasks` under the governed writer; `e1c224f6` closes DP-01. `2ddb77b0` (purge) added no mount — `tenant-export.ts` was modified, not created, and is behind `authenticateToken` with the org from the JWT.

No router, namespace or tool that reaches a governed table without the main path's checks was added in the window.

---

## 5. New findings (ids continue the baseline's numbering)

### DP-31 — Medium — a change-control record is approved from chat, on one of two doors, with no ceremony

- **Route / tool:** AnA `qms_change_transition`, `server/services/ana/AnaToolExecutor.ts:13765-13790`; HTTP twin `POST /api/mdx/qms/changes/:id/transition`, `server/routes/mdx-qms.ts:1351-1398`.
- **Write path:** `server/services/qms/changeControl.service.ts:203-215` — `transitionChange(orgId, id, 'approved', …)` stamps `approved_by`/`approved_at`; its only control on the approve step is segregation of duties (`SegregationOfDutiesError`, `:203-205`).
- **What is missing:** the AnA tool is `UNGOVERNED` (`governed-tool-gate.ts:96-117`); the "reason" is three characters of model output (`:13772`); the audit write is `void auditService.logAction(…)` after the status is already stamped (`:13782-13786`) — the fire-and-forget pattern the HTTP twin was converted away from in the same file's other routes (`mdx-qms.ts:1362-1384` now awaits `recordAuditRow` and reports `auditTrail`). Neither door runs `reverifySigner`, writes an `electronic_signatures` row or captures a meaning for an approval of a controlled change.
- **Clause:** 21 CFR 11.10(d), 11.50, 11.200(a)(1); EU Annex 11 §14; ICH Q10 §3.2.3 (change management).
- **Fix:** move `qms_change_transition` with `to='approved'` into the refusal set (as `approve_qms_document` is) or route it through `execute_platform_command` as a `requiresSignature` command; on the HTTP route, require the ceremony for `approved` and write the signature and chained audit row in `transitionChange`'s transaction.
- **Relation to the baseline:** same class as DP-08 (model runs a write without confirmation); the document twin of this defect was closed as DP-01 on 09-24, the change-control twin was not. Not a regression.

### DP-32 — Low–Medium — an effective controlled document is retired without a ceremony, from chat or HTTP

- **Route / tool:** AnA `retire_qms_document`, `AnaToolExecutor.ts:13649-13690`; `POST /api/mdx/qms/documents/:id/retire`, `mdx-qms.ts:680-700`.
- **Write path:** `UPDATE qms_documents SET status='retired' … WHERE id AND organization_id AND status <> 'retired'` on both doors; the AnA door records a governed action in the same transaction (`:13675-13681`), the HTTP door logs after commit (`:700-703`).
- **What is missing:** retirement is a terminal lifecycle state of an effective SOP; no identity re-verification, no signature, and on the AnA door the reason is optional (`reason ?? null`, `:13653`) though the tool description calls the action governed.
- **Clause:** 21 CFR 11.10(d)(e), 11.50; Annex 11 §9, §14; 21 CFR 820.40 (document change approval) where QMS is offered to device customers.
- **Fix:** treat `retired` like `effective` — a signed transition on the HTTP door, a refusal on the AnA door — or record it as a change-control outcome rather than a direct status write.
- **Regression:** no; the paths pre-date the baseline (baseline DP-01 covered `effective` only).

### DP-33 — Low — a shared static header secret authorises a hard delete inside the launch Authoring router; the handler is tenant-blind and its audit row is actor-less

- **Route:** `DELETE /api/authoring/docs/:docId`, `server/routes/authoring.router.ts:4882-4920`. Mount: `register-inline-routes.ts:317` (no mount-level auth; the `/api` boundary and `authoringObjectAuthorization` at `:311` run first).
- **Write path:** `:4890-4893` `SELECT … WHERE id=$1`; `:4915` `DELETE FROM authoring_documents WHERE id=$1` — no tenant predicate, physical delete; `:4907-4912` `logAction` with no `tenantId`/`userId`; guard is `product_code` starting `UAT-` (`:4898-4903`) and `x-admin-token === process.env.ADMIN_TOKEN` (`:4884-4887`).
- **Why it is Low, not High:** the middleware in front resolves the document within the caller's tenant (`authoringObjectAuthorization.ts:174-178`, scope SQL `tenant_id = $2`) and answers 404 for a foreign id, so the cross-tenant case is closed by the door, not the handler; and `ADMIN_TOKEN` is empty in `.env.example:817` and absent from `terraform/stack/main.tf`, so the route fails closed unless an operator sets it. Whether any deployment sets it is not verifiable here.
- **What is still wrong:** a bearer shared secret is not an identity (11.10(d), 11.10(g)); the audit row names no actor (11.10(e)); a hard delete honours no retention or hold (Annex 11 §17; 11.10(c)); and `ci:regulated-delete-audit` passes this site because an actor-less `logAction` precedes the DELETE — the gate is satisfied by a row an inspector cannot attribute.
- **Fix:** remove the route (UAT clean-up belongs in a script run as the platform owner), or bind it to `requirePlatformAdmin`, add the tenant predicate, soft-delete, and write `writeChainedAuditRow` on the same client.
- **Regression:** no.

### Observations that are not new ids

- **DP-08 (High, still open), tool-layer evidence:** §3. The "reason" every governed AnA write captures is authored by the model (`viewReason`, `AnaToolExecutor.ts:19572-19575`; `:13772`), so it cannot serve as the reason-for-change of 11.10(e)/Annex 11 §9 without a human relay the code does not require.
- **DP-14 (Medium, still open):** `ci:discarded-audit-write` holds at 133/60 files; `qms_change_transition` (`:13782`) is one of them.
- **IAM-18 (Low, still open):** `ci:server-error-leaks` is red at the same single site, `server/routes/c2c/commitments.ts:156` (147 vs baseline 146).
- **DP-24 (Low, still open):** `ci:dead-audit-catch` red on `server/services/templates/templateStore.ts:80`; this gate blocks in `ci.yml:556-560`, so trunk CI is red at HEAD.

---

## 6. Gates (all read-only; none run with `write-baseline`)

| Gate | Result | Baseline size and direction |
|---|---|---|
| `ci:committed-secrets` | pass | — |
| `ci:no-dev-auth-in-prod` | pass | — |
| `ci:unauthenticated-fetch` | pass | 64 raw `fetch()` scanned, 0 baselined (unchanged) |
| `ci:path-containment` | pass | 3 files match, 3 baselined (unchanged) |
| `ci:org-path-param-guards` | pass | 43 routes, 43 guarded, 0 unguarded (baseline 0; unchanged) |
| `ci:jwt-verify-pinned` | pass | — |
| `ci:client-ip-single-source` | pass | — |
| `ci:server-error-leaks` | **fail** | 147 vs baseline 146 (+1, `server/routes/c2c/commitments.ts:156`; same as baseline §8) |
| `ci:discarded-audit-write` | pass | 133 across 60 files (unchanged) |
| `ci:sign-ceremony` | pass | 23 sites, "exactly as baselined" (unchanged) |
| `ci:regulated-delete-audit` | pass | — (see DP-33 on what "has an audit call" admits) |
| `ci:gateway-bypass` | pass | 8 baselined sites tolerated (unchanged) |
| `ci:dead-audit-catch` | **fail** | 1 site, `templateStore.ts:80` (same as baseline §8) |
| `ci:session-scoped-rls-bypass` | pass | 34 in 7 unmounted services (unchanged) |
| `ci:drizzle-tenant-scope` | pass | 126 sites, all baselined; 25 fixed since the baseline was written and unbanked (baseline file still 151; direction down) |
| `ci:tenant-entry-points` | pass | 14 entry points, 9 do not consider entitlement (baseline 9; unchanged) |
| `ci:tenant-isolation:no-regression` | pass | 8 current vs 9 baseline (down 1; unbanked) |
| `check:security-patterns` | pass | 0 violations / 2835 files |
| `check:compliance-claims` | pass | 830 customer-facing files, no unsupported claim |

Seventeen pass, two red; both reds are the baseline's own two reds, unmoved. No baseline grew.

---

## 7. What this lens could not verify by reading

- Branch protection on `concept2cure-v2` (`gh` absent; no network): INF-01 is carried as the baseline found it.
- A running server or socket listener: IAM-01 is re-read, not re-executed; the baseline's reproduction stands.
- A real database: DP-03/DP-04 trigger behaviour, whether the `audit_logs` triggers are installed on the production database, and whether `app_service` in fact holds `DELETE` there.
- Production configuration: whether `ADMIN_TOKEN` (DP-33), `MCP_ENABLED` (IAM-02), `AUDIT_TRAIL_ENABLED` (DP-06) or a SAML configuration (IAM-03) is set in any deployed task.
- A live KMS or Secrets Manager: key placement is read from Terraform only.
- Whether developer checkouts have the husky hooks installed (this one does; the baseline's did not).
- The full-history `git log`: the clone is shallow to 2026-09-06 with 25 grafts, so "added in the last 48 hours" is computed only over commits whose parents are present (294 of 319).

---

## 8. Summary for the launch board

- The six launch apps' HTTP mutation paths sampled here (11 routes) prove tenant ownership from the session before writing, with one handler (`DELETE /api/authoring/docs/:docId`) that relies entirely on the middleware in front of it — DP-33.
- No second door was added in the last 48 hours; the window's changes on the catalog are closings.
- The AnA layer remains the open door the baseline named: ~45 write tools behind the six apps, three of which confirm with a person — DP-08 still open; the QMS change-control approval (DP-31) and controlled-document retirement (DP-32) are the two governed transitions on launch-catalog surfaces that still happen on a model's or a plain click's say-so.
- All ten §3.2 findings are still open at HEAD; DP-01 is confirmed closed.
- Gates: 17 pass, 2 red (unchanged from the baseline), no baseline grew, two shrank without being banked.
