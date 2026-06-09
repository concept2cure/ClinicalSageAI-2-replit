# Shadow Review — RTF Benchmark (WO-8)

**What this is:** a reproducible benchmark for the Refuse-to-File / Refuse-to-Accept
(RTF/RTA) **administrative gate**, run against the model the platform already has
(`server/services/intelligence/risk-model.ts`, target `rtf`). It is the mandatory
WO-8 credibility gate, executed on the existing predictor — not a new one.

**Run it:**
```bash
npx vitest run server/services/shadow-review/benchmark/__tests__/rtf-benchmark.test.ts
```
Runner: `server/services/shadow-review/benchmark/run-rtf-benchmark.ts` ·
Dataset: `server/services/shadow-review/benchmark/rtf-benchmark-dataset.ts`.

## Dataset & provenance (read this first)

This is a **criteria-grounded benchmark**, *not* licensed sponsor/patient data and
*not* a copy of the Chahal et al. dataset. Each example is a submission profile
whose features are real RTF/RTA risk factors and whose label follows the **public**
refuse grounds catalogued in `RTF_GROUNDS`:

| Source | Used for |
|---|---|
| FDA *Refuse to Accept Policy for 510(k)s* | administrative completeness items |
| FDA NDA/BLA Refuse-to-File standard — **21 CFR 314.101(d)**, FDA MAPP 6025.4 | refuse grounds |
| **21 CFR 54** (financial disclosure) | financial-certification ground |
| Chahal et al., *Analysis of FDA Refuse-to-File Letters*, **JAMA Intern Med 2022** | public reason **taxonomy** only |

**Label rule** (documented, deterministic): any **administrative** defect (missing
or unsigned forms, missing cover letter, missing financial certification, missing
Clinical Overview, open error-severity validation findings, PDF format defects)
refuses; or the **substantive** combination (inadequate efficacy evidence *and*
incomplete CMC) refuses. A lone substantive weakness is a review-cycle issue, not a
filing refusal — preserving the administrative-vs-substantive boundary.

The generator is deterministic (seed `0x5caffe1`, N=240, base-rate feature
prevalences). Reproducible run-to-run.

## Results (this run)

| Metric | Value |
|---|---|
| Train / test split | 180 / 60 |
| Test positive rate | 0.433 |
| Operating threshold | **0.470** (tuned on train — no test leakage) |
| Confusion (TP/FP/FN/TN) | 26 / 0 / 0 / 34 |
| **Precision** | **1.000** |
| **Recall** | **1.000** |
| **F1** | **1.000** |
| Accuracy | 1.000 |
| **AUC** | **1.000** |

### How to read these numbers (honesty)

- **AUC = 1.0** means the existing logistic model **ranks** refuse vs accept
  perfectly on this set. Because the benchmark labels are a deterministic function
  of the public criteria, a clean separating boundary exists and the model
  recovers it. This validates that the model **learns the documented administrative
  gate** — it does **not** claim to predict real-world RTF outcomes, which would
  require a real adjudicated outcome corpus.
- **Calibration finding:** at the naïve threshold 0.5 the model under-fires
  (recall 0.15) because L2 shrinkage + a base-rate intercept push probabilities
  low. Tuning the operating point on the train split (→ 0.47) restores full
  recall. **Action:** the production RTF gate should set its operating threshold
  from a dev split / cost trade-off, not assume 0.5.

## Path to a real-data benchmark (drop-in)

The harness and feature schema are fixed; only the examples change. To benchmark
against real outcomes:
1. Collect adjudicated RTF/RTA decisions (e.g. FDA RTF letters, internal
   filing-review outcomes) labeled refuse/accept.
2. Map each to the `RTF_FEATURE_NAMES` schema.
3. Replace `RTF_BENCHMARK_DATASET` (or pass the array to `runRtfBenchmark`).
4. Re-run; record precision/recall/F1/AUC here with the dataset version.

Until then, the metrics above are a **regression/capability proof** of the
existing model against public criteria — interpreted as such.
