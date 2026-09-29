# Security lens -- weekly run, 2026-09-28

**Audited commit:** `aff7eae16` (`concept2cure-v2`). `git status` clean at read time (read-only session; no file edited; no gate run with `write-baseline`).

**Scope actually covered:** the five 2026-09-26 lens new ids (DP-36, IAM-19, DP-37, DP-38, DP-39) re-verified adversarially by reading the current code and, where practical, executing the relevant test/gate; a targeted sweep of launch-catalog server paths changed since `1463b91a` (135 commits, `git log 1463b91a..HEAD`, 734 files) for second doors, unscoped tenant lookups, client-supplied tenant keys, governed writes with no audit row, and gate drift. All 19 read-only gates in the standing list were executed live at HEAD (not inherited from any prior report).

**What I did NOT get to (no silent caps):** the full 135-commit / 734-file diff was not read line-by-line; I read `git diff --stat` for `server/` and `client/src/concept2cure/v2/` in full and picked targeted files by relevance (auth doors, QMS/vault governed writes, tenant-scoping helpers) rather than every changed file. Not individually re-opened this session: DP-02 (23 sign-ceremony writers, only the gate re-run, not each writer re-read), DP-04/DP-05 (runtime-role DELETE grant, owner-credential-in-task -- carried from the register), DP-07's Terraform/DPA half, IAM-02/03/05's SAML/SCIM code proper (only the connector-token/`openSession` angle was re-touched, via IAM-19's neighbourhood), INF-01/02/05/06 (no network access to GitHub/AWS in this session -- branch protection, CI run history, and whether any deployed task reads `AUDIT_TRAIL_ENABLED=true` are unverified by reading alone), P1-22's legal-hold routes, and the Terraform/CI-infrastructure items generally (`git log`/file reads only, no live GitHub or AWS API in this session). No running server, socket listener, live database, or KMS was available; a local reference Postgres exists per the task brief but the two new findings below did not require executing SQL against it to establish (both are provable by reading the dispatch and handler code paths and by running the existing unit test suite, which I did for the tool-authorization register).

---

## 1. Reverified: the five 2026-09-26 new ids

| Id | Status at HEAD | Evidence |
|---|---|---|
| IAM-19 | **still open** | `server/services/ana/ana-realtime.ts:211-325`: full read of `registerAnaRealtime` at HEAD confirms no `setInterval`/periodic re-check exists after the `connection` handler (line 277) -- the socket authenticates once at handshake and never re-verifies. Compare `server/socketServer.ts:199-221,377-379` (`startSessionRecheck`), present on the sibling namespace and absent here. `git log --all --oneline | grep -i P1-33` returns nothing -- no closing commit exists anywhere in the repository. The remediation plan and register still list it `open ... -> P1-33`, unchanged since 2026-09-26. |
| DP-36 | **closed** | `aa4d5552e` (P1-34, 2026-09-26) landed `tool-authorization.register.json` (763 entries) and `tool-authorization.ts`. Verified live: an unregistered tool defaults to `{class:'confirm', unclassified:true}` (fail-closed); the registry wrapper `registerToolHandler` (`AnaToolExecutor.ts:349-376`) runs `preHandlerRefusal` on every one of the 726 currently-registered handlers, not just the `execute_platform_command` bridge; the MCP door (`server/mcp/tools/runtime.ts:93-94`) dispatches through the same wrapper with no `humanConfirmed` passed, so it is refused for confirm-tier tools too. I executed `server/services/ana/__tests__/tool-authorization.test.ts` live at HEAD: 50/50 pass, including the register<->registry parity assertions and the exact `retire_qms_document`/`approve_qms_document`/`save_document_to_vault` cases the prior lens named. **However**, this closure has a residual the prior lens did not surface: the classification work correctly makes every write "proposed," but the *tier* every directly-registered tool can reach is capped at `'confirm'` (a UI click) -- there is no code path to the `'esignature'` tier for any of them. That residual is what SEC-0928-1 below is built on; it is a gap the P1-34 tranche's own scope (classify + gate) did not include, not a defect in what P1-34 built. |
| DP-37 | **closed** | `server/services/submission-service/submission-service.ts:1843-1848`: the vault-documents leaf-program read now joins `regulatory_programs` and filters `rp.organization_id = ${organizationId}` in the statement itself, matching its siblings. `ci:tenant-isolation:no-regression` executed live: 8 candidates against baseline 9 (1 resolved, 0 new) -- matches the closing commit `6eeee0174`'s claim. |
| DP-38 | **closed** | `server/routes/audit-trail-routes.ts:469-487`: `POST /api/audit/signatures` now gates on `requireAuditRecorder` immediately after the org guard, before the body is read. Matches `2d079eea5` (P1-36). |
| DP-39 | **closed** | `server/utils/logger.ts:163-196`: `maskMessage()` now runs `maskPersonalData` over the message argument at every log level; `redactContext` now recurses into array elements instead of passing them through. Matches `ab0650bb1` (P1-37). |

**In passing, re-verified as still holding:** DP-31 (`approve_qms_document`/`qms_change_transition` conditional-refuse rules unchanged, still refuse/gate correctly). **In passing, found to be only half-closed:** DP-32 -- the HTTP retirement door (`retireQmsDocumentSigned`, `server/services/qms/document-approval-signature.ts:39-58`) is genuinely fixed and signed, but the AnA tool `retire_qms_document` bypasses it entirely; see SEC-0928-1.

---

## 2. New findings

### SEC-0928-1 -- High -- AnA's `retire_qms_document` tool retires a controlled QMS document with a UI confirm click, no e-signature, and no `electronic_signatures` row

- **file:line (dispatch):** `server/routes/ana-ri/utility.ts:585-650` (`governedTierOf` computes `'confirm'` for this tool name; `eSignRequired=false`; `reverifySigner` never called).
- **file:line (write):** `server/services/ana/AnaToolExecutor.ts:13723-13760` (`retire_qms_document` handler: `UPDATE qms_documents SET status='retired' ...`, then `recordGovernedAction` only -- no `electronic_signatures` insert).
- **Compare (the door that was fixed):** `server/services/qms/document-approval-signature.ts:39-58`, `retireQmsDocumentSigned`, wired to `POST /api/mdx/qms/documents/:id/retire` by P1-29 (2026-09-26): `reverifySigner` + one `electronic_signatures` row + one chained audit row, one transaction.
- **Why it is reachable today:** `tool-authorization.register.json` classifies `retire_qms_document` as `'confirm'` (confirmed by executing `tool-authorization.test.ts` live, which pins this exact case). `governedTierOf` (`server/services/ana-ri/part11-governance.ts:156-160`) is keyed only by `PART11_ESIGN_COMMANDS`/`PART11_GOVERNED_COMMANDS`/`COMMAND_AUTHORIZATION`, all populated solely from the `execute_platform_command` command-registry namespace -- disjoint from tool names (the 2026-09-26 lens's own 724-name cross-check, still true at HEAD). So `retire_qms_document` falls through to the documented default, `'confirm'`. At `'confirm'`, `runConfirmedTool` (`utility.ts:222-246`) invokes the handler with only `humanConfirmed: true` -- a browser click, never a password/MFA re-verification.
- **Regulatory hook:** 21 CFR 11.50, 11.70, 11.200(a)(1) (a signed record needs a manifested signature, not a click); 11.10(e) (the audit row exists but is not a signature).
- **Structural point:** `classifyRegisteredTool` in `governed-tool-gate.ts:130-136` hard-codes `tier:'confirm'` for *every* directly-registered tool -- there is no code path by which any of the ~600+ non-command AnA write tools can reach `'esignature'`. This is not a one-tool miss; it is the ceiling the P1-34 classification work left in place for the whole population.
- **Fix:** either route the tool's handler through `retireQmsDocumentSigned`/`persistGovernedActionSignature` and extend the tier lookup to recognise tool names that write a Part-11-signed state (not just `COMMAND_AUTHORIZATION` keys), or reclassify `retire_qms_document` as `'refuse'` in the register, as `approve_qms_document` already is, and tell the person to use the signed HTTP door.
- **Regression status:** residual of DP-32/P1-29 (HTTP door fixed, AnA twin left on the old, unsigned shape) and of DP-36/P1-34 (classification closed the propose-only gap but not the tier ceiling).

### SEC-0928-2 -- High -- F-41's fix landed only on `routes/auth.ts`; the enterprise sign-in door reproduces the exact defect

- **file:line:** `server/routes/authEnterprise.ts:305,318,334,365,414` (`POST /verify-password`: pending-verification, inactive-account, lockout, wrong-password and MFA-challenge-issued `recordAuthEvent` calls, all using `tenantId: user.defaultOrganizationId` directly).
- **The fix this is a twin of:** `f339a4459` (F-41, 2026-09-27 23:58 UTC, the commit immediately preceding HEAD) introduced `server/services/sign-in-organisation.ts` (`auditOrganizationOf`/`signInMembership`/`membershipsOf`) and rewired `routes/auth.ts`'s ~9 `recordAuthEvent` call sites onto it, because an account created via `POST /api/tenant-users` has a membership row but no `users.default_organization_id`, and every audit event for such an account was landing in the platform's chain (tenant 0) instead of the organisation's ledger.
- **Confirmed unfixed on the enterprise door:** `git show f339a4459 --stat` shows only `server/routes/auth.ts` and its test were touched. `authEnterprise.ts` still reads `user.defaultOrganizationId` directly at the five call sites above. `server/services/audit/auth-event-audit.ts:24-26`'s own header: "An event with no identified tenant ... is written from the scope it arrives in, as tenant 0." So for the identical account shape F-41 exists to fix, every failed sign-in attempt and MFA challenge issued through the enterprise multi-step door (mounted at HEAD via `server/bootstrap/register-platform-routes.ts:149`) still writes to the platform ledger, invisible to the organisation's own audit-trail review.
- **Regulatory hook:** 21 CFR 11.10(e) (the organisation's audit trail must record events about its own accounts); HIPAA 164.312(b).
- **Fix:** replace the five literals with `tenantId: await auditOrganizationOf(user)`, as `routes/auth.ts` now does.
- **Regression status:** the enterprise door's copy of the bug was never closed -- a second door beside one the immediately preceding commit fixed, matching this codebase's recurring main-door/enterprise-door asymmetry (cf. IAM-08 in the baseline).

---

## 3. Gate table (read-only; none run with `write-baseline`)

| Gate | Result | Baseline size and direction |
|---|---|---|
| `ci:committed-secrets` | pass | -- |
| `ci:no-dev-auth-in-prod` | pass | -- |
| `ci:unauthenticated-fetch` | pass | 70 raw `fetch()` sites scanned, 0 baselined (unchanged from 09-26) |
| `ci:path-containment` | pass | 3 files match, 3 baselined (unchanged) |
| `ci:org-path-param-guards` | pass | 43 routes, 43 guarded, 0 unguarded (unchanged) |
| `ci:jwt-verify-pinned` | pass | -- |
| `ci:client-ip-single-source` | pass | -- |
| `ci:server-error-leaks` | pass | 119 sites / 76 files (down from 120/77 at 09-26 -- shrinking) |
| `ci:discarded-audit-write` | pass | 125 sites / 56 files (unchanged from 09-26) |
| `ci:sign-ceremony` | pass | 23 baselined sites, exactly as baselined (unchanged -- DP-02 unmoved) |
| `ci:regulated-delete-audit` | pass | every regulated-table delete has an audit call or is operator-allow-listed |
| `ci:gateway-bypass` | pass | 8 baselined sites tolerated (unchanged) |
| `ci:dead-audit-catch` | pass | 0 baselined / 0 files (unchanged, still green) |
| `ci:session-scoped-rls-bypass` | pass | 34 baselined occurrences in 7 unmounted services, all releasing through `releaseWithoutBypass()` (unchanged) |
| `ci:drizzle-tenant-scope` | pass | 125 sites, all baselined; baseline file still 151 (26 fixed, unbanked -- direction: down, unchanged from 09-26) |
| `ci:tenant-entry-points` | pass | 14 entry points, 9 do not consider entitlement (unchanged) |
| `ci:tenant-isolation:no-regression` | **pass** | **8 candidates vs baseline 9 -- improved from 09-26's red state (9 vs 9, DP-37's live regression); DP-37's fix is confirmed by this gate, not just by reading the diff** |
| `check:security-patterns` | pass | 0 violations / 2,863 files |
| `check:compliance-claims` | pass | 863 customer-facing files scanned, no unsupported claim |

**19 of 19 gates pass at HEAD.** This is a genuine improvement over the 09-26 lens's 17 pass / 1 fail: `ci:tenant-isolation:no-regression`'s DP-37 regression is closed and confirmed by re-running the gate, not inherited from the register's note. No gate is newly `continue-on-error`, PR-only, or skipped in this session's read of `package.json`; branch-protection and CI-run-history honesty (INF-01/02) remain unverified by this session for lack of network/GitHub access, carried as the register/09-26 lens found them.

---

## 4. Baseline ids re-verified as still closed (in passing, not the primary target)

DP-31 (AnA `approve_qms_document`/`qms_change_transition` refusal and conditional rules), the `ci:sign-ceremony` 23-site baseline (DP-02, unmoved -- not individually re-read this session beyond the gate), and the `check:security-patterns` / `check:compliance-claims` zero-violation state.

---

## Independent verification (2026-09-28)

Each high, medium or blocker finding above went to a separate agent told to refute it (read the code at head, trace the real call path, reproduce where possible; default to refuted). Low findings were not independently verified.

### SEC-0928-1 — **confirmed**

I tried to refute this at aff7eae16 and couldn't. The defect is real, and it's slightly worse than reported.

1. Reachable in the launch catalog. retire_qms_document is defined in server/services/ana/qms-labeling-analytics-tool-defs.ts:78, and that file is imported into AnaToolDefinitions.ts:418. It appears in ana-launch-scope.inventory.json under /tools/inScope (574 entries). tool-authorization.register.json:3017-3020 lists it as class "confirm", while approve_qms_document at :309-315 is "refuse".

2. The handler, AnaToolExecutor.ts:13723-13768, never uses the signed module. It opens its own transaction and runs UPDATE qms_documents SET status='retired' ... WHERE ... status <> 'retired' (:13739-13748), so an 'effective' SOP qualifies. It then calls recordGovernedAction with command 'transition' (:13753) and commits (:13760). There is no reverifySigner call, no persistGovernedActionSignature, and no electronic_signatures row.

3. No other layer stops it:
   - The pre-handler gate, preHandlerRefusal (AnaToolExecutor.ts:325-347), only requires ctx.humanConfirmed === true for class 'confirm'.
   - The chat gate, classifyRegisteredTool (governed-tool-gate.ts:130-141), hard-codes tier:'confirm' for every registered tool.
   - The dispatch route, utility.ts:~592-608, calls governedTierOf(command). That function (part11-governance.ts:156-161) checks only PART11_ESIGN_COMMANDS, PART11_GOVERNED_COMMANDS and COMMAND_AUTHORIZATION, none of which list retire_qms_document. It returns 'confirm', so body.confirm===true is enough and eSignRequired=false, which means reverifySigner never runs.
   - runConfirmedTool (utility.ts:222-246) then calls the handler with humanConfirmed:true.

4. The signed door that this bypasses is POST /qms/documents/:id/retire (mdx-qms.ts:707-747). It requires requireEditorAccess, the verifyApprovalSigner ceremony (signing-authority check, then password/MFA), and retireQmsDocumentSigned, which writes the UPDATE, the ledger pair and the e-signature row in one transaction. The AnA tool path skips all of that. Beyond the report, it also skips the editor-role check and the QMS signing-authority check. Any org member with chat access can therefore retire an effective SOP with one click.

5. Reproduced. `npx vitest run server/services/ana/__tests__/qms-change-tools.test.ts server/services/ana/__tests__/tool-authorization.test.ts` gives 66/66 passing. That includes "retires a document (terminal)" (qms-change-tools.test.ts:257-264), which moves an 'effective' document to 'retired' through the tool with no signature step, and tool-authorization.test.ts:66, which asserts ['retire_qms_document','confirm'].

The structural point also holds. classifyRegisteredTool can only ever return tier 'confirm', so no directly registered tool can reach the 'esignature' tier. Severity is high: a controlled document's terminal Part 11 state change can happen with no §11.50/§11.200 signature record, even though document-approval-signature.ts:44-50 itself calls retirement "the same kind of record as the approval that began it."

### SEC-0928-2 — **confirmed**

Real at aff7eae16 for four of the five sites. Line 414 is wrong, and the severity is overstated.

(1) The endpoint is live in production. server/bootstrap/register-platform-routes.ts:149-157 mounts authEnterprise at /api/auth/enterprise with preAuthScope, unconditionally (no dev or feature guard). No launch-catalog client surface calls it: grep of client/src for "auth/enterprise" returns nothing, and the UI's /verify-password callers are all /api/esignature. So it is not reachable by clicking in the product. It is reachable by anyone who POSTs to it directly, and that is exactly how a password-guessing attacker would use it.

(2) The account shape is real. server/services/atomicQuotaService.js:285-290, the insert behind POST /api/tenant-users (server/routes/tenant-users.ts:409ff), writes users(email, name, title, department, status, password_hash, must_change_password, ...) with no default_organization_id. The F-41 commit f339a4459 names the same shape.

(3) The code confirms the fallback to tenant 0. server/routes/authEnterprise.ts:305, 318, 334 and 365 pass tenantId: user.defaultOrganizationId (null) for email_unverified, account_inactive, account_locked and wrong_password. auditOrganizationOf is never imported or used in this file (grep finds 0 hits). In server/services/audit/auth-event-audit.ts, recordedTenant() (around line 109) returns null for a null tenantId. recordAuthEvent then calls write() without runWithTenantScope, so the row is written in the pre-auth scope as tenant 0. The file header at lines 24-26 says the same.

(4) The concrete failure: someone guesses passwords against a colleague's account through POST /api/auth/enterprise/verify-password. The account holds an unusable hash, so every attempt takes the wrong_password branch. Each attempt calls recordFailedLogin (authEnterprise.ts:362) and can end in a lockout. Every refusal, the threshold-exceeded event and the later account_locked refusals go to the platform chain (tenant 0), not the organisation's ledger. The organisation's 11.10(e) review cannot see an attack that locked its own member out. The main door (routes/auth.ts, after F-41) records the same attempts against the organisation, so the two doors disagree.

(5) Correction: line 414 (the user_login_mfa_challenge success event) is NOT affected. authEnterprise.ts:386 returns 403 NO_ORGANIZATION whenever !user.defaultOrganizationId, before the partial token and the MFA-challenge event. That event is only reached when defaultOrganizationId is non-null, and it is then a valid tenant. For the same reason, such a colleague can never complete a sign-in through this door.

Severity: medium rather than high. The door is API-only with no catalog UI, only refusal events are affected, and the rows are not lost, only written to tenant 0. It is still a real gap in the per-tenant audit trail, and it is a duplicate path that F-41 missed. Not reproduced live against the DB: the code path is deterministic and follows from the lines above.

