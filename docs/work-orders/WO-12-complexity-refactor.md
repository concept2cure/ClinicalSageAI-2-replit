# WO-12 — The complexity growth now sitting inside the eslint baseline

**To:** JM Smith · **From:** Claude Code · **Date:** 10 September 2026
**Status:** OPEN · **Blocks:** nothing. **Deliberately not scheduled ahead of WO-1…WO-6.**

---

## What happened, and why this exists

WO-0 restored `ci:eslint-ratchet` to green by removing 130 unused import
specifiers, taking the total 6,712 → 6,575 and letting the baseline ratchet down
from 6,596. **That is not the same as fixing the regression it was reported for.**

The +116 that broke the gate was not import debt. Per-rule, it was:

| Rule | Baseline | After WO-0 | Still above |
|---|---:|---:|---:|
| `complexity` | 1,687 | 1,721 | **+34** |
| `max-lines-per-function` | 1,190 | 1,224 | **+34** |
| `max-lines` | 470 | 483 | **+13** |
| `no-console` | 867 | 874 | +7 |
| `no-undef` | 65 | 72 | +7 |
| `@typescript-eslint/no-unused-vars` | 1,433 | **1,309** | −124 ← the paydown |

So roughly **81 warnings of genuine complexity growth** from 918 commits of
feature work are now locked inside the new 6,575 baseline, paid for with
unrelated import cleanup. The gate permits this — its own comment says "the
ratchet is on the total" and per-rule counts are "for the red-build report" —
but a reader of the green build cannot see that 34 functions crossed the
complexity threshold this cycle.

## The decision, and the reasoning

**Not scheduled now.** Three reasons, in order of weight:

1. **It is off the path to the pilot bar.** Nothing in WO-1, WO-2 or WO-3 is
   blocked by a long function. Schema authority and tenant isolation are.
2. **It cannot be validated here.** Decomposing 34 server-side functions with no
   runnable database-backed test suite is a large diff whose correctness rests
   on review alone. `audit:repo-health:full-strict` already reports 95 files over
   1,500 lines against a ceiling of 82 — this is a known, tracked shape, not a
   surprise.
3. **The line is held.** The ratchet cannot grow now. Deferring costs nothing
   further; doing it badly costs a regression in code no test covers.

## When to do it

Alongside the bounded-context decomposition the evaluation recommends for the
eight highest-risk oversized files — not as a lint exercise. A function split to
satisfy a complexity threshold and nothing else produces `doThingPart1` /
`doThingPart2` and makes the code worse.

## Scope, when it is scheduled

1. Identify the 34 functions that crossed `complexity` and the 34 that crossed
   `max-lines-per-function` this cycle. Note the per-rule baseline records
   **counts only**, not locations, so this needs a diff against a prior tree —
   budget for that, and consider fixing the baseline to record file:rule pairs
   (WO-5) so the next cycle does not have the same problem.
2. Decompose along real seams. A named helper that a caller could plausibly use
   on its own, not an arbitrary split.
3. Ratchet the baseline down as each tranche lands.

## Exit criteria

```bash
npm run ci:eslint-ratchet     # complexity <= 1687 and max-lines-per-function <= 1190
npm run ci:typecheck:no-regression
npm run test:proof-tier
```

## A note for WO-5

This work order exists because a green ratchet hid a composition change. The
baseline records `totalWarnings` and per-rule counts but **not** which files
carry them, so "which 34 functions got worse" is not answerable from the
repository. Recording file:rule pairs would make the next such regression
diagnosable in seconds instead of requiring a historical re-lint.
