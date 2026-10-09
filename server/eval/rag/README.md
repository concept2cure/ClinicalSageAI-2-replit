# RAG evaluation harness

Turns "is the RAG any good?" into numbers, and catches regressions in CI.

## What it measures

- **hit-rate@k** — fraction of questions where an expected source is in the top-k.
- **recall@k / precision@k / MRR** — finer-grained retrieval quality.
- **answer-contains** — deterministic proxy for correctness (expected substrings present).
- **faithfulness** — LLM-judged grounding of the answer in its sources (0..1).

Retrieval and grounding are scored separately on purpose: retrieval can be perfect
while generation still hallucinates, and vice versa.

## Files

- `rag-metrics.ts` — pure metric functions (unit-tested in `__tests__/rag-metrics.test.ts`).
- `gold-dataset.json` — the evaluation set. **Currently a 12-item seed.**
- `run-eval.ts` — loads the gold set, runs each question through the RAG router, prints metrics.

## Running

Unit tests for the metrics (no DB or network needed):

```
npx vitest run server/eval/rag/__tests__/rag-metrics.test.ts
```

Full evaluation against a populated corpus + configured LLM provider:

```
tsx server/eval/rag/run-eval.ts                                        # report only
tsx server/eval/rag/run-eval.ts --min-hit-rate 0.6 --min-faithfulness 0.7   # gate CI
```

Exit code is non-zero when a threshold is missed. With no corpus / no provider it
reports zeros rather than fabricating a pass.

### Running it as a performance qualification

A regression run needs no model pins — the gateway selects per task type, as it
always has. A **qualification** of a named model does, because numbers that
cannot be attributed to a model qualify nothing:

```
tsx server/eval/rag/run-eval.ts \
  --model claude-opus-4 --judge-model claude-sonnet-4-5 \
  --min-hit-rate 0.6 --min-faithfulness 0.7
```

- `--model` pins the model that **generates** the answer. Retrieval is unaffected.
- `--judge-model` pins the model that **grades** faithfulness.
- Naming the same model for both is refused before any model is called: a model
  cannot grade its own faithfulness.
- Naming a model that is not approved for high-risk drafting produces a gateway
  refusal, not a substitution. That is intended — a PQ must fail loudly against
  an unapproved model rather than quietly qualify a different one.

Every run prints whether it is citable. A run missing either pin still reports
its metrics and still honours `--min-*`, but prints `NOT usable as PQ evidence`
with the reason. Passing the thresholds and being attributable are separate
questions, so an unattributable run never sets a failing exit code on that
account alone — read the line, do not infer it from the exit code.

The gate lives in `pqAttributionGaps` (`run-eval.ts`), tested in
`__tests__/run-eval-attribution.test.ts`.

## Expanding the gold set (do this before trusting the numbers)

1. The seed has 12 items. Grow it to **30–50** covering your real query mix
   (ICH, FDA, EMA, statistics, CMC, plus a few negative controls / out-of-scope
   questions that *should* be refused).
2. To make retrieval metrics meaningful, populate `expectedSourceIds` with real
   chunk/atom ids from your corpus. Find them with:

   ```
   node scripts/verify-rag-corpus.mjs
   ```

   then query the relevant table for the ids of the chunks that *should* answer
   each question.
3. `expectedAnswerContains` and `referenceAnswer` work without corpus ids and are
   a good starting signal while you build out `expectedSourceIds`.

## Known limitations

- The seed `expectedSourceIds` are empty, so hit-rate/recall/MRR report on 0 items
  until you populate them — `answer-contains` and `faithfulness` work immediately.
- Faithfulness uses the app's own LLM router as judge. Unpinned, that is
  whatever the gateway selects for `reasoning`; pass `--judge-model` to name it,
  which a qualification run must do.
