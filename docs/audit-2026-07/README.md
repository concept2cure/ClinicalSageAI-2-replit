# Purchase-grade forensic audit — Concept2Cure.RI / TrialSage

**Audited:** `concept2cure-v2` @ `576ec5d` · **Date:** 2026-07-28
**Posture:** independent, buyer's-eye. The repository's ~40 self-authored audits and
readiness assessments are treated as the seller's documents — tested, not inherited.

---

## Start here

| If you have… | Read |
|---|---|
| 5 minutes | [`00-executive-summary.md`](00-executive-summary.md) |
| 15 minutes | + [`14-readiness-gate-ladder.md`](14-readiness-gate-ladder.md) — can humans use it, at three bars |
| an afternoon | + [`15-remediation-plan.md`](15-remediation-plan.md) and the chapter for your area |
| doubt about any number | [`evidence/`](evidence/) — every figure traces to a re-runnable command |

## The three questions

1. **What is actually here?** Chapters 02–11.
2. **How does it stack up?** Chapter 13 — 12 offering categories × 5 competitors, web-researched with citations.
3. **Can humans use it?** Chapter 14 — the G1/G2/G3 gate ladder.

## Contents

| Chapter | Subject |
|---|---|
| [`01-method-and-coverage.md`](01-method-and-coverage.md) | What was machine-swept vs deeply read vs **executed** — and what was not done |
| [`04-security.md`](04-security.md) | Perimeter (holds), XSS, uploads, SSRF, supply chain, AI safety |
| [`05-data-and-tenancy.md`](05-data-and-tenancy.md) | RLS, the migration system, the fresh-install gap — the highest-risk area |
| [`06-ai-layer.md`](06-ai-layer.md) | Gateway, ANA's 697 tools, grounding |
| [`07-compliance-21cfr11.md`](07-compliance-21cfr11.md) | Audit chain, e-signature, validation state, claims register |
| [`08-quality-tests-ci.md`](08-quality-tests-ci.md) | Real test counts, the gates that cannot fail |
| [`09-frontend-and-ux.md`](09-frontend-and-ux.md) | Navigation, data honesty, dead code, the attach button |
| [`11-suppression-ledger.md`](11-suppression-ledger.md) | ~1,620 baselined defects — the best single predictor of readiness |
| [`14-readiness-gate-ladder.md`](14-readiness-gate-ladder.md) | G1/G2/G3 verdict + claims-vs-code register |
| [`15-remediation-plan.md`](15-remediation-plan.md) | Staged by importance, with acceptance tests |
| [`evidence/`](evidence/) | Machine outputs + the live-proof execution log |

## The evidence

| File | Contents |
|---|---|
| [`evidence/00-live-proof-log.md`](evidence/00-live-proof-log.md) | Everything **executed**: build, tests, DB install, boot, probes, typecheck |
| `evidence/01`–`09` | File census, debt census, endpoint matrix, table matrix, migration paths, service coverage, suppression ledger, secret scan, upload safety |
| `evidence/10-fresh-install-gap.json` | Tables and schemas queried by server code vs what a from-scratch install creates |
| `evidence/sweep.mjs`, `evidence/fresh-install-gap.mjs` | The two scripts that produce all of the above |

```bash
node docs/audit-2026-07/evidence/sweep.mjs
DATABASE_URL=… node docs/audit-2026-07/evidence/fresh-install-gap.mjs
```

## What this audit did not do

Stated so no claim is read wider than it is. No line-by-line read of 1.49M lines — coverage
is surface-complete, not line-complete. No authenticated two-org runtime probe, so
cross-tenant findings are static-analysis plus adversarial review, **not demonstrated
exploits**. No browser-driven journey walk, so usability findings are code-derived. No
penetration test. No hands-on competitor trials. Full statement: Chapter 01 §1.4.

No check is reported as passing unless it actually ran.

## Ground rules

- **No application code was modified.** The only additions are these documents and two
  standalone evidence scripts.
- **No fabricated findings.** Anything unproven is reported as unproven.
- **Strengths are reported with the same specificity as defects** — a buyer needs an accurate
  picture, not a hit piece. Where this audit's own framing was wrong, it says so and corrects
  it in place (see the zero-retention correction in `04-security.md` §4.6).
