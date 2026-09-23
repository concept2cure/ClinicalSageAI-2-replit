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

## 8. The sweep of explicit pins to unapproved models

The owner list below originally said "39 explicit pins to unapproved models
remain". This session classified them instead of leaving them as a count. A
grep found 40 lines in 16 files. The regulatory digital twin (Rule 2) and doc
comments were excluded, leaving 14 call sites. One agent classified each site,
and a second agent tried to refute that classification (28 agents in all). The
table is `after/pin-sweep-classification.md`. Four sites are governed and
reachable, one is governed but cannot run, and nine are not governed. Each fix
below was mutation-tested (`after/mutations-batch2.txt`).

- **Citation verdicts (Submission Readiness):**
  - Half of each sentence's blended relevance score comes from an LLM judge, and
    that score decides supported vs gap and `filing_blocked`. The judge was
    routed as `structured_output`, with gpt-4o first. It now runs in
    governed-verdict mode:
    - It is routed as `regulatory_review`.
    - An unreadable or partial score throws instead of defaulting to 0.5.
    - A failed rerank fails the sentence instead of silently scoring it on
      embeddings alone, on the wrong scale.
  - A sentence whose retrieval failed is still a gap, but it is flagged
    `RETRIEVAL_FAILED` and counted in the run, so it is not read as a finding
    about the content.
  - `aiProviderRouter` now records the model the gateway served. Until now it
    wrote its own config names (`claude-3-5-sonnet-20241022`) into
    `ai_provider_audit_log`, Langfuse and the response.
- **Estimand method recommendation:** it is routed as `regulatory_review` and
  its shape is checked before storing. It is labelled `source: model` with the
  serving model, or `deterministic`. The deterministic fallback no longer
  asserts "FDA, EMA, and PMDA have accepted this approach in recent approvals"
  for every estimand.
- **CMC blueprint and CMC playbook AI tools:**
  - Both are now routed as `document_drafting`. They pinned `gpt-4` and
    `gpt-5`, which match no configured model, so a `general` request reached
    whatever the unfiltered fallback ladder did.
  - A failed draft is now a 503 `NO_DRAFT_PRODUCED`. It used to be HTTP 200
    with placeholder content stored as `completed`.
  - The blueprint is drafted before its project row, so a failure leaves no
    orphan row.
- **`/api/claude/quick`** wrote the literal `claude-sonnet-4-6` into every
  HMAC-sealed audit row. It now records the model that served.
- **Document data center uploads** recorded `model: 'gpt-4o'` whatever tagged
  them. The keyword fallback was stored under that label with an invented
  confidence of 0.6, the invented category `bench_test`, and the IP
  `127.0.0.1` in the Part 11 entry. Now the service records the served model
  or `keyword`, with no invented values.
- **Vision and attachments:** the OpenAI-compatible and Moonshot executors send
  text only. A request carrying an image or document that fell back onto one of
  them was answered as if the model had read the file. The gateway now refuses
  it (`MediaNotCarriedError`, terminal). This also covers AnA's PDF
  attachments.
- **`ai.embeddings`** sent text to a chat completion and returned `[]`, so it
  never produced a vector. It now uses the gateway embedding provider that
  `enhancedEmbeddingService` uses, and throws on failure. It is a wrapper, not
  a second implementation.
- **GCC drafting** (`/api/gcc/drafting/generate`): the pin was dropped and the
  provenance now comes from the response. The route still cannot complete: its
  search functions exist only in a legacy migration that no applier runs, yet
  `/api/gcc/health` declares the module `available`. Whether to retire it onto
  the canonical authoring draft is an owner decision.

- **`/conversations/:id/summarize`** stored a placeholder whenever the model
  failed or its reply was unreadable: "Conversation with N messages", or
  "Unable to parse summary" with every list empty. The placeholder became the
  conversation's working memory, which later summaries chain onto and nightly
  consolidation promotes into project memory. The route now stores nothing and
  answers 503 `NO_SUMMARY_PRODUCED`.
- **Section predictions** reported a model failure as "the model had nothing
  to add". The response now says `aiSuggestions: 'included' | 'unavailable'`.

Not changed, and recorded for the owner:
- `openai-orchestrator.ts` is dead, unreachable code that would draft SUSAR
  timelines and write "approved" facts if it were ever wired up.
- `agent-swarm` shows a literal `gpt-4o` as each agent's model.

The mutation results are in `after/mutations-batch2.txt`: 35 mutations, 34
caught and one equivalent, with the reason given. The broad suite is in
`after/broad-suite-batch2.txt`: 17,164 passed and 1 failed. This batch caused
that failure (a stale test mock met a new `instanceof`); it was fixed and the
file re-run.

## 9. The sweep's blind spots, and the gate that closes the list

The section-8 grep searched `.ts` files only, and only literal pins. The CI
gate built next scans `.js` too. On its first run against the repo it failed on
43 pins in 9 files that the sweep had never seen (`after/pin-gate-first-run.txt`).
Extending it to `x || 'model'` defaults found 8 more in 6 files. Both sets were
classified the same way, one agent each plus a refuter (30 agents), and
appended to `after/pin-sweep-classification.md`. Governed and fixed:

- **Sentence traceability** (`evidence_links`, and the report sealed into the
  Part 11 audit chain):
  - Now `regulatory_review`.
  - A model "excerpt" is stored only if it is verbatim in the source. The
    model's composed quotation used to be preferred and persisted.
  - A missing or unknown link type is `references`. It used to default to
    `supports`.
  - A sentence the reply skipped is reported unsupported. It used to be left
    out, so a partial reply produced a clean report.
  - Keyword fallback never counts as support.
- **Claim verification** (`confidenceScoringEngine`): now `regulatory_review`.
  An unreadable reply is a skipped check, not "partially supported (0%)". A
  skipped source match can no longer leave a claim "verified".
- **Auto-extraction:** transcribed tables are `document_drafting` and document
  classification is `regulatory_review`. A failure fails the job; it used to be
  recorded as "0 tables" or `documentType: 'Other'`.
- **Figure generation:** it refuses without source data. It used to ask the
  model for "a representative template", so it invented Kaplan-Meier curves and
  CONSORT counts, stored them as artifacts, and export included them. It is
  `document_drafting`, records the served model, and the placeholder figure
  stored without an OpenAI key is gone. The route answers a refusal as 422; it
  used to wrap it in `success: true`.
- **CMC** (`global-compliance`, `preclinical-translator`,
  `change-impact-simulator`, `document-generator`): every call declares its
  task. Several read `.choices[0].message.content`, a shape the unified client
  does not return, so they threw on every request; they now read `.content`.
- **IND copilot** (governed, but no path reaches its model calls today): every
  call declares its task, and the served model is recorded instead of
  `options.model || 'gpt-4o'`. `checkFDACompliance` read an undefined name, so
  every check failed with score 0; that is fixed.

**The gate:** `scripts/ci/check-unapproved-model-pins.mjs` runs in CI with its
self-test (14 cases). A new pin fails. A removed pin also fails until the
baseline is tightened, so a pin cannot be quietly regained. A baseline entry
with no written reason fails. The 54 remaining pins are each listed with their
reason in `scripts/ci/unapproved-model-pins-baseline.json`.

Mutations are in `after/mutations-batch3.txt`: 22, all caught. Three were caught
only after the tests were strengthened, and that file explains why.

Found on the way, for the owner:
- In the test harness an auto-extraction job with valid replies was refused at
  storage by the governed-document contract ("originSurface import_pipeline is
  not allowed for documentClass evidence_memo"). If production behaves the
  same, the pipeline can never complete. This needs checking against a real
  database.
- `audit-risk-monitor.js` returns 500 on every POST, but only after sending the
  uploaded document to gpt-4o. It is baselined and listed for retirement.

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
5. **Explicit pins to unapproved models**: all classified and the governed ones
   fixed (sections 8 and 9). The remaining 54 are closed behind a CI gate.
   These still need a decision:
   - the GCC drafting module's `available` state;
   - the dead `openai-orchestrator.ts` and `unifiedDocumentIngestion.js`;
   - the always-500 `audit-risk-monitor.js`;
   - the auto-extraction storage refusal noted in section 9.
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
