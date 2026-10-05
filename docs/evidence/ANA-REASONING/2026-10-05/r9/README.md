# The turn record says what each call was sent, and why the turn was high-stakes

Round 9 of the founder-directed AnA reasoning lane (founder, 2026-10-04:
*"Enhance the reasoning layer of ANA"*). Board row: "AnA's reasoning is checked
by an engine…" (`docs/work-orders/README.md`). This round closes MC-RL-8, RT-3
and TP-missed (medium) from round 1's map (`../../2026-10-04/map-findings.md`).

## What was wrong

- **The sealed turn record named only who served each call.** For each model
  call it kept the provider and the model, and nothing of what the call asked
  for. That record is what a reviewer verifies, and what `ana.turn.recorded`
  seals with a SHA-256.
- **It missed the four things the map names:**
  - the gateway `requestId`, which joins a call to its ledger row;
  - the effort and thinking config sent;
  - the tools offered;
  - the closing call's `toolChoice`.
- **Those now depend on the turn.**
  - Round 4: a high-stakes turn reasons harder and runs at `'high'` effort on
    every call.
  - Round 7: an open Module 2 summary makes a turn high-stakes, however it is
    worded.
  - Round 6: a follow-up is offered the tools its conversation used.

  So a reviewer could see that a turn reasoned, but not why it was
  high-stakes. Nor could they see whether it was offered the tool it needed,
  or which ledger row a call was.

## What changed

| Where | What |
|---|---|
| `server/services/ana/turn-record.ts` | **Schema `ana-turn-record/3`.**<br>Each `model.calls` entry adds:<br>• `requestId`: the gateway request, null when it is not reported;<br>• `sent`: the API effort, the thinking config with its budget, the tools offered by name (never their schemas), and the tool choice. Null where the door does not say.<br>The body adds `routing`: the risk tier, the task type and the kernel's own rationale (`planKernelExecution`'s `decisionRationale`), for example "Open section 2.7.4 is a CTD summary a reviewer reads as the application's account -> approved model required". It is null where the door does not hand its routing over.<br>`callSent()` reads `sent` from the request the stream built. |
| `server/routes/ana-ri/stream.ts` | **The stream fills those fields:**<br>• it hands the routing plan to the record as soon as the turn is planned;<br>• the first call records the effort, thinking config and tools it sent;<br>• each follow-up round records its own. The round's thinking is held in one variable that both the request and the record read, and the closing round's `toolChoice: 'none'` comes from the same condition that sends it.<br>A one-line helper (`roundSent`) keeps `callModel` at trunk's complexity. |
| Two pins | `turn-record.pglite.test.ts` and `post-processing-answer-check.test.ts:123` now expect the /3 shape. |

The route test holds the record to the request: each call's `requestId`,
effort, thinking and tool names are what the mock gateway received, call by
call (`stream-turn-record-sent.test.ts`).

## What it costs, and what it does not cover

- **Size.** Each call carries the names of the tools it was offered, up to 50,
  so a few hundred bytes to about 1.5 KB per call. The list is the same on
  every round of a turn today. It is still recorded per call, because the
  closing call differs and the record should not assume that the rounds agree.
  This is small beside the model input the record already holds.
- **Old records.** They keep `/2` and verify unchanged: the hash is over the
  stored text (`turn-record-verify.ts`).
- **What the stream asked for, not what the provider received.**
  - The gateway can still redact PII, adapt the request to a provider, or fall
    back to another model.
  - The served model was already on each call. The `requestId` now joins the
    call to the gateway's ledger row, which keeps the gateway's own account.
  - RT-missed stays open: the record's model input is taken before the
    gateway's PII redaction.
- **The loop doors are unchanged.**
  - `send-message.ts` and the realtime socket record through
    `turn-record-loop.ts`, which files no per-call entries and no routing.
  - Their records already carry a warning that says so.
  - `send-message.ts` is inside another lane's window (`ab582250e`), so it
    was not edited here.

## Proof

- **Red first.** `red.txt`: all six of round 9's tests fail against trunk's
  `turn-record.ts` and `stream.ts`. Trunk's copies are unchanged from
  `54a8da76a` to `f7973d225`.
- **Green.** `green.txt`: 178 tests in 22 files. That is round 9's two
  suites, every turn-record suite, every stream-route suite, every
  post-processing suite, and `deepening-tools`, on trunk `f7973d225`.
- **Related suites.** `related.txt`: 6,759 tests passing, on trunk
  `ddd5a0fd2`.
  - The one failing file is `deepening-tools` (board item 25). It is fixed on
    trunk by `e5cf44624`, which this round then merged, and it passes in
    `green.txt`.
  - Rounds 6 to 8's two other failing files pass here.
- **Mutants.** `mutants/summary.txt`: 11 of 11 killed. Each reverts one
  thing:
  - the request id;
  - what was sent;
  - the schema bump;
  - the routing;
  - tool names, reverted to whole definitions;
  - the thinking budget;
  - the closing tool choice;
  - the first call's record;
  - the follow-ups' record;
  - the routing hand-over;
  - the loop's record call dropping `sent`.
- **Lint.** `lint.txt`: `stream.ts` keeps trunk's 24 warnings, and the other
  files have none.
- **Types.** `tsc.txt`: the whole-tree typecheck, exit 0.

## Edits inside another lane's window

`stream.ts` had other lanes' commits within 24 hours (`e12ec645b`,
`ab582250e`, and the merge `3310d6c62`). This round changes five of its lines:

- four blamed 2026-09-26 (`fb40463a7`, `f7597c2c9`);
- one blamed to this lane's round 4 (`0446f2240`).

Everything else is added. None of those lanes' lines changed.

In `turn-record.ts`, the changed lines are blamed 2026-09-26 (`f7597c2c9`) or
to this lane's slice 1 (`a3775bcef`). The two pins change lines blamed
2026-09-26 and to slice 1.

## Not done here

- **The gateway's own account of a dispatch.** That is what was redacted and
  which provider the request went to. It belongs to the gateway lane. RT-missed
  is recorded on the map.
- **Routing and per-call entries for the loop doors.** They are inside other
  lanes' windows, and their records already say what they lack.
