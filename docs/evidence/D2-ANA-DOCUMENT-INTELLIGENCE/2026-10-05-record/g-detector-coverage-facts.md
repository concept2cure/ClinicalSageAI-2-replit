# Every contradiction detector says what it read, and whether it read all of it (2026-10-19)

**Row:** D2 (AnA document intelligence). **Workstream:** the consistency toolset.

## The owed item, audited

The previous step fixed one detector that dropped findings inside itself and left this owed:
*"the other five detectors in `scanProjectFull` were not audited for the same pattern. They have no
`.slice` and no early empty return that I found, but I did not write a test per detector."*

Audited. **All five have the same class of defect**, by a different mechanism — a capped read:

| Detector | Bound |
|---|---|
| `detectAssumptionDrift` | `assumptionRegistryService.search({ limit: 200 })` |
| `detectDecisionActionInconsistency` | `limit: 200` |
| `detectCrossJurisdictionalDivergence` | `limit: 200` |
| `detectStatusConflict` | `limit: 200`, twice |
| `detectBodySpecificExpectationConflict` | `content.length < 100` skipped; `.slice(0, 3)` |

A project with 201 active assumptions has its 201st onward **never compared**, and the detector
returns its findings as though it had compared everything. The harm is the one
`contradiction-scan-failclosed.test.ts` already names: `summary.total` is a floor,
`buildPreflightContradictionContext` reads it as `blockingCount`, and `decision-lifecycle-service`
renders a 0 as **"No pending decisions or contradictions"**.

A second, quieter case the audit turned up: `if (group.length < 2) continue` is *correct* — a group
of one has no pair — but it means a project where every category holds one assumption compared
nothing and returned `[]`, indistinguishable from "compared everything, found no drift".

## What runs now

**One coverage shape, not two.** The previous step introduced `CrossArtifactCoverage` for a single
detector. A second shape for the other five would be the duplication this lane has spent three
commits removing, so it is generalised to **`DetectorCoverage`** and the cross-artifact detector
reports in it like the rest:

```ts
{ detector, read, readLimit?, readTruncated, skipped, compared, recorded, recordTruncated,
  comparedNothing, found? }
```

Every detector returns `{ findings, coverage }` through one helper, `concluded()`, which derives
`recorded` and `comparedNothing` rather than letting each detector assign them. `scanProjectFull`
and `scanProject` both collect `coverage: DetectorCoverage[]` and set `summary.incomplete` when
**any** detector was short. `buildPreflightContradictionContext` carries the array, and the rendered
summary **names which detector was short and why**:

> `contradiction scan incomplete (assumption_drift: read stopped at 200, cross_artifact_content: 10 of 25 recorded)`

`readTruncated` is `read >= readLimit`: a limited read that comes back **under** its limit saw
everything there was, and is not reported as short.

## Two design errors of my own, both caught by the tests

**`comparedNothing` hand-set five times.** The first version had each detector assign it. Five
assignments is five chances for one to sit behind a branch that does not run, and one did:
`status_conflict` reported `comparedNothing: false` having read nothing. A print of the real scan
output showed it. It is now derived in `concluded()`, in one place, and the cross-artifact
detector's early return was routed through `concluded()` too, so the derivation cannot be bypassed.

**`found` overloaded with two meanings.** I first used one field for both "pairs compared" and
"issues found". In `detectAssumptionDrift` it counted pairs; in the cross-artifact detector it
counted issues. So two sections that were compared and **agreed** (0 issues) were reported as having
compared nothing. The fields are now separate — `compared` for units compared, `found` for issues
found — and the type says why.

Neither was caught by reasoning. Both were caught by a test asserting the honest outcome, and the
second only because the suite included a case where a comparison *succeeds and finds nothing*.

## Verified by making the check fail

`contradiction-detector-coverage.test.ts` was written and run before the change: **12 of 12 red**,
across the read limit at and under its bound, nothing-to-read, a single unpaired record, the uniform
shape for all six detectors, `recorded` matching the findings returned, and the scan-level flag.

Two pre-existing tests broke and were migrated rather than weakened:

- `contradiction-scan-failclosed.test.ts`'s success case asserted `resolves.toEqual([])`; it now
  asserts `{ findings: [], coverage: { detector: 'approved_vs_working_drift', comparedNothing: true } }`.
  Its three rejection assertions — the gate this change must not weaken — are untouched and pass.
- `contradiction-scan-project-scope.test.ts` failed with `driftFindings is not iterable`, which
  found a **second aggregator** I had missed: `scanProject` also spread the detectors' results. It
  now collects coverage and reports `incomplete` on the same contract as `scanProjectFull`.

One external caller was migrated: `assumption-registry-service.triggerDriftDetection` logged
"Assumption drift detected" or nothing. It now logs *"nothing established"* when the read was
truncated or no pair existed, because "no drift found" and "no drift" are different sentences.

## What this does not do

- `detectBodySpecificExpectationConflict` is **not** migrated. It is the one detector that runs only
  when a regulator body and submission type are supplied, it has its own `.slice(0, 3)` and
  `content.length < 100` skip, and it is not in the six this change covers. **Owed.**
- The read limit stays 200 and the record cap stays 10. Both are now named constants
  (`DETECTOR_READ_LIMIT`, `CROSS_ARTIFACT_FINDING_CAP`) and exceeding either is reported. Whether
  those are the right numbers is a product question this does not answer.
- `coverage.compared` for the record-per-rule detectors is the record count, not a pair count,
  because those detectors check each record against a rule rather than pairing. The type says so.
