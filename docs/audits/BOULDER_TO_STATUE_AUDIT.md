# Boulder-to-Statue Audit

> Restructure audit log
> Generated: 2026-04-04

---

## Audit Summary

### Phase 1: Authority Purge
- **8 concerns** analyzed for duplicate ownership
- **4 canonical owners** explicitly declared (session, artifact identity, dossier placement, editor path)
- **4 concerns** deferred to touched-scope-only resolution (org identity, governance, workflow preflight, export)
- Full authority table in `docs/architecture/CANONICAL_AUTHORITIES_AND_RUNTIME_CUSTODY.md`

### Phase 2: Runtime Custody Reduction
- **13 packages** classified
- **1 package removed**: `@xyflow/react` (zero active imports)
- **3 packages quarantined**: `@neondatabase/serverless`, `@prisma/client`, `aws-sdk` v2
- **2 packages tolerated**: `postgres` (tenant DB), `@supabase/supabase-js` (specialized services)
- Canonical paths declared: drizzle+pg (DB), reactflow (graph), vitest (test), @aws-sdk/* (storage)

### Phase 3: Monolith Surgery
- **`ProjectWorkspaceShell.tsx`**: 3 modules extracted
  - `workspaceNavigationOrchestrator.ts` (~280 LOC) — navigation, workflow transitions, guided sequence
  - `workspaceArtifactManager.ts` (~340 LOC) — artifact loading, creation (5 paths), placement, move ops
  - `workspacePhase4Orchestrator.ts` (~250 LOC) — phase4 panels, consequence rows, governance normalization
  - Shell reduced from owning 13 responsibilities to composition + layout + surface assembly
- **`server/index.ts`**: Device-project CRUD extracted
  - `server/routes/device-projects.ts` (~260 LOC) — 4 CRUD endpoints moved to dedicated router
  - index.ts reduced by ~280 lines of inline domain logic

### Phase 4: Dirty Code Excavation
- `@xyflow/react` removed from package.json (zero consumers)
- 28 stale branch-era docs moved to `docs/archive/`
- All deletions/moves logged in `docs/audits/DELETION_AND_QUARANTINE_REGISTER.md`

### Phase 5: Docs Normalization
- `docs/architecture/` — active architecture truth (2 new files)
- `docs/audits/` — audit deliverables (2 new files)
- `docs/proof/` — build/typecheck proof (1 new file)
- `docs/archive/` — 28 stale docs preserved but separated from active truth

### Phase 6: Build/Typecheck Proof
- Results recorded in `docs/proof/BOULDER_TO_STATUE_PROOF.md`

---

## Files Added
| File | Purpose |
|---|---|
| `docs/architecture/CANONICAL_AUTHORITIES_AND_RUNTIME_CUSTODY.md` | Authority purge + runtime custody map |
| `docs/architecture/TARGET_SYSTEM_SHAPE.md` | Target architecture after restructure |
| `docs/audits/BOULDER_TO_STATUE_AUDIT.md` | This audit log |
| `docs/audits/DELETION_AND_QUARANTINE_REGISTER.md` | Every deletion/quarantine logged |
| `docs/proof/BOULDER_TO_STATUE_PROOF.md` | Build/typecheck/structural proof |
| `client/src/concept2cure/components/workspace/workspaceNavigationOrchestrator.ts` | Extracted navigation orchestration |
| `client/src/concept2cure/components/workspace/workspaceArtifactManager.ts` | Extracted artifact management |
| `client/src/concept2cure/components/workspace/workspacePhase4Orchestrator.ts` | Extracted phase4/governance orchestration |
| `server/routes/device-projects.ts` | Extracted device-project CRUD router |

## Files Modified
| File | Change |
|---|---|
| `server/index.ts` | Replaced 280 lines of inline device-project CRUD with 3-line router mount |
| `package.json` | Removed unused `@xyflow/react` dependency |

## Files Moved to Archive (28)
See `docs/audits/DELETION_AND_QUARANTINE_REGISTER.md` for full list.

## No Features Added
Zero new features. Zero scope widening. This is cleanup and restructure only.
