# Recovery Branch Truth Proof

> Date: 2026-04-04
> Recovery branch: `claude/recovery-branch-truth-convergence`

## Stranded Work

17 Claude branches, all NOT merged to `concept2cure-v2`:
- `build-order-10` through `build-order-24` (15 branches, cumulative chain)
- `build-order-14` duplicate (identical diff)
- `production-hardening-stability` (standalone, 19 files)

Total unique diff at chain tip (BO24): 106 files, +9533/−370

## What Was Ported

30 files changed, +3099/−301 (core product logic from BO24).

### Tier 1 — Workspace Governance
- 4 new files: WorkspaceGovernanceContext, workspaceGovernanceModel, GovernedDecisionReviewPanel, TransitionPreflightBanner
- 8 modified files: ProjectWorkspaceShell, WorkspaceContextBars, documentConsequence, workspaceShellControllers, GovernanceStatusBar, governance-controller, governance-observability, governed-decision-repository
- 1 deleted file: useGovernance.ts

### Tier 2 — Auth/Ops
- 6 new files: token-revocation, artifact-document-bridge, startup-invariants, platform-maintenance, readiness-check, migration 0015
- 3 new CI scripts
- 7 modified files: auth.ts, sso.ts, concept2cure.ts, regulatory-correspondence.ts, scheduled-jobs.ts, docxFactory.ts, docxGenerator.ts
- package.json updated (5 new npm scripts)

## What Was Deferred

- 8 client files (IndustryAwareApp, ZenLogin, ZenSettings, CMC components)
- 45 build-order doc/audit/proof files
- 18 build-order test files
- @xyflow/react dependency removal

## What Conflicts

None. Every ported file was verified UNCHANGED on `concept2cure-v2` since the merge base.

## Test Evidence

```
Test Files  5 passed (5)
     Tests  123 passed (123)
```

Tests run:
- `governed-document-decision-fabric.test.ts` — 34 passed
- `phase2-completion-convergence.test.ts` — 25 passed
- `phase2-fabric-assimilation.test.ts` — 25 passed
- `governed-decision-lifecycle.test.ts` — 27 passed
- `governed-decision-transition-log.test.ts` — 12 passed

## Acceptance Criteria Verification

### Tier 1
1. `WorkspaceGovernanceContext.tsx` — real, working, provides shared model via React context
2. `ProjectWorkspaceShell.tsx` — wraps workspace in `WorkspaceGovernanceProvider`, consumes unified governance model
3. `WorkspaceContextBars.tsx` — renders governance-aware nav affordances with gate status badges
4. `GovernanceStatusBar.tsx` — consumes shared fabric entries via `useWorkspaceGovernance()`, no duplicate fetch
5. `useGovernance.ts` — deleted, replaced by fabric-based data path
6. Tests pass — 123/123
7. Single fetch path: `useFabricDecisions()` → governance model → context consumers

### Tier 2
1. Token revocation — 3-tier (Redis → DB → memory), no in-memory-only logout
2. No in-memory-only logout truth — `auth.ts` delegates to `token-revocation.ts` service
3. `artifact-document-bridge` — clean, self-contained identity convergence
4. Tests pass
5. No deferred conflicts — all clean ports

## What Now Becomes Truth

This branch, when merged to `concept2cure-v2`, establishes:
- Workspace governance as a single shared state machine
- Token revocation as a durable, multi-tier service
- Document identity as a canonical bridge
- Governance routes delegating to a controller with observability
