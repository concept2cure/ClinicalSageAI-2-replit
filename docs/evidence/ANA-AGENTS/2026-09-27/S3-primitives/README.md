# S3: the primitives Manual/Auto and sub-agents stand on, with no behaviour change for a caller that does not opt in

**Row:** 74 in `docs/work-orders/README.md` (founder-directed 2026-09-27; it
moves no D-row and is recorded as the founder's exception to RULE 2).
**Slice:** S3 of the run-policy design ("primitives"). It adds no surface, no
tool, no model and no migration. **Session:** `…019ZvHmh`. **Recorded:**
2026-09-28, against HEAD `b50d45577` plus the S3 working tree (uncommitted when
filed; `tree.sha256` gives every file's hash).

## Status

The S3 gates are red against HEAD and green with S3. Every behaviour, and every
review fix, was also seen to fail under mutation, and so was each primitive made
too eager. Three things are **not** shown here:

- **No live capture.** S3 has no user-visible surface of its own. The lane's live
  capture is S7's two-agent stream, and this container has no database and no
  model key. The lane stays **blocked on its live capture**, as it was after S1.
- **Nothing calls the new primitives yet.** No caller passes `stopWhen`,
  `roundCap`, a `'replan'`, `allowedToolNames`, `onToolEvent`,
  `onModelResponse`, `toolConcurrency`, `toolModelCalls`, `agentDepth` or
  `ctx.modelCalls`, and nothing calls `holdForPerson`, `endHeldRun` or
  `resolveRoundBudget`. That is the point of the slice. S4 (Manual/Auto) and
  S5 (sub-agents) are the callers. Until they land, these are proven by unit,
  pglite and route-harness tests, not by a running turn.
- **`run_policy` does not exist yet.** No request field, no Manual hold, no
  `hold_expired` frame on the wire, no `MANUAL_UNAVAILABLE`. Those are S4.

## What S3 is, and why it changes nothing for today's callers

S3 builds the primitives S4 and S5 need. Each one is off unless a caller opts in:

| Primitive | Where | Off unless |
|---|---|---|
| `stopWhen(round)` → `'budget_exhausted'` / `'approval_timeout'` (a closing answer, no tools, named reason) or `'halt'` (no further model call, `cancelled`) | `agentic-loop.ts` | a caller passes `stopWhen` |
| `roundCap`: an absolute ceiling that progress extension and a rising `maxRoundsFloor` cannot pass | `agentic-loop.ts` | a caller passes `roundCap` |
| The checkpoint's second argument, `pending` (a frozen copy of the round's calls), and its `'replan'` directive (run none of them, answer each with `REDIRECTED_TOOL_RESULT`, call the model) | `agentic-loop.ts` | a checkpoint returns `'replan'` (the stream's never does) |
| `resolveRoundBudget(effort, runPolicy, base)`: today's pair without a policy or under Manual; Auto may run past the effort ceiling to `AUTO_MAX_ROUNDS` = 20, as an absolute cap, so a mid-turn demo promotion cannot reach 34 | `agentic-loop.ts`, `run-control-limits.ts` | a caller calls it (nobody does) |
| `executeAgenticLoop` options: `allowedToolNames` (others answered `TOOL_NOT_OFFERED`, nothing run), `onToolEvent` (start/end inside the worker), `onModelResponse`, `stopWhen`, `toolConcurrency`, `toolModelCalls: 'refuse'` | `AnaToolExecutor.ts`, new `agentic-tool-dispatch.ts` | a caller passes them |
| `createRunHold`: the stream's while-paused loop, **moved** (not copied) into a turn-wide hold that several waiters can share, with expiry `'resume'` (today) or `'end'` (Manual, S4) | new `run-hold.ts`; `stream.ts` calls it | — (the move itself is behaviour-preserving; `'end'` is off unless asked) |
| `holdForPerson` (running→paused) and `endHeldRun` (paused→finished, `hold_expired`), server writers with no control event | `run-control.ts` | a caller calls them (nobody does) |
| The model-call refusal scope and the `gateway.route()` refusal (`SubAgentToolModelCallError`, a terminal `GatewayPolicyError`, thrown right after the pre-call abort check, before anything is spent) | new `model-call-scope.ts`, `gateway.ts` | something opens a scope (only `toolModelCalls`/`ctx.modelCalls` do) |
| Wrapper rule 0: at `ctx.agentDepth >= 1`, any tool the register does not class `read` is refused `SUB_AGENT_READ_ONLY`, before rules 1–3, so no proposal is ever built | `AnaToolExecutor.ts` `preHandlerRefusal` | `agentDepth` is set (nothing sets it) |
| `project_knowledge_search` model-free mode: strategy `'basic'`, no rerank | `AnaToolExecutor.ts` | `ctx.modelCalls === 'refuse'` or a refusal scope is in force |

**The proof that nothing changed for a caller that did not opt in** (`green.txt`):

- No existing test file was edited. `git diff` lists source files only, and all
  nine gates are new sibling files.
- The 179 neighbour suites were run at HEAD before any S3 edit: 178 passed and 1
  skipped (2978 tests passed, 2 skipped). On the final tree they give the same
  result, file for file. The per-file count of passing plus skipped tests
  differs from HEAD's only by the nine new files. The neighbours include every
  existing agentic-loop, executor-loop, run-control (the pglite suite
  included), run-status, gateway (all 35 ai-gateway suites) and
  cross-artifact suite, every `stream.ts` reader, and `live-drive-turn`, which
  was not touched.
- `stream-run-hold.test.ts` is a parity suite. It drives the real route through
  pause, resume, cancel and abandoned-pause, and it passes on HEAD's
  `stream.ts` and on the moved one (red.txt part A; green.txt).
- HEAD's while-paused loop, moved verbatim into the `createRunHold` shape,
  passes every expiry-`'resume'` case in `run-hold.test.ts` (red.txt part B).
  Those cases are therefore today's behaviour. What fails there is only what
  HEAD never had.
- Overcorrections are red (mutations.txt, O01–O12). A primitive applied to
  callers that did not opt in turns a pre-S3 suite red:
  - `stopWhen` defaulting to a budget stop: `agentic-loop.test.ts`,
    `agentic-loop-rounds.test.ts`;
  - `'continue'` read as `'replan'`: the same two suites;
  - an allowlist applied when none was given: `executor-agentic-loop.test.ts`;
  - `route()` refusing without a scope: `gateway.test.ts`,
    `gateway-abort.test.ts`;
  - rule 0 at depth 0: `tool-authorization-enforcement.test.ts`,
    `governed-write-gate.test.ts`.

  The other seven are caught only by S3's own inert-parity cases, and the
  mutations file says which. The pre-S3 suites do not pin that a default cap,
  scope, concurrency, context flag or model-free mode stays absent.

**What does change, on purpose:**

1. **`check_dossier_consistency` no longer turns a database error into a pass.**
   At HEAD, `checkDossierConsistency`'s catch returned the empty report, whose
   verdict is `'clean'`. The tool then told the model *"No consistency issues
   detected against the existing dossier"* when nothing had been read. The
   engine now marks the report `unavailable: 'artifacts_unreadable'`, and the
   tool answers `{error: 'The project documents could not be read, so nothing
   was compared.', unavailable: true}`. This affects the parent path too. The
   spec intends that (its risk list, "The check_dossier_consistency engine fix
   changes the parent path too").
2. **`executeAgenticLoop`'s result carries `loop`** (rounds, tool calls,
   stopped reason, extension). `stoppedReason` reads `cancelled` whenever the
   signal aborted. The field is additive. The four callers (`send-message`,
   `ana-intelligence`, `ana-realtime`, `deep-investigation`) read named fields
   only, and `recordLoopTurn` reads `content`, `thinking`, `model` and
   `provider`.
3. **Cost, not behaviour:** when a checkpoint is present (the stream's turns
   with a run row), each round's pending calls are copied and frozen for it,
   one `structuredClone` of each call's input. The stream's checkpoint ignores
   the copy.

## The change

**Server**

- `agentic-loop.ts`:
  - `LoopCheckpoint(upcomingRound, pending)` may return `'replan'`. `pending`
    is a frozen copy: the list and each call are frozen, and each input is its
    own clone. A hook can read the step but cannot change what runs (review
    [9]).
  - Adds `LoopStopDirective`, and `AgenticLoopOptions.stopWhen(round)` and
    `roundCap`. `StoppedReason` gains `budget_exhausted` and
    `approval_timeout`.
  - Adds `REDIRECTED_TOOL_RESULT` and `RoundBudget` + `resolveRoundBudget`.
  - `runAgenticToolLoop` is split into `loopLimits`, `scanRound`, `takeRound`
    and `afterRound`. Its complexity-22 warning is gone, and the ratchet shows
    −1.
  - `'halt'` is documented as leaving the last round's tool calls unanswered
    in a transcript built from model calls alone (review [12]).
- `AnaToolExecutor.ts`:
  - `ToolContext.agentDepth?` and `modelCalls?` sit beside `humanConfirmed`.
  - Rule 0 comes first in `preHandlerRefusal`.
  - `AgenticOptions` gains the six options, and `AgenticLoopResponse` is added.
  - `subAgentLoopOptions` makes either model-free switch give both: the scope
    for the gateway and `ctx.modelCalls` for the tool (review [5]/[15]). It
    also validates `toolConcurrency` before the first model call (review [10])
    and contains `onModelResponse`.
  - An unknown-tool answer lists only the offered tools when an allowlist is
    set (review [11]).
  - `check_dossier_consistency` returns an error when the report is
    unavailable.
  - `project_knowledge_search` goes model-free under `ctx.modelCalls` or the
    scope.
- `agentic-tool-dispatch.ts` (new):
  - `dispatchLoopCall` applies the allowlist, then `onToolEvent` start/end
    with the latency inside the worker, then the refusal-scope wrap.
  - It also holds `toolNotOfferedResult`, `notifyObserver` (an observer that
    throws is logged, and the loop carries on) and `resolveToolConcurrency`.
- `run-hold.ts` (new): `createRunHold`, the moved loop with:
  - one shared pause clock, closed when the run leaves `paused`, or by the last
    waiter to leave in any way (review [1]/[17]);
  - one paused/resumed frame pair, and `heldMs` as the union of held time;
  - a stale-read guard, and a race with each waiter's own signal;
  - expiry `'resume'` or `'end'` (discriminated deps), `expiredSignal` and the
    `hold_expired` frame;
  - a failed wake or a failed end write thrown, not read as an answer (review
    [2], [18]).
- `stream.ts`:
  - The while-paused block and `let pauseAnnounced` are removed. That is the
    MOVE.
  - `streamRunHold()` wires the hold to the run row. One hold per turn is
    created right after `emitControl`.
  - The checkpoint calls `runHold.hold(upcomingRound)` and aborts on
    `held === 'cancelled'`, as it aborted on `status === 'cancelled'`.
- `run-control.ts`: `holdForPerson` and `endHeldRun`, added after
  `resumeAbandonedRun`. `endHeldRun` throws a failed write (documented; see
  review [18]).
- `model-call-scope.ts` (new): the `AsyncLocalStorage` scope. Its header says
  what it covers and what it does not: gateway-routed generation only, not the
  baselined bypass files (review [6]). It also records the capture hazard
  (review [4]/[7]).
- `gateway.ts`: the `route()` refusal, and `SubAgentToolModelCallError`.
- `cross-artifact-consistency.ts`: `unavailable?: 'artifacts_unreadable'`, the
  catch, and a dated header note.
- `shared/ana/run-control-limits.ts`: `ANA_RUN_POLICIES`, `AnaRunPolicy` and
  `AUTO_MAX_ROUNDS` only.
- `run-status.ts`: one comment line.

**Client:** none. **Migration:** none.

## Proof

| Stage | File | Result |
|---|---|---|
| **A.** The nine S3 test files **as they are in the tree**, against HEAD's source for all eight S3-modified files. Stubbed, do-nothing, only what HEAD lacks: the two new modules the tests import (`run-hold.ts`, `model-call-scope.ts`), `REDIRECTED_TOOL_RESULT`/`resolveRoundBudget`, `holdForPerson`/`endHeldRun` | `red.txt` part A | 91 failed / 36 passed (127), 8 of 9 files. Every failure is an assertion on the missing behaviour, none an import error. The 9th file is the stream parity suite, 4/4 by design |
| **B.** `run-hold.test.ts` against HEAD's while-paused loop moved **verbatim** (the file is reproduced in `red.txt`) | `red.txt` part B | 13 failed / 12 passed. Every expiry-`'resume'` case passes, and so does the failed-wake case (HEAD threw too). The 13 are the shared-hold behaviour HEAD never had |
| **C.** The review-fix gates against the S3 build **before** each review fix | `red.txt` part C | run-hold 4/25 red; agentic-loop 1/30 red; executor + `project_knowledge_search` 9/25 red. Each failure is the objection it pins |
| With S3 | `green.txt` | 188 files: 187 passed, 1 skipped (pre-existing python-docx e2e). 3105 passed + 2 skipped. The nine S3 files have 127 tests: rounds-control 30, executor options 23, model-call-scope 12, rule 0 16, run-hold 25, writers (pglite) 10, stream parity 4, cross-artifact 4, `project_knowledge_search` 3 |
| Unchanged suites | `green.txt` | The 179 pre-existing files give exactly HEAD's per-file counts (2978 + 2 skipped) |
| Mutations of the finished tree | `mutations.txt` | **67/67 red**, every file restored with a matching sha256, and the whole tree's hash identical before and after. 55 cover S3 behaviour and the review fixes. 12 are overcorrections: 5 turn a pre-S3 suite red, 7 are caught by S3's inert-parity cases |
| `npx tsc --noEmit -p .` (final tree) | `green.txt` | exit 0, 0 errors |
| `npm run ci:pushed-lint-warnings` (`--since b50d45577`) | `green.txt` | exit 0. 8 lintable files changed. Net −1: `agentic-loop.ts` 1→0. No file gained a warning |
| `npx eslint --format json` on the 12 new files | `green.txt` | exit 0. All 12 were linted (none ignored): 0 errors, 0 warnings |
| `ci:gateway-bypass`, `ci:ai-tenant-binding` | `green.txt` | exit 0 each |
| `ci:duplicate-exported-types` | — | Fails at HEAD without S3 on `DocumentProvenance` and `EligibilityAssessment`. None of the flagged names are S3's. Handed on |

## Review follow-through

| # | Objection | Disposition |
|---|---|---|
| 1, 17 | A waiter leaving by its own signal or a disconnect left the shared pause open, so `heldMs` grew with nobody holding and the next hold started at its deadline | **Fixed.** The last waiter out closes the pause, however it left: signal, disconnect or error. A waiter leaving while others still wait does not. Red first (C). Mutations H08, plus O10 for the overcorrection "every leaver closes it" |
| 2 | A rejected wake was read as a wake, where HEAD's `await runHandle.wake()` threw | **Fixed, for exact parity.** The rejection is thrown out of the hold. Red first (C). The case passes on the verbatim move (B). Mutation H09 |
| 3, 8, 16 | `check_dossier_consistency` still says "No consistency issues detected" when nothing was compared (`projectId <= 0`, a draft under 100 chars, no facts and no section, zero related artifacts) | **Declined for S3, handed on.** The spec defines only the catch fix, and S3 may not change the parent path beyond it. The early returns are `cross-artifact-consistency.ts:258-262` (`emptyReport`, `artifactsCompared: 0`), and the recommendation is at `AnaToolExecutor.ts:5866-5867`. The payload does carry `artifactsCompared: 0` and `draftFactsExtracted: 0` beside the verdict. The spec's S5 reader counts a check only when both are above 0 |
| 4, 7 | The refusal scope is `AsyncLocalStorage`, so a long-lived resource first started inside it keeps it (fail closed for everyone), and work handed to another context loses it. No gate interleaved scoped and unscoped calls | **Gated and documented; the audit is handed on.** New gate: three calls in flight at once (scoped, unscoped, scoped after a timer) each see only their own caller's scope. Mutation G03 (a module global instead of ALS) turns it red. Two cases pin the hazard itself: a timer armed inside the scope, and a memoized promise created inside it. The header states the hazard beside the run-control tenant-ALS note. Nothing reachable from a sub-agent's tools arms such a resource today. S5 audits its allowlist |
| 5, 15 | `ctx.modelCalls` and `toolModelCalls` were two independent switches for one fact | **Fixed.** In `executeAgenticLoop` either switch gives both: the scope, which the gateway enforces, and `ctx.modelCalls`, which the tool reads. `project_knowledge_search` also reads the scope directly, so a handler called under a scope outside the loop goes model-free too. The spec's `ToolContext.modelCalls` is kept, because S5's child context sets it. Red first (C). Mutations E13, E14, P02, and O07 for "every tool told refuse" |
| 6 | The scope header claimed "model-free" is true at run time. It covers `route()` only | **Fixed (header).** It now says: every gateway-routed generation, and only those. It names the baselined bypasses it does not stop (`rag-reranker.ts`'s cross-encoder, `LiteLLMAdapter`, the `anthropic-client`/`openai-client` factories). Guarding those chokepoints, or pinning the allowlist off them, is handed to S5 |
| 9 | The checkpoint got the loop's live pending array | **Fixed.** A frozen copy (the list and the calls frozen, the inputs cloned). Red first (C). Mutations A07 and A08 |
| 10 | `onToolEvent`/`onModelResponse` throwing would reject the loop after a tool ran or tokens were spent. `toolConcurrency` 0 or NaN failed late or ran nothing | **Fixed.** Observers are contained: logged, and the loop goes on. `toolConcurrency` must be a whole number ≥ 1, else a `RangeError` before the first model call. Red first (C). Mutations E07 and E11, and O06 for the overcorrection "default 2" |
| 11 | An offered but unregistered tool's answer listed every registered tool | **Fixed.** Under an allowlist, `availableTools` is the offered tools that are registered. Without one it is unchanged, and a case pins that. Red first (C). Mutation E04 |
| 12 | `'halt'` drops the results of a round that ran, leaving `tool_use` without `tool_result` in a transcript made from model calls | **Declined as a behaviour change; documented.** The spec's objection [7] puts `'halt'` after `executeTools` on purpose: an expiry that happens while the round's agents wait is what it answers, so the tools have run. Their results reach `executeTools`' caller (the stream records them), as after a checkpoint `'abort'`. The `LoopStopDirective` doc says so, and says a transcript-keeping caller takes the results from `executeTools` |
| 13 | The `stream.ts` lane disclosure named only `a75e38452` | **Fixed here and on row 74.** In `stream.ts`'s 24h window, other-lane commits are `a75e38452` and `0ed213fec` (both `…01KZK3jg`). `b4cd68746` and `85cb5654b` are this lane's own S2 and S1. See "Lane disclosure" |
| 14 | An executor gate waited on a 10 ms sleep | **Fixed.** The handlers resolve a promise once both have started, so no clock is involved |
| 18 | `endHeldRun` throws a failed write where `resumeAbandonedRun` logs it | **Decided: it throws, and that is pinned.** A `false` would read as "a Continue landed first" and keep a turn waiting that nobody may come back to, with its row in an unknown state. The doc comment says so. The pglite file pins it with a failing pool. `run-hold` throws it out of the hold, does not mark the turn expired, and closes the pause (red first, C). Mutations W05 and H10 |

## Deviations from the spec

- `createRunHold` lives in the new `run-hold.ts`, not `run-control.ts`. The
  stream-route harnesses mock `run-control.js` with explicit factories.
  `live-drive-turn.test.ts` (another lane's, hot) passes only `readMoveId`
  through, so a `run-control` export would break every live-drive turn in that
  suite. `run-control.ts` is also already over `max-lines`. It is still a MOVE:
  `stream.ts` has no wait loop left. `holdForPerson` and `endHeldRun` are in
  `run-control.ts`, because they need `driveLocalRun` and `notifyAndDrive`.
- `SubAgentToolModelCallError` is in `gateway.ts` beside `ModelNotApprovedError`.
  In `model-call-scope.ts` it would form an ESM cycle with `gateway.ts`.
- `RunHoldDeps` is a discriminated union: `'resume'` requires
  `resumeAbandoned`, and `'end'` requires `endHeld`. So `'end'` cannot resume,
  which would be "Manual silently becomes Auto".
- Expiry `'end'` and the `hold_expired` frame are built, because the run-hold
  gate needs them, and are inert: the stream passes `'resume'` and no
  `announce`. Its frames are byte-identical: `{type:'paused',round}` and
  `{type:'resumed',round}`.
- `stopWhen` receives the round number. The spec's form took no argument, and
  zero-argument callers are unaffected.
- `executeAgenticLoop` returns `{...finalResponse, loop}`, not a mutated
  gateway object.
- `runAgenticToolLoop` was split into helpers. Adding the options took its
  complexity from 22 to 29.
- An unavailable consistency report keeps verdict `'clean'`, as the spec says,
  and the field says the verdict means nothing. The only consumer returns an
  error.
- Every gate is a new sibling file. That keeps the unchanged-suite proof exact
  and stays out of hot or oversized files.
- `stream-run-hold.test.ts` is added, though the spec does not list it. It
  copies the part of `live-drive-turn.test.ts`'s mock harness it needs, until
  the `support/stream-route-harness.ts` extraction can touch that file.
- Review-driven, beyond the spec's text:
  - either model-free switch gives both, and the tool also reads the scope;
  - `pending` is a frozen copy;
  - observers are contained, and `toolConcurrency` is validated;
  - the last waiter closes the pause, and a failed wake or end write is
    thrown;
  - `endHeldRun` propagates a failed write.

## Handed on (row 74, later slices, or the owning lane)

- **S4 (Manual/Auto) wiring.** In `streamRunHold`, pass `expiry: runPolicy ===
  'manual' ? 'end' : 'resume'` with `endHeld: () => endHeldRun(getPool(),
  runId)`. At the checkpoint, call `holdForPerson` and pass `announce: {reason,
  next}`, and return `'replan'` for a steer during a Manual hold. Pass
  `stopWhen` and `resolveRoundBudget(effortUsed, runPolicy, demoBase)` to the
  loop. When `'halt'` ends a turn, record the round's results from
  `executeTools` (review [12]).
- **S5 (sub-agents):**
  - Set `agentDepth: 1` on the child context.
  - Set `toolModelCalls: 'refuse'` on the child loop, or `ctx.modelCalls`;
    either now gives both.
  - Harness checks that call a handler directly must run inside
    `runRefusingModelCalls`.
  - Map `SubAgentToolModelCallError` through `isTerminalGatewayError`.
  - Audit `RESEARCH_TOOLS` for resources started lazily inside the scope
    (review [4]/[7]) and for gateway-bypass egress (review [6]). Either guard
    the bypass chokepoints with `modelCallRefusal()` or pin the allowlist off
    them.
- **The lost-input guard** in `executeAgenticLoop` (carry `inputParseError`;
  answer `lostToolInputResult` without dispatch). The spec lists it in S1, and
  S1 did not build it. It changes tool dispatch for the non-SSE doors on
  truncated OpenAI arguments, so it needs its own red test and a declared
  behaviour change. S5 needs it for child loops.
- **`check_dossier_consistency` with nothing compared** (review [3]/[8]/[16]):
  - return `not_applicable` with honest copy for the early returns and for zero
    related artifacts, with one red test per return;
  - this is a parent-path behaviour change for the tool's owner, or for S5
    alongside its reader.
- **The `support/stream-route-harness.ts` extraction.** Do it once
  `live-drive-turn.test.ts` leaves the Live Drive lane's window. Then migrate
  that file and `stream-run-hold.test.ts` onto it, which removes the duplicated
  mock block.
- **`ci:duplicate-exported-types`** fails at HEAD, and the names are not
  this lane's.

## Lane disclosure

The S3 files are:

- source: `agentic-loop.ts`, `AnaToolExecutor.ts`, `gateway.ts`, `stream.ts`,
  `run-control.ts`, `run-status.ts` (comment), `cross-artifact-consistency.ts`,
  `shared/ana/run-control-limits.ts`;
- new source: `run-hold.ts`, `model-call-scope.ts`, `agentic-tool-dispatch.ts`;
- tests (all new): the nine files in `tree.sha256`.

Four files were inside another lane's 24h window at edit time. Each was checked
with `git log -5 --date=iso` and `git log --since` 24h, and every insertion
point with `git blame`:

- **`stream.ts`**: `a75e38452` (Live Drive) and `0ed213fec` (D2), both session
  `…01KZK3jg`. `0ed213fec`'s lines are now 125, 1020–1022 and 1052–1055, far
  from S3's hunks. `a75e38452`'s lines around the checkpoint are now 2617–2695
  (`spliceQueued`, the `consumeInterjections` drain) and 2711–2714. S3 changed
  none of them. What S3 did change:
  - the named MOVE: HEAD's while-paused block (blamed `45748a8f5`/`^20accce74`)
    and `let pauseAnnounced` are removed; the checkpoint's guard (now 2697),
    the hold call (2706–2709) and `held === 'cancelled'` (2716) replace them;
  - the additive cold insertions: the import (176), `streamRunHold` (284–310,
    between `heldToolContext` and `mountStreamRoute`), and the per-turn hold
    after `emitControl` (1744–1747).

  `b4cd68746` and `85cb5654b` in the same window are this lane's own S2 and
  S1.
- **`run-control.ts`**: `a75e38452` (`…01KZK3jg`). Additive only:
  `holdForPerson` and `endHeldRun` after `resumeAbandonedRun`, whose lines blame
  `45748a8f5`/`3f690dba2`/`2207ead96`.
- **`gateway.ts`**: `a75e38452` (`…01KZK3jg`). `b4efbe63c` in the window is this
  lane's own SG. Three cold insertions: the import (78), the `route()` check
  after the pre-call abort (1327–1337), and the error class after
  `ModelNotApprovedError` (4108–4122).
- **`AnaToolExecutor.ts`**: `a75e38452` and `0ed213fec` (`…01KZK3jg`), and
  `e2d36a2b1`, `41e7c539f` and `9d2134b52` (`…01KiDof7`). Every S3 hunk sits
  at lines blamed to older commits:
  - the imports (after `^17da357f6` lines 186–187);
  - `ToolContext` (after `humanConfirmed`, `69f93d988`);
  - `preHandlerRefusal` (`69f93d988`);
  - `project_knowledge_search` (`^17da357f6`);
  - `check_dossier_consistency` (`^17da357f6`);
  - the `executeAgenticLoop` region (`^17da357f6`, `7fb34e661`, `9cd48abe7`).

`run-status.ts` changed in the window only by this lane's own S1. `agentic-loop.ts`,
`cross-artifact-consistency.ts` and `run-control-limits.ts` are cold.
`live-drive-turn.test.ts`, `run-control.pglite.integration.test.ts` and
`tool-authorization-enforcement.test.ts` are untouched. No client file and no
migration changed.

## Re-run by the lane before commit (2026-09-28)

- `npx tsc --noEmit`: exit 0.
- The nine S3 test files plus the pre-existing agentic-loop, executor loop,
  gateway, gateway-abort, tool-authorization and ana-ri route suites: 29 files,
  410/410 passed. `git diff --name-only` lists no test file.
- `ci:pushed-lint-warnings`: net −1.
- Independent sabotage: `modelCallRefusal()` returning `null` always turned
  11 tests red across `model-call-scope` and `executor-agentic-loop-options`;
  restored and sha256 re-checked.
