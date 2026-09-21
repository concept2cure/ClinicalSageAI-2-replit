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
