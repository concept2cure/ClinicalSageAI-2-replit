# A detector that dropped findings inside itself reported as a detector that found nothing (2026-10-19)

**Row:** D2 (AnA document intelligence). **Workstream:** the consistency toolset.

## How this was found

The previous step's evidence left one question owed: *"whether `contradiction-engine-service.ts`
(1867 lines, 57 importers) and `ana/evidence-contradiction-detector.ts` duplicate each other is a
separate question and is owed."*

**The answer is no, and it is worth writing down so nobody asks again:**

- `ana/evidence-contradiction-detector.ts` is pure and pre-synthesis. It compares the **structured
  fields** of evidence claims AnA's tools produced (subject, metric, value, polarity, date) and says
  so in its own header: *"it operates ONLY over the STRUCTURED fields of each claim — NOT over free
  text."* No lexicon, no text mining.
- `contradiction-engine-service.ts` is a **governed workflow service**: source-of-truth hierarchy,
  authority states (advisory → blocks_promotion), review threads, consequences, tenant context. Its
  only numeric code is id parsing and a word-length delta.

Different inputs, different lifecycles. Not duplicates — of each other or of the labelled-figure
path.

But answering it surfaced something else. At line 1425 the governance service does:

```ts
const { HarmonizeEngine } = await import('./harmonize-engine.js');
```

It **consumes** Harmonize's issues and turns them into governed `ContradictionFinding`s with
`sourceClassification: 'deterministic_rule_conflict'`, which carries authority state
`requires_review` and consequence `review_thread`. So the lexicon fixed in the previous step was
feeding the governance layer — the three defects there (raw-string comparison, the cartesian
product, the CI level read instead of its bounds) and the invisible sample-size conflict were
reaching **governed findings**, not a lint-like report. That propagation was real and unclaimed.

## The defect this step fixes

`detectCrossArtifactContentConflict` did to itself exactly what this directory's own
`contradiction-scan-failclosed.test.ts` was written to stop:

```ts
for (const issue of significantIssues.slice(0, 10)) { … }
```

Every significant issue past the tenth was **dropped silently**. The promise resolved,
`detectionMethods` still asserted `cross_artifact_content` had run, and `summary.total` came back
short. That is the undercount the fail-closed gate's own comment describes:

> a dropped detector undercounts findings — summary.total and, via
> buildPreflightContradictionContext, blockingCount/unresolvedCount fall below the truth
> (potentially to 0)

and the chain ends where that test says it ends: `decision-lifecycle-service` renders a 0 as
**"No pending decisions or contradictions"** — a positive assertion of cleanliness.

`.slice` also took Harmonize's own order, so a **critical** sample-size conflict could be dropped in
favour of ten `error`-severity ones.

Two quieter versions of the same thing:

- fewer than two artifacts with readable content returned `[]` while `detectionMethods` still listed
  the detector, so *nothing was compared* read as *nothing is wrong*;
- an artifact whose text came in under 50 characters was skipped with no count.

None of this is about whether a bound is right. A bound on writes is reasonable. **Reporting a
bounded result as a complete one is not.**

## What runs now

A `CrossArtifactCoverage` record travels with the findings — `sectionsRead`,
`sectionsSkippedShort`, `issuesFound`, `findingsRecorded`, `truncated`, `comparedNothing` — and:

- the bound is **worst-first**: `findingSeverityOf` is named once so the order the bound keeps and
  the severity it records cannot drift apart. Sorting by one and recording the other is how a
  "worst first" bound quietly stops being one.
- `scanProjectFull`'s summary carries `incomplete`. The fail-closed gate covers a detector that
  **crashed**; this covers one that quietly returned less than it found.
- `buildPreflightContradictionContext` carries `scanIncomplete` and the coverage.
- `computeContradictionAwareStatus` carries `contradictionScanIncomplete`, and its summary says
  *"contradiction scan incomplete: fewer than two artifacts could be compared"* or
  *"…: 10 of 25 cross-artifact issues recorded"* — **whatever the count, including 0**. A non-zero
  count from an incomplete scan reads *"at least N contradiction(s)"*, because the count is a floor.

The method's own comment already recorded this decision for a **failed** read: *"A failed read left
the counts at 0 and the summary at 'No pending decisions or contradictions'; it now fails, rather
than reporting none."* This is the complement — a scan that succeeded while dropping findings.

## Verified by making the check fail

All eight cases in `contradiction-cross-artifact-coverage.test.ts` were written and run before the
change: **8 of 8 red**, on the truncation, the severity order, the nothing-compared case, the
skipped-short count, and the complete case. Then three more in
`contradiction-aware-status-tenant.test.ts` — the file that already holds the failed-read version of
this sentence — **3 of 3 red** on the rendered summary.

The pre-existing `contradiction-scan-failclosed.test.ts` passes unchanged, which matters: this
change must not weaken the gate it sits beside.

## One honest limitation in the tests

The three preflight/rendering cases **stub the detector** rather than drive artifacts through all
six detectors. That is deliberate and the test says so: driving the database mock through
`scanProjectFull` delivered 0 artifacts to this detector while the same mock delivered 2 when the
detector was called directly, so a test built that way would have been asserting the harness rather
than the wiring. The property under test is the path from a coverage record to the rendered
sentence, and that is what is asserted.

## What this does not do

- The bound is still 10 (`CROSS_ARTIFACT_FINDING_CAP`), now named and worst-first. Whether 10 is the
  right number is a product question this does not answer; what changed is that exceeding it is
  reported.
- The other five detectors in `scanProjectFull` were not audited for the same pattern. They have no
  `.slice` and no early empty return that I found, but I did not write a test per detector.
  **Owed.**
- `evidence-contradiction-detector.ts` is untouched. It is not a duplicate and had no defect of this
  class.
