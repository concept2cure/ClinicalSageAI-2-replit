# The PQ gold bank reaches the protocol's sample floor — 2026-09-23c

**Row moved:** D4, the owed item *"a PQ-passed provider for the model step"* —
specifically the Engineering half `ga-readiness-report.mjs` names in its unblock
line: *"a gold bank at the protocol floor (10+ generation tasks per document
type; the seed has 4)"*.

**State after this session: D4 is not green, and neither is its PQ item.** No PQ
has executed or passed. What changed is that **the sample floor is no longer one
of the reasons it cannot.** Of the things standing between the product and a
passed PQ, this was the only one that was neither an owner decision nor a
credential this environment does not hold.

## The defect

`server/eval/pq/pq-protocol.json` sets
`components.generation.criteria.minTasksPerDocType: 10`. `computeVerdict`
enforces it through `sampleShortfall` (`pq-verdict.ts:103`), which contributes to
`incomplete`, so a bank below the floor makes every run INCOMPLETE **whatever
the model scores**.

The bank held four scorable generation tasks:

| docType | generation tasks with an `input` | floor |
|---|---|---|
| 510k | 1 | 10 |
| cer | 1 | 10 |
| ind | 2 | 10 |

Nothing checked this before a run. The only thing that would report it was a PQ
execution — which needs a product provider key and spends real tokens against
every task in the bank before returning a verdict whose reason is *"your bank is
too small"*. The check costs nothing and belongs before the spend.

## What changed

**1. The bank reaches the floor.** 26 generation tasks added, bringing 510k, cer
and ind to 10 each (32 tasks total). Each carries a realistic source `input`, the
`requiredSections` the regulation actually requires, and `forbiddenPatterns`
drawn from over-claims a reviewer would reject. Grounded in:

- **510(k)** — 21 CFR 807.92, the RTA checklist, ISO 10993 / 14971 / 11135 /
  11607, IEC 62304 / 60601-1 / 60601-1-2, CLSI EP05/EP06/EP09/EP12.
- **CER** — MDR 2017/745 Annex I and Annex XIV Parts A and B, Article 61(5)
  equivalence, Articles 87/88 vigilance and trending, MEDDEV 2.7/1 rev 4
  Appendices A5/A6.
- **IND** — 21 CFR 312.23(a)(3) through (a)(9), ICH E6 for the investigator's
  brochure, ICH Q3C/Q3D for CMC, and section 505B for the iPSP.

Three of the forbidden patterns encode a distinction a regulatory reviewer would
catch and a general-purpose model would not:

- **`fda approved` on a 510(k).** Devices cleared through 510(k) are *cleared*,
  never *approved*. A draft that says "FDA approved" is wrong about the pathway.
- **`superior to the predicate` on a 510(k).** Substantial equivalence is an
  equivalence argument. Claiming superiority argues the device out of the
  pathway it is applying through.
- **`safe and effective` on an IND.** That is the marketing-application standard.
  An IND supports an investigation; it does not make that finding.

**2. No task invents its own evidence.** The new tasks carry no
`candidateContent`. A captured candidate is a *real model output*, and no output
has been captured for these — this environment has no product provider key.
Writing one would fabricate exactly the evidence the bank exists to supply. The
runners already handle this correctly and were checked, not assumed:
`run-eval.ts` skips a generation task with no captured candidate (26 skipped,
exit 0, no fabricated number); `run-pq.ts` ignores captured candidates entirely
and scores only what the pinned model returns.

**3. A gate, so the floor cannot be lost again.**
`server/eval/pq/__tests__/gold-bank-floor.test.ts` binds the bank to the
protocol. It counts the way `run-pq.ts` counts — generation tasks with a
non-empty `input` — because a task with no input does not raise the floor, and a
test that counted every task would pass while the run stayed INCOMPLETE.

It also refuses a forbidden pattern that is a short single word.
`forbiddenPatternHits` is a case-insensitive substring test with no word
boundary, so forbidding `safe` also hits **`safety`** — a word in nearly every
regulatory draft — and the model then fails a task it answered correctly.
(Likewise `cure` inside `secure` and `procurement`.)

## Verification — each gate shown failing on the case it exists to catch

| Drift introduced | Result |
|---|---|
| One `ind` task removed (10 → 9) | `gold-bank-floor.test.ts` fails: *"below the floor of 10: ind=9"*; `run-pq` reasons carry *"sample below the protocol floor of 10 per document type: ind=9"* |
| Bare `"cure"` added as a forbidden pattern | `gold-bank-floor.test.ts` fails: *"single short words match inside other words: ind-clinical-protocol-generate: \"cure\""* |

Restored, then:

- `server/eval` — **98 tests / 7 files pass**
- `tsx server/eval/doc-quality/run-eval.ts --min-coverage 0.85 --min-f1 0.8` —
  exit 0; 4 scored, 26 skipped (no captured candidate), 0 forbidden hits
- typecheck 0 errors (baseline 0)

Two existing assertions in `run-pq.test.ts` encoded the old bank and were
corrected to the new truth rather than relaxed:

- *"scores the model output — never the captured candidate"* asserted that
  **every** runnable task carries a captured candidate. Now asserts **some** do,
  which is what makes the test meaningful (a model answering with nothing must
  still score 0 on the tasks whose captured text would have scored full marks).
- *"a perfect model is INCOMPLETE — and the reasons say why"* asserted the
  reasons contain `floor of 10`. That reason is gone, so the assertion is now
  its inverse, in a test of its own: **the floor is no longer among the
  reasons.**

## What PQ still needs (unchanged by this session)

Every remaining item is an owner decision or an input this environment does not
hold:

1. **The protocol is a draft.** `PQ-DRAFT-001` is `status: draft`,
   `approvedBy: None`. `computeVerdict` returns INCOMPLETE for this alone — *"a
   PQ against acceptance criteria nobody has approved is not a PQ"*. **System
   owner.**
2. **Two of three components cannot execute.** `extraction` has no live
   extraction path; `rag` cannot run because `ragQuery`
   (`server/services/ragRouter.ts:250`) takes no model parameter — `AIRequest`
   (`server/services/aiProviderRouter.ts:84`) has no model field at all, so a
   model cannot be pinned for a RAG answer. Both are Engineering, and the RAG
   one is architectural: it threads a pin through the router's hot path and
   should be scoped on its own rather than at the tail of another change.
3. **A product provider key.** No `ANTHROPIC_API_KEY` for the product here.
   **Ops.**

After those, `npm run pq:run -- --model <id> --record`. Until then the model
cards continue to report per-document-type accuracy as *not yet measured*,
which remains the honest statement.
