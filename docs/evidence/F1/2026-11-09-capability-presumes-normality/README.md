# A capability index read as a tail probability it did not carry

**Package:** F1 (repairs: defects in shipped behaviour; no new screen, mount or table).
**Date:** 2026-11-09. **Completes:** `server/services/cmc/process-capability.ts`.
**Found by:** the external market study for P-113 — a CPV source noted that Cpk cannot be estimated for non-normal
data and that Ppk on percentiles is used instead (`docs/evidence/S7/2026-11-09-cmc-scope-market-and-roadmap/`).

## The defect

`(USL − x̄) / 3σ` converts a margin into a tail probability **only if the series is approximately normal**. The
engine computed Cp, Cpk, Pp and Ppk that way, cited ISO 22514-2 and the individuals/moving-range convention, and
said nothing about that presumption.

The CMC case where it fails is the common one. An impurity or a degradation product has a **one-sided upper
limit**, is **bounded below at zero**, and is usually **right-skewed** near the limit of quantitation. For such a
series the normal-theory index is **optimistic** — it understates the chance of exceeding the specification — and
that number reaches §3.2.S.4.5 / §3.2.P.5.6 justification of specification, the CPV report, and
`capabilitySentence`'s one line in the composed section.

A number that reads as a tail probability and is not one is the same class of fault as a gate that is stated and
not enforced: the reader takes it as having been computed on the assumption it names.

## What the engine already did well (RULE 3)

This is a repair, not a rebuild. Before this change the engine already:

- refused rather than answered on fewer than six batches, no parseable criterion, no variation, or criteria that
  disagree, each with its own code and sentence;
- marked a series under 25 batches **preliminary**, saying the sampling error is wide;
- named every batch outside the specification and every non-numeric result excluded, rather than folding them in;
- reported the 1.33 / 1.00 grades **as grades**, saying ICH sets none;
- flagged `|Cpk − Ppk| > 0.25` as a drifting or shifting process.

The one thing it did not say is the one the whole formula rests on.

## The change

| Added | What it holds |
|---|---|
| `skewness` | the adjusted Fisher–Pearson coefficient **G1**, or **null** when the series is too short for the estimate to mean anything. Null is *"not assessed"*, never *"symmetric"* |
| `materiallySkewed` | true only when **\|G1\| exceeds twice its own standard error**, `SE(G1) = √(6n(n−1) / ((n−2)(n+1)(n+3)))` |
| a note | states the presumption, the measured skewness against its standard error, and **which way it bites** |

**The threshold is the data's, not mine.** Comparing |G1| to 2·SE(G1) self-scales with n: a short series cannot
trip it, and is reported as not assessed rather than as normal. A fixed cutoff like |G1| > 1 would have fired on
noise at n = 8 and been silent on a real skew at n = 60.

**The direction is the actionable half.** A tail running *toward* the limit means the index is **optimistic**; a
tail running *away* from it means the index is **conservative** on that side. Saying only "this series is skewed"
would leave a reader to work out which, and the two have opposite consequences for a filing. For an assay with
`NLT 98.0%` a right skew is conservative; for an impurity with `NMT 0.5%` the same skew is optimistic.

**The index and the verdict are unchanged.** The note is a statement *about* the number, not a different number.
Moving to ISO 22514-2's non-normal percentile families would change values that reach a filing, which is a
methodological decision and not a session's — it is recorded in P-113's roadmap instead. A case pins that Ppk is
still exactly `(0.5 − x̄) / 3s` on the skewed series.

**No consumer changed.** `capabilitySentence` already renders `notes.join(' ')`, so the sentence reaches the
filed section by the route the other four notes already take:
`assessRecordedCapability` → `capabilitySentence` → `batchCapabilityRendering` → §3.2.S.4's narrative
(`module3Composer.ts:836`). **That path is now tested, not read** — see the second suite below.

## Verified by making each check fail

| Run | What it reported |
|---|---|
| `01-red.txt` — the change not yet made | 5 of 15 red, from *"no skewness was reported for a visibly skewed series"* to *"a right-skewed impurity series was reported as if normal"* |
| `03-mutation-direction-always-optimistic.txt` — the direction hard-coded toward the limit | *"expected 'Preliminary: 12 batches. A capability…' to match /conservative/i"* — the assay case, where the skew runs away from the limit |
| `04-mutation-shape-judged-from-six-batches.txt` — the `n` floor removed | *"expected true to be false"*: six batches were judged skewed, which the estimate cannot support |
| `05-mutation-nothing-is-ever-skewed.txt` — `materiallySkewed` forced false | 2 red, both directions |
| `06-mutation-the-note-never-reaches-the-section.txt` — the note computed and not pushed | 5 red, including the composer case: *"the capability index reached §3.2.S.4 without the presumption it rests on"* |
| `02-green.txt` | 34 of 34 across the three capability suites |

Tests, two suites:

- `services/cmc/__tests__/process-capability.test.ts` (+6, 15 total) — the measured skewness, the presumption
  stated, the direction both ways, the index left alone, a symmetric series left silent, and a six-batch series
  reported as not assessed rather than normal.
- `services/cmc/__tests__/capability-shape-reaches-the-section.test.ts` (new, 4 cases) — **the claim that
  matters**: eleven right-skewed impurity results against `NMT 0.5 %`, composed through the real engine, and the
  §3.2.S.4 narrative carries the presumption, the direction, and still the index. Written because the first draft
  of this evidence asserted that path from *reading* `module3Composer.ts` rather than from a test, and said so.
  The phase-4 acceptance fixture could not have caught it: it records five QC results, and capability refuses
  below six batches, so the shape note never fires there.

## Gates

`tsc --noEmit` 0 errors. `ci:pushed-lint-warnings`: no file changed its warning count — `assessProcessCapability`
reached 103 lines and `distributionNote` is the extraction that answered it. `server/services/cmc` and
`server/services/regulatory`: **151 files, 2,522 cases** (before the composer suite was added).

## The larger question this leaves open, for P-113

Whether a materially skewed series should be reported with a **percentile-based** index (ISO 22514-2's non-normal
families) instead of a note is a change to numbers that reach a filing. It belongs with the roadmap's other
methodological items, not in a repair.
