# BETA INTEGRITY REPORT

Status: ACTIVE
Canonical: Yes
Supersedes: BETA_INTEGRITY_BASELINE.md
Superseded By: —
Related Reports: LAUNCH_GATE_DOCUMENT_CONSEQUENCE_REPORT.md


Date: 2026-03-26 (UTC)
Sprint mode: Beta Integrity Sprint (consolidate-and-finish)

## Outcome
**ONE LINE TRUTH:** improved but still fragile

## What was preserved from current HEAD
- Existing project-module route policy wiring and tests were preserved.
- Existing ownership/workbench preference persistence path in ZenApp was preserved.
- Existing compute plane API + governed artifact consequence flow was preserved.
- Existing workspace operating layers/workbenches/registry/governed panel/review pulse/placement flow were preserved in `ProjectWorkspaceShell`.
- Existing shell composition and single right-rail model.
- Existing Conversation OS API shapes and orchestration semantics.

## What was hardened this sprint
1. **Shell/nav identity normalization**
   - Introduced constants-based nav identity mapping in ZenApp.
   - Normalized identity mismatches: `vault-workspace -> vault`, `report-engine -> reports`, `review-readiness -> review`, `project-home -> projects`, and workspace/document modes -> `documents`.
2. **Global shell header coherence**
   - Upgraded `GlobalOperatingShell` into a persistent header with active global node and explicit Home/Search/Vault/Review/Reports/Submission actions.
   - Added active project and active artifact badge support.
3. **Sidebar brand and nav coherence**
   - Removed stale `ClinicalSage` branding from touched sidebar surface.
   - Clarified workflow nav grouping as `Global Operating Nav` while keeping collapsed behavior.
4. **Workspace context strips**
   - Added explicit `ProjectNav` and `DocumentTabs` strips in `ProjectWorkspaceShell` with governed inspector mappings (Compare/Provenance/Audit).
5. **Conversation OS durability**
   - Replaced memory-only primary truth with restart-safe snapshot hydrate/persist behavior.
   - Added persistence writes after manifest/event/chunk/finding/plan/proposal/version mutations.
6. **Regression guardrails**
   - Added shell/nav regression test suite for mapping and branding guardrails.

## Files changed
- `docs/audits/BETA_INTEGRITY_BASELINE.md`
- `docs/audits/BETA_INTEGRITY_REPORT.md`
- `client/src/concept2cure/ZenApp.tsx`
- `client/src/concept2cure/components/shell/GlobalOperatingShell.tsx`
- `client/src/concept2cure/components/sidebar/ZenSidebar.tsx`
- `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx`
- `tests/concept2cure/shell-nav-regression.test.ts`
- `server/services/conversation-os/conversationKernel.ts`
- `server/services/conversation-os/toolGateService.ts`
- `server/services/conversation-os/scoutService.ts`
- `server/services/conversation-os/orchestrationService.ts`
- `server/services/conversation-os/artifactProposalService.ts`
- `server/services/conversation-os/retrievalService.ts`

## Migrations added
- None in this increment.

## Lint / test / typecheck results
- ESLint on touched files: **pass with warnings** (pre-existing warning baseline remains high in touched large files).
- Targeted vitest suites: **pass**.
- Repo typecheck: **fail** due pre-existing syntax/type errors outside touched scope (`server/routes/ana-ri.ts`, `server/src/routes/control-plane.router.ts`).

## Blockers / caveats
1. Conversation OS durability is filesystem snapshot based; no DB-backed migration-based persistence yet.
2. Full repo typecheck remains blocked by pre-existing unrelated failures.
3. No in-browser smoke test executed in this environment.

## Next sprint recommendation
1. Implement DB-backed Conversation OS persistence with migrations and restart-safe tests.
2. Split pre-existing typecheck failures from sprint-introduced failures by baseline snapshotting.
3. Add integration-level UI smoke test covering shell header -> sidebar nav -> workspace strips -> compute consequence flows.
