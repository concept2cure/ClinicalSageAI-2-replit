# OQ-006 — Operational Qualification protocol: QMS controlled documents

| Field | Value |
|---|---|
| Document ID | OQ-006 |
| Version | 0.4 |
| Status | **DRAFT — UNSIGNED** |
| Parent | VMP-001 §5; requirements URS-006 |
| Runner (the executable protocol) | `tests/validation/oq/qms/run.mjs` — `npm run validation:oq -- qms` |
| Record | `docs/evidence/W3/<date>/OQ-QMS/OQ-006-execution-record.md`, `result.json`, `steps/*` (generated; never edited) |

## Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-09-21 | W3a | First protocol; executed locally (see record). |
| 0.2 | 2026-09-21 | WF | VSR-001 §8.3 P-2 / F-3 (fixed in the product 2026-09-21): approval is an electronic signature. OQ-QMS-05 is a CREDENTIALED step executed by a second identity supplied through `OQ_SIGNER_EMAIL` / `OQ_SIGNER_PASSWORD` (recorded *not executed — credential not supplied* when absent); new OQ-QMS-05b (signature row + §11.70 digest recomputation), OQ-QMS-06 tightened to 400 `ESIGNATURE_COMPONENT_MISSING`, new OQ-QMS-06b (401 wrong password), OQ-QMS-06c (403 self-approval), OQ-QMS-06d (signed approval of SOP B as the review-due/retire fixture). Re-executed locally (§3). |
| 0.3 | 2026-09-22 | W3 | §3 records the 2026-09-22 execution under the production posture (RLS enforcing, non-owner runtime role, credentialed second signer); earlier results are kept below it as superseded. No step changed. |
| 0.4 | 2026-09-23 | W3 | OQ-QMS-05 first shows that a password-only approval from a signer with a second factor enrolled is refused with no row written, then approves with the authenticator code; 05b checks the row records the verified second factor; 06c presents the code so its refusal is the two-person rule. The signer signs in with its password and code rather than dev-login (VSR-001 §13). |

## 1. Method

As OQ-001 §1. Two SOPs are created by the run identity (the author): A exercises the signed approval → revise; B exercises the credential refusals, the signed fixture approval, training acknowledgement, review-due and retire. A third SOP, C, is created by the signer to observe the two-person refusal.

**Credentialed steps.** `POST /api/mdx/qms/documents/:id/approve` is a signing act (`{ password, mfaToken?, meaning:'APPROVED', reason, effectiveDate? }`; §11.50, §11.200). A signing act needs the signer's own credential, which the run identity's session does not carry. The signer is therefore a tester-supplied identity, read from the environment by `tests/validation/lib/credentials.mjs`: `OQ_SIGNER_EMAIL`, `OQ_SIGNER_PASSWORD` (an identity holding signing authority — org role admin / approver / reviewer, §11.10(g)), `OQ_SIGNER_TOTP_SECRET` when the signer has a second factor enrolled (as every production signer signs in with one), and optionally `OQ_AUTHOR_EMAIL` (defaults to the run identity). The signer must differ from the author (§11.10(d)); the runner refuses to proceed otherwise. When the credential is absent the step is recorded as a deviation *not executed — credential not supplied* and every dependent step is not-executed. The password is never defaulted, never guessed and never written to a record; nor is the TOTP secret, or any code computed from it. The harness redacts every `password`, `totp` and `mfaToken` key. The signer's session is opened as OQ-001 §1 opens the run identity's, with password and current authenticator code (dev-login only on a development server without a supplied credential). The approve route re-authenticates the signer on every approval: the password against the stored hash and, for a signer with a second factor enrolled, a fresh authenticator code (`mfaToken`). No code is presented twice (`tests/validation/lib/totp.mjs`).

**Digest recomputation.** OQ-QMS-05b recomputes the §11.70 content digest with `tests/validation/lib/qms-digest.mjs`, a re-implementation of `computeQmsDocumentContentDigest` (`server/services/qms/document-approval-signature.ts`) — canonical JSON with sorted keys over `{kind, id, organizationId, docNumber, version, title, docType, category, artifactId, nextReviewDate, metadata minus metadata.approval}`, sha256 hex — from the document as `GET /api/mdx/qms/documents/:id` returns it, and compares it with `meta.signature.boundPayloadDigest` and `metadata.approval.contentDigest`. The signature row is read through `GET /api/part11/signatures/by-target?target=qms-document:<id>`.

## 2. Steps

| Step | URS | Kind | Action | Expected result |
|---|---|---|---|---|
| OQ-QMS-01 | URS-QMS-001 | scripted | `GET /api/mdx/qms/documents` anonymous | 401/403 |
| OQ-QMS-02 | URS-QMS-002 | scripted | create without `docType` | 422 with field errors |
| OQ-QMS-03 | URS-QMS-002, 003 | scripted | create SOP A (`nextReviewDate` +10d); list; detail | 201 draft v1.0 with audit outcome; listed; readable |
| OQ-QMS-04 | URS-QMS-002 | scripted | duplicate `docNumber` | 409 |
| OQ-QMS-05 | URS-QMS-004, 005 | **credentialed** | as the signer: when a second factor is enrolled, first approve A with `{password}` only (v0.4); approve A `{password, mfaToken?, meaning:"APPROVED", reason, effectiveDate}`; approve again | with a second factor enrolled the password-only approval is refused 401 `MFA_TOKEN_REQUIRED`, A stays in review, no row; 200: effective, `approver_id` = signer ≠ author, `approved_at`, `meta.auditTrail {persisted, chained}`, `meta.signature {id, meaning APPROVED, boundPayloadDigest, bindingBasis qms-document-version-content-sha256}`; `metadata.approval.contentDigest` = signature digest; second approve 409 `QMS_INVALID_STATE` |
| OQ-QMS-05b | URS-QMS-005 | scripted | read signatures by target; read A; recompute the §11.70 digest | exactly one row (signer, APPROVED, `qms-document-approval`, binding basis, valid, `second_factor_verified` true when the signer has a second factor enrolled); recomputed digest = signature = document |
| OQ-QMS-06a | URS-QMS-002 | prerequisite | create SOP B (`nextReviewDate` +5d) | 201 |
| OQ-QMS-06 | URS-QMS-005 | scripted | approve B with `{}` (no password, meaning or reason) | 400 `ESIGNATURE_COMPONENT_MISSING`; `fieldErrors` name password, meaning, reason; B stays draft |
| OQ-QMS-06b | URS-QMS-005 | **credentialed** | as the signer: approve B with a wrong password | 401; B stays draft; no signature row |
| OQ-QMS-06c | URS-QMS-005 | **credentialed** | as the signer: create SOP C, approve it with the signer's own password (and code, so the refusal is the two-person rule, not the missing factor) | 403 `QMS_SELF_APPROVAL`; C stays draft; no signature row |
| OQ-QMS-06d | URS-QMS-004 | **credentialed** | as the signer: approve B (signed) | 200 effective with `meta.signature`; one signature row |
| OQ-QMS-07 | URS-QMS-006 | scripted | revise A without reason; with reason | 422; v2.0 draft, approval cleared, audited |
| OQ-QMS-08 | URS-QMS-008 | scripted | training-ack on B; compliance report | 201 with `document_version`; 200 |
| OQ-QMS-09 | URS-QMS-009 | scripted | review-due within 30 days (B effective since OQ-QMS-06d) | B listed, `overdue:false` |
| OQ-QMS-10 | URS-QMS-007 | scripted | retire B with reason | retired; reason kept |
| OQ-QMS-11 | URS-QMS-010 | scripted | raise a change; list; summary | 201; listed |
| OQ-QMS-12 | URS-QMS-011 | scripted | create QMP; list | 201 draft; listed |
| OQ-QMS-13 | URS-QMS-013 | ad-hoc | templates | 200, non-empty |
| OQ-QMS-14 | URS-QMS-012 | unscripted (browser) | Open `/concept2cure/quality`; click *Change control* | SOP A number visible; both tabs captured |
| OQ-QMS-15 | URS-QMS-011, 012 | unscripted (browser) | Open `/concept2cure/qmp` | Plan name visible |

## 3. Result of the local execution (2026-09-23b, one commit carrying every fix — VSR-001 §14)

**20 pass, 0 fail, 0 deviation, 0 not-executed** (record `docs/evidence/W3/2026-09-23b/OQ-QMS/`, executed 2026-09-23T05:21:04.629Z UTC at `0d7b85e50`). Same installation, posture and identities as the 2026-09-23 execution below: database `c2c_oq_w3_20260922b` with the migration set re-applied by `deploy-migrate` first, `RLS_ENFORCE=on`, runtime role `app_service`, dev-login refused, and every session opened by password and authenticator code. Each step is recorded with the kind this protocol gives it (OQ-001 §1, v0.6). OQ-QMS-05: the password-only approval was refused 401 `MFA_TOKEN_REQUIRED` with no row written; the document was approved with password and authenticator code by user 11, not its author, user 17.

### 3.1 Result of the local execution (2026-09-23, production posture with production authentication — VSR-001 §13; superseded by the 2026-09-23b execution)

**20 pass, 0 fail, 0 deviation, 0 not-executed** (record `docs/evidence/W3/2026-09-23/OQ-QMS/`, executed 2026-09-23T02:51:43Z UTC at `0e2b3a971`). Same installation and RLS posture as the 2026-09-22 execution below: database `c2c_oq_w3_20260922b`, `RLS_ENFORCE=on`, runtime role `app_service`, no AI provider configured. It adds the authentication production requires. The server refuses dev-login (`ALLOW_DEV_AUTH=0`; IQ-10 pass, `docs/evidence/W3/2026-09-23/IQ/`). Every session was opened by a password sign-in that completed the TOTP challenge of the identity's enrolled factor, once per identity per run (OQ-001 §1; VSR-001 §13). Run identity: user 17 `oq-runner@validation.local`. Second signer: user 11 `oq-signer@validation.local`. Both enrolled their authenticator through the product's own enrolment endpoints. OQ-QMS-05 (v0.4): signer 11's password-only approval is refused 401 `MFA_TOKEN_REQUIRED`, and no row is written. It then approves with password and code. The author (17) differs from the approver (11); signature 12, meaning APPROVED, `password+totp`; the audit trail is persisted and chained. OQ-QMS-05b: one row, `second_factor_verified` true; the recomputed §11.70 digest equals the signature's and the document's. OQ-QMS-06/06b/06c: 400 `ESIGNATURE_COMPONENT_MISSING`, 401 `PASSWORD_INVALID`, 403 `QMS_SELF_APPROVAL`; none writes a signature row. OQ-QMS-06d: SOP B effective, signature 13.

### 3.2 Result of the local execution (2026-09-22, production posture — VSR-001 §12; superseded by the 2026-09-23 execution)

**20 pass, 0 fail, 0 deviation, 0 not-executed** (record `docs/evidence/W3/2026-09-22/OQ-QMS/`, executed 2026-09-22T22:37:19Z UTC at `e2d910d6f`). Installation: a database provisioned from empty by `npm run up`; the server booted from the checkout with `RLS_ENFORCE=on` as runtime role `app_service` (not superuser, no BYPASSRLS, owns no table — IQ-07 and IQ-08 pass, `docs/evidence/W3/2026-09-22/IQ/`); no AI provider configured. This is the first execution with RLS enforcing and as a role that owns no table. The executions filed before it record `RLS_ENFORCE=off` (IQ-DEV-003), under which the tenant-isolation policies are inert, and runtime role `c2c` on `clinicalsage`, which owns 61 RLS-enabled tables without FORCE — `vault.documents` among them — whose policies therefore never applied to it (VSR-001 §12). Signer: user 11, provisioned as for OQ-004. OQ-QMS-05/05b: SOP A approved by signer 11 ≠ author 2, one signature row, the recomputed §11.70 digest equal to the signature's and the document's. OQ-QMS-06/06b/06c: 400 `ESIGNATURE_COMPONENT_MISSING`, 401 `PASSWORD_INVALID`, 403 `QMS_SELF_APPROVAL`, no signature row written by any of them.

### 3.3 Result of the local execution (2026-09-21, version 0.2 — worker WF, superseded)

**20 pass, 0 fail, 0 deviation, 0 not-executed** (20 steps; record regenerated under `docs/evidence/W3/2026-09-20/OQ-QMS/`; signer identity provisioned locally as described in `docs/evidence/WF/2026-09-21/README.md`). OQ-QMS-05: SOP A approved by the signer (user 42) ≠ author (user 1), `meta.signature` id 6, meaning APPROVED, `authenticationMethod password`, re-approve 409 `QMS_INVALID_STATE`. OQ-QMS-05b: exactly one `electronic_signatures` row (`signature_type qms-document-approval`, `binding_basis qms-document-version-content-sha256`, `is_valid`), recomputed digest equal to the signature's and the document's (`steps/OQ-QMS-05b.digest-recomputation.json`). OQ-QMS-06: 400 `ESIGNATURE_COMPONENT_MISSING` (password, meaning, reason). OQ-QMS-06b: 401 `PASSWORD_INVALID`, no row. OQ-QMS-06c: 403 `QMS_SELF_APPROVAL`, no row. OQ-QMS-06d: SOP B signed effective. OQ-QMS-07/09 execute behind the signed approvals. Fail-proof of the credential gate (scratchpad roots, not under W3): with no credential OQ-QMS-05 is a deviation *not executed — credential not supplied* and 05b/06b/06c/06d/07/09 are not-executed (13 pass, 1 deviation, 6 not-executed); with the author as signer OQ-QMS-05 is a deviation naming the two-person rule. Observation for the reviewer: after OQ-QMS-07 (revise to v2.0 draft) `approver_id`/`approved_at` are cleared but `metadata.approval` (reason, meaning, digest of the v1.0 content) remains on the row — the v1.0 signature row is untouched, but a reader of the v2.0 draft's metadata sees an approval block that belongs to the prior version.

### 3.4 Result of the local execution (2026-09-21, version 0.1 — W3a, superseded)

14 pass, 1 fail, 1 deviation. Fail: OQ-QMS-06 — `POST /qms/documents/:id/approve` with an empty body answered 200 and set the document `effective` with `approver_id` = the session user; the route (`server/routes/mdx-qms.ts:463-501`) verifies no PIN or password and records no signature meaning, so an SOP can be made binding on possession of a session alone — finding F-3 (Part 11 §11.50/§11.200). Deviation: OQ-QMS-11 (`qms_change_controls` unreadable, IQ-DEV-001). Passed: access gate, validation, uniqueness, lifecycle stamps and audit outcomes, revision with reason and major bump, training acknowledgement, review-due, retire, QMP, templates, both surfaces.

## Signature block

| Role | Name | Signature | Date |
|---|---|---|---|
| Executed by (automation owner) | | *unsigned* | |
| Reviewed by (qualified validation contractor) | | *unsigned* | |
| Approved by (founder / system owner) | | *unsigned* | |
