# QMS periodic review: a reminder that finds the document's owner (2026-10-29)

Gap 5, work item 2, second half, of `docs/design/VEEVA_GAP_2026-10-22.md`: "reminders through `emitDeadlineTask` and `taskDueSweep` rather than a new scheduler." Workstream MR-12 (QMS controlled documents), launch row **D2**. This reaches the one task store and the one due-date sweep from the review schedule that already exists. It adds no scheduler, store, surface or route.

## What already exists

- **The schedule.** The next review of a controlled document's version in force, after its last signed periodic review: `readQmsReviewSchedule` and `nextReviewDue` (`server/services/qms/periodic-review.ts`). Review-due, readiness, the register and the register report read it. Nothing tells a person when it comes due: they find it only by opening the register.
- **The one task store.** `unified_tasks`, written through `unifiedTaskService.createUnifiedTask` and moved through `updateTaskStatus` (`server/services/unifiedTaskService.ts`).
  - A task appears on the assignee's Tasks screen.
  - `MODULE_CONFIG` names the module a task belongs to. It has no Quality entry; the task board's palette (`TB_MOD`, `client/src/concept2cure/v2/fixtures/task-board-data.ts`) has none either, though `--module-quality` exists in the design tokens.
- **The one due-date sweep.** `taskDueSweep` (`server/jobs/taskDueSweep.ts`), hourly:
  - it notifies an open task's assignee once when the task comes due within 48 hours, and once when it goes overdue;
  - it stamps a marker on the row first, so a restart or a second replica never notifies twice;
  - the 48 hours is fixed. For an annual review that is two days' notice.
- **`emitDeadlineTask`** (`server/services/research-compliance/tasking-bridge.ts`): a best-effort writer for research compliance deadlines, after the governed commit. It hard-codes the Research Compliance module and takes no assignee, so it cannot carry a QMS obligation to its owner. The pattern, best effort after commit and never failing the governed act, is the one used here.
- **Domain task writers with an idempotency key**: `cmc/contradiction-tasks.ts`. It finds an open task by organization, module and source id before writing one. Same pattern.
- **The signing ceremony** (`signGovernedAct`) commits and responds in one step. It has no place to run work after the commit and before the response.
- **Deleted**:
  - `server/jobs/periodicReview.js` (`85616c46f`): a reminder cron over a Supabase table that no longer exists;
  - `client/src/components/PeriodicReviewDashboard.jsx` (`83fa7f6cf`, with 145 other orphaned files): a list over `/api/reference-model/review-tasks`, a reference-model store, not controlled documents.
  - Neither is restored.
- **Searches run**:
  - `emitDeadlineTask`, `taskDueSweep`, `remind`, `periodic review` and `review task` in `server/` and `client/src/`;
  - `git log --all --diff-filter=D` on `**/*eriodic*` and `**/*emind*`: the two files above, and test-tooling files under `.claude/skills/`.

## The design

1. **One open task per controlled document**, source `qms_periodic_review`, source id `qms-document:<id>`, module **Quality**:
   - assigned to the document's author, who owns it in the register, and due on its next review;
   - its metadata names the version and the due date it was written for, and `remindDaysBefore: 30`.
2. **Written when the date is set**, best effort after the governed commit (`schedulePeriodicReviewTask`, `server/services/qms/periodic-review-task.ts`):
   - **Approval** makes a version effective: a task for its next review. The previous version's task is completed, because its obligation ended with the new version.
   - **A signed review that finds the document current**: the task is completed and a new one is written for the date the reviewer set. The ceremony gains `afterCommit`, which runs after COMMIT and before the response. A failure there is logged and changes nothing about the signature or its answer.
   - **A signed review that finds a revision is required**: the task becomes "Revise …", due on the date the approval signed, which is when the document is due.
   - **Retirement**: the open task is cancelled.
   - Writing the same version and date again changes nothing.
3. **The sweep reads a lead time.** A task may carry `remindDaysBefore` (1 to 90). Its due-soon notice comes that many days ahead and says the due date; without it, the 48 hours stand.
   - The window is computed in SQL, inside a 90-day bound on the due-date index, so the batch limit still cannot be filled by rows that are not yet due.
4. **Quality joins `MODULE_CONFIG` and the task board's palette** (`var(--module-quality)`).

## Tests (red first)

- **Real PostgreSQL** (`RLS_ENFORCE=on`, `app_service`), through the real routes:
  - approval writes one Quality task to the author, due on the next review, with the 30-day lead;
  - approving again writes nothing more;
  - a review that finds the document current completes it and writes the next;
  - "revision required" makes it "Revise …";
  - retirement cancels it;
  - a new version's approval completes the old task;
  - the sweep notifies a task due in 20 days that carries the lead, once, and not one without it.
- **Unit**: the sweep's window with and without a lead, and a malformed lead.

## Not in this design

- Documents already effective before this change get their task at their next approval or review; no backfill writes tasks.
- A training assignment per person and document (founder decisions NEW-2 and NEW-3).
