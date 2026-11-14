# A critical statistical finding's escalation reaches the task board (F1)

**Date:** 2026-11-12 (walk), 2026-11-13 (filed)
**Package:** F1 · **Completes:** `server/services/ana-biostats/workflow-integrator.ts`
**Launch row moved:** D-row evidence for Biostatistics tasking (GA map: the lane's tasking rows; the
escalation path had no working write at all).

## The defect

When AnA's statistical review returns `actionRecommendation: 'escalate'` (critical or high risk), the
workflow integrator is meant to raise a task for the lead biostatistician. On trunk (`6ae4f50429`) it
could not, for three compounding reasons:

1. `createEscalationTask` inserted into `concept2cure_review_tasks`, the review workflow's own store,
   naming none of that table's four required columns (`task_id`, `org_id`, `project_id`,
   `created_by_name`) and three it does not have (`organizationId`, `priority`, `metadata`). The insert
   could not succeed on any database. Every escalation answered "Escalation task creation failed" and
   reached nobody.
2. Step 5 was gated on the artifact having been stored, so when the artifact store failed, a critical
   finding was not even attempted.
3. Each failure answer carried the store's own error text: a `Failed query: insert into …` statement
   with its parameter values, about 4,000 characters, in the user-facing message.

`prepareEditorHandoff` also returned `editorUrl: '/concept2cure/editor?artifactId=…'`. No such route
exists, and nothing reads `editorUrl`.

## What already exists (RULE 3)

| Path | What it does today | What it did not do |
|---|---|---|
| `server/services/ana-biostats/workflow-integrator.ts` | Layer 7 of AnA Biostats: stores the document, opens a review thread, attaches to a dossier section, raises the escalation | Its escalation write could never succeed (above) |
| `server/services/biostatistics-bridge/task-blueprint.ts` | Defines the canonical escalation shape: the `action:escalate` blueprint, a Biostatistics review task on `unified_tasks` | Not used by the integrator |
| `server/services/unifiedTaskService.ts` (`createUnifiedTask(input, tx)`) | The one task board's creator; accepts a transaction runner | Not used by the integrator |
| `server/services/tasking/task-audit.ts` (`auditTaskActionInTx`) | Writes the `task.create` ledger row inside the caller's transaction; throws `TaskAuditNotRecordedError` when it cannot | Not used by the integrator |
| `server/routes/c2c/reviews.ts` + `concept2cure_review_tasks` | The review workflow's own task store | Not the task board. This change does not write to it |
| `server/services/biostatistics-bridge/__tests__/bridge-tasks-ledger.pglite.integration.test.ts` | PGlite harness for bridge tasks and their ledger rows | The model for the new test |

Searches run: `createEscalationTask`, `create_follow_up_task`, `concept2cure_review_tasks`,
`action:escalate`, `editorUrl`, `/concept2cure/editor` across `server/`, `client/`, `shared/` and
`migrations/`; `git log --all --diff-filter=D -- '**/workflow-integrator*'` (nothing deleted).

This is a convergence onto what exists, not a new capability: no table, route file, mount, screen or
AnA tool is added.

## The change

- `createEscalationTask` now raises the bridge's `action:escalate` task on `unified_tasks` through
  `unifiedTaskService.createUnifiedTask`, with its `task.create` row from `auditTaskActionInTx`, in
  one transaction: the task and its ledger row, or neither.
- The task is keyed to its source: the stored artifact (`statistical_artifact`, its id) when there is
  one, otherwise the document's content hash (`statistical_document`). A second run for the same
  source answers with the task already on the board, so there is one escalation per document.
- Step 5 is no longer gated on the artifact: a critical finding is raised even when the document could
  not be stored. In that case the task description says so.
- Priority follows risk (critical → `critical`, high → `high`). A document on no project (the
  orchestrator passes 0) is filed on none.
- Failure answers say what did not happen and keep the store's words in the log:
  - "The document was not stored: the artifact store could not be written. "<title>" exists only in this answer."
  - "No review thread was opened: the review store could not be written."
  - "The document was not attached to dossier section N: the mapping could not be written."
  - "No escalation task was raised: the task board could not be written. … risk on "<title>" is unrecorded."
    (or "its record could not be written, so the task was not written either." when the ledger refuses).
- `prepareEditorHandoff`: with no stored artifact it reports `success: false` ("was not stored, so
  there is nothing to open"). With one, it points at `/concept2cure/biostatistics`, where the
  project's statistical documents are listed and can be saved as a working document.
- The task row's construction is the module function `escalationTaskInput`, typed as
  `UnifiedTaskInput`, which keeps the method within the lint ceiling.

## Verified by making the check fail

`server/services/ana-biostats/__tests__/escalation-reaches-the-task-board.pglite.integration.test.ts`
(19 cases). It runs on PGlite with the real `unified_tasks` DDL, the audit and governed-action ledger
DDL, and the phase-13 `concept2cure_review_tasks` DDL (foreign keys stripped).

- **Red on trunk** (`red.txt`): 16 fail, 3 pass. The 3 that pass are the ones that hold on trunk too:
  the old insert cannot succeed on the review table's DDL; nothing is written to the review store; a
  document naming no creator raises nothing.
- **Green** (`green.txt`): 27 pass, run together with the two existing integrator suites
  (`workflow-integrator-no-db-fails-closed.test.ts`, `workflow-integrator-dossier-attach.test.ts`).
  Re-run on 2026-11-13 after the helper was extracted: 27 pass, ESLint 0 warnings on the file
  (trunk: 0).
- Neighbouring suites (`server/services/ana-biostats`, `biostatistics-bridge`, `tasking`), re-run 2026-11-13: 38 files, 485 pass.

## Opened in the running app and used (RULE 4)

Run against the dev server (`npm run dev`, org 2, dev login), through
`POST /api/ana-biostats/document` with a design the judgment engine escalates:

- **First run** (`workflow-out-1.json` in the session scratchpad):
  `create_follow_up_task | success | Escalation raised on the task board: Escalate "Sample Size Rationale (Pharma / biotech)" to the lead biostatistician (8798261b-…)`.
- **Second run, same document:** `Escalation already on the task board: … (8798261b-…)`. One task, one
  `task.create` ledger row.
- **Tasks board:** the task appears as a Biostatistics review task at 1440 px and 390 px
  (`screenshots/after-tasks-board-1440.png`, `screenshots/after-tasks-board-390.png`).
- **Failure answers:** 429 characters with no SQL, against about 4,004 on trunk with the full
  statement and its values.

### A limit of this container, not of the change

The artifact store fails in this container. A trigger on `concept2cure_artifacts` references
`u.checksum_sha256`, a column from a migration this container's database (provisioned 2026-11-09) has
not applied. That is why `create_artifact` answers "was not stored" in both runs above and the
escalation is keyed to the content hash. The artifact-keyed path is covered by the PGlite test. It is
the same code path with a different source key.

## Not done here (recorded)

- Project admission (`admitTaskCreationProject`) is applied by the canonical create route, not by this
  write or by the bridge's task write. Recorded as task #5's scope.
- The escalation is raised unassigned and undated, as the bridge's blueprint tasks are. Offering an
  owner and due date is task #5.
