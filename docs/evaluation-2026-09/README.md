# Platform evaluation — 2026-09

**Audited:** `concept2cure-v2` @ `d31a9db6` · **Date:** 2026-09-10
**Runtime:** Node 22.22.2, clean `npm ci` (the repo's declared engine, `>=22 <23`)
**Bar assessed:** external pilot on **real customer data**

---

## Start here

| If you have… | Read |
|---|---|
| 2 minutes | §1 of [`PLATFORM_EVALUATION_2026-09-10.md`](PLATFORM_EVALUATION_2026-09-10.md) — the verdict and the one blocking mechanism |
| 10 minutes | + §4 (schema authority) and §5 (tenancy) |
| you are doing the work | [`../work-orders/`](../work-orders/) — WO-0 through WO-10, sequenced |
| doubt about any number | [`evidence/`](evidence/) — every figure has a re-runnable command |

**Download:** [`downloads/Concept2Cure-Platform-Evaluation-2026-09-10.pdf`](downloads/Concept2Cure-Platform-Evaluation-2026-09-10.pdf)

## Ground rules this evaluation held itself to

1. **Nothing is reported passing unless it ran here.** 142 gates were executed
   at `d31a9db6`; exit codes and output tails are in
   `evidence/01-gate-sweep.json`.
2. **Environment failures are not findings, and not passes.** Nine gates could
   not run (no database, no network, no build artefact). They are reported
   ENV-BLOCKED and excluded from every count.
3. **A ratchet pass is not a clean pass.** 43 baseline files tolerate 2,244
   defect-class entries. Every ratchet result is reported as
   `RATCHET PASS — N REMAIN`.
4. **No composite score.** The readiness question is answered against the
   G1/G2/G3 ladder already in use
   (`docs/audit-2026-07/14-readiness-gate-ladder.md`) so the verdict can be
   argued with.
5. **Prior figures are quoted only with their source and SHA.** Where this
   evaluation compares to 2026-07, the comparison names `576ec5d`.

## What is here

| File | Contents |
|---|---|
| [`PLATFORM_EVALUATION_2026-09-10.md`](PLATFORM_EVALUATION_2026-09-10.md) | The evaluation. Eight sections; §1 is the summary, §4 is the blocking risk |
| [`evidence/sweep.mjs`](evidence/sweep.mjs) | Runs all 142 gates, records exit code and tail |
| [`evidence/01-gate-sweep.json`](evidence/01-gate-sweep.json) | Raw sweep output |
| [`evidence/ledger.mjs`](evidence/ledger.mjs) | Suppression-ledger census, explicit per-file extractors |
| [`evidence/02-suppression-ledger.json`](evidence/02-suppression-ledger.json) | Per-baseline counts and totals |
| [`../work-orders/WO-0`…`WO-10`](../work-orders/) | The remediation programme |

## Re-running it

```bash
nvm use 22 && npm ci
node docs/evaluation-2026-09/evidence/sweep.mjs     # ~25 min
node docs/evaluation-2026-09/evidence/ledger.mjs    # instant
```

The sweep regenerates several committed `-latest` reports as a byproduct
(`docs/reports/repo-health-scan-latest.*`, `orphan-endpoints-latest.*`). Those
are tool output, not part of this evaluation — revert them afterwards:

```bash
git checkout -- docs/reports/
```

## Relationship to the 2026-07 audit

`docs/audit-2026-07/` is the deeper document and remains the reference for
architecture, security, the AI layer, and Part 11. **This evaluation does not
replace it.** It re-measures what has changed across 918 commits, re-tests that
audit's seven G1 blockers at HEAD (§6 — five fixed, two improved), and converts
the remaining gap into work orders. Read that audit for *what the system is*;
read this one for *what moved and what to do next*.
