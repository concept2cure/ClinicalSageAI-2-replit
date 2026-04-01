# AnA Projects Module — Ranked Remediation Checklist (Execution-Ready)

Date: 2026-04-01  
Scope: Concept2Cure v2 AnA Projects module, Claude Projects parity, and platform backbone integration  
Status: Implementation plan (not yet applied in this document)

---

## 0) Executive Summary

The current AnA Projects module is **functional but not backbone-grade yet**.  
Core API-backed flows are present in the active ZenApp path, but there are critical hardening gaps:

- Missing frontend function call target (`patchOwnershipPreferencesAPI`) in active path
- Tenant-safety gaps in project-module mutation routes
- Duplicate `/api/projects` route behavior and policy drift
- Likely instructions persistence gap in project config save flow
- Ongoing split between API-backed project world and legacy local-context world

This checklist prioritizes:
1. **P0 platform safety and correctness**  
2. **P1 Claude Projects parity features**  
3. **P2 nervous-system/backbone consolidation**

---

## 1) P0 — Must Fix First (Safety + Correctness)

## P0.1 Fix missing ownership-preferences API function (active runtime path)

### Why
- `useProjects.ts` calls `patchOwnershipPreferencesAPI(...)` but function is undefined.
- Active ZenApp layout persistence path uses this mutation.

### Evidence
- `client/src/concept2cure/hooks/useProjects.ts` (call at ~L373)
- `client/src/concept2cure/ZenApp.tsx` (invocation at ~L1095)

### Files to change
1. `client/src/concept2cure/hooks/useProjects.ts`

### Exact patch instructions
- Add a concrete helper:
  - `async function patchOwnershipPreferencesAPI(projectId: string, preferences: {...}): Promise<Project>`
  - Endpoint: `PATCH /api/concept2cure/projects/:id/ownership-preferences`
  - Use existing auth header pattern in file (short-term), or migrate hook to `apiRequest()` in same patch if feasible.
- Keep response normalization via `normalizeProjectResponse(withRequiredOwnership(...))`.
- Ensure mutation returns updated project shape consistently.
- Keep fallback block only if intentionally allowed (see P1.2 for stricter fallback policy).

### Acceptance criteria
- Changing workspace mode in ZenApp no longer throws missing function errors.
- `currentWorkbenchContext` persists and reloads correctly after refresh.
- No TypeScript unresolved symbol for `patchOwnershipPreferencesAPI`.

### Tests
- Add: `tests/concept2cure/useProjects-ownership-preferences.test.ts`
  - Mocks successful PATCH response, verifies mutation updates query cache and returns normalized ownership.

---

## P0.2 Enforce tenant scoping for project-module DELETE/PATCH mutations

### Why
- Unlink/status mutation paths currently omit org scoping in service where-clause.
- This is a high-severity cross-tenant mutation risk.

### Evidence
- `server/routes/project-modules.ts` (`DELETE` and `PATCH .../status` do not pass tenant identifiers)
- `server/services/project-module-bridge.ts` (`unlinkModule` and `updateModuleStatus` filter only by project/module/id)

### Files to change
1. `server/routes/project-modules.ts`
2. `server/services/project-module-bridge.ts`

### Exact patch instructions
- In route handlers:
  - Resolve tenant via `getTenantContext(req)` (same as other handlers in file).
  - Pass `tenant.organizationId` (and optionally `tenant.clientWorkspaceId`) to bridge mutation methods.
- In service:
  - Update method signatures:
    - `unlinkModule(projectId, moduleType, moduleInstanceId, organizationId)`
    - `updateModuleStatus(projectId, moduleType, moduleInstanceId, status, organizationId)`
  - Add `eq(projectModules.organizationId, organizationId)` to mutation where clause.
  - Optionally include client-workspace scoping if policy requires (`clientWorkspaceId` gate).

### Acceptance criteria
- Module link cannot be deleted/updated if it does not belong to caller org.
- Existing in-org behavior remains unchanged.

### Tests
- Add: `tests/routes/project-modules-tenant-safety.test.ts`
  - Case A: same org mutation succeeds.
  - Case B: different org returns 404/403 and does not mutate row.

---

## P0.3 Remove `/api/projects` route duplication and route-order ambiguity

### Why
- Direct `app.get('/api/projects', ...)` and mounted `projects-management` both target same namespace.
- Behavior drift and policy inconsistency risk.

### Evidence
- `server/index.ts` direct route around ~L635
- `server/index.ts` management mount around ~L7082

### Files to change
1. `server/index.ts`
2. `server/routes/projects-management.ts` (if response-shape alignment needed)

### Exact patch instructions
- Choose one canonical owner for `/api/projects` list:
  - Recommended: `projects-management.ts`.
- Remove or rename the early direct route in `server/index.ts`.
- If legacy clients depend on exact payload shape, align management route output to preserve compatibility.
- Add a brief comment in `server/index.ts` that `/api/projects` is owned by the mounted router to prevent regression.

### Acceptance criteria
- Single handler path for `GET /api/projects`.
- No shadowing by route order.
- Consistent scoping and policy behavior for all `/api/projects` operations.

### Tests
- Add/extend: `tests/integration/unified-routers.test.ts`
  - Assert route resolves through expected router and returns consistent schema.

---

## P0.4 Enforce authenticated org boundary in `POST /api/projects` management route

### Why
- Route currently uses body `organizationId` for license and workspace operations.
- Must not trust body org in multi-tenant system.

### Evidence
- `server/routes/projects-management.ts` around `createProjectSchema.parse(req.body)` and downstream use

### Files to change
1. `server/routes/projects-management.ts`

### Exact patch instructions
- Resolve authenticated org from request tenant context.
- Reject if body org is provided and mismatches authenticated org.
- Preferred: drop `organizationId` from create payload contract and derive it server-side.
- Ensure `atomicCreateProject` receives authenticated org only.

### Acceptance criteria
- Cross-org creation attempts via crafted payload are rejected.
- Normal in-org creation remains functional.

### Tests
- Add: `tests/routes/projects-management-tenant-boundary.test.ts`
  - Valid auth-org create succeeds.
  - Mismatched body org fails closed.

---

## P0.5 Fix project instructions save path in active ZenApp config flow

### Why
- Config panel sends `customInstructions`, but active save handler (`handleEditProject`) does not persist it.

### Evidence
- `client/src/concept2cure/components/workspace/ProjectConfigPanel.tsx` (sends `customInstructions`)
- `client/src/concept2cure/ZenApp.tsx` (edit handler does not map it)

### Files to change
1. `client/src/concept2cure/ZenApp.tsx`
2. `client/src/concept2cure/hooks/useProjects.ts` (if calling ownership mutation directly here)

### Exact patch instructions
- In `handleEditProject`, when `data.customInstructions !== undefined`:
  - Call `updateOwnershipPreferencesMutation({ projectId, preferences: { projectInstructions: ... }})`
  - Or include equivalent persisted field through supported server endpoint.
- Keep existing metadata update path for general fields.
- Add user-visible success/error toast for save outcomes (not just console logging).

### Acceptance criteria
- Editing instructions in Project Config persists across refresh/session.
- Instructions appear in `ownership.preferences.projectInstructions` and chat context where expected.

### Tests
- Add: `tests/concept2cure/project-config-instructions-persistence.test.tsx`
  - Verify save triggers ownership preferences endpoint and updates state.

---

## 2) P1 — Claude Projects Parity and Product Completeness

## P1.1 Sharing and permission tiers (Can use / Can edit)

### Files
- Frontend:
  - `client/src/concept2cure/components/workspace/ProjectConfigPanel.tsx` (replace Team placeholder with functional sharing tab)
  - `client/src/concept2cure/components/projects/ProjectSwitcher.tsx` (shared indicators/filter)
- Backend:
  - `server/routes/concept2cure.ts` (project member management endpoints if not sufficient)
  - Relevant membership/ACL services

### Build requirements
- Invite members, assign role (`can_use`, `can_edit`), revoke access.
- Surface project visibility state.
- Enforce permissions in mutation routes and authoring actions.

### Acceptance
- Share workflow works end-to-end; read-only users cannot edit project configuration/knowledge.

---

## P1.2 Production policy for localStorage fallback

### Files
- `client/src/concept2cure/hooks/useProjects.ts`
- `client/src/concept2cure/hooks/useSessionRestore.ts`

### Build requirements
- Gate fallback behind explicit dev/demo flag.
- In production mode: fail visibly (ErrorState/toast) instead of silent divergence.
- Keep local draft storage for non-authoritative UX (fine), but not as canonical projects source.

### Acceptance
- API outage shows clear error, not silent stale local data.

---

## P1.3 Project conversation parity upgrades

### Files
- `server/routes/concept2cure.ts`
- `server/services/ana-ri/command-executor.ts`
- `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx`

### Build requirements
- Auto-title conversations robustly.
- Move conversation between projects.
- Preserve project-level context continuity after move.

### Acceptance
- User can reorganize conversation history without data loss.

---

## P1.4 Knowledge parity: text ingest + memory visibility

### Files
- `client/src/concept2cure/components/workspace/ProjectKnowledgePanel.tsx`
- `server/routes/concept2cure.ts` (knowledge endpoints)
- `server/services/memory-context-assembler.ts` / related memory services

### Build requirements
- Add direct text-note knowledge ingestion UX.
- Show memory-derived knowledge atoms with source/confidence metadata.
- Add clear provenance labels (uploaded file vs extracted memory vs decision record).

### Acceptance
- Knowledge panel contains both file-based and text/memory-based entries with traceability.

---

## P1.5 No-project default mode and scoped transitions

### Files
- `client/src/concept2cure/ZenApp.tsx`
- `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx`

### Build requirements
- Support explicit global/unscoped chat mode.
- Let user enter project scope deliberately.
- Keep commands requiring project context guarded with actionable prompts.

### Acceptance
- User can start in global mode, then scope into project without hard reset.

---

## 3) P2 — Nervous-System/Backbone Consolidation

## P2.1 Eliminate dual project worlds (legacy `ProjectContext` vs API-backed `useProjects`)

### Why
- Multiple surfaces still import/use `context/ProjectContext` and can diverge from canonical server state.

### Files (high-value first)
- `client/src/concept2cure/components/sidebar/ProjectsSidebar.tsx`
- `client/src/concept2cure/components/sidebar/NewProjectModal.tsx`
- `client/src/concept2cure/components/chat/ChatPanel.tsx`
- `client/src/concept2cure/context/ProjectContext.tsx` (deprecation path)

### Build requirements
- Migrate active components to query-backed hooks using canonical APIs.
- Keep `ProjectContext` as a thin adapter or remove once migrated.
- Ensure one authoritative project state flow.

### Acceptance
- No active user-critical path creates/reads projects from local-only store.

---

## P2.2 Normalize project route ownership and contracts

### Files
- `server/index.ts`
- `server/routes/projects-management.ts`
- `server/routes/concept2cure.ts`

### Build requirements
- Publish one authoritative route map:
  - `/api/concept2cure/projects/*` = product-facing API
  - `/api/projects/*` = internal/admin or fully harmonized contract
- Prevent silent duplicate semantics.

### Acceptance
- Clear API contract boundaries with tests and docs.

---

## 4) Integration with AnA (what to tighten)

Current integration is strong in principle (contextProfile -> ana-ri project context -> prefetch + commands + RIM intercept), but tighten:

1. Ensure project context IDs are consistently normalized (`proj_` handling).
2. Ensure commands that mutate project state respect tenant/project ACL uniformly.
3. Ensure `/haq` and `/ask` command results are tied to the same provenance and memory write path.
4. Add explicit observability around project-context failures in AnA route logs.

---

## 5) Recommended Commit Plan (small, reviewable units)

1. `fix: implement ownership preferences patch API in useProjects`
2. `fix: enforce tenant scope for project-module unlink and status updates`
3. `refactor: unify /api/projects list route ownership`
4. `fix: enforce authenticated org boundary for project create`
5. `fix: persist custom instructions from project config panel`
6. `feat: add project sharing permissions UI and API wiring`
7. `refactor: remove production localStorage fallback for canonical projects state`
8. `refactor: migrate sidebar project flows off legacy ProjectContext`

---

## 6) Test Gate Checklist

- [ ] Tenant boundary tests for project create/update/delete/module link mutations
- [ ] Ownership preferences persistence tests
- [ ] Project config instructions persistence tests
- [ ] Route ownership regression test (`/api/projects` no shadowing)
- [ ] Conversation move + title generation tests
- [ ] Project sharing ACL tests (`can_use` vs `can_edit`)
- [ ] AnA command coverage for `/haq` and `/ask` with project context and provenance

---

## 7) Definition of Done (Backbone-Ready)

The AnA Projects module is considered backbone-ready when all are true:

1. One authoritative project state path (no local-only canonical forks)
2. Tenant-safe mutations across every project and module route
3. Project instructions, context, and knowledge persist and round-trip reliably
4. AnA project context drives all project-scoped intelligence/actions with clear provenance
5. Claude Projects critical parity features are available (sharing, robust knowledge, thread management)
6. Test suite covers boundary, persistence, and route regression risks

