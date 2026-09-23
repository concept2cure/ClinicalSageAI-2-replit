# Model governance for high-risk drafting — 2026-09-23

**Row moved:** D4, the owed item "a PQ-passed provider for the model step", and
the DoD rule it serves: *only PQ-passed models serve high-risk regulatory
drafting.*

**State after this session: D4 is not green, and neither is its PQ item.** No
PQ has passed. The PQ can now be **executed**, and a "passed" claim is now
**checked** against the run it cites. The rule it feeds is enforced at every
place this session found where model output becomes a governed record. What PQ
still needs is listed at the end. Every item there is an owner decision or an
input this environment does not have.

Yesterday's record is `../2026-09-22/README.md`. It covers the approved-models
registry as data and the gateway's enforcement at all five selection points.

---

## 1. A regression I shipped, and its fix — `570ca18a1`

`a6801c9f2` (2026-09-22) refused every **Balanced** and **Fast** turn in AnA. The
kernel router labels every `/ana-ri` turn `regulatory_review`. Those effort
tiers pin Sonnet or Haiku explicitly, so the new explicit-request refusal fired
on ordinary conversation.

The fix gives the gateway the risk it could not see. `GatewayRequest.riskTier`
is set by the router (`routingPlan.riskTier`) on every request the stream and
`/api/chat` make. `isHighRiskRequest(taskType, riskTier)` reads it:
`document_drafting` is always high risk, and `regulatory_review` is high unless
the caller declares it low or medium. A turn that asks for governed drafting is
escalated to `high` by the router (`requestsGovernedDraft`), and `high` resolves
to the flagship tier whatever the effort setting. Pinned by the AnA regression
block in `server/services/ai-gateway/__tests__/high-risk-model-approval.test.ts`
and a source pin that fails if either route stops passing `riskTier`.

## 2. The PQ can be executed — `282c66887`

- `server/eval/pq/pq-protocol.json`: PQ-DRAFT-001, **status `draft`** until an
  owner approves it. A draft protocol cannot produce PASS.
- `server/eval/pq/pq-verdict.ts`: a pure verdict (NOT_EXECUTED / INCOMPLETE /
  FAIL / PASS). A task answered by a model other than the one under test does
  not count (`servedModelMatches`, date-snapshot aware).
- `server/eval/pq/run-pq.ts` (`npm run pq:run`) runs through
  `AIGateway.evaluateModel`. That is one model with no fallback, and it keeps
  the last-mile approval gate. `scripts/ci/check-pq-evaluation-callers.mjs`
  keeps every other caller off that seam.
- The GA-readiness row now **opens the record a "passed" claim cites**. Before
  this, the row counted `pq.status: 'passed'` as text.

Evidence: `after/pq-run-keyless.txt` (NOT_EXECUTED, because no product provider
key is configured, and it says so), `after/pq-mutations.txt`,
`after/readiness-row-verifies-record.txt` and `after/pq-callers-selftest.txt`.

## 3. `run_validation` reported "validated" when the AI analysis failed — `002e08f81`

The analysis read only 3,000 characters. A failed or unreadable analysis was
treated as "no issues found". Now it routes as `regulatory_review` with no model
pinned and reads up to 60,000 characters, reporting any truncation. It records
its coverage (`aiAnalysis`), and `isValid` requires that coverage to be
complete. Evidence: `after/validation-fail-closed.txt` (10 tests, 5 mutations
caught).

## 4. Tools that store model-authored text are gated on the model that wrote it

**The gap.** The gateway rule reads a request's task type and risk. It cannot
see this case: a turn labelled `chat`, or a medium-risk regulatory turn, served
by Haiku or Sonnet, where the model writes a document into a tool call and the
tool stores it. The bypass sweep reproduced it on `POST /api/chat`: *"draft the
clinical overview as an authoring document"*, served by `claude-haiku-4-5`,
created `authoring_documents` rows with Part 11 audit entries.

**The gate.** `server/services/ana/governed-write-tools.ts` lists the 14 tools
that persist model-authored text in a governed record. A schema scan found the
32 tools, out of 762, whose input carries free text. Each was classified by
reading its handler and then independently re-checked. The re-check moved two
tools from analysis to write. `registerToolHandler` wraps each of the 14, so
every path to the handler refuses unless the model that produced the call is
approved for high-risk work. That covers the stream's dispatch, the
`/api/chat` agentic loop, and one tool calling another's handler. The refusal is
`MODEL_NOT_APPROVED_FOR_GOVERNED_WRITE`: "Nothing was saved. Ask again with
Thorough effort…".

- The serving model comes from the gateway response. The caller cannot supply
  it: in the loop, the response overrides any caller context.
- If the serving model is missing or unknown, the call is refused.
- The stream refreshes the serving model on every loop round.
- A message that asks for governed drafting is escalated to `high`, so an
  approved model serves it and the write succeeds.
- The classification test fails when a tool with free-text input is in neither
  list, so a new tool cannot ship unclassified.

Evidence: `after/governed-write-gate.txt` (39 tests) and
`after/mutations-2026-09-23.txt` (G1–G6 all caught).

## 5. Promote-to-document recorded a model it had not used

`POST /api/concept2cure/conversations/:id/promote` pinned `gpt-4o-mini`, which
is not approved. It wrote `provider: 'openai', model: 'gpt-4o-mini',
generationMode: 'ai_generated'` on the record whatever happened. When the call
failed, the fallback exported the conversation verbatim and labelled it that
model's output.

Now the promote draft is routed as `document_drafting` with no model pinned.
The record names the model the response says served it, including on a retry.
An empty retry keeps both the first draft and that draft's model. The fallback
is recorded as **`imported` with no model**. The persisted provenance event now
carries `generation: { mode, provider, model }`. Before this, the event recorded
no model at all.

Evidence: `after/promote-provenance.txt` (6 tests) and mutations P1–P7 (one
equivalent mutant exposed a dead line, which was removed).

## 6. Biostatistics continuum stored empty generations as generated

`statistical-continuum-service.ts` pinned `gpt-4o` for ADaM specifications, TLF
shells and CSR statistical sections. When the model failed or its reply did not
parse, it stored empty results with a fresh timestamp. For CSR sections that
also set status `csr_generated`.

Now all three are routed as `document_drafting` with no model pinned:

- A model failure or refusal **propagates with its own type**, so the caller can
  classify it.
- An unreadable or empty reply raises `NoDraftProducedError` and stores nothing.

Evidence: `after/biostat-fail-closed.txt` (13 tests) and mutations B1–B9. The
tests assert the cause, so the parse check and the empty check are each
load-bearing.

## 7. The drafting council: an unapproved model could review, and a model's word was taken as a data check

AnA reaches `convene_drafting_council`, the "HIGH-ASSURANCE" four-agent draft,
through `server/services/multi-agent-council.ts`.

- **Routing.** The Statistician and Critic were routed as `structured_output`,
  because their replies are JSON, so any model could serve them. All four agents
  are now routed by role: the Drafter and Synthesizer as `document_drafting`,
  the Statistician and Critic as `regulatory_review`. A governance refusal is
  final (`recoverable: false`), `withRetry` no longer retries it, and it is no
  longer audited as `CIRCUIT_BREAKER_OPENED`.
- **Unreadable review.** An unreadable Statistician reply was recorded as
  "0 claims, 0 discrepancies". An unreadable Critic reply was recorded as "no
  issues". Both now raise a recoverable `UNREADABLE_AGENT_OUTPUT`: the council
  retries, then fails. An empty list is still a real answer.
- **Who decides a claim (Rule 2).** The model extracts the claims. Only a value
  read from a bound data source decides one. Before this:
  - A claim no binding matched kept the model's own status, so it could read
    "VERIFIED" with nothing checked.
  - A binding that returned nothing (no row, a missing atom, or an API binding
    with no client) was taken as the actual value. The claim became a
    DISCREPANCY, "corrected" to an empty string.
  - A SQL count of `0` became `''` (`||` where `??` was meant).

  Now:
  - Such claims are UNVERIFIABLE, and a model-supplied correction is dropped.
  - The AnA tool reports `claims_found`, `claims_checked_against_data` and
    `claims_unverifiable`, so unchecked figures cannot be narrated as checked.

Evidence: `after/council.txt` (38 tests) and mutations C1–C9 (all caught).

## Gates run on the final tree

- `tsc --noEmit -p tsconfig.json`: exit 0.
- `ci:eslint-ratchet:since HEAD`: net −2. The first run refused a net +3 (five new warnings), all fixed:
  three unused imports, a promote nesting depth of 5, and a test describe block
  of 125 lines.
- New untracked files linted directly: clean.
- The broad suite is recorded in `after/broad-suite.txt`.

## Decisions that belong to the owner

1. **Approve PQ-DRAFT-001.** A draft protocol cannot yield PASS by design.
2. **Should a pending PQ block?** Today, "approved for high risk" is the
   registry's transcribed decision, and `pq.status` is `pending` on all four
   approved entries. Making PQ status gate serving would refuse all high-risk
   drafting until a PQ passes.
3. **`claude-opus-4-vertex`** is approved by inference, recorded as one. The
   Bedrock and Vertex "same weights" claim is unverified.
4. **VMP-001 puts model PQ out of scope,** while the DoD owes it. One of the two
   documents has to change.
5. **39 explicit pins to unapproved models remain repo-wide** on paths not yet
   classified as governed. A ratchet could stop the count growing.
6. `pdf_overlay` is a false-success stub. It is gated as a write so it fails
   closed rather than being exempted.
7. The `run_validation` verdict and the biostat CSR numbers are still partly
   model-derived (Rule 2). This session made them fail closed. It did not make
   them deterministic.

## What the PQ still needs before D4 can go green

- Owner approval of the protocol (above).
- A gold bank at or above the protocol floor. The seed has 4 generation tasks
  against a floor of 10 per document type.
- A live extraction path and a `ragQuery` model parameter. The extraction and
  RAG criteria are declared but not executable today.
- A **product** `ANTHROPIC_API_KEY`. This session's harness credentials are not
  the product's and were not used.
