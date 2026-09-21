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

