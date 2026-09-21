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
