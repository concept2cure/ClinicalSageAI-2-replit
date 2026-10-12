# A ratchet whose baseline is committed to match the tree is not a ratchet

The last CI run to complete on trunk (`b5f5a8355`, 06:16 UTC — the backlog
meant nothing finished after it for five hours) showed **Lint green**, which
confirmed this morning's text-ramp fix, and showed `Nightly Governance Strict`
failing on **two** steps. One was the eight zero-baseline debt gates, already
being worked. The other, `Repo health audit (strict debt gate)`, had not been
looked at. It reports:

```
• 57 files exceed 100000 bytes, above the ceiling of 33
• 114 files exceed 1500 lines, above the ceiling of 82
```

`docs/work-orders/WO-12-complexity-refactor.md` already governs that debt and
**defers** it, on three reasons. Two are sound — the refactor is not what blocks
the launch, and decomposing files with no database-backed suite is a large diff
resting on review alone. The third was:

> **The line is held.** The ratchet cannot grow now.

WO-12 recorded **95** files over 1,500 lines. The tree is at **114**. Nineteen
files crossed the threshold under a gate reporting a delta of zero.

## Why

`audit:repo-health:no-regression` *does* gate both oversized-file dimensions —
`hasRegression()` fails on a positive `largeFilesByBytes` or
`largeFilesByLines` delta (`repo-health-scan.mjs:510-514`) — and the scan reads
its baseline before writing it, so there is no self-reference inside a run.
That part is sound.

The teeth come out one layer up.
`.github/workflows/repo-health-baseline-refresh.yml` regenerates
`docs/reports/repo-health-scan-latest.json` on **every push to
`concept2cure-v2`** and commits it back. Its reasoning is explicit and, for a
PR-based repository, correct:

> PRs branched after a merge therefore always see delta 0 — the gate stays
> strict and self-healing.

**RULE 0 means this repository has no PRs.** Every change is a direct push to
trunk. There is no "PR branched after a merge" to protect — each push's own
growth is committed into the baseline before anything later can compare against
it. And `.husky/pre-push` ran no repo-health gate at all, so nothing caught
growth before it landed either.

Measured (see `measured.txt`): the committed baseline, refreshed at 10:17 UTC
today, holds `largeFilesByBytes: 57, largeFilesByLines: 114`, and
`no-regression` reports **delta 0 on every dimension** while the tree sits 32
files above the strict ceiling.

This is the shape CLAUDE.md RULE 0 was written about — a control that reads as
enforcement and is not. There it was a bypass with a friendly hint; here it is
a baseline the CI commits to match whatever just happened.

## The fix

`audit:repo-health:ceiling` — `--strict` with the ceilings set to the
**measured counts, 57 and 114**. Three properties make it hold where the
baseline did not:

- **The numbers live in `package.json`**, where the auto-refresh cannot reach
  them, and where the repo's "moves DOWN only" convention already applies (the
  strict gate's own 33/82 live there).
- **It is set at the measurement**, so every file that exists today passes and
  only the *next* one fails. Nobody is blocked by debt they did not create.
- **It runs in both `.husky/pre-push` and the CI Lint job**, so growth is
  refused before it lands rather than reported the next night. 1.2s, Node
  builtins, tracked files only.

Proven by making it fail: one added 1,600-line file takes the count to 115 and
the gate refuses — *"115 files exceed 1500 lines, above the ceiling of 114"* —
and removing it restores green.

## What this is not

**It does not do the decomposition and does not pretend to.** 57 files over
100KB and 114 over 1,500 lines remain, including a 6,202-line
`DocumentWorkbench.tsx`. WO-12's reasons 1 and 2 still stand and the work is
still deferred. What changes is that the deferral is now honest: the line is
held from here, so those two reasons can carry it on their own.

None of today's session work contributed to either count — its 24 changed code
files top out at 1,077 lines, and it removed two dead query blocks. The 95→114
growth predates it.
