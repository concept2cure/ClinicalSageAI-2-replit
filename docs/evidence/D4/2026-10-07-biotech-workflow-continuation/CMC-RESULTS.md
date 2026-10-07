# Recorded CMC series and selection qualification results

Date: 2026-10-07. Workstream W3, launch row D4, canonical branch
`concept2cure-v2`. Contract and approved scope additions are in
[CMC-PLAN.md](CMC-PLAN.md). The initial unchanged recorded-data source was
`3400f1f32f7bed7bfa041e390b67407420a30d2d`. This worker did not commit or push.

## Existing boundaries corrected

| Boundary | Corrected behavior |
| --- | --- |
| Unreadable selected study into poolability | Retains unreadable state, names the affected batch instead of calling the attribute absent, and withholds the full selected-programme claim. Actual readable contributor assessments remain visible. A selection without any labelled readable series receives an honest named refusal. |
| Missing/short/excluded selected-batch coverage | Valid subset assessments retain their numbers, IDs and counts. Any excluded selected batch or unassessable recorded parameter prevents `supportedShelfLife`, `limitingParameter` and `limitingDecision` for the full selection; named `claimWithheldReasons` explain the gap. |
| Per-point conditions into pooled series | Mixed conditions, explicit conditions differing from the declared single study condition, and contradictory condition aliases refuse the affected parameter with batch/row reasons. Matching explicit/inherited conditions remain usable. Independent valid parameters remain assessed. |
| Recorded ordinary criteria into shelf life/trending/pooling | Every nonblank criterion is inspected through the existing parser; conflicting complete parsed criteria or present uninterpretable criteria refuse the affected series. Equivalent supported spellings and blank series-level inheritance retain their previous behavior. Neither the first criterion nor a numeric-valid subset substitutes for unresolved evidence. |
| Present result with blank parameter into programme claim | Raw points stay intact, valid labelled series remain fitted, and `unassignedObservations` explicitly names the row. The aggregate claim is held. A blank-parameter row with a genuinely missing result creates no measured-observation hold. |
| Series criterion refusal into Module 3 support | The composer reuses the same exported criterion inspection and existing attribute/condition grouping through its existing `unresolvedObservations` channel. Passing per-point comparisons and raw tables remain, while unresolved series cannot produce the overall "supporting stability" sentence. Criteria split across the existing results fields are inspected as the same combined series used by recorded trending. Separate valid conditions may use separate criteria. |

Production files: `server/services/cmc/recorded-stability.ts` and
`server/services/module3Composer.ts`. New test:
`server/services/cmc/__tests__/recorded-series-qualification.test.ts`.
The numeric parser, public criterion parser, deterministic statistical engines,
raw records, source IDs/hashes, human review/signatures and export/provenance
controls were not changed. No dependency, table, migration, route, model,
surface or scientific conversion was introduced.

## Actual RED and GREEN receipts

- [Initial RED](CMC-RED.txt): **20 failed / 8 passed (28 cases), 1.15 seconds,
  exit 1**, against unchanged recorded-stability production. Valid three-batch
  assessments, equivalent criteria, matching explicit/inherited conditions,
  and unlabelled rows with genuinely missing results already passed.
- First focused GREEN: **28/28, 2.22 seconds, exit 0**. The later full GREEN
  receipt supersedes the short focused output; the initial RED remains intact.
- [Supplementary RED](CMC-MODULE3-RED.txt): **3 failed / 29 passed (32 cases),
  1.29 seconds, exit 1** after the first recorded-series correction but before
  the composer change. Passing points against conflicting 95/90 criteria still
  claimed stability support in both one-field and split-field shapes. The
  third case exposed the all-empty/unreadable selection's misleading absence
  refusal; separate-condition positive control passed.
- [Initial broader regression](CMC-REGRESSION.txt): **18 files passed / 1
  failed; 713 passed / 1 failed (714 cases), 28.57 seconds, exit 1**. The sole
  failure was the inherited route fixture described below. This run is not
  represented as wholly green.
- After Module 3 propagation, the 18-file manifest without that known route
  fixture passed **701/701, 17.47 seconds**. The final complete manifest below
  includes the route and replaces its short interim receipt.
- [Final complete GREEN](CMC-GREEN.txt): **19 files / 718 cases passed,
  27.38 seconds, exit 0**. This includes all **32 new cases**, recorded numeric
  qualification, ordinary criterion parsing, both shelf-life bounds,
  poolability, trending, Module 3 tables/narratives/compiler, QC and the AnA
  recorded-evidence tools.

## Inherited route fixture repaired without weakening the evidence gate

The existing route test "excludes an unfittable batch by name, and says why"
expected the reason "at least 3 numeric results" and a two-batch subset
assessment, but its third batch contained present nonnumeric `conforms`.
The preceding numeric qualification already required a malformed present
observation to refuse the affected parameter. The test input contradicted
its intended insufficient-points purpose.

[Published-source reproduction](CMC-INHERITED-ROUTE-CASE.txt) loads the
actual `3400f1f...` recorded-stability source through an isolated in-memory
module, anchors its imports to the existing deterministic services, and runs
the same fixture. Both that published source and this increment identically
return `assessable: false`, the invalid-observation row reason and no programme
shelf life. This proves the inherited service behavior; it is not a claim of
an independently run whole prior route suite, and no shared file was reverted.

Control tower approved the narrow correction in
`server/api/cmc/__tests__/stabilityPoolabilityRoute.test.ts`: change only that
recorded result from `conforms` to numeric `100`. The exact exclusion and
subset-assessment assertions remain, and the test additionally asserts
`supportedShelfLife: null` for the full three-batch selection. The final
19-file GREEN includes this corrected fixture. The prior failure is retained.

## Static checks and review limits

[Scoped ESLint](CMC-LINT.txt): **0 errors / 24 warnings**, matching the
published production warning counts of 5 for recorded-stability and 19 for
the composer. The new focused test has no warnings; an intermediate test
group length warning was removed by grouping its Module 3 consumer cases
separately. [Route-fixture lint](CMC-ROUTE-LINT.txt): **0 errors / 0 warnings**.
No suppression or baseline change was introduced.

[Static receipt](CMC-STATIC.txt) records actual published-source lint counts
and **zero isolated syntax/transform diagnostics** on both changed production
files and the new test. This is explicitly not semantic or whole-tree
TypeScript validation. `git diff --check` passed. Root owns exact-source
TypeScript/CI, integrated release gates and publication.

These deterministic in-memory software regressions do not qualify a client's
scientific dataset, intended use, staging deployment or agency filing. Legacy
criterion/unit grammar, censoring/missing-data methods, replicate/duplicate
time-point handling, missing product/condition identity, `LT` alias equivalence,
and broader condition/scientific qualification remain outside this increment.
The existing shared parser's permissive legacy numeric suffix behavior is not
claimed to be comprehensively fixed. Single-study missing/insufficient distinct
parameters and unassigned-observation propagation into all Module 3 conformance
policy still require separately approved follow-through. D4 and commercial
deployment are not declared complete.
