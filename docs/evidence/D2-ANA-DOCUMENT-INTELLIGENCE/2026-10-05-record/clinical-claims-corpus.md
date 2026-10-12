# Clinical claims corpus: curation record (2026-10-05)

**Row:** D2 (AnA document intelligence). **Workstream:** the clinical figure claim engine. The product owner reversed the earlier decision not to ship it on 2026-10-05.

**Specification file:** `server/services/truth-engine/__tests__/fixtures/clinical-claims-corpus.json`

**Sources:** six lens corpora written in parallel, each from the 21-item failure specification and the design principle:

- `failure-spec`
- `synopsis-body-27x`
- `pooled-vs-study`
- `label-uspi`
- `effect-measures`
- `eu-intl-conventions`

One curator merged them, validated them, corrected them and removed duplicates. Nothing in this file was run against an engine; it is the specification the engine is built against.

## Counts

**Before curation:** 236 cases and 585 expected rows (292 consistent, 98 conflict, 195 not_compared).

**After curation:** 220 cases and 594 expected rows.

| Lens | Cases | consistent | conflict | not_compared | Cases with a conflict | Cases that must compare nothing (`must_not` holds both) |
|---|---:|---:|---:|---:|---:|---:|
| failure-spec | 40 | 49 | 27 | 37 | 18 | 12 |
| synopsis-body-27x | 37 | 49 | 22 | 26 | 13 | 8 |
| pooled-vs-study | 38 | 30 | 11 | 35 | 10 | 17 |
| label-uspi | 38 | 131 | 13 | 51 | 10 | 9 |
| effect-measures | 30 | 19 | 10 | 15 | 10 | 12 |
| eu-intl-conventions | 37 | 36 | 13 | 20 | 9 | 13 |
| **Total** | **220** | **314** | **96** | **184** | **70** | **71** |

- Three cases have no expected rows: `fs-19`, `lu-26` and `euc-14`. Their `must_not` holds both `conflict` and `consistent`; the engine must compare nothing, and must not report the label as consistent.
- Document types across the 440 sides:

  | Type | Sides |
  |---|---:|
  | csr | 124 |
  | csr_synopsis | 86 |
  | uspi | 54 |
  | m2_7_4 | 50 |
  | m2_7_3 | 44 |
  | iss | 30 |
  | smpc | 26 |
  | m2_5 | 16 |
  | ise | 6 |
  | other | 4 |

- `other` covers Module 2.7.1, a manuscript, a 120-day safety update and a package leaflet.

## Schema (validated on every case)

`{ id, lens, docA:{type,text}, docB:{type,text}, expected:[{measure, scope, outcome, why}], must_not:[outcome], note }`

**Vocabularies:**

- `type` is one of `csr`, `csr_synopsis`, `m2_5`, `m2_7_3`, `m2_7_4`, `iss`, `ise`, `uspi`, `smpc` or `other`.
- `outcome` and every `must_not` entry are one of `consistent`, `conflict` or `not_compared`.

**Mechanical checks, all passing on the output:**

- Every `id` is unique, and no field is empty.
- `must_not` never contains an outcome that `expected` uses.
- `expected` is empty only when `must_not` holds both `conflict` and `consistent`.
- Wherever a case expects a comparison:
  - both texts carry a study identifier, registry number or named pool;
  - both texts name the analysis population for every compared efficacy figure;
  - every compared confidence interval states its level.

**Arithmetic:** every n (%) whose denominator the text states was recomputed. The only arithmetic disagreements are the ones the cases plant deliberately.

**How a test reads a case:**

- **`must_not`:** the engine's output for the pair contains no outcome of that class.
- **`consistent` and `conflict` rows:**
  - They are exhaustive, one row per compared claim. A claim is one value, or one estimate with its interval, for one arm.
  - The rows were audited for figures both documents state; 15 missing N rows were added (see below).
- **`not_compared` rows:** they are the minimum. Each must be reported with its reason. The engine may report further unpaired figures as `not_compared`.
- **`measure` and `scope`:** these are descriptive text in each lens's own vocabulary, not engine keys. A test pairs an expected row with engine output by arm and by the values quoted in `why`. Machine keys belong in the engine change, once its frame vocabulary exists.

## Conventions the expected outcomes rely on

The design principle says a figure is a claim only when its full frame is identified. That frame is:

- measure, population, arm and scope;
- timepoint or analysis;
- effect type, and CI level and sidedness;
- the value with its precision as written.

The lenses applied the principle with different implicit defaults, and some of those defaults contradicted each other. The corpus now assumes the conventions below. A case that needed anything else was corrected.

### C1. Identity comes from the text

- **Study.** A study is identified by its identifier or registry number. A document that names one study scopes all of its figures to that study; a document that names several binds each figure to its own row or sentence.
- **USPI trials.** "Trial 1" binds to a study only through a registry number or study ID stated in the text (`lu-17`).
- **Pools.** A pool is identified by its stated membership and its data cut-off, never by its name (`pvs-11`, `pvs-12`).

### C2. Precision as written

- Two values compare at the coarser of the two written precisions.
- Rounding is half away from zero. The case that depends on it is `lu-01`, where 7.5 against 8 is consistent.
- Trailing zeros count: 2.0 is written to one decimal.
- A bound written 0.00 is a value.

### C3. The only defaults

| Element | Default when not stated |
|---|---|
| Scope | Overall. Any stated subgroup, region, period, stratum or pool qualifier makes a different scope. |
| Population of an adverse-event, death, exposure or laboratory figure | The safety population. "Safety population", "safety set", "safety analysis set", "treated" and "received at least one dose" are one population. |
| CI sidedness | Two-sided. The CI level itself has no default (`em-30`). |
| Contrast | Test versus control. A reversed contrast must be written out. |
| Analysis of a time-to-event figure | The primary analysis. A figure the text marks as the primary analysis matches an unstated one. |
| Model or estimand of an efficacy figure | When the other document has exactly one candidate figure and the text does not mark it as sensitivity, supplementary, supportive or exploratory, the unstated model or estimand is read as the primary. |

**Efficacy populations have no default.** ITT, FAS, mITT, PP and other analysis sets must be named on both sides.

### C4. Measure synonyms

| Treated as the same measure | Except |
|---|---|
| SAE, "serious adverse event" and "serious TEAE" | When a text explicitly includes events before the first dose |
| AE incidence and TEAE incidence in a safety summary | — |
| randomized, randomised, "underwent randomization" and "included and randomised" | — |
| Number words and digits | — |
| British and US MedDRA spellings (diarrhoea and diarrhea) | — |
| "per cent" and % | — |
| "percentage points" and % for a difference | — |
| subject-years and patient-years | — |

### C5. Adverse reactions and discontinuation

- **USPI 6.1 "adverse reactions"** bind to the CSR's all-causality TEAE figure only when the CSR states a single causality basis (`lu-01`, `lu-11` against `lu-12`).
- **SmPC 4.8 "adverse reactions"** are ADRs and never bind to TEAE figures (`euc-11`, `euc-34`).
- **Discontinuation figures** must say whether treatment or the study was discontinued (`sbx-004`).

### C6. Population labels

ITT, FAS, mITT and PP are different populations unless both texts define them identically, for example both as "all randomized" (`lu-18` against `euc-31` and `em-17`).

### C7. Effect types

**Distinct effect types:**

- HR, OR, RR or risk ratio, and rate ratio;
- ratio of (geometric) means;
- risk difference and RRR;
- LS mean difference, and a difference in means whose adjustment is not stated;
- proportion, median, and within-arm change.

**Treated as the same type:**

| Type | Wordings |
|---|---|
| LS mean difference | "LS mean difference", "ETD", "estimated treatment difference", "adjusted mean difference" and "placebo-adjusted LS mean change" |
| Difference in means, adjustment not stated | An unqualified "treatment difference", "difference", "mean difference" or "placebo-adjusted change". It compares only with the same unqualified wording. |
| Risk difference, adjustment not stated (binary endpoints) | "Difference", "risk difference" and "difference in proportions". "Adjusted" or "CMH" makes it a different type (`em-25`, `pvs-31`). |

**Never converted or transformed:**

- scales (percentage points against a proportion);
- units (mmol/mol against %);
- contrast directions.

**Further frame elements:**

- stratified against unstratified;
- assessor (BICR against investigator);
- estimand;
- interval type (credible against confidence).

### C8. Arm binding

An arm is bound by one of these:

- the same sentence: "respectively", "(A vs B)" in the sentence, or "N% of A-treated";
- a table's row or column header.

An arm is never bound across sentences, by position or by value.

### C9. Bounds and approximations are not values

This covers "<1%", "p<0.001", "more than 500", "approximately" and "ca.".

- Against a value, or against a different bound, the outcome is `not_compared`.
- Two identical bound statements are consistent.

### C10. No derivation

The comparator never computes sums, differences, 1 − HR, or rates from counts. A derived figure is not a stated figure.

### C11. Ambiguity fails closed

When the other document has two or more candidate figures that differ only in an element this figure leaves unstated, the outcome is `not_compared` (`em-31`, `em-35`, `em-36`).

### C12. Pools

- A pooled figure is never compared with a single-study figure.
- Two pooled figures compare only when they state identical membership and cut-off.
- Pooling arms within one study makes an arm, not a pool (`pvs-24`).
- "ISS" naming the document is not a pooling marker when the sentence names a single study (`pvs-34`).

## Curation notes

### Expected outcomes changed (1)

- **`sbx-038`, row 1 (HbA1c p-value).** Changed from consistent to **not_compared**. The row said `p=0.0004` against `p<0.001` "agree", while `lu-27` and `lu-06` hold that a bound is not a value. One rule, C9, now applies to both.

### Two answers reduced to one (12 cases)

Each of these notes told the engine it "may", "could" or "should" give a different outcome from the row it annotated. A specification cannot accept two outcomes.

| Case | Outcome now pinned |
|---|---|
| `fs-12` | headache rows are a conflict / consistent |
| `fs-26` | not_compared; scale is not converted |
| `fs-39` | n (%) layout is read |
| `sbx-006` | consistent; population added |
| `sbx-007` | conflict; population and effect type added |
| `sbx-021` | C4 equivalence |
| `sbx-031` | anaphora rewritten |
| `sbx-033` | arms added |
| `sbx-039` | population added; point estimate consistent |
| `em-02` | study added instead of "document metadata" |
| `em-26` | not_compared; no sign transform |
| `euc-24` | not_compared |

### Texts corrected so the expected outcome holds under the principle (outcomes kept)

**Study not named on one or both sides.** The `scope` column named a study the texts never named, so a "consistent" or "conflict" verdict compared figures that could belong to different trials. A study header or in-sentence identifier was added in:

- **failure-spec:** `fs-21`
- **synopsis-body-27x:** `sbx-001`, `002`, `003`, `006`, `007`, `008`, `009`, `010`, `012`, `013`, `014`, `017`, `019`, `020`, `021`, `023`, `024`, `027`, `031`, `033`, `035`, `036`, `038`, `039`, `040` and `042`
- **pooled-vs-study:** `pvs-33`
- **label-uspi:** `lu-03`, `lu-11`, `lu-13`, `lu-15` and `lu-20`
- **effect-measures:** `em-02`, `em-07`, `em-11`, `em-12`, `em-15`, `em-16`, `em-18`, `em-22`, `em-24`, `em-25`, `em-27`, `em-33`, `em-34`, `em-37`, `em-38` and `em-39`

`lu-29` is a related case. Its CSR named PRX-301 but not the registry number that binds the label's "Study 1"; the NCT number was added.

**Efficacy population not named.** The analysis population was added in:

- `sbx-006`, `sbx-007`, `sbx-008`, `sbx-009`, `sbx-013`, `sbx-038` and `sbx-039`
- `pvs-04` and `pvs-33`
- `lu-15` and `lu-16`

`lu-20` and `lu-33` used an ITT label the text never defined. The labels' standard definition, "all randomized", was added.

**Effect type not identical.** In each of these, one side wrote an unqualified "difference" against an "LS mean difference" (C7):

- `sbx-007` and `sbx-008`
- `em-15` and `em-22`
- `lu-33`
- `fs-29`, where the body-weight figure did not even say it was a difference

**Arms inherited across sentences, or not named at all.** Arms added in:

- `fs-03`
- `sbx-009`, `sbx-012`, `sbx-033` and `sbx-040`
- `em-01`

`sbx-031` is related: its "the corresponding rates" was rewritten to name the measure and the arms.

**Discontinuation of what (C5).** The texts now say whether treatment or the study was discontinued in `fs-01`, `fs-03`, `pvs-09` and `lu-11`.

**Death window stated on one side only.** `lu-25`'s ISS said "during the treatment-emergent period" while the label stated no window; `sbx-026` makes the window part of the frame. The phrase was removed.

**Safety Set undefined against "received at least one dose".** `sbx-042`'s Safety Set definition was added. `sbx-003`'s disposition denominator ("of randomized subjects") was added.

### Rows split or added

**Split into one row per arm** (12 grouped rows became 27):

- `lu-08` (3 rows), `lu-09`, `lu-18`, `lu-29` (3 rows) and `lu-33`
- `sbx-009` and `sbx-012`
- `euc-12`

**Added for exhaustiveness** (15 consistent rows). Both documents state these per-arm or total N in the same population, but no row compared them:

- `lu-08` (2), `lu-11` (1), `lu-14` (2), `lu-21` (1) and `lu-29` (3)
- `euc-12` (2) and `euc-26` (2)
- `em-25` (2)

### Dropped as duplicates (16)

Each dropped case was a near-identical test of a case that was kept. Where possible the kept case is the one that carries the reviewer's exact finding.

| Dropped | Kept | Same test |
|---|---|---|
| `sbx-016` | `fs-08` | Primary in both, key secondary in one |
| `sbx-022` | `fs-21` | "N% of them resolved" after the SAE arm rates |
| `sbx-028` | `fs-37` | Renal impairment and "In women" subgroups |
| `pvs-03` | `fs-16` | ISE pooled estimate against a CSR |
| `em-03` | `fs-25` | HR 0.75 against risk difference −3.1% |
| `em-08` | `fs-28` | Comma-P CI, key secondary in one |
| `em-09` | `fs-02` | FEV1 0.10 against 0.14 |
| `em-10` | `fs-02` | CI 0.00 against −0.40 (`euc-10` keeps the decimal-comma form) |
| `em-13` | `fs-26` | 15.2% against 0.152 |
| `em-14` | `sbx-015` | Week 12/26 against Week 52 (`euc-19` keeps the identical-numbers trap) |
| `em-19` | `fs-37` | Prior-MI subgroup HR |
| `em-21` | `sbx-041` | Per-arm values against a stated difference |
| `em-28` | `fs-23` | Effect estimates from different studies |
| `em-29` | `fs-16` | Pooled against single-study efficacy (`pvs-23` keeps the identical-point-estimate trap) |
| `euc-30` | `fs-03` | 8% against 8.2%, with no decimal comma |
| `euc-39` | `fs-04` | Rescue-medication "treated" |

Each kept case's `note` ends with a bracketed `[Curated 2026-10-05: …]` entry stating what was wrong and what changed. There are 71 such entries. The scratchpad that produced the file has the full machine log (`curate/log.json`) and the script (`curate/fix.py`).

## What this record does not show

- The corpus has not been run against any engine. Engine evidence (red, then green) belongs to the engine change.
- `measure` and `scope` are not normalised to engine labels (see "How a test reads a case").
