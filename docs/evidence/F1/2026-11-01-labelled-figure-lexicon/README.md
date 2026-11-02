# The labelled-figure lexicon read 20% of ordinary regulatory prose

**Package:** F1 (Repairs: defects in shipped behaviour; no new screen, mount or table).
**Date:** 2026-11-01.

## What already exists (RULE 3)

`extractNumericalFacts` is the platform's **one** labelled-figure extractor — a guard test,
`intelligence/__tests__/one-labelled-figure-extractor.test.ts`, refuses a second one and
records that a parallel copy (`ana/dossierReconciliation.ts`) was deleted and folded into it
on 2026-10-19. Seven services read figures through it:

| Service | Path |
|---|---|
| Truth engine — figure consistency | `server/services/truth-engine/figure-consistency.ts` |
| Harmonize engine | `server/services/harmonize-engine.ts` |
| Mined-figure reconciler | `server/services/reconciliation/mined-figure-reconciler.ts` |
| Device-document reconciler | `server/services/reconciliation/device-document-reconciler.ts` |
| Terminology consistency | `server/services/ana/terminology-consistency.ts` |
| Living record — document binder | `server/services/living-record/document-binder.ts` |
| Living record — document citations | `server/services/living-record/document-citations.ts` |

Whatever the lexicon cannot see, none of them can compare. Nothing new was built: the table
was widened, one false positive removed, and the table itself split into its own module.

## The measurement

`recall.ts` (filed here) runs the real extractor over `corpus-pubmed-abstracts.json`:
fifteen phase-III randomised-trial abstracts from PubMed — open literature, and the nearest
public corpus to the prose a CSR and a Module 2.5 are written in. A sentence counts as
"governed" when it states a figure a reviewer reconciles.

```
sentences with a number:              145
...of which state a governed figure:  123
...of which the lexicon labels:        24  (20%)      ← before
...of which the lexicon labels:        58  (47%)      ← after
```

| label | before | after |
|---|---|---|
| confidence_interval | 1 | **31** |
| hazard_ratio | 0 | **24** |
| sample_size | 5 | **12** |
| median_followup_months | — | 7 |
| median_pfs_months | — | 3 |
| median_age_years / mean_age_years | — | 1 / 1 |
| p_value, duration_weeks, sites, events, response_rate | 14, 12, 2, 1, 1 | unchanged |

## What was wrong, and what changed

Four mechanical shapes, every one the ordinary way the figure is written:

1. **A comma between a figure's name and its number.** Every pattern allowed `of`, `was`,
   `is`, `=` and `:` — and no comma. "hazard ratio, 0.65" and "95% CI, 0.53 to 0.79" are how
   journals and CSRs overwhelmingly write them. One shared `TO_NUMBER` connector now serves
   every pattern, so this is one idea applied once rather than twenty edits.
2. **A qualifier between them** — "hazard ratio **for death**, 0.64". Bounded to 28
   characters of letters, spaces and hyphens so it cannot run across a clause.
3. **The count before its verb** — "A total of 496 patients **were randomly assigned**",
   "Of 994 patients who underwent randomization". Both `sample_size` patterns required the
   keyword first, so the passive voice — how a CSR states its own enrolment — was invisible.
   This is the change `figure-consistency`'s own header asked for by name on 2026-10-26.
4. **Six figures with no label at all**: `median_pfs_months`, `median_os_months`,
   `median_dfs_months`, `median_followup_months`, `mean_age_years`, `median_age_years`.
   The three survival medians are **distinct labels on purpose** — one `median_survival`
   would compare a protocol's median OS against a CSR's median PFS and call the difference a
   conflict, which is the fabricated finding this engine exists to prevent. Mean and median
   age are separate for the same reason. A duration reads as months whichever unit it was
   written in, so a CSR's "38.3 months" and a publication's "2.1 years" are one figure
   rather than two incomparable ones.

### A false positive, removed

`\bOR\b` sat inside a case-**insensitive** pattern, so the English word "or" was an odds
ratio. Measured live before the change:

```
"Subjects received either the 0.3 or 0.5 mg dose once daily"        → odds_ratio=0.5
"a Type II variation or 0.25 of the annual fee is refunded"         → odds_ratio=0.25
"Patients were stratified by region or 0.5 mg stratum"              → odds_ratio=0.5
```

In an engine that reconciles documents against each other this is worse than a miss: it
manufactures a conflict between two texts whose only crime is the word "or" before a
decimal. The spelled-out names keep the `/i/` flag; `OR` and `HR` are matched
case-sensitively.

### The guard the widening made load-bearing

Teaching the lexicon the passive voice also teaches it to read each **arm's** count.
Measured the moment it could, before `figure-consistency`'s `ARM_LEVEL` guard was widened:

```
claim   "A total of 496 patients were randomly assigned to receive pembrolizumab,
         and 498 to receive placebo."
source  "In total 994 patients were randomised in this study…"
→  conflict   sample_size: 496 vs 994
```

Both numbers are right — one is an arm, one is the total. The guard now keys on the
destination a count was assigned **to** ("to receive X", "to the X group", "in the X arm",
"per arm") rather than the old "patients to" adjacency, which the passive voice puts five
words out of reach of. Four shapes are pinned, and a case proves a passive-voice **total**
is still compared.

## Verified by making the check fail

- `cross-artifact-consistency-ordinary-prose.test.ts` is new: 18 cases drawn from the real
  corpus, **14 red** before the change, with the two negative controls already green.
- `figure-consistency.test.ts` gained the four arm-level shapes, **red** before the guard
  was widened, and a case holding that a passive-voice total is still compared.
- `one-labelled-figure-extractor.test.ts`'s detector only knew inline regex literals, so a
  second lexicon built with a helper would have walked past it. Strengthened, then proven by
  planting one: it reports `second-lexicon-probe.ts (3 rows)`. The probe was deleted.

## A correction, recorded

Mid-change I gated `checkInternalNumericalIntegrity` so that only labels a document states
**once** could be review candidates — reasoning that two correct hazard ratios (PFS and OS)
would now flag. Three existing tests went red and they were right: the repo already solves
this with a deliberate two-layer split. `checkInternalNumericalIntegrity` **is** the
conservative "candidates, not divergences" layer, and the narrowing to document-level
singletons lives one layer up in `ana/terminology-consistency.checkValueConsistency`, whose
header records that grouping by bare label "flagged every real results section HIGH". My
gating collapsed the two layers and suppressed a true contradiction — a confidence interval
reported one way in the text and another in Table 14.2. It was reverted in full.

## What it still does not read, and why that is the right answer

47%, not 100%. The remaining misses are overwhelmingly **arm- or event-qualified**:

```
"Grade 3 or higher treatment-related adverse events occurred in 44.6% … and in 42.9% …"
"Neutropenia … was reported in 32.3%, 46.1%, and 43.2% in the three groups"
"Estimated 36-month overall survival was 94.1% … 87.7% … 85.9%"
```

A label with no arm and no event in it would compare one arm's neutropenia against
another's and call the difference a conflict. Carrying that qualifier through the lexicon,
the comparators and the reconcilers is a **design change, not a pattern**, and it is
recorded as open rather than bodged in. The rest of the misses are prose with no figure in
it, which the lexicon is right to ignore.

> **2026-11-02 — that design change already exists, and it is not in this lexicon.**
> `server/services/truth-engine/clinical-claims/` (8,476 lines) models the whole frame — study
> or pool, population, **arm**, measure, scope, endpoint, effect type, scale, interval — and
> refuses a verdict when any slot differs or is unstated, with reason codes `arm_unidentified`,
> `per_arm_vs_total` and `unrecognised_qualifier`. Three callers reach it; the submission
> consistency route, which reads through this lexicon instead, does not. Measured both ways:
> `docs/evidence/F1/2026-11-02-two-figure-engines/`. Widening this table with a qualifier would
> be a second, shallower copy of `ClaimFrame`, so it is NOT the work — which direction the
> convergence runs is a RULE 3 decision and needs one measurement on real saved sections that
> nobody has yet taken.

## The split

The table outgrew its host: `cross-artifact-consistency.ts` crossed the 500-line ceiling, and
the warning ratchet refuses that. RULE 6 says split, not trim. The lexicon moved to
`server/services/intelligence/labelled-figures.ts`, unchanged, and
`cross-artifact-consistency` — which is a *consumer* of it, comparing a draft against a
project's artifacts — re-exports every name, so none of the seven callers moved. That the
vocabulary was buried inside one of its own callers is part of why its narrowness was easy
to miss. The one-lexicon guard follows the table to its new home and two cases hold the
split honest: the old module keeps no table, and every name a caller imported still
resolves through the old path.

**Gates:** `tsc --noEmit` 0 errors; ESLint 0 errors and no file gained a warning;
954 tests across 65 files covering the lexicon and all seven of its consumers.
