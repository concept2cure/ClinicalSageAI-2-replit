# WO-5 — Baseline governance and honest gate output

**To:** JM Smith · **From:** Claude Code · **Date:** 10 September 2026
**Status:** OPEN · **Blocks:** nothing — it is how you keep the other nine honest

---

## What the code actually says

**43 baseline files. 2,244 defect-class entries under active suppression, plus
6,703 lint/cosmetic.** (`docs/evaluation-2026-09/evidence/ledger.mjs`.)

Every one of those reports **PASS**.

| Entries | Baseline |
|---:|---|
| 6,596 | `eslint-warning-baseline.json` |
| 611 | `purge-coverage-baseline.json` |
| 246 | `duplicate-exported-types-baseline.json` |
| 244 | `env-var-docs-baseline.json` — **and still wired to no npm script** |
| 190 | `tenant-resolvers-baseline.json` |
| 151 | `drizzle-tenant-scope-baseline.json` |
| 151 | `server-error-leaks-baseline.json` |

## The problem

A reader of CI output cannot distinguish four different things, all of which
print as a pass:

1. **ZERO-DEBT PASS** — no baseline, genuinely clean.
2. **RATCHET PASS — N REMAIN** — passed because it is no worse than N.
3. **INVENTORY** — the script always exits 0 and cannot fail (all 14 `:list`
   variants, `readiness:check` non-strict, `ci:report-branch-drift`,
   `audit:evidence-pack`).
4. **ADVISORY** — runs, reports, and is `continue-on-error` (`ci:token-cascade`).

`ci:unreferenced-modules` prints `Unreferenced modules: 98 (baseline 98)` and
then `FAIL (--strict)`. That is the good case — the count is visible. Most gates
do not print theirs.

`ci:baseline-justifications` already enforces per-entry written justifications
with bidirectional parity, but only for `tenant-isolation`. That mechanism is
the right one; it needs to cover the other 42.

## Scope

1. Extend `ci:baseline-justifications` to every baseline: each entry carries an
   **owner**, a **risk rationale**, a **compensating control**, and an
   **expiry date**. An entry without one fails the gate, which is already how it
   works for `tenant-isolation`.
2. Standardise gate output. Every ratchet gate prints
   `RATCHET PASS — N REMAIN (baseline <file>)` rather than a bare pass.
3. Give `env-var-docs` an npm script, or delete its 244-entry baseline. It has
   been a baseline with no gate since at least 2026-07-28. Do one or the other.
4. Publish the ledger total in CI summary output, so 2,244 is a number the team
   sees weekly rather than one an audit rediscovers.

## Exit criteria

```bash
npm run ci:baseline-justifications   # covers all 43 baselines
node docs/evaluation-2026-09/evidence/ledger.mjs   # total published in CI summary
```

Prove it fails: strip a justification from one entry, confirm red.

## Blast radius

Low. Tooling and CI output. No production code.

## Estimate

1–2 weeks.
