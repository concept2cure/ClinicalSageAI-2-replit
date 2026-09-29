# S1: a turn the loop cut short no longer reads as finished

**Row:** 74 in `docs/work-orders/README.md` (founder-directed 2026-09-27; it
moves no D-row and is recorded as the founder's exception to RULE 2).
**Slice:** S1 of the run-policy design ("honest turn endings"). It adds no
capability. **Session:** `…019ZvHmh`. **Recorded:** 2026-09-28, against HEAD
`cd08aec79` plus the S1 working tree (uncommitted when filed; `tree.sha256`
gives every file's hash).

## Status: blocked on the live capture

The design sets out the evidence for this lane as the per-slice red-then-green
logs **plus a live capture**, and says that without the live capture the lane
reports blocked. The red, green and mutation logs are in this folder. The live
capture has **not** been made. It would be a real turn driven to the round cap
on a running server, showing the `done` frame, the rail's "Stopped at the round
limit" line, the note and Continue. This container has no database and no model
credentials. Until that capture is filed here, S1 is **blocked on evidence, not
done**.

## What was wrong

AnA's agentic loop ends for a reason:

- `no_more_tools`: she said she was done.
- `max_rounds`: the round cap forced a final answer.
- `duplicate_thrash`: she was repeating the same step.
- `cancelled`: the run was stopped between rounds.

The reason never left the server. The stream's `done` frame omitted it and the
client never read it. A turn the round cap cut short therefore looked finished
everywhere:

- the work panel said "Finished in";
- the transcript showed an ordinary answer;
- the next turn's continuity note told the model to reuse that turn's findings.

In a regulated product a truncated analysis must not read as complete.

## The change

**Server**

- `stream.ts`:
  - `loopRounds` is kept beside `loopStoppedReason`.
  - `done` carries `stoppedReason`, `rounds` and `runPolicy: null` (a later
    slice fills `runPolicy`).
  - Both values go to `runStreamPostProcessing`.
  - A stop other than `no_more_tools` records `turnRecorder.warn(...)`. The
    recorder's existing `warn` is used, so the recorder file is unchanged.
  - `formatStoppedTurnNote(previousMsgs)` is added beside the trace note.
- `post-processing.ts`: the saved assistant metadata goes through
  `withTurnEnding`.
- `tool-trace.ts`:
  - `withTurnEnding` stores the reason (omitted for `no_more_tools`), and the
    rounds when they are a positive whole number.
  - `turnStopWarning` gives the record's wording. A cancel before the first
    round claims no round.
  - `formatStoppedTurnNote` covers `max_rounds` and `duplicate_thrash` only. Its
    words table is a `Map`, so a stored `constructor` or `toString` finds
    nothing.
- `run-status.ts`: `RunStoppedReason` reserves `budget_exhausted`,
  `approval_timeout`, `hold_expired` and `hold_unavailable`. They are names
  only; nothing produces them. It also adds `TurnStoppedReason`.

**Client**

- `useAnaChat.types.ts`: `AnaStoppedReason`, which is the full reserved union,
  and `AnaChatMessage.stoppedReason` / `rounds`.
- `anaProgress.ts`: `readTurnEnding` accepts only the four reasons the server
  produces today. A reserved or unknown value is ignored, so it cannot reach a
  surface whose last branch reads "Finished".
- `useAnaChat.ts`: the `done` handler and `loadThread` both use
  `readTurnEnding`.
- `anaWorkModel.ts`: after the interrupted check, `stateLineFor` gives:
  - `cancelled`: "Stopped after X";
  - `max_rounds`: "Stopped at the round limit · X";
  - `duplicate_thrash`: "Stopped: repeating a step · X".

  A reopened turn gets the same lines without a clock. The file also adds
  `isContinuable`, `CONTINUE_PROMPT` and `continueTurnIndex`.
- `AnaActivity.tsx`: an always-visible `role="note"` sits outside the folded
  body.
  - Continue appears only when the stop is continuable **and** the host passes
    `onContinue`.
  - The stop is spoken from the one polite region on both render paths.
  - Continue is described by the note's sentence.
  - When the host withdraws Continue, focus moves to the note, not `<body>`.
- `Shell.tsx`, `ConversationThread.tsx`: `onContinue` is passed to the latest
  settled assistant turn only, and sends through each host's existing send path.
- `app-v2.css`: `.ana-activity-stopped` and `.ana-activity-continue` use
  existing tokens only.

## Proof

| Stage | File | Result |
|---|---|---|
| Every S1 test file **as it is in the tree**, against HEAD's source for all 12 S1 source files, plus do-nothing stubs for the six new names the tests import | `red.txt` | 42 failed / 87 passed (129), 8 files. Every failure is the missing behaviour (absent text, a null note, `''` from a stub, `-1`); none is an import error |
| With S1 | `green.txt` | 461/461 in 41 files: the eight S1 files and 33 neighbours (the other `useAnaChat` hook suites, the rail, the conversation screen, Live Drive, run control, post-processing, run-status, tool-trace) |
| Mutations of the finished tree | `mutations.txt` | 23/23 red. There are 13 on the S1 behaviour and 10 on the review fixes; each review mutation names the objection it pins |
| `npx tsc --noEmit` | — | 0 errors |
| `npm run ci:pushed-lint-warnings` (`--since cd08aec79`) | — | net −1 (`stream.ts` 25 → 24). The ratchet sees tracked files only, so the five new test files were linted directly: 0 warnings |
| `ci:design-system`, `ci:check-phantom-tokens`, `ci:undefined-css-classes`, `ci:check-css-selector-shadowing`, `ci:check-shell-css-collisions` | — | all OK, no new entries |

The build pass recorded red for the client and for the server pure-core tests
against **earlier versions** of those test files. `red.txt` supersedes those
runs. It applies review objection 6's standard, which is to fail the tree's
own tests against HEAD, to every S1 test file and not only the server ones.

`anaStoppedNoteA11y.test.tsx` holds the four accessibility cases for the note.
They are split out of `anaActivity.test.tsx` because that file was at ESLint's
500-line and 100-line-per-function limits. The spec's own cases stay in
`anaActivity.test.tsx`.

## Review follow-through

| # | Objection | Disposition |
|---|---|---|
| 1 | "Stopped repeating a step" can read as recovery | Fixed: "Stopped: repeating a step", and the spec changed to match |
| 2 | A server `cancelled` turn gets no note and no next-turn caveat | Held to the S1 spec ("cancelled: no note"). Handed on below |
| 3 | The next-turn note reads only the last assistant turn | The comment now says so. Handed on below |
| 4 | Awkward record wording for a cancel at round 0 | Fixed: "The run was stopped before its first tool round." |
| 5 | The stop is not announced on the short render branch | Fixed: the polite region is the same node on both branches |
| 6 | Server red was recorded against an earlier test file | Re-recorded here with do-nothing stubs, together with every other S1 test file |
| 7, 14 | Prototype keys resolve in the words table | Fixed: a `Map`. `constructor` and `toString` are pinned |
| 8 | A server `cancelled` outranked a dropped stream | Fixed: that check now sits after the interrupted check; cancelled + interrupted reads "Did not finish" |
| 9 | No note on the client-history fallback | A known limit, stated in code. Handed on below |
| 10 | Evidence not filed | This folder. The live capture is still outstanding (see Status) |
| 11 | Continue leaves focus on `<body>` | Fixed: focus moves to the note. Pinned in the component and in both hosts |
| 12 | Continue has no description | Fixed: `aria-describedby` points at the note's sentence |
| 13 | The lane disclosure was incomplete | Row 74 now lists every S1 file and the other lane's window |

## Handed on (row 74, later slices or the spec owner)

- **`cancelled` on a reopened or non-latest turn.** Neither the transcript nor
  the next turn says that such a turn stopped. Its saved answer may be only a
  preamble, and the trace note still says "reuse these findings". This is for
  the spec owner. Option (a) gives such turns a quiet factual note ("This turn
  was stopped before AnA said she was done."). Option (b) adds `cancelled` to
  the next-turn note's table.
- **The next-turn note covers only the immediately preceding assistant turn.**
  An exchange typed between a capped turn and "continue" removes the caveat. The
  idea for a later slice is to name every unfinished turn since the last one
  that ended with `no_more_tools`.
- **Client-history fallback.** When server history is unavailable, the
  conversation history carries only role and content, so neither note reaches
  the model. The fix would have the client send `stoppedReason` / `rounds` on
  assistant entries. That is a scope decision.
- **Not in this build, by the S1 task's scope:**
  - attaching `executeAgenticLoop` for the non-SSE doors;
  - extracting `support/stream-route-harness.ts` (`live-drive-turn.test.ts` is
    inside another lane's window);
  - the reserved reasons' copy and producers;
  - the `'incomplete'` trace status.

## Lane disclosure

The S1 files are `stream.ts`, `post-processing.ts`, `tool-trace.ts`,
`run-status.ts`, `useAnaChat.ts`, `useAnaChat.types.ts`, `anaProgress.ts`,
`anaWorkModel.ts`, `AnaActivity.tsx`, `Shell.tsx`, `ConversationThread.tsx` and
`app-v2.css`.

Five of them were inside another lane's 24h window at edit time: `Shell.tsx`,
`ConversationThread.tsx`, `useAnaChat.ts`, `useAnaChat.types.ts` and
`app-v2.css`. The other lane is `…01KZK3jg`, Live Drive, commits `a75e38452` and
`01d91a130`. Every S1 hunk is additive. `git blame` at each insertion point
shows none touching or next to that lane's lines. Row 74 carries the same list.

## Re-run by the lane before commit (2026-09-28, 04:4x UTC, quiet machine)

The tree is the one hashed in `tree.sha256`.

- `npx tsc --noEmit`: exit 0.
- The 41 files in `green.txt`, re-run: 41 files, 461/461 passed.
- Two sabotages chosen independently of `mutations.txt`, each restored and its
  hash re-checked against `tree.sha256`:
  - deleting `stateLineFor`'s `max_rounds` branch turned 2 `anaWorkPanel` tests red;
  - dropping `stoppedReason`/`rounds` from the `done` frame turned the
    `stream-stopped-reason` carriage test red.
- `npm run ci:pushed-lint-warnings`: net −1. `eslint` on the five new test
  files: exit 0.
