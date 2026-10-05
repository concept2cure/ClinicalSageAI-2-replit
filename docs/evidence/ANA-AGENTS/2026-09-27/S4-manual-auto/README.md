# S4: Manual and Auto are a real run policy, and Manual never silently becomes Auto

**Row:** 74 in `docs/work-orders/README.md` (founder-directed 2026-09-27; it
moves no D-row and is recorded as the founder's exception to RULE 2).
**Slice:** S4 of the run-policy design ("Manual/Auto", R8 and R10). It stands on
S1 (`85cb5654b`) and S3 (`eeedc6231`) and adds no model, no tool and no
migration. **Session:** `…019ZvHmh`. **Recorded:** 2026-09-28, against HEAD
`39b3027cc` plus the S4 working tree, after a 45-point review. Every S4 file
is identical between `c82c056be`, where the build started, and `39b3027cc`.
The three commits between them are another session's (`03dea50b7`,
`eea56da2c`, `39b3027cc`) and touch no S4 file. The tree was uncommitted when
filed; `tree.sha256` hashes every S4 file.

`git pull --ff-only` was refused at the start of this pass: that session's
then-uncommitted `AnaToolExecutor.ts` conflicted with upstream `6e719d2cc`.
The upstream commits touch no S4 file, and nothing was forced or stashed.
ADR-0015 (`39b3027cc`) records Auto as the default run policy.

## Status: blocked on the live capture

Every S4 gate was seen red against HEAD, and every review gate was seen red
against the pre-review S4 build. All are green on the finished tree. Each of
65 mutations of the finished tree turns a gate red.

The live capture has **not** been made. It needs a real Manual turn on a
running server:

- held before round 2;
- answered with Run this step, and separately with Do this instead;
- one hold left to expire, and one ended by closing the page.

This container has no database and no model key. Until that capture is filed
here, S4 is **blocked on evidence, not done**, as S1 and S3 are.

## What was wrong

There was no Manual or Auto. The design's "Manual" existed only as a label:

- Every turn ran on its effort ceiling, with nothing between steps but a
  person's own Pause.
- The Ask/Agent control is Live Drive (`a75e38452`), not a run policy.
- The run-policy stop reasons (`budget_exhausted`, `approval_timeout`,
  `hold_expired`, `hold_unavailable`) were named in S1 and produced by nothing.
- The conversation screen had no run-control strip. A hold there could not
  have been answered.

## The change

`run_policy` on `POST /api/ana-ri/stream` is `'manual'`, `'auto'` or none.
Anything else is none, not a 400 (`parseRunPolicy`, `isAnaRunPolicy`). The
stream reads it in five places and nowhere else:

| Where | Manual | Auto | None (every door that sends nothing) |
|---|---|---|---|
| Round budget (`resolveRoundBudget`) | the effort ceiling (6+2 balanced) | past the effort ceiling while each round is new, to an absolute 20 that a demo cannot lift | the effort ceiling, as before |
| Stop directive (`policyStopDirective`) | an unanswered approval ends the turn (`approval_timeout`) | the same, plus 15 minutes of work or 40 in all (`budget_exhausted`), each with a closing answer | never; an unanswered approval is denied and the turn goes on, as before |
| Hold expiry (`streamRunHold`) | `'end'`: a hold nobody answers ENDS the turn (`endHeldRun`, `hold_expired`); it never resumes | `'resume'`, as before | `'resume'`, as before |
| Checkpoint (`TurnPolicy`, `turn-run-policy.ts`) | stops before every further step that would run without a person, and before round 1 only when that step starts an agent | today's checkpoint | today's checkpoint, same order and frames |
| Turn ending | `done.runPolicy` and `done.pendingSteps`; metadata `runPolicy`, `pendingSteps` and `policyHolds`; record warnings and `not_run` steps | the same, without holds | `runPolicy: null`; metadata as before |

**Manual, step by step.** She runs the step the message asked for. Before each
further step with anything ungoverned in it (the gate's own verdict,
`classifyToolCall`), the checkpoint does this:

1. It drains the queue. A steer typed while she was still working already
   answers "what next", so it replaces the step. **That is not a hold:**
   nothing paused and no Next was shown. It is filed as `superseded`, in these
   words: "a steer the person sent while AnA was working replaced her next
   step … before it was shown; it was not run". The record never says she
   stopped (review 1, 18).
2. It places the hold. `holdForPerson` moves the row from running to paused,
   with no control event, because no person pressed Pause. If that writes
   nothing, the row is read:
   - A person's own pause already in place stands in for hers. It is announced
     as hers, with Next, and their Resume is taken as Run this step (review 9).
   - A cancelled row is a Stop.
   - Anything else (failed, finished, gone), or a write that throws, **fails
     closed** (review 6, 15, 23, 33).
3. It says `{type:'paused', reason:'manual', next:[labels]}` and waits on the
   turn's shared hold (`run-hold.ts`).
4. When the hold ends, only a person's answer runs or replaces the step. The
   row must read `running` again, or `paused` again after a Run this step;
   only the person's resume or steer writes that. A row that left the hold as
   failed, finished or gone fails closed, and no `continued` is filed:
   - **Run this step** is `applyControl resume`, the person's own control,
     recorded with their id. The step runs, and a `continued` hold is kept.
   - **Do this instead** is a steer. The loop `'replan'`s, and the step never
     runs. The model gets `REDIRECTED_TOOL_RESULT` with the steer in the same
     call, `interjected.replaced` names the step, the record files it
     `not_run`, and a `redirected` hold is kept. The transcript says "Not run —
     your steer replaced it: …", live and on reload (review 2, 26).
   - **Stop** cancels. The held step is filed `not_run` ("stopped while AnA
     waited"), named in `done.pendingSteps`, and a `stopped` hold is kept. A
     reopened turn says so (review 3, 17, 25).
   - **The page closes.** The step never runs, and it is filed `not_run`
     ("the page was closed while AnA waited"), with a `disconnected` hold.
   - **Nobody answers for 10 minutes.** `endHeldRun` moves the row from paused
     to finished (`hold_expired`) and sends one `hold_expired` frame. No
     further model call is made; the steps are named and filed `not_run`, and
     an `expired` hold is kept. `resumeAbandonedRun` is never called. A
     person's own pause in a Manual turn ends the same way, filed as **their**
     pause ("the run was paused and nobody resumed it"), not as her wait
     (review 19).

She does not hold when every pending call already goes to a person (an
approval) or will not run. She does not hold while a demonstration **the
person started** drives. The exemption is latched as the turn begins, so a
demo the model starts mid-turn (`start_product_demo` promotes the turn) does
not switch Manual off (review 16).

**Manual that cannot hold fails closed.** Holding needs a run row and an owner
who can resume it (`isHoldable`). Without both, or when the hold cannot be
placed as in step 2, the turn stops at the first hold it would have made. It
writes `MANUAL_UNAVAILABLE`, ends `hold_unavailable`, and files the steps
`not_run` with their names. The transcript note says it once and says what to
do: "To let her go on, switch to Auto, then Continue". It never offers "try
again" under Manual (review 10, 32).

**Auto never approves, signs or answers a gate.** The approval gate
(`settleApprovals` / `awaitDecision` / `requestApproval`) is untouched: a
timeout is a denial whatever the policy. The policy reads the outcome only
afterwards, from outside the gate (`TurnPolicy.noteApprovals` on
`APPROVAL_TIMEOUT_WHY`). `auto-never-approves.test.ts` pins that the policy, by
every name it has, appears nowhere in the gate classifier, the governed-action
route, the stream's approval code or the handler context. Those names are
`run_policy`, `runPolicy`, `AnaRunPolicy`, and now `turnPolicy` and `TurnPolicy`
(review 21). It also pins that `humanConfirmed: true` is set by `utility.ts`
alone. `humanConfirmed` is never set by the policy.

**Her holds are explained, not hidden.** The holds are `policyHolds` on the
assistant message. Each is warned into the turn record (`policyHoldWarning`),
and each duration is built from the shared constants, never a literal (review
11, 20, 27, 44). The lineage dossier reads them into their own section
(`lineage-dossier-holds.ts`):

- The XML has `<PolicyHolds count unreadable>` after `<HumanControls>`, with
  `held="false"` on a superseded step.
- The trace report has "AnA's own holds (Manual)", with a Turn column and
  plain-language outcomes.
- A malformed stored entry is **counted** as unreadable, never dropped in
  silence (review 12, 22, 30, 43).

**Client.**

- **"Between steps"** (`RunPolicySwitch.tsx`) is a separate radiogroup in the
  rail menu, the Home foot and the conversation foot. Ask/Agent is untouched.
  - Each radio is named by its label and described by its description through
    `aria-describedby`.
  - In the menu the description is visible under the option. In the foot the
    chosen policy's short line is on screen ("She keeps going: up to 20
    rounds, 15 minutes of work.") (review 5, 40).
  - The checked option carries a check mark, so it is not marked by colour
    alone (review 38).
  - There is no transition under reduced motion (review 39).
- **The copy says what each policy does**, from the constants (review 4, 13):
  - Manual: "If nobody answers within 10 minutes, or the page is closed, she
    stops there. A demonstration you start runs through without stopping."
  - Auto: "…for up to 20 rounds whichever engine you chose, 15 minutes of
    work or 40 minutes in all…"
  - Quick ask: "· with Auto, up to 20 rounds".
- **`useAnaChat`** sends `run_policy`, keeps `runHold`, and knows the in-flight
  turn's policy (`turnRunPolicy`). It keeps an expired hold until the stream
  closes, so the strip and panel never read "Working" after `hold_expired`
  (review 24). It hydrates `replacedSteps` from stored holds.
- **The run-control strip MOVED** into `AnaWorkSections.tsx` (`RunControlStrip`)
  and is mounted on the conversation screen. Under a Manual hold it shows
  "Waiting for you before the next step" and "Next: …", with Run this step and
  Do this instead both described by that line (review 41). It shows "If nobody
  answers within 10 minutes, the turn ends.". A polite live region, mounted
  with the strip, says "AnA is waiting for you before: …" (review 34). While a
  Manual turn is working, the steer box says a steer sent now replaces her
  next step (review 1).
- **The work panel and the chip** both say "Waiting for you", "Paused" or
  "Stopped waiting for you" as the hold is (review 7, 8).
- **The three docks** run their own chats and send no policy. They say so
  under **either** policy. Under Auto the note reads: "Here AnA works up to
  her usual round limit, with no time limit, and an unanswered request does
  not end her turn" (review 13).

## Declared cost change (row 74)

The shell chat defaults to Auto, so a rail, Home or conversation turn now
sends `run_policy: 'auto'`:

- **Rounds.** A turn that keeps finding new work may run 20 tool rounds, where
  the ceiling was 8 (balanced) or 14 (thorough). **Quick ask ("Instant") too,
  from 4 to 20**, and both the Auto and the Quick ask descriptions now say so.
  A demonstration started as a demo is capped at 20 under Auto, where with no
  policy it reached 22 (20 + 2) (review 29).
- **Time.** 15 minutes of work, 40 minutes in all.
- **Approvals.** An approval nobody answers for 10 minutes now ends an Auto or
  Manual turn with a closing answer. Before, it was denied and the turn went on.
- **Existing users.** They were moved to Auto without choosing it:
  `loadPrefs` merges the default. The description is now on screen wherever
  the policy is picked. A one-time notice is a new surface, and is left to the
  founder on row 74 (review 5).

Every door that sends no policy is unchanged, and the no-policy twin of each
case in `stream-run-policy.test.ts` pins it. Those doors are the three docks,
the private ConversationThread chat and every non-stream door.

## Proof

| Stage | File | Result |
|---|---|---|
| **Red A, server.** The S4 server test files **as in the tree**, against HEAD's source for all eight S4-modified server files, with do-nothing stubs only for names HEAD lacks. `run-control-limits`: `AUTO_ACTIVE_MS`, `AUTO_WALL_MS`, `RUN_AGENT_TOOL`. `run-status`: `parseRunPolicy`, `isHoldable`, `manualHoldDue`, `turnStoppedReason`, `policyStopDirective`, the `PolicyHold`/`AnaRunPolicy` types. `tool-trace`: `policyHoldWarning`. New file: `turn-run-policy.ts` (`TurnPolicy`). Restored, and each sha256 re-checked | `red.txt` part A | 73 failed / 46 passed (119), 7 of 8 files. Every failure is the missing behaviour. Two fail by dereferencing the absent result: no `not_run` step, and no report section. No failure is an import error or a timeout. The 46 that pass are the parity twins, which must pass on HEAD, and the absence pins |
| **Red B, client.** The S4 client test files as in the tree, against HEAD's source for all 17 S4-modified client files, with stubs only for `ANA_RUN_POLICY_COPY`, `RunControlStrip`, the three run-control-limits constants, and the new `RunPolicySwitch.tsx` | `red.txt` part B | 69 failed / 12 passed (81), 6 of 6 files. The 12 are parity and absence cases. The dock-note gate is red **with its filed copy** (review 36) |
| **Red C, review.** Every review gate against the S4 build **before** its review fix | `red.txt` part C | Route 11/39 red; the race case (added after R01) red against the pre-review `turn-run-policy.ts`; the disconnect unit case red; record and dossier 10/34 red; client 23/75 red. The `holdForPerson`-throws case was already closed in the build, so it is a coverage add |
| **Green.** The 212 neighbour suites (`neighbours.txt`: every test that reads an S4 file, plus the previous 182) on the finished tree | `green.txt` | 212/212 files, 3235/3235 tests, run with nothing else running. An earlier run showed one failure caused by this session running the eslint ratchet at the same time: its temporary `__eslint_ratchet_prev__.Shell.tsx` held the old strip. That run is disclosed in the file and was re-run clean. The 14 S4 test files hold 200 tests |
| **Mutations** of the finished tree. Each is applied alone, its suite run, the file restored and its sha256 re-checked. The S4 tree hash is identical before and after | `mutations.txt` | **65/65 red**. R01 was not red on the first pass: the build's second guard (the re-read after the hold) caught every row it tried. A gate for the one case only the first guard decides was added, shown red against the pre-review code (C2), and R01 re-run red. B01–B23 cover S4 behaviour. R01–R33 cover the review fixes. O01–O09 are overcorrections: Auto holding, Manual holding through a person-started demo, a no-policy door on Auto's budget, an unanswered approval ending a no-policy turn, Manual failing closed when it could hold, no resume taken as an answer, Auto stamping `humanConfirmed`, an expired hold never cleared, and Ask/Agent replaced |
| **Structural.** `auto-never-approves` is an absence pin, so it is green on HEAD by construction. It is shown red on the finished tree by R13 (the gate reads `turnPolicy`) and O07 (Auto stamps `humanConfirmed`) | `mutations.txt` | red on both |
| `npx tsc --noEmit` (whole tree) | `green.txt` | exit 0, 0 errors |
| `check-eslint-warning-ratchet --since HEAD`, and `ci:pushed-lint-warnings` | `green.txt` | net −3, all of it the other session's `cross-artifact-consistency.ts`. Every S4 file is at its HEAD count. The first read was +3, and three splits brought it back: the strip into `HoldLines`/`steerHelpFor`, the XML holds block into `policyHoldsXml`, and the dossier's hold reader into `lineage-dossier-holds.ts` |
| `npx eslint` on the 16 new files | `green.txt` | 0 errors, 0 warnings (one test file is on eslint's ignore list, as S1's sibling is) |
| `ci:design-system`, `ci:check-phantom-tokens`, `ci:undefined-css-classes`, `ci:check-css-selector-shadowing`, `ci:check-shell-css-collisions` | `green.txt` | all exit 0. `undefined-css-classes` was seen red first, with the two new classes' rules removed (`ana-activity-replaced`, `ana-policy-short`) |

## Review follow-through

| # | Objection | Disposition |
|---|---|---|
| 6, 15, 23, 33 | A Manual hold could run the step with nobody deciding. `holdForPerson` false followed by `hold()` of a failed, finished or gone row read as `'running'` (Part 11, major) | **Fixed.** `placeHold` stands a hold only on a write that took, or on a person's pause already in place. `settleHold` runs the step only when the row reads `running`/`paused` after the hold. Everything else fails closed with `MANUAL_UNAVAILABLE`, and no `continued` is filed. Red first: 7 route cases. Six have the row `failed`/`finished`/`null`, before and after the hold. The seventh has the write match nothing while the row reads `running`; it was added when R01 was first not red. The `holdForPerson`-throws case was already closed and is now covered. Mutations R01, R02, O06 |
| 16 | A demo the model starts switched Manual off (Part 11, major) | **Fixed.** The demo exemption is latched at turn start. Red first: route case (2c). Mutations R07, O02 |
| 1, 18 | An early steer was filed as a hold, and the steer box gave no warning | **Fixed.** Outcome `superseded` ("before it was shown"), `held="false"` in the XML, plain words in the report, and the running-Manual steer help. Red first. Mutations R04, R25, R26, R33 |
| 2, 26 | Replaced steps were never shown or kept | **Fixed.** A note on the turn, carried by `activityPropsFor` and hydrated from `policyHolds` on reload. Red first. Mutations R17, R18 |
| 3, 17, 25 | A Stop or disconnect at a hold left no record, and a reload read as a plain Stop | **Fixed:** outcomes `stopped` and `disconnected`, `not_run` steps, `pendingSteps`, and the reload note. Red first: route (4b) and unit `turn-run-policy.test.ts`. Mutations R05, R06, R19. **Declined:** reporting `client_disconnected` as the turn's stop reason. `TurnStoppedReason` excludes it by S1's design (`run-status.ts`). The client has no words for it, and `readTurnEnding` would drop it, so a reload would read "Finished". The run row already records `client_disconnected` (`stopRunInternally`), and the `disconnected` hold now says it in the record and the dossier |
| 4 | Auto silently overrode Quick ask's 4 rounds | **Fixed by disclosure**, where the engine and the policy are chosen, plus the `ANA_MODES` docblock. The spec's `resolveRoundBudget` (S3, pinned `fast`/`auto` → 4+16) is kept. Mutation R32 |
| 5, 40 | The description was only in a `title`, and bloated the menu radio's name | **Fixed.** `aria-describedby` in both variants, the label as the name, and a visible short line in the foot. Mutations R27, R28. **Not built:** a one-time notice for migrated users. It is a new surface under RULE 2. The Auto default is the spec's, declared on row 74 and decided in ADR-0015. The notice is left to the founder there |
| 7, 8 | The chip said "Working", and the panel said "Still working", during and after a hold | **Fixed.** Mutations R15, R16 |
| 9 | A person's pause at a due hold hid Next | **Fixed.** Announced as hers, with Next; their Resume is Run this step, and `continued` is filed. Red first. Mutation R03 |
| 10, 32 | The unavailable sentence was said twice, and "try again" could not work | **Fixed.** The warning is not copied into `message.warnings` (the note carries it), and the note says to switch to Auto, then Continue. Mutations R20, R21 |
| 11, 20, 27, 44 | Durations were hard-coded in the record | **Fixed.** `PAUSE_WORDS` and `AUTO_TIME_WORDS` (`shared/ana/run-policy.ts`) come from the constants, and a source pin forbids a literal minute count in `tool-trace.ts` and `turn-run-policy.ts`. Red first. Mutation R10 |
| 12, 30, 43 | The report had no Turn column and printed raw codes | **Fixed.** Mutation R12. The "unavailable ≠ none" half is handed to row 60 (see 42) |
| 13 | The copy left out Manual's endings and the docks under Auto | **Fixed.** The Manual and Auto descriptions, and the dock note under Auto. Mutation R31 |
| 14, 37 | Row 74's scope still said Ask/Agent "gets wired", and the lane sentence said "additive" for moves | **Fixed on row 74.** See "Lane disclosure" below |
| 19 | A person's expired pause was filed as AnA waiting | **Fixed**, in both the `not_run` reason and the warning. Red first. Mutations R08, R09 |
| 21 | The structural pin missed `turnPolicy`/`TurnPolicy` | **Fixed.** Shown red by R13 and O07 |
| 22 | Malformed holds were dropped in silence | **Fixed.** `policyHoldsUnreadable`, `<PolicyHolds unreadable>`, and the report metric. Red first. Mutation R11 |
| 24 | After `hold_expired` the strip said "Working" until the stream closed | **Fixed.** The expired hold is kept through `done` and `post_done`. The S4 hook test that pinned the clearing was inverted, which is justified: it pinned the defect. Mutations R14, O08 |
| 28 | Helpers were duplicated | **Fixed.** `shared/ana/run-policy.ts` holds `isAnaRunPolicy` (run-status, V2App, anaProgress), `POLICY_HOLD_OUTCOMES`/`isPolicyHoldOutcome` (tool-trace, the dossier), `stepLabels` (useAnaChat, anaProgress, tool-trace, anaWorkModel, the dossier), `MANUAL_UNAVAILABLE_TEXT` (the server warning and the client note), and `minutesWords`/`PAUSE_WORDS`/`AUTO_TIME_WORDS` (record and copy) |
| 29 | A demo under Auto lost 2 rounds | **Declared** on row 74 and above. `roundCap` is absolute by the spec |
| 31 | `loopStoppedReason` is assigned twice | **Declined, handed on.** The one-line form turns red `model-call-linkage.test.ts`, another lane's D6 pin (its regex). That lane widens its pin, then the two lines collapse |
| 34 | The hold was not announced, and its deadline was not shown | **Fixed.** Mutations R22, R23 |
| 35 | The red capture held wrong-reason failures (an S1 cold-import timeout, and its leak) | **Fixed.** The S1 case now has a 60 s budget, with the reason in the file. It is this lane's S1 test and nothing else changed. Red was re-recorded from scratch (`red.txt`), and the old `red-*.txt` files are removed |
| 36 | The dock-note gate was never seen red with its filed copy | **Fixed.** Re-recorded against HEAD (part B), plus mutations B21 and R31 |
| 38, 39, 41 | Colour-only checked state, motion, and Run this step not tied to its step | **Fixed.** Mutations R29, R30, R24 |
| 42 | A failed turn-record read reads as "no holds" | **Handed to row 60.** `loadTurnRecords` returns empty `reasoning`, `humanControls` and `policyHolds` alike on a read error. The fix is a dossier-wide `unavailable` flag in row 60's file. The malformed-entry half is fixed (22) |
| 45 | Non-S4 working-tree files were unnamed, and "commit the tree" could sweep them in | **Fixed.** See "Lane disclosure" |

## Deviations from the spec

- **The checkpoint moved into `turn-run-policy.ts` (`TurnPolicy`)** rather than
  being rebuilt inside `stream.ts`. `stream.ts` is 3,100 lines and its handler
  has complexity 226. Without a policy it is the stream's checkpoint as it was:
  `stream-run-hold.test.ts` (parity) and `live-drive-turn.test.ts` are green
  with unedited assertions.
- **The Auto stop decision is a pure `policyStopDirective`**, so the ceilings
  are unit-pinned.
- **A person's pause frame carries `reason: 'person'` only on policy turns.**
  With no policy it is byte-identical, which keeps the S3 parity suite.
- **The docks read the switch's context (`RunPolicyDockNote`)**, not
  `SurfaceViewProps.runPolicy`.
- **The early steer is filed `superseded`, not `redirected`**, and the
  post-hold consent check re-reads the row (`TurnPolicyRun.status`). Both come
  from the review, not the spec.
- **`PolicyHold.outcome` has three more values than the spec**: `superseded`,
  `stopped` and `disconnected` (review 1, 3, 17).
- **The chip says "Stopped" on an expired hold.** The strip beside it says
  "Stopped waiting for you".
- **Copy.** Manual drops "She asks before starting agents": no agent tool
  exists until S5. The dock note says "Here" rather than "In this editor".
- **`UseAnaChatReturn.runHold` and `turnRunPolicy` are optional**, for host
  stand-ins. The hook always sets them.
- **Test files are new siblings where the spec says "extend"**, as in S3.
- **Existing assertions changed**, each justified:
  - S1: `done` pinned `runPolicy: null` and now pins `runPolicy`; the reserved
    reasons were ignored and are now read; the cold-import case has a 60 s
    budget (review 35).
  - S4's own: the hook test that pinned clearing an expired hold on `done`
    (review 24); the Manual and Auto copy pins; "each option carries its
    description" (now `aria-describedby`); the dock note under Auto; the
    report's raw `continued` (now words); `turnStopWarning`'s Manual case (now
    given the expired hold it describes); `hold_unavailable`'s note.
- **`'halt'` is wired but unreachable in S4.** A second holder arrives with S5.

## Handed on

- **Row 74 (founder):** a one-time notice for users moved to Auto; bridging
  Manual into the three docks' own chats.
- **Row 60:** "unavailable ≠ none" for the dossier's turn-record fields
  (`loadTurnRecords`'s catch).
- **The D6 lane (`model-call-linkage.test.ts`):** widen the
  `loopStoppedReason` pin so `stream.ts`'s two lines can become one.
- **The Live Drive lane (`…01KZK3jg`):** `live-drive-turn.test.ts` onto
  `support/stream-route-harness.ts`.
- **S5:** the `run_agent` round-1 hold at the route; child holds on the shared
  `RunHold` (`'halt'` reachable); the Manual copy's agent sentence; the
  `MAX_AGENTS_PER_ROUND` clause; stream cases (7) and (8).
- **The live capture** (see Status).

## Lane disclosure

S4's files are the 43 that `tree.sha256` lists. **Commit S4 by explicit
pathspec**: those files, this evidence folder, the S4 row of
`docs/evidence/ANA-AGENTS/2026-09-27/README.md` and row 74 of
`docs/work-orders/README.md`. Never `git add -A`.

The shared checkout also holds another session's files, which are **not S4's**
and must not be committed with it:

- **Earlier.** `effort.ts`, `reasoning.ts`, `approved-models.ts`,
  `AnaToolExecutor.ts`, `cross-artifact-consistency.ts`,
  `regulatory-workspace-routes.ts`, `document-intake-tool-defs.ts`,
  `base-system-prompt.ts`, their tests, `shared/ana/dossier-consistency.ts`,
  `shared/utils/plural.ts` and the H1/H2 evidence. That session committed them
  itself (`03dea50b7`, `eea56da2c`, `39b3027cc`).
- **Modified or untracked when this was filed.**
  - `server/services/ai-gateway/gateway.ts` and the new
    `model-governance.ts`, with their tests, fixtures and support.
  - `ai-governance/approved-models.ts` and
    `approved-models-invariant.test.ts`.
  - `ana/AnaToolExecutor.ts`, `changePropagationTools.ts`,
    `reconciliationTools.ts` and `document-intake-tool-defs.ts`.
  - `intelligence/{consistency-verdict,cross-artifact-consistency}.ts`.
  - `lumen-context/base-system-prompt.ts`.
  - `reconciliation/{device-document,dossier-number}-reconciler.ts`.
  - Three `*-not-assessed` tests.
  - `shared/ana/dossier-consistency.ts` and `shared/utils/plural.ts`.
  - `docs/evidence/D4/2026-09-28-pq-rag-unblock-misdescribed/`.

None of these was touched or reverted here.

Inside another lane's 24h window at edit time (`git blame` at each hunk):

- **`stream.ts`, `V2App.tsx`, `useAnaChat.ts`** (`a75e38452`, `0ed213fec`,
  `01d91a130`; `…01KZK3jg`). The checkpoint hunk in `stream.ts` is a MOVE into
  `turn-run-policy.ts`; its `spliceQueued`, `settleMoves` and
  `consumeInterjections` lines are unchanged. Everything else is an addition
  away from their hunks.
- **`Shell.tsx`** (`04e784bc2`, `53237f620`; `…01PwLFr8`). The ~115-line strip
  was **MOVED** out to `AnaWorkSections.tsx`. Its lines blame to cold commits:
  `17da357f6`, `280211e62`, `a2ed06454` and `45748a8f5`, 2026-09-05 to 09-18. Added: the menu section, the pull label, and the `runHold` and
  `turnRunPolicy` props.
- **`ConversationThread.tsx`, `registryModel.ts`, `app-v2.css`,
  `EctdCoauthor.tsx`** (`04e784bc2`, `53237f620`; `…01PwLFr8`). Additions away
  from their hunks. `registryModel.ts` also changed Quick ask's `desc` line
  (`^462a6ca7a`, cold) (review 4).
- **`DocumentWorkbench.tsx`** (`e1ce55015`, `8a74ed559`, `59b0d8f9a`;
  `…01KiDof7`). One mounted line in the cold `c402dbb6b` composer block, plus
  an import.

Files claimed by active rows, and what changed in them:

- **Row 59.**
  - `AnaWorkSections.tsx` gained `RunControlStrip` (the strip moved in from
    `Shell.tsx`, ~220 lines).
  - `AnaActivity.tsx`'s `stoppedNoteText` (this lane's own S1 code) moved to
    `anaWorkModel.ts`, with a re-export.
  - `AnaActivity.tsx` gained `replacedSteps` and its note.
  - `useAnaChat*` and `anaProgress.ts` gained fields.
  - Row 59's owner is to be told when S4 lands.
- **Row 60.**
  - `post-processing.ts` gained fields.
  - `lineage-dossier.ts` gained `policyHolds` and `policyHoldsUnreadable`. The
    reader is in the new `lineage-dossier-holds.ts`, so row 60's file gains a
    field, not a reader.
  - In `lineage-dossier-xml.ts`, one call was added and one helper
    (`policyHoldsXml`).
