# URS-0?? (proposed URS-009): User Requirements Specification, the trial master file in the Vault

| Field | Value |
|---|---|
| Document ID | **Not assigned.** Proposed: URS-009. `docs/validation/**` is held by Validation for GA (`01QoxbLcnW…`), which numbers and files it. |
| Version | 0.1 |
| Status | **DRAFT, UNSIGNED, NOT FILED.** Written by the Vault parity lane for Validation to adopt. |
| Parent | VMP-001 |
| Verified by | the OQ drafted beside this file (proposed OQ-009). Neither the filed protocol nor its runner (`tests/validation/oq/etmf/`) exists. Every requirement below names the tests that already prove it in the repository's suites. Those tests are development evidence, not an OQ execution. |

**App:** the Vault (the trial master file is a feature of the Vault app, decision P-75), admitted by decision P-74,
item 1. Admission needs one TMF store (done, eTMF convergence E4, 2026-11-12), the store's migrations on the deploy
path (done: `migrations/20260615_tmf_artifact_filings.sql` and `migrations/20261110_tmf_filings_study_ref.sql` are in
`C2C_MIGRATION_FILES`), and a URS and an OQ (this draft).

## Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-11-12 | Claude (Vault parity lane, `…01KnUGoX3g`) | Drafted from the shipped code after eTMF E4, for Validation to number, review and file. Each requirement is traced to its source and to the tests that prove it today. |

## 1. Intended use

A sponsor keeps each clinical study's trial master file in the Vault. The study is the one Protocol Development
created for the project (`cdisc_prm_studies`, P-75). The expected records are the DIA TMF Reference Model's, with the
essential records of ICH E6(R3) Appendix C marked. A person files a record against a document of the project's Vault,
declares a record not applicable to the study, or removes a filing. Each act carries a reason and is written with
its chained audit row. The product assesses whether the trial master file is complete on the essential records, or
on all of them. It counts a record only when the Vault document it is filed against exists now. The inspection
package is a recorded download. AnA reads a study's trial master file and files a record with the person's
confirmation and reason.

**Scope boundary.**
- The trial master file is study-level: there is no country or site level.
- A device or CRO trial has no trial master file until CTMS converges the study stores (P-75).
- The inspection package is the index and the readiness picture. It holds no document bytes and says so.
- Filing timeliness and a QC state are not recorded, so neither is assessed.

**Entitlement.** A professional-tier module (P-75). It is not in the launch `modules`, which would grant it to every
organisation.

## 2. Requirements

Sources are relative to the repository root. "Proven by" names suites that pass at `ea625d9e66` and later.

| URS id | Requirement | Part 11 | Risk | Source | Proven by (development evidence) |
|---|---|---|---|---|---|
| URS-ETMF-001 | Every `/api/etmf` route requires an authenticated session holding the regulatory-author role. A session without it is refused every route, reads included. | §11.10(d) | high | `server/routes/etmf.routes.ts` | `server/routes/__tests__/etmf.routes.test.ts`, `server/routes/__tests__/etmf-artifacts.routes.test.ts` (401 unauthenticated; 403 without the role) |
| URS-ETMF-002 | A trial master file is a study's. Every route that reads or writes one names a study of a project the caller can open. A study of a project the caller cannot open, or no study, is refused 404 `STUDY_NOT_FOUND` on every route, and nothing is read or written. An access check that cannot be completed is an error (503 `STUDY_ACCESS_UNAVAILABLE`), never "not found". | §11.10(d) | high | `server/services/etmf/tmf-study-access.ts` | `tests/db/etmf-study-binding.dbtest.ts`, `server/routes/__tests__/etmf-artifacts.routes.test.ts` |
| URS-ETMF-003 | Filings are held to their organisation in the database: row-level security on the store, forced, under the non-owner runtime role. A filing's study is held to the filing's own organisation. Another organisation's filing is neither read nor removed. | §11.10(d) | high | `migrations/20260615_tmf_artifact_filings.sql`, `migrations/20261110_tmf_filings_study_ref.sql` | `tests/db/tmf-assessment-audit-outcomes.dbtest.ts` (deployed FORCE RLS, foreign reads and deletes refused), `tests/db/etmf-study-binding.dbtest.ts` |
| URS-ETMF-004 | One reference model is read by every assessment, filing and classification: the DIA TMF Reference Model's 11 zones and 41 records, 26 of them essential, each with a stable code. | none | medium | `shared/constants/domain/tmf-reference-model.ts` | `server/services/__tests__/vault-taxonomy-etmf.test.ts` (one catalog, drift guard), `server/services/etmf/__tests__/tmf-completeness.test.ts` |
| URS-ETMF-005 | A record is filed against a live document of the study's project's Vault. The filing needs the person's reason (at least 8 characters) and a role that may write that Vault. It is written with its chained audit row (`TMF_ARTIFACT_FILED`, naming the study and the document) in one transaction, or not at all. A re-filing updates the one row and names the document it replaced. | §11.10(e) | high | `server/services/etmf/tmf-artifact-persistence.ts` (`recordTmfArtifactFiling`) | `tests/db/etmf-governed-filing.dbtest.ts`, `server/routes/__tests__/tmf-assessment-audit-outcomes.test.ts`, `server/routes/__tests__/etmf-artifacts.routes.test.ts` |
| URS-ETMF-006 | A document of another project, an absent document, or another organisation's document is refused with one code (409 `DOCUMENT_NOT_IN_PROJECT`), and nothing is written. A reference built from the trial id and the record code is refused. | §11.10(d) | high | `server/services/etmf/tmf-artifact-persistence.ts` | `tests/db/etmf-study-binding.dbtest.ts`, `server/services/etmf/__tests__/tmf-document-ref-guard.test.ts` |
| URS-ETMF-007 | A batch filing reports each item. An invalid item is refused and the rest are filed and recorded. The batch stops at an item whose audit row cannot be written: that item is not filed and the rest are not attempted. No receipt is made for a batch that filed nothing. | §11.10(e) | high | `server/routes/etmf.routes.ts` (`/artifacts/bulk`), `tmf-artifact-persistence.ts` | `server/routes/__tests__/tmf-assessment-audit-outcomes.test.ts`, `tests/db/tmf-assessment-audit-outcomes.dbtest.ts` |
| URS-ETMF-008 | A removal needs a reason. The row stays, with who removed it, when and why, written in the audit row's own transaction. The database refuses a removal that carries no reason. A removed filing is served by no reader and cannot be removed twice. Filing the record again clears the removal on the same row, and its audit row says which removal it cleared. | §11.10(e) | high | `tmf-artifact-persistence.ts` (`removeTmfArtifactFiling`) | `tests/db/etmf-governed-filing.dbtest.ts`, `server/routes/__tests__/etmf-artifacts.routes.test.ts` |
| URS-ETMF-009 | A record may be declared not applicable to the study, with a reason of at least 8 characters, who and when, and its audit row (`TMF_ARTIFACT_DECLARED_NOT_APPLICABLE`). A declaration names no document, which the database holds. A live filing is not declared over (409 `RECORD_FILED`). A new declaration replaces the reason on the same row, and the audit row keeps the old one. A declaration is withdrawn as a filing is removed, with a reason. A document filed against a declared record ends the declaration. A declared record is counted as neither filed nor missing, and the count of declarations is stated wherever readiness is. | §11.10(e) | high | `tmf-artifact-persistence.ts` (`declareTmfArtifactNotApplicable`), `server/services/etmf/tmf-completeness.ts` | `server/routes/__tests__/etmf-artifacts.routes.test.ts` (8 cases), `tests/db/etmf-governed-filing.dbtest.ts`, `server/services/etmf/__tests__/tmf-completeness.test.ts` |
| URS-ETMF-010 | Readiness is assessed against the reference model, on the essential records (the default) or on all of them. A record counts as present only when it is filed against a Vault document of the study's project that exists now. A filing with no document, or whose document no longer resolves, is missing and is named. When every remaining gap is a reference outside the Vault, readiness is "not determined", neither ready nor not ready. When no record is left to check (every one declared not applicable), there is no verdict. No percentage is stated. | none | high | `server/services/etmf/tmf-completeness.ts` (`assessTmfCompleteness`), `tmf-artifact-persistence.ts` (`readTrialTmf`) | `server/services/etmf/__tests__/tmf-readiness-counts-only-verified-documents.test.ts`, `server/services/etmf/__tests__/tmf-completeness.test.ts`, `tests/db/etmf-study-binding.dbtest.ts` |
| URS-ETMF-011 | A filed record's state is its document's. The record shows the document's title and version, whether that version is still current, and its review stage as the Vault's Library reads it. No status is typed separately. | none | medium | `tmf-artifact-persistence.ts` (`listTmfArtifacts`) | `tests/db/etmf-study-binding.dbtest.ts` (E3b cases), `server/routes/__tests__/etmf-artifacts.routes.test.ts` |
| URS-ETMF-012 | The inspection package is a recorded download. `EXPORT_GENERATED`, with the SHA-256 of the bytes, is written before anything is sent, and nothing is sent when it cannot be recorded. It holds `manifest.json`, `completeness.json`, `inspection-index.csv` and `README.txt`. It names the study, lists only the study's filings and declarations (each declaration with its reason), and is deterministic in order. Its cover states the verdict as the assessment does, and says that it holds no document bytes. | §11.10(b) §11.10(e) | high | `server/services/etmf/tmf-inspection-package.ts`, `server/routes/etmf.routes.ts` | `tests/db/etmf-governed-filing.dbtest.ts`, `tests/db/etmf-study-binding.dbtest.ts`, `server/services/etmf/__tests__/tmf-inspection-package.test.ts` |
| URS-ETMF-013 | The audit rows these acts write form one intact chain for the organisation, verified by the platform's chain verifier after filings, a removal, a re-filing and a download. | §11.10(e) | high | `server/services/auditService.ts` (`writeChainedAuditRow`), `tmf-artifact-persistence.ts` | `tests/db/etmf-governed-filing.dbtest.ts` |
| URS-ETMF-014 | The classifier names a record (its code) only when a name is that record's catalog name or code. A name that matches a keyword rule is given a zone and no record; a name that matches nothing, or names records of two zones, is given no zone. Nothing is filed into a zone nobody chose, and AnA's filing files only a named record. | none | medium | `server/services/etmf/etmf-logic.ts` (`classifyArtifact`) | `server/services/etmf/__tests__/etmf-classifier-*.test.ts`, `etmf-unmatched-artifact-is-unclassified.test.ts` |
| URS-ETMF-015 | AnA reads a study's trial master file (`get_tmf_view`) through the store, for a person admitted to the study's project. It states the store's readiness in words and its counts, with no percentage. AnA files a record (`classify_tmf_artifact`) through the store only with the person's confirmation and reason. It refuses a name that is no record of the reference model and asks which record is meant. It passes on the store's refusals with their codes. | §11.10(e) | high | `server/services/ana/AnaToolExecutor.ts` (the two handlers), `server/services/ana/tool-authorization.register.json` | `server/services/ana/__tests__/etmf-tools.test.ts`, `tmf-tools-retired.test.ts`, `ana-tmf-reads-project-scope.pglite.test.ts` |
| URS-ETMF-016 | AnA's document search searches the live filings of the studies of the projects the person can open. A declaration or a removed filing is never a hit. A failed read is named among the stores not searched, never shown as no result. | §11.10(d) | medium | `server/services/etmf/tmf-filing-search.ts` | `server/services/ana/__tests__/ana-tmf-reads-project-scope.pglite.test.ts` |
| URS-ETMF-017 | The report pack `etmf.completeness_pack` is computed as the person who runs it, per study, at project or account scope. Each figure is the store's own assessment of the study. It is refused with no identified person. | §11.10(d) | medium | `server/services/report-os/trial-master-file-pack.ts` | `server/services/report-os/__tests__/trial-master-file-pack.test.ts` |
| URS-ETMF-018 | There is one trial master file store. No code reads or writes a second one, and no route serves one. | none | high | `server/services/etmf/tmf-artifact-persistence.ts`, `server/bootstrap/register-inline-routes.ts` | `server/services/etmf/__tests__/etmf-second-store-retired.test.ts`, `server/routes/__tests__/etmf-one-store.routes.test.ts` |
| URS-ETMF-019 | The Vault's trial master file section shows: the verdict as one of four (complete, incomplete, not determined, no verdict); the figures; the records by zone, each with its state; and the package as a document. Upload-and-file asks for a reason. A failed read is shown as a failure, never as an empty trial master file. | §11.10(e) | high | `client/src/concept2cure/v2/surfaces/VaultTrialMasterFile.tsx`, `vaultTmf.ts`, `VaultTmfFiling.tsx`, `VaultTmfPackage.tsx` | `client/src/concept2cure/v2/__tests__/vaultTrialMasterFile.test.tsx`, `vaultTmfRestored.test.tsx`, `vaultTmfNotApplicable.test.tsx`, `vaultTmfUploadAndFile.test.tsx`, `vaultTmfModel.test.ts` |
| URS-ETMF-020 | The trial master file's API is served in production only once it is admitted: the Vault app's surfaces include `etmf`, and only for an organisation entitled to the professional-tier module. Until then the launch boundary refuses it. | none | high | `shared/constants/launch-scope.ts`, `shared/constants/ui-surface-registry.ui-v2.ts` (`etmf`) | The boundary's mechanism: `server/middleware/__tests__/launch-scope-api-gate.test.ts`. **No suite names `/api/etmf` under it**, so the OQ probes it. At admission, the held `vaultTrialMasterFile.inVault.test.tsx` (`docs/evidence/D2-ETMF/2026-11-10-vault-section/held/`) pins the section in the Vault |

## 3. Assumptions and constraints

- **A read-only (viewer) session cannot read the trial master file.** Every route requires the regulatory-author role
  (URS-ETMF-001). An inspector or auditor reading with no right to write is not provided. Whether one should be is the
  founder's decision, and it is recorded here so the OQ does not claim it.
- **Study-level only.** The reference model's country and site levels are not represented.
- **No timeliness or QC assessment.** No filing lag and no QC state is recorded for a record. The section says so
  instead of showing a figure.
- **A filing through AnA is not marked as such** on its audit row. The row records who filed it, why, and against
  which document, the same as a filing made in the Vault (eTMF E4 plan, R5).
- **Rows filed before 2026-11-10 name no study.** They are never served as a study's filing (URS-ETMF-002). A filing
  that takes the place of such a row records what the row held.
- **Tables of the retired second store** may exist on databases install-fresh built before 2026-11-12. Nothing reads
  or writes them (URS-ETMF-018).

## Approval

| Role | Name | Signature | Date |
|---|---|---|---|
| System owner (founder) | | *unsigned* | |
| Qualified validation contractor | | *unsigned* | |
