# ANA-SUMMARY S5: task attribution

Slice S5 of `docs/design/ANA_AGENT_WORK_VIEW_2026-10-08.md` (§5 S5, §2.1, §2.7 "Marked complete", §3.3 "Task").
It builds on S4's timeline: `shared/ana/turn-timeline.ts`, `server/services/ana/turn-timeline-emitter.ts`,
`TurnSummary.tsx` and `turnSummaryRows.ts`.

The lane is the founder's exception to Rule 2 (design §0, decision 1). It moves no D-row. Every number on a task
row is counted from the server's events. The "none of its n steps succeeded" count comes from each step's
`task` and its finished status. No model is asked for a number. The server never marks a task complete
(`turn-plan.ts`), so the fact describes AnA's claim.

## 1. What S5 built

| Part | Where | What |
|---|---|---|
| Attribution | `server/services/ana/turn-timeline-emitter.ts` | `taskInProgress(tool)` gives a step the id of the one task that is `in_progress`. It gives `null` when no task or several tasks are in progress, and always `null` for `update_plan`. The id is fixed when the step first appears and kept through `awaiting_approval` and `finished`. A step first appears when it is announced, before its round dispatches. So the plan used is the plan at dispatch. A plan update in the same round lands after dispatch and does not move the step to another task. `stream.ts` is unchanged: it is at its lint limit, and the emitter is the single place that produces step events. |
| Record | `shared/ana/turn-timeline.ts` | `StepRecordLink` gains `taskId` (and `LINK_FIELDS` with it). `RecordedStep extends StepRecordLink`, and `addStep` spreads `stepRecordLink(s)`, so the record carries `taskId` and `turn-record.ts` needs no edit (it stays at its 500-line budget). `finished()` and `notRun()` return `taskId: e.task`. |
| Event order | `shared/ana/plan-diff.ts` `taskChanges` | All of a plan's new tasks are emitted first, then its starts, completions and removals, each in plan order. The first browser run showed "Added A, Started A, Added B, C, D". The acceptance asks for four Added rows first (§4 below). `diffPlan`, which the live transcript's plan rows use, is unchanged. `taskChanges` has one caller, the emitter. |
| Rows | `client/src/concept2cure/v2/turnSummaryRows.ts` | A task row is now a `TaskRow`. It has `steps`: every step attributed to the task, as step rows. On a Completed row it also has `fact`, from `completedTaskFact()`, computed over the steps that appeared before the completion. With no steps the fact is "No steps recorded for this task". When every one of n ≥ 2 steps did not complete, it is "Marked complete by AnA · none of its n steps succeeded". For n = 1 it is "Marked complete by AnA · its 1 step did not succeed". When any step succeeded there is no fact. "Did not complete" is S4's `stepDidNotComplete`: failed, held back, or never finished. Trace rows (records from before `/4`) attribute nothing and claim nothing. |
| Detail | `client/src/concept2cure/v2/TurnSummary.tsx` | `TaskDetail`: the list as it stood at that moment (S4's `planAt`), then "Steps for this task", one item per step with its label, source line and the server's sentence. The fact is the row's always-visible note, never behind the chevron. |
| CSS | `client/src/concept2cure/v2/styles/app-v2.css` | Six rules for the steps list in the task detail. |

## 2. Red → green, by design test

"Red" was captured with the four S5 sources swapped back to HEAD (`red/red-swap.sh`, restored and md5-checked:
"OK (restored)" at the end of `red/red-sources-at-HEAD.txt`). Where a test passed at red by construction, a
targeted mutation shows it failing (`mutations/`).

| # | Test (file › block) | Red | Green |
|---|---|---|---|
| 1 | `stream-task-attribution.test.ts` › 1. the single in-progress task's id; null with two in progress; null for update_plan, always (timeline events of every phase and the record's `taskId`) | failed (`[null, null]` for the search) | passes; **M1** (first of several in progress) and **M2** (plan step attributed) each fail it |
| 1 | › before any plan, a step serves no task (record `taskId` is `null`, not absent) | failed (`undefined`) | passes |
| 2 | `turnSummaryTasks.test.tsx` › both steps failed → "none of its 2 steps succeeded" | failed | passes |
| 2 | › no steps → "No steps recorded for this task", not the failure fact | failed | passes; **M4** fails it |
| 2 | › one step failed and one succeeded → neither | passed (vacuous at HEAD) | passes; **M5** (any failure counts) fails it |
| 2 | › Added and Started rows carry no fact | passed (vacuous at HEAD) | passes; **M7** (fact on every row) fails it |
| 2 | › the fact is visible on the row without opening it | failed | passes |
| — | › opening a task: the list as it stood, and its steps (never another task's) | failed | passes; **M6** (no steps in the detail) fails it |
| — | › each task row lists only the steps attributed to that task | failed | passes |
| 3 | `stream-task-attribution.test.ts` › 3. ids stable across five update_plan calls; a title removed and re-added is a new task (`t4`), and its step carries it | failed (step `task` null; the id sequence itself already held at HEAD) | passes; **M3** (id kept after removal) fails it; **M8** (Added not first) fails it (`red/red-added-first-order.txt` is that red, before the reorder) |
| S4 | `turnSummary.test.tsx` › 1. rows live = rows from `/summary` | failed at red because the expectation now reads "Completed Find the reports No steps recorded for this task". Its search was dispatched before the plan existed, so it serves no task. | passes |
| S4 | `stream-turn-timeline.test.ts` › 1. same data live and sealed | expectation updated to the Added-first order | passes |

Totals: `red/red-sources-at-HEAD.txt` 9 failed / 22 passed (31: the S5 tests plus the S4 Summary suite);
`green/green-s5-and-s4-suites.txt` 42 / 42 (4 files). Mutations M1–M8: each fails ≥ 1 test, each file restored
with md5 OK (`mutations/M*.txt`, `mutations/run-mutations.sh`).

## 3. Related suites (`RLS_ENFORCE=off`; CI has no `.env`)

| Run | Result | File |
|---|---|---|
| Server: every test under `server/routes/ana-ri`, `server/services/ana`, `shared/ana` (327 files, no dbtests) | 326 passed, 1 skipped; 4,786 passed, 3 skipped, 0 failed | `green/green-server-ana.txt` |
| Client: every `*ana*` / `*turnSummary*` suite under `client/src/concept2cure`, plus every client suite importing TurnSummary, AnaActivity, AnaWorkPanel, turnSummaryRows, useAnaChat, turn-timeline or plan-diff | 100 files, 902 / 902 | `green/green-client-wide.txt` |
| `npm run test:ana` | 4 files, 303 / 303 | `green/green-test-ana.txt` |
| Every golden journey + `tests/lineage` | 13 files, 80 / 80 | `green/green-golden-journeys-and-lineage.txt` |

## 4. Browser acceptance

A private instance ran on :5087. It used the env of `qa/run-app-5078.sh` with PORT, ALLOWED_ORIGINS, the log
path and `ANTHROPIC_BASE_URL` changed, and `ANA_DOCUMENT_CATALOG_FORCE_ON=true` as S4 had. A scratch copy of
the W1 stand-in model ran on :8811 with S5 plays (`browser/stand-in-s5-plays.diff`). The harness is
`browser/s5-tasks.mjs` (1440×900). It imports the committed `QA-2026-10-08/rate-limits/scripts/lib.mjs` and tees
every SSE frame inside the page. Both servers were stopped afterwards; :5078 was not touched.

The play has four parts. Each part's work is dispatched while that part is the one in progress. The plan
update for the next part sits beside the work and lands after dispatch. Part 3 reads two documents that do not
exist, so both of its steps fail, and AnA still marks part 3 complete. Part 4 is marked complete with no step.

| Acceptance item | Shown | Evidence |
|---|---|---|
| A four-part request shows four "Added task" rows, then Started and Completed rows in order | Yes, after the reorder. The first run (before `taskChanges` put new tasks first) showed "Added A, Started A, Added B, C, D", which is why §1 has the reorder. Final task rows: Added ×4, then Started/Completed for t1…t4 in order. | `browser/s5-tasks.json` › `checks.taskRowOrder`, `checks.firstFourAreAdded: true`; screen 02 |
| Opening a task lists its steps | Yes. "Find the stability reports" lists "Searched the Vault · Vault · stability". "Read the two archived reports" lists both failed reads, each with "AnA couldn't finish reading a Vault document and continued without it." | `checks.findDetail`, `checks.archivedDetail`; screens 03, 04 |
| A task AnA completed despite failed steps shows the fact | Yes: "Completed Read the two archived reports · Marked complete by AnA · none of its 2 steps succeeded", visible without opening the row. The task with no step reads "No steps recorded for this task". | `checks.archivedRow`, `checks.summariseRow`; screen 04 |
| (also) attribution on the wire | Search → t1, listing → t2, both reads → t3, every "Updated the plan" → null | `checks.stepTasks` |
| (also) after a reload, the same rows from the record | `sameAfterReload: true`; footer "Recorded 79a7b323e6bf" | `afterReload` |

The error log (`browser/s5-tasks-errors.json`) has two `ERR_CERT_AUTHORITY_INVALID` entries, for an external
resource behind the agent proxy, and two `ERR_ABORTED` entries: a messages read and a `/summary` read, both
cancelled by the reload. None came from the Summary.

### What a scripted model cannot show

- **Whether a real model's plan matches its work.** The stand-in calls `update_plan` exactly when the play says.
  A real model may start several tasks at once, which makes their steps attribute to none. It may also advance
  the plan in the same round as the work, or call the next task's tool before marking it started. Each of these
  changes the attribution, faithfully to what was declared at dispatch. How often real turns end up with null
  attribution is unmeasured.
- **Whether "Marked complete by AnA · none of its n steps succeeded" appears in real turns**, and how a person
  reads it, is unmeasured. The stand-in forces it with two reads of documents that do not exist.
- **Real volume and timing.** Four parts in about 3 s with one source. The step list inside a long task (dozens
  of steps) was not exercised at phone width.

## 5. Types and lint

- **Lint** (`lint.md`): every changed file goes HEAD → now 0 / 0 → 0 / 0, and the three new files are 0 / 0. The
  check was shown failing: a planted unused variable plus a nesting depth of 5 in `turnSummaryRows.ts` gave
  2 warnings.
- **Scoped tsc** (`tsc-compare.sh`, `scoped-tsc-{server,client}.json`, `include: []`):
  - A narrowed repo tsconfig loses some ambient declarations, so each half reports errors in files S5 never touched.
  - Each half was therefore run three times: now, with the S5 sources swapped back to HEAD, and now with one
    planted error.
  - Server: 19 errors now and 19 at HEAD, with an empty diff. The plant appears at `turn-timeline-emitter.ts`.
  - Client: 2 errors now (CSS-module declarations in `components/ana`). At HEAD sources there were 9: the same
    2, plus 7 in the new test that HEAD's types cannot satisfy. The plant appears at `turnSummaryRows.ts`.
  - Every swap was restored with md5 OK (`tsc-*-restored.txt`).
  - A whole-repo `tsc` could not run here: other workers' tsc runs held the memory, and each attempt was OOM-killed.
- **Gates** (`gates.txt`):
  - Passed: `ci:undefined-css-classes`, `ci:internals-in-copy`, `ci:empty-state-honesty`, `ci:check-unrun-tests`,
    `ci:check-test-imports`, `ci:untracked-imports`, `ci:unreferenced-modules`, `ci:step-presentation`,
    `ci:design-system` and `ci:check-css-selector-shadowing`.
  - `ci:duplicate-exported-types` fails on the same 17 names S4 recorded. All are in files S5 does not touch, and
    `TaskRow` is not among them.

## 6. Not verified

- The phone sheet (390×844) with a task opened. Only 1440×900 was driven.
- `ci:component-class-coverage`, which needs a `vite build`. Not run; the six new classes each have a rule
  (`ci:undefined-css-classes` passed).
- A whole-repo `tsc` (see §5).
- The DB tier with `RLS_ENFORCE=on`. S5 adds no SQL. `taskId` rides in the record body, whose write path is
  unchanged.
- A `notRun` step (a Manual hold or a stop) attributed to a task. The code path returns `taskId` the same way, but
  no test drives it.

## 7. Decisions this change made that the lead should confirm

1. **Plan at dispatch, literally.** A step announced in the same round as the `update_plan` that starts its task
   keeps the previous attribution (often null). The alternative is to apply a same-round plan first. That would
   attribute by the order of the model's calls, not by what was in progress when the work began.
2. **Added first.** `taskChanges` emits a plan's new tasks before its starts, which makes the acceptance's "four
   Added task rows, then Started" true. The live transcript's plan rows (`diffPlan`) keep their order.
3. **A task row lists all of the task's steps**, on every row of that task (Added, Started, Completed). The fact
   counts only the steps that appeared before the Completed event. Listing only the steps "up to that moment"
   would leave every Started row empty.
4. **n = 1 wording**: "Marked complete by AnA · its 1 step did not succeed", rather than the design's
   "none of its 1 steps succeeded".
5. **Both facts use the row's warning-coloured note** (`.ana-activity-note`). "No steps recorded for this task"
   is a caution about AnA's claim, so it is shown, never folded away. A neutral colour for it would be a small
   CSS change.
6. **`taskId: null` is written for every unattributed `/4` step.** Absent means a record from before S5. This
   changes the record body of new turns only; `/4` is unchanged and no schema bump was made. This follows S4's
   rule that only fields the stream reported are written: the emitter now reports `null`.
