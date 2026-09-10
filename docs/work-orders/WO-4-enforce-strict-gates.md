# WO-4 — Enforce the six unenforced strict gates

**To:** JM Smith · **From:** Claude Code · **Date:** 10 September 2026
**Status:** ✅ CLOSED 2026-09-10 — see Outcome at the end. The premise needed correcting first; read that section.
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

---

## OUTCOME — closed 2026-09-10

### First: the premise in this work order was wrong, and the correction matters

This work order — and §1 and §5 of the evaluation — claimed the six findings
"could regress tomorrow without CI noticing." **That is not true.** All six
**non-strict** variants already run in `ci.yml`'s `lint` job, which carries no
`if:` condition and therefore runs on every push and pull request:

| Gate | ci.yml line | Job |
|---|---:|---|
| `ci:migration-prefix-collisions` | 80 | `lint` |
| `ci:duplicate-table-ddl` | 91 | `lint` |
| `ci:unbacked-tables` | 120 | `lint` |
| `ci:unreferenced-modules` | 132 | `lint` |
| `ci:proof-tier` | 232 | `lint` |
| `ci:tenant-isolation` | 338 | `lint` |

The ratchets hold the line, and WO-0 is the proof: the **non-strict**
`ci:duplicate-table-ddl` is exactly what caught the 64th table definition.

The real gap is narrower. Debt cannot **grow**, but nothing forces it to
**shrink**, and nothing reports how far each baseline still is from zero. Wiring
the `:strict` variants into `pr-checks.yml` as originally proposed would have
made CI permanently red until WO-1, WO-2, WO-3 and WO-10 all land — a blocked
pipeline is not a signal, it is a thing people learn to bypass.

### What was done instead

**1. The six `:strict` gates now run nightly.** Added to the existing
`nightly-governance` job (`ci.yml:1666`, `if: github.event_name == 'schedule'`),
which already exists for precisely this and already runs
`ci:audit-route-mounts:full-strict` and `audit:repo-health:full-strict`.

Implemented as **one step looping all six**, not six steps — six steps would let
the first failure hide the other five, and the whole point is seeing the entire
remaining debt surface at once. It emits `::notice::` per zero-debt gate and
`::warning::` per gate with debt, then exits non-zero.

Promotion into `pr-checks.yml` is the exit criterion of the work order that
clears each baseline, not a separate task.

**2. Fixed a pre-existing defect in that job.** `audit:repo-health:full-strict`
already fails (42 files over 100 KB against a ceiling of 33), so the job aborted
and the artifact-upload step never ran. Added `if: always()` to the upload —
those artifacts are the point of a nightly governance run.

**3. The three honesty defects.**

- **`ci:token-cascade` is now blocking.** It carried `continue-on-error: true`
  with a recorded release condition: *"Flip to blocking once `npm run
  ci:token-cascade` is clean."* The condition is met — PASS on two consecutive
  runs, all 39 stylesheets resolving.
- **`check-no-dev-auth-in-prod.mjs` no longer pretends to have two modes.**
  `process.exit(strict ? 1 : 1)` is now `process.exit(1)`, with a note saying
  why there is no lenient mode: both non-strict callers (`ci.yml:397` and
  `deploy-aws.yml:130`, the deploy path) rely on it failing closed, and a
  dev-auth bypass reachable in production is not a warning. The dead `const
  strict` and the usage header that documented `--strict` as meaningful were
  corrected too.
- **The two absent baselines are now a decision.** `ci:fixture-fallback` and
  `ci:org-path-param-guards` read baseline files that do not exist. Both handle
  it correctly — absent reads as empty, so every finding is fresh and the gate
  fails closed — but nothing said so, and "restore the missing baseline" is the
  wrong repair. Each script now records that zero-debt is intentional and that
  `--write-baseline` would convert a clean gate into a ratchet.

### Proof that each changed gate can fail

Per the working agreement — *"a gate that has only ever been seen to pass has
not been tested"* — every gate touched here was made to fail on a seeded
violation and then restored. Working tree clean after each.

| Gate | Seeded violation | Result |
|---|---|---|
| `ci:token-cascade` | `var(--wo4-unresolvable-token)` with no fallback | exit 1, named the token and file |
| `ci:check-phantom-tokens` | `var(--wo4-does-not-exist, #000)` | exit 1, 15 vs baseline 14 |
| `ci:no-dev-auth-in-prod` | `process.env.NODE_ENV !== 'production'` in `server/routes/auth.ts` | exit 1 **in both modes**, confirming the no-lenient-mode claim |
| `ci:org-path-param-guards` | a `GET /:organizationId/things` route with no guard | exit 1, named route and file |

`ci:token-cascade` mattered most here: flipping a gate to blocking without
showing it can fail would have been the same mistake in the opposite direction.
