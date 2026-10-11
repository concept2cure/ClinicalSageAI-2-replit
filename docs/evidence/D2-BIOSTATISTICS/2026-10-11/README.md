# Biostatistics: the engines, and the paths that carry their numbers (D2)

**Row:** D2, launch catalog. **Filed 2026-10-11**, for work done 2026-10-05 → 2026-10-11.

The founder's instruction of 2026-10-11: *"all aspects of our platform and all
apps and use cases where biostatistics is needed must be there and fully
working."*

This record covers what was found, what was repaired, and what is honestly
still owed. The short version: the deterministic statistical engines were
wrong in eleven named places, five launch-reachable paths carried figures a
model had supplied rather than an engine computed, and four engines were both
unreachable and wrong. All of that is fixed or deleted. What remains owed is
listed at the end, and none of it is hidden behind a green claim.

## How the defects were found

Three independent read-only sweeps ran first, then every finding was repaired
in its own lane and each lane was checked by a second agent told to refute it.

1. **Engine inventory** — every statistical computation in the repository,
   with duplicates flagged. It found thirteen copies of the normal CDF and
   eight separate two-arm sample-size engines.
2. **Launch wiring** — for each use case a life-sciences customer has, whether
   it is reachable and what it runs on.
3. **Numerical verification** — 163 checks of the engines against published
   reference values (scipy, R, gsDesign, G*Power, and the source papers).
   **37 failed.** The canonical `server/services/stats/*` passed; the parallel
   copies on live routes did not.

Everything below was repaired against a reference value or a published method,
never against another implementation in this repository.

## What was wrong, and what it is now

### The foundation

`server/services/stats/normal.ts` — every sample size, power, interim boundary
and confidence interval in the platform is computed from Φ and Φ⁻¹, and the
group-sequential engine integrates over them recursively. The CDF was
Abramowitz & Stegun 26.2.17 (error 7.5e-8) and the quantile's Halley
refinement was taken *against that CDF*, so the "refined" value carried the
CDF's error: z(0.975) = 1.95996280 against a true 1.95996398. The header
promised 1e-12. The CDF is now W. J. Cody's rational Chebyshev approximation —
the algorithm behind R's `pnorm` — at a relative ~1e-16 including the far tails
(Φ(−10) = 7.6e−24 exactly), checked against published values and against
Marsaglia's independent series before use.

### The engines

| Capability | Was | Is | Reference |
|---|---|---|---|
| TOST equivalence | 63/group (and 50 by another path) | 69/group | Chow, Shao & Wang §3.2.3 |
| 2×2 crossover | 64 total (periods multiplied in) | 32 total | Julious 2004 |
| AUC comparison | 1/group (variance ÷ 100) | 10/group | Hanley–McNeil 1982 |
| Diagnostic sensitivity | 283 (hybrid, 5-point margin hard-coded) | 363 | one-sample vs performance goal |
| "Dunnett" | 0.016952 (actually Šidák) | 0.018826 | Dunnett 1955 |
| Two-sample means, "t-test" | 63 (normal approximation) | 64 | R `power.t.test` |
| Binary risk difference | 393/arm | 93/arm (103 with continuity correction) | Fleiss |
| Time-to-event | 248 "subjects" | 247 **events** | Schoenfeld |
| LD–O'Brien–Fleming, 2 looks | 3.258 / 2.259 | 2.963 / 1.969 | gsDesign |
| LD–Pocock, 2 looks | 2.420 / 2.594 | 2.157 / 2.201 | gsDesign |
| Conditional power at Z=2, t=0.5 | 0.185 (computed under H0, labelled "current trend") | 0.8903 | B-value form |
| Predictive power, same design | 0.247 | 0.8074 | Spiegelhalter, Freedman & Blackburn 1986 |
| Power at 80% of planned effect | 0.512 (power × 0.64) | 0.611 | exact, from the design's noncentrality |

Two structural repairs behind that table:

- **The engine refuses rather than assumes.** It substituted a hazard ratio of
  0.5 for an effect ≥ 1, a crossover correlation of 0.5, an AUC target of
  0.85, a performance goal of 0.85, and sensitivity/specificity/prevalence of
  0.90/0.90/0.50. Each is now a `ComputationRefusal` naming what is missing.
  A kappa sizing whose variance carried a `+0.01` fudge with no published
  basis is refused outright: the published methods need a null κ₀ and the
  marginal prevalence, which the input contract does not carry.
- **One implementation per capability.** The private normal CDF and quantile
  copies in the AnA engine, the adaptive service and the trial-statistics
  knowledge engine are gone; all three import `stats/normal`. The adaptive
  service and the AnA adaptive tool now solve boundaries through
  `stats/group-sequential-oc`, the exact recursive-integration engine.

Also fixed while there: efficacy was tested on |Z| against one-sided
boundaries, so a strongly negative Z counted as efficacy (simulated type I
error ≈ 0.05); each interim was solved as if it were the first look; and the
Monte Carlo drew each look independently instead of as one correlated
sequence.

### Figures a model supplied, on paths a launch app reaches

CLAUDE.md Rule 2: numbers, verdicts and governed content come from
deterministic engines; the model narrates. Five breaches, all closed:

1. **CSR → Module 2.** The CSR builder drafts every ICH E3 section with a
   model from study metadata alone — no SAP, no datasets, no engine output.
   A drafted §11.4 could state a p-value and an effect size nobody computed,
   and `load-csr-inputs-for-project` copied that text into Module 2.5 and 2.7
   as the study's **primary result**, which the submission orchestrator
   assembles inside eCTD compile, a launch surface.
   `csr/unsupplied-statistics.ts` now finds such figures deterministically and
   the section falls back to its template, recording the refused figures in
   its lineage; `primaryResult` is always the pointer to §11.4. The §9.7
   template also asserted that the SAP was finalised before database lock,
   that the population was ITT and that a two-sided 0.05 level was used — none
   supplied, all now placeholders.
2. **AnA's Module 2.5 / 2.7 tools** (both in the launch scope) composed from a
   `csrs[]` array in the tool input — which the model writes. They now read the
   program's completed CSR records through the loader the orchestrator uses,
   and say so; figures in the tool input are never used.
3. **Statistical defensibility** asked a model for 0-100 scores on seven
   dimensions and derived the rating and reviewer-risk level from them. It now
   runs the deterministic judgment engine — the one AnA's
   `assess_statistical_defensibility` tool already ran — and answers 422 with
   the missing inputs named when it cannot judge a design. (It was also broken
   from its only caller: the workbench sent an endpoint string and no
   statistical methods, and the service threw.)
4. **Figure generation** asked a model for a Kaplan-Meier curve "showing HR
   and 95% CI" and for forest-plot point estimates and intervals — from raw
   rows, which means the model computes them. Both types are refused before
   any model call; the others may plot an interval only when the data carries
   one.
5. **The design optimizer** filled every gap with a figure from nowhere: a
   sample size by endpoint keyword (survival 400, PFS 350, response 200),
   a whole recommendation when there was no data at all, a "power gain" of
   log(multiplier) × 0.1 added to an approval rate, and sample-size ranges by
   endpoint name. It now reports the precedents' median or null, recommends
   nothing without data, and does not vary sample size, because the outcome
   data does not relate N to approval.

### Engines deleted

Four modules were both unreachable and numerically wrong, so they are gone
rather than repaired (zero duplication; the canonical engine is
`server/services/stats/*`). `monte-carlo-service` (its log-rank gave
p = 0.998 where the correct value is 4.2e-5), `biostats-signal-engine`,
`server/services/ptrs/` (reachable only from a dead caller), and ~75
unreached methods of `statistics-service` — among them a Schoenfeld with a
factor of 2, which halved every event count. 10,247 lines removed in that
commit alone. Every
deletion names its replacement by path in its commit, and
`git log --all --diff-filter=D` confirms none had been deleted and rebuilt
before.

## Verification

Every repair was shown failing first. Four new reference suites pin the
engines to published values:

| Suite | Tests | Against the previous code |
|---|---|---|
| `tests/biostat/normal-precision-reference.test.ts` | 19 | 18 failed |
| `tests/biostat/ana-sizing-reference.test.ts` | 25 | 22 failed |
| `tests/biostat/adaptive-and-spending-reference.test.ts` | 15 | 14 failed (the 15th could not run — the function was not exported) |
| `tests/biostat/study-design-and-fragility-reference.test.ts` | 15 | 15 failed |

`tests/biostat` as a whole: **342 tests pass across 15 files.** The adaptive
lane additionally re-broke its own code six ways and confirmed the tests caught
each; where a deliberate break initially passed, it added the check that
catches it. `npm run typecheck`: 0 errors. `ci:unreferenced-modules`: 81,
matching the baseline. The push gates ran on every commit: the ESLint
warning ratchet reported that the pushed files gained no warning, and
several shed many (`statistics-service.ts` 51 → 11,
`adaptive-trial-operations-service.ts` 17 → 12).

Existing expectations were changed in four places, each because it pinned
wrong behaviour, and each is named in its commit: the "t-test" sizes
(63 → 64, 175 → 176) pinned the normal approximation under a t-test label; the
kappa case pinned the fudge result; a CSR completeness case asserted that a
§12.3 draft stating "312 deaths … 47 serious adverse events" — counts nobody
supplied — was stored as drafted; and the defensibility test covered the model
scoring path that no longer exists.

## Where biostatistics now stands, by use case

| Use case | Where | State |
|---|---|---|
| Study design: sample size, power, endpoint type | AnA tools; protocol development's Statistics tab | engines correct and reference-pinned |
| Defensibility / reviewer risk | deterministic judgment engine | verdict, risk and recommended action, no model |
| Interim design, conditional and predictive power | canonical exact engine | boundaries match gsDesign |
| CSR §9.7 / §11.x statistics | guarded | a model-stated figure is not stored |
| Module 2.5 / 2.7 statistics | bound to CSR records | model-supplied figures ignored |
| Device / IVD accuracy sizing | engine | refuses without the accuracy targets; the design schema records none, and the bridge reports that as a blocking gap |
| Submission Readiness statistical gate | — | **owed** (below) |
| Reporting & analytics statistical reports | — | **owed** (below) |

## Owed, and why

- **No pre-dispatch statistical gate.** `ectd/dispatch-readiness.ts` is
  structural only. A protocol ↔ SAP ↔ CSR consistency check exists and is
  deterministic (`statistical-defensibility-service.checkConsistency`) but
  compares values the *caller* supplies; no loader binds it to record ids.
  Building those loaders is the next piece of work, not a line change.
- **The `biostatistics` surface is scrapped but not yet removed.**
  `docs/SURFACE_DECISIONS_2026-10-08.md` (founder delegation of 2026-10-07)
  scraps it as a place, naming `biostat-workbench` as the surface that
  delivers the outcome — and that record anticipates the code removal going in
  "a later change that names that surface". It touches ten test files, the
  registry, the surface views, the navigation and an RBM fixture, so it is
  scheduled, not squeezed in. The defect that mattered is its in-browser
  engine — a ~220-line copy of the server engine carrying every bug in the
  table above (its own Abramowitz & Stegun CDF, the silent HR = 0.5, a
  survival N halved by dividing events by 2, the TOST error, the hard-coded
  diagnostic margin) and no reference test at all. Users touched that copy,
  not the tested server engine. Removing it is in flight in this session as
  its own change.
- **The governed SAP lifecycle has no UI.** Its routes exist; nothing reaches
  them, and its `signVersion` writes a caller-supplied signer name, title and
  timestamp verbatim, with a "Part 11 compliance" check that only asserts the
  fields are non-empty — so a caller can sign as anyone, and nothing binds the
  signature to the content (§11.100(a), §11.200(a)(1)(i), §11.70). Repairing
  it through the platform's one re-verification ceremony is in flight in this
  session; wiring or deleting the surface area is a product call.
- **No statistical qualification package.** The engines are now pinned to
  published reference values, which is the input to such a package, not the
  package itself: there is no IQ/OQ/PQ for them and no traceability matrix.
  Competitors publish one, and it gates technical evaluation.
