# BETA INTEGRITY BASELINE (Phase 0)

> Status: SUPERSEDED
> Canonical: No
> Supersedes: —
> Superseded By: BETA_READINESS_MASTER.md
> Related Reports: BETA_INTEGRITY_REPORT.md; LAUNCH_GATE_DOCUMENT_CONSEQUENCE_BASELINE.md


Date: 2026-03-26 (UTC)
Branch observed: `work` (requested `concept2cure-v2` branch is not present locally)

## 1) Canonical shell/nav files

Primary shell/navigation truth is currently concentrated in:
- `client/src/concept2cure/ZenApp.tsx`
- `client/src/concept2cure/components/sidebar/ZenSidebar.tsx`
- `client/src/concept2cure/components/shell/GlobalOperatingShell.tsx`
- `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx`

`ZenApp.tsx` is the effective routing and nav identity broker via layout mode + nav-id mapping and shell orchestration.

## 2) Current compute truth

Compute has a credible governed consequence path with runtime maturity labeling already present:
- Runtime maturity is explicitly derived and surfaced (`production-path`/`provisional`/`stub`; seeded appears in panel fallback).
- Compute jobs retain artifact consequence metadata including artifact/version/status, placement, provenance ref, and audit ref.
- UI panel already exposes consequence reopening affordances (editor/provenance/audit-oriented information).

Primary compute files:
- `server/routes/compute.ts`
- `server/services/compute/computeService.ts`
- `server/services/compute/runtimeProfiles.ts`
- `server/services/compute/artifactWriteback.ts`
- `client/src/concept2cure/components/compute/ComputeJobPanel.tsx`

## 3) Current Conversation OS durability truth

Before this sprint hardening, conversation state was primarily in-memory (`kernelStore` maps/arrays in `conversationKernel.ts`) with no restart-safe primary storage.

Durability gap areas:
- tool manifests
- tool events
- retrieval chunks/results
- scout findings
- plans
- proposals and proposal status
- artifact version consequences

## 4) Current route-policy truth

Route policy helper usage is present and should be preserved:
- `getProjectModuleRoutePolicy` is consumed from `ZenApp.tsx` and is part of project module routing embed policy tests.

## 5) Current ownership/workbench restoration truth

Workbench restoration behavior is controlled inside `ZenApp.tsx` by:
- active project ownership preferences
- `currentWorkbenchContext` persistence flow
- synchronization of layout mode with stored ownership preferences

This area is tightly coupled to layoutMode transitions and should not be rewritten.

## 6) Current document-first truth

Document-first behavior is substantially represented in `ProjectWorkspaceShell.tsx` with project nav/document tabs and governed panels. Compute writeback indicates governed artifact lifecycle integration rather than export-only flow.

Remaining concern: shell-level context labels and nav identity mismatches can still obscure that governed-document consequence is the primary operating truth.

## 7) Top 10 integration risks

1. Layout-to-nav identity drift in `ZenApp` can create shell inconsistency.
2. Conversation OS restart volatility if kernel remains in-memory only.
3. Fragmented shell semantics if `GlobalOperatingShell` and sidebar diverge.
4. Hidden regression risk in workbench restoration side effects.
5. Document tab identity not clearly bound to governed behavior in user perception.
6. Over-reporting runtime maturity where emitters are provisional.
7. Compute consequence metadata regressions across route/service/UI seams.
8. Route-policy embed regressions from shell navigation refactors.
9. Parallel shell affordances leading to “second operating model” confusion.
10. Existing test surface may miss shell/context integration edges.

## 8) Exact files to touch in this sprint

- `docs/audits/BETA_INTEGRITY_BASELINE.md`
- `docs/audits/BETA_INTEGRITY_REPORT.md`
- `client/src/concept2cure/ZenApp.tsx`
- `client/src/concept2cure/components/shell/GlobalOperatingShell.tsx`
- `server/services/conversation-os/conversationKernel.ts`
- `server/services/conversation-os/toolGateService.ts`
- `server/services/conversation-os/scoutService.ts`
- `server/services/conversation-os/orchestrationService.ts`
- `server/services/conversation-os/artifactProposalService.ts`
- `server/services/conversation-os/retrievalService.ts`
