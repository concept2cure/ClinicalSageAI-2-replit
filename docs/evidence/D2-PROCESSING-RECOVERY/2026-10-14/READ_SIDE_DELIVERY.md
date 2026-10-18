# D2 recovery: Data Room read-side delivery

14 October 2026. Canonical branch `concept2cure-v2`, baseline `87b27c897c5d1be20b0527009bcaf425ebbf3af6`. Implements the approved `CONTRACT.md` in the existing source API, Project Home, editor and Vault projection. No new schema, dependency, product module, provider call or live backlog repair.

## Behavior

- The paged source SELECT returns `textAvailable` from actual persisted nonblank text. It uses the core's canonical `persistedTextAvailableSql` so recovery, completion and the lean read agree on ECMAScript whitespace. An adapted read that did not load either the flag or text returns null, never an invented readable state.
- The existing source DTO adds a sanitized `processing` summary. A tiny server helper first calls the core's pure `parseProcessingStage`; malformed/future private stage metadata becomes unknown. The browser receives state, retryability, safe reason code, lease/retry timing and optional read-only lease expiry, rather than private identity/path/error metadata. This projection is not new processing admission or byte verification.
- Lease expiry is observed from the source SELECT's `clock_timestamp()` value. A valid expired claim without saved readable text displays Processing needs retry. The browser clock supplies no authority. Missing database observation time stays unknown and does not invent expiry.
- Project Home and the editor share status/grounding helpers. New pin, Ask AnA and citation choices require explicit available persisted text, currentness and data eligibility. Historical superseded sources remain visible and ineligible. Retained eligible current text remains usable when its original file is unavailable; Work on document keeps its separate original-availability rule.
- Existing source refresh actions reread status and issue only GET requests. They do not start repair. Same-source recovery restores readability without minting another capture, and an old failed/stale attempt label does not erase authoritative available text. Pending/extraction failure/retry-needed/blocked/unconfirmed states stay distinct. Vault uses its existing readState string; capture, classification, filing stages and counts remain separate.

`projects.ts` changes were sequenced by explicit handoffs with the caller owner; source import/projection edits and the caller's connection-release correction never ran concurrently. New shared constants/reason vocabulary are reused by core, and no browser module imports server pool or processing I/O.

## Red and existing controls

Existing read-side baseline: `read-side-existing-baseline.log`, six existing route/render/parser files, **45/45 passed**, exit 0. Exact baseline command is in `READ_SIDE_PROPOSAL.md`.

Fail-first command, exit 1, **13 failed / 28 passed**:

```sh
node node_modules/vitest/vitest.mjs run server/services/clinical-regulatory-evidence/__tests__/source-processing-read-model.test.ts server/routes/c2c/__tests__/projects-sources-processing.test.ts client/src/concept2cure/v2/__tests__/projectHomeDataRoom.test.tsx client/src/concept2cure/v2/editor/__tests__/editorSourceLibraries.test.tsx
```

`read-side-red.log` captures actual old adapter/route/render behavior: extracted labels with null/blank/unloaded text, dropped processing summaries, premature grounding and historical sources showing green Read. The original tests remain alongside those assertions. Readable mocks were subsequently completed with explicit persisted-text flags; no production admission was relaxed for fixture convenience.

Initial green: `read-side-green-initial.log`, **50/50**. Expanded focused green: `read-side-focused-green.log`, **88/88**. These intermediate results are preserved, not added together as independent coverage.

An expanded run is retained as `read-side-interim-expanded-regressions.log`: **1 failed / 103 passed**, exit 1. Its new actual-DB-clock fixture accidentally supplied a 16m39s claim interval; the hardened canonical parser correctly refused the stage against the approved 15-minute lease bound. The fixture was corrected to the real 15-minute lease. `read-side-interim-rooted-typescript.log` preserves the associated untyped PGlite row-spread diagnostic, corrected by supplying the actual query result shape. Neither interim failure is hidden or claimed a pass.

## Final regression result

Exact command:

```sh
node node_modules/vitest/vitest.mjs run server/services/clinical-regulatory-evidence/__tests__/source-processing-read-model.test.ts server/routes/c2c/__tests__/projects-sources-processing.test.ts server/routes/c2c/__tests__/projects-sources-window.test.ts server/routes/__tests__/vault-data-room-counts.test.ts client/src/concept2cure/v2/__tests__/vaultDataRoomCounts.test.tsx client/src/concept2cure/v2/__tests__/projectHomeDataRoom.test.tsx client/src/concept2cure/v2/editor/__tests__/editorSourceLibraries.test.tsx client/src/concept2cure/v2/editor/__tests__/sourceUiRules.test.tsx client/src/concept2cure/v2/editor/__tests__/projectSourceCatalog.test.tsx client/src/concept2cure/v2/editor/__tests__/workbenchCitationCatalog.test.tsx client/src/concept2cure/v2/editor/__tests__/citationAdmission.test.tsx client/src/concept2cure/v2/editor/__tests__/dataRoomSourceReads.test.tsx client/src/concept2cure/v2/editor/__tests__/vaultCitationConfirmation.test.tsx
```

`read-side-green-complete.log`: **104/104 passed**, 13 files, exit 0. Includes the actual SQL predicate and actual database clock output in in-memory PGlite; server DTO/Vault projection; Project Home/editor refresh and same-id recovery; null, Unicode whitespace and legacy unknown availability; malformed/future stage shape; retained data; superseded history; strict source paging/parser; neighboring complete-catalogue, citation admission and confirmation controls.

## Types and lint

The following target list was checked both by ESLint and by the lead's `owned-target-typecheck.cjs`:

```text
shared/data-room-processing-status.ts
server/services/clinical-regulatory-evidence/types.ts
server/services/clinical-regulatory-evidence/evidence-spine.service.ts
server/services/clinical-regulatory-evidence/data-room-search.ts
server/services/clinical-regulatory-evidence/data-room-processing-read.ts
server/routes/c2c/projects.ts
server/routes/c2c/project-vault.ts
client/src/concept2cure/v2/surfaces/ProjectHome.tsx
client/src/concept2cure/v2/editor/projectSourceCatalog.ts
client/src/concept2cure/v2/editor/DataRoomSourcesPanel.tsx
server/services/clinical-regulatory-evidence/__tests__/source-processing-read-model.test.ts
server/routes/c2c/__tests__/projects-sources-processing.test.ts
server/routes/__tests__/vault-data-room-counts.test.ts
client/src/concept2cure/v2/__tests__/projectHomeDataRoom.test.tsx
client/src/concept2cure/v2/editor/__tests__/editorSourceLibraries.test.tsx
client/src/concept2cure/v2/editor/__tests__/sourceUiRules.test.tsx
client/src/concept2cure/v2/editor/__tests__/projectSourceCatalog.test.tsx
client/src/concept2cure/v2/editor/__tests__/workbenchCitationCatalog.test.tsx
client/src/concept2cure/v2/editor/__tests__/citationAdmission.test.tsx
client/src/concept2cure/v2/editor/__tests__/dataRoomSourceReads.test.tsx
client/src/concept2cure/v2/editor/__tests__/vaultCitationConfirmation.test.tsx
```

Type command: `node --max-old-space-size=8192 docs/evidence/D2-PROCESSING-RECOVERY/2026-10-14/owned-target-typecheck.cjs` followed by these exact 21 paths. `read-side-rooted-typescript-complete.log`: exit 0, **zero selected-scope diagnostics**, 3,273 loaded imported/ambient sources. Repository compiler options and existing configured ambient declarations are retained; semantic diagnostics are requested for these selected targets. This is not a whole-repository or whole-imported-graph semantic pass. The earlier `read-side-rooted-typescript.log` is preliminary evidence using the previous checker.

Lint command: `node node_modules/eslint/bin/eslint.js` followed by the same 21 paths and `--format json`. Exit 0, **zero errors**, same **23 pre-existing warning instances**, no warnings in new shared/read helpers or focused fixtures. `read-side-lint-comparison.json` preserves actual sizes/complexities: existing DataRoom function 301→302 lines and 45→46 complexity; Project Home file1506→1507; several Vault reader sizes/complexities decrease. `projects.ts` size includes both caller-owner and read-projection edits. This is not a warning-free lint claim.

Scoped `git diff --check`: exit 0. Local runtime Node v24.19.0. Route/component tests mock their I/O; PGlite tests use an in-memory engine and selected SQL, not independent PostgreSQL sessions or production tenant roles. Logs may show mocked startup/audit/RLS-off diagnostics from the existing Vitest setup; these are not evidence of a real database connection or audit/RLS qualification.

## Limits

This proves truthful local source-status projection and persisted-text eligibility. It does not run a customer repair, activate a scheduler, validate scientific facts, establish full extraction/content quality, prove production multi-instance races or tenant-role/RLS enforcement, or close D2 launch/staging acceptance. Core processor, caller, CLI, AnA reply and independent-review evidence remain separate owners' results.
