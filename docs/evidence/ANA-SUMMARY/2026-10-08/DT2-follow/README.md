# ANA-SUMMARY DT2: a phone follows a desktop turn

This is slice DT2 of `docs/design/ANA_DETACH_2026-10-08.md` (third draft, §4, §5, §8 DT2). It is the client follower. Its lane is P-24, and it moves no D-row.

Nothing detaches in DT2. Closing or reloading the page that started a turn still stops that turn ("Stopped: this page lost its connection."), which is the expected result for this slice. DT2 adds the ability to follow a run from another page: the asker's other device, a reload of a follower page, or a send that the server refused with RUN_IN_PROGRESS.

## What was built

| Part | Where |
|---|---|
| `pollRun` (the one read of "what became of run X"), `listThreadRuns`, `readSealedRecord`, `runToRejoin`, `placeFollowedTurn`, `applyRunPoll`. Polled rows go through `applyTimelineFrame`, the same reader the live frames use, so the two sources merge by `seq`. `confirmRecordByRun` is deleted. | `client/src/concept2cure/components/ana/anaTurnTimeline.ts` |
| **Following.** A 2 s poll while the page is visible. It is paused while the page is hidden, with one immediate poll on `visibilitychange`. It backs off 2, 4, 8 … 30 s when the reader's network fails. `isStreaming`, `runStatus`, `runHold`, `turnRunPolicy` and `followScope` are set from the poll. The asker's composer steers through `interject`. Steer receipts come from the run's `controls`. The asker's approval opens the sign-off and closes it when the poll shows it is no longer pending.<br>**Hand-over (§4.3).** The stored answer replaces the followed turn under the same id, so an open Summary stays open. When there is no record: "Recording…" until `released_at` or 30 s, then "Not recorded".<br>**Rejoin.** `loadThread` reads `/runs?thread_id=` and follows the newest qualifying run. RUN_IN_PROGRESS re-reads the conversation and follows the run that holds it.<br>**Stop (§5.2).** `stop(abortIntent)`. For a detachable turn, Stopped is shown only on a 2xx, a 409, or a polled terminal status. A failed cancel does not abort. It shows "Stop not confirmed. Retrying." and retries with backoff. `'leave'` never cancels and never shows Stopped.<br>**Record ask.** `confirmTurnRecordByRun` now asks the run poll instead of `turn-records?run_id`. | `client/src/concept2cure/components/ana/useAnaChat.ts`, `useAnaChat.types.ts` (`AnaFollow`, `follow`, `stopUnconfirmed`, `followScope`, the six new stop reasons) |
| `STOP_LINES` gains `unattended_limit`, `session_ended`, `server_shutdown`, `orphaned`, `error` and `admin_cancelled`. `isContinuable` gains the first four. The §5.1 lines: `FOLLOW_LINES`, `followPhaseLine` ("Working · step 7 · 4m 12s", timed by the run's start against `serverNow`), `staleOwnerLine` (more than 60 s without a beat), `liveAlertLine`. | `client/src/concept2cure/v2/anaWorkModel.ts` |
| The closing row's notes: "{n} step(s) were not authorised and did not run." (counted from `heldBack`) and "The steps up to here were saved as they ran. This turn was not recorded.". The gap and cap lines come from `mirrorLines`. | `client/src/concept2cure/v2/turnSummaryRows.ts`, `TurnSummary.tsx` |
| The phase line and the alert line in the turn's own record. `LiveAlert` is the one alert element. | `client/src/concept2cure/v2/AnaActivity.tsx`, `AnaWorkSections.tsx` |
| §5.6. The run is read before the signing step, and again on NO_PENDING_APPROVAL or STALE_APPROVAL. The dialog gives way to "Already decided on another device." only when the run confirms it. | `client/src/concept2cure/components/ana/GovernedActionSignoff.tsx`, `useGovernedAction.ts` (`lastErrorCode`) |
| An admin follower has no Stop until DT3 accepts an admin's cancel (c; the reason is in the code comment), and no Pause or Resume. Its composer is disabled with "Only the person who asked can steer AnA." | `client/src/concept2cure/v2/surfaces/ConversationThread.tsx` |
| (b) The thread listing includes runs that have ended without a record and are not yet released (the recording window). | `server/routes/ana-ri/runs.ts` |

There is one renderer. A followed turn is drawn by the components that draw a live turn: AnaActivity, TurnSummary (rows), AnaWorkPanel (plan rail) and RunControlStrip.

## DT1's open items, handled

- **(a)** RUN_IN_PROGRESS and RUN_LIMIT are rendered in the design's words (`RUN_REFUSAL_TEXT`). RUN_IN_PROGRESS then follows the live run, placed after its question, and keeps the refused question and its notice at the end. RUN_LIMIT's link to the Working conversations waits for DT3, which builds that list.
- **(b)** I chose the listing, and pinned it in `runs-read.pglite.test.ts` › "the recording window". The listing now returns runs that are live or that ended without a record, whether released or not. The client then polls until `sealed` (and hands over), until `released_at`, or for 30 s.
- **(c)** Stop is hidden for `controlScope: 'cancel'` until DT3. Pause and Resume are hidden too. The comment sits at the strip in `ConversationThread.tsx`.

## Tests: red, then green

Red is shown two ways by `red/mutations.py`: (1) every DT2 suite against the pre-DT2 source at HEAD; (2) one targeted mutation of the DT2 code at a time. Every file is restored after each run, and the tree was verified byte-identical afterwards.

| Design test | Test | Red | Green |
|---|---|---|---|
| 1. A reload with a live run shows the followed turn after its question, with the plan and the phase line | `useAnaChat-follow.test.ts` › 1; `anaFollowView.test.tsx` › 1 | `red/head-hook.txt`, `red/head-view.txt`; `red/m1-no-rejoin-on-reload.txt` (the question stands alone) | `green/dt2-suites.txt` |
| 2. Overlapping SSE frames and polled rows render once | `useAnaChat-follow.test.ts` › 2 | `red/m2-no-visible-merge.txt`; `red/m2-append-not-merge.txt` (duplicates without the seq merge) | ✓ |
| 3. A sealed run hands over, with identical rows | `useAnaChat-follow.test.ts` › 3; `anaFollowView.test.tsx` › 3 (the Summary list text is equal before and after) | `red/m3-no-hand-over.txt` | ✓ |
| 4. The plan rail and a Manual hold render from `plan` and `hold`; pressing them sends controls | `anaFollowView.test.tsx` › 4 (interject, resume, cancel) | `red/m4-hold-ignored.txt` | ✓ |
| 5. A failed cancel shows "Stop not confirmed. Retrying." and does not abort; a later 200 or a 409 shows Stopped | `useAnaChat-follow.test.ts` › 5 (both), plus controls: a drive turn keeps today's Stop; `'leave'` | `red/m5-abort-on-failed-cancel.txt`; `red/head-hook.txt` | ✓ |
| 6. The reader's network and a stale owner each show their line; Stop is offered on a stale owner | `useAnaChat-follow.test.ts` › 6 (with the backoff); `anaFollowView.test.tsx` › 6 | `red/m6-no-stale-line.txt`, `red/m6-no-unreachable-line.txt` | ✓ |
| 7. "Recording…" until `released_at` or 30 s, then "Not recorded" | `useAnaChat-follow.test.ts` › 7 (both); `anaFollowView.test.tsx` › 7 | `red/m7-no-recording-wait.txt` | ✓ |
| 8. NO_PENDING_APPROVAL confirmed by the poll shows "Already decided on another device." and the dialog closes | `governedSignoffDecidedElsewhere.test.tsx` (404, 409, unconfirmed keeps the error, the pre-check) | `red/head-signoff.txt`; `red/m8-refusal-not-checked.txt` | ✓ |
| 9. An admin follower has Stop only (none until DT3), and the composer line | `conversationThreadAdminFollow.test.tsx` | `red/head-admin.txt`; `red/m9-admin-as-asker.txt` | ✓ |
| (a) RUN_IN_PROGRESS and RUN_LIMIT | `useAnaChat-follow.test.ts` › RUN_IN_PROGRESS, RUN_LIMIT | `red/head-hook.txt`; `red/ma-no-rejoin-on-refusal.txt` | ✓ |
| (b) The recording window is listed | `runs-read.pglite.test.ts` › the recording window | `red/listing-recording-window.txt` (2 failed against DT1's SQL) | `green/listing-recording-window.txt` |
| §5.3 stop lines and `isContinuable`; §2.7 count; §3.5–§3.6 lines | `anaFollowLines.test.ts` | `red/head-lines.txt`; `red/mc-not-continuable.txt`, `red/mn-no-not-authorised.txt`, `red/mg-no-gap.txt` | ✓ |

Six tests pass at HEAD on purpose. They are controls that pin today's behaviour: a 409 Stop shows Stopped, a drive turn's Stop aborts after a failed cancel, the asker keeps every control, and `cancelled`, `admin_cancelled` and `error` are not continuable.

**Existing suites changed under them.** Each change follows a design change.
- `useAnaChat-turn-record.test.ts`: the record ask is now the run poll (§4.3).
- `useAnaChat-stale-stream.test.ts`: a reload also reads `/runs?thread_id=`, and the record ask is the run poll.
- `governed-action-signoff.test.tsx`: the run is read before the signing step (§5.6), so the test finds the governed-action call by URL rather than by index.
- `runs-read.pglite.test.ts`: the "terminal, not released: not listed" line was the behaviour (b) changes.

**Wide run** (`RLS_ENFORCE=off`). Every client suite that imports a module DT2 changed, the DT2 suites, and the route test: 88 files, 872/872 (`green/related-suites.txt`).

The first wide run had 11 failures, all caused by DT2, and all were fixed in the code:
- `postControl` returned the raw status, so a response with `ok` and no numeric status read as a failure.
- A turn whose drive the server enabled was not treated as non-detachable.
- The record ask polled at once, ahead of the owner filing the record. It now waits one interval, as S4 waited 1.5 s.
- `'leave'` skipped the record ask that S4 pins for an abandoned turn.

## Gates (`gates.txt`)

- `ci:pushed-lint-warnings`: no file changed its warning count. Two warnings were fixed on the way: AnaActivity went over 500 lines, and `SummaryRowView` reached complexity 16. The new test files lint clean when run directly.
- `ci:undefined-css-classes`, `ci:sql-interpolation`, `ci:untracked-imports`: OK.
  - `ci:untracked-imports` reads commits only, and nothing here is committed. With `--all` it reports 0 findings in DT2 files; its two other findings are pre-existing and unrelated.
  - The new files are five test suites and this folder. No source file imports an untracked module.
- Type check: `scoped-tsc-config.json` reports 0 errors in DT2-changed files. A full `tsc -p tsconfig.check.json` runs out of memory in this container.

## Acceptance (browser, `acceptance/`)

**Setup.**
- A private instance ran on :5097, against **fresh2**, with `RLS_ENFORCE=on`, the dev server, and the DT1 stand-in model on :8829 (S5 plays, 3 s per model call).
- The env file names `concept2cure-ri_qa_fresh`. DT1's acceptance users exist only in `fresh2`, so the database name was overridden to `fresh2`.
- Users: `dt1-asker`, `dt1-admin` and `dt1-colleague`. No credentials are written in the evidence; the harness reads `PW_FILE`.
- The harness is `acceptance/dt2-follow.mjs`. The results are in `acceptance/dt2-follow.json` and `screens/`. Both servers were stopped afterwards. Ports :5078 and :5091 were not touched.

**What was run.** A new conversation was started on the desktop (1280×800): Manual, with the S5 four-part request. The phone (390×844) was signed in as the same person.

| Acceptance item | Shown | Evidence |
|---|---|---|
| A phone following a desktop turn sees the rows | Yes. The Summary sheet shows the note, four "Added task" rows, "Started", and "Working…" | `04-phone-summary-sheet-rows.png`, `views.phoneSheet` |
| …the plan rail | **Desktop follower:** the side panel's rail (4 tasks).<br>**Phone:** the record's "Plan · 4 steps" row, opened. The side panel is desktop-only (S4 layout). | `05-desktop-follower-plan-rail-and-rows.png`, `03-phone-following-plan-open.png` |
| …the follower phase line | "Paused · 12s"; after Resume, "Paused · step 1 · 43s" | `02-phone-following.png`, `10-phone-after-resume.png` |
| A reload mid-turn rejoins | Yes, on the phone (the follower). Reloading the *originating* desktop still stops the run in DT2, as designed. | `08-phone-after-reload-rejoined.png` |
| A new conversation's first turn rejoins | Yes. The conversation was new, and the phone found its run through the stamped thread and question (DT1). | `02-phone-following.png` |
| Resume from the phone proceeds on the desktop | Yes. The desktop received `resumed`, and its rail moved to task 2. | `checks.resumeFromPhoneReachedDesktop: true`; `09-desktop-after-phone-resume.png` |
| Stop from the phone stops the desktop | Yes. The desktop received `cancelled`. The phone handed over to the record: "Recorded" with the hash, and the record's rows include "You resumed AnA". | `checks.stopFromPhoneReachedDesktop: true`; `11-…`, `12-…`, `13-phone-summary-after-hand-over.png` |
| An admin follower | No Stop, no Pause. The composer is disabled with the line. The phase line reads "Waiting for the person who asked." | `06-admin-phone-no-stop-composer-disabled.png` |
| A colleague gets the 403 line | **Not on screen** (design issue 2). The colleague sees the transcript, and the listing returns no runs for them. Their direct read of the run is a 403 with "You don't have access to this conversation's live progress." | `07-colleague-transcript-only.png`, `colleagueRead` |

**The Manual hold on the phone.** The desktop shows "Waiting for you before the next step · Run this step". The follower shows "Paused after this step · Resume". Both buttons send the same `resume`. The difference comes from the server's `hold`, which is null until DT3 (design issue 1). The client renders the Manual hold from `hold` (test 4).

**Console and HTTP log.** The log holds:
- certificate errors for an external resource, from the proxy;
- aborted history reads, from `loadThread`'s own abort on remount;
- the colleague's intended 403.

## Design issues found

1. **`hold` is not written before DT3, but DT2's acceptance needs it.** The design gives the `hold` column to DT1 (§3.1) and DT2's acceptance asks the phone to show the Manual hold. DT1 deferred the writes to DT3. Until they land, a follower reads a Manual hold as a person's pause: "Paused after this step / Resume" instead of "Waiting for you before … / Run this step / Do this instead". The client already renders the hold from `hold`.
2. **The colleague's 403 line cannot be reached in the UI.** `/runs?thread_id=` lists only the caller's own runs for a member, so a colleague's client never reads the run and never sees the 403. Either the acceptance item becomes "the colleague sees the transcript and no live progress", or the listing tells members that a run exists without giving its detail.
3. **"Stopped by an administrator." has no producer.** `controlsOf` drops who took a control (§3.7), so nothing on the run says that a cancel was an admin's. I added the table entry (`admin_cancelled`). DT3 must write a distinguishable reason or flag.
4. **Only the follower can show "a reload mid-turn rejoins" in DT2.** Reloading the originating page drops its socket, and the server stops the run until DT3 detaches it.
5. **The follower's inline record shows the plan row and the phase line, not the step rows.** The inline record is built from `toolCalls`, which only the stream delivers. Projecting timeline events into `toolCalls` would have been a second derivation, so the rows are the S4 Summary's, opened from the phase line's Summary button (sheet on a phone, panel on a desktop).
6. **Clock format.** The phase line uses the shared `formatElapsed` ("4m 00s"), not the design's "4m".
7. **The sign-off pre-check adds a read.** Checking the run before signing (§5.6) adds one read per held sign-off. It fails open to today's flow when the run cannot be read.
8. **Pre-existing S4 behaviour, seen in the captures.** The Summary's live "Working…" row reads "Working" while the run is paused, and its header counts finished steps only ("0 steps · 0s" mid-turn).
