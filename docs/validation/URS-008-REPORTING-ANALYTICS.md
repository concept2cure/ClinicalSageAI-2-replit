# URS-008 — User Requirements Specification: Reporting & analytics

| Field | Value |
|---|---|
| Document ID | URS-008 |
| Version | 0.1 |
| Status | **DRAFT — UNSIGNED** |
| Parent | VMP-001 |
| Verified by | OQ-007 (`tests/validation/oq/reporting/run.mjs`) |

**App:** Reporting & analytics (the seventh launch app; it joined the catalog by the founder's decision of 2026-09-26, `docs/LAUNCH_DEFINITION_OF_DONE.md`). Two surfaces: `insights` (Reporting & analytics) and `compliance-reports` (Audit & compliance reports), `shared/constants/ui-surface-registry.ui-v2.ts`.

## Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-11-10 | W3 (`…01QoxbLc`) | Drafted from the shipped code at `97a0fec5cf` for the re-execution for GA (VSR-001 §21): `server/routes/report-os.ts` (runs, the rendered report, finalize, the seal, exports, bundles), `server/routes/report-os-insights.ts` (schedules), `server/routes/insights-canvas-routes.ts` (the canvas bootstrap), `server/routes/audit-compliance-reports.ts` (the compliance reports), `server/routes/tenant-export.ts` (the attestation) and the two surfaces. Until this version the app had no URS and no protocol, which is why decision P-28's "OQ-001…007" named a set that was not complete. Nothing was built for it: §1a lists what existed. |

## 1. Intended use

Reporting & analytics is where an organisation runs a report over its own records and keeps it. A report run is computed by a deterministic engine over one scope (a project, the organisation, a document). A run can be finalized, which is an electronic signature: the rendered report is sealed with a SHA-256 content hash, and the seal is verifiable afterwards. A run or a bundle of runs is exported as a file whose SHA-256 is recorded on the audit trail before anything is sent. Audit & compliance reports are the reports an auditor or inspector asks for (user access review, sign-in events, administrative changes, the e-signature register, audit trail integrity, retention and legal holds, the controlled document register); each run is drawn from the organisation's records, sealed with the platform's audit export key and recorded on the audit trail.

The app composes no figure with a model. A report type that no engine computes is refused by name.

## 1a. What already exists

Searched before drafting (RULE 3): `report-os`, `insights`, `insights-canvas`, `compliance-reports`, `audit/reports`, `tenant-export`, `seal`, `finalize`, `export.pdf`, `immutable_report_records` in `server/`, `shared/`, `client/src/concept2cure/v2/`, `tests/` and `docs/validation/`; and `git log --all --diff-filter=D` on `tests/validation/oq/reporting` and `docs/validation/OQ-007*` (nothing was ever filed and deleted).

| What | Where | What it does today | What it does not |
|---|---|---|---|
| The run, its rendered document, finalize, the seal, exports, bundles, deliveries, program groups | `server/routes/report-os.ts` (mounted at `/api/report-os`, `server/bootstrap/register-inline-routes.ts`) | Creates a run from an engine; renders it; finalizes it as a signature with a sealed SHA-256; verifies the seal; exports a PDF with its hash recorded | The launch scope serves `/runs` and `/bundles` only. `/scopes`, `/taxonomy`, `/portfolio`, `/program-groups`, `/deliveries` and `/health` have no launch screen and are refused where unattributed paths are refused |
| The engines | `server/services/report-os/report-engine.ts` and its providers | Says which engine computes a type (readiness, domain, lineage, regional) and refuses the rest | Most of the 61 seeded types have no engine and are refused `REPORT_TYPE_NOT_COMPUTED` |
| The seal | `server/services/report-os/sealing/seal.ts`, `server/services/report-os/sealing/run-seal.ts` | Hashes the canonical rendered report; re-verifies the stored document, the stored seal, the audit chain's record and the signature | The sealed snapshot is a row the runtime role may update. A change is detected on read; it is not prevented |
| The signature ceremony | `server/services/part11/governed-signature-ceremony.ts`, `server/services/part11/signing-authority.ts` | Meaning, signing authority, re-authentication (password and authenticator code), separation of duties, one `electronic_signatures` row | Nothing specific to reports |
| Schedules | `server/routes/report-os-insights.ts` (`/api/insights/subscriptions`) | Lists, creates and enables a schedule, behind the professional plan | `/api/insights/quality` and `/api/insights/predictions` have no launch screen |
| The canvas bootstrap | `server/routes/insights-canvas-routes.ts` (`/api/insights-canvas/overview`) | Returns the catalog of report types with each type's availability, the plan tier and the projects the caller can read | A reduced portfolio projection only |
| The compliance reports | `server/routes/audit-compliance-reports.ts`, `server/services/audit/compliance-reports/` | Seven reports, each sealed (HMAC-SHA256 over a manifest that carries the data's SHA-256) and recorded on the chain; the catalog's eighth entry, the full audit trail, is the signed audit trail export | One run at a time per organisation, held in one process's memory |
| Export verification | `server/routes/audit-trail-routes.ts` (`POST /api/audit/export/verify`) | Recomputes the data hash and the HMAC of a saved export | It has no role gate, compares no organisation and writes no audit row (§3) |
| The audit-trail attestation | `server/routes/tenant-export.ts` (`GET /api/tenant-export/attestation`) | Walks the organisation's chain and signs the verdict | Answers 503 without `AUDIT_ATTESTATION_KEY` |
| The surfaces | `client/src/concept2cure/v2/surfaces/Insights.tsx`, `client/src/concept2cure/v2/surfaces/ComplianceReports.tsx` | The reporting canvas with its Reports, Catalog, Run history, Schedules and Bundles views; the compliance report catalog and run | No end-to-end browser test existed for either |
| Tests | `server/routes/__tests__/report-os-run-engine.test.ts`, `report-os-finalize-signature.test.ts`, `report-os-audit-recording.test.ts`, `audit-compliance-reports.test.ts`; `tests/db/compliance-reports.dbtest.ts` | Unit and database tests of the routes' codes, the ceremony, the recorded export and the sealed compliance report | None is an executed qualification record against a running installation |
| `immutable_report_records` | `shared/schema/report-os.ts` | A table for immutable report records | This app writes no row to it (0 rows on the qualified installation). A finalized report is kept on the run's snapshot |

OQ-007 and its runner are a protocol and a test runner over these. They add no screen, route, service or table.

## 2. Requirements

| URS id | Requirement | Part 11 | Risk | Source |
|---|---|---|---|---|
| URS-RPT-001 | Reporting and compliance-report endpoints require an authenticated organisation member; anonymous requests are refused. | §11.10(d) | high | `server/routes/report-os.ts:142`, `server/bootstrap/register-clinical-intel-routes.ts:189` |
| URS-RPT-002 | The release serves the paths the two surfaces call (`/api/report-os/runs`, `/api/report-os/bundles`, `/api/insights-canvas`, `/api/insights/subscriptions`, `/api/audit`, `/api/tenant-export/attestation`) and refuses a reporting path no launch screen calls with 403 `LAUNCH_SCOPE`. | §11.10(d) | medium | `shared/constants/ui-surface-registry.ui-v2.ts:811-816, 845`, `server/services/entitlements/launch-scope-api.ts:120-140` |
| URS-RPT-003 | The organisation is the session's. A run, its rendered report, its seal and its export are not found (404) for another organisation's run id, and a run over another organisation's project is not found. A run over another organisation's program is answered as a program with no tracking record here (409 `PROGRAM_NOT_ANCHORED`), and one over another organisation's account 403 `REPORT_ACCOUNT_SCOPE_MISMATCH`; nothing is created. | §11.10(d) | high | `server/routes/report-os.ts:1636-1650, 1669-1671, 1689-1691, 1966-1985, 2148-2161` |
| URS-RPT-004 | A report's figures come from an engine. A run request carries no figure: a status, confidence or blocker supplied in the request is not stored. A report type no engine computes is refused 422 `REPORT_TYPE_NOT_COMPUTED`, a prediction 422 `PREDICTION_NOT_A_RUN`, and neither creates a run. | §11.10(a) | high | `server/routes/report-os.ts:183-197, 1703-1717`, `server/services/report-os/report-engine.ts:65-112` |
| URS-RPT-005 | A run is created by a member with a writing role; a read-only member's run is refused 403. The run, its snapshot and a chained audit row are written together. | §11.10(d) §11.10(e) | high | `server/routes/report-os.ts:147-151, 549-568`, `server/services/report-os/persistence.ts:46-94` |
| URS-RPT-006 | Finalizing a run is an electronic signature. It requires a reason (at least 8 characters), a declared meaning and re-authentication with the signer's password and, when one is enrolled, an authenticator code; a wrong password is refused 401 and nothing is written. An approval is refused to the person who requested the run (separation of duties) and to a member without signing authority. | §11.50 §11.200 §11.10(g) | high | `server/routes/report-os.ts:700-768, 2271-2317`, `server/services/part11/governed-signature-ceremony.ts:227-304` |
| URS-RPT-007 | A finalized run is sealed: the answer carries a SHA-256 content hash of the rendered report, the run reads `final`, one `electronic_signatures` row names the signer and the meaning, and the finalization is a chained audit row. A second finalize is refused 409 `RUN_ALREADY_FINAL`; a seal is never replaced. | §11.70 §11.10(e) | high | `server/routes/report-os.ts:637-690, 2271-2317`, `server/services/report-os/sealing/seal.ts:132-148` |
| URS-RPT-008 | A seal can be verified afterwards. The seal read re-hashes the stored document and checks it against the stored seal, the audit chain's record of the finalization and the signature, and answers `intact`, `mismatch` or `not-verifiable`, with the signer's printed name, the time and the meaning. A run that is not final reads `sealed: false`. | §11.10(c) §11.50 | high | `server/routes/report-os.ts:2148-2167`, `server/services/report-os/sealing/run-seal.ts:217-230, 375-383` |
| URS-RPT-009 | An export is recorded before it is sent. The run's PDF carries an `X-Export-Sha256` header equal to the SHA-256 of the bytes sent, and the same hash is on the chained audit row. | §11.10(b) §11.10(e) | high | `server/routes/report-os.ts:575-614, 1966-2008` |
| URS-RPT-010 | The reporting library reads the organisation's own run history, bundles and schedules. | none | low | `server/routes/report-os.ts:2334-2346, 2423-2446`, `server/routes/report-os-insights.ts:435-452` |
| URS-RPT-011 | The compliance report catalog is listed for any member and says whether the caller may run a report. A run is limited to organisation owners, admins, managers and approvers and platform administrators; another member is refused 403. | §11.10(d) | high | `server/routes/audit-compliance-reports.ts:256-259, 289-307`, `server/services/audit/audit-api-authority.ts:58-76` |
| URS-RPT-012 | A compliance report is sealed and recorded: the answer carries the data, a manifest with the data's SHA-256 and the signing key id, and an HMAC-SHA256 signature, the `X-Report-Data-Hash` header carries the same hash, and the run is a chained audit row. With no signing key the run is refused 503 `REPORT_SIGNING_UNAVAILABLE`, never sent unsealed. A saved report verifies, and a changed one does not. | §11.10(c) §11.10(e) | high | `server/routes/audit-compliance-reports.ts:119-136, 160-200, 289-307`, `server/services/audit/compliance-reports/signed-report.ts:75-110`, `server/routes/audit-trail-routes.ts:741-771` |
| URS-RPT-013 | The audit trail integrity report states what was verified and what could not be: the `audit_logs` hash chain walk, the `audit_events` linkage and the HMAC seals each carry their own verdict, and a check that could not run reads *not verified*, never *intact*. | §11.10(e) | high | `server/services/audit/compliance-reports/queries/audit-trail-integrity.ts`, `server/services/audit/compliance-reports/integrity-checks.ts` |
| URS-RPT-014 | A report above the organisation's plan is refused 403 with the feature and the required tier; a plan that could not be read refuses every report. | none | medium | `server/services/report-os/entitlement-map.ts:79-124`, `server/routes/report-os.ts:413-421` |
| URS-RPT-015 | The Reporting & analytics surface renders its heading and its five views (Reports, Catalog, Run history, Schedules, Bundles); the Audit & compliance reports surface renders its heading and the report catalog. | none | medium | `client/src/concept2cure/v2/surfaces/Insights.tsx`, `client/src/concept2cure/v2/surfaces/ComplianceReports.tsx` |

## 3. Assumptions, constraints and known gaps

These were read from the code at `97a0fec5cf` and are recorded as they are. None is closed by this document.

- **The sealed snapshot is detectable, not prevented.** The seal and the sealed document are stored on the run's snapshot (`report_snapshots`), a table the runtime role may UPDATE and DELETE (observed on the qualified installation: `has_table_privilege('app_service', 'report_snapshots', 'UPDATE')` is true). A change after sealing reads `mismatch` (URS-RPT-008) and refuses the render and the export (409 `SEALED_DOCUMENT_MISMATCH`). The audit row and the signature row are append-only. `immutable_report_records` is not used by this app.
- **`POST /api/audit/export/verify` is open to any signed-in member.** It has no role gate, does not compare the manifest's organisation with the session's, and writes no audit row (`server/routes/audit-trail-routes.ts:741-771`). It reads nothing from the database. This is recorded for the security owner (row D6); it is not changed here.
- **The compliance report's one-run-at-a-time guard is in one process's memory** (`server/services/audit/compliance-reports/run-limits.ts`). Two server processes each admit one run.
- **A plan refusal carries no `code`.** It answers 403 with `{error, feature, requiredTier, tier}` (`server/routes/report-os.ts:413-421`); a client tells it from another 403 by the `feature` key.
- **A development server signs with a fallback key.** With no `AUDIT_EXPORT_SIGNING_KEY`, a server that is not production signs a compliance report with the JWT secret and names the key `jwt-secret-fallback` in the manifest. Production has no fallback and refuses 503. The 503 is therefore observable only on a production build or with the key removed.
- **The attestation needs its own key.** `GET /api/tenant-export/attestation` answers 503 without `AUDIT_ATTESTATION_KEY`.

## Approval

| Role | Name | Signature | Date |
|---|---|---|---|
| System owner (founder) | | *unsigned* | |
| Qualified validation contractor | | *unsigned* | |
