# Deletion and Quarantine Register

> Boulder-to-Statue Restructure
> Generated: 2026-04-04

---

## Format

| # | Target | Category | Reason | Risk | Action | Rollback Note |
|---|---|---|---|---|---|---|

---

## Register

| # | Target | Category | Reason | Risk | Action | Rollback Note |
|---|---|---|---|---|---|---|
| 1 | `@xyflow/react` in package.json | Unused package | Installed (v12.10.2) but zero active imports. `reactflow` v11 is the active graph library. | None — no consumers | Remove from package.json | `npm install @xyflow/react@12.10.2` |
| 2 | Device-project CRUD inline in `server/index.ts` (lines 557-830) | Monolith extraction | Pure domain logic (4 CRUD endpoints) embedded in bootstrap file. Extracted to `server/routes/device-projects.ts`. | Low — route paths unchanged | Extract to dedicated router | Revert commit; inline routes still function if re-added |
| 3 | `workspaceNavigationOrchestrator.ts` extraction from `ProjectWorkspaceShell.tsx` | Monolith extraction | Navigation orchestration, guided sequence, layer/workbench switching extracted from 2163-line shell. | Low — same hooks, same behavior | Extract to focused module | Revert commit; inline code in shell |
| 4 | `workspaceArtifactManager.ts` extraction from `ProjectWorkspaceShell.tsx` | Monolith extraction | Artifact loading, creation (5 creation paths), placement, and move operations extracted from shell. | Low — same callbacks, same API calls | Extract to focused module | Revert commit; inline code in shell |
| 5 | `workspacePhase4Orchestrator.ts` extraction from `ProjectWorkspaceShell.tsx` | Monolith extraction | Phase4 panel openers, consequence tracking, governance normalization extracted from shell. | Low — same behavior | Extract to focused module | Revert commit; inline code in shell |
| 6 | Stale branch-era docs moved to `docs/archive/` | Docs normalization | Roadmap parts 1-5, transformation docs, obsolete audits moved to archive. Active truth remains in `docs/architecture/`. | None — content preserved in archive | Move to archive | Move back from archive |
| 7 | `@neondatabase/serverless` | Quarantined package | Used only in 2 setup scripts, not in production paths. Drizzle via `pg` is the canonical DB path. | None — scripts still work | Quarantine (noted, not removed) | N/A |
| 8 | `@prisma/client` | Quarantined package | Lazy-loaded fallback in 3 files. Wrapped in error proxy. Not primary ORM. | Low — fallback paths degrade gracefully | Quarantine (noted, not removed) | N/A |
| 9 | `aws-sdk` (v2) | Quarantined package | Legacy SDK. `@aws-sdk/*` v3 is the canonical AWS path. | Low — conditional loading | Quarantine (noted, not removed) | N/A |
| 10 | `docs/CONCEPT2CURE_ROADMAP_PART{1-5}.md` | Stale doc | Branch-era roadmap superseded by active plans. | None | Move to `docs/archive/` | Move back |
| 11 | `docs/CONCEPT2CURE_V2_TO_V3_TRANSFORMATION.md` | Stale doc | V2→V3 transformation doc — v2 is the active branch. | None | Move to `docs/archive/` | Move back |
| 12 | `docs/CONCEPT2CURE_V3_COMPLETE_SYSTEM.md` | Stale doc | V3 vision doc — not active truth. | None | Move to `docs/archive/` | Move back |
| 13 | `docs/CONSOLIDATION_ACTION_PLAN_2026-01-26.md` | Stale doc | January consolidation plan — completed. | None | Move to `docs/archive/` | Move back |
| 14 | `docs/DRIFT_REPORT.md` | Stale doc | Historical drift report. | None | Move to `docs/archive/` | Move back |
| 15 | `docs/REMEDIATION_ROADMAP.md` | Stale doc | Historical remediation plan — completed. | None | Move to `docs/archive/` | Move back |
| 16 | `docs/ROADMAP_INVENTORY.md` | Stale doc | Historical roadmap inventory. | None | Move to `docs/archive/` | Move back |
| 17 | `docs/STEP{1,2,6}_*.md`, `docs/STEP_AUDIT_LOG.md` | Stale doc | Migration step logs — completed. | None | Move to `docs/archive/` | Move back |
| 18 | `docs/TECH_DEBT_ANALYSIS_2026-01-24.md` | Stale doc | January tech debt analysis — superseded. | None | Move to `docs/archive/` | Move back |
| 19 | `docs/CONCEPT2CURE_UNIFIED_PROJECT_ROADMAP.md` | Stale doc | Unified roadmap — superseded. | None | Move to `docs/archive/` | Move back |
| 20 | `docs/CONCEPT2CURE_UX_FOUNDATION.md` | Stale doc | UX foundation doc — phase complete. | None | Move to `docs/archive/` | Move back |
| 21 | `docs/CONCEPT2CURE_PLANNING_INDEX.md` | Stale doc | Planning index — superseded. | None | Move to `docs/archive/` | Move back |
| 22 | `docs/CONCEPT2CURE_PROJECTS_IMPLEMENTATION.md` | Stale doc | Projects implementation plan — completed. | None | Move to `docs/archive/` | Move back |
| 23 | `docs/CONCEPT2CURE_DEEP_ACTIVATION_AUDIT.md` | Stale doc | Activation audit — completed. | None | Move to `docs/archive/` | Move back |
| 24 | `docs/DEVELOPER_AGENDA_ANSWERS.md` | Stale doc | Historical Q&A. | None | Move to `docs/archive/` | Move back |
| 25 | `docs/GO_NOGO.md` | Stale doc | Historical go/no-go assessment. | None | Move to `docs/archive/` | Move back |
| 26 | `docs/IMPLEMENTATION_TRACKER.md` | Stale doc | Historical tracker. | None | Move to `docs/archive/` | Move back |
| 27 | `docs/COAUTHOR_DECOMPOSITION_MAP.md` | Stale doc | Coauthor decomposition — completed. | None | Move to `docs/archive/` | Move back |
| 28 | `docs/COMMENTARY.md` | Stale doc | Historical commentary. | None | Move to `docs/archive/` | Move back |
| 29 | `docs/UI_ALIGNMENT_SUMMARY_2026-01-29.md` | Stale doc | January UI alignment — superseded. | None | Move to `docs/archive/` | Move back |
| 30 | `docs/UX_MASTER_ARCHITECT_REVIEW.md` | Stale doc | UX master review — completed. | None | Move to `docs/archive/` | Move back |
