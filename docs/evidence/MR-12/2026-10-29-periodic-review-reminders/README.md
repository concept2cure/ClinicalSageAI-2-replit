# MR-12 / D2: a controlled document's next periodic review reaches its owner (2026-10-29)

Gap 5, work item 2, second half, of `docs/design/VEEVA_GAP_2026-10-22.md`: "reminders through `emitDeadlineTask` and `taskDueSweep` rather than a new scheduler." This reaches the one task store and the one due-date sweep from the review schedule that already exists. Design: `docs/design/QMS_PERIODIC_REVIEW_REMINDERS_2026-10-29.md`.

## What already exists

- **The schedule.** `readQmsReviewSchedule` and `nextReviewDue` (`services/qms/periodic-review.ts`): the next review of the version in force, after its last signed review. Nothing told anyone when it came due.
- **The one task store.** `unified_tasks`, through `unifiedTaskService`. `MODULE_CONFIG` had no Quality entry, and neither did the task board's palette, though `--module-quality` exists.
- **The one due-date sweep.** `taskDueSweep`, hourly:
  - it notifies the assignee once when a task comes due within 48 hours, and once when it goes overdue;
  - the 48 hours was fixed.
- **`emitDeadlineTask`.** A best-effort post-commit writer. It hard-codes Research Compliance and takes no assignee. Its pattern (after commit, never failing the governed act) is the one followed here.
- **`cmc/contradiction-tasks.ts`.** Finds an open task by key before writing one; same pattern.
- **`signGovernedAct`** committed and responded in one step, with no place for work in between.
- **Deleted, not restored**:
  - `server/jobs/periodicReview.js` (`85616c46f`), a cron over a dead Supabase table;
  - `client/src/components/PeriodicReviewDashboard.jsx` (`83fa7f6cf`), over a reference-model route, not controlled documents.

## The change

- **`schedulePeriodicReviewTask`** (`server/services/qms/periodic-review-task.ts`) keeps one open Quality task per controlled document, keyed `qms-document:<id>`:
  - it is assigned to the document's author and due on the next review;
  - its metadata names the version, the date and the kind, and `remindDaysBefore: 30`.
  - It closes the open task before writing the next. The same version, date and kind again changes nothing.
  - It is best effort: a failure is logged and never touches the governed act.
- **Written from the governed acts**, after their commit:
  - **approval** of a version: a task for its next review. The previous version's task is completed.
  - **a signed periodic review:**
    - "remains current" completes the task and writes the next one, for the reviewer's date;
    - "revision required" makes it "Revise …", due on the date the approval signed.
  - **retirement**: the open task is cancelled.
- **`signGovernedAct` gains `afterCommit`.** It runs after COMMIT and before the response. A failure in it is logged and changes neither the signature nor the answer.
- **`taskDueSweep` reads a lead time.**
  - A task may carry `remindDaysBefore` (1 to 90). Its due-soon notice comes that many days ahead and names the due date.
  - The window is computed in SQL, with a nested CASE so a non-numeric value is never cast, inside a 90-day bound on the due-date index.
  - The JavaScript reading is the same as the SQL's.
  - Tasks without a lead keep the 48 hours and the existing words.
- **Quality joins `MODULE_CONFIG` and the board's palette** (`var(--module-quality)`).

## Evidence

| File | What it shows |
|---|---|
| `01-red-db.txt` | Trunk `432a00e7a`, real PostgreSQL 16, `RLS_ENFORCE=on`, `app_service`: no task is written by approval, review or retirement, and the sweep has nothing to notify. 6/6 fail. The approval, review, retirement and revision calls themselves answer as expected. |
| `02-red-unit.txt` | Trunk's sweep: there is no lead time to read (3 of 12 fail). |
| `03-green-db.txt` | This suite (6), the periodic-review signed, in-force, signing-admission, signature-required and QMS RLS suites, and the eight task suites under `tests/db/*task*`. 14 files, 115 tests. |
| `04-mutation.txt` | Seven mutations, each caught: the sweep ignores the lead; the sweep's query admits only 48 hours; the open task is never closed; the same date writes another task; the task goes to nobody; the ceremony skips `afterCommit`; retirement leaves a task open. |
| `05-green-unit.txt` | QMS routes and services, Part 11, the jobs, every `signGovernedAct` route, the task suites and the Quality client: 1022 of 1026 pass. The 4 failures are on trunk without this change (below). |

Also clean: `tsc --noEmit` and the lint warning ratchet (`--since origin/concept2cure-v2`).

## Failing on trunk, not this change's

Both fail identically on `499a17b82` with this change stashed. They are left for the sessions that own them.

- **`server/services/part11/__tests__/one-signing-authority-policy.test.ts`** flags `server/services/authoring/authoring-document-read.ts`. It calls `isSigningAuthorized` once, and the policy's allow-list admits none there (last changed in `4626be1f9`).
- **`client/src/concept2cure/quality/__tests__/ControlledDocumentWorkbench.integration.test.tsx`** fails 3 of 3: the editor is not a textbox, and "Read only" is not shown.

## What remains

- **Documents effective before this change** get their task at their next approval or review. No backfill writes tasks.
- **A document with no author** gets a task no one is assigned. It is listed, but the sweep notifies only an assignee.
- **The SQL window's protection against batch starvation** (500 rows not yet due filling the limit) is not exercised by a test. The window itself is (mutations 1 and 2).
- **Per-person training expiry** (gap 5 item 3) and per-document training assignment (founder decisions NEW-2 and NEW-3).
