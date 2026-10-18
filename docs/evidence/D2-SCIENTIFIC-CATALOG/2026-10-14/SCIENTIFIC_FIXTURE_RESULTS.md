# Independent fixture verification record

This record concerns only the read-only deterministic source preview. The expectation documents and fixture source were written before invoking each request. The corpus contains 47 primary requests and 23 held-out requests across the five meaning families. The final results section below will be completed after the verifier owner resolves the observed implementation findings.

## First observations

- The first primary run contained 46 requests: 41 passed and five failed. SF01 omitted the canonical existing-engine `population.allRandomized:true` annotation; the fixture transport was corrected without changing its predeclared scientific meaning or expected outcome. The other findings were scalar transcription stripped from a bound/range and literal numeric transcription adjoining unsupported Japanese text. SF41 separately records ordinary narrative as unsupported context.
- The first held-out run contained 17 requests: 14 passed and three failed. SFH03 omitted source software but obtained a context pass; SFH12 clipped a bound marker from the value anchor; SFH17 used an earlier unrelated scalar occurrence to hide the named result's bound. Both numeric adversaries required transcription refusal, not merely a context diagnostic.
- Four additional omission variants were defined before running them. SFH18–21 all demonstrated the same context false pass for diagnostic instrument/reagent, analytical lot and device condition. SFH22's remote matching clinical frame was correctly refused.
- SFH23 was a positive counterpart specified before execution. An initial all-occurrence numeric guard rejected an exact named sensitivity result because its earlier contextual cutoff used a bound. The intended result stayed a pass, requiring the verifier to bind the correct property/value in both directions.

These historical failing logs are preserved and are not the final release result. They show the gate failing on cases it exists to catch.

## Reproduction

Use supported Node 22, the installed locked dependencies, and the ordinary Vitest configuration:

```sh
node docs/evidence/D2-SCIENTIFIC-CATALOG/2026-10-14/run-scientific-fixtures.mjs
node node_modules/vitest/vitest.mjs run server/services/vault/__tests__/scientific-source-facts.test.ts server/services/vault/__tests__/scientific-source-facts-heldout.test.ts --config vitest.config.ts
node node_modules/typescript/bin/tsc --noEmit -p docs/evidence/D2-SCIENTIFIC-CATALOG/2026-10-14/scientific-fixtures.tsconfig.json
```

The fixtures use synthetic source text and deterministic synthetic byte identities, exact text hashes, quotes and ranges. They do not exercise a database, provider, RLS, real uploaded original, OCR quality, human review, regulatory rule pack or filing adapter. Passing is source binding only: every result remains `persisted:false`, `reviewState:not_recorded`, `scientificQualification:unassessed`.

## Final result

The final combined run passed **70/70 requests across two files** under **Node v22.23.3**. The fixture/test TypeScript scope and all four fixture/test files passed lint without warnings. The reproducible runner captured **28 exact source hashes**, verified that source remained unchanged during the test run, and refuses to label a run passed if source changes during execution. The lead owns broader integrated clinical/regression/database/UI release evidence.

Evidence: [final test log](scientific-fixtures-final.log), [source/runtime manifest](scientific-fixtures-source-manifest.json), [TypeScript output](scientific-fixtures-types.log), [lint output](scientific-fixtures-lint.log), and [reproduction runner](run-scientific-fixtures.mjs). The final verifier SHA-256 is `8aa8254c8c12f9116d8aa0b37cfdb74386e6f67e8ee9e587a00a970cf059afa5`.

The initial implementation findings have been resolved without weakening the fixed expectations: scalar marker checks bind the named result and full stored-source adjacency; source-stated optional qualifiers cannot be dropped; the explicitly caveated unsupported-language branch separates literal numeric transcription from unestablished context. Historical red logs remain preserved.
