# IVD 510(k) Submission-Readiness Walkthrough

**Purpose:** a live, runnable demonstration of the medical-device/diagnostic
regulatory capability set, end-to-end, for the mock walk-through.
**Scenario:** a quantitative cardiac-troponin immunoassay (with a connected
analyzer) seeking FDA 510(k) clearance against a predicate device.

## Run it live

```bash
npx tsx scripts/demo/ivd-510k-walkthrough.ts
```

No database, no network — every value is computed live by the same deterministic
services the unit tests verify against published standards (CLSI, GS1, the FDA SE
flowchart, DeLong). Source: `scripts/demo/ivd-510k-walkthrough.ts`.

## What it prints (verified output)

```
IVD 510(k) WALKTHROUGH — cardiac troponin immunoassay (connected analyzer)

=== Analytical performance (CLSI) ===
EP05 imprecision: within-lab SD=0.379 ng/L, CV=0.757%
EP17 detection: LoB=0.733 ng/L, LoD=0.984 ng/L
EP06 linearity: slope=1, R²=1, max deviation-from-linearity=0.156%
EP09 method comparison vs predicate: slope=1.004, bias at 100 ng/L=1.48 ng/L

=== Clinical performance ===
2×2: sensitivity=0.95 (CI 0.887–0.984), specificity=0.92
ROC: AUC=1 (DeLong 95% CI 1–1)

=== Substantial equivalence (FDA 510(k) flowchart) ===
Determination: SE
  • Same intended use as predicate? Yes
  • Same technological characteristics? No (different characteristics)
  • Do differences raise new questions of safety/effectiveness? No
  • Performance data demonstrate equivalence? Yes

=== §524B cybersecurity, human factors, UDI ===
§524B readiness: 100% (ready)
HFE (IEC 62366-1): 100% complete
UDI DI 00012345678905: valid; GUDID 100% complete

=== Submission-readiness capstone — pathway: ivd-510k ===
Overall readiness: 88%  →  VERDICT: NEARLY-READY
Per-domain:
  ✓ analyticalPerformance: 100%
  ✓ clinicalPerformance: 100%
  ✓ substantialEquivalence: 100%
  ✓ udiGudid: 100%
  ○ postMarketPlan: 40%
Prioritized gaps:
  1. postMarketPlan (40%)
```

## Talking points (per section)

| Section | What it demonstrates | Standard / method | API |
|---|---|---|---|
| EP05 imprecision | Within-lab SD/CV from a runs×replicates design | CLSI EP05 one-way ANOVA | `/api/diagnostics-performance` |
| EP17 detection | LoB and LoD from blank + low-level data | CLSI EP17 parametric | same |
| EP06 linearity | Linear range + deviation-from-linearity | CLSI EP06 (OLS + polynomial) | same |
| EP09 method comparison | Bias vs the predicate at the decision level | CLSI EP09 + Bland–Altman | same |
| 2×2 accuracy | Sensitivity/specificity with exact CIs | Clopper–Pearson | same |
| ROC/AUC | Discrimination with a confidence interval | Mann–Whitney + DeLong | same |
| Substantial equivalence | The actual SE decision, with the audit path | FDA 510(k) SE flowchart | `/api/substantial-equivalence` |
| §524B / HFE / UDI | Cyber, usability, and identification readiness | NTIA SBOM, IEC 62366-1, GS1 GTIN-14 | `/api/cybersecurity-524b`, `/api/human-factors`, `/api/udi-ivdr` |
| **Capstone** | One weighted verdict + the prioritized gap | composition over all domains | `/api/submission-readiness` |

## The narrative

The headline is the capstone: analytical, clinical, substantial-equivalence, and
UDI work are **complete**; the single remaining gap the platform surfaces and
prioritizes is the **post-market surveillance plan** (40%) — so the program is
**NEARLY-READY** at 88%. That is the product thesis in one screen: a dozen
standards-grounded checks reduced to one defensible answer and a clear next step.

## Defensibility

Every numeric result is closed-form and reproducible — the same code paths are
unit-tested against published reference values (e.g. GS1/LOINC check digits,
the IMDRF matrix, DeLong variance, t-table quantiles). Swap in your own assay
numbers in `scripts/demo/ivd-510k-walkthrough.ts` and re-run to show it live.

> For a different pathway, the capstone also supports `510k`, `de-novo`, `pma`,
> `cdx`, and `eu-ivdr` (see `GET /api/submission-readiness/pathways`).
