# Study and protocol design — GA readiness plan (backend, no UI)

> Owner: product + development. Scope: the study-design, protocol-design,
> biostatistics, trial-intelligence, and prediction capabilities. This plan
> defines what "GA, sans UI" means, what landed in this pass, what remains,
> the order to do it in, and the acceptance bar for each piece. UI surfaces are
> out of scope here and are routed to Claude design via the companion handoff.
> Date: 2026-05-29.

---

## 1 · What "GA, sans UI" means here

A capability is GA-ready on the backend when it is, in this order:

1. **Honest** — it never fabricates a number. No random p-values, no invented
   competitors, no hardcoded probabilities presented as analysis. When data is
   missing it says so.
2. **Reproducible** — every stochastic result can be regenerated. Seeded RNG,
   recorded seed, hashed inputs, versioned method.
3. **Correct** — the statistic does what it claims (validated against known
   properties or references).
4. **Tested** — unit tests cover determinism, distribution sanity, and the
   honesty contract; they run in CI.
5. **Grounded** — where the feature claims to learn from prior studies, it
   reads a real corpus, not seed data.

Items 1–4 are achievable in-repo. Item 5 depends on a data/ingestion workstream
that needs data-ops and is the gating dependency for the intelligence and ML
features (see §4).

---

## 2 · What shipped in this pass

All of the following are committed with passing tests and are honest +
reproducible by the §1 definition.

### 2.1 Reproducibility and de-fabrication of the statistics engine

- New seeded PRNG (`server/services/stats/rng.ts`): mulberry32 core with
  uniform, normal (Box–Muller), exponential, gamma (Marsaglia–Tsang), beta, and
  binomial samplers; deterministic seed derivation from inputs
  (`seedFromObject`) and stable JSON. Pure, runtime-agnostic.
- New provenance record (`server/services/stats/provenance.ts`): method, engine
  version, seed, SHA-256 of canonical inputs, timestamp. Attached to simulation
  outputs so a result can be reproduced and audited.
- `server/statistics-service.ts` reworked:
  - Every `Math.random()` (14 sites) removed and replaced by the seeded engine.
    `simulateAdaptiveTrial` and `simulateSurvivalData` now reseed deterministically
    at entry, accept an explicit `seed`, and return `seed` + `provenance`.
  - **Fabrication removed.** `compareTrials` no longer invents a random p-value;
    it returns `pValue: null`, `significance: 'not-assessable'`, and a note
    explaining that per-arm n and variance are required. `generatePredictiveModel`
    no longer adds random jitter to its point estimate. `simulateVirtualTrial`
    draws its single outcome from a seeded generator using the model's own
    standard deviation, and returns the seed.
  - **Correctness fix.** The adaptive-design `estimateTypeIError` (was a hardcoded
    `0.05`) and `estimateAdaptivePower` (was a "rough approximation" with a
    fabricated 1.1× boost) are replaced by a real seeded Monte Carlo
    operating-characteristics estimator. Test confirms type I error is controlled
    near alpha and power exceeds it under a real effect.
- Dead, fabrication-shaped `server/trial-predictor-service.ts` deleted (hardcoded
  buckets labelled "for demonstration purposes", zero importers, supplanted by the
  data-grounded `statisticsService.predictTrialSuccess` and the real logistic
  `risk-model.ts`).
- Test alias fix (`vitest.config.ts`) so server modules using bare `shared/...`
  imports can be unit-tested.

Tests: `tests/services/stats-rng.test.ts` (14) and
`tests/services/stats-reproducibility.test.ts` (8). Existing biostatistics suite
(179 tests) still passes.

### 2.2 Net effect on GA posture

The engine no longer emits any fabricated statistic, and every simulation it
produces is reproducible and carries provenance. That clears the single largest
GA blocker for a regulated biostatistics tool and matches the existing platform
decision to disable `/api/protocol/generate` for the same reason.

---

## 3 · Remaining work to GA, sequenced

Priority reflects leverage and dependency order. Effort is rough (S/M/L).

| # | Workstream | Effort | Depends on | GA bar |
|---|---|---|---|---|
| 1 | **Trial/CSR corpus** — index ClinicalTrials.gov locally (snapshot + incremental), implement the `CSRIntelligenceLibrary` stub (parse → extract design/endpoint/result entities → embed → link to outcome) | L | data-ops | ≥ N trials indexed, ingestion idempotent, retrieval benchmarked |
| 1a | ✅ **DONE — ingestion backbone.** Pure CT.gov v2 → CSR normalizer, IO-free idempotent ingestion orchestrator (dedupe by NCT id), live fetcher, Drizzle writer, `nct_id` column + unique index migration. `server/services/corpus/*`. 31 tests. Remaining for #1: run it at scale + outcome linkage + embeddings (gated on data-ops). | — | — | done |
| 1b | ✅ **DONE — `CSRIntelligenceLibrary` implemented.** Replaced the stub with deterministic, evidence-bearing extraction (sample size, phase, p-values, design, randomization, blinding, duration) + ICH E3 structural validation. `server/services/csr-intelligence-library.ts`. 19 tests. | — | — | done |
| 1c | ✅ **DONE — precedent benchmarking.** Evidence-grounded design benchmarks from the corpus per indication+phase: sample-size/duration distributions (median + quartiles + p10/p90), common designs/endpoints, empirical success rate with a Wilson CI. Honest low-N guards (≥5 for distributions, ≥8 known outcomes for a rate); ongoing trials excluded from the denominator. Pure `computeBenchmark` + DB reader. `server/services/corpus/precedent-benchmark*.ts`. 28 tests. | — | — | done |
| 1d | ✅ **DONE — corpus API surface.** The ingest → extract → benchmark vertical is reachable over HTTP: `GET /api/corpus/benchmark`, `POST /api/corpus/extract`, `POST /api/corpus/ingest` (guarded; requires ≥1 query field). zod-validated, org-aware, mounted at `/api/corpus` in `server/bootstrap/register-document-routes.ts`. `server/routes/corpus-routes.ts`. 7 supertest tests. | — | — | done |
| 2 | ✅ **DONE — calibrated PTRS model.** Replaced the hand-tuned additive `predictTrialSuccess` heuristic (baseline rate nudged by magic constants) with a trained logistic model + honest cold-start prior, reusing `risk-model.ts`'s pure `trainLogistic` (one gradient-descent impl, not two). Two targets: `registry_completion` (trainable from the corpus now; prior = pooled corpus completion rate) and `regulatory_approval` (prior-only until an approval-labelled corpus exists; prior = Hay 2014 phase-transition LOA, derived cumulatively in code and cited). Holdout AUC/Brier reported when trained; honest `not_assessable` / cold-start when not. Every output carries source + N + Wilson evidence interval + prior + label semantics + provenance. Interpretable contributing factors from the learned weights. `server/services/ptrs/*`. 28 tests. `statistics-service.predictTrialSuccess` now delegates. Remaining: same scale + approval-label dependency as #1. | M | #1 | done |
| 3 | ✅ **DONE — provenance/seed across the remaining stochastic endpoints.** Extended the §2.1 pattern (seeded engine + deterministic reseed-from-inputs + provenance) to every remaining served simulation: `monte-carlo-service` (binomial/survival/normal/Poisson draws), `power-sample-size-service` (group-sequential + adaptive sample-size simulations), `adaptive-trial-operations-service` (Monte Carlo operating characteristics), and `external-control-arm-service` (propensity pseudo-data jitter). Added a seeded `Rng.poisson`. No unseeded `Math.random()` remains in any served statistic; each simulation accepts an explicit `seed`, reseeds deterministically otherwise, and returns `seed` + a provenance record. Reproducibility tests in `tests/services/stochastic-endpoints-reproducibility.test.ts` + a `poisson` test. | M | — | done |
| 4 | **Estimand framework (ICH E9(R1))** as a first-class object threaded through protocol designer, SAP generator, and the defensibility layer | M | — | Estimand attributes captured + validated; SAP renders them |
| 5 | ✅ **DONE — exact group-sequential OC engine.** Added an *exact* operating-characteristics engine (Armitage–McPherson / Jennison–Turnbull recursive numerical integration), complementing the existing Monte Carlo estimator: full OC table (type I, power, expected sample size, per-look stopping probabilities) computed deterministically with no RNG. Solves alpha-spending boundaries (O'Brien–Fleming / Pocock / linear) *exactly* — accounting for between-look correlation, fixing the `z_{1−α_k/2}` approximation and the hard-coded effect grid in `runMonteCarloOC`. Assurance via integration over a normal prior on the drift. Partial-cell (O(step²)) integration so type I controls to alpha to 3 decimals and the single-look case matches the closed-form fixed design. Pure `server/services/stats/group-sequential-oc.ts` + canonical `stats/normal.ts`; reachable at `POST /api/biostat/adaptive/oc-exact`. 27 tests (closed-form fixed design, exact type-I control across spending functions, stopping-distribution consistency, determinism + provenance, assurance). | M | #3 | done |
| 6 | **Enrollment + dropout forecast models** (per-site and study-level, with intervals) | M | #1 | Holdout error reported; intervals calibrated |
| 7 | **Deepen PMDA / MHRA / NMPA** from reference data to real guidance ingestion + region-specific design rules; add Swissmedic, ANVISA for Orbis completeness | M | — | Region rules unit-tested; guidance retrievable |
| 8 | **Device / diagnostic design pack (MDX)** — MRMC reader studies, co-primary sensitivity/specificity sizing, Bayesian device pivotal templates | M | #3 | Sizing matches references; IVDR performance-study path |
| 9 | ✅ **DONE — Bayesian assurance + multiplicity testing with FWER control.** Two pure modules. (a) `stats/assurance.ts`: assurance (probability of success) = power averaged over a normal prior on the effect, decoupled `assurance(powerFn, prior)` + closed-form two-sample-means power + seeded Monte Carlo counterpart; quadrature matches MC to <0.005, and a diffuse prior correctly pulls assurance below the naive design power. (b) `stats/multiplicity.ts`: the *decision* layer (complements the existing `designMultiplicityStrategy` allocator) — Bonferroni / weighted-Bonferroni / Holm / Hochberg / fixed-sequence / Bretz graphical (which subsumes the others, verified in tests), plus a seeded `estimateFWER`. Reachable at `POST /api/biostat/assurance` and `POST /api/biostat/multiplicity/test`. 27 tests, incl. FWER ≤ α under the global null for every procedure while the unadjusted rule inflates it. | S–M | — | done |
| 10 | **External-control rigor pack** — commensurate priors, tipping-point analysis, covariate-balance diagnostics, regulatory-framing memo | M | #3 | Sensitivity analyses reproducible |

**Critical path:** #1 → #2 (and #1 → #6). The corpus is the gating dependency
for the intelligence and ML value. Everything else (#3, #4, #5, #7, #8, #9, #10)
is independent of the corpus and can proceed in parallel.

---

## 4 · The gating dependency: the corpus

The retrieval, matching, and prediction code is real and queries real tables,
but the shipped data is 4 CSR PDFs and a 535-row seed CSV with ~8 usable rows.
Until a real corpus is ingested, the intelligence features are well-built shells
and the success model has nothing honest to train on. This needs a data-ops
decision (source agreements, storage, refresh cadence) that sits outside a code
change. It is called out here as the explicit blocker for workstreams #1, #2, #6.

Recommendation to the business: fund the corpus first. It unlocks the highest-
value, most-differentiated capabilities and is the difference between "honest but
empty" and "defensible to a pharma biostatistics function."

---

## 5 · Acceptance criteria (definition of done, per item)

- A reproducibility test: same seed + inputs → identical numeric output.
- A correctness test: validated against a known property or closed-form result.
- An honesty test: missing-data path returns an explicit "not assessable" /
  low-confidence result, never a fabricated number.
- Provenance attached to every stochastic result.
- CI green (the new tests run under vitest; no typecheck-baseline regression).

---

## 6 · Design handoff trigger

Backend capabilities only reach human clients through a surface. A capability is
ready for design when its backend meets §1 and exposes a stable contract. The
companion handoff (`HANDOFF_TO_DESIGN_study_protocol_2026-05-29.md`) lists the
surfaces that the shipped backend work now requires — primarily showing
provenance/seed and reproducibility, honest confidence labelling, and the
"not assessable" state — so the work done here actually reaches clients rather
than sitting behind an API.
