# Published canonical task and authoring integration

Source `3450b68b595255a6545bc7fc8863d30e5e5e9bfc` integrates canonical `14d8c9efe8df9b545e72ebfba446473040cb9b0e` and is published directly on `concept2cure-v2`. The [publication receipt](publication.json) records verified remote ancestry and the completed normal push. All incoming work is preserved.

Client production and shared bytes are unchanged from `ec57b5519f8765096f79d437ffcdaeff40a016b4`, where the target and browser checks ran. The client diff contains only six fixture test files; their seven-file replay executes at `c24db62ac5dce1b5007d1cbc67981dd5a462b757` and also includes the unchanged conversation-refusal file. The final merge separately preserves the seven-path selected-source cancellation server overlay.

## What already exists

- `client/src/concept2cure/v2/TaskTray.tsx` and `surfaces/TaskBoard.tsx` already provide the drawer, every-store board and native task detail. This work finishes the exact readable task handoff with the existing business ID and current account scope.
- `navParams.ts` already owns the shared leave registry. `editor/DocumentWorkbench.tsx` and `editor/useAuthoringAssemblyBuild.ts` already own active editor/assembly state. This work connects their retained pending/unconfirmed outcomes to navigation refusal and exact saved-record recovery; it adds no parallel state store or writer.
- `editor/savedAssemblySourcesController.ts` and its transport already expose explicit historical source checks and reuse. This work composes them with current-owner admission and captured request headers. Refused or stale reads cannot become a different source selection; source changes are explicitly retried after recovery.
- `server/routes/authoring-assembly.ts`, `server/services/authoring/authoring-assembly.ts`, the Vault provider and `data-room-processing-sweep.ts` already supply the writer, content reads and processing sweep. Existing transaction/audit/source controls remain in place; earlier provider integrity and PG15 completion evidence retains its original anchors.

## Completed qualification

| Execution | Result | Source boundary |
| --- | --- | --- |
| Initial authoring/canvas cohort | 348 passed, 21 failed, 40 default files | `ec57b5519`; original red execution [retained](fixtures/fixture-summary.json) |
| Corrected fixture subset | 45 passed, seven default files | Actual `c24db62ac` execution; separate [green replay](fixtures/fixture-summary.json) |
| Unaffected wholly green files | 324 passed in 33 files within the initial cohort | `ec57b5519`; all 33 files remain byte-identical, not replayed; [verification](fixtures/fixture-summary.json) |
| Exact task, analytics scope, source entry/project files, actual Workbench controls | 121 passed, 5 default files | Actual `ec57b5519` execution; client/shared production unchanged in final source; [receipts](targets/targets-summary.json) |
| Chromium structural408/recovery | One scenario, five stages passed; 1,980 measured pins | Actual `ec57b5519` execution; client/shared production unchanged; actual Workbench/RTE with synthetic HTTP/account; [receipts](browser/browser-summary.json) |
| Selected-source cancellation server overlay | 53 passed, four default files | Actual final `3450b68b5` execution; [receipts](server-cancellation/backend-summary.json) |

The initial 40-file execution is preserved as red. Its six failed files contain 41 cases (20 initially passed and 21 failed). The other 34 files originally contained 328 passing cases, including four termination-fixture cases. The initial full compiler correctly refused that fixture's missing captured headers with TS2741. Five fixtures receive exact existing Save/Check locators and the termination fixture receives `owner.headers()`; production was untouched by that correction and assertions/timeouts remain intact. The unchanged conversation-refusal file is replayed without compiler contention. The separate seven-file execution passes 45 cases, while 33 unmodified files retain 324 passing cases from the initial execution. These are not described as one new all-green 40-file run, and the 348 initial passes are not added to the corrected 45. The [initial compiler refusal](gates/task-handoff-canonical-20261020-push.log.gz) remains distinct from the final successful normal compiler. Target/browser pin manifests stay bound to their actual execution source and are not restamped as final-commit manifests. The later server overlay has its own execution and does not turn the earlier synthetic browser run into backend authorization/persistence proof.

The earlier saved-source91/4 and host61/5 executions are retained at `4c0c791c4`; backend42/2 and the earlier browser remain at `aa4dd090f`. The91-case packet discloses its missing immediate after-snapshot and the matching late Oct20 recovery comparison. Earlier717 UI,226 backend,311 native and affected19/61 native records remain separately anchored. These are not added together or relabeled as a new full-suite execution.

Production build passed, including the audit-chain verifier build; client and server artifacts both embed `3450b68b595255a6545bc7fc8863d30e5e5e9bfc`. Fresh shipped CSS covers 16,605 literal uses across 30 chunks with zero missing rules. The normal push gates passed, including full-project TypeScript zero errors/exit0/unchanged zero baseline and warning ratchet net-1. The supported12GB heap cap fits the16GB workspace; no gate or baseline was weakened.

Human witnessing remains **unexecuted**. Run the [existing human beta checklist](../../../../../testing/HUMAN_BETA_CHECKLIST_V1.md) using actual memberships and UI-created records. Automated/synthetic checks do not establish live-provider behavior, hosted CI success or regulated-use qualification.

## Expanded secret scan

The scanner covered904 files and54,713,163 expanded bytes, including every archived gzip payload. All250 raw findings were independently verified source SHA256 digests or Git blob identifiers; credential findings after review are zero. Scanner configuration and allowlists were unchanged. The [scan summary](secret-scan-summary.json) and raw redacted report retain the nonzero raw scanner result and exact input snapshot. Scanner outputs and subsequently refreshed integrity metadata are recorded separately.
