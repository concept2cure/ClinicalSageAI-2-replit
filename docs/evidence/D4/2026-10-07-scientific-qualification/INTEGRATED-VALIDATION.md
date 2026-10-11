# Integrated scientific qualification verification

W3/D4; base source `cdc1308d97fa4564d799001f536fb423b9a5cc0e`.
Production and tests were frozen after independent review before this run.

## Exact integrated regression

**77 files / 1,896 tests passed**, exit 0, 210.89 seconds. The run began at
09:42:01 UTC (Vitest reported its runtime-local 05:42:01 EDT clock).
This is one combined run, not the sum of overlapping worker reruns. It preserves
the preceding 59-suite intake/catalog/derivation/analysis/writing/export manifest,
adds all 17 CMC qualification/shared-caller suites and the focused Biostat
freshness file. The original Biostat test file is unchanged.

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
  server/services/ana/__tests__/uploaded-file-path-containment.test.ts \
  server/routes/c2c/__tests__/projects-adoption.test.ts \
  server/routes/c2c/__tests__/projects-adoption-sql.test.ts \
  server/services/clinical-regulatory-evidence/__tests__/source-checksum-executor.test.ts \
  client/src/concept2cure/v2/__tests__/conversationFilesAdopt.test.tsx \
  server/routes/c2c/__tests__/projects-authorization.test.ts \
  server/routes/c2c/__tests__/projects-sources-window.test.ts \
  server/routes/c2c/__tests__/projects-create.test.ts \
  server/routes/c2c/__tests__/projects-list.test.ts \
  server/services/clinical-regulatory-evidence/__tests__/canonical-source-identity.pglite.integration.test.ts \
  server/services/clinical-regulatory-evidence/__tests__/source-versioning.pglite.integration.test.ts \
  tests/lineage/founder-path-lineage.pglite.test.ts \
  server/routes/__tests__/chat-upload-durability.test.ts \
  tests/routes/chat-upload-to-memory.test.ts \
  tests/routes/chat-upload-wiring.test.ts \
  tests/routes/chat-governed-upload.test.ts \
  tests/routes/chat-upload-source-identity.test.ts \
  tests/routes/concept2cure-governed-upload.test.ts \
  server/services/chat-uploads/__tests__/upload-retrieval-atom.test.ts \
  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts \
  server/services/cmc/__tests__/acceptance-criterion.test.ts \
  server/services/cmc/__tests__/shelf-life-two-sided.test.ts \
  server/services/cmc/__tests__/shelf-life.test.ts \
  server/services/cmc/__tests__/recorded-poolability-two-sided.test.ts \
  server/services/cmc/__tests__/shelf-life-poolability.test.ts \
  server/services/cmc/__tests__/recorded-stability-trending.test.ts \
  server/services/cmc/__tests__/stability-trending.test.ts \
  server/services/cmc/__tests__/stability-signal.test.ts \
  server/services/__tests__/module3Composer.stability-filed.test.ts \
  server/services/__tests__/module3Composer.stability-honesty.test.ts \
  server/services/__tests__/module3Composer.stability-trending.test.ts \
  server/services/ana/__tests__/deepening-tools.test.ts \
  server/services/cmc/__tests__/recorded-capability.test.ts \
  server/services/cmc/__tests__/process-capability.test.ts \
  server/services/__tests__/module3Composer.test.ts \
  server/services/__tests__/cmcWriteThroughMappers.test.ts \
  client/src/concept2cure/v2/__tests__/biostatWorkbenchFreshness.test.tsx \
  --reporter=dot --silent
```

## Additional completed checks

- Final server build after the criterion-guard correction: passed.
- Canvas/Authoring/Vault wiring gate: passed; no surface or route was added.
- Scoped ESLint over all seven changed/new code/test files: zero errors,
  30 existing warnings. Baseline counts are unchanged: Biostat 4, recorded
  stability 5, trending 2, composer 19; both new tests and the SQL fixture
  have zero warnings. No baseline or suppression changed.
- Audit fixture guard: passed, 21 fixtures against all 17 canonical writer
  columns. The actual SQL adoption suite is included in the combined run.
- Whitespace check: passed.
- Independent scientific and Biostat reviews: no remaining concrete blockers
  within the approved contracts, after the criterion reference/unit/range
  defects were reproduced and corrected.

The unchanged pre-commit and actual pre-push prefix through warning ratchet
remain publication gates. Whole-tree TypeScript is delegated to GitHub under
the existing authorization because the local compiler is known to exceed the
available memory. The prior source's zero-error TypeScript result is not
substituted for the new source. Exact-source GitHub status and publication
verification must be recorded separately when available.

Some isolated tests emit audit-store availability warnings from controlled
fixture stores. These are not live ledger, scanner/provider, staging, RLS,
independent-connection concurrency or intended-use qualification evidence.
The 56 inherited main-CI failures recorded in PRIOR-SOURCE-GITHUB.md are not
waived by this targeted regression, and launch row D4 remains open.

## Final integrated source after disposition and fixture follow-through

After the numeric test typing correction, CMC disposition implementation and
catalog fixture parity repair, the final deduplicated manifest passed:
**86 files / 1,954 tests**, exit 0, **212.39 seconds**. Start 10:10:39 UTC
(Vitest runtime-local 06:10:39 EDT). This is one combined run on the frozen
production and test changes, not the sum of worker counts. It includes all
77 initial suites plus the CMC disposition, canonical consumers, runtime-role
fixture, retained-citation, freeze, route and export/governed-action checks.

An initial broad attempt was stopped by automatic approval review because it
attempted external OpenAI traffic with an unverified payload. No result from
that attempt is counted. The completed run used the existing verification-only
[offline transport boundary](../../D2-D5/2026-10-06-document-dispositions/offline-verification.cjs)
to refuse external HTTP/fetch before dispatch while permitting local fixture
servers. Root verified external HTTPS/fetch refusal and local acceptance against
stub transports before running; the probe itself used no network. No production
configuration, provider, hook, baseline or suppression was changed. This run
does not qualify an AI provider.

```sh
NODE_OPTIONS='--require=./docs/evidence/D2-D5/2026-10-06-document-dispositions/offline-verification.cjs --max-old-space-size=4096' \
  ./node_modules/.bin/vitest run --config vitest.config.ts \
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
  server/services/ana/__tests__/uploaded-file-path-containment.test.ts \
  server/routes/c2c/__tests__/projects-adoption.test.ts \
  server/routes/c2c/__tests__/projects-adoption-sql.test.ts \
  server/services/clinical-regulatory-evidence/__tests__/source-checksum-executor.test.ts \
  client/src/concept2cure/v2/__tests__/conversationFilesAdopt.test.tsx \
  server/routes/c2c/__tests__/projects-authorization.test.ts \
  server/routes/c2c/__tests__/projects-sources-window.test.ts \
  server/routes/c2c/__tests__/projects-create.test.ts \
  server/routes/c2c/__tests__/projects-list.test.ts \
  server/services/clinical-regulatory-evidence/__tests__/canonical-source-identity.pglite.integration.test.ts \
  server/services/clinical-regulatory-evidence/__tests__/source-versioning.pglite.integration.test.ts \
  tests/lineage/founder-path-lineage.pglite.test.ts \
  server/routes/__tests__/chat-upload-durability.test.ts \
  tests/routes/chat-upload-to-memory.test.ts \
  tests/routes/chat-upload-wiring.test.ts \
  tests/routes/chat-governed-upload.test.ts \
  tests/routes/chat-upload-source-identity.test.ts \
  tests/routes/concept2cure-governed-upload.test.ts \
  server/services/chat-uploads/__tests__/upload-retrieval-atom.test.ts \
  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts \
  server/services/cmc/__tests__/acceptance-criterion.test.ts \
  server/services/cmc/__tests__/shelf-life-two-sided.test.ts \
  server/services/cmc/__tests__/shelf-life.test.ts \
  server/services/cmc/__tests__/recorded-poolability-two-sided.test.ts \
  server/services/cmc/__tests__/shelf-life-poolability.test.ts \
  server/services/cmc/__tests__/recorded-stability-trending.test.ts \
  server/services/cmc/__tests__/stability-trending.test.ts \
  server/services/cmc/__tests__/stability-signal.test.ts \
  server/services/__tests__/module3Composer.stability-filed.test.ts \
  server/services/__tests__/module3Composer.stability-honesty.test.ts \
  server/services/__tests__/module3Composer.stability-trending.test.ts \
  server/services/ana/__tests__/deepening-tools.test.ts \
  server/services/cmc/__tests__/recorded-capability.test.ts \
  server/services/cmc/__tests__/process-capability.test.ts \
  server/services/__tests__/module3Composer.test.ts \
  server/services/__tests__/cmcWriteThroughMappers.test.ts \
  client/src/concept2cure/v2/__tests__/biostatWorkbenchFreshness.test.tsx \
  server/services/document-data-disposition/__tests__/route-auth.test.ts \
  server/services/document-data-disposition/__tests__/artifact-freeze.pglite.integration.test.ts \
  server/services/document-data-disposition/__tests__/runtime-role.pglite.integration.test.ts \
  server/services/document-data-disposition/__tests__/citation-writes.pglite.integration.test.ts \
  server/services/document-data-disposition/__tests__/consumers.pglite.integration.test.ts \
  server/services/cmc/__tests__/source-evidence-disposition.pglite.integration.test.ts \
  server/services/cmc/__tests__/final-export-gate.test.ts \
  server/api/cmc/__tests__/module3Linkage.routes.test.ts \
  server/api/cmc/__tests__/module3GovernedActs.test.ts \
  --reporter=dot --silent
```

Final server build passed. Scoped ESLint on the disposition service, new actual
SQL test and shared catalog fixture has zero errors and zero warnings; the
earlier seven-file warning counts remain unchanged. The unchanged audit fixture
guard passes all 21 fixtures against the writer's 17 columns. Staged whitespace
checks pass. CMC disposition independent review has no blocking finding within
the approved contract; its separate 13-file regression also passed 108/108 after
the separately documented catalog fixture repair.

Full GitHub TypeScript for corrected source
`9dd81408d4775b8361a96bcf5e6002955db3722e` reports zero errors, baseline zero,
tsc exit 0 (C2C run `37604598878`, job `112736901380`); actual ESLint reports
zero errors and 6,258 warnings. That result predates the disposition production
change and is not substituted for its final-source check. Direct publication
uses the same committed blobs/tree as this frozen run, and final-source GitHub
checks must be inspected after publication.

The three inherited catalog consumer query errors now pass locally after
fixture parity correction; remaining main-CI failures, independent-connection
locking/RLS, staging and intended-use/human release qualification remain open.
D4 and regional filing readiness are not declared complete.
