# One labelled-figure lexicon, one normaliser, one grouping engine (2026-10-19)

**Row:** D2 (AnA document intelligence). **Workstream:** the consistency toolset.

## What was owed

My own record from 2026-10-12 named "the seven-way duplication of cross-document figure
consistency" as owed, including **two modules I had shipped myself**. That framing turned out to be
wrong in an instructive way, and getting it right was most of this work.

## What was actually duplicated

Reading all eight candidates showed that most were *not* duplicates:

| Module | Verdict |
|---|---|
| `reconciliation/dossier-number-reconciler.ts` | **Canonical.** The cross-document grouping engine: groups already-extracted figures by quantity, with tolerance, clusters, consensus, severity, and the `not_assessed` verdict row 74 built. |
| `reconciliation/device-document-reconciler.ts` | **Already migrated.** Its own header: *"No new reconciliation logic and no new tables: this is a thin loader + mapper over reconcileDossierNumbers."* |
| `intelligence/consistency-verdict.ts` | **Already canonicalised**, by an earlier session, which recorded it: *"that one is the canonical implementation, so H2/H4's verdictFor, integrityVerdictFor and their copy were removed at the merge (zero duplication)."* |
| `truth-engine/clinical-claims/` (mine) | **Not a duplicate.** A different question: clinical *result* figures in frames (incidence by preferred term, effect sizes with CI, by arm and timepoint), pinned by a 431-case corpus. |
| `authoring/section-claims-check.ts`, `authoring/document-figure-consistency.ts` (mine) | **Not duplicates.** Two callers of that engine. |

The real duplication was narrower and sharper: **three copies of one labelled-figure lexicon** —
the regex table that mines regulatory prose for a number attached to a curated label — and **two
copies of the cross-document grouping** over it.

| Copy | Labels | State |
|---|---|---|
| `intelligence/cross-artifact-consistency.ts` | 27 | Canonical. Honest `notCompared`/`truncated`, signed CI bounds, set comparison. |
| `ana/dossierReconciliation.ts` | 8 | **Deleted.** Five labels had no counterpart; it also held a second grouping implementation. |
| `harmonize-engine.ts` `checkNumerics` | 6, inline | **Migrated.** No test coverage of any kind. |

`ana/terminology-consistency.ts` imported from **two of them at once** — `extractNumericalFacts`
from one, `checkFigureArithmetic` from the other. That is what a parallel path looks like from
inside.

## What runs now

**One lexicon.** The canonical table gained the five labels only the deleted module had — `alpha`,
`power`, `events`, `sites`, `hazard_ratio` — plus `odds_ratio` and `response_rate` from the
harmonize copy, and the **enrolled-N prose form**. That last one matters on its own: the canonical
`sample_size` pattern required an `=`, so *"randomized 240 patients"* was invisible to it.

**One normaliser.** `numericValueOf` and `compareDecimalsFor` hold the per-label rules once. A
`power` of "90%" was 0.9 in one module, the string `"90"` in the second, and never compared in the
third; it is 0.9 everywhere now. `numericValueOf` returns **null** for a value that is not a number
(`predicate_knumber` is "K123456") — never 0, because a 0 standing in for a figure nobody read
agrees with the next 0.

**One grouping engine.** `reconciliation/mined-figure-reconciler.ts` mines text with the canonical
extractor and hands the figures to `reconcileDossierNumbers`. It adds no reconciliation logic,
which is the point — it is the third feeder of one engine, beside the device reconciler. The
`reconcile_dossier_numbers` tool now returns that engine's report.

**The arithmetic check was never duplicated**, so it kept its code and gained its own file:
`ana/figure-arithmetic.ts`. It recomputes what one text's own figures imply ("4.6% (15/305)" — 15/305
is 4.9%), which is a different question from comparing two documents.

## Three defects the migration fixed, not just dedup

`harmonize-engine.checkNumerics` had **no tests at all**, and was the loosest of the three:

1. **It compared raw strings.** "0.70" against "0.7" was a conflict.
2. **It keyed facts by `label + the first 30 characters of the match`**, so the same quantity
   written two ways never paired — and it compared every value of a label in A against every value
   in B, so a label stated twice in each section produced a cartesian product of false critical
   blockers. (The same defect `cross-artifact-consistency` had already fixed for itself:
   *"Drug X n=305; placebo n=303" against a CSR that lists placebo first was a false critical blocker.*)
3. **`confidence_interval` captured the CI's LEVEL, not its bounds.** `(\d+(?:\.\d+)?)\s*%\s*CI`
   reads the *95* in "95% CI 0.10 to 0.30". So two sections stating different intervals at 95% never
   conflicted, and the same interval at 95% and 99% always did.

And a fourth, found only by writing the tests: **its `sample_size` pattern required an `=`**, so a
real enrolled-N conflict between Module 2.5 and Module 5.3.5 — the exact finding the engine exists
for — was **invisible to it**. Four of the eight new tests fail against the old method; that output
is filed.

The `reconcile_dossier_numbers` tool also gains the honesty the deleted implementation could not
express: it listed every label it saw once in `consistentLabels`, so a figure compared against
nothing read as agreeing. The engine has separated `not_assessed`/`no_shared_quantities` from clean
since 2026-09-28, and the tool's instruction now says *"NOTHING was compared"* plainly.

## One regression I introduced, caught by an existing test

Clamping the comparator's precision to each label's own `compareDecimalsFor` made two hazard ratios
of **0.7104 and 0.7096 agree** at three places — losing a conflict that
`figure-consistency.test.ts` had pinned since an adversarial review of its first version. The clamp
also bought nothing: the coarser of the two written readings already handles a power normalised from
"90%" against a written 0.900, because 0.9 carries one decimal. **Removed**, with the reason written
at the line.

A second self-inflicted bug: splitting `figure-arithmetic.ts` out left `roundDp` behind, because it
was defined *above* the cut point. `clinical-arithmetic.test.ts` failed with
`ReferenceError: roundDp is not defined` — the existing suite caught it before the typecheck did.

## Verified by making the check fail

- **Red first.** `one-labelled-figure-extractor.test.ts` was written and run before any production
  file changed: 18 of 18 red, the duplication detector naming all three lexicons.
- **The old harmonize method restored on the green tree**, its eight new tests run against it:
  4 failed, naming the string comparison, the cartesian product, both directions of the CI-level
  defect, and the invisible sample-size conflict. Restored, green again.
- Two cases **pass under both** implementations for different reasons — the old one extracted
  nothing where its pattern needed an `=` — and the evidence says so rather than counting them as
  proof.
- The detector was narrowed once, honestly: it first named `translation/glossary.ts`, whose lexicon
  pairs labels with regexes for CFR citations and eCTD tokens. It now requires a **numeric** capture.

## What this does not do

- **Three labels were renamed**, and the `reconcile_dossier_numbers` tool reports the canonical
  names: `enrolled_n` and `sample_size_n` are both `sample_size`, and `primary_p_value` is
  `p_value`. One name per quantity is the point, but a caller that parsed the old names will see
  different ones.
- **The tool's report shape changed** to the engine's (`conflicts[].quantityKey` / `values[]`
  instead of `discrepancies[].label` / `distinctValues`). It carries strictly more: verdict,
  `notAssessedReason`, consensus, severity, unit mismatch.
- `contradiction-engine-service.ts` (1867 lines, 57 importers) and
  `ana/evidence-contradiction-detector.ts` were read and left alone: their numeric work is not a
  labelled-figure lexicon. Whether they duplicate each other is a separate question and is **owed**.
- The clinical claims engine and the two Authoring checks are untouched. They answer a different
  question and are not duplicates of this path — which is the correction to my own 2026-10-12 note.
