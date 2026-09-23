# VSR-001 — Validation Summary Report: Concept2Cure launch catalog (local execution)

| Field | Value |
|---|---|
| Document ID | VSR-001 |
| Version | 0.1 |
| Status | **DRAFT — UNSIGNED** |
| Parent | VMP-001 |
| Execution reported | IQ-001 and OQ-001…006 against the local installation, 2026-09-21 00:22–00:33 UTC (evidence folder `docs/evidence/W3/2026-09-20/`) |
| Matrix | `docs/validation/TM-001-TRACEABILITY-MATRIX.md` (generated from the same records) |
| Prepared by | Claude session W3a (drafting only; cannot sign) |

## Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-09-21 | W3a | First summary from the local baseline execution. |
| 0.2 | 2026-09-21 | WD | §8 appended: IQ-DEV-001 corrected in the product's provisioning; IQ-001 and OQ-001/002/003/005/006 re-executed locally; TM-001 regenerated. Sections 1–7 are unchanged and describe the baseline run. |

## 1. Conclusion in one paragraph

The package now exists as executable protocols with generated, evidence-linked records: 15 IQ checks and 90 OQ steps over 67 requirements, all executed against the real application in Chromium and over its API. The launch catalog is **not** validated by this execution. The local installation carries an open installation deviation (IQ-DEV-001: the runtime database role cannot read 264 tables) that blocked 12 steps — including every Part 11 control in Authoring — and the run surfaced **nine product findings**, three of them Part 11 relevant and high risk (audit chain verifier reports a broken chain; the audit-ledger surface does not show the launch apps' governed writes; QMS approval needs no signature credential). Acceptance criteria VMP-001 §6.1–6.4 are not met. What a qualified person must do to sign is in §7.

## 2. What was executed

| Protocol | App | Steps | Pass | Fail | Deviation | Not executed | Record |
|---|---|---|---|---|---|---|---|
| IQ-001 | installation | 15 | 9 | 0 | 6 | 0 | `IQ/IQ-001-execution-record.md` |
| OQ-001 | Projects | 16 | 13 | 2 | 1 | 0 | `OQ-PROJECTS/OQ-001-execution-record.md` |
| OQ-002 | Vault | 12 | 7 | 3 | 2 | 0 | `OQ-VAULT/OQ-002-execution-record.md` |
| OQ-003 | Authoring | 22 | 9 | 1 | 1 | 11 | `OQ-AUTHORING/OQ-003-execution-record.md` |
| OQ-004 | Submission Center | 15 | 13 | 1 | 1 | 0 | `OQ-SUBMISSION-CENTER/OQ-004-execution-record.md` |
| OQ-005 | Submission Readiness | 9 | 6 | 1 | 2 | 0 | `OQ-SUBMISSION-READINESS/OQ-005-execution-record.md` |
| OQ-006 | QMS controlled documents | 16 | 14 | 1 | 1 | 0 | `OQ-QMS/OQ-006-execution-record.md` |
| **OQ total** | | **90** | **62** | **9** | **8** | **11** | |

Requirement verdicts (TM-001): 67 requirements — **43 pass, 2 partial, 7 fail, 15 open, 0 uncovered**. By app: Projects 7/9 pass · Vault 6/10 · Authoring 4/15 · Submission Center 10/12 · Submission Readiness 5/8 · QMS 11/13.

Every step's API request/response (secrets redacted), screenshot and browser console errors are under `steps/` beside each `result.json`. No result was edited after execution; the matrix was regenerated last (`generatedAt` in `TM-001-TRACEABILITY-MATRIX.json`).

## 3. What passed that matters

- Access control: every launch API refused anonymous access (URS-*-001, all six apps); foreign program ids answer 404 (PROJ-009, VAULT-010); launch scope is enforced server-side and the deep-link gate renders (PROJ-008).
- Vault evidence integrity: ingest records the SHA-256 the runner computed; download returns byte-identical content; a filing decision is recorded with its folder and a cross-modality folder is refused (VAULT-002/006/007).
- Submission lifecycle: state machine enforced; freeze/dispatch reachable only through the governed signature path; the sign action refuses without re-authentication; transmit refuses without a signature; gateway capabilities honestly `configured:false` (SUBC-004…008, 012).
- Deterministic dispatch gate: a fresh sequence is blocked with three named reasons (validation findings, no shadow review, no release signature) (SRDY-002).
- QMS lifecycle: uniqueness, approval stamps with audit outcome, revision requires a reason and bumps the major version, training acknowledgement against the version, review-due, retire with reason (QMS-002/004/006/007/008/009).
- Readiness is honest: `/readyz` returns 503 with `ana=down` when no provider is configured (IQ-09).

## 4. Findings (product) — each needs a change request or a signed acceptance

| # | Finding | Evidence | Part 11 | Risk | Recommended disposition |
|---|---|---|---|---|---|
| F-1 | **Audit chain verifier reports the `audit_logs` chain broken.** `GET /api/c2c/actions/verify-chain` answered 409 `ok:false, rowsChecked:100, brokenAt` row `a9989a0f…` (a `LEAF_CREATED` row written at 00:17:35 UTC). The chain verified `ok` earlier in the day. Root cause not established. Candidate: the writer reads the prior row with `ORDER BY occurred_at DESC … LIMIT 1 FOR UPDATE` (`server/services/audit/chain.ts:116-119`) and the verifier replays in `occurred_at, id` order (`chain.ts:185-189`); concurrent writers (the shell's AnA tool calls — 59 `mcp_tool_call` rows — ran alongside the governed writes) can each commit against the same predecessor, or a row can commit with an `occurred_at` earlier than one already chained. The chain is also **unsealed** locally (`AUDIT_HMAC_KEY` unset, IQ-DEV-002). | OQ-PROJ-06, OQ-VAULT-08 (`steps/*.api-*.json`) | §11.10(e) | high | Investigate under D5 before staging: reproduce with two concurrent governed writes; consider an advisory lock or a sequence number as the chain order key. Do not sign until the verifier passes on staging with the HMAC seal on. |
| F-2 | **The audit-trail ledger surface shows none of the launch apps' governed writes.** `/api/audit-trail/ledger` reads `audit_events` (`server/routes/audit-trail-ledger.routes.ts:173`), written only by SCIM, projects-management and the IVDR worker; program intake, vault ingest/filing, submissions, QMS and tasks write `audit_logs` (`writeChainedAuditRow`) or their own trails. A user sent to "Audit trail" sees an empty ledger after doing governed work. | OQ-PROJ-06b, OQ-VAULT-08b | §11.10(e) | high | Decide the one ledger the surface reads (D5 "second non-compliant route deleted" is the same theme); re-execute. |
| F-3 | **QMS document approval requires no electronic-signature credential.** `POST /api/mdx/qms/documents/:id/approve` with an empty body set the SOP `effective` and stamped the session user as approver; no PIN/password verification, no signature meaning (`server/routes/mdx-qms.ts:463-501`). Authoring's e-sign (`authoring.router.ts:4647`) and the governed `sign` action (`c2c/actions.ts`) both require a credential — the QMS approval bypasses both seams. | OQ-QMS-06 | §11.50 §11.200 | high | Route QMS approval through the existing signature seam (PIN or re-auth + meaning) or document that QMS approvals are not Part 11 signatures. |
| F-4 | Vault ingest refuses a disallowed extension with **HTTP 500** `SERVER_ERROR: File type .exe is not allowed` (multer `fileFilter` error reaches the generic handler, `server/routes/vault-ingest.ts:53`) instead of 400. Nothing is stored, so integrity holds; the status code is wrong. | OQ-VAULT-02 | none | medium | Map the filter error to 400. |
| F-5 | Per-IP rate limiting (`server/config/platform-limits.ts` api 100/min; some routers 60/min, `X-RateLimit-Limit: 60`) is hit by **one** browser session loading two or three surfaces plus a few API calls: Tasks, Vault and Submission Center rendered their error state ("didn't respond") on the first attempt in every run; the runner waits 62 s and reloads. Behind a corporate NAT, users share the bucket. | OQ-PROJ-10 (`browser429`, console errors), OQ-SUBC-13 | none | medium | Key the limiter by session/user, or raise the per-IP ceiling for authenticated shell traffic. |
| F-6 | A review requested and submitted in Authoring is not visible on the Review board: authoring stores `authoring_reviews`/`authoring_workflow_steps`; the board reads `document_workflows`/`workflow_approvals`. | OQ-AUTH-17 (pass), OQ-AUTH-17b (fail) | §11.10(e) | medium | One review lifecycle per the working agreement ("zero duplication"). |
| F-7 | Dossier map cannot be read for the open program: the route needs an integer `projectId` (`dossier-map.routes.ts:46-53`) while the shell supplies the program UUID (`DossierMap.tsx:64`); `parseInt` of a UUID whose leading characters are digits yields an **unrelated integer id** (500 observed) and otherwise 400. Program intake also reports `projectAnchorSkipped: NO_CLIENT_WORKSPACE`, so no PM-spine id exists to bridge the two. | OQ-SUBC-10 | none | medium | Accept the program UUID (or resolve it server-side); never parseInt an identifier. |
| F-8 | Dispatch Readiness gates the **first** submission in the organisation, not the open program's (`DispatchReadiness.tsx:79-84` takes `subs[0]`); with two submissions it showed "No submission sequence to gate yet" for a program whose sequence exists. | OQ-SRDY-07 | none | high | Scope the surface to the open program's submission. |
| F-9 | Dispatch QC calls the model: `POST /:id/dispatch-qc` answered 502 `INVALID_AI_RESPONSE` with no provider. A QC verdict that depends on a model is not a deterministic gate (CLAUDE.md Rule 2: "a tool that asks a model for a figure is a defect"). The GET dispatch-readiness assessment, by contrast, is deterministic and passed. | OQ-SRDY-03 | none | high | Make dispatch QC read the deterministic assessment and let the model only narrate. |

## 5. Deviations and their disposition (proposed; the system owner decides)

| ID / step | Deviation | Proposed disposition |
|---|---|---|
| IQ-DEV-001 (IQ-07) → OQ-PROJ-11, OQ-VAULT-04, OQ-VAULT-09, OQ-AUTH-04 (+11 not-executed), OQ-SRDY-06, OQ-QMS-11 | Runtime role lacks privileges on 264 tables; the grant is an owner-role action the session was not permitted to run. | **Open.** Operator applies the grant (or re-provisions with `install-fresh.mjs`); all six OQs re-executed. Blocks acceptance. |
| IQ-DEV-002 (IQ-04) | Development boot contract; audit chain unsealed (`AUDIT_HMAC_KEY` unset). | Closed by the staging execution (D1, D5). |
| IQ-DEV-003 (IQ-08) | RLS off, no `APP_DATABASE_URL`. | Closed under D3. |
| IQ-DEV-004 (IQ-09) → OQ-AUTH-16, OQ-SRDY-03 | No AI provider (`AnA unavailable: no provider configured`). | Closed by re-executing with a PQ-passed model; F-9 stands regardless. |
| IQ-DEV-005 (IQ-12), IQ-10 | Report-only CSP, no HSTS, dev-login mounted — development mode. | Closed by the staging execution (`NODE_ENV=production`). |
| OQ-SUBC-08 | Governed sign positive case needs the identity's password; dev-login has none available to the runner. | Executed on staging by a tester with a real account. |

## 6. Observations (no disposition needed; recorded for the reviewer)

- Program intake creates a scaffolded document (92 sections) and a canonical submission alongside the program (`meta` in OQ-PROJ-04); the Submission Center therefore lists one submission per IND program before any is created by hand.
- The revision-ledger, freeze and PIN-signature controls of Authoring (URS-AUTH-004…012) could not be exercised here; they are the highest-risk untested area of this baseline.
- Browser console errors captured during UI steps were, without exception, 429 responses (F-5) and one `ERR_CERT_AUTHORITY_INVALID` from an external font/asset fetch through the sandbox proxy; no application `pageerror` was recorded on any launch surface.

## 7. What a qualified person must do to sign

1. **Environment.** Have the operator apply the IQ-DEV-001 grant (or re-provision) and confirm with `npm run validation:iq` that IQ-07 passes; then execute on **staging** with the production boot contract, `AUDIT_HMAC_KEY` set, RLS on, a PQ-passed provider configured, and a real user account whose password the tester holds.
2. **Re-execute** `npm run validation:oq` for all six apps and `npm run validation:traceability`; confirm the matrix shows no `open`/`uncovered` requirement and every `high` requirement `pass`.
3. **Disposition F-1…F-9.** Each is either fixed (re-executed pass) or accepted in writing here, in this section, with the residual-risk statement. F-1, F-2 and F-3 cannot be accepted for a Part 11 claim.
4. **Review** the unscripted/ad-hoc screenshots (`steps/*.png`) for the surfaces and initial each execution record.
5. **Verify the gates fail when they should**: `npm run validation:oq:selftest` (a false expectation records `fail`, a deviation records `deviation`, a dependent step is `not-executed`) and `npm run validation:traceability:selftest` (a step citing an undefined requirement exits 1). Both were run on 2026-09-21 and passed; the evidence README records the output.
6. **Sign** the VMP, URS-001…006, RA-001, IQ-001, OQ-001…006, TM-001 and this VSR; file the signed PDFs under `docs/evidence/validation/` as row D4 requires.

## Approval

| Role | Name | Signature | Date |
|---|---|---|---|
| System owner (founder) | | *unsigned* | |
| Qualified validation contractor | | *unsigned* | |
| Author (drafting only, not a signatory) | Claude session W3a | n/a | 2026-09-21 |

## 8. Addendum 2026-09-21 — re-execution after the IQ-DEV-001 corrective action (worker WD)

Sections 1–7 above describe the baseline execution of 2026-09-21 00:22–00:33 UTC and are left as written. This section records what changed afterwards and what the re-execution found. Evidence: `docs/evidence/WD/2026-09-21/` (the fix and its proofs) and the regenerated records under `docs/evidence/W3/2026-09-20/` (`IQ/`, `OQ-PROJECTS/`, `OQ-VAULT/`, `OQ-AUTHORING/`, `OQ-SUBMISSION-READINESS/`, `OQ-QMS/`; `OQ-SUBMISSION-CENTER/` is the baseline record, its deviation did not cite IQ-DEV-001).

### 8.1 IQ-DEV-001 — root cause and corrective action (product, not operator)

The deviation was a defect in the product's own provisioning, not an operator omission: `install-fresh` and `deploy-migrate` refreshed the runtime role's grants **only when `APP_SERVICE_DB_PASSWORD` was set** (the mint path). An estate whose runtime role already existed and was not minted by the scripts — locally owner `postgres`, runtime `c2c`; in production any `app_service` an operator created outside the scripts — received no grants on the 183 `public` tables the owner had created, and every later migration widened the gap. No hand `GRANT` was applied. The fix (files under `scripts/db/`, tests under `server/db/__tests__/`):

- `provision-app-role.mjs` — one grant recipe (`grantRuntimeRolePrivileges`: USAGE on every application schema; full DML on tables except **`audit` = SELECT, INSERT only** and `extensions` = SELECT; sequences; functions; and `ALTER DEFAULT PRIVILEGES` for the owner's future objects) reached by the mint path (`provisionAppServiceRole`, unchanged contract), a new refresh path for an existing role (`refreshRuntimeRoleGrants`, no password) and the installers' entry point `ensureRuntimeRole`, which identifies the runtime role from `RUNTIME_DB_ROLE` → `APP_SERVICE_DB_PASSWORD` → `APP_DATABASE_URL` → `DATABASE_URL` (when `DATABASE_OWNER_URL` made a different role the owner) and does nothing on a single-role estate. A new grant audit (`auditRuntimeRoleGrants`) walks every application relation and fails on any missing recipe privilege **and on any privilege beyond append-only that the role holds on an audit relation it does not own**; the recipe never REVOKEs and never grants UPDATE/DELETE on `audit`.
- `deploy-migrate.mjs` step 4 calls `ensureRuntimeRole`; step 5 verifies the readiness contract **including the grant audit for the identified role** and refuses the deploy otherwise. `DATABASE_OWNER_URL` now leads the connection precedence (`connection.mjs`), so `DATABASE_OWNER_URL=… DATABASE_URL=… node scripts/db/deploy-migrate.mjs` migrates as the owner and grants the runtime role in one command.
- `provision.mjs` identifies an unminted runtime role from the `APP_DATABASE_URL` login, refuses at preflight if it does not exist, hands it to both children as `RUNTIME_DB_ROLE`, and verifies step 4 **as that role** (previously only when the password was set). `install-fresh.mjs` step 7/8 use the same entry point.
- `audit-runtime-grants.mjs` — the audit on its own, writing the IQ-07-shaped inventory (`deniedCount`, `denied[]`), exit 1 on any gap.
- `docs/operations/DB_READINESS.md`, `DEPLOYMENT.md` — updated.

Measured on `clinicalsage` with the IQ-07 inventory query (`docs/evidence/WD/2026-09-21/denied-before.txt` → `denied-after.txt`): **264 tables denied (183 in `public`) → 0** after one `deploy-migrate` run as the owner with the runtime role identified from `DATABASE_URL` (`deploy-migrate-clinicalsage.transcript.txt`: step 4 "runtime role c2c identified from DATABASE_URL (owner is postgres)", step 5 "grant audit: 1263/1263"). `audit.tamper_proof_log` (owner `postgres`) for `c2c`: SELECT, INSERT only. Fail-proof on a throwaway copy of `clinicalsage_fresh` (`fail-proof-throwaway.transcript.txt`): a hand REVOKE of one table grant and one schema USAGE is caught by the audit (exit 1, named) and healed by deploy-migrate with `RUNTIME_DB_ROLE=app_service` and no password; `GRANT UPDATE ON audit.tamper_proof_log TO PUBLIC` makes deploy-migrate refuse (exit 1) until revoked; a table created by the owner after the refresh is readable with no further grant, and a new audit table is SELECT/INSERT only; a non-existent `RUNTIME_DB_ROLE` fails the deploy rather than being skipped. Unit tests: 44/44 across `provision-app-role.test.ts` and `readiness-contract.test.ts`, including the negative cases (revoked privilege, schema without USAGE, widened audit store, owned audit store, missing role).

**Disposition proposed for IQ-DEV-001: closed locally by a product change; re-verified by IQ-07 = pass below.** It stays listed in §5 as the baseline recorded it. Whether the same shape existed on any hosted estate is answered by running `node scripts/db/audit-runtime-grants.mjs` there.

### 8.2 Re-execution

Server: `npx tsx server/index.ts` on port **5700**, `NODE_ENV=development ALLOW_DEV_AUTH=1 SKIP_DB_STARTUP_TEST=true LAUNCH_SCOPE_ENFORCE=on ALLOWED_ORIGINS=http://localhost:5700,http://127.0.0.1:5700`, `.env` as checked out (`DATABASE_URL` = `c2c`, `RLS_ENFORCE=off`), no AI provider, no Redis. Commands and full console output: `docs/evidence/WD/2026-09-21/validation-rerun.transcript.txt`. Server log: `/tmp/wd-server.log` (excerpts attached by the harness where a 500 was attributed; none was attributed to a privilege error this run — the log contains 0 `permission denied` lines).

| Protocol | Steps | Pass | Fail | Deviation | Not executed | Baseline (§2) | Record |
|---|---|---|---|---|---|---|---|
| IQ-001 | 15 | **10** | 0 | 5 | 0 | 9 / 0 / 6 / 0 | `IQ/IQ-001-execution-record.md` (IQ-07 now **pass**: 0 tables without SELECT) |
| OQ-001 Projects | 16 | **14** | 2 | 0 | 0 | 13 / 2 / 1 / 0 | `OQ-PROJECTS/` |
| OQ-002 Vault | 12 | **9** | 3 | 0 | 0 | 7 / 3 / 2 / 0 | `OQ-VAULT/` |
| OQ-003 Authoring | 22 | **16** | 3 | 1 | 2 | 9 / 1 / 1 / 11 | `OQ-AUTHORING/` |
| OQ-004 Submission Center | 15 | 13 | 1 | 1 | 0 | (not re-run) | baseline record |
| OQ-005 Submission Readiness | 9 | **8** | 1 | 0 | 0 | 6 / 1 / 2 / 0 | `OQ-SUBMISSION-READINESS/` |
| OQ-006 QMS | 16 | **13** | 2 | 0 | 1 | 14 / 1 / 1 / 0 | `OQ-QMS/` |
| **OQ total** | **90** | **73** | **12** | **2** | **3** | 62 / 9 / 8 / 11 | |

Requirement verdicts (TM-001, regenerated 2026-09-21 after the last record): 67 requirements — **53 pass, 1 partial, 10 fail, 3 open, 0 uncovered** (baseline 43 / 2 / 7 / 15). Every step that the baseline recorded as an IQ-DEV-001 deviation or as not-executed behind one now executed: OQ-PROJ-11, OQ-VAULT-04, OQ-AUTH-04…10, 12, 17, 18, 19, 20, 21, 22, OQ-SRDY-06 and OQ-QMS-11 **pass**; the Part 11 controls that were untestable (revision ledger, revert, comments, PIN enrolment and rotation, e-sign refusals' prerequisites) are now exercised. The two deviations left are OQ-AUTH-16 (no AI provider — unchanged, IQ-DEV-004) and OQ-SUBC-08 (baseline, not re-run).

### 8.3 What the re-execution surfaced (new since §4)

Findings F-1, F-2 (OQ-PROJ-06/06b, OQ-VAULT-08/08b), F-6 (OQ-AUTH-17b) and F-8 (OQ-SRDY-07) reproduced exactly as in §4. New:

| # | Finding | Evidence | Part 11 | Risk | Recommended disposition |
|---|---|---|---|---|---|
| F-10 | **The authoring AI-draft route returns content without a provider.** `POST /api/authoring/sections/:id/ai/draft` with no AI provider configured answered HTTP 200 `success:false, degraded:true, source:"template"` carrying a full template draft ("QUALITY OVERALL SUMMARY … [Detailed information about the drug substance…]"). URS-AUTH-012 and the working agreement ("fail closed, never fabricate") require a provider-unavailable refusal with no draft body. Was masked in the baseline (section creation was blocked). | OQ-AUTH-15 (fail), OQ-AUTH-16 (deviation, same payload) | §11.10(a) | high | Refuse with 503/`GATEWAY_UNAVAILABLE` and no `draft` when no provider is configured; delete the template fallback from the governed path. |
| F-11 | **Vault surface does not show the filed document.** With the program selected, `/concept2cure/vault` rendered the data room ("73 documents", category chips) but the document filed in OQ-VAULT-03/04 ("OQ-002 Protocol …") was not in the page text. Was a 500 in the baseline (IQ-DEV-001); now a rendering/read-model question. | OQ-VAULT-09 (fail) | §11.10(e) | medium | Establish whether the surface reads the same store `POST /api/c2c/project-vault/...` writes to; fix or correct the protocol's locator. |
| P-1 (protocol) | **Freeze is correctly refused while a comment is unresolved.** OQ-AUTH-11 froze the document after OQ-AUTH-09 had recorded a comment; the product answered 409 `DOCUMENT_NOT_SETTLED` ("this document still has 1 unresolved comment … resolve them, or freeze again confirming you intend to seal it"). This is the fail-closed behaviour URS-AUTH-009 wants; the protocol did not resolve the comment first. OQ-AUTH-13/14 (e-sign refusals and the positive signature) did not execute behind it. | OQ-AUTH-11 (fail), 13/14 (not executed) | §11.50 §11.70 | — | Protocol change: resolve the comment (or send the confirm flag) before freezing; re-execute 11–14. |
| P-2 (protocol) | **F-3 has been fixed in the product since the baseline; the protocol is behind it.** `POST /api/mdx/qms/documents/:id/approve` now refuses without an electronic-signature password, meaning `APPROVED` and a reason (400 `ESIGNATURE_COMPONENT_MISSING`, §11.50 cited in the response). OQ-QMS-06 (negative case) passes; OQ-QMS-05 (positive approve) fails for the same reason OQ-SUBC-08 is a deviation — dev-login gives the runner no password — and OQ-QMS-07 and OQ-QMS-09 depend on the approval. | OQ-QMS-05 (fail), 07 (not executed), 09 (fail) | §11.50 §11.200 | — | Protocol change: OQ-QMS-05 becomes a credentialed step executed by a tester holding the account password (with OQ-SUBC-08); F-3's disposition in §4 becomes "fixed — verify on staging". |

### 8.4 Effect on §7 (what a qualified person must do to sign)

Item 1's first clause is done for the local installation and the corrective action is in the product; item 1's staging execution, items 2–6 and the dispositions of F-1, F-2, F-6, F-8, F-10 and F-11 remain. Model-dependent steps (OQ-AUTH-16, F-9's OQ-SRDY-03) remain deviations until a PQ-passed provider is configured; no AI provider was available to this session and none was simulated.

Prepared by Claude session WD (drafting only; cannot sign). No result was edited after execution; TM-001 was regenerated last.

## 9. Addendum 2026-09-21 — protocol changes for P-1, P-2 and the product-fix-overtaken expectations; re-execution of OQ-003, OQ-005, OQ-006 (worker WF)

Sections 1–8 are left as written. This section records the protocol changes that §8.3 asked for (P-1, P-2), the rewrite of the expectations that the F-3 and F-9 product fixes (`docs/evidence/WB/2026-09-21/`) had overtaken, and the re-execution of the three affected protocols. Evidence: `docs/evidence/WF/2026-09-21/` (transcripts, credential-provisioning note, signature-row and digest outputs, fail-proofs, gates) and the regenerated records under `docs/evidence/W3/2026-09-20/` (`OQ-AUTHORING/`, `OQ-SUBMISSION-READINESS/`, `OQ-QMS/`). OQ-001, OQ-002 and OQ-004 were not re-run; their records are as §8 left them. No product code was changed by this work; TM-001 is regenerated by the control tower after this addendum.

### 9.1 What changed in the protocols

| Protocol | Change (version 0.1 → 0.2) |
|---|---|
| OQ-003 Authoring | **P-1.** New OQ-AUTH-11a keeps the refusal as the negative case: freeze over the open OQ-AUTH-09 comment → 409 `DOCUMENT_NOT_SETTLED`, nothing frozen. New OQ-AUTH-11b resolves the comment through the product's comment-resolution API (`PATCH /api/authoring/comments/:id {status:"resolved", resolution_note}`) and asserts `resolved_by` = actor, `resolved_at`, and a `comment_resolved` audit event naming the comment. OQ-AUTH-11 then freezes the settled document. The `acknowledgeUnresolved` confirm flag is never used. OQ-AUTH-15/16 (AI draft) now execute before the freeze, because a FROZEN document refuses every edit-class route with 409 and that refusal had answered the fail-closed check for the wrong reason. |
| OQ-005 Submission Readiness | **OQ-SRDY-03** now asserts the deterministic contract: 200 `{clearedToDispatch, blockers, warnings, checklist, verdictSource:"assess-dispatch-readiness", narrative, narrativeUnavailable}`; `clearedToDispatch` and `blockers` must equal the `GET …/dispatch-readiness` gate (client-supplied zeros cannot clear it); with no provider `narrative` is `null` and `narrativeUnavailable.code` is `PROVIDER_UNAVAILABLE`, which the record carries as *narrative: not executed — no provider* and the step is a **pass**. A gateway error on the route is now a fail (a verdict that needs a model is the Rule 2 defect), not a deviation. |
| OQ-006 QMS | **P-2.** OQ-QMS-05 is a *credentialed* step: the signer is a second identity supplied through `OQ_SIGNER_EMAIL` / `OQ_SIGNER_PASSWORD` (`OQ_AUTHOR_EMAIL` optional, default the run identity; the signer must differ — §11.10(d)); when absent the step is recorded *not executed — credential not supplied* and its dependents are not-executed; the password is never defaulted, guessed or written to a record. It approves SOP A with `{password, meaning:'APPROVED', reason, effectiveDate}` and expects 200 with `meta.signature {id, meaning, boundPayloadDigest, bindingBasis}`, then 409 `QMS_INVALID_STATE` on a second approval. New OQ-QMS-05b reads the signature by target (`GET /api/part11/signatures/by-target`), expects exactly one row, and recomputes the §11.70 content digest from the stored document with `tests/validation/lib/qms-digest.mjs` — a re-implementation of `computeQmsDocumentContentDigest`, recorded as such. OQ-QMS-06 expects 400 `ESIGNATURE_COMPONENT_MISSING` naming password, meaning and reason. New negative steps: OQ-QMS-06b wrong password → 401; OQ-QMS-06c the signer's own document → 403 `QMS_SELF_APPROVAL`, no row; OQ-QMS-06d signed approval of SOP B as the fixture the review-due and retire steps need. |
| OQ-004 Submission Center | OQ-SUBC-08 has the same credential gap and the same mechanism (`POST /api/c2c/actions/sign` re-authenticates with the password), so it received the same environment-variable treatment, with an honest expectation: sign 200 and one signature row, then the freeze of a never-validated sequence refused 409 `INVALID_STATE` by the state machine (a signature is necessary, not sufficient). **Not re-executed under W3**: the step was exercised into a scratchpad root only (15 pass there, including OQ-SUBC-10, whose F-7 appears fixed since the baseline); the OQ-004 record stays the baseline until the control tower's next regeneration. |

Harness (`tests/validation/lib/harness.mjs`): `ctx.apiAs(session)` records a second identity's requests on the step with an `identity` field; the self-test still passes. Local credential provisioning: the signer (`oq-signer@validation.local`, user 42, org 2 admin) was created through the product's own `scripts/seed-admin.mjs` with credentials from the environment — a laptop-only path, recorded as a local deviation in `docs/evidence/WF/2026-09-21/README.md` (redacted); on staging the signer is a real account.

### 9.2 Re-execution (server on port 5900, same configuration as §8.2, no AI provider)

| Protocol | Steps | Pass | Fail | Deviation | Not executed | §8.2 (WD) |
|---|---|---|---|---|---|---|
| OQ-003 Authoring | 24 | **19** | 3 | 1 | 1 | 22 steps: 16 / 3 / 1 / 2 |
| OQ-005 Submission Readiness | 9 | **9** | 0 | 0 | 0 | 8 / 1 / 0 / 0 |
| OQ-006 QMS | 20 | **20** | 0 | 0 | 0 | 16 steps: 13 / 2 / 0 / 1 |
| OQ-001, OQ-002, OQ-004 | — | not re-run | | | | 14/2/0/0, 9/3/0/0, 13/1/1/0 |
| **OQ total** | **94** | **84** | **6** | **2** | **1** | 90 steps: 73 / 12 / 2 / 3 |

OQ-003: OQ-AUTH-11a, 11b and 11 pass (P-1 closed); OQ-AUTH-12 passes; **OQ-AUTH-13 fails** for a new reason (§9.4) and 14 is not-executed behind it; OQ-AUTH-15 fails (F-10 reproduces, now observed in the right state); 16 is the no-provider deviation; 17b fails (F-6). OQ-005: all nine pass — OQ-SRDY-03's verdict equals the gate byte for byte (three blockers, `verdictSource=assess-dispatch-readiness`), the narrative is recorded as not executed; OQ-SRDY-07 passes (F-8 fixed in the product between §8 and this run). OQ-006: all twenty pass — signed approval by user 42 of user 1's SOP, one `electronic_signatures` row per signed document (ids 6 and 7; `authentication_method password`, `binding_basis qms-document-version-content-sha256`), recomputed digest equal to the signature's and the document's, 400 / 401 / 403 / 409 refusals each observed with no signature row written. Fail-proof: with no credential OQ-QMS-05 is a deviation and six steps are not-executed; with the author as signer it is a deviation naming the two-person rule (`failproof-credential-gate.txt`).

### 9.3 Dispositions

| Item | Disposition |
|---|---|
| **P-1** | **Closed by protocol change** (OQ-003 v0.2). The comment is resolved through the product's API and the resolution is audited before the freeze; the refusal is kept as a negative step. What remains behind it is not P-1: the e-sign steps now fail on a product defect (§9.4). |
| **P-2** | **Closed by protocol change** (OQ-006 v0.2): OQ-QMS-05 is credentialed and executed; 05b, 06, 06b, 06c, 06d added. What remains: execute the credentialed steps on staging with a real second account (the local signer was provisioned by the seeding script); OQ-SUBC-08's credentialed form has been written but its W3 record is not regenerated. |
| **F-3** | **Fixed in product; verified locally; verify on staging.** OQ-QMS-05/05b/06/06b/06c/06d observed the signed approval contract end to end on this installation (`docs/evidence/W3/2026-09-20/OQ-QMS/`, `docs/evidence/WF/2026-09-21/qms-signature-rows.txt`). §4's row stands as the baseline recorded it. |
| **F-9** | Fixed in product (WB); the deterministic verdict is now what OQ-SRDY-03 qualifies (pass); the narrative remains a model step and is recorded as not executed without a provider — verify the narrative path on staging with a PQ-passed provider. |
| **F-8** | Reproduced in §8; passes in this run (OQ-SRDY-07). Re-dispositioned by the validation owner against the product change that fixed it; not this worker's change. |
| **F-6, F-10** | Reproduce unchanged (OQ-AUTH-17b, OQ-AUTH-15). Open. |

### 9.4 New finding surfaced by P-1's closure

| # | Finding | Evidence | Part 11 | Risk | Recommended disposition |
|---|---|---|---|---|---|
| F-12 | **An e-signature cannot be applied to a frozen authoring document.** After the freeze succeeded, `POST /api/authoring/docs/:id/e-sign` answered 409 `AUTHORING_DOCUMENT_IMMUTABLE` ("Document status FROZEN does not permit this action") for both e-sign requests of OQ-AUTH-13. `server/middleware/authoringObjectAuthorization.ts:31` classifies `freeze|sign|submit|approve|approval` as `approve` (permitted on an immutable document) only as a whole path segment; the segment is `e-sign`, so it is classed `edit` and refused by `documentStatusAllowsAction`. The route (`authoring.router.ts:4571`) is designed to bind the signature to the snapshot in force (`covered_freeze_version`, `covered_content_hash`); the guard makes that impossible, so the signature workflow URS-AUTH-010/011 describe cannot complete on a sealed document. Masked in every earlier run because the freeze had never succeeded. | OQ-AUTH-13 (fail), OQ-AUTH-14 (not executed); `OQ-AUTHORING/steps/OQ-AUTH-13.api-1.json`, `api-2.json` | §11.50 §11.70 | high | Classify `e-sign` (and `sign`) as the signing action in the middleware, or exempt the e-sign route from the immutability guard; re-execute OQ-AUTH-13/14. |

Observation (no disposition needed): after a controlled revision (OQ-QMS-07) the v2.0 draft's `metadata.approval` still carries the v1.0 approval block (reason, meaning, content digest) although `approver_id`/`approved_at` are cleared; the v1.0 signature row itself is untouched.

### 9.5 Effect on §7

Item 1's local clause is done for OQ-003/005/006 at the protocol level; the staging executions, items 2–6 and the dispositions of F-1, F-2, F-6, F-10, F-11 and now F-12 remain. OQ-AUTH-13/14 are unqualified until F-12 is fixed and OQ-003 re-executed. Model-dependent steps (OQ-AUTH-16, the OQ-SRDY-03 narrative) remain unexecuted without a provider; none was simulated.

Prepared by Claude session WF (drafting only; cannot sign). No result was edited after execution.

## 10. Addendum 2026-09-21 — full re-execution on the corrected trunk (control tower)

Every corrective action from §8 and §9 was landed on `concept2cure-v2` (WA F-1/F-2,
WB F-3/F-9, WC F-4/F-5/F-7/F-8, WD IQ-DEV-001, WE F-10/F-11, F-12 in the authoring
object-authorization middleware) and all six OQ protocols were run once more, in order,
against one server (port 5200, no AI provider, `OQ_SIGNER_*` set to the local second
signer of §9) on a working tree with nothing uncommitted.

### 10.1 Protocol correction

OQ-VAULT-08b asserted that the ledger "grew" since OQ-VAULT-00. The ledger read is a
newest-first window (`limit`), so on a database whose ledger already exceeds the window
the count cannot change although the writes are present and chained — the step failed on
that arithmetic alone (the document's ingest and filing were the newest three entries,
each with `hash`/`prevHash`). The step now asserts what is observable: the window lists
this document's ingest and filing, each hash-chained, and the server's own chain verdict
(`meta.chain`, one verifier over the tenant's whole chain, added with F-2's follow-up) is
present. OQ-002 v0.2 records the change.

### 10.2 Results

| Protocol | Steps | Pass | Fail | Deviation | Not executed |
|---|---|---|---|---|---|
| OQ-001 Projects | 16 | 16 | 0 | 0 | 0 |
| OQ-002 Vault | 12 | 12 | 0 | 0 | 0 |
| OQ-003 Authoring | 24 | 22 | 1 | 1 | 0 |
| OQ-004 Submission Center | 15 | 15 | 0 | 0 | 0 |
| OQ-005 Submission Readiness | 9 | 9 | 0 | 0 | 0 |
| OQ-006 QMS | 20 | 20 | 0 | 0 | 0 |
| **Total** | **96** | **94** | **1** | **1** | **0** |

TM-001 regenerated: 67 requirements — 65 pass, 1 partial, 1 fail, 0 open, 0 uncovered
(baseline §5: 43 / 2 / 7 / 15 / 0).

### 10.3 Dispositions

| Finding | State |
|---|---|
| F-1, F-2 | Fixed (WA): chain per tenant with `chain_seq`; ledger reads `audit_logs`; OQ-PROJ-06/06b, OQ-VAULT-08/08b pass. Verify on staging with `npm run ops:verify-audit-chain`. |
| F-3 | Fixed (WB), verified locally with a credentialed signer (§9); verify on staging. |
| F-4, F-5, F-7, F-8 | Fixed (WC); OQ-VAULT-02, OQ-PROJ-10, OQ-SUBC-10/13, OQ-SRDY-07 pass. |
| F-6 | **Open — design decision.** Two review stores (`authoring_reviews`/`authoring_workflow_steps` vs `document_workflows`/`workflow_approvals`). OQ-AUTH-17b fails; URS-AUTH-017 reads fail in TM-001. Requires the founder's choice of the one canonical lifecycle before code changes. |
| F-9 | Fixed (WB); OQ-SRDY-03 passes with the deterministic verdict; the model narrative path is unexecuted without a provider. |
| F-10, F-11 | Fixed (WE); OQ-AUTH-15 and OQ-VAULT-09 pass. |
| F-12 | Fixed (middleware classifies `e-sign` as an approval action); OQ-AUTH-13/14 pass. |
| IQ-DEV-001 | Fixed (WD); IQ-07 passes. |
| P-1, P-2 | Closed by protocol change (§9); staging execution with a real second account owed. |
| OQ-AUTH-16 | Deviation — no PQ-passed provider configured; nothing simulated. |

### 10.4 What the package still owes before signature

Staging execution of IQ-001 and all six OQ protocols with the production image, a real
second signer account, and a configured PQ-passed provider for OQ-AUTH-16; the F-6
decision and its re-execution; signatures (founder and one qualified contractor).

Prepared by the control-tower Claude session (drafting only; cannot sign). No result was
edited after execution; the runner regenerated every record under
`docs/evidence/W3/2026-09-20/`.


## 11. Addendum 2026-09-22 — live proof of the WP and WK fixes; TM-001 regenerated (LIVE-PROOF session)

Appended only. Sections 1–10 are unchanged and describe the runs they were written
for. The revision-history table sits above §1 and was therefore not touched either;
this section is its own record.

Executed 2026-09-22 00:07–00:11 UTC against `npx tsx server/index.ts` on port 5102
(`ALLOW_DEV_AUTH=1 SKIP_DB_STARTUP_TEST=true LAUNCH_SCOPE_ENFORCE=on`), branch
`concept2cure-v2` @ `8a40bb187be3f5b89b8380d23950029d908537f3`, identity
jonmichaelpsmith@gmail.com / organisation 2. `/readyz` **503**, `anaState
no_provider` — **no AI provider is configured; no model output was produced,
requested or simulated.** Full transcripts:
`docs/evidence/LIVE-PROOF/2026-09-21/`.

§8, §9 and §10 established their verdicts from unit, integration and protocol
evidence. This section supplies the two live verdicts those sections owed.

### 11.1 The vault-filed leaf and dispatch readiness — new finding F-13, fixed before it was filed

**Numbering note.** This report's **F-5 is the per-IP rate limiter** (§4), fixed by
WC and recorded in §10.3. The vault-leaf defect below was surfaced by the two demo
packs on 2026-09-21, *after* the F-1…F-12 set closed, and has had no F-number in
this report until now. It is filed here as **F-13** so the disposition has an
identifier. (The MDX demo pack numbers it "F4" in its own local scheme; that is the
same defect.)

| # | Finding | Evidence | Part 11 | Risk | Disposition |
|---|---|---|---|---|---|
| F-13 | **Dispatch readiness could not resolve a document filed from the Vault.** `submission_leaves` addresses two key spaces — `document_id` (integer) and `document_uuid` for the uuid-keyed vault (`migrations/20260917b_submission_leaf_document_uuid.sql`). `upsertLeaf` accepted a vault leaf by uuid and pinned its content hash; the readiness validator then tested the integer column alone. Every vault-filed leaf read back as `UNRESOLVED_DOCUMENT` — "has no resolvable document" — so **no sequence assembled from uploaded documents could ever clear the dispatch gate**, and the Builder showed "Source document: unlinked" on the leaves it had just linked. A third cause sat under it: the `SubmissionLeaf` interface did not declare `documentUuid`, so `listLeaves`' `as SubmissionLeaf` cast erased the uuid from every caller's view. | Before: `docs/evidence/DEMO/biotech/manifest.json` `records.submission.readiness`, `docs/evidence/DEMO/mdx/manifest.json` `records.readiness` (6 `UNRESOLVED_DOCUMENT` errors each). After: `docs/evidence/LIVE-PROOF/2026-09-21/transcripts/dispatch-readiness-{biotech,mdx}.json`, `leaves-{biotech,mdx}.json` | none | **high** | **Fixed (WP), now verified live.** `server/services/ectd/leaf-document-resolver.ts` — one resolver for the readiness assessment, the Builder's source-document column and the freeze/dispatch/transmit gates that compose it; it classifies each pointer per its table's key space and compares the pinned SHA-256 with the digest the store reports now, raising `DOCUMENT_CONTENT_MISMATCH` rather than passing silently. Revert-proof: with the pre-fix predicate restored, 5 of 32 cases in `dispatch-readiness.test.ts` fail. |

**Live verdicts, `GET /api/submissions/sequences/:seqId/dispatch-readiness`** (note:
the route carries no `/submissions/:id` prefix — the prefixed form answers 404):

| | biotech · submission 67 · sequence 28 | mdx · submission 68 · sequence 29 |
|---|---|---|
| | before → after | before → after |
| `leafCount` | 6 → 6 | 6 → 6 |
| `validationErrors` | **6 → 0** | **6 → 0** |
| `readiness.errors` (`UNRESOLVED_DOCUMENT`) | **6 → 0** | **6 → 0** |
| `readiness.warnings` (`MISSING_REQUIRED_SECTION`) | 6 → 6 (unchanged) | 3 → 3 (unchanged) |
| `readiness.infos` | 1 → 1 (unchanged) | 0 → 0 |
| `gate.blockers` | 3 → **2** | 2 → **1** |

All twelve vault leaves now resolve. `GET .../sequences/:seqId/leaves` returns, on
every one of them, `sourceDocument: {keyKind:"uuid", status:"resolved", pin:"match",
reason:null}` with `pinnedSha256 === storedSha256`; `documentId` is still `null`,
which is correct for a uuid-keyed vault row. "Source document: unlinked" is gone.

**The two blockers that remain are real and are recorded as such.**

1. *Both sequences* — "No completed Shadow Review has run for this sequence."
   `GET .../sequences/29/shadow-review` returns `[]`; sequence 28 returns one row,
   `status:"failed"`, `model:null`, `summary:null`. Shadow Review is a model-driven
   lens and **there is no AI provider configured**, so it cannot complete in this
   environment. This blocker is **owed to a provider key**. The gate refusing to
   certify a never-reviewed dossier is the required behaviour; nothing was done to
   clear it.
2. *Sequence 28 only* — "requires a 21 CFR Part 11 release signature and none has
   been applied". `releaseSignature.required` is `true` for the IND and `false` for
   the 510(k) (`sequence 29` is `cleared: true`). No dispatch-intent signature
   exists on `ectd-sequence:28` and no orchestrator run is linked. Clearing it
   requires a real signing event by a real signer — the control that must not be
   faked.

Both were present in the before record. The fix removed six false blockers and left
the two true ones standing.

### 11.2 F-6 — the one review lifecycle, verified live

**F-6 is closed.** §10.3 carried it as *"Open — design decision"*; WK implemented the
decision (the store the Authoring launch app writes through is canonical, the board
reads it, the board's five own write routes are gone — see
`docs/evidence/WK/2026-09-21/README.md`), and this run is the protocol execution
that was owed.

```
VALIDATION_BASE_URL=http://localhost:5102 npm run validation:oq -- authoring
OQ-003 Authoring: 23 pass, 0 fail, 1 deviation, 0 not-executed
```

| Step | §10.2 (2026-09-21 16:26, port 5200, `ad69500f`) | this run (2026-09-22 00:08, port 5102, `8a40bb18`) |
|---|---|---|
| OQ-AUTH-17 | pass | pass |
| **OQ-AUTH-17b** | **fail** — `GET /api/review/board` HTTP 200 with `data.meta {scope:"all", total:0}`; *"authoring review request is not on the Review board queue"* | **pass** — HTTP 200, queue **12 items**, listing the document |

The queue row the board returns for the document OQ-AUTH-17 created carries
`docStatus:"IN_REVIEW"`, `myReviewStatus:"pending"`, `awaitingMyReview:true`, and a
`reviews[0].id` of `bf9c7e66-7d99-4d98-bf2d-469a6d611227` — the `authoring_reviews`
id that `POST /api/authoring/documents/:id/request-review` returned one second
earlier in OQ-AUTH-17. One review lifecycle, one id space, one store. The same
response also lists the demo packs' outstanding review requests (e.g.
`[Demo · MDX] Cybersecurity and Interoperability Summary`, reviewer
`oq-signer@validation.local`), which closes the MDX pack's local finding F4 by the
same change.

Evidence: `docs/evidence/W3/2026-09-20/OQ-AUTHORING/` (regenerated in full; this run
replaced the OQ-003 bundle only — the other five protocols' bundles are untouched
from the 16:26 run), step file
`OQ-AUTHORING/steps/OQ-AUTH-17b.api-1.json`. Before and after are preserved side by
side in `docs/evidence/LIVE-PROOF/2026-09-21/transcripts/oq-auth-17b-{before,after}/`,
including the prior run's `at-failure.png`.

`OQ-AUTHORING/steps/OQ-AUTH-20.png` from the same run is the board screenshot over
the **seeded demo programs** that WK also owed: filtered to *All open* the surface
reads "8 documents await your review" and lists `[Demo · MDX] Cybersecurity and
Interoperability Summary` and `[Demo · Biotech] Module 2.5 Clinical Overview —
C2C-101` (both IN-REVIEW, reviewer `OQ Signer (validation)`), neither of which was
visible on this surface before the change. The header states the §11.50 boundary in
the product's own words — *"Verdicts recorded here are not electronic signatures —
apply a binding signature from the authoring workspace."* — and the row offers
*Request changes…* and *Record review decision* only, with no delegate action, which
is the absent transition WK stated rather than faked. Copy:
`docs/evidence/LIVE-PROOF/2026-09-21/transcripts/review-board-OQ-AUTH-20.png`.

The credentialed steps ran with the local second signer (OQ-AUTH-12/13/14 pass).
The password was never printed and appears in no evidence file.

The one remaining deviation in OQ-003 is **OQ-AUTH-16**: the AI-draft route answered
HTTP 503 `GATEWAY_UNAVAILABLE` — *"No AI provider is configured for this deployment,
so this section cannot be drafted. Nothing was changed."* OQ-AUTH-15, the fail-closed
negative case on the same route, passes. That deviation is owed to a provider key,
not to a defect.

### 11.3 TM-001 regenerated

```
npm run validation:traceability
TM-001: 67 requirements — pass 66, partial 1, fail 0, open 0, uncovered 0; 96 OQ steps
```

| | §5 baseline | §10.2 | **this run** |
|---|---|---|---|
| requirements | 67 | 67 | 67 |
| pass | 43 | 65 | **66** |
| partial | 2 | 1 | 1 |
| fail | 7 | 1 | **0** |
| open | 15 | 0 | 0 |
| uncovered | 0 | 0 | 0 |
| OQ steps (pass / fail / deviation / not-executed) | 62 / 9 / 8 / 11 | 94 / 1 / 1 / 0 | **95 / 0 / 1 / 0** |

Exactly one requirement moved: **URS-AUTH-013 `fail` → `pass`**, on OQ-AUTH-17b.
Its row now reads `OQ-AUTH-17 (pass)`, `OQ-AUTH-17b (pass)`, `OQ-AUTH-20 (pass)`.
**Correction to §10.3:** that row names "URS-AUTH-017" as the failing requirement;
the requirement F-6 failed was **URS-AUTH-013**. §10 is left as written.

By app: Projects 9/9 pass, Vault 10/10, **Authoring 14 pass + 1 partial**,
Submission Center 12/12, Submission Readiness 8/8, QMS controlled documents 13/13.
`problems: []`. Generated `2026-09-22T00:10:13.813Z`, `runDate 2026-09-20`.

The single remaining **partial** is **URS-AUTH-012** — AI drafting through the
governed gateway — carried by `OQ-AUTH-15 (pass)` + `OQ-AUTH-16 (deviation)`. It is
the only non-`pass` requirement in the set and it stays partial until a PQ-passed
provider is configured.

The matrix machinery was re-proved against its negative case in the same session:
`npm run validation:traceability:selftest` → *"negative case: builder exited 1 and
named URS-FAKE-999 — the gate fails when it should"*, and
`npm run validation:oq:selftest` → a false expectation recorded as `fail`, a
deviation as `deviation`, a dependent step as `not-executed`, a thrown error as
`fail`. Transcript: `docs/evidence/LIVE-PROOF/2026-09-21/transcripts/selftests.txt`.

### 11.4 Disposition summary after this section

| Finding | State after §11 |
|---|---|
| F-1 … F-5, F-7 … F-12 | Unchanged from §10.3. |
| **F-6** | **Closed.** One review lifecycle (WK); OQ-AUTH-17b passes live; URS-AUTH-013 reads `pass`. Staging re-execution still owed with the rest of the package. |
| **F-13** (new, §11.1) | **Closed.** Vault-filed leaves resolve on both demo sequences; Builder source-document column linked; unit revert-proof in `dispatch-readiness.test.ts`. |
| IQ-DEV-001 | Fixed (WD). |
| OQ-AUTH-16 / URS-AUTH-012 | Deviation / partial — no PQ-passed provider configured. Nothing simulated. |
| OQ-SUBC-08, P-1, P-2 | Unchanged: closed locally, staging execution with a real second account owed. |

### 11.5 What the package still owes before signature

Unchanged from §10.4 except that the F-6 decision and its re-execution are now done.
In full, and nothing here is closable by another local run:

1. **Staging execution** of IQ-001 and all six OQ protocols against the production
   image (`NODE_ENV=production`, HMAC-sealed audit chain, RLS on, enforcing CSP,
   dev-login not mounted), witnessed, with a real second signer account holding a
   password for OQ-SUBC-08 and OQ-QMS-05.
2. **A configured PQ-passed AI provider**, to convert OQ-AUTH-16 from deviation to
   an executed step and URS-AUTH-012 from partial to pass, and to let **Shadow
   Review complete** so the two demo sequences' dispatch gates can be assessed
   against a reviewed dossier rather than an unreviewed one. There is no provider
   key in this environment and none was simulated.
3. **A release signature** applied by a real signer on the IND sequence, to exercise
   the §11.70 branch of the dispatch gate end to end.
4. **Verification of F-1/F-2 on staging** — `npm run ops:verify-audit-chain` with the
   seal on; these bear on the Part 11 claim and D5.
5. **The qualified validation contractor's review** of URS/RA against CSA and the
   customer's Part 11 policy (in particular whether PIN + session is an acceptable
   two-component signature and whether QMS approvals are meant to be signatures),
   witness of one full re-execution, and initials on every execution record.
6. **Signatures.** VMP-001, URS-001…006, RA-001, IQ-001, OQ-001…006, TM-001 and
   VSR-001 are all still `DRAFT — UNSIGNED`; the signed PDFs are filed under
   `docs/evidence/validation/`.

Prepared by the LIVE-PROOF Claude session (drafting only; cannot sign). No product
code, server, client, shared or CI file was changed in this session, and no git
command was run. No result was edited after execution; the runner regenerated the
OQ-003 bundle and the matrix builder regenerated TM-001.


## 12. Addendum 2026-09-22 — the first execution under the production posture; six defects it and its preparation exposed (W3 session)

Appended only. Sections 1–11 are unchanged and describe the runs they were written
for.

Every execution filed before this one ran as role `c2c` on the database
`clinicalsage`, with `RLS_ENFORCE=off` (IQ-DEV-003). Under that setting the
tenant-isolation policies are inert. `c2c` also **owns** 746 RLS-enabled tables,
61 of them without FORCE ROW LEVEL SECURITY, and a table's owner is exempt from
its policies. So the package had never been exercised the way D3 requires
production to run. This section records that execution, and the defects found
on the way to it.

**Installation.** Database `c2c_oq_w3_20260922b`, provisioned from empty with
`C2C_DB_NAME=c2c_oq_w3_20260922b npm run up` at `6a0575213`. Server
`npx tsx server/index.ts`, booted from the env files `npm run up` wrote (no
database variable exported), with `RLS_ENFORCE=on NODE_ENV=development
ALLOW_DEV_AUTH=1 LAUNCH_SCOPE_ENFORCE=on` on port 5200. Runtime role
`app_service`: not superuser, no BYPASSRLS, owns no table. The server logged
`RLS enforcement mode resolved {"mode":"on"}`. No AI provider is configured, and
no model output was produced, requested or simulated. Second signer: user 11
`oq-signer@validation.local`, provisioned into this database only through
`scripts/seed-admin.mjs`, as §9 did. Its password is held in the session
scratchpad and never in the tree (`transcripts/provision-signer.transcript.txt`
is redacted, and a search of the evidence for the password finds nothing).

OQ at `e2d910d6f`. IQ at `32569d496`, whose only difference from `e2d910d6f` is
the IQ runner and IQ-001: `git diff e2d910d6f 32569d496 -- server client shared
migrations db package.json package-lock.json` is empty. Evidence:
`docs/evidence/W3/2026-09-22/`.

### 12.1 Results

| Record | Pass | Fail | Deviation | Not executed |
|---|---|---|---|---|
| IQ-001 (v0.3) | 11 | 0 | 4 | 0 |
| OQ-001 Projects | 16 | 0 | 0 | 0 |
| OQ-002 Vault | 12 | 0 | 0 | 0 |
| OQ-003 Authoring | 23 | 0 | 1 | 0 |
| OQ-004 Submission Center | 15 | 0 | 0 | 0 |
| OQ-005 Submission Readiness | 9 | 0 | 0 | 0 |
| OQ-006 QMS controlled documents | 20 | 0 | 0 | 0 |
| **OQ total** | **95** | **0** | **1** | **0** |

IQ-07 and IQ-08 pass for the first time: `app_service` owns 0 RLS tables
without FORCE, and `RLS_ENFORCE=on` with `APP_DATABASE_URL` set. The remaining
IQ deviations are the development-install ones (IQ-DEV-002, 004, 005, and
IQ-10's production refusal), which only staging closes. The single OQ deviation
is OQ-AUTH-16 (no provider).

TM-001 is regenerated from this set (`runDate 2026-09-22`): 67 requirements,
66 pass, 1 partial (URS-AUTH-012), 0 fail, 0 open, 0 uncovered, and `problems: []`.
The verdicts are the same as §11.3's, now against the production posture. The
default run date in `scripts/validation/build-traceability.mjs`,
`scripts/validation/run-iq.mjs` and `tests/validation/lib/harness.mjs` moves
from `2026-09-20` to `2026-09-22`, so the matrix and the next re-execution use
this set. The `2026-09-20` records stay in the tree unchanged as history.

### 12.2 Findings

| Id | What | Where it bit | State |
|---|---|---|---|
| **F-14** (product) | Under the non-owner runtime role, `POST /api/vault/ingest` answered 500 on every upload: `new row violates row-level security policy for table "documents"`. The `vault.*` policies key on the organisation's UUID (`core.can_write_program` → `identity.current_org_id()` ← `app.current_org_id`). The route-level `authMiddleware` (`server/auth.ts`) rebuilt `req.user` and `req.tenantContext` without the UUID the global `authenticateToken` gate had resolved. The route re-opens its scope from `req.tenantContext` after multer, so the scope it re-opened had no UUID. The same object carries the UUID to the authoring router's post-multer scope and to the AI editing, chat, cortex and module-integration routes. | OQ-VAULT-03 under `RLS_ENFORCE=on`: 4 pass, 1 fail, 7 not executed (`vault-rls-before-after/before-e2d910d6f/`). The filed 12/0/0 never saw it, because `c2c` owns `vault.documents`. | **Fixed** `e2d910d6f`: the gate composes the canonical `enforceOrgMembership` and publishes the UUID. OQ-002 12/0/0 under the production posture (`after-e2d910d6f/`). Unit test red on the original, falsified on the live path. |
| **F-15** (product / configuration) | In RLS shadow mode (`RLS_ENFORCE=off`, which `scripts/setup-local-db.sh` writes into `.env` for development), the pool sets no tenant variables, and the `vault.*` policy functions have no `app.rls_enforce` clause, unlike the 0021 predicate. With the non-owner role that `npm run up` provisions, Vault ingest is still refused. **A developer or tester on `npm run up` + `npm run dev` cannot upload to the Vault.** | OQ-VAULT-03 in shadow mode after `e2d910d6f`: 4 pass, 1 fail, 7 not executed (`vault-rls-before-after/dev-shadow-after-e2d910d6f/`). | **Open — a decision for the system owner.** (a) Run development in the production posture, `RLS_ENFORCE=on`, which is the posture all six OQs now pass in; or (b) make the GCC-lineage policy functions (`db/migrations/000`, `044c`, `053`, `069`) honour `app.rls_enforce` as 0021 does, amended in place under CLAUDE.md Rule 1. Option (a) keeps one isolation posture everywhere; (b) keeps shadow mode meaningful. |
| **F-16** (product) | `server/db/runtime.ts` loaded `.env` at import time. ESM evaluates imports before `server/index.ts`'s body, so `.env` beat `.env.local` for every entrypoint that skips `scripts/startup.sh`, contrary to `server/index.ts`'s own comment. | This session's first OQ-003 attempt answered 500 `AUDIT_CHAIN_SCHEMA_MISSING` from a stale database named in `.env`. Its record was discarded before re-running and is not filed. With a current database in `.env` the misdirection is silent: a governed create returned 201 into the wrong database. | **Fixed** `6a0575213`: one loader, `server/config/load-env-files.ts`, imported first. Red test on the real pool target, falsified two ways. This set's server booted from the files alone and wrote only to the provisioned database. |
| **P-3** (protocol) | OQ-VAULT-08b asserted only that a chain verdict was present, so `ok=false` passed. The filed 2026-09-21 record passes it over "server chain verdict ok=false over 33 row(s)". That verdict came from a verifier defect fixed in `047b98fda`. OQ-PROJ-06b counted rows. | — | **Fixed** `e0c983cc1` (OQ-001 v0.2, OQ-002 v0.3): both require `meta.chain.ok = true`. Shown on a deliberately tampered chain in a throwaway database: v0.1 passed OQ-PROJ-06b while OQ-PROJ-06 failed, and v0.2 fails it (`negative-tampered-chain/`). The row was restored and `verify-chain` read ok. |
| **P-4** (protocol) | IQ-07 checked `rolsuper`/`rolbypassrls` and not table ownership. | It passed the `c2c` environment behind every filed execution. It would have passed the superuser owner `postgres`. | **Fixed** `32569d496` (IQ-001 v0.3): **IQ-DEV-006** when the runtime role owns an RLS table without FORCE. Live: `postgres` before pass, after IQ-DEV-006 (127 tables); `c2c` after IQ-DEV-001 plus IQ-DEV-006 (61 tables); `app_service` pass (0). |
| **P-5** (protocol) | The IQ runner read `.env` alone, so on an `npm run up` installation IQ-05/07/08 qualified a different database from the one the server and the OQ used. IQ-05 did not name the database it checked. | Same checkout, only the resolution differing: `clinicalsage` as `c2c` with a false IQ-DEV-001, versus the provisioned database as `app_service`, pass. | **Fixed** `a6bee4cf9` (IQ-001 v0.2): the runner resolves the environment as the server does, and IQ-05 names the database. |

### 12.3 What this changes in the records above

- §8.1's IQ-DEV-001 corrective action and every OQ verdict from §8 to §11 stand
  as records of what was run. But they qualify the `c2c`/`clinicalsage` posture,
  not the one D3 requires, and they could not have detected F-14.
- The §10.2 pass of OQ-VAULT-08b over `ok=false` would read **fail** under v0.3.
- The 2026-09-21 IQ-07 pass would read **IQ-DEV-006** under v0.3.

### 12.4 Disposition summary after this section

| Finding | State after §12 |
|---|---|
| F-1 … F-13 | As §11.4. |
| **F-14** | **Closed** locally (`e2d910d6f`); staging re-execution owed with the rest. |
| **F-15** | **Open** — decision (a) or (b) above. |
| **F-16**, **P-3**, **P-4**, **P-5** | **Closed**. |
| OQ-AUTH-16 / URS-AUTH-012 | Deviation / partial — no PQ-passed provider. Nothing simulated. |

### 12.5 What the package still owes before signature

§11.5 items 1–6 stand, with item 1 narrowed. The full protocol set now passes
locally under the posture staging must run in: RLS enforcing, a non-owner
runtime role, and a credentialed second signer. What local execution cannot
supply is still owed: the production image (`NODE_ENV=production`, HMAC-sealed
audit chain, enforcing CSP, dev-login not mounted), a real second account
created through user administration rather than the seeding script, and a
witness. New:

7. **The F-15 decision.** Until it is made, the Vault cannot accept an upload
   on a development installation brought up the documented way.

Prepared by the W3 Claude session (drafting and execution only; cannot sign).
Product changes in this section: `6a0575213` (env-file loading) and `e2d910d6f`
(F-14). Validation-tooling changes: `a6bee4cf9`, `e0c983cc1`, `32569d496`. No
result was edited after execution. The runners wrote every record, and the
matrix builder regenerated TM-001.

### 12.6 Postscript — the one recurring failure in the production-posture server log

The server log of the §12.1 execution has one recurring error, five times,
each about 30 seconds apart. It is also **F-17** (product): *"[enforcement-mode]
could not read the stored enforcement mode — serving a fail-safe value —
FAIL-CLOSED: pool.query requires an active tenant scope while RLS_ENFORCE=on"*.
The entitlement gate resolves the module-enforcement mode on every request,
including unauthenticated page and asset loads that carry no tenant scope.
The stored-mode read ran on the shared pool unscoped, so under the only RLS
posture production accepts it always failed. **The mode an operator sets on
the Master Licensing console could never take effect in production**; the
server served the deployment value (capped at `report`) and flagged it
degraded. No OQ step covers that console, which is why no step failed.

**Fixed** in the change that files this note. The read runs under
`runWithPreAuthScope`, which marks it as intentionally tenant-less and grants no
role, so no policy is bypassed. `platform_settings` has no row-level security,
so the read succeeds on its own merits. Live, under `RLS_ENFORCE=on` with a
stored mode of `report` (evidence: `docs/evidence/W3/2026-09-22/enforcement-mode-under-rls/`):

| | Resolved mode | Source | Degraded | Read failures |
|---|---|---|---|---|
| Before | `off` | deployment | yes | 2 |
| After | `report` | stored | no | 0 |

A red test runs the real pool guard, `server/services/entitlements/__tests__/enforcement-mode-under-rls.test.ts`.

## 13. Addendum 2026-09-23 — the package executed with the authentication production requires; two Part 11 defects it exposed (W3 session)

Appended only. Sections 1–12 are unchanged.

§12 ran the protocols with RLS enforcing as a non-owner role, but every session
still came from dev-login. Dev-login exists only on a development server with
`ALLOW_DEV_AUTH=1`; production must refuse it (IQ-10), and there every password
sign-in is answered with a TOTP challenge. The harness therefore could not open
a session on any server the package has to be executed on (P-6). No signer had a
second factor enrolled, so no step could see how a signing path treats one
(P-7). This section records the execution in which both identities sign in and
sign the way production requires, and what that execution exposed.

**Installation.**
- Database: `c2c_oq_w3_20260922b`, as §12.
- Runtime role: `app_service`.
- Server posture: `RLS_ENFORCE=on`, `LAUNCH_SCOPE_ENFORCE=on`, no AI provider.
- New in this execution: the server runs with `ALLOW_DEV_AUTH=0` and
  `MFA_ENCRYPTION_KEY` set. Dev-login answers 404, and every password sign-in is
  challenged.

**Identities.**
- Run identity (author): user 17, `oq-runner@validation.local`.
- Second signer: user 11, `oq-signer@validation.local`.
- Both were provisioned into this database only, by `scripts/seed-admin.mjs`.
- Both enrolled a TOTP factor through the product's own endpoints
  (`POST /api/auth/mfa/setup`, then `POST /api/auth/mfa/enable`).
- Passwords and TOTP secrets exist only in the session scratchpad. A search of
  the evidence finds none of them, no six-digit code in any factor field, and
  no bearer token.

IQ and OQ were both executed at `0e2b3a971`. Evidence:
`docs/evidence/W3/2026-09-23/`.

### 13.1 Results

| Record | Pass | Fail | Deviation | Not executed |
|---|---|---|---|---|
| IQ-001 (v0.4) | 12 | 0 | 3 | 0 |
| OQ-001 Projects (v0.3) | 16 | 0 | 0 | 0 |
| OQ-002 Vault | 12 | 0 | 0 | 0 |
| OQ-003 Authoring | 23 | 0 | 1 | 0 |
| OQ-004 Submission Center (v0.3) | 15 | 0 | 0 | 0 |
| OQ-005 Submission Readiness | 9 | 0 | 0 | 0 |
| OQ-006 QMS controlled documents (v0.4) | 20 | 0 | 0 | 0 |
| **OQ total** | **95** | **0** | **1** | **0** |

Every OQ record names `authentication: password+totp`. A run signs in three
times: the run identity and the signer once each, plus OQ-PROJ-02's sign-in
through the form. The server log shows exactly those three. IQ-10 passes for the
first time: dev-login answers 404 on a server without development
authentication. IQ-11 passes on a session opened by password and code. The
remaining IQ deviations are the development-install ones: IQ-DEV-002, 004 and
005. The single OQ deviation is OQ-AUTH-16 (no provider).

TM-001 was regenerated from this set (`runDate 2026-09-23`): 67 requirements,
66 pass, 1 partial (URS-AUTH-012), 0 fail, 0 open, 0 uncovered. The default run
date in `scripts/validation/build-traceability.mjs`,
`scripts/validation/run-iq.mjs` and `tests/validation/lib/harness.mjs` moves to
`2026-09-23`. The `2026-09-22` records stay in the tree, unchanged, as history.

### 13.2 Findings

| Id | What | Where it bit | State |
|---|---|---|---|
| **F-18** (product, §11.200) | `POST /api/c2c/actions/sign` verified the second factor only when the caller chose to send a code. That route is the re-authentication behind the eCTD sequence release signature, CMC batch release, Module 3 approval, 510(k) eSTAR filing and gateway transmittal. A signer with an authenticator enrolled could sign with the password alone, and the Part 11 row recorded `second_factor_verified false, is_valid true`. The QMS approval and `/api/esignature/sign` refused the same signer. The route also answered `REAUTH_USER_NOT_FOUND` for a signer with no stored password, which told that case apart from a wrong password. | First execution with enrolled signers, at `9b77ee3d8`. OQ-SUBC-08 signed `ectd-sequence:3` with the password alone (row 4, `second_factor_verified false`). OQ-QMS-05 was refused `MFA_TOKEN_REQUIRED` for the same signer (`red/F-18/`). | **Fixed** `828faf809`. `verifyReauth` now delegates to the canonical signer re-verification (`server/services/part11/reverify-signer.ts`): the password always, and the enrolled second factor. An unreadable enrolment state is refused. A presented code must verify, because callers record the factors from the request. Unit test: 3 fail / 6 pass on the pre-fix code, 9 / 9 after. Live, OQ-SUBC-08 v0.3: password only → 401 `REAUTH_TOTP_REQUIRED`, no row; password and code → row 11, `second_factor_verified true`. The e-sign modal now asks for the code when verify-password reports `mfaRequired`. |
| **F-19** (product, §11.10(e)) | **Under RLS a sign-in by a user with a second factor leaves no audit record.** `auditAuthEvent` (`server/routes/auth.ts:40`) writes through `auditService.logAction` on the auth mount's pre-auth scope. That scope is tenant `'0'` with no role (`runWithPreAuthScope`), and the `audit_logs` policy admits only rows for the scope's tenant. So `user_login_mfa_challenge` (`auth.ts:605`), which carries the user's tenant, is refused, and `auditAuthEvent` swallows the refusal by design. `POST /api/auth/mfa/verify` (`auth.ts:1314`) records nothing: neither a wrong code nor the session it issues. Events with no tenant (an unknown email) are recorded. By the same mechanism, from source and not yet observed live: every other authentication event that carries a real tenant (a wrong password for a real account, a lockout, a sign-in without MFA) is refused too. | All six password sign-ins against the record server were refused (`observations/sign-in-audit-refused.log.txt`), and `audit_logs` holds 0 `user_login_mfa_challenge` rows. The 4 failed attempts for an unknown account were recorded (tenant 0). No earlier execution could see this: dev-login never reaches the path. | **Open.** Fix: write each authentication event under a scope for the tenant it records, and record the outcome of `/mfa/verify`. Red test on the real pool guard; live re-verification. |
| **P-6** (protocol) | The OQ harness opened sessions with dev-login only. | Against a server without development authentication, every protocol died before its first step: `dev-login failed (404)` (`red/harness-dev-login-only.transcript.txt`). | **Fixed** `9b77ee3d8`, `ebd0edd42`. The harness signs in with a password and completes the TOTP challenge (RFC 6238, checked against Appendix B; no code is presented twice). OQ-PROJ-02 signs in through the form (OQ-001 v0.3; §1 states the session method). |
| **P-7** (protocol) | No signer had a second factor, so no signing step could observe whether a path enforces one. F-18 was invisible to OQ-004 v0.2. | — | **Fixed** `ebd0edd42` (OQ-004 v0.3, OQ-006 v0.4). OQ-SUBC-08 and OQ-QMS-05 first show the password-only signature or approval refused, with no row written. They then sign with password and code. OQ-SUBC-08 and OQ-QMS-05b assert `second_factor_verified`. |
| **P-8** (tooling) | The records carried the authenticator codes the QMS approvals presented. The field is named `mfaToken`, and the redaction list did not include it. | Four step files of the first complete production-authentication run (`ebd0edd42`). That run was not filed, and the codes had been spent. | **Fixed** `52e3acc94`. `mfaToken` is now redacted along with `password`, `totp`, `pin` and the tokens; the set was re-executed. |
| **P-9** (tooling) | Each protocol process signed its identities in separately. A re-run inside 15 minutes exceeded the login limit (10 per 15 minutes per IP), and every protocol after that failed to open a session with 429 `RATE_LIMIT`. | `red/login-limit.transcript.txt`. | **Fixed** `c33e43d26`. `npm run validation:oq` signs each identity in once per run and hands the sessions to the protocols, which re-validate them. |
| **P-10** (protocol) | IQ-10 could neither pass nor fail. v0.3 recorded an observed refusal as a deviation, and recorded dev-login answering where the configuration must refuse it as the same deviation. IQ-11 took its session from dev-login only. | All four combinations were executed on one installation (`IQ-falsification/`). v0.3, dev-login closed: deviation. v0.3, dev-login open: deviation. v0.4, dev-login open: **fail**. v0.4, dev-login closed: pass (the record). | **Fixed** `0e2b3a971` (IQ-001 v0.4). The `NODE_ENV=production` refusal is still qualified on staging. |

### 13.3 Observations for other rows (not dispositioned by this package)

1. **A TOTP code is accepted more than once (D6).** `verifyTOTPToken`
   (`server/services/mfaService.ts:269`) accepts any code in the ±1-step
   window, and nothing records the last step used. A code that has verified is
   therefore accepted again until its window closes, although RFC 6238 §5.2
   requires the verifier to refuse it. Live: one code opened two sessions for
   user 17 inside one time step (`observations/totp-replay.json`). No OQ step
   exercises this, because the harness never presents a code twice. The fix
   stores the last-used step per user and compares-and-sets it atomically on
   every verification.
2. **The server trusts no proxy (D1, D6).** The bootstrap never sets Express
   `trust proxy`. The login and MFA limiters (`server/routes/auth.ts:118,160`)
   key on `req.ip`, and express-rate-limit's forwarded-header check is turned
   off. Live: twelve login attempts, each claiming a different client in
   `X-Forwarded-For`, were all counted in one bucket, and every attempt from the
   fifth on was refused 429 (`observations/login-limit-forwarded-for.txt`).
   Behind the production ALB every user arrives from the ALB's address. About
   ten requests per 15 minutes per ALB node and task would then refuse every
   user's sign-in, and `audit_logs.ip_address` would record the proxy, as
   `server/routes/charters.ts:75-81` already warns. The fix is the deployment's
   hop count set explicitly (never bare `true`), as part of the production boot
   contract.
3. **The Authoring e-signature does not ask for the second factor (for the
   reviewer, §11.5 item 5).** After F-18, three signing paths require an
   enrolled second factor: the governed actions, the QMS approval and
   `/api/esignature/sign`. `POST /api/authoring/docs/:id/e-sign` verifies the
   PIN alone (`server/routes/authoring.router.ts:3906`). OQ-AUTH-14 passed for
   user 17, who has a TOTP factor enrolled. §11.5 item 5 asks whether PIN plus
   session is an acceptable two-component signature. The answer now also
   decides whether this path joins the other three.
4. **The session misstates enrolment.** `GET /api/auth/session` and the login
   response return `mfaEnabled: false, mfaMethods: []` for every user
   (`server/routes/auth.ts:340,586`). No launch surface displays the field, and
   since F-18 the e-sign modal reads `mfaRequired` from verify-password instead.
5. The development build shows *Demo access* on the login page whether or not
   the server provides dev-login (`Concept2CureLogin.tsx:190`, a build-time
   flag). A production build does not render it.

### 13.4 What this changes in the records above

- The OQ records filed in §8–§12 were executed with dev-login sessions, and
  none had a signer holding a second factor. They stand as records of what was
  run, and their signatures are correct for signers without a factor. They
  could not have observed F-18 or F-19.
- IQ-10's deviations in §6 and §12 are the configured-development case, and
  they still read deviation under v0.4.

### 13.5 Disposition summary after this section

| Finding | State after §13 |
|---|---|
| F-1 … F-17 | As §12.4 and §12.6. |
| **F-18** | **Closed** locally (`828faf809`). The staging re-execution is owed with the rest. |
| **F-19** | **Open.** Tracked for the next change. |
| **P-6 … P-10** | **Closed**. |
| F-15 | **Open**: decision (a) or (b), §12.2. |
| §13.3 items 1–2 | Raised for D6 and D1; not closed by this package. |
| §13.3 item 3 | Added to §11.5 item 5 for the reviewer. |
| OQ-AUTH-16 / URS-AUTH-012 | Deviation / partial: no PQ-passed provider, and nothing simulated. |

### 13.6 What the package still owes before signature

§12.5 stands, with item 1 narrowed again. The harness now executes against a
server that refuses dev-login and challenges every sign-in, which is how staging
and production run. Still owed:

- the production image (`NODE_ENV=production`: the dev-login refusal on that
  branch, the HMAC-sealed chain, enforcing CSP and HSTS);
- a real second account created through user administration rather than the
  seeding script;
- a witness;
- a PQ-passed provider;
- a live release signature;
- the contractor's review;
- the F-15 decision;
- the F-19 fix;
- signatures.

Prepared by the W3 Claude session (drafting and execution only; cannot sign).
Product change in this section: `828faf809` (F-18). Validation-tooling changes:
`9b77ee3d8`, `ebd0edd42`, `52e3acc94`, `c33e43d26`, `0e2b3a971`. No result was
edited after execution. The runners wrote every record, and the matrix builder
regenerated TM-001.

### 13.7 Postscript: F-19 fixed, and its scope corrected

**Scope correction to §13.2.** F-19 is not limited to users with a second
factor. Outside development the login route challenges every password sign-in:
email OTP by default, TOTP when enrolled (`server/routes/auth.ts`, "Always
require 2FA"). So before this fix, under RLS, *every* sign-in left no audit
record. The events §13.2 marked "from source, not yet observed live" have now
been observed on real PostgreSQL:
- a wrong password on a real account, which was refused;
- a logout, which was refused;
- the session `/mfa/verify` issues, which was never written at all.

The login route's own comment pointed to a success audit "near `res.json({
success: true, accessToken … })`". That call survives only on the development
path; mandatory MFA moved session creation to `/mfa/verify`, and the audit
call was not moved with it.

**Fix.**
- `recordAuthEvent` (`server/services/audit/auth-event-audit.ts`) replaces
  the route-local helper at all eleven call sites.
- For an event that names an organisation, it writes the row in a scope for
  exactly that organisation, with no role, and around the write alone. The
  request's own queries stay in the pre-auth scope.
- An event that names no organisation is written as before, as tenant 0.
- New-organisation provisioning at signup uses the same least-privilege
  shape, fixed on trunk for the same cause.
- `POST /api/auth/mfa/verify` now records its outcome:
  - `user_login_mfa_failed` for a wrong code (against the organisation) or
    for an invalid or expired challenge (tenant 0);
  - `user_login` success, reason `mfa_verified`, for the session it issues.
- A write that fails is still logged and does not fail the sign-in. That is
  a deliberate policy, now no longer the steady state.

**The source of the organisation is now a security boundary.** A row is
written into whichever organisation the event names, so that name must come
from the server: the user record, or the server-signed MFA challenge.
`/logout` took it from a token it had only *decoded*. With the scope fix
alone, a token signed with any key could write a `user_logout` row into any
organisation's audit chain. Before the fix, RLS refused that row along with
every other one. `/logout` now attributes a logout only when the token's
signature verifies against the server's keys (expiry ignored, because a logout
from an expired session is still an event). Anything else is recorded as an
anonymous logout (tenant 0).

**Shown failing first.** Evidence: `docs/evidence/W3/2026-09-23/red/F-19/`.

| Check | Original code | Scope fix, `/logout` still decoding | Final |
|---|---|---|---|
| `tests/db/sign-in-audit-trail.dbtest.ts`: production route registration, a freshly minted non-superuser `NOBYPASSRLS` role, `app.rls_enforce=on` | 6 fail / 2 pass, with 4 policy refusals logged. The forged-token case passes only because RLS refused every tenant-named write | 3 fail / 5 pass. A token signed with a foreign key writes `user_logout` into the organisation's chain | 8 / 8, 0 refusals. The challenge, wrong code, session, wrong password and genuine logout are recorded against the organisation. The forged logout is not. The product's chain verifier reads the organisation's 5 rows `ok` |
| `server/services/audit/__tests__/auth-event-audit.test.ts` (the scope rule, in the default CI job) | The write without its scope: 2 fail / 8 pass | — | 10 / 10 |
| Live, the MFA-posture server, after the fix | §13.2: 6 of 6 challenge rows refused, 0 rows | — | Sign-in, wrong code, wrong password: 7 rows in org 1's chain, 0 refusals. On the final code, a forged-token logout is recorded as tenant 0, and the genuine logout as org 1 / user 17. The chain verifier reads `ok` over 273 rows in 2 tenants |

§13.5 after this postscript: **F-19 closed** locally; the staging
re-execution is owed with the rest. §13.6 no longer owes the F-19 fix.

Prepared by the W3 Claude session (drafting and execution only; cannot sign).
Product change: the one that files this note. No record in
`docs/evidence/W3/2026-09-23/` was re-executed or edited. Those records were
made before this fix; the OQ protocols do not exercise the audit trail of a
sign-in. That gap is noted for the next URS/OQ revision.
