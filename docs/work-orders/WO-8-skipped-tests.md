# WO-8 — Triage the 34 skipped tests

**To:** JM Smith · **From:** Claude Code · **Date:** 10 September 2026
**Status:** OPEN · **Blocks:** G1 (pilot on any data)

---

## What the code actually says

```
$ grep -rEn "\b(describe|it|test)\.(skip|todo)\b|\bxdescribe\b|\bxit\b" tests/ server/ client/ | wc -l
34
```

Across **464 test files**. That is a low skip rate by any standard — this work
order is small, and it is on the list because *which* 34 matters more than how
many.

`ci:check-unrun-tests` passes, so no test file is silently excluded from a
runner. The 34 are explicit, in-file skips.

## Why it blocks the pilot

A skipped test in an assurance-critical path is worse than a missing one,
because the file's presence implies coverage that is not there. Before humans
touch the product, each of the 34 needs a decision on the record.

## Scope

1. Classify all 34:
   - **Un-skip** — the reason it was skipped no longer applies.
   - **Environment-blocked** — needs a DB, a browser, or a credential. Annotate
     in-file with what it needs, and wire it into the job that has it
     (`test:db`, `test:e2e:golden-journey`, the `blank-db-provisioning` job).
   - **Obsolete** — delete the test and say why in the commit.
2. Prioritise anything under `tests/golden-journeys`, `tests/schema-contract`,
   `tests/export-contract`, `server/__tests__/security`, or the ANA/submission
   suites. `proof-tier-baseline.json` records a **floor of 77 proof files** —
   an inverted ratchet that fails when a proof disappears — so these are the
   ones the repo already treats as load-bearing.
3. No skip survives without an in-file comment saying why and what would
   un-block it.

## Exit criteria

```bash
grep -rEn "\.(skip|todo)\b" tests/ server/ client/   # every hit has an adjacent reason comment
npm run ci:check-unrun-tests                          # still passes
npm run ci:proof-tier:strict                          # floor of 77 intact
npm run test:proof-tier                               # schema-contract + golden-journeys + export-contract green
```

## Blast radius

Low. Test-only. The risk is discovering that an un-skipped test fails for a real
reason — which is the point.

## Estimate

3–5 days.
