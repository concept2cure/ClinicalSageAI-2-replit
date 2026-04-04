# Recovery Branch Drift Matrix

> Generated: 2026-04-04
> Recovery branch: `claude/recovery-branch-truth-convergence`
> Base: `concept2cure-v2`

## Source Branches Analyzed

All 17 stranded `claude/*` branches (build-order-10 through 24 + production-hardening-stability).
Since branches are cumulative, BO24 (the chain tip) was used as the recovery source.

## Divergence Check

Every file ported was verified to be UNCHANGED on `concept2cure-v2` since the branch point
(`1fb580ef`). Zero conflict risk.

## Tier 1 — Workspace Governance Convergence

| File | Action | Source | Status |
|------|--------|--------|--------|
| `WorkspaceGovernanceContext.tsx` | NEW (400 lines) | BO24 | Ported |
| `workspaceGovernanceModel.ts` | NEW (236 lines) | BO24 | Ported |
| `GovernedDecisionReviewPanel.tsx` | NEW (427 lines) | BO24 | Ported |
| `TransitionPreflightBanner.tsx` | NEW (126 lines) | BO24 | Ported |
| `ProjectWorkspaceShell.tsx` | MODIFIED (+94 lines) | BO24 | Ported |
| `WorkspaceContextBars.tsx` | MODIFIED (+52 lines) | BO24 | Ported |
| `documentConsequence.ts` | MODIFIED (+104 lines) | BO24 | Ported |
| `workspaceShellControllers.ts` | MODIFIED (+43 lines) | BO24 | Ported |
| `GovernanceStatusBar.tsx` | MODIFIED (+136 lines) | BO24 | Ported |
| `useGovernance.ts` | DELETED | BO24 | Deleted — replaced by fabric path |
| `governance-controller.ts` | MODIFIED (+105 lines) | BO24 | Ported |
| `governance-observability.ts` | MODIFIED (+43 lines) | BO24 | Ported |
| `governed-decision-repository.ts` | MODIFIED (−9, +3) | BO24 | Ported + restored test helpers |

## Tier 2 — Auth/Session Hardening + Ops

| File | Action | Source | Status |
|------|--------|--------|--------|
| `server/routes/auth.ts` | MODIFIED (refactor) | BO24 | Ported — in-memory blacklist → service |
| `server/services/token-revocation.ts` | NEW (249 lines) | BO24 | Ported — 3-tier revocation service |
| `server/services/artifact-document-bridge.ts` | NEW (220 lines) | BO24 | Ported — document identity bridge |
| `server/routes/sso.ts` | MODIFIED (+3 lines) | BO24 | Ported |
| `server/lib/startup-invariants.ts` | NEW (144 lines) | BO24 | Ported |
| `server/services/maintenance/platform-maintenance.ts` | NEW (127 lines) | BO24 | Ported |
| `server/services/automation/scheduled-jobs.ts` | MODIFIED (+53 lines) | BO24 | Ported |
| `server/routes/concept2cure.ts` | MODIFIED (refactor) | BO24 | Ported — governance routes → controller |
| `server/routes/regulatory-correspondence.ts` | MODIFIED (+27 lines) | BO24 | Ported |
| `server/services/docx/docxFactory.ts` | MODIFIED (+4 lines) | BO24 | Ported |
| `server/services/docxGenerator.ts` | MODIFIED (+4 lines) | BO24 | Ported |
| `migrations/0015_document_artifact_bridge.sql` | NEW (30 lines) | BO24 | Ported |
| `scripts/readiness-check.mjs` | NEW (68 lines) | BO24 | Ported |
| `scripts/ci/check-docx-runtime-canonicality.mjs` | NEW (189 lines) | BO24 | Ported |
| `scripts/ci/check-editor-extension-integrity.mjs` | NEW (119 lines) | BO24 | Ported |
| `scripts/ci/check-legacy-dep-quarantine.mjs` | NEW (91 lines) | BO24 | Ported |
| `package.json` | MODIFIED (+5 scripts) | BO24 | Ported (npm scripts only) |

## Deferred

| Item | Reason |
|------|--------|
| `@xyflow/react` removal from dependencies | May break existing features — needs audit |
| BO docs (`docs/architecture/build-order-*.md`, `docs/audits/build-order-*.md`, `docs/proof/build-order-*.md`) | 45 files, doc-only, no product impact — can port later if needed |
| BO test files (`tests/build-order-*.test.ts`, `tests/e2e/founder-critical-path.e2e.ts`, etc.) | 18 files — BO-specific proof tests, not needed for runtime |
| `client/src/concept2cure/IndustryAwareApp.tsx` | Modified in BO24, needs separate review |
| `client/src/concept2cure/auth/ZenLogin.tsx` | Modified in BO24, needs separate review |
| `client/src/concept2cure/components/settings/ZenSettings.tsx` | Modified in BO24, needs separate review |
| `client/src/components/cmc/ImpactGraphTab.jsx` | Modified in BO24, needs separate review |
| `client/src/components/cmc/ProcessCanvasEditor.jsx` | Modified in BO24, needs separate review |

## Files NOT Touched (Tier 3 — Already Superseded)

All changes in BO10-BO17 are subsets of BO24. No separate port needed.
The BO24 port covers all cumulative changes from the entire chain.
