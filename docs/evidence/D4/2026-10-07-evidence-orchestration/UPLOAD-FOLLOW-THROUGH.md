# Control-tower upload follow-through

Date: 2026-10-07. Workstream W3/D4, existing intake/Data Room pipeline.
Parent at publication preparation: `142d6a50d327c5ce674f23e7456d0a075e0c074a`:
report-only repo-health descendant of adopted source `0d15907bb`.
The two report updates were inspected and fast-forwarded without losing them.
Only `concept2cure-v2`; direct publication, no PR.

## Change and independent review

The canonical upload now refuses a directory/write failure with safe
`503 UPLOAD_STORAGE_FAILED` before metadata, extraction, artifact/source,
provenance or retrieval work. The real multipart/router regression observed
six false-success cases before implementation, then eleven passing controls.
See [worker evidence](UPLOAD-DURABILITY.md) and [approved contract](UPLOAD-DURABILITY-PLAN.md).
An independent read-only reviewer found no concrete blocker; scanner/project
checks, paths, write arguments and success behavior are unchanged.

No originals were deleted or altered. No partial-file cleanup, fsync/crash
qualification, filesystem/DB atomicity or connector-import capability is claimed.

## Integrated verification

Expanded runtime regression: **1029 passed / 59 files**, exit 0, 161.19 seconds.
The explicit manifest preserves the prior 52-suite adoption/source/intake/
writing/analysis/export/lineage checks and adds canonical upload safety,
metadata/source identity, governed upload and retrieval-prefix controls.

```sh
NODE_OPTIONS=--max-old-space-size=4096 npx vitest run --config vitest.config.ts \\
  client/src/concept2cure/v2/__tests__/anaRailAttach.test.tsx \\
  client/src/concept2cure/v2/__tests__/biostatWorkbench.test.tsx \\
  client/src/concept2cure/v2/__tests__/documentIntakeFormats.test.ts \\
  client/src/concept2cure/v2/__tests__/projectHomeDataRoom.test.tsx \\
  client/src/concept2cure/v2/__tests__/pvCockpit.test.tsx \\
  client/src/concept2cure/v2/__tests__/useVaultUpload.test.tsx \\
  client/src/concept2cure/v2/__tests__/vaultSurface.test.tsx \\
  server/export/__tests__/authoring-table-export.test.ts \\
  server/middleware/__tests__/uploadSafety.test.ts \\
  server/routes/__tests__/authoring-section-figure-refs.test.ts \\
  server/routes/__tests__/authoringSignFreezeAndExportGate.test.ts \\
  server/routes/__tests__/chat-upload-safety.test.ts \\
  server/routes/__tests__/vault-ingest-refusal-status.test.ts \\
  server/services/ana/__tests__/derived-spreadsheet-capture.test.ts \\
  server/services/ana/__tests__/derived-spreadsheet-sql.test.ts \\
  server/services/ana/__tests__/document-intake-tools.test.ts \\
  server/services/ana/__tests__/document-search-core.test.ts \\
  server/services/ana/__tests__/draft-project-sources.test.ts \\
  server/services/ana/__tests__/drafting-source-lineage.pglite.integration.test.ts \\
  server/services/ana/__tests__/edit-spreadsheet-provenance.test.ts \\
  server/services/ana/__tests__/in-text-references.test.ts \\
  server/services/ana/__tests__/medical-writing-qc.test.ts \\
  server/services/ana/__tests__/medical-writing-review-tool.test.ts \\
  server/services/ana/__tests__/medical-writing-review.test.ts \\
  server/services/ana/__tests__/medical-writing.test.ts \\
  server/services/ana/__tests__/uploaded-file-access-tenancy.test.ts \\
  server/services/ana/__tests__/writing-gate-regulatory-register.test.ts \\
  server/services/ana/__tests__/writing-gate-structure-status.test.ts \\
  server/services/ana/__tests__/writing-precision-gate.test.ts \\
  server/services/authoring/__tests__/draft-source-references.test.ts \\
  server/services/document-data-disposition/__tests__/eligibility.pglite.integration.test.ts \\
  server/services/document-data-disposition/__tests__/eligibility.test.ts \\
  server/services/document-data-disposition/__tests__/program-lock.test.ts \\
  server/services/document-data-disposition/__tests__/service.pglite.integration.test.ts \\
  server/services/documentIntelligence/__tests__/spreadsheetService.test.ts \\
  server/services/market-specs/__tests__/document-preparation.test.ts \\
  server/services/ocr/__tests__/documentIntake.test.ts \\
  server/services/vault/__tests__/catalog-search-current-version.pglite.integration.test.ts \\
  server/utils/__tests__/fileSignature.test.ts \\
  tests/concept2cure/engine-result-filing.test.ts \\
  server/services/ana/__tests__/uploaded-file-path-containment.test.ts \\
  server/routes/c2c/__tests__/projects-adoption.test.ts \\
  server/routes/c2c/__tests__/projects-adoption-sql.test.ts \\
  server/services/clinical-regulatory-evidence/__tests__/source-checksum-executor.test.ts \\
  client/src/concept2cure/v2/__tests__/conversationFilesAdopt.test.tsx \\
  server/routes/c2c/__tests__/projects-authorization.test.ts \\
  server/routes/c2c/__tests__/projects-sources-window.test.ts \\
  server/routes/c2c/__tests__/projects-create.test.ts \\
  server/routes/c2c/__tests__/projects-list.test.ts \\
  server/services/clinical-regulatory-evidence/__tests__/canonical-source-identity.pglite.integration.test.ts \\
  server/services/clinical-regulatory-evidence/__tests__/source-versioning.pglite.integration.test.ts \\
  tests/lineage/founder-path-lineage.pglite.test.ts \\
  server/routes/__tests__/chat-upload-durability.test.ts \\
  tests/routes/chat-upload-to-memory.test.ts \\
  tests/routes/chat-upload-wiring.test.ts \\
  tests/routes/chat-governed-upload.test.ts \\
  tests/routes/chat-upload-source-identity.test.ts \\
  tests/routes/concept2cure-governed-upload.test.ts \\
  server/services/chat-uploads/__tests__/upload-retrieval-atom.test.ts \\
  --reporter=dot --silent
```

During that run, GitHub's adoption-source TypeScript check reported one
new-test annotation error (not a passed check): the test body was `unknown`
although Supertest accepts `object|string`. The parameter was narrowed to
`object`, matching all test payloads; no runtime behavior/assertions changed.
Both affected suites were rerun after correction: **32 passed / 2 files**,
18.60 seconds. Exact-source failure evidence: [GITHUB-VALIDATION.md](GITHUB-VALIDATION.md).
No baseline, cast or suppression was added. Final-source TypeScript and full
ESLint must be checked on GitHub; the earlier source's checks are not reused.

Additional checks:

- Server build: passed.
- Canvas/Authoring/Vault wiring gate: passed.
- Final scoped ESLint: zero errors. The upload file retains four existing
  warnings (complexity decreases 78→76); both changed/new tests add no warnings.
- Diff whitespace check: passed.
- The committed range is checked through the actual pre-push prefix and
  warning ratchet before direct publication. No hook/baseline changes.

Some isolated tests emit expected audit-store availability warnings from
mocked fixture stores. They are not production ledger or provider
qualification evidence. This follow-through does not change their audit seams.

## Goal state

Intake/storage identity, Data Room capture and scientific/writing handoffs
are improved, not declared fully qualified. [NEXT-QUALIFICATION.md](NEXT-QUALIFICATION.md)
records confirmed CMC numeric interpretation, late-withdrawn-evidence linking
and stale calculator-result boundaries, plus the missing unified scientific
qualification and connector-admission bridges. None of those findings is
relabeled fixed. Regional human-reviewed release/agency validation remains open.
