# Branch Coverage Index

> Generated: 2026-04-04
> Base branch: `concept2cure-v2`
> Purpose: Enumerate all named Claude build-order branches and their merge status

## Claude Build-Order Branches

| # | Branch | Concern Area | Merged to `concept2cure-v2`? | Files Changed | Insertions | Recovery Priority |
|---|--------|-------------|------------------------------|---------------|------------|-------------------|
| 10 | `claude/build-order-10-founder-critical-path-truth-pass` | Founder critical path, auth hardening, governance status bar | NO | 29 | +2534/−164 | HIGH — foundational changes |
| 11 | `claude/build-order-11-production-stability-identity-convergence` | Production stability, CMC components, identity convergence | NO | 39 | +3343/−189 | HIGH — builds on #10 |
| 12 | `claude/build-order-12-production-readiness-and-drift-elimination` | Production readiness, drift elimination | NO | 44 | +4142/−189 | HIGH — builds on #11 |
| 13 | `claude/build-order-13-ops-hardening-and-legacy-migration` | Ops hardening, legacy migration | NO | 52 | +5058/−189 | MEDIUM — ops layer |
| 14a | `claude/build-order-14-governed-export-and-ops-activation` | Governed export, ops activation | NO | 59 | +5503/−193 | MEDIUM — duplicate of 14b |
| 14b | `claude/build-order-14-governed-export-ops-activation` | Governed export, ops activation (variant) | NO | 59 | +5503/−193 | MEDIUM — duplicate of 14a |
| 15 | `claude/build-order-15-consumer-surface-convergence` | Consumer surface, document consequence model | NO | 67 | +6208/−263 | MEDIUM |
| 16 | `claude/build-order-16-workspace-truth-convergence` | Workspace truth convergence, governance model | NO | 71 | +6565/−268 | MEDIUM |
| 17 | `claude/build-order-17-governance-action-wiring` | Governance action wiring | NO | 75 | +6946/−291 | MEDIUM |
| 18 | `claude/build-order-18-workspace-governance-propagation` | Workspace governance context propagation | NO | 80 | +7328/−348 | MEDIUM |
| 19 | `claude/build-order-19-governance-detail-unification` | Governance detail unification | NO | 84 | +7657/−349 | LOW — incremental |
| 20 | `claude/build-order-20-workflow-gating-and-next-actions` | Workflow gating, next actions | NO | 88 | +8115/−349 | LOW — incremental |
| 21 | `claude/build-order-21-workflow-transition-enforcement` | Workflow transition enforcement, preflight banner | NO | 93 | +8625/−350 | LOW — incremental |
| 22 | `claude/build-order-22-declarative-navigation-governance` | Declarative navigation governance | NO | 97 | +8869/−351 | LOW — incremental |
| 23 | `claude/build-order-23-nav-source-governance-activation` | Nav source governance activation | NO | 101 | +9229/−357 | LOW — incremental |
| 24 | `claude/build-order-24-topbar-governance-convergence` | Topbar governance, context bars | NO | 106 | +9533/−370 | LOW — latest in chain |

## Non-Build-Order Claude Branches

| Branch | Concern Area | Merged? | Files Changed | Recovery Priority |
|--------|-------------|---------|---------------|-------------------|
| `claude/production-hardening-stability-dD0pg` | Production hardening, lean core, governance controller | NO | 19 | +1666/−132 | HIGH — standalone |

## Dependabot Branches (20)

Standard dependency update PRs. Not part of build-order chain. No recovery action needed.

## Key Observations

1. **All 17 Claude branches are NOT merged** to `concept2cure-v2`.
2. **Build-order branches are cumulative** — each builds on the previous. Branch 24 contains all changes from 10–24.
3. **Duplicate exists**: `build-order-14-governed-export-and-ops-activation` and `build-order-14-governed-export-ops-activation` have identical diffs.
4. **Common files touched across all build-order branches**:
   - `client/src/concept2cure/auth/ZenLogin.tsx`
   - `client/src/concept2cure/components/editor/GovernanceStatusBar.tsx`
   - `client/src/concept2cure/components/workspace/GovernedDecisionReviewPanel.tsx`
   - `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx`
   - `client/src/concept2cure/IndustryAwareApp.tsx`
   - `client/src/concept2cure/components/settings/ZenSettings.tsx`
5. **Recovery strategy**: Since branches are cumulative, recovering from branch 24 (the latest) would capture all prior work. However, cherry-picking from earlier branches may be safer for incremental validation.
