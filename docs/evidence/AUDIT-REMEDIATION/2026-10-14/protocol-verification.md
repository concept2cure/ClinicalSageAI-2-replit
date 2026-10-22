# Protocol audit remedies — verification, 2026-10-14

F09 and F11 are implemented in the existing launch Protocol workspace. No production dependency, commit, push or deployment was made.

## Result

* `ProtocolDevSelection.tsx` reads the complete lightweight protocol index and fetches the selected document by stable id. Program and explicit unfiled/all-organization scopes are separate. A record refresh cannot change the selection merely because sorting changed; initial reads cannot unmount a newly opened create drawer.
* New Protocol UI and API creation require a regulatory-program UUID. `createProtocolDocumentTx` remains the canonical seeded document writer and validates current persisted active lead/manager authority when a UUID is supplied. Its optional service input retains explicitly unfiled historical callers; the new API edge cannot create an unfiled record.
* `protocol_documents.program_id` is additive and nullable. `20261014_protocol_program_scope.sql` replays safely, preserves historical NULLs, and installs a same-organization foreign key. The explicit legacy filing action is audited on the request connection, refuses final/superseded documents and program moves, and requires an incompatible design link to be removed first.
* `ProtocolDevCreateDesign.tsx` collects user-entered core design data and calls the existing governed study-design persist route, then the existing bind route. It does not invent statistical assumptions, estimands, sample size or approval. The real design gates report missing inputs. A saved-but-unbound receipt offers link-only retry; an unknown save outcome offers a close/check-persisted-picker action instead of blind duplicate creation.
* Both the persist route and protocol create/bind/file services use the current persisted actor and the canonical program mutation policy. Foreign organizations, other-program and unfiled design bindings, inactive/non-lead membership and signed document edits are refused.

## Evidence

Final Node 22.23.3 / locked Vitest run: **14 suites, 149 tests passed** (`/workspace/audit/protocol-regression-final.log`, 03:04:48 UTC). Coverage includes the new UI workflow, real SQL ownership/program filtering, 32 documents including one outside the previous 25-record cap, migration replay, real canonical seed writer, denied authority, governed route actor/audit atomicity, study-design persist contract and existing protocol register/tab/AnA behavior.

Two deliberately recreated defects failed and were restored immediately:

* Remove the Create a study design action: first-design user workflow fails (`protocol-red-first-design.log`).
* Restore a 25-row limit on the actual index SQL: real 32-document index test receives 25 and fails (`protocol-red-index-cap.log`).

All touched production files have zero lint errors; every new production file has zero warnings. The only remaining warning is the pre-existing long normalized-store assembler function, now shorter after moving identity reads to `pdev-protocol-index.ts` (`protocol-lint-final.json`).

The initial broad typecheck exposed two local type errors (optional UUID narrowing and an untyped PGlite row), which are corrected. Root's subsequent integrated typecheck cleared all Protocol files; root owns final repository qualification. An earlier low-heap full typecheck hit the repository's documented heap limit, and a redundant later full run was stopped/ended while root handled qualification. Those runs are not claimed as a whole-repository typecheck pass.

Runtime limit: verification uses real in-process PostgreSQL-compatible SQL and component/API integration doubles. Applying the ordered migration and exercising an authenticated production database/browser remains a deployment qualification step. No automatic legacy association or status/signature change is inferred.

### Notification and source-scope follow-up

Explicit unfiled notification links (`protocolScope=unfiled`) restore their exact protocol id even when another program is open. Mounted surfaces consume the protocol navigation event, preserve the supplied id, and show unavailable instead of falling back to the first protocol. Newly program-filed protocol sources now retain their own scope in Authoring imports even before a study design exists; a disagreeing bound design refuses the copy. These cases passed in the final D02/D03 integrated scoped run (14 suites / 228 tests), alongside the existing protocol authority/binding suite.
