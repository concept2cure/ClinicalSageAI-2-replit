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

- `metrics.ts` — pure metric functions (unit-tested in `__tests__/metrics.test.ts`).
- `gold-dataset.json` — the evaluation set. **Currently a 12-item seed.**
- `run-eval.ts` — loads the gold set, runs each question through the RAG router, prints metrics.

## Running

Unit tests for the metrics (no DB or network needed):

```
npx vitest run server/eval/rag/__tests__/metrics.test.ts
```

Full evaluation against a populated corpus + configured LLM provider:

```
npm run eval:rag                                   # report only
npm run eval:rag -- --min-hit-rate 0.6 --min-faithfulness 0.7   # gate CI
```

Exit code is non-zero when a threshold is missed. With no corpus / no provider it
reports zeros rather than fabricating a pass.

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
- Faithfulness uses the app's own LLM router as judge; for high-stakes grading
  consider a separate, stronger judge model.
