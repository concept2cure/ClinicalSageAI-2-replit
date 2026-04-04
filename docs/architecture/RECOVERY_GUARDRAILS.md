# Recovery Guardrails

> Last updated: 2026-04-04
> Purpose: Prevent branch drift from recurring and define recovery procedures

## How Future Work Should Avoid Drift

### Rule 1: Commit to `concept2cure-v2` every session
Every working session must end with changes committed and pushed to `concept2cure-v2`.
If changes aren't ready, they should be behind a feature flag or in a non-imported file — not on a separate branch.

### Rule 2: No build-order chains
Do not create sequential branches (build-order-N, build-order-N+1, ...).
Each creates a compounding merge debt. After 3 links, the chain is untestable against truth.

### Rule 3: Maximum branch lifetime = 1 session
A branch that survives past one working session is a drift risk.
If work spans sessions, merge partial progress to `concept2cure-v2` between sessions.

## When to Merge vs Port

| Scenario | Action |
|----------|--------|
| Branch has <5 files changed, no conflicts | Merge (fast-forward preferred) |
| Branch has >5 files changed, clean diff | Port via cherry-pick, verify each file |
| Branch has conflicts with `concept2cure-v2` | Manual port — apply changes file by file |
| Branch is part of a chain >3 deep | Port from the tip only, discard intermediate branches |
| Branch touches files another agent is editing | STOP — coordinate before porting |

## When to Stop Feature Work and Reconcile

Stop immediately when:
1. You discover a dependency on code that is **Claimed** (exists on branch, not on `concept2cure-v2`).
2. More than 3 unmerged branches exist targeting the same concern area.
3. `concept2cure-v2` has diverged significantly from your branch base.
4. Two parallel agents are editing the same files.

Reconciliation steps:
1. Run `npm run ci:report-branch-drift` to assess current state.
2. Identify which branch changes are still needed.
3. Port needed changes to `concept2cure-v2`.
4. Delete reconciled branches.
5. Resume feature work.

## How to Run the Drift Report

```bash
# Report on all known Claude branches
npm run ci:report-branch-drift

# Report on specific branches
node scripts/ci/report-branch-drift.mjs \
  claude/build-order-10-founder-critical-path-truth-pass \
  claude/build-order-24-topbar-governance-convergence

# Output includes:
# - Files changed per branch vs concept2cure-v2
# - Branches with zero meaningful diff (already merged or empty)
# - Branches with likely stranded changes
```

## Drift Prevention Checklist (Per Session)

- [ ] Start on `concept2cure-v2`: `git checkout concept2cure-v2 && git pull`
- [ ] Make changes directly on `concept2cure-v2`
- [ ] Commit and push before session ends
- [ ] If a branch was created, merge or port before next session
- [ ] Run `npm run ci:report-branch-drift` if unsure about branch state
