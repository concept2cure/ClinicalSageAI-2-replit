# WO-4 — Enforce the six unenforced strict gates

**To:** JM Smith · **From:** Claude Code · **Date:** 10 September 2026
**Status:** OPEN · **Blocks:** nothing directly — it is why everything else can regress
**Do this first.** It is the cheapest item on the list.

---

## What the code actually says

Cross-referencing `package.json` against `.husky/pre-push`,
`.github/workflows/ci.yml` and `.github/workflows/pr-checks.yml`:

| Gate | Runs in |
|---|---|
| `ci:tenant-isolation:strict` | **nowhere** (only `:no-regression`) |
| `ci:duplicate-table-ddl:strict` | **nowhere** |
| `ci:unbacked-tables:strict` | **nowhere** |
| `ci:unreferenced-modules:strict` | **nowhere** |
| `ci:migration-prefix-collisions:strict` | **nowhere** |
| `ci:proof-tier:strict` | **nowhere** |

These are precisely the gates that measure WO-1, WO-2 and WO-3. **One regression
has already slipped through:** `duplicate-table-ddl` is baselined at 63 and
measures 64.

## Three further honesty defects in the gate layer

1. **`ci:token-cascade` is `continue-on-error: true`** (`ci.yml:590`). Its
   result cannot block a merge. Either make it blocking or stop reporting it as
   a gate.
2. **`ci:no-dev-auth-in-prod` non-strict is not lenient.**
   `scripts/ci/check-no-dev-auth-in-prod.mjs:205` reads
   `process.exit(strict ? 1 : 1)`. The two modes are byte-identical in effect.
   Harmless today, but it means the non-strict mode does not do what its name says.
3. **Two gates read baselines that do not exist on disk** —
   `ci:fixture-fallback` → `scripts/ci/ungated-fixture-fallback-baseline.json`,
   `ci:org-path-param-guards` → `docs/reports/org-path-param-guards-baseline.json`.
   They behave as zero-debt gates by accident. Make that a decision: either
   commit the baseline or document that zero-debt is intended.

Also worth knowing, because it affects how results are read:
`ci:audit-route-mounts:strict` and `:no-regression` are byte-identical commands;
`:strict` is not stricter. Same for `audit:repo-health:strict` and `:full-strict`.

## Scope

1. Add the six `:strict` gates to `pr-checks.yml` (which has **zero**
   `continue-on-error` entries — the right home).
2. Where a gate cannot go strict yet because its baseline is non-empty, wire the
   `:no-regression` variant now and note the strict promotion as the exit
   criterion of the relevant work order.
3. Fix the three honesty defects above.

## Exit criteria

```bash
# each of the six appears in .github/workflows/pr-checks.yml
grep -c "ci:.*:strict" .github/workflows/pr-checks.yml
```

**And prove they can fail.** Per the working agreement — *"a gate that has only
ever been seen to pass has not been tested"* — seed one violation for at least
two of the six, push to a scratch commit, confirm CI goes red, revert. Record
the red run in the PR description.

## Blast radius

Low. CI configuration only. The risk is the opposite of usual: turning these on
will make the build red until WO-1/WO-2/WO-3 land. That is the point — wire
`:no-regression` first so the line holds, then promote to `:strict` as each work
order completes.

## Estimate

2–3 days.
