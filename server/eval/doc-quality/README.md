# Doc-quality eval (per document type)

Turns "how accurate is AnA's extraction/generation for this document type?" into
numbers, per `docType` (510k, CER, IND, …). Companion to `server/eval/rag`
(retrieval/faithfulness) — this harness scores the **document output** itself.

## What it measures

- **Extraction** — precision / recall / F1 over expected field values
  (`expectedFields`). A field matches when the extracted value contains the
  expected value (normalized substring).
- **Generation** — required-section coverage (`requiredSections`) plus a hard
  fail on any forbidden/overclaim phrase (`forbiddenPatterns`).

Pass criteria: generation = coverage ≥ `--min-coverage` **and** zero forbidden
hits; extraction = F1 ≥ `--min-f1`.

## Run it

```bash
# Offline: scores any task that carries a captured candidate output.
tsx server/eval/doc-quality/run-eval.ts

# Gate CI on thresholds (non-zero exit on a miss):
tsx server/eval/doc-quality/run-eval.ts --min-coverage 0.85 --min-f1 0.8
```

The metric functions (`doc-quality-metrics.ts`) are pure and unit-tested
(`__tests__/`), so the scoring logic is verified without a DB or LLM.

## Status / how to make the numbers real

`gold-tasks.json` is a **seed** (`0.1.0-seed`). It ships captured candidate
outputs (`candidateContent` / `candidateExtraction`) so the harness runs today,
but it is not yet a representative bank. To make the per-document-type accuracy
publishable:

1. Expand `gold-tasks.json` to 10+ tasks per `docType` with real `input`
   documents and curated `expectedFields` / `requiredSections`.
2. ~~Wire `--live` mode in `run-eval.ts`~~ — **do not. This step is done, and
   not here.** `--live` existed in this runner until 2026-09-22 and was removed
   deliberately: it scored a task's captured candidate in preference to the live
   generation, went through the gateway without pinning a model (so a fallback
   could answer unrecorded), and a run that scored nothing still exited 0.
   Scoring a model live is performance qualification, and it now lives in
   `server/eval/pq/run-pq.ts` — `npm run pq:run -- --model <id>` — which pins one
   model, checks the model the provider reports actually serving, and never
   scores a captured candidate. See the header of `run-eval.ts` and commit
   `282c66887`.

   Left struck through rather than deleted because this instruction outlived the
   code it described, and a session reading it would rebuild something that was
   removed on purpose — the failure the `CLAUDE.md` working agreement describes,
   where five editor generations were built and deleted because each session did
   not know the last one existed. `ga-readiness-report.mjs` has since been
   corrected and no longer points here; this line was the last copy still saying
   "wire `--live`".
3. Record the resulting per-document-type accuracy in the model cards
   (`docs/ai-governance/MODEL_CARDS.md`) and re-run on every model swap (the
   approved-models drift gate flags when that is required).

Until then the model cards correctly report per-document-type accuracy as **not
yet measured** rather than fabricating a number.
