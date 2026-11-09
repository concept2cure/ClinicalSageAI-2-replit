# Phase 4 acceptance: one fixture programme, every cell written down

**Package:** S7 (CMC). **Roadmap:** §11 phase 4 (`docs/design/ONE_DESIGN_PLAN.md` §11 table). **Date:** 2026-11-08.

The roadmap row asks for:

> Fixture batch/stability tables match expected cells; OOS is explicitly flagged; QOS and Module 3 share atoms and
> method references. Existing US small-molecule IND composition boundary stays enforced until separately changed.

and says of every row: *"queued for v0.5 acceptance until its stated fixture is run and recorded. A file's existence
or an older local test does not mark this row green."*

## What already exists (RULE 3)

The engines were there; the fixture was not. Searched for a CMC fixture programme, a batch-analyses table test and a
stability-table test before writing anything:

| Path | What it does today |
|---|---|
| `server/services/module3Composer.ts` | Composes all 17 sections. `batchAnalysesTable` renders §3.2.S.4.4 / §3.2.P.5.4 and computes each result against its own criterion; `stabilityResultsTable` renders every recorded pull point with its comparison |
| `server/services/cmc/recorded-capability.ts` | `isBatchAnalysisFor` — the one rule deciding which material a QC result is evidence for, read by the composer, the route and the tool |
| `server/services/cmc-write-through.ts` | The register mappers: what each CMC register actually writes into a canonical source |
| `server/services/cmc/composition-scope.ts` | The P-28 boundary: small-molecule US IND only, refusing by name |
| `server/services/__tests__/cmc-qc-batch-analyses.test.ts`, `module3Composer.stability-*.test.ts`, `server/services/cmc/__tests__/stability-trending.test.ts` and ~20 more | Each rule, one case at a time |
| `scripts/seed-stability.mjs` | A legacy HTTP seed against the older stability API; **not** the CMC registers' canonical sources, so not the fixture this row needs |

**What was missing.** A per-case test says a rule holds. None of them says **what this product files for one
programme** — which is the statement the roadmap asks to be recorded. So: one named fixture, composed through the
real engine, with every cell of both quantitative tables written down.

## The fixture

`server/services/cmc/__tests__/fixtures/phase4-small-molecule-us-ind.ts` — one small-molecule US IND (CSX-114),
because that is the composition boundary this platform ships (P-28).

Every payload is produced by the **real write-through mappers**, from register rows of the shape those mappers
receive. A hand-written canonical payload drifts from the register the moment a mapper changes a key, and then the
acceptance fixture passes on data the product cannot produce. This was not hypothetical: the first draft of the
fixture recorded `storageCondition` and `timePoints` directly, and §3.2.S.7 came back **0% complete, missing
`drugSubstanceTimePoints`, `drugSubstanceStorageCondition`** — the side-scoped keys only `mapStabilityPayload` emits,
and only for a study whose recorded scope covers that side. Through the mapper, the same study composes at 100%.

What it records, and what each record is for:

- a drug substance and a drug product, so §3.2.S.1 and §3.2.P.1 compose;
- **two** specifications — `mapSpecificationPayload` emits `releaseCriteria` only for a drug-product spec, so a
  substance's limits can never render under the product's release label;
- **one** analytical method, which §3.2.S.4 and §3.2.P.5 both read: the record that proves the 2.3 and the 3.2 cite
  one procedure;
- four QC results: a clean substance pass; a substance result recorded as `pass` whose own criterion it **fails**; a
  product result with **no disposition** that is outside its criterion; and a reference-standard qualification that
  is not batch evidence at all;
- two stability studies, one per side, each with in-criterion points and one outside.

## What the product files, cell for cell

Asserted whole-table by equality — headers and every row, in order — not with `toContain`. A cell that changes is a
change to what would be filed, and has to be read and re-stated deliberately.

**§3.2.S.4.4 Batch Analyses — Drug Substance**

| Sample | Sample Type | Test Method | Acceptance Criteria | Result | Disposition | Reviewed |
|---|---|---|---|---|---|---|
| DS-2601-A | in-process | HPLC-UV assay (AM-114) | 95.0 - 105.0 % | 99.4 % | pass | reviewed |
| DS-2601-B | in-process | HPLC-UV assay (AM-114) | 95.0 - 105.0 % | 91.8 % — repeat requested | **declared pass — the recorded result is OUTSIDE its recorded acceptance criterion** | reviewed |

**§3.2.P.5.4 Batch Analyses — Drug Product**

| Sample | Sample Type | Test Method | Acceptance Criteria | Result | Disposition | Reviewed |
|---|---|---|---|---|---|---|
| DP-2602-A | finished-product | HPLC-UV assay (AM-114) | 95.0 - 105.0 % | 106.9 % | **out of specification (computed)** | not reviewed |

**§3.2.S.7 Stability Results — Drug Substance**

| Batch | Condition | Attribute | Time Point (months) | Result | Acceptance Criterion | Compared |
|---|---|---|---|---|---|---|
| DS-2601-A | 25C/60%RH | assay | 0 | 99.4 | 95.0 - 105.0 % | within |
| DS-2601-A | 25C/60%RH | assay | 6 | 97.2 | 95.0 - 105.0 % | within |
| DS-2601-A | 25C/60%RH | assay | 12 | 94.1 | 95.0 - 105.0 % | **OUTSIDE** |

**§3.2.P.8 Stability Results — Drug Product**

| Batch | Condition | Attribute | Time Point (months) | Result | Acceptance Criterion | Compared |
|---|---|---|---|---|---|---|
| DP-2602-A | 25C/60%RH | total impurities | 0 | 0.21 | NMT 1.0 % | within |
| DP-2602-A | 25C/60%RH | total impurities | 6 | 1.14 | NMT 1.0 % | **OUTSIDE** |

The reference-standard qualification (RS-114-02) appears in **neither** batch table.

## OOS is explicitly flagged — in the prose, not only the table

The filed narratives, asserted sentence for sentence:

- §3.2.S.4: *"2 carry both a numeric result and an acceptance criterion and were compared here: 1 within criterion, 1
  out of specification."* · *"1 recorded disposition(s) CONTRADICT the recorded result: DS-2601-B. That disagreement
  is not resolved by this section."* · *"Out-of-specification results are reported as recorded; their investigation
  and disposition are not asserted by this section."*
- §3.2.P.5: *"… 0 within criterion, 1 out of specification."* · *"1 result(s) have not completed second-person
  review."*
- §3.2.S.7 and §3.2.P.8 each name the failing point — *"(assay at 12 = 94.1 against 95.0 - 105.0 %)"*, *"(total
  impurities at 6 = 1.14 against NMT 1.0 %)"* — and then: *"The stability conclusion and the proposed storage period
  are NOT established by this section."*
- The 24-month claim is filed as *"recorded on a study that has not been closed out under signature"*, not as
  accepted.
- The out-of-trend assessment **declines to report a trend** from three points and states the arithmetic it could not
  do: *"the regression control chart needs at least 4 prior points to fit and one to judge (5 numeric time points); 3
  are recorded."*

## QOS and Module 3 share atoms and method references

Built on the same composition, the 2.3 cites eleven records, every one of them a record Module 3 composed from, each
once, **with the same hash at compile**; and one procedure, `HPLC-UV assay (AM-114) (HPLC-UV, validated)`, under both
2.3.S.4 and 2.3.P.5 — the same name Module 3's own *Analytical Methods* table files in each section. The 2.3 also
reports this programme's two incomplete sections (75%, no impurity profile) rather than a finished dossier. The
mechanism landed earlier the same day: `docs/evidence/S7/2026-11-08-qos-shares-module3-atoms/`.

## The boundary is unchanged

`compositionRefusal` admits this programme and refuses, by name: the same programme with a **biologic** substance
(`CMC_MODALITY_OUT_OF_SCOPE`, citing ICH Q6B), the same programme filed as an **NDA**, and a programme whose product
class is a **device** (`CMC_PRODUCT_CLASS_OUT_OF_SCOPE`). No file in this slice touches `composition-scope.ts`.

## Verified by making each check fail

| File | Mutation | What it reported |
|---|---|---|
| `mutation-a-declared-pass-passed-through.txt` | the declared disposition is printed as recorded, so a `pass` over a failing result reads "pass" | the §3.2.S.4.4 table case red |
| `mutation-b-reference-standard-in-batch-series.txt` | **both** exclusions of a reference-standard qualification removed (the write-time flag in `mapQcTestingPayload` and the read-time vocabulary check in `isBatchAnalysisFor`) | 3 cases red, incl. *"expected [ 'DS-2601-A', 'in-process', …(26) ] to not include 'RS-114-02'"* |
| `mutation-c-stability-side-unrecorded.txt` | a stability study records no side, so each files under both | 5 cases red: both stability tables, the side case, the S.7 OOS sentence and the shelf-life sentence |
| `mutation-d-qos-names-no-procedure.txt` | the 2.3 derives no procedures — the state before today's earlier change | *"expected [] to deeply equal [ { …(4) } ]"* |
| `mutation-e-boundary-admits-a-biologic.txt` | the boundary admits a biologic substance | *"expected undefined to be 'CMC_MODALITY_OUT_OF_SCOPE'"* |

**One mutation did not go red, and that is recorded rather than hidden.** Removing *only* the read-time
`NON_BATCH_SAMPLE_TYPES` check left all 18 cases green, because the fixture goes through the register mapper and
`mapQcTestingPayload` had already stored `isBatchAnalysis: false` on that row — `isBatchAnalysisFor` returns on the
stored flag before it reaches the vocabulary check. Two independent layers exclude the record, and either alone
suffices for this fixture. The read-time check is not redundant (it governs rows written before the write-time rule
existed, which is why it was added), so both are kept; the mutation above removes both, which is what the case
actually pins.

Two further limits, stated plainly: this acceptance run exercises the composition engine over canonical sources, not
the database read that produces them (that path is covered on a real engine by
`server/services/cmc/__tests__/composition-boundary-readers.pglite.test.ts`); and the "no atom from a section the 2.3
does not summarize" rule cannot be shown failing by this fixture, because every section it composes with data is a
2.3 section — that rule is pinned by `server/services/__tests__/m2-qos-shares-module3-atoms-and-methods.test.ts`
(mutation 1 in the sibling evidence folder).

`green.txt` is the 18 cases passing with every mutation reverted.

## Gates

`tsc --noEmit` 0 errors. ESLint: the two new files carry no warnings. Test: `18 passed`.

## Phase 4 after this slice

| Acceptance clause | State |
|---|---|
| Fixture batch/stability tables match expected cells | **Recorded here**, cell for cell, against a named fixture built through the real register mappers |
| OOS is explicitly flagged | **Recorded here**, in both tables and all four narratives, including the declared-pass contradiction and the withheld stability conclusion |
| QOS and Module 3 share atoms and method references | **Recorded here** on the same fixture; mechanism in `docs/evidence/S7/2026-11-08-qos-shares-module3-atoms/` |
| US small-molecule IND composition boundary stays enforced | **Recorded here**: admitted once, refused on four counts, `composition-scope.ts` untouched |

What this does **not** claim: that the CMC work area is finished. It claims that for this programme, what the product
files is written down and is what it should be, and that each of the four clauses fails loudly when the behaviour
behind it is removed.
