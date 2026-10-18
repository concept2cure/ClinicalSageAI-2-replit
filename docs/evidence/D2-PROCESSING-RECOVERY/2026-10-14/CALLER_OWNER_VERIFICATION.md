# D2 entry caller verification

Approved scope is [CONTRACT.md](CONTRACT.md), including the capture-connection release addendum. Implementation uses the existing upload, source, capture/audit and spreadsheet-edit stores. There are no new dependencies, migrations, live provider/model calls, backlog repairs, branches or commits.

## Result and ownership

- [Chat upload](../../../../server/routes/chat/upload.ts#L61): new captures start pending. New and checksum-duplicate sources use the bound processor with the caller's program/workspace scope and the real extractor's `preExtracted` result. The new duplicate upload ID/path is never passed as a replacement original source binding. Top-level attachment `ready` remains compatible. `dataRoom` adds `readable` and `processing` separately from `recorded`.
- [Adoption](../../../../server/routes/c2c/projects.ts#L1563): preserves verified-byte admission and atomic source/paired-audit capture. Both new and duplicate responses expose `processed` and `processing`; duplicates do not create another capture or audit. An unexpected processing/import rejection after the capture boundary returns `retryable_failure`/`PROCESSING_UNAVAILABLE` while the receipt stands.
- [Spreadsheet save](../../../../server/services/ana/uploaded-file-access.ts#L358): `DerivedUploadResult.processing` is additive. Capture status, source ID and exact edit/parent/hash receipt remain separate from readability. Conversation-only edits do not enter CRE processing; authoring-image saves are unchanged. Scientific qualification remains unassessed and formula results remain not recalculated.
- Processing responses explicitly select only `{ok, processed, status, reasonCode?}`. They do not return `extracted` text or its raw private error. Core owns admission, original-upload verification, leases, token fencing and derived writes; these caller fixtures do not independently qualify those internals.
- Adoption and spreadsheet capture connections are released exactly once after an acknowledged COMMIT or duplicate ROLLBACK, before the processor opens its own connection. Pre-COMMIT and ambiguous-COMMIT errors retain rollback/release behavior; ambiguous spreadsheet commits retain derived bytes. This prevents holding the whole pool while every processor waits for a claim connection.

Follow-up outside this slice: [verifiedAdoptionUpload](../../../../server/routes/c2c/projects.ts#L1524) already holds its capture transaction client while invoking `loadUploadedFile`, whose [metadata read](../../../../server/services/ana/uploaded-file-access.ts#L243) uses global `pool.query`. At maximum simultaneous adoptions, that pre-existing pre-COMMIT path may also wait for unavailable connections. This was identified statically, without a saturation reproducer or new API contract. The approved connection-release change addresses **post-COMMIT processor starvation**; it does not claim to eliminate all pool-starvation paths. A bounded maximum-pool fixture and a separately reviewed canonical-reader executor/transaction strategy are follow-up work; this slice does not add a second byte-integrity engine or alter admission.

`projects.ts` was explicitly handed to the read-side owner after adoption edits, temporarily handed back for the approved release fix, then handed back again after that fix passed. Read-side import/projection edits are preserved. This caller owner did not edit core processing, AnA response wording, source DTO/status authority, CLI, Vault check-in, storage integrity or D7 files.

## Fail-first and focused runtime evidence

All commands use local locked dependencies and Node 22.23.3:

```sh
/home/agent/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin/node node_modules/vitest/vitest.mjs run <the suites listed below>
```

| Evidence | Observed result | Boundary exercised |
| --- | --- | --- |
| [Adoption red](caller-adoption-node22-red.txt) | 12 failed, 19 passed before caller implementation | Missing processing status, historical duplicate result, duplicate recovery, failed/rejected post-COMMIT processing |
| [Adoption initial green](caller-adoption-node22-green.txt) | 31 passed | Real Express adoption route, real canonical loader/source writer with controlled SQL/FS/audit and processing seams |
| [Upload/spreadsheet red](caller-upload-spreadsheet-node22-red.txt) | 24 failed, 25 passed before caller implementation | Premature extraction status, ignored processing failures, skipped duplicate recovery, lost committed edit on processor rejection |
| [Upload/spreadsheet initial green](caller-upload-spreadsheet-node22-green.txt) | 49 passed | Real multipart route and spreadsheet save orchestration, controlled scanner/FS/database/processing seams |
| [SQL caller green](caller-sql-node22-green.txt) | 28 passed | PGlite eligibility/lineage/capture/audit SQL and committed-row retention under rejected processing |
| [Pool release red](caller-pool-release-node22-red.txt) | 3 failed, 57 passed before release fix | Capture connection was released after processing rather than before it |
| [Pool release green](caller-pool-release-node22-green.txt) | 60 passed after release fix | Acknowledged boundary → exactly one release → processing ordering, including duplicate and lost COMMIT acknowledgement |
| [Caller/safety regression](caller-regressions-node22-green.txt) | 119 passed before the subsequent four release cases | Five caller suites plus upload scanner/format/storage/project refusal regressions |
| [Admission/tenant-loader regression](caller-admission-regressions-node22.txt) | 28 passed | Separate actual PGlite source admission and upload tenancy/namespace/integrity suites |
| [Final core-integrated regression](caller-final-regressions-node22.txt) | **151 passed across eight suites** | All six caller/safety and both admission/tenant-loader suites after the pool-release fix and assembled core API |

The six caller/safety suites are `server/routes/__tests__/chat-upload-durability.test.ts`, `server/routes/__tests__/chat-upload-safety.test.ts`, `server/routes/c2c/__tests__/projects-adoption.test.ts`, `server/routes/c2c/__tests__/projects-adoption-sql.test.ts`, `server/services/ana/__tests__/derived-spreadsheet-capture.test.ts`, and `server/services/ana/__tests__/derived-spreadsheet-sql.test.ts`. Admission suites are `server/services/ana/__tests__/source-context-admission.pglite.test.ts` and `server/services/ana/__tests__/uploaded-file-access-tenancy.test.ts`.

The original five caller suites had an independently observed baseline of 71 passed/1 failed. [Adoption SQL baseline](caller-adoption-sql-baseline.txt) reproduced its one failure alone at `source-context-admission.ts:182`, before derived processing. The disposition harness lacks unrelated real AnA organization/user/access facts for its conversation-edit fixture. That admission boundary is now an explicit **test-only** seam in adoption SQL; production admission was not bypassed. The separate real admission suite passes. Both SQL caller suites now mock processing explicitly, rather than silently assuming pending state because an incomplete processor schema throws.

An intermediate regression run [before read-side import integration](caller-regressions-before-read-integration.txt) recorded a temporary `summarizeDataRoomProcessing is not defined` window while the read owner added its projection. That owner fixed its missing import and the six suites then passed. It was not suppressed in caller code.

## Static checks and remaining integration

[Scoped ESLint](caller-eslint-node22.txt) exits 0 with eight warnings in pre-existing categories/functions. [HEAD baseline](caller-eslint-node22-baseline.txt) had nine warnings; the second deeply nested upload block was removed. No new spreadsheet complexity warning remains. `git diff --check` is clean for owned files.

[Caller scope configuration](tsconfig.caller-scope.json) includes the eight owned source/test files, canonical `server/auth.ts` and `server/middleware/tenantContext.ts` request augmentations, and existing ambient declarations. **[Final scoped TypeScript](caller-tsc-node22.txt) exits 0 with no diagnostics** against the assembled core API. The initial [pre-core-integration type run](caller-tsc-before-core-integration.txt) failed while the old core still lacked `SourceProcessingResult`, `expectedWorkspaceId`, and the additive result fields; its first configuration also omitted ambient declarations. A subsequent [pre-auth-augmentation run](caller-tsc-before-auth-augmentation.txt) had no core-API diagnostics, but selected the older standalone shared Express declaration without canonical authentication. The next [pre-tenant-augmentation run](caller-tsc-before-tenant-augmentation.txt) had only three missing `dbClient` diagnostics in its imported request-scope dependency. These check-configuration errors were resolved by including the repository's actual augmentations; application admission/types were not weakened.

Final runtime reproduction:

```sh
/home/agent/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin/node node_modules/vitest/vitest.mjs run server/routes/__tests__/chat-upload-durability.test.ts server/routes/__tests__/chat-upload-safety.test.ts server/routes/c2c/__tests__/projects-adoption.test.ts server/routes/c2c/__tests__/projects-adoption-sql.test.ts server/services/ana/__tests__/derived-spreadsheet-capture.test.ts server/services/ana/__tests__/derived-spreadsheet-sql.test.ts server/services/ana/__tests__/source-context-admission.pglite.test.ts server/services/ana/__tests__/uploaded-file-access-tenancy.test.ts
/home/agent/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin/node node_modules/typescript/bin/tsc -p docs/evidence/D2-PROCESSING-RECOVERY/2026-10-14/tsconfig.caller-scope.json
/home/agent/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin/node node_modules/eslint/bin/eslint.js server/routes/chat/upload.ts server/routes/c2c/projects.ts server/services/ana/uploaded-file-access.ts server/routes/__tests__/chat-upload-durability.test.ts server/routes/c2c/__tests__/projects-adoption.test.ts server/routes/c2c/__tests__/projects-adoption-sql.test.ts server/services/ana/__tests__/derived-spreadsheet-capture.test.ts server/services/ana/__tests__/derived-spreadsheet-sql.test.ts
```

Fixtures prove local route/service behavior and sequential SQL boundaries. They do not establish independent PostgreSQL connection locking, production pool saturation, tenant-role/RLS qualification, immutable storage, live OCR/vendor availability or staged release acceptance. No disposable native PostgreSQL endpoint or actual tenant repair was used by this caller owner.
