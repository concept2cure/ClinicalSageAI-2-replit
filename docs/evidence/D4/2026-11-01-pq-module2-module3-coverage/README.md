# The PQ gold bank covers Module 2.5–2.7 and CMC / Module 3, from real source text — 2026-11-01

Launch row **D4**, under package **L1**. It closes P-31 item 4 (`docs/MODEL_GOVERNANCE_DECISION_2026-10-13.md` §4) and
the first of P-56's two conditions (`docs/LAUNCH_DEFINITION_OF_DONE.md`): gold-bank coverage for CMC / Module 3 and
Module 2.5 to 2.7, "authored from real source text and never invented".

## Why it mattered

Production refuses governed drafting until a model passes PQ (`server/services/ai-gateway/model-governance.ts`). Opus
5.5 and Opus 5 are both `pq: pending`. The bank covered `510k`, `cer` and `ind` only. A model qualified on those would
have been admitted to draft Module 2 and Module 3 content it was never evaluated on. And the bank's earlier passages
are fictional ("Acme Analyzer 2000").

## What already exists (RULE 3)

- **The bank:** `server/eval/doc-quality/gold-tasks.json` v0.5.0, 72 tasks.
- **The scorer:** `server/eval/doc-quality/doc-quality-metrics.ts`. It builds both prompts and scores sections,
  forbidden patterns and fields.
- **The runner:** `server/eval/pq/run-pq.ts`, which calls the pinned model through `evaluateModel`.
- **The bank's rules:** `server/eval/pq/__tests__/gold-bank-floor.test.ts`.
- **The protocol:** `server/eval/pq/pq-protocol.json`, PQ-DRAFT-001, draft. Both floors are 10 per document type.
- **Real source text in this repository:** three public CSR synopses in `csrs/`.
  - Pfizer A0081186: pregabalin in restless legs syndrome, Phase 3.
  - Pfizer A0221045: fesoterodine in elderly overactive bladder, Phase 4.
  - Convergence 1014802/201 (NCT01561027): CNV1014802 in lumbosacral radiculopathy, Phase 2.
- **Not reachable:** the FDA and EMA hosts. The environment's network policy refuses them (403 on CONNECT), as P-55
  records. Module 3 text therefore came from PubMed Central through its connector.

## What changed

- **Gold bank v0.6.0** gains **48 tasks**:
  - `module-2-clinical`: 12 generation and 12 extraction, covering 2.5, 2.7.2, 2.7.3 and 2.7.4, from the three
    synopses.
  - `module-3-quality`: 12 generation and 12 extraction, covering 3.2.S.3.2, 4.2, 4.3 and 7.3, and 3.2.P.2.2, 5.1,
    5.2, 5.3, 5.5, 8.1 and 8.3. They come from 11 CC BY 4.0 articles on 12 small-molecule drugs: validation (ICH Q2),
    forced degradation, stability and shelf life (ICH Q1A/Q1E), impurities, specifications and dissolution.
- **Every input is verbatim source text.** Builders cut each one between two anchor strings: page furniture is
  removed, bullet glyphs are transcribed as "•", and only call-out remnants are dropped from the articles. A missing
  anchor stops the build. See `builders/`.
- **Every task names its source.** A synopsis task names its path. An article task names its PMID, PMCID, DOI,
  licence and section. See `task-sources.md` and `module-3-sources.md`.
- **Expected values contain no unit glyph a correct answer might type differently** (µ against μ, a space before
  °C). The number is the value and the unit goes in the field name.
- **Every generation task forbids "guaranteed",** the bank-wide over-claim `run-pq.test.ts` holds.
- **`pq-protocol.json`'s `$comment`** now says item 4 landed. Only the provider key remains. No model has passed, so
  the protocol hash may change.

## Review

An independent regulatory-writer pass checked every task against its source and the scorer.
- **Module 2:** 11 pass, 13 fixed, 0 dropped. One input had lost Table 29's column headers, so no value could be tied
  to its arm. The headers are restored.
- **Module 3:** 9 pass, 15 fixed, 0 dropped.
- **Kinds of fix:** headings and plurals a faithful draft would miss; values that failed a correct answer ("350mg"
  against "350 mg"; a percentage asked for under a count field); two forbidden phrases a faithful writer could
  legitimately use.
- **Two hospital-compounded products,** cisatracurium and meropenem, are kept with a scope note. They still test
  3.2.P.8 shelf-life and specification work.

## Proof

- **Red:**
  - `red/coverage-on-unchanged-bank.txt`: the new `gold-bank-coverage.test.ts` against the 0.5.0 bank. Neither
    document type exists.
  - `red/one-figure-changed-in-a-synopsis-task.txt`: one figure changed in one synopsis task (-1.54 to -1.84). The
    line-by-line PDF check names the line.
  - `module-3-selfcheck-mutated-copy.txt`: ten planted faults in a copy of the Module 3 tasks, all caught.
- **Green:** `green-summary.txt`, every eval suite (17 files, 363 tests): the floor test, the coverage test,
  `run-pq.test.ts` and `pq-claim-verification`.
- **A defect the real data exposed.** `run-pq.test.ts`'s "perfect model" mock told a prompt apart by the passage it
  contained. One real passage now serves both a drafting task and an extraction task, so the mock now identifies a
  task by its exact prompt.

## What is still owed before a model is approved (P-56)

1. **A product provider key.** This is an owner action.
2. **A PQ run against this bank,** recording the protocol hash.
3. **The protocol approval signature.** It is the founder's, with P-31 as its reasoning.
4. **The protocol's RAG items,** which D4 already lists.
