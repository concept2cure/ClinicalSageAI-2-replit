# OQ-007 — Operational Qualification protocol: Reporting & analytics

| Field | Value |
|---|---|
| Document ID | OQ-007 |
| Version | 0.1 |
| Status | **DRAFT — UNSIGNED** |
| Parent | VMP-001 §5; requirements URS-008 |
| Runner (the executable protocol) | `tests/validation/oq/reporting/run.mjs` — `npm run validation:oq -- reporting` |
| Record | `docs/evidence/W3/<date>/OQ-REPORTING/OQ-007-execution-record.md`, `result.json`, `steps/*` (generated; never edited) |

## Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-11-10 | W3 (`…01QoxbLc`) | First protocol, written at the re-execution for GA (VSR-001 §21) from the code at `97a0fec5cf` and URS-008 v0.1. Reporting & analytics is the seventh launch app and had no protocol: `tests/validation/run-all.mjs` skipped from `qms` to `cmc`. Executed the same day (§3). The first run of the runner recorded OQ-RPT-14 as a failure on the runner's own expectation (it looked for the string `report-run:<id>` in the e-signature register, which names a record as `record_type` and `record_id`); the step now reads the register's row. That run is not kept. |

## 1. Method

As OQ-001 §1: the runner signs the run identity in with its password and authenticator code, calls the API as the client does, and drives the real app in Chromium for the two browser steps. Every request and answer is recorded on its step, with secrets redacted.

**What already exists.** URS-008 §1a lists the routes, services, surfaces and tests this protocol exercises. The protocol and its runner add no screen, route, service or table. The runner follows `tests/validation/oq/cmc/` (one `context.mjs`, step modules imported by `run.mjs`) and uses `tests/validation/lib/harness.mjs` and `credentials.mjs` unchanged.

**Identities.** The run identity (`VALIDATION_USER_*`, an organisation admin) requests the runs. The signer (`OQ_SIGNER_*`, role approver) finalizes: a finalize with the meaning *approval* is refused to the run's requester, so the signer must be another person. `OQ_MEMBER_*` (a member with no signing authority, and not an audit reader) and `OQ_VIEWER_*` (read-only) are the identities the refusal steps act as. A step whose identity is not supplied is recorded as a deviation, *not executed*.

**Fixtures.** `OQ_QMS_PROGRAM_ID` is a program the run identity owns (OQ-006 §1), used for the project-scoped refusals. `OQ_FOREIGN_REPORT_RUN_ID` and `OQ_FOREIGN_TRACKING_PROJECT_ID` are another organisation's report run and project tracking record, and `OQ_FOREIGN_PROJECT_ID` its program. The other organisation has no member, so the run row is written as the database owner by `docs/evidence/W3/2026-11-10/setup/fixtures-reporting.mjs`, and the transcript is filed with the record. The runner refuses to guess any of them.

**The run that is finalized.** OQ-RPT-03 reads the catalog from the canvas bootstrap and requests a run for each runnable type in turn, the research administration scorecard first, until one is admissible as final (`GET /runs/:id/rendered`, `finalEligibility`). Which type that is depends on the organisation's records: a register with no rows carries a blocker, and a report with a blocker is not finalized. The step records every type it tried and why each was not admissible.

**The export's bytes.** The harness client reads a body as text. OQ-RPT-11 fetches the PDF as bytes itself and attaches its own record of the request (`steps/OQ-RPT-11.export.json`), so the SHA-256 it computes is of the bytes sent.

**Installation prerequisite.** The reporting PDF embeds the Noto fonts the production image installs (`fonts-noto-core`, `fonts-noto-cjk`; `Dockerfile.optimized`). Without them the export is refused 503 `REPORT_PDF_FONTS_UNAVAILABLE` and OQ-RPT-11 records a deviation. IQ-001 has no check for them (§4).

**The signing limiter.** A signer is allowed ten finalize attempts in five minutes (`signingAttemptLimiter`, 21 CFR 11.300(d)); OQ-RPT-08 and -09 make seven. A second execution inside five minutes is answered 429 `TOO_MANY_ATTEMPTS`, and the harness waits and retries, recording each retry on the step.

**Not exercised.** Bundles and schedules are read, not created (OQ-RPT-12). The bundle export, the report package zip, deliveries, program groups and the tenant attestation (`GET /api/tenant-export/attestation`, which needs `AUDIT_ATTESTATION_KEY`) have no step. The plan refusal (URS-RPT-014) needs an organisation on a lower plan. The seal's content hash is checked for agreement between the finalize, the seal read and the signature register; the runner does not re-implement the canonical form to recompute it from the rendered report.

## 2. Steps

| Step | URS | Kind | Action | Expected result |
|---|---|---|---|---|
| OQ-RPT-01 | URS-RPT-001 | scripted | anonymous: `GET /api/report-os/runs`, `GET /api/insights-canvas/overview`, `GET /api/audit/reports` | 401/403 each |
| OQ-RPT-02 | URS-RPT-002 | scripted | as the run identity: the canvas bootstrap, the run history, the bundles, the schedules, the compliance catalog; then `/api/report-os/scopes`, `/api/report-os/taxonomy`, `/api/insights/quality` | the five served 200; the three no launch screen calls 403 `LAUNCH_SCOPE` |
| OQ-RPT-03 | URS-RPT-004, 005 | prerequisite | read the catalog; `POST /api/report-os/runs` for a runnable type as the canvas sends it; `GET /runs/:id/rendered` | 201 with the run and its snapshot; the run is the run identity's, not final; a finalize would be admitted |
| OQ-RPT-04 | URS-RPT-004 | scripted | the same run request with `status:"final"`, a confidence, blockers and a summary in the body; read its seal | 201; the stored run carries the engine's status and confidence and none of the supplied content; `sealed: false` |
| OQ-RPT-05 | URS-RPT-004 | scripted | over the run identity's own program: a catalog type marked not computed, a prediction type, an unknown type | 422 `REPORT_TYPE_NOT_COMPUTED`; 422 `PREDICTION_NOT_A_RUN`; 404; the run total unchanged |
| OQ-RPT-06 | URS-RPT-003 | scripted | with another organisation's run id: the run, its rendered report, its seal, its export; then a run over that organisation's project tracking record, its program, its account | four reads 404; over its project 404; over its program 409 `PROGRAM_NOT_ANCHORED` (the answer for a program with no tracking record here); over its account 403 `REPORT_ACCOUNT_SCOPE_MISMATCH`; the run total unchanged |
| OQ-RPT-07 | URS-RPT-005 | scripted | as the viewer: read the run history; request a run | read 200; write 403; the run total unchanged |
| OQ-RPT-08 | URS-RPT-006 | **credentialed** | as the signer: finalize with no reason, no meaning, a wrong password, the password with no authenticator code; as the run identity (the requester): an approval; as the member: an approval; as the signer: a run whose report is not admissible as final | 400 `REASON_REQUIRED`; 400 `MEANING_REQUIRED`; 401 `REAUTH_PASSWORD_INVALID`; 401 `REAUTH_TOTP_REQUIRED` (when a second factor is enrolled); 403 `SEPARATION_OF_DUTIES`; the member 403; the inadmissible run 409 with its reasons; the run still not final, `sealed: false`, no signature row |
| OQ-RPT-09 | URS-RPT-006, 007 | **credentialed** | as the signer: `POST /runs/:id/finalize {reason, meaning:"approval", reauth:{password, totp?}}`; read the run and the signatures by target; finalize again | 200: `status final`, `seal {algorithm sha256, contentHash, sealedAt}`, `signature {signatureId, signedAt, meaning approval}`; the run reads final; one signature row by the signer (approval, `report-run-seal-sha256`, valid, second factor verified when enrolled); the second finalize 409 `RUN_ALREADY_FINAL`, still one row |
| OQ-RPT-10 | URS-RPT-008 | scripted | `GET /runs/:id/seal`; `GET /runs/:id/rendered`; the seal of a run that is not final | `sealed: true` with the finalize's content hash; verdict `intact`, every check ok (audit chain, stored seal, stored document, signature); the signer's printed name, the time, the meaning; the reason; the rendered report is the sealed one; the other run `sealed: false`, `not-verifiable` |
| OQ-RPT-11 | URS-RPT-009 | scripted | `GET /runs/:id/export.pdf` read as bytes; SHA-256 of the body; the audit ledger | 200 `application/pdf`, a `%PDF` body; `X-Export-Sha256` = SHA-256 of the body; the ledger lists the finalization and the export against the run. Without the fonts: 503 `REPORT_PDF_FONTS_UNAVAILABLE`, a deviation |
| OQ-RPT-12 | URS-RPT-010 | ad-hoc | `GET /api/report-os/runs`, `/api/report-os/bundles`, `/api/insights/subscriptions` | each 200; the run history lists the finalized run as final |
| OQ-RPT-13 | URS-RPT-011 | scripted | as the run identity: `GET /api/audit/reports`; as the member: the catalog, then `GET /api/audit/reports/access-review` | the seven reports listed (with the full audit trail entry), `canRun` true for the admin; the member's catalog `canRun` false and the run 403 `AUDIT_READ_RESTRICTED` |
| OQ-RPT-14 | URS-RPT-012 | scripted | `GET /api/audit/reports/electronic-signatures`; SHA-256 of the data; find the finalization of OQ-RPT-09 in the register; `POST /api/audit/export/verify` with the saved export, then with one character changed | 200 with data, manifest (`kind compliance-report`, the organisation, `dataHash`, `signingKeyId`) and signature; `dataHash` = SHA-256 of the data = `X-Report-Data-Hash`; the register lists the finalization, valid, its bound digest the seal's content hash; the saved export verifies; the changed one does not. With no signing key: 503 `REPORT_SIGNING_UNAVAILABLE`, a deviation |
| OQ-RPT-15 | URS-RPT-013 | scripted | `GET /api/audit/reports/audit-trail-integrity`; its verdicts and overall statement | the `audit_logs hash chain` row `intact` over at least one row; every row not intact says why; when a check could not run, the overall statement is not `ok: true`. With no signing key: 503, a deviation |
| OQ-RPT-16 | URS-RPT-014 | scripted | the tier and each type's `requiredTier` and `entitled` from the bootstrap; a run for a type above the plan, if there is one | the tier was read; every type entitled exactly when the tier covers it; a type above the plan 403 with `feature` and `requiredTier`. When the plan covers every type, the refusal is not observable: a deviation |
| OQ-RPT-17 | URS-RPT-015 | unscripted (browser) | Open `/concept2cure/insights`; read the heading and the Reporting views tabs; open *Run history* | the heading; the tabs Reports, Catalog, Run history, Schedules, Bundles; the Run history table lists the report that was run; two screenshots |
| OQ-RPT-18 | URS-RPT-015 | unscripted (browser) | Open `/concept2cure/compliance-reports` | the heading; the catalog names the user access review, the e-signature register and the audit trail integrity attestation; screenshot |

## 3. Execution (2026-11-10, the re-execution for GA — VSR-001 §21)

**17 pass, 0 fail, 1 deviation, 0 not-executed** (record `docs/evidence/W3/2026-11-10/re-execution/OQ-REPORTING/`, executed 2026-11-10T03:35:45Z → 03:39:23Z UTC; transcript `re-execution/transcripts/oq-rerun-3-reporting-cmc.transcript.txt`).

**Installation.** The W3 re-execution's: server code at `97a0fec5cf`, database `c2c_oq_w3_20261110` (fresh, 468 of 468 migration files), `RLS_ENFORCE=on` as runtime role `app_service`, dev-login refused, auth boundary and launch scope enforced, `LAUNCH_SCOPE_API_UNATTRIBUTED=enforce`, no AI provider, a development build (`docs/evidence/W3/2026-11-10/README.md`). `fonts-noto-core` was installed before the execution (§1, §4.1). No `AUDIT_EXPORT_SIGNING_KEY`: the server sealed with its development fallback key. Run identity `oq-runner` (user 1, admin); signer `oq-signer` (user 2, approver); member and viewer as OQ-008. The other organisation's run is `report_runs` 1 in organisation 1 (`transcripts/fixtures-reporting.transcript.txt`).

**Observed.**
- OQ-RPT-01, -02: the three anonymous reads 401. The five served paths 200; `/api/report-os/scopes`, `/api/report-os/taxonomy` and `/api/insights/quality` 403 `LAUNCH_SCOPE`.
- OQ-RPT-03: run 23, the research administration scorecard over the organisation, `completed`, admissible as final on the first type tried; 54 types in the catalog.
- OQ-RPT-04: run 24 requested with `status:"final"`, confidence 97, a blocker and a summary. It was stored `completed` with the engine's confidence (none) and none of the supplied content, `sealed: false`.
- OQ-RPT-05: `usa_fda.pma_submission_readiness` 422 `REPORT_TYPE_NOT_COMPUTED`; `prediction.regulatory_forecast` 422 `PREDICTION_NOT_A_RUN`; an unknown type 404; the run total 23 → 23.
- OQ-RPT-06: organisation 1's run 1: the run, its rendered report, its seal and its export each 404. A run over its project 404; over its program 409 `PROGRAM_NOT_ANCHORED`; over its account 403 `REPORT_ACCOUNT_SCOPE_MISMATCH`; the run total unchanged.
- OQ-RPT-07: the viewer's read 200, the write 403.
- OQ-RPT-08: 400 `REASON_REQUIRED`; 400 `MEANING_REQUIRED`; 401 `REAUTH_PASSWORD_INVALID`; 401 `REAUTH_TOTP_REQUIRED`; the requester's approval 403 `SEPARATION_OF_DUTIES`; the member 403 `AUTH_004`; the lifecycle obligation calendar's run 409, "this report type requires a confidence, and none was computed for this run". Run 23 still `completed`, not sealed, no signature row. This execution followed the runner's first run by under five minutes, so one request of this step was answered 429 by the signing limiter; the harness waited and retried it twice, and the retries are on that request's record (`steps/OQ-RPT-08.api-4.json`).
- OQ-RPT-09: finalized by the signer (user 2, not the requester) with password and authenticator code; seal SHA-256 `f24511c39ff9…`; signature 49, meaning approval, `report-run-seal-sha256`, second factor verified; the second finalize 409 `RUN_ALREADY_FINAL`, still one row.
- OQ-RPT-10: verdict `intact`, four checks ok (audit-chain, stored-seal, stored-document, signature); signed by "OQ Signer" at 03:38:30Z, meaning approval; the reason as given. Run 25 (not final) reads `sealed: false`, `not-verifiable`. The audit-chain check says the row links to the organisation's chain and that no audit HMAC key is configured here, so the link is not checked against a key held outside the database.
- OQ-RPT-11: `report-run-23.pdf`, 40,832 bytes; `X-Export-Sha256` equals the SHA-256 of the body (`4309cd159d00…`); the ledger lists the run's creation, finalization and export.
- OQ-RPT-12: 24 runs listed, run 23 final; no bundles; no schedules.
- OQ-RPT-13: the catalog lists the seven reports and the full audit trail entry; the admin may run, the member may not, and the member's run is 403 `AUDIT_READ_RESTRICTED`.
- OQ-RPT-14: the e-signature register sealed with key `jwt-secret-fallback`; `dataHash` = SHA-256 of the data = the header; the register lists signature 49 against report run 23 with the seal's content hash as its bound digest; the saved export verifies; with one character changed it does not ("Data hash mismatch").
- OQ-RPT-15: the `audit_logs` hash chain `intact` over 1,045 rows; `audit_events` linkage and the HMAC seals *not verified*, each with its reason; the overall statement `ok: null`, "2 of 3 checks could not verify".
- OQ-RPT-17, -18 (unscripted, for the reviewer): both surfaces rendered; screenshots `steps/OQ-RPT-17.reports.png`, `OQ-RPT-17.run-history.png`, `OQ-RPT-18.png`. The run history shows 24 runs, which include the 17 runs made by the approver identity while the runner was written.

**Deviation.** OQ-RPT-16: the organisation is on the enterprise plan, which covers all 54 types, and every type's `entitled` flag follows its `requiredTier`. No type is above the plan, so the 403 plan refusal was not observed. It needs an organisation on a lower plan.

**Owed before signature.** Execution on a production build with the audit export signing key, the seal key and the anchor store configured (§4.2, §4.3); the plan refusal on a lower-plan organisation; steps for the bundle export, the report package and the attestation (§1); an IQ check for the report fonts (§4.1); TM-001 regenerated from this record; human review of this execution.

## 4. Observations from the execution

These are recorded as they were observed. None is closed by this protocol.

1. **The installation had no report fonts.** Before `fonts-noto-core` was installed, `GET /runs/:id/export.pdf` answered 503 `REPORT_PDF_FONTS_UNAVAILABLE` with nothing sent (observed while the runner was written, 2026-11-10T03:26Z; it is not in the record). The refusal is correct. IQ-001 has no check that the fonts the production image installs are present, so an installation without them passes the IQ and cannot export a report. An IQ check is owed.
2. **`audit_events` linkage and HMAC seals read *not verified*.** The integrity report verified the `audit_logs` chain walk and said plainly that the other two checks could not run (no `audit_events` entries; no seal key on this server), and that no anchor store is configured. The report is honest (URS-RPT-013). The seal key and the anchor are installation matters for the production build.
3. **A development server seals with a fallback key.** The manifest names `jwt-secret-fallback`. The 503 `REPORT_SIGNING_UNAVAILABLE` refusal is production's and was not observed.
4. **`POST /api/audit/export/verify` answered any signed-in session.** OQ-RPT-14 used it as the run identity. URS-008 §3 records that it has no role gate, organisation comparison or audit row; that is for the security owner (row D6).
5. **URS-008 was corrected from this execution before it was filed.** The first draft said four views; the surface has five (Catalog). It did not state the 409 `PROGRAM_NOT_ANCHORED` answer for another organisation's program, which is the same answer as for an own program with no tracking record and so reveals nothing, or the `X-Report-Data-Hash` header. URS-008 v0.1 as filed states all three.

## Signature block

| Role | Name | Signature | Date |
|---|---|---|---|
| Executed by (automation owner) | | *unsigned* | |
| Reviewed by (qualified validation contractor) | | *unsigned* | |
| Approved by (founder / system owner) | | *unsigned* | |
