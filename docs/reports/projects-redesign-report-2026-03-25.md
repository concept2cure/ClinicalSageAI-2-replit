# Projects Redesign Report — ClinicalSageAI

> **Date**: 2026-03-25
> **Scope**: Full audit of the Projects feature (frontend, backend, database) with redesign recommendations
> **Branch**: concept2cure-v2

---

## Executive Summary

The Projects system in ClinicalSageAI is architecturally mature but has accumulated fragmentation from multiple development phases. This report audits every project-related component, route, service, and database table — then provides a concrete redesign plan organized into actionable segments.

**Key findings:**
- **20+ frontend components** across 5 directories — mostly production-ready, 2 have hardcoded mock data
- **7 route files** with **30+ endpoints** — but duplicate endpoints and legacy routes create confusion
- **17 database tables** — but legacy tables (`ind_projects`, `fda_510k_projects`, `cer_projects`) coexist with the modern unified `projects` table
- **1 deprecated route file** still mounted (`510k-project.routes.ts`)
- **1 deprecated component** still in codebase (`ProjectLauncher.tsx.deprecated`)

---

## Part 1: Frontend Audit

### 1.1 Component Inventory

| # | Component | Path | Lines | Status | Issues |
|---|-----------|------|-------|--------|--------|
| 1 | ProjectSwitcher | `components/projects/ProjectSwitcher.tsx` | 1031 | Production | None |
| 2 | ConnectedProjectSwitcher | `components/projects/ConnectedProjectSwitcher.tsx` | 100 | Production | None |
| 3 | ProjectTimeline | `components/projects/ProjectTimeline.tsx` | 512 | Production | None |
| 4 | ProjectHomeDashboard | `components/workflow/ProjectHomeDashboard.tsx` | 97 | Production | None |
| 5 | **DossierMap** | `components/workflow/DossierMap.tsx` | 137 | **Mock Data** | Hardcoded CTD_STRUCTURE (lines 26-77) |
| 6 | **SubmissionReadiness** | `components/workflow/SubmissionReadiness.tsx` | 130 | **Mock Data** | Hardcoded READINESS_ITEMS (lines 27-49) |
| 7 | ProjectWorkspaceShell | `components/workspace/ProjectWorkspaceShell.tsx` | ~1500 | Production | 75KB — largest workspace file |
| 8 | ProjectDashboard | `components/workspace/ProjectDashboard.tsx` | 705 | Production | None |
| 9 | ProjectFileTree | `components/workspace/ProjectFileTree.tsx` | ~400 | Production | None |
| 10 | ProjectKnowledgePanel | `components/workspace/ProjectKnowledgePanel.tsx` | ~350 | Production | None |
| 11 | ProjectSidebar | `components/workspace/ProjectSidebar.tsx` | ~300 | Production | None |
| 12 | ProjectFilesCompact | `components/workspace/ProjectFilesCompact.tsx` | 146 | Production | None |
| 13 | ProjectsSidebar | `components/sidebar/ProjectsSidebar.tsx` | 631 | Production | None |
| 14 | NewProjectModal | `components/sidebar/NewProjectModal.tsx` | ~200 | Production | None |
| 15 | ProjectReadinessDashboard | `components/readiness/ProjectReadinessDashboard.tsx` | ~200 | Production | None |
| 16 | SectionWorkspace | `components/workflow/SectionWorkspace.tsx` | 388 | Production | None |
| 17 | NextActionsPanel | `components/workflow/NextActionsPanel.tsx` | 332 | Production | None |
| 18 | StepCard | `components/workflow/StepCard.tsx` | 384 | Production | None |
| 19 | WorkflowTimeline | `components/workflow/WorkflowTimeline.tsx` | 488 | Production | None |
| 20 | CTDProjectWizard | `components/onboarding/CTDProjectWizard.tsx` | — | Production | None |

> All paths relative to `client/src/concept2cure/`

### 1.2 Frontend Issues

#### Issue F1: DossierMap uses hardcoded mock data
- **File**: `components/workflow/DossierMap.tsx` lines 26-77
- **Problem**: `CTD_STRUCTURE` is a static array with sample statuses ("approved", "drafting", "blocked")
- **Impact**: Component renders demo data, not real project state
- **Fix**: Fetch real dossier structure from `GET /api/project-sections` using `projectId`

#### Issue F2: SubmissionReadiness uses hardcoded mock data
- **File**: `components/workflow/SubmissionReadiness.tsx` lines 27-49
- **Problem**: `READINESS_ITEMS` is a static array with mock issues
- **Impact**: Readiness view shows fake data regardless of project
- **Fix**: Wire to readiness assessment endpoint or `useReadinessAssessment()` hook (which already exists in `ProjectReadinessDashboard`)

#### Issue F3: Deprecated file still in codebase
- **File**: `components/_archived/ProjectLauncher.tsx.deprecated`
- **Action**: Delete

### 1.3 Frontend Architecture Assessment

| Aspect | Rating | Notes |
|--------|--------|-------|
| Chat-first compliance | Pass | All features accessible through AnA |
| UI state standards | Pass | DataStateWrapper, proper loading/error |
| Multi-tenant isolation | Pass | Project ID properly threaded |
| Code splitting | Pass | Lazy loading used for editor |
| Accessibility | Partial | Most components use ARIA; verify DossierMap/SubmissionReadiness |

---

## Part 2: Backend Audit

### 2.1 Route Files

| # | File | Size | Endpoints | Status | Issues |
|---|------|------|-----------|--------|--------|
| 1 | `projects-management.ts` | 16 KB | 5 (CRUD) | **Primary** | None — modern pattern |
| 2 | `project-hierarchy.ts` | 24 KB | ~4 | Active | None |
| 3 | `project-modules.ts` | 11 KB | 2+ | Active | May be missing POST/DELETE |
| 4 | `project-sections.ts` | 47 KB | 10+ | Active | Table not in Drizzle schema |
| 5 | `project-rules.ts` | 23 KB | 7 | Active | Events not fully audited |
| 6 | **`projects-create.ts`** | 6.1 KB | 2 | **Duplicate** | Overlaps with projects-management.ts |
| 7 | **`510k-project.routes.ts`** | 14 KB | 5 | **Deprecated** | Sunset 2026-06-30 |

### 2.2 Service Files

| # | Service | Purpose | Status |
|---|---------|---------|--------|
| 1 | `project-rollup-service.ts` | Aggregate metrics for hierarchy | Active |
| 2 | `project-module-bridge.ts` | Module-to-project linking | Active |
| 3 | `intelligence/project-intelligence-service.ts` | RIM continuity object | Active |
| 4 | `firebase-projection.ts` | Event delivery (Firestore) | Active |

### 2.3 Backend Issues

#### Issue B1: Duplicate project creation endpoints
- **Duplicate 1**: `POST /api/projects` in `projects-management.ts` — modern, with audit/quota/rules
- **Duplicate 2**: `POST /api/workspace/projects` in `projects-create.ts` AND inline in `server/index.ts` (lines 7513-7620)
- **Impact**: Projects may land in different tables depending on which endpoint the client calls
- **Fix**: Consolidate to `projects-management.ts` pattern; deprecate `/api/workspace/projects`

#### Issue B2: Legacy project tables still actively used
- `projects-create.ts` writes to `ind_projects`, `fda_510k_projects`, `cer_projects`
- `projects-management.ts` writes to unified `projects` table
- **Impact**: Data fragmentation — two sources of truth
- **Fix**: Migrate legacy table data to `projects` table; route all writes through unified table

#### Issue B3: `project_sections` table not in Drizzle schema
- **File**: `project-sections.ts` uses raw SQL to `project_sections` table
- **Impact**: No type safety, no Drizzle migration tracking
- **Fix**: Add formal Drizzle schema definition in `shared/schema/`

#### Issue B4: Deprecated 510k routes still mounted
- **File**: `510k-project.routes.ts` — deprecated with sunset 2026-06-30
- **Action**: Verify migration path to `/api/fda510k-unified/projects` is complete, then remove

#### Issue B5: Rules engine event coverage unverified
- `project-rules.ts` defines 20+ trigger events
- Unknown how many are actually emitted by the codebase
- **Fix**: Audit event emissions against trigger definitions

### 2.4 Endpoint Map (Complete)

```
/api/projects
  GET    — List projects (org-scoped)          [projects-management.ts]
  POST   — Create project (quota + audit)      [projects-management.ts]

/api/projects/:id
  GET    — Get project                         [projects-management.ts]
  PATCH  — Update project                      [projects-management.ts]
  DELETE — Delete project                      [projects-management.ts]

/api/projects/:id/modules
  GET    — List linked modules                 [project-modules.ts]

/api/projects/:id/modules/summary
  GET    — Module summary by type              [project-modules.ts]

/api/project-hierarchy/programs
  GET    — List root-level projects (depth=0)  [project-hierarchy.ts]

/api/project-sections
  GET    — List sections (filtered)            [project-sections.ts]

/api/project-sections/initialize
  POST   — Bootstrap CTD sections              [project-sections.ts]

/api/project-sections/:code
  GET    — Get single section                  [project-sections.ts]

/api/project-sections/:code/status
  PATCH  — Status transition (21 CFR Part 11)  [project-sections.ts]

/api/project-sections/:code/assign
  PATCH  — Assign user to section              [project-sections.ts]

/api/project-sections/:code/deadline
  PATCH  — Set section deadline                [project-sections.ts]

/api/project-sections/:code/comments
  GET    — Get section comments                [project-sections.ts]
  POST   — Add comment                         [project-sections.ts]

/api/project-sections/summary
  GET    — Module-level progress               [project-sections.ts]

/api/project-sections/timeline
  GET    — Timeline with milestones            [project-sections.ts]

/api/project-sections/dependencies
  POST   — Add section dependency              [project-sections.ts]

/api/project-rules
  GET    — List rules                          [project-rules.ts]
  POST   — Create rule                         [project-rules.ts]

/api/project-rules/:ruleId
  GET    — Get rule                            [project-rules.ts]
  PATCH  — Update rule                         [project-rules.ts]
  DELETE — Delete/deactivate rule              [project-rules.ts]

/api/project-rules/:ruleId/test
  POST   — Dry-run rule execution              [project-rules.ts]

/api/project-rules/executions
  GET    — Execution audit log                 [project-rules.ts]

/api/project-rules/templates
  GET    — Built-in rule templates             [project-rules.ts]

--- DEPRECATED / DUPLICATE ---

/api/workspace/projects
  GET    — List projects (DUPLICATE)           [projects-create.ts + index.ts]
  POST   — Create project (DUPLICATE)         [projects-create.ts + index.ts]

/api/510k-project/*
  *      — All 510k endpoints (DEPRECATED)    [510k-project.routes.ts]
```

---

## Part 3: Database Audit

### 3.1 Table Inventory (17 tables)

| # | Table | Schema Location | Purpose |
|---|-------|-----------------|---------|
| 1 | `projects` | schema.ts:5013 | Core unified projects (hierarchical) |
| 2 | `clientWorkspaces` | schema.ts:1071 | Multi-tenant workspace isolation |
| 3 | `clientWorkspaceSettings` | schema.ts:1162 | Per-workspace settings |
| 4 | `clientAccess` | schema.ts:1119 | User-workspace RBAC |
| 5 | `projectModules` | schema.ts:6375 | Project-to-module linking |
| 6 | `projectWorkflowStages` | schema.ts:6425 | Workflow stages with CtQ |
| 7 | `projectTasks` | schema.ts:6479 | Tasks with dependencies |
| 8 | `projectRules` | schema.ts:6859 | Automation rules engine |
| 9 | `ruleExecutionLog` | schema.ts:6942 | Rule execution audit trail |
| 10 | `projectTemplates` | schema.ts:7089 | Reusable project templates |
| 11 | `projectIntelligenceProfiles` | schema.ts:15535 | RIM continuity object |
| 12 | `projectMemoryEntries` | schema.ts:15590 | Knowledge atoms (pgvector) |
| 13 | `projectIngestedDocuments` | schema.ts:15637 | Document tracking |
| 14 | `c2cProjectWorkItems` | schema.ts:5799 | Authoring-to-PM bridge |
| 15 | `ctdOnboardingProjects` | ctd-projects.ts:33 | CTD onboarding pipeline |
| 16 | `ctdOnboardingDocuments` | ctd-projects.ts:69 | CTD documents |
| 17 | `ctdComplianceGaps` | ctd-projects.ts:107 | CTD gap analysis |

### 3.2 Database Issues

#### Issue D1: Legacy tables not in modern schema
- `ind_projects`, `fda_510k_projects`, `cer_projects` are referenced in code but not defined in `shared/schema/`
- They are written to by `projects-create.ts` and inline routes in `server/index.ts`
- **Fix**: Migrate data to unified `projects` table, remove legacy table references

#### Issue D2: `project_sections` table missing from Drizzle
- Used extensively by `project-sections.ts` (raw SQL)
- Not tracked by Drizzle ORM migrations
- **Fix**: Define in `shared/schema/`, create migration

#### Issue D3: Hierarchy relationship diagram
```
organizations (root)
└── clientWorkspaces (1:N)
    └── projects (1:N, self-referential hierarchy depth 0-3)
        ├── projectModules (1:N)
        ├── projectWorkflowStages (1:N)
        │   └── projectTasks (1:N)
        ├── projectTasks (1:N, cross-stage)
        ├── projectRules (1:N, scope=project)
        ├── projectIntelligenceProfiles (1:1)
        │   ├── projectMemoryEntries (1:N, pgvector)
        │   └── projectIngestedDocuments (1:N)
        ├── c2cProjectWorkItems (1:N)
        └── concept2cureConversations (1:N)
```

---

## Part 4: Redesign Plan

### Segment 1 — Consolidate Project Creation (Priority: High)

**Goal**: Single source of truth for project creation.

| Step | Action | Files |
|------|--------|-------|
| 1a | Deprecate `projects-create.ts` — add deprecation middleware | `server/routes/projects-create.ts` |
| 1b | Remove inline `/api/workspace/projects` from `server/index.ts` | `server/index.ts` (lines 7513-7620) |
| 1c | Update all frontend calls from `/api/workspace/projects` to `/api/projects` | Client hooks/components |
| 1d | Write data migration script: `ind_projects` + `fda_510k_projects` + `cer_projects` → `projects` | `scripts/migrate-legacy-projects.ts` |

**Estimated scope**: ~4 files changed, 1 new migration script

---

### Segment 2 — Wire Mock Components to Real Data (Priority: High)

**Goal**: Eliminate hardcoded mock data in production UI.

| Step | Action | Files |
|------|--------|-------|
| 2a | Replace `CTD_STRUCTURE` in DossierMap with API call to `/api/project-sections` | `DossierMap.tsx` |
| 2b | Replace `READINESS_ITEMS` in SubmissionReadiness with `useReadinessAssessment()` hook | `SubmissionReadiness.tsx` |
| 2c | Add proper loading/error/empty states (DataStateWrapper) | Both components |

**Estimated scope**: 2 files changed

---

### Segment 3 — Schema Formalization (Priority: Medium)

**Goal**: All project tables tracked by Drizzle ORM.

| Step | Action | Files |
|------|--------|-------|
| 3a | Define `project_sections` table in Drizzle schema | `shared/schema/project-sections.ts` (new) |
| 3b | Export from `shared/schema/index.ts` | `shared/schema/index.ts` |
| 3c | Create migration file | `migrations/0011_project_sections.sql` |
| 3d | Refactor `project-sections.ts` routes from raw SQL to Drizzle ORM | `server/routes/project-sections.ts` |

**Estimated scope**: 1 new file, 2 files modified, 1 migration

---

### Segment 4 — Remove Deprecated Code (Priority: Medium)

**Goal**: Clean up dead code.

| Step | Action | Files |
|------|--------|-------|
| 4a | Delete `ProjectLauncher.tsx.deprecated` | `components/_archived/` |
| 4b | Remove `510k-project.routes.ts` (verify migration complete first) | `server/routes/` |
| 4c | Remove route mounting for deprecated endpoints | `server/index.ts` |

**Estimated scope**: 3 files deleted, 1 file modified

---

### Segment 5 — Rules Engine Audit (Priority: Low)

**Goal**: Verify all 20+ trigger events are actually emitted.

| Step | Action | Files |
|------|--------|-------|
| 5a | Grep codebase for each trigger event string | All route/service files |
| 5b | Document which events are wired vs unwired | Report file |
| 5c | Wire missing events or remove phantom triggers | `project-rules.ts` + emitting files |

**Estimated scope**: Audit + targeted fixes

---

### Segment 6 — UX Improvements (Priority: Low, Future)

**Goal**: Bring project experience closer to Claude Projects UX patterns.

| Enhancement | Description | Component |
|-------------|-------------|-----------|
| Project-level context window | Show token usage per project (already in ProjectKnowledgePanel) | Enhance visibility |
| Starred projects | Quick-access favorites (partially implemented in ProjectSwitcher) | Wire to backend |
| Project archival flow | Archive with confirmation, hide from default list | ProjectSwitcher + backend |
| Inline project creation from chat | `/new-project` slash command | AnA chat integration |

---

## Part 5: Implementation Priority Matrix

| Segment | Priority | Risk | Effort | Dependencies |
|---------|----------|------|--------|--------------|
| 1 — Consolidate creation | **High** | High (data split) | Medium | None |
| 2 — Wire mock components | **High** | Medium (fake data in prod) | Low | Segment 1 (for consistent project IDs) |
| 3 — Schema formalization | **Medium** | Low | Medium | None |
| 4 — Remove deprecated code | **Medium** | Low | Low | Segment 1 |
| 5 — Rules engine audit | **Low** | Low | Low | None |
| 6 — UX improvements | **Low** | None | Variable | Segments 1-4 |

---

## Summary

The Projects system is architecturally sound but needs consolidation. The highest-value work is:

1. **Unify project creation** to a single endpoint + single table (eliminates data fragmentation)
2. **Wire DossierMap and SubmissionReadiness** to real data (eliminates mock data in production)
3. **Formalize project_sections** in Drizzle schema (enables type safety)

All other items are cleanup and polish. Each segment is independently deployable and can be tackled in a single session.

---

*Report generated 2026-03-25. All file paths relative to repository root unless marked absolute.*
