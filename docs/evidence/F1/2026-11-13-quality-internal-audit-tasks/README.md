# Current internal-audit tasks

F1, baseline `55ce8003b` on canonical `concept2cure-v2`, begun 2026-11-13.

## What already exists

The native audit PATCH in `server/routes/mdx-qms-records.ts` commits before best-effort task scheduling. The pure planner in `server/services/qms/qms-record-tasks.ts` records a dated planned audit as a start task; current in-progress/closed/cancelled states end that task. At the baseline, its existing `qms_internal_audit` source reaches generic task reconciliation without a fresh native read/lock/transaction. A delayed earlier planned snapshot can therefore recreate work after a newer update has completed it.

The writer in `server/services/tasking/source-task.ts` already provides serialized transactional reconciliation, actor/source admission, source-linked unified tasks and task audit rollback for other native Quality records. Extend it for this existing audit source and reuse its canonical pure planner. Its `__tests__/source-task-quality-sql.pglite.test.ts` harness covers native ownership and stale CAPA plans; planner-only tests mock the writer and miss the audit interleaving. Search included routes, planners, task writers/readers/tests and full deleted history; no replacement was found. Detailed pre-edit inventory and boundaries: `.design/claude-convergence/F1-QUALITY-INTERNAL-AUDIT-TASKS-2026-11-13.md`.

## Verification contract

Capture actual old-source failures before repair, then current lifecycle/date/assignee and valid scheduling/closure controls, tenant/actor/privacy refusals, status-CAS loss and transactional rollback. Keep organization scope and existing native destinations. Held placement, training, producer policy and UI code are unchanged. Record actual results below; no live model, hosted Codespaces or existing production-data cleanup is claimed by fixture tests.

## Implemented behavior

Internal-audit reminders now use the existing native Quality transaction. The exact audit key, current writer, tenant-owned row and canonical plan are verified under locks before any task write. The existing pure planner remains the authority for lifecycle/date/lead/text; stale desired or closure snapshots are refused. The canonical plan replaces caller-supplied matching callbacks. Audit records grant no project placement.

The existing open-task query includes title and description. A same-date audit-number/scope change refreshes that text in place, preserving task identity, status, progress, manual assignee, due date and other business fields. Its compare-and-set checks the observed status and old text as well as tenant/source/task identity. The update advances the existing modification stamps and records the actual old/new text with explicitly unchanged status through the existing task audit command. A person-stated reason is not fabricated. A repeated current plan makes no additional write or audit event. Date/lifecycle replacement behavior stays with the existing planner.

Task writes and their audit events roll back together on a lost compare-and-set, write or audit failure. The native audit update remains committed when best-effort reminder scheduling fails.

## Results

- Before production edits, the initial SQL regression has 42 failed cases and four passing controls. The first candidate passes all 46, with 150 passing cases across eight suites. Independent review then identifies that close/replacement on a same-date text edit loses a manual assignment and progress; that candidate is superseded.
- The additional text-refresh regression first reports eight failures and 44 passing controls. It includes manual-assignee/in-progress/40-percent-progress number and scope edits, old-text/status compare-and-set loss and audit rollback. After the in-place repair, that focused run passes 52/52. The final combined run passes **157/157 across eight suites**, including **53 audit cases**, after adding a nullable-old-description control and repeat-current-plan assertions. Initial and final overlapping counts are not added together.
- Actual native, task and task-audit fixture SQL runs on PGlite. The current-actor adapter runs its canonical membership SQL; the task-service/audit adapters are focused SQL-backed seams. This tests transaction/rollback behavior, not the complete production audit-chain seal or concurrent multi-connection database execution.
- Scoped ESLint reports zero errors and warnings. Mechanical same-file predicate extraction removed the initial complexity warnings; no warning baseline changed.
- The held `nativeTaskPlacement` body and whole `qms-record-tasks.ts` planner/producer file match their pre-edit hashes. The one obsolete generic-audit assertion is moved to the existing generic supplier source; its non-audit behavior stays covered.

Initial and superseding red/green/adjacent logs, slim lint output and final source/held hashes are retained here. Current lead checks do not claim that the ordinary audit PATCH supports lead reassignment. Existing supplier/deviation and periodic-review policies are not changed by this audit-only repair. Compiler/publication results are recorded separately when available.

The final combined run uses Vitest with `vitest.config.ts` over `source-task-internal-audit.pglite`, `source-task-quality-sql.pglite`, `source-task-capa-reassignment.pglite`, `source-task-training-project`, `source-task-quality-project`, `source-task`, `capa-tasks` and `qms-record-tasks` tests. The source and test hashes in `source-hashes.json` identify the frozen candidate; `initial-source-hashes.json` retains the superseded candidate. `held-verification.json` records the exact baseline/current comparison and extraction method.
