# RAG runs are attributable to a named model — the PQ's `rag` component

**Launch row:** D4 (validation package), the clause *"a PQ-passed provider for
the model step"*.
**Date:** 2026-09-28.
**Scope:** removes two of the three blockers recorded against the PQ protocol's
`rag` component. The component stays `executable: false`; the third blocker is
operational and is not ours to close.

---

## What was blocking

`server/eval/pq/pq-protocol.json`, `components.rag.notExecutableReason`, named
three things:

1. `ragQuery` takes no model parameter — the answer is generated inside the RAG
   pipeline by whatever it selects, so a RAG run cannot be attributed to the
   model under qualification.
2. It needs a populated corpus (`ENABLE_CORPUS_INGESTION` is off).
3. Its faithfulness judge is itself an unpinned model.

`scripts/ops/ga-readiness-report.mjs` surfaced (1) as the Engineering-owned
code blocker on the D4 PQ row.

## What changed

**(1) resolved — the generator is pinnable and attributable.** An optional
`model` now threads `RagRetrievalParams` → `RetrievalOptions` → the
`aiRouter.route` call in `queryWithGeneration`, and `AIRequest.model` forwards
it to the gateway. `run-eval.ts` takes `--model`.

**(3) resolved — the judge is pinnable, and cannot be the model it grades.**
`run-eval.ts` takes `--judge-model`, and refuses a run where `--model` and
`--judge-model` name the same model, before any model is called.

**(2) still open, and it is not code.** `ENABLE_CORPUS_INGESTION` is not
`true`, so the ingestion sweep is a no-op and retrieval scores 0 items. Unblock
with `tsx scripts/ingest-corpus.ts`; verify with
`node scripts/verify-rag-corpus.mjs`.

`executable` therefore stays `false`. Flipping it while retrieval scores
nothing would let a run of zeros read as a qualification.

## This is attribution, not an approval bypass

Naming a model is a **request**, not an instruction. The gateway's
`selectModel` filters the matches through `approvedForTask` for a high-risk
task and throws `ModelNotApprovedError` when none qualify — it does not
substitute an approved model, and does not honour an unapproved one. A PQ
against a model nobody approved fails loudly, which is the point.

One related defect was found and fixed while proving this: the router's own
provider guess was being sent **alongside** a caller's pinned model. The
gateway filters on both, so the two disagreeing yields an empty match set,
which on a high-risk task is indistinguishable from "no such model". A pinned
model now replaces the provider rather than accompanying it.

## Attestation is separate from the thresholds

`pqAttributionGaps` decides whether a run is citable. Every run prints either
`Attributable to <model> (judged by <judge>)` or `NOT usable as PQ evidence`
with the reason.

It deliberately **does not** change the exit code. Passing `--min-hit-rate` /
`--min-faithfulness` and being attributable are different questions, and
conflating them would let a green regression run read as a PQ pass. Read the
line; do not infer it from the exit code.

A plain regression run passes no pins, behaves exactly as before, and is
correctly reported as not citable.

## Verified by making each check fail

Six probes. Each broke one guard and was reverted; in every case the test that
exists to catch it, and only that test, failed.

| Probe | Broken | Failing test | Result |
|---|---|---|---|
| 1 | self-grading branch deleted from `pqAttributionGaps` | refuses self-grading | 1 failed / 9 passed |
| 2 | `!opts.model` → `opts.model === null` (empty string accepted as a pin) | does not treat an empty string as a pin | 1 failed / 9 passed |
| 3 | `model` not forwarded to the retrieval call | forwards `--model` to the retrieval/generation call | 1 failed / 9 passed |
| 4 | `model: opts.model ?? undefined` always sent | omits model entirely when unpinned (×2, query + judge) | 2 failed / 8 passed |
| 5 | `if (isTerminalGatewayError(error)) throw error;` removed | LETS THE GATEWAY REFUSAL SURFACE | 1 failed / 5 passed |
| 6 | pinned model dropped in `executeViaGateway` | forwards the pinned model; drops its own provider guess | 2 failed / 4 passed |

Probes 3, 4 and 6 exist because of a membership hole found while writing them:
`pqAttributionGaps` reads the **flags**, so it cannot see whether the pinned
model actually reached the call. Dropping the forwarding would have left every
test green while the run still printed `Attributable to <model>` — an
attestation about a model that never answered. `buildQueryParams` and
`buildJudgeRequest` were extracted so what is *sent* is asserted, not only what
was parsed.

## Reproduce

```
npx vitest run server/eval/rag/__tests__/run-eval-attribution.test.ts        # 10 passed
npx vitest run server/services/__tests__/aiProviderRouter-served-model.test.ts  # 6 passed
npx vitest run server/eval/                                                  # 113 passed
npx vitest run server/services/__tests__/                                    # 1854 passed
node scripts/ops/ga-readiness-report.mjs                                     # D4 PQ row
```

`tsc --noEmit` clean on the touched files.

The readiness report still shows the PQ row **blocked** and still names `rag`
as unexecutable — correctly, because the corpus is not ingested. It now prints
the recorded reason with the component name: a bare `rag` under an
"Engineering:" heading reads as code still to be written, and the next session
would go looking for it.

## Not done here

- Ingesting the precedent corpus (Ops; `ENABLE_CORPUS_INGESTION`).
- A product `ANTHROPIC_API_KEY` (Ops).
- System-owner approval of `PQ-DRAFT-001` — it is a draft, and a PQ against
  unapproved criteria cannot PASS by construction in `pq-verdict.ts`.
- Executing a PQ. Nothing here claims a model passed one.
