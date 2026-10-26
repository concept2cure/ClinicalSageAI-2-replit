# A batch analysis is attributed to the material it was run on (pass 8)

Launch row D2, CMC / Module 3 (P-28). Canonical branch `concept2cure-v2`.
Follows `docs/evidence/D2-CLIENT-JOURNEY/2026-10-25/pass7/`, which recorded this as an
observation it had **not** investigated:

> Seven QC results recorded with `sampleType: finished_product` were classified under
> `drug_substance` by `batchAnalysisSide`. That may be the mapper's intended fallback or a
> mis-sort; it is recorded rather than claimed, because this pass did not investigate it.

It was a mis-sort, and a consequential one.

## What already exists (RULE 3)

| Path | What it does today | What it does not do |
| --- | --- | --- |
| `shared/cmc/qc-sample-types.ts` | Held `NON_BATCH_SAMPLE_TYPES` and `FINISHED_PRODUCT` — the two derived sets. | Held no vocabulary. The list of valid sample types lived in the client form and in a trailing comment on the column. |
| `client/.../cmcRegisterForms.ts` `QC_SAMPLE_TYPES` | The six values the form offers. | A second copy, which nothing on the server read. |
| `shared/schema.ts` `qcTesting.sampleType` | `text('sample_type').notNull()` — free text, with `// raw-material, in-process, finished-product` beside it. | Constrained nothing. |
| `server/api/cmc/routes.ts` `qcTestingBody` | Validated the QC create. | Did not constrain `sampleType`. |
| `server/services/cmc-write-through.ts` `mapQcTestingPayload` | Decides the side once and persists it, so the completeness rules and the renderer cannot disagree. | Decided it as `=== FINISHED_PRODUCT ? product : substance` — **anything else is drug substance**. |
| `server/services/cmc/recorded-capability.ts` `isBatchAnalysisFor` | The one gate the capability route, the §3.2 composer and AnA's `assess_recorded_process_capability` all read through. | Honoured the stored decision unconditionally, so a stored mis-sort stayed a mis-sort for ever. |

Searched: `sampleType`, `sample_type`, `batchAnalysisSide`, `isBatchAnalysis`,
`FINISHED_PRODUCT`, `NON_BATCH_SAMPLE_TYPES`, `QC_SAMPLE_TYPES` across server, client,
shared and scripts; every sample-type literal in the repository; and
`git log --all --diff-filter=D` on the vocabulary's names. One rule, in one place — the
composer and the AnA tool both read `isBatchAnalysisFor`, so there was no second copy to
converge, only a vocabulary to close.

## The defect

`sample_type` is free text and nothing refused a value outside the vocabulary, while the
write-through read it as `=== FINISHED_PRODUCT ? 'drug_product' : 'drug_substance'`. So
**every unrecognised string became drug-substance batch evidence**, composed into
§3.2.S.4.4 instead of §3.2.P.5.4, and carried the product's capability indices onto the
substance.

Measured on a real database (`live/stored-attribution.txt`), not hypothesised:

```
   sample_type    |  stored_side   | count
 finished_product | drug_substance |     7     <- underscore: not a value the form produces
 finished-product | drug_product   |     6     <- recorded after the write was closed
```

`NON_BATCH_SAMPLE_TYPES` fails identically inverted: `reference_standard` is not
`reference-standard`, so a reference-standard qualification — a record the mapper exists
to **exclude** — would have entered the batch-analysis series it is meant to keep out of.

A misattributed batch analysis is a false statement about which material was tested, in a
filed section. It is the exact failure the capability panel added in pass 7 was built to
make visible, and the panel was reporting it as fact.

## What changed

1. **One vocabulary, in `shared/cmc/qc-sample-types.ts`** — `QC_SAMPLE_TYPES` and
   `isKnownSampleType`, with the two derived sets beside them. The client form re-exports
   it, so its importers are unchanged and the second copy is gone.
2. **Closed at the write.** `qcTestingBody` lower-cases and refuses an unknown value,
   naming the accepted ones. Verified live:
   `{"error":"Invalid payload","details":[{"message":"Sample type must be one of:
   raw-material, in-process, finished-product, stability, reference-standard,
   cleaning-verification.","path":["sampleType"]}]}` — HTTP 400.
3. **The mapper no longer guesses.** An unrecognised sample type is attributed to neither
   side: `isBatchAnalysis: false`, `batchAnalysisSide: null`, neither
   `drugSubstanceBatchAnalyses` nor `drugProductBatchAnalyses` — and
   `sampleTypeRecognised: false`, so nothing vanishes without a word.
4. **Rows already written stop composing into the wrong section.** The vocabulary is
   checked in `isBatchAnalysisFor` too — where the route, the composer and the AnA tool
   all read — because fixing the mapper alone corrects new writes and leaves the seven
   measured rows in §3.2.S.4.4 for ever. A stored decision is honoured only when it is one
   the vocabulary could have produced.
5. **The silence is visible.** The capability report names the sample types it could not
   attribute, and the panel shows that sentence even when it DID produce series — an
   assessment over a partial set must not read as complete.

## Live, before and after (`live/`)

`capability-after-the-fix.json`, against the running app:

```
resultsOnFile: 13   assessed: true
unattributable: ["finished_product"]
statement: 1 recorded sample type(s) are outside this register's vocabulary
           (finished_product); a result recorded against one is evidence for neither
           the substance nor the product until its sample type is corrected.
  drug_substance: (no series)
  drug_product:   Assay by HPLC-UV (AM-114): over 6 batches ... Ppk 3.9922, Cpk 2.9092
```

Before the change the same project reported **7 batches of drug-substance capability**
from results that are drug product.

## Tests: shown failing first (`red/`)

- `red/attribution-against-the-guessing-mapper.txt` — with `const isBatchAnalysis =
  known && …` reverted to the shipped rule: **3 of 11 fail**, each naming a value that was
  silently reclassified.
- `red/stored-misattribution-mutation.txt` — with the read-time vocabulary check removed:
  the case that proves a row written before the fix stops composing into the wrong section
  fails, and only that one.

Both mutations are the exact code that shipped, not a weakened stand-in.

## Fixtures corrected, and why that matters

Three test fixtures used sample types the column cannot hold — `'drug-substance'` and
`'drug substance'` — and passed only because the old rule read *anything but
finished-product* as drug substance. They taught the next reader a contract the product
does not have, exactly as the specification mapping tests did with integer ids in pass 7.
Every sample-type literal in the repository was checked; no production writer emits a
value outside the vocabulary, so the three were fixtures alone.
