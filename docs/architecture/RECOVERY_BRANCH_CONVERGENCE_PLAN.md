# Recovery Branch Convergence Plan

> Date: 2026-04-04
> Recovery branch: `claude/recovery-branch-truth-convergence`
> Target: `concept2cure-v2`

## What Was Done

### Recovery Method

1. Verified all 17 stranded `claude/*` branches are cumulative (BO10→BO24 chain).
2. Used BO24 (chain tip, 106 files) as the single recovery source.
3. Verified zero divergence on all target files between `concept2cure-v2` and the merge base.
4. Ported via `git checkout origin/claude/build-order-24... -- <file>` (clean copy, no conflict).
5. Applied manual edits only for `package.json` (additive only) and test helper restoration.

### Tier 1 — Workspace Governance (Complete)

**What it does:**
- `WorkspaceGovernanceContext` + `workspaceGovernanceModel` = single shared governance state machine
- Replaces scattered boolean toggles (`showGovernedPanel`, `reviewQueueVisible`, `proposalActionState`)
- `ProjectWorkspaceShell` wraps workspace in `WorkspaceGovernanceProvider`
- `GovernanceStatusBar` consumes shared model (no duplicate fetch)
- `GovernedDecisionReviewPanel` = full review queue UI
- `TransitionPreflightBanner` = governance-gated workflow transitions
- `WorkspaceContextBars` shows governance-aware nav affordances
- `useGovernance.ts` deleted — replaced by direct fabric consumption

**Single data path:** `useFabricDecisions()` → shell pushes into governance model → all children consume via context.

### Tier 2 — Auth/Session + Ops (Complete)

**What it does:**
- `token-revocation.ts` = 3-tier durable token revocation (Redis → DB → memory)
- `auth.ts` refactored to use revocation service instead of in-memory Set
- `artifact-document-bridge.ts` = canonical document identity convergence
- `startup-invariants.ts` = boot-time health checks
- `platform-maintenance.ts` = scheduled maintenance tasks
- `concept2cure.ts` governance routes refactored to use `governance-controller`
- `governance-observability.ts` enhanced with decision record table health check
- Migration `0015` adds document artifact bridge column
- 3 new CI scripts + readiness check

### Tier 3 — Lower Priority Branches

BO10-BO17 changes are subsets of BO24. No separate port was needed.
The standalone `production-hardening-stability` branch (19 files) overlaps with BO24 content.

## What Remains

1. **Deferred files** (see drift matrix) — IndustryAwareApp, ZenLogin, ZenSettings, CMC components
2. **BO doc/proof files** (45 files) — historical artifacts, no runtime impact
3. **BO test files** (18 files) — build-order proof tests, not governance-critical
4. **@xyflow/react removal** — needs dependency audit first

## What Becomes Branch Truth

Once merged to `concept2cure-v2`:
- Workspace governance has ONE shared state machine (not scattered booleans)
- Token revocation is durable (not in-memory)
- Document identity has a canonical bridge
- Governance routes delegate to controller (not inline)
- All 84 governance tests pass
