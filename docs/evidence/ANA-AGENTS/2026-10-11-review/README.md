# The review of the sub-agent stream hosting, and the four defects it found (row 74)

`1d19566c` made sub-agents reachable. It was then reviewed by four independent
lenses over the diff — tenant isolation and authority, honest surfaces,
ordinary correctness, and the Part 11 record.

**What the verification actually covered, plainly.** Each finding was to be
handed to a separate reader whose job was to refute it. The account's usage
limit was reached part-way: of 33 readers, 13 finished and **20 failed with
"You've hit your session limit"**. So two findings carry an independent
verdict, and the rest were acted on, or disclosed, on the strength of the
reviewing agent's own quoted evidence — which for the three majors below
included code it executed. Nothing here was confirmed by a vote it did not
get, and no finding was dismissed for lack of one.

The five security claims the change rests on were attacked and **held**: a host
is lent only on a turn whose run row belongs to the request's organisation;
nothing of the parent's authority reaches a child; a child's ledger rows can
never name another organisation's run; the retired route's authority is not
re-created; and the new code cannot be reached with no tenant scope.

Four defects were real. Three were in the code this lane wrote, and all three
are the same kind of fault the repo's own rules name — an error rendered as a
good result, and a record that credits a person with something they did not do.

## 1. A child's failed or refused read was recorded as a good step (major)

**What was wrong.** A handler that cannot do the thing *returns* `{error}`; it
does not throw. The dispatch sets `errorMessage` only for a throw, a tool that
was not offered, or lost input. The runner judged a step by that flag alone:

```ts
const ok = !e.errorMessage;        // sub-agent.ts, before
```

So a failed Vault read, a read of an artifact in another organisation
(`PROGRAM_NOT_IN_ORGANIZATION`), a launch-scope refusal — each was stored
`ok: true`. Consequences, all of them wrong in the same direction:

- `agentEvidenceEntries` kept the refusal as "a successful tool result, as the
  child read it", so the answer check reported `basis: 'sources'` and the
  person's panel read **"Checked against: read_vault_document"** for a read
  that failed. With nothing consulted it would have said "No source consulted
  this turn";
- the parent model read `ok: true` for the same step;
- `agentProvenance` scanned it.

The parent's own path has always demoted these with `refusalOf` — "the one
judgment of a refusal". Only the child path ignored it.

**Fix.** `ok = !e.errorMessage && refusalOf(e.result ?? '') === null`, using
that same canonical judgment. Red first: `sub-agent.test.ts` "a refused read is
recorded not-ok, and is not evidence for the answer" failed with
`expected true to be false`, with a control for a real result.

## 2. A child's own gateway calls were attributed to the parent (major)

**What was wrong.** A child's tools embed their queries, and an embedding
carries no run id of its own — the gateway reads the ambient run scope. The
child ran inside the **parent's** scope, because `runSubAgent` opened none, so
every embedding an agent caused was ledgered as the parent's own with no parent
link. A ledger read by `parent_run_id` — which ADR-0015 §2 requires before
production — would have missed all of them, and "which agent caused this
embedding" answered the parent.

**Fix.** The child loop runs inside `runWithRunScope({ runId, parentRunId })`.
`RunScope` already carried `parentRunId` and nothing had set it. Red first: the
scope a child's tool saw was `undefined`.

## 3. An expired pause was recorded as the person's Stop (major)

**What was wrong.** Under Manual a person can pause a run while an agent is
working and not come back; the hold then expires and ends the turn. The agent's
own result said so, but mechanically that is `cancelled`, and the one place
step sentences are written says of `cancelled`:

> You stopped running an agent before it finished.

That sentence went into the live frame, the Summary row, the persisted trace
and the retained turn record. The person was credited, in the record, with an
act they never performed — while the same record's stop line said the run had
been paused and nobody resumed it.

**Fix.** The shaped result now names it (`endedBy: 'hold_expired'`) instead of
only describing it in prose; `finishedStep` reads it, and a cancelled step with
a stated reason says *"Running an agent was ended because the run stayed paused
past its limit."* A person's actual Stop still reads as theirs — pinned by a
control.

## 4. A flaky test of my own (minor, fixed at its cause)

`sub-agent-verifiers.test.ts`'s first case calls `getToolHandler`, which pulls
in the whole 21k-line executor. That takes about 10 s on this 4-CPU box —
exactly the default per-test timeout — so under load whichever case ran first
failed. The import is now paid once in `beforeAll` with a stated timeout, and
attributed to what actually costs it. (Measured: 10.6 s at load 2.7.)

## Wording the review was right to call out

- A failure *after* the agent had done work read "did not run". The shaped
  failure now carries `started`, and the summary says **"did not finish"** —
  the line reaches both the person's row and the next turn's context, so the
  word is read twice.
- A stop that was not a budget (a step it kept repeating) produced a bare
  "incomplete" with the reason only in prose the row does not show. The summary
  now names it.
- A verify verdict travelled as a bare enum: `no_issues_found` read the same
  whether one check or three had compared anything. It now carries
  **"(2 of 3 checks compared anything)"**.
- An agent aborted at the hard time limit with no report at all was told it
  "may be incomplete … use what it found". It now says it stopped **before it
  reported anything**.
- Two doc comments said `'incomplete'` means "stopped at one of its budgets",
  which a thrash stop is not.

## The two findings that did get an independent verdict

Both were **confirmed**, and both are about a cut-short agent being rounded to
something simpler than the truth.

1. **The ledger said a cut-short agent plainly succeeded.** `logToolRun` was
   given `'success'` for an `'incomplete'` step, so `chat_tool_runs` disagreed
   with the turn record the person can open, and nobody querying the ledger
   could find which agent runs were cut short. **Fixed here:** the ledger gets
   the real outcome. `toolRegistry.ts` already records that the column is free
   text and that it was widened for `'cancelled'` on exactly this reasoning —
   "a stopped step recorded as an error would misreport why".
2. **The client counts and draws a budget-stopped agent as a failure** (see
   below). The verifier also corrected two of the reporting agent's
   sub-claims: `tallyTools` is unreachable (nothing but its own test calls it),
   and the client surfaces do not disagree with each other — they collapse it
   the same way, so it is one uniform overstatement rather than an
   inconsistency. Severity was lowered to minor because the feature is off in
   production and the accurate sentence sits on the same row.

## Accepted and disclosed rather than fixed here

- **DP-87, the child rate sub-bucket (ADR-0015 §5) is not built.** The S5c
  evidence named only the S7 capture as the prerequisite for production; that
  was an overclaim and is corrected. A worst-case turn is 42 child calls on the
  organisation's own 100-per-minute bucket, so a burst can land a refusal on
  the parent's next round and on colleagues in the same organisation.
- **The client counts a budget-stopped agent as a failure**, and a `run_agent`
  step's source reads "Project" whatever the child read. Both are S6's surface
  and both are now written down in the S5c evidence.

## Verification of this change

- `red-review-findings.txt`: findings 1 and 2 reproduced on the committed code
  before the fix.
- Green: `sub-agent.test.ts` (36), `sub-agent-hostable.test.ts` (13),
  `sub-agent-verifiers.test.ts` (32), `stream-run-agent.test.ts` (15),
  `stream-run-agent-real.test.ts` (1), `step-presentation.test.ts`.
- `npx tsc --noEmit`: 0 errors.

## A pre-existing failure on trunk, found by the regression and handed on

`server/services/ana/__tests__/batch-draft-sections.test.ts` fails 6 of its
cases on trunk (`Cannot read properties of undefined (reading '0')` ×4,
`expected 'failed' to be 'partial'`, `expected 3 to be 2`).

It is **not** this lane's. The test was last updated on 2026-10-06
(`05b5bd06`); `server/services/ana/AnaDocumentDraftingService.ts`, which it
mocks and whose result shape it reads, was changed on 2026-10-09 by
`b4badf56` ("Add twelve exact CMC leaves and section-scoped optional
caller-declared product context"), whose own message records verifying "1,965
selected regressions" — a selection that did not include this suite. Neither
`1d19566c` nor the fixes above touch that service, its catalog scope, the
document-catalog service, or the `batch_draft_sections` handler. Reproduced
with this change stashed, which fails identically.

Handed to the owner of `b4badf56`: either the service's result shape changed
and the test is right, or the test is stale — only that lane can say which,
and guessing would risk writing the test to match a regression.

## The whole AnA service suite, measured

`server/services/ana` in full: **380 of 383 files pass (6,336 tests)**. The
failures are the 6 above, plus — in that run, which predates these fixes — the
two cases this change was written to make pass.
