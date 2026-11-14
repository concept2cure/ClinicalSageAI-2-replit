# Current deviation reminders

F1 / W1 / D2, baseline `3692f44ad` on `concept2cure-v2`.

## What already exists

`server/routes/mdx-qms-deviations.ts` and `server/services/qms/deviations.ts` own native deviation updates and signed close/cancel. Scheduling runs after those acts. The canonical pure `deviationTaskPlan` in `server/services/qms/qms-record-tasks.ts` already maps classification to priority and lifecycle/date to a close reminder, but its due-only keep predicate misses same-date classification changes. The generic `qms_deviation` path in `server/services/tasking/source-task.ts` also lacks a current native read, allowing delayed earlier snapshots to undo later task scheduling.

The same writer already supplies serialized native Quality transactions, current actor/native admission, canonical internal-audit plan checks, preserved task work and atomic task lineage. The existing SQL audit task fixture and adjacent CAPA/training/general tests supply the verification pattern. `server/routes/taskBoard.routes.ts` already opens native deviation tasks in Quality. Full deleted-history searches found no replacement planner/writer; the removed `/api/qms` route is superseded by the current governed routes. The detailed pre-edit inventory is `.design/claude-convergence/F1-QUALITY-DEVIATION-TASKS-2026-11-14.md`.

## Verification contract

Extend the existing writer and pure plan; add no scheduler, task type, source API/table, approval policy or UI. Capture failing old-source SQL controls before production edits, then verify fresh native lifecycle/date/classification, exact source keys, current actor/tenant authority, task-state preservation, field/status CAS and rollback with lineage. Keep held native placement and the complete planner/producer file unchanged. Native classification governs deviation priority; other task work is preserved on same-date refresh. Audit text refresh must keep its current behavior. Record actual results below, without claiming live multi-connection, provider or hosted-Codespace execution from single-connection fixtures.

## Baseline regression

Before production edits, the combined deviation/audit SQL run reports **48 failures and 60 passing controls across 108 cases**. There are 54 deviation cases and 54 audit cases, including the additional concurrent manual-priority preservation control. The current audit-only behavior already passes. `deviation-task-red.txt.gz` and `baseline-red.json` retain this result against `3692f44ad`; `held-before.json` records the reserved native placement/planner hashes.

These cases include same-date upgrades/downgrades, priority-only drift, acting-editor/manual-work preservation, delayed terminal/date/classification plans, and a supported date-removal/re-addition replay. The three unfinished states have equivalent task plans. A forged closed/cancelled-status plan against an unfinished row is a defensive case, not a claimed native reopen workflow. The native legacy priority/assignee fields do not replace the existing planner's policy.

## Implemented behavior

The existing native Quality transaction now admits `qms_deviation` through the same current organization-record adapter used by internal audits. A fixed source-key map, current governed writer and tenant-owned row under `FOR SHARE` precede plan validation. The existing canonical planner owns classification, lifecycle, date, content and new-task assignee; untrusted matchers are replaced by its matcher. Organization records grant no project placement.

Same-date deviations refresh title/description/priority in place. The SQL compares tenant, source, exact native key, task identity, observed status and all written business fields before updating them, along with the existing modification stamps. The task's other business fields are untouched, including manual assignee, progress, due date, metadata, notes and approval state. Task lineage records actual old/new managed fields and explicitly unchanged status, with a generated summary and no fabricated human reason. The mutation and lineage roll back together on CAS loss or any write/audit failure. Native acts remain committed when post-act scheduling fails.

Internal audits retain a separate static text-only UPDATE: priority is neither written nor part of its CAS, so a concurrent manual priority edit survives. No producer/planner, native domain/signature, UI, schema or training policy changes are needed.

## Results

After repair, the focused SQL run passes **108/108 across two suites**. The final combined run passes **217/217 across ten suites**: 54 deviation cases, 54 audit cases and 109 adjacent/native-domain cases. It includes CAPA currentness/reassignment, periodic/training placement, generic reconciliation, existing planners and the native deviation lifecycle service. These runs overlap and are not added together. The exact suite list and frozen source hashes are in `unit-verification.json`; compressed logs retain the actual results.

Scoped ESLint over all three owned source/test files reports zero errors and warnings. Independent frozen-file review has no blocker and confirms all three hashes. The reserved `nativeTaskPlacement` body and whole `qms-record-tasks.ts` file match baseline bytes; `held-verification.json` states the extraction method and hashes. No warning/size baseline changed and no production file split was needed.

The native/actor/task/ledger state uses PGlite SQL, with focused task-service and task-audit adapter seams and recorded advisory-lock invocation. This proves these SQL admission/CAS/rollback contracts, not the complete production chained audit seal or concurrent multi-connection behavior. No historical production-task cleanup, provider request or hosted-Codespace execution is claimed. Compiler and publication results follow once available.
