# BETA INTEGRITY BASELINE (Phase 0)

Date: 2026-03-26
Branch inspected: `work` (requested `concept2cure-v2` not present in local clone)

## 1) Current canonical shell files
- `client/src/concept2cure/ZenApp.tsx`
- `client/src/concept2cure/components/sidebar/ZenSidebar.tsx`
- `client/src/concept2cure/components/shell/GlobalOperatingShell.tsx`
- `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx`

## 2) Current compute truth
- Artifact compute APIs and persistence are wired through `server/routes/compute.ts` and `server/services/compute/computeService.ts`.
- The `docx` path is isolated via `workers/artifact-compute/docx-python-runtime.py` invoked by `server/services/compute/workerClient.ts`.
- Runtime maturity exists but is partially inferred by output format and not uniformly represented by runtime profile records.

## 3) Current conversation OS durability truth
- Primary Conversation OS state is in-memory (`Map`-backed kernel in `server/services/conversation-os/conversationKernel.ts`).
- Routes and services are functional, but restart durability is not guaranteed.

## 4) Current route-policy truth
- Project module route policy helper is present in `tests/concept2cure/project-module-route-policy.test.ts` coverage and `client/src/concept2cure/router/projectModuleRoutePolicy.ts` use in ZenApp.
- Nav identity mapping is duplicated and partly stale in ZenApp switch logic + inline nav mapping.

## 5) Current ownership/workbench persistence truth
- Ownership preference persistence for workbench context exists in ZenApp effects/mutations (`updateOwnershipPreferencesMutation` flow).
- Restoration behavior is present but vulnerable to nav identity mismatch drift.

## 6) Top 10 integration risks
1. Duplicated nav identity mappings in ZenApp (high drift risk).
2. Stale shell branding in sidebar surfaces.
3. Conversation OS in-memory kernel causes restart data loss.
4. Compute maturity labels are partly inferred and partly static.
5. Workspace shell has multiple context bars but no explicit project/document strip contract.
6. Right-drawer usage is easy to fork by mode-specific panels.
7. Review/report/vault nav IDs are inconsistently normalized.
8. Compute consequence metadata visibility can diverge across list vs detail payloads.
9. Type boundaries around large layout unions are brittle.
10. Integrated confidence trails lane-local confidence.

## 7) Exact files targeted for this sprint
- `docs/audits/BETA_INTEGRITY_BASELINE.md`
- `docs/audits/BETA_INTEGRITY_REPORT.md`
- `client/src/concept2cure/ZenApp.tsx`
- `client/src/concept2cure/components/sidebar/ZenSidebar.tsx`
- `client/src/concept2cure/components/shell/GlobalOperatingShell.tsx`
- `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx`
