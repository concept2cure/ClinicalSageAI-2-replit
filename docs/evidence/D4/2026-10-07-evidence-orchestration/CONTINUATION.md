# Control-tower continuation receipt

Date: 2026-10-07. Base: `1995c72c1ca43311f3ea4fcf78c257921d61f182`.
Workstream W3/D4; canonical branch `concept2cure-v2`; direct push, no PR.
Contract: [ADOPTION-PLAN.md](ADOPTION-PLAN.md).

## Delivered change

Two bounded handoff fixes strengthen the existing client-data pipeline:

- Canonical upload metadata/byte access rejects raw tenant-prefix paths that
  resolve outside the permitted namespace. See [resolved-path evidence](RESOLVED-PATH-CONTAINMENT.md).
- Conversation-file adoption verifies actual bytes, then rechecks current
  identity and organization-wide availability under ordered transaction locks.
  Capture, canonical capture audit, and project adoption audit use the same
  client; duplicate lookup also uses that client. See [adoption evidence](ADOPTION-VERIFICATION.md).

Original files are retained. Extraction remains explicitly pending. No new
surface, integration, dependency, schema, parallel integrity engine, or
approval/export gate was introduced. Historical duplicate semantics remain.
Three focused workers implemented/reviewed disjoint scopes; control tower
owned SQL tests, existing founder fixture alignment, shared gates and publishing.

## Independent control-tower checks

The new actual-SQL adoption test demonstrated **2 failures / 6 passes** before
route implementation: changed and missing bytes incorrectly returned 201.
Final expanded SQL checks cover 14 cases, with actual eligibility queries and
rollback, plus explicit filesystem/source-persistence/audit-seal seams.
Ordered SQL path/hash mutations during byte reading exercise the fresh final
row check, not independent-connection concurrency.

The founder lineage fixture now resolves adoption against the same isolated
working directory that received its real upload bytes. No weaker assertion or
provider/agency fixture was introduced. Final focused run:
**29 passed / 2 files** (14 SQL adoption + 15 founder lineage), 27.38 seconds.
The existing agency wire is stubbed; this is not live agency acceptance.

The final integrated manifest below passed **974 tests / 52 files**, exit 0,
131.69 seconds. It includes all 40 prior intake, derivation, scientific-output,
writing, source-draft, export and disposition checks plus new adoption/path
regressions, existing project/auth/source-version controls, client adoption,
and the founder lineage path.

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
  --reporter=dot --silent
```

Additional final checks:

- `node scripts/build-server.mjs`: passed.
- `npm run --silent ci:canvas-path`: passed.
- Scoped ESLint for all eight changed/new code files: **0 errors**;
  **10 existing warnings**, five each in the pre-existing large Projects and
  evidence-spine files. New files/helpers add no warnings. No baseline,
  suppression or hook edits.
- `git diff --check`: passed.
- Independent read-only reviewer found no concrete blocker in lock ordering,
  transaction identity, audits, duplicate compatibility or safe refusals.

The actual pre-push prefix through the warning ratchet is run on the committed
publication range before the direct update. Full TypeScript/repository ESLint
runs on GitHub, as requested, rather than retrying the known local-memory
failure. [GITHUB-VALIDATION.md](GITHUB-VALIDATION.md) records the first five
improvements' exact-source zero-error checks and successful browser journey;
it is not substituted for the later adoption source's checks.

## What this does not establish

Mocked reader/unit tests and single-instance PGlite do not prove live RLS,
independent-connection withdrawal serialization, symlink safety, immutable
filesystem storage, deployment, scanner/provider qualification, or regional
regulatory acceptance. Byte identity is not scientific qualification.

The broader goal remains open: connector-to-canonical capture, scientific
purpose/column/unit/population/method qualification, raw clinical dataset
mapping, complete raw CMC analytical qualification, derived dependency
withdrawal behavior and region-specific human-reviewed release validation.
These gaps are not relabeled as complete by this continuation.
