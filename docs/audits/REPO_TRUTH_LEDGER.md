# Repo Truth Ledger

> Last updated: 2026-04-04
> Source of truth branch: `concept2cure-v2`

## What Counts as Truth

| Label | Definition | Action |
|-------|-----------|--------|
| **Verified** | Code exists on `concept2cure-v2`, tests pass, feature works | No action needed |
| **Claimed** | Code exists on a feature/claude branch but NOT on `concept2cure-v2` | Must be ported or discarded |
| **Unknown** | Code referenced in docs/plans but cannot be found on any branch | Investigate before building |

## Rules

### 1. Only `concept2cure-v2` is truth
- If code is not on `concept2cure-v2`, it does not exist in the product.
- Feature branches are work-in-progress artifacts, not deliverables.

### 2. Labeling discipline
Before starting work that depends on a prior feature:
1. Check if the feature exists on `concept2cure-v2`.
2. If YES → label **Verified**, proceed.
3. If NO but exists on a branch → label **Claimed**, port it first or flag the dependency.
4. If NO and not found anywhere → label **Unknown**, do not build on it.

### 3. Recovery branch handling
When a `claude/*` or `feature/*` branch has unmerged work:
1. Run `git diff concept2cure-v2...<branch> --stat` to assess scope.
2. Classify changes as: **Port** (needed), **Stale** (superseded), or **Conflict** (overlaps active work).
3. Port needed changes to `concept2cure-v2` via cherry-pick or manual application.
4. Do NOT merge entire branches — they accumulate unrelated changes over time.

### 4. Build-order chain rules
When a chain of branches exists (e.g., build-order-10 through build-order-24):
- **STOP** building new chain links if the base has not been merged to `concept2cure-v2`.
- The chain is only as trustworthy as its merge point.
- A 15-deep unmerged chain means 15 sessions of drift risk.

### 5. Mismatch halt condition
Stop feature work and reconcile when ANY of these are true:
- More than 3 unmerged branches exist in a chain.
- `concept2cure-v2` has diverged from the branch base by more than 50 commits.
- Two branches modify the same file with conflicting intent.
- A "Claimed" dependency is discovered mid-build.

## Current State (2026-04-04)

- **17 unmerged Claude branches** exist (build-order-10 through 24, plus 1 standalone).
- **All are Claimed**, not Verified.
- **Build-order chain is 15 deep** — well past the halt condition.
- **Recovery priority**: Assess branch 24 (cumulative tip) against `concept2cure-v2`, port selectively.
