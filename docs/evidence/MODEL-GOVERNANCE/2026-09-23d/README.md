# The PQ's extraction component can now execute — 2026-09-23d

**Row moved:** D4, the owed item *"a PQ-passed provider for the model step"* —
the second Engineering blocker `ga-readiness-report.mjs` named: *"a live
extraction path"*.

**State after this session: D4 is not green, and no PQ has passed.** What
changed is that a second of the PQ's three required components can now run. Of
the reasons `computeVerdict` returns INCOMPLETE for a perfect model, two of the
three that were engineering work are now closed (the sample floor in
`2026-09-23c`, extraction here). One remains, and it is architectural.

## The defect

`pq-protocol.json` declared `extraction` **required** with
`executable: false`, so `unexecutableComponents` put it in the reasons of every
run. Two things stood in the way, and only one of them was named:

1. The recorded reason said the harness *"scores captured candidateExtraction
   only, and names the per-doc-type extraction service it would need."*
2. **The unnamed one: neither extraction task had an `input`.** They carried
   only `expectedFields` and a captured `candidateExtraction`. There was no
   source text to give a model. A "live extraction path" built against that
   bank would have had nothing to extract from.

The recorded reason also pointed the wrong way. Routing a PQ through a
per-document-type extraction *service* would measure the service — and whichever
model the service selects — not the model under qualification. That is exactly
the attribution failure the `rag` component is still blocked on, and it is the
failure this runner was built to avoid: *"It never lets the gateway choose."*

## What changed

**1. Extraction tasks have source material.** The two existing tasks were given
the document they were extracted from, and 10 more added — 4 per `docType` for
510k, cer and ind. Every expected value was **checked to appear verbatim in its
own source**, not assumed: a fixture whose expected value is absent from its
input measures the fixture, not the model.

**2. The pinned model is asked directly.** `buildExtractionPrompt` names the
fields and requires a JSON object; `run-pq.ts` sends it through
`gateway.evaluateModel(entry.id, …)` exactly as generation does, and checks the
model the provider *reports* serving against the pinned version. No service, no
gateway selection.

**3. An unparseable reply is NOT EXECUTED, not zero.** `parseExtraction` accepts
a bare object, a fenced ```json block, and an object embedded in prose — all
three are the model answering, and failing them would measure formatting. When
nothing parses, the task records an error. Scoring it zero instead would be
indistinguishable from a model that extracted every field wrongly, and those are
different findings: one is a harness problem, the other is a real failure.

**4. The verdict carries extraction.** `computeVerdict(protocol, generation,
extraction)` applies the same rules: a task that produced nothing is a
shortfall, a task answered by another model is a shortfall, and `minF1` is
measured **only over tasks the pinned model verifiably answered** — otherwise a
fallback model's score would count toward qualifying the pinned one. A component
that is required and executable but ran nothing is INCOMPLETE, because once
`executable` is true, "it did not run" has to be said some other way or a PQ
could pass having skipped a required component.

**5. `executable: true` in the protocol.** This is a statement of fact about the
harness, not an acceptance criterion. **`criteria` (`minF1: 0.8`), `status:
draft` and `approvedBy: null` are untouched** — those are the system owner's,
and a PQ against criteria nobody has approved still cannot PASS.

## Verification — the gates shown failing on what they exist to catch

New tests, each a failure mode rather than a happy path:

| Case | Result |
|---|---|
| Model returns `{}` for every extraction task | every F1 = 0, verdict **FAIL**, reason *"mean extraction F1 … is below 0.8"* |
| Model returns prose with no JSON | every task `f1: null` with an error, verdict not PASS, reason names tasks that produced no output |
| First extraction task answered by `claude-opus-4-8` | `servedModelVerified: false`, verdict not PASS, reason names it |
| Model returns JSON in a fenced block wrapped in prose | every F1 = 1 — formatting is not scored |

And the drift demo, `executable` reverted to `false`:

> 6 tests fail, including *"expected 30 to be 42"* — the runner stops sending
> the 12 extraction tasks at all, and extraction returns to the INCOMPLETE
> reasons.

Restored, then: **`server/eval` 103 tests / 7 files pass**, `run-eval` exit 0
(4 scored, 36 skipped, 0 forbidden hits), typecheck 0 errors (baseline 0).

Two existing assertions encoded the old state and were corrected to the new
truth, not relaxed:

- *"sends every task to exactly the model under qualification"* counted only
  generation calls; it now counts generation **+ extraction**.
- *"a perfect model is INCOMPLETE — and the reasons say why"* asserted the
  reasons name `extraction`. They no longer do, so the assertion is now its
  inverse: extraction's **absence** from the reasons is the evidence it
  executes, the same shape as the sample-floor check.

The test stub was also extended: it now answers extraction prompts with the
expected fields. A stub that answered only generation would have left every
"perfect model" case quietly measuring a model that cannot extract, while its
generation assertions still passed.

`ga-readiness-report.mjs` now **reads** which required components cannot execute
instead of listing them, for the same reason it now measures the gold bank: the
line named "a live extraction path" and would have sent the next session to redo
finished work.

## What PQ still needs

1. **The protocol is a draft.** `PQ-DRAFT-001`, `approvedBy: None`. INCOMPLETE
   for this alone. **System owner.**
2. **`rag` cannot execute, and it is architectural.** `ragQuery`
   (`server/services/ragRouter.ts:250`) takes no model parameter, and
   `AIRequest` (`server/services/aiProviderRouter.ts:84`) has no model field at
   all — the RAG pipeline generates with whatever `AIProviderRouter.route`
   selects, so a RAG answer cannot be attributed to the model under
   qualification. Threading a pin through that hot path also has to contend
   with the LiteLLM adapter branch in `route()`, which may bypass the
   `getGateway()` seam CI enforces. It additionally needs a populated corpus
   (`ENABLE_CORPUS_INGESTION` is off) and a pinned faithfulness judge — the
   judge in `server/eval/rag/run-eval.ts` is itself an unpinned model. **Its own
   session.**
3. **A product provider key.** No `ANTHROPIC_API_KEY` for the product here.
   **Ops.**
