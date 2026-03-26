# BETA INTEGRITY REPORT

Date: 2026-03-26
Sprint mode: **Beta Integrity Sprint**

## Outcome
**ONE LINE TRUTH:** improved but still fragile

## What was preserved from current HEAD
- Existing project-module route policy wiring and tests were preserved.
- Existing ownership/workbench preference persistence path in ZenApp was preserved.
- Existing compute plane API + governed artifact consequence flow was preserved.
- Existing workspace operating layers/workbenches/registry/governed panel/review pulse/placement flow were preserved in `ProjectWorkspaceShell`.

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
5. **Regression guardrails**
   - Added shell/nav regression test suite for mapping and branding guardrails.

## Files changed
- `docs/audits/BETA_INTEGRITY_BASELINE.md`
- `docs/audits/BETA_INTEGRITY_REPORT.md`
- `client/src/concept2cure/ZenApp.tsx`
- `client/src/concept2cure/components/shell/GlobalOperatingShell.tsx`
- `client/src/concept2cure/components/sidebar/ZenSidebar.tsx`
- `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx`
- `tests/concept2cure/shell-nav-regression.test.ts`

## Migrations added
- None in this increment.

## Exact merge decisions by file
- `ZenApp.tsx`: keep existing layout-mode architecture; replace duplicated inline nav identity with centralized constants and shared route mapping.
- `GlobalOperatingShell.tsx`: keep as host shell wrapper; make header always-on within shell context and convert labels/actions to operational nodes.
- `ZenSidebar.tsx`: retain structure and collapse behavior; update stale brand text and workflow grouping label only.
- `ProjectWorkspaceShell.tsx`: retain existing surface and panels; add lightweight project/document strips without changing panel architecture.
- `shell-nav-regression.test.ts`: add file-content regression assertions to prevent nav identity and branding backslide.

## Lint/test/typecheck truth
- ESLint on touched files: **pass with warnings** (pre-existing warning baseline remains high in touched large files).
- Targeted vitest suites: **pass**.
- Repo typecheck: **fail** due pre-existing syntax/type errors outside touched scope (`server/routes/ana-ri.ts`, `server/src/routes/control-plane.router.ts`).

## Manual smoke results
- Not executed in browser runtime in this environment.
- Static verification completed through targeted tests and lint on touched surfaces.

## Blockers / caveats
1. Conversation OS durability remains in-memory for primary kernel state in this increment.
2. No DB migrations/tables were introduced for Conversation OS persistence in this increment.
3. Full repo typecheck remains blocked by pre-existing unrelated failures.
4. Requested local branch `concept2cure-v2` was not present; work applied on current branch `work`.

## Next sprint recommendation
1. Implement DB-backed Conversation OS persistence with migrations and restart-safe tests first.
2. Split pre-existing typecheck failures from sprint-introduced failures by baseline snapshotting and staged cleanup.
3. Add integration-level UI smoke test covering shell header -> sidebar nav -> workspace strips -> compute consequence reopen flows.
