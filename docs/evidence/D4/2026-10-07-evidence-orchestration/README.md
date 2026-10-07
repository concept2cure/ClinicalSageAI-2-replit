# Evidence-to-application control-tower receipt

Date: 2026-10-07. Base: `16bbf5b070ecfc186d7addaa1b6b96e384d6fe87`.
Canonical branch: `concept2cure-v2`; direct publication, no PR.
Launch validation workstream: D4. Contracts: [PLAN.md](PLAN.md).

## Implemented in this tranche

| Existing workflow | Concrete improvement | Detailed evidence |
| --- | --- | --- |
| Project/chat/Vault intake | Shared candidate formats; scientific text files become reachable; compatible Vault images; bounded, byte-checked admission and honest extraction retained | [Intake](INTAKE_CONSISTENCY.md) |
| Spreadsheet data management | Preserve leading-zero/long IDs, date-like labels and raw CSV field text; no implicit scientific type/unit mapping | [CSV fidelity](INTAKE_CONSISTENCY.md) |
| Confirmed spreadsheet edits | Original unchanged; durable parent/hash/edit audit; new copy captured in a valid open project; extraction/filing/qualification remain explicit | [Derivation](SPREADSHEET-DERIVATION.md) |
| Scientific output to Authoring | Complete displayed result tables, later-row columns, exact table numeric values, nulls, all rows and full provenance hash survive draft/export handoff | [Scientific output](SCIENTIFIC-OUTPUT-FIDELITY.md) |
| Anna medical-writing review | Actual heading evidence instead of narrative keyword passes; source/study/SAP/population/units/CMC/review questions; scientific completeness and approval explicitly unassessed | [Writing review](MEDICAL_WRITING_REVIEW.md) |

Three implementation agents and the control tower used disjoint scopes. One
worker additionally reviewed derivation governance and added existing-handler
integration checks. That review found and corrected the cross-program/
conversation-only withdrawal-lock gap before publication.

## Shared checks

The final integrated regression uses the following explicit manifest, covering
changed tests and existing intake, export, source-draft, disposition, current-
version search, writing and preparation contracts:

```sh
NODE_OPTIONS=--max-old-space-size=4096 npx vitest run --config vitest.config.ts \
  client/src/concept2cure/v2/__tests__/anaRailAttach.test.tsx \
  client/src/concept2cure/v2/__tests__/biostatWorkbench.test.tsx \
  client/src/concept2cure/v2/__tests__/documentIntakeFormats.test.ts \
  client/src/concept2cure/v2/__tests__/projectHomeDataRoom.test.tsx \
  client/src/concept2cure/v2/__tests__/pvCockpit.test.tsx \
  client/src/concept2cure/v2/__tests__/useVaultUpload.test.tsx \
  client/src/concept2cure/v2/__tests__/vaultSurface.test.tsx \
  server/export/__tests__/authoring-table-export.test.ts \
  server/middleware/__tests__/uploadSafety.test.ts \
  server/routes/__tests__/authoring-section-figure-refs.test.ts \
  server/routes/__tests__/authoringSignFreezeAndExportGate.test.ts \
  server/routes/__tests__/chat-upload-safety.test.ts \
  server/routes/__tests__/vault-ingest-refusal-status.test.ts \
  server/services/ana/__tests__/derived-spreadsheet-capture.test.ts \
  server/services/ana/__tests__/derived-spreadsheet-sql.test.ts \
  server/services/ana/__tests__/document-intake-tools.test.ts \
  server/services/ana/__tests__/document-search-core.test.ts \
  server/services/ana/__tests__/draft-project-sources.test.ts \
  server/services/ana/__tests__/drafting-source-lineage.pglite.integration.test.ts \
  server/services/ana/__tests__/edit-spreadsheet-provenance.test.ts \
  server/services/ana/__tests__/in-text-references.test.ts \
  server/services/ana/__tests__/medical-writing-qc.test.ts \
  server/services/ana/__tests__/medical-writing-review-tool.test.ts \
  server/services/ana/__tests__/medical-writing-review.test.ts \
  server/services/ana/__tests__/medical-writing.test.ts \
  server/services/ana/__tests__/uploaded-file-access-tenancy.test.ts \
  server/services/ana/__tests__/writing-gate-regulatory-register.test.ts \
  server/services/ana/__tests__/writing-gate-structure-status.test.ts \
  server/services/ana/__tests__/writing-precision-gate.test.ts \
  server/services/authoring/__tests__/draft-source-references.test.ts \
  server/services/document-data-disposition/__tests__/eligibility.pglite.integration.test.ts \
  server/services/document-data-disposition/__tests__/eligibility.test.ts \
  server/services/document-data-disposition/__tests__/program-lock.test.ts \
  server/services/document-data-disposition/__tests__/service.pglite.integration.test.ts \
  server/services/documentIntelligence/__tests__/spreadsheetService.test.ts \
  server/services/market-specs/__tests__/document-preparation.test.ts \
  server/services/ocr/__tests__/documentIntake.test.ts \
  server/services/vault/__tests__/catalog-search-current-version.pglite.integration.test.ts \
  server/utils/__tests__/fileSignature.test.ts \
  tests/concept2cure/engine-result-filing.test.ts \
  --reporter=dot --silent
```

Final integrated result: **799 passed / 40 files**, exit 0, 87.55 seconds.
This includes the final CSV fidelity and registered spreadsheet handler cases.
Worker receipts are not substituted for shared checks or exact-source GitHub
validation. Nine additional handler integration cases verify active-context
authority, actual source-buffer hash, normalized edits, XLSX naming, status/
audit references, no-project behavior, failures and confirmation. Their scoped
82-test run passed; persistence/workbook operations are explicit doubles.

Server build and canvas-path gate passed. Focused new canonical helpers passed
ESLint with zero warnings. Existing large-file warnings are not suppressed or
given a larger baseline. The actual pre-push prefix through warning ratcheting
must pass on the committed publication range. Full TypeScript and repository
ESLint execute on GitHub for the exact source commit, as requested; a prior
commit's green run is not evidence for these changes.

## Goal remains open — ordered next work

1. **Connector import convergence:** search/fetch adapters are not canonical
   capture. Explicitly selected, tenant-owned fetched evidence needs original
   bytes, scanner/policy, source hash and capture/file receipts through the
   existing intake path. Credentials and provider contracts cannot be invented.
2. **Purpose-qualified curation:** existing versions, fixity, review, annotations,
   governed facts, dispositions and scientific registers remain canonical.
   Scientific column mapping, units, populations, method/batch/condition
   identity, quality issues and accountable intended-use decisions still need
   an integrated contract before an analysis can claim eligibility.
3. **Clinical dataset bridge:** existing CDISC metadata/conformance and typed CSR
   tabulations remain; raw XPT/Define-XML loading and validated SDTM/ADaM-to-CSR
   lineage are not supplied by raw XML text extraction. Do not treat a present
   file flag or an uploaded JSON body as a validated study dataset.
4. **Derived-evidence change control:** new parent provenance does not automatically
   cascade every later withdrawal or scientific correction to all descendants.
   A governed dependency/eligibility contract and multi-session concurrency
   execution remain owed, using existing drift/disposition mechanisms.
5. **Scientific/CMC qualification and regional release:** retain existing CMC
   registers, source links, stability/capability/dissolution engines, Module 3
   composition, signed-source gates and placement. Raw analytical validation,
   expert scientific review, client commitments, language/template applicability
   and region-specific package qualification need evidence of their own. FDA,
   EU, Health Canada and PMDA acceptance is not asserted by these unit tests.

Generic inbound SFTP, watched folders/cloud drives, bulk archives, every
proprietary instrument/EDC/LIMS format, Japanese OCR and live provider/scanner/
multi-task storage qualification remain unestablished. Upstream systems may
retain large/proprietary data with governed references and validated exports;
the platform should not pretend to replace every upstream validated system.

This tranche improves the receive/manage/curate/analyze/write chain. It does
not mark the whole evidence-to-application goal, D4, or launch D1–D10 complete.
