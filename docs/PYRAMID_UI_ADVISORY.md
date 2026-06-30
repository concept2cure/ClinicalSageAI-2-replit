# Submission Pyramid UI Advisory Report

**Purpose**: Design and implementation guide for the Submission Pyramid UI.
This document maps the engine's full data surface, defines the recommended
view hierarchy, specifies interaction patterns, and sets constraints. The
frontend is a fresh build — no legacy UI compatibility required.

---

## 1. Engine Data Surface

The pyramid engine is a pure, deterministic computation layer (no DB, no
network). Every function below lives in
`services/regulatory/SubmissionPyramidEngine.ts` and re-exports types from
`services/regulatory/pyramids/types.ts`. The UI consumes these via API
routes — it never imports engine code directly.

### 1.1 Core Types

```
SubmissionType
  CoreSubmissionType:  '510K' | 'IND' | 'NDA' | 'BLA' | 'PMA' | 'MAA' | 'JNDA' | 'DE_NOVO'
  IndVariantType:      'IND_AMENDMENT' | 'IND_ANNUAL_REPORT' | 'IND_SAFETY_SUPPLEMENT'

TaskStatus:  'todo' | 'in-progress' | 'review' | 'done' | 'blocked'
RiskSeverity: 'low' | 'medium' | 'high' | 'critical'
```

### 1.2 Pyramid Structure

```
SubmissionPyramid
  ├── type: SubmissionType
  ├── phases: PyramidPhase[]
  │     ├── id, name, order, description?, estimatedWeeks?
  │     └── tasks: PyramidTask[]
  ├── tasks: PyramidTask[]              (flat list — same refs as in phases)
  ├── totalEstimatedHours?: number
  └── criticalPathIds?: string[]

PyramidTask extends BaseTask
  ├── id, name, estimatedHours
  ├── phaseId, dependencies: string[]
  ├── role?: string                     (freeform — 'ra_lead', 'cmc_writer', etc.)
  ├── critical?: boolean
  ├── description?: string
  ├── risk?: TaskRisk
  │     ├── severity: RiskSeverity
  │     ├── probability: number
  │     ├── impact: string
  │     └── mitigations: string[]
  ├── documentBindings?: DocumentBinding[]
  │     ├── ctdSection: string          ('M2.5', 'M3.2.P', 'M5.3.5.1')
  │     ├── sectionTitle: string
  │     ├── ectdLifecycleOp?: 'new' | 'append' | 'replace' | 'delete'
  │     └── artifactTypes?: string[]
  ├── subTasks?: SubTask[]
  │     ├── id, name, estimatedHours
  │     ├── documentBinding?: DocumentBinding
  │     └── deliverable?: string
  ├── timeline?: TaskTimeline
  │     ├── typicalStartWeek?, typicalDurationWeeks?
  │     ├── fdaMilestone?: string
  │     └── regulatoryDeadlineDays?: number
  ├── guidance?: RegulatoryGuidance
  │     ├── fdaGuidanceRef?, ichGuideline?, cfrReference?
  │     └── keyConsiderations?: string[]
  ├── crossSubmissionDeps?: CrossSubmissionDep[]
  │     ├── targetSubmissionType, targetTaskId
  │     ├── relationship: 'feeds_into' | 'derived_from' | 'supersedes' | 'parallel'
  │     └── description?: string
  └── deliverables?: string[]
```

### 1.3 Progress Tracking (client-owned state)

```
TaskProgress                            (UI sends this TO the engine)
  ├── taskId, status: TaskStatus
  ├── actualHours?, startedAt?, completedAt?
  ├── assigneeId?, notes?

ProgressSummary                         (engine returns this)
  ├── total, completed, percentComplete
  ├── perPhase: Record<string, PhaseProgress>
  │     └── { total, completed, percentComplete, estimatedHoursRemaining }
  ├── criticalPathProgress: number
  ├── estimatedHoursRemaining: number
  └── riskScore: number
```

### 1.4 Engine Functions

| Function | Input | Output | Use Case |
|----------|-------|--------|----------|
| `getPyramidForProject(type)` | SubmissionType | SubmissionPyramid | Load pyramid structure |
| `getAllSupportedTypes()` | — | SubmissionType[] | Populate type selector (11 types) |
| `calculateProgress(pyramid, progress[])` | Pyramid + task statuses | ProgressSummary | Dashboard metrics |
| `getNextAvailableTasks(pyramid, progress[])` | Pyramid + task statuses | PyramidTask[] | "What's next" panel |
| `getCriticalPath(pyramid, progress[])` | Pyramid + task statuses | PyramidTask[] | Critical path highlight |
| `getRiskProfile(pyramid, progress[])` | Pyramid + task statuses | `{totalRiskScore, highRiskTasks[], mitigationGaps[]}` | Risk dashboard |
| `getResourceAllocation(pyramid)` | Pyramid | ResourceAllocation[] | Workload distribution |
| `getResourceBottlenecks(pyramid, capacity[])` | Pyramid + team capacity | Bottleneck[] with `overloaded` flag | Resource planning |
| `getDocumentCoverage(pyramid)` | Pyramid | CTD section coverage[] | Document completeness matrix |
| `getCrossSubmissionDependencies(pyramid)` | Pyramid | CrossSubmissionDep[] | Dependency graph |
| `estimateTimeline(pyramid)` | Pyramid | TimelineEstimate[] per phase | Gantt / timeline view |
| `getGuidanceReferences(pyramid)` | Pyramid | GuidanceReference[] per task | Regulatory reference panel |
| `flattenWithSubTasks(pyramid)` | Pyramid | FlattenedTask[] | Detailed work breakdown |
| `getDeliverablesCatalog(pyramid)` | Pyramid | Deliverable[] per task/phase | Document checklist |

### 1.5 Global Pyramids (International)

A separate module (`services/regulatory/globalPyramids.ts`) with its own type
system — different from the engine types:

```
GlobalPyramidConfig
  ├── type: GlobalSubmissionType        (12 values: HC_NOC, PMDA_SHONIN, etc.)
  ├── agency, region, format: 'eCTD' | 'CTD' | 'custom'
  ├── levels: GlobalPyramidLevel[]      (id, name, order, color)
  ├── tasks: GlobalPyramidTask[]        (id, title, description, level, estimatedHours,
  │                                      assignedRole, dependencies[], deliverables[],
  │                                      status: 'pending' | 'in-progress' | 'done')
  ├── totalEstimatedDays: number
  └── localRequirements: string[]

Functions:
  getGlobalPyramid(type) → GlobalPyramidConfig
  getAvailableGlobalSubmissions() → GlobalSubmissionType[]
  getPyramidsByRegion(region) → GlobalPyramidConfig[]
```

> **Design note**: Global pyramids use `title` + `level` + `assignedRole` +
> `deliverables[]` where engine pyramids use `name` + `phaseId` + `role` +
> `deliverables[]`. The UI adapter layer must normalize these into a common
> rendering model.

### 1.6 Submission Type Bridge

`shared/regulatory/submission-type-bridge.ts` resolves any variation of a
submission type string (case-insensitive, aliased) to a canonical registry ID.
Use for:

- Type selector search/autocomplete (`isKnownSubmissionType`, `resolveToRegistryEntry`)
- Display labels (`getSubmissionTypeLabel`)
- Structured context for detail panels (`getSubmissionTypeContext` → region, agency, CTD module, dossier standard)
- Full dropdown options (`getSubmissionTypeOptions` → value/label/segment/category)

---

## 2. Recommended View Hierarchy

```
App
├── [1] Submission Type Selector         (entry point — pick or create project)
├── [2] Pyramid Dashboard                (top-level metrics + phase overview)
│     ├── [2a] Progress Ring / Bar       (percentComplete, criticalPathProgress)
│     ├── [2b] Phase Strip               (horizontal phase cards with per-phase %)
│     ├── [2c] Risk Gauge                (totalRiskScore, high-risk count)
│     ├── [2d] Next Actions Panel        (getNextAvailableTasks results)
│     └── [2e] Timeline Summary          (phase start/end weeks, milestones)
├── [3] Phase Detail View                (drill into a single phase)
│     ├── [3a] Task List                 (cards or rows with status, role, hours)
│     ├── [3b] Dependency Graph          (task-to-task within phase)
│     └── [3c] Phase Progress Bar
├── [4] Task Detail Sheet                (slide-over or modal for one task)
│     ├── [4a] Status + Assignment       (status select, assignee, actual hours)
│     ├── [4b] Sub-tasks Checklist       (expandable sub-task list)
│     ├── [4c] Risk Card                 (severity badge, impact, mitigations)
│     ├── [4d] Document Bindings         (CTD section links, lifecycle op)
│     ├── [4e] Regulatory Guidance       (FDA ref, ICH guideline, CFR, considerations)
│     ├── [4f] Cross-Submission Deps     (linked tasks in other submission types)
│     └── [4g] Deliverables Checklist    (artifact list with completion state)
├── [5] Analytics Views                  (secondary tabs / routes)
│     ├── [5a] Resource Allocation       (role-based bar chart, bottleneck flags)
│     ├── [5b] Document Coverage Matrix  (CTD sections × tasks heatmap)
│     ├── [5c] Timeline / Gantt          (phase bars + milestone markers)
│     ├── [5d] Risk Heatmap              (severity × probability scatter/grid)
│     └── [5e] Deliverables Catalog      (filterable table, grouped by phase)
└── [6] Global Submissions View          (international pyramid browser)
      ├── [6a] Region Filter             (Americas, Europe, Asia-Pacific)
      ├── [6b] Pyramid Card Grid         (agency, format, estimated days)
      └── [6c] Global Pyramid Detail     (level hierarchy + task list)
```

---

## 3. Component Architecture

### 3.1 Data Flow

```
Server (engine functions)
  │
  ├── GET /api/pyramid/:submissionType     → SubmissionPyramid
  ├── POST /api/pyramid/progress           → ProgressSummary
  ├── GET /api/pyramid/next-tasks          → PyramidTask[]
  ├── GET /api/pyramid/risk-profile        → RiskProfile
  ├── GET /api/pyramid/resources           → ResourceAllocation[]
  ├── GET /api/pyramid/timeline            → TimelineEstimate[]
  ├── GET /api/pyramid/document-coverage   → CoverageEntry[]
  ├── GET /api/pyramid/guidance            → GuidanceReference[]
  ├── GET /api/pyramid/deliverables        → DeliverableCatalog[]
  ├── GET /api/global-pyramids             → GlobalPyramidConfig[]
  └── GET /api/global-pyramids/:type       → GlobalPyramidConfig
  │
Client (React)
  │
  ├── PyramidProvider (context)            — holds current pyramid + progress state
  │     ├── pyramid: SubmissionPyramid
  │     ├── progress: TaskProgress[]       — persisted to server
  │     ├── computed: ProgressSummary      — recalculated on progress change
  │     └── actions: updateTaskStatus(), assignTask(), addNote()
  │
  ├── Presentational components            — pure, receive props
  └── Hook layer                           — usePyramid(), useProgress(),
                                             useRiskProfile(), useTimeline()
```

### 3.2 Key Components

| Component | Data Source | Notes |
|-----------|------------|-------|
| `SubmissionTypeSelector` | `getAllSupportedTypes()` + `getSubmissionTypeOptions()` | Grouped by segment (pharma, device, cross-cutting). Search via `isKnownSubmissionType`. |
| `PyramidDashboard` | `calculateProgress()` | Top-level summary. Re-computes when any task status changes. |
| `PhaseStrip` | `pyramid.phases` + `progressSummary.perPhase` | Horizontal scrollable strip. Each card shows phase name, task count, % complete. Click drills to Phase Detail. |
| `TaskCard` | Single `PyramidTask` + matching `TaskProgress` | Compact card: name, role badge, hours, risk severity dot, status chip. |
| `TaskDetailSheet` | Single `PyramidTask` (full model) | Slide-over panel. All metadata tabs: sub-tasks, risk, documents, guidance, deps, deliverables. |
| `NextActionsPanel` | `getNextAvailableTasks()` | Highlight panel showing ready-to-start tasks. Should update reactively when tasks complete. |
| `CriticalPathIndicator` | `getCriticalPath()` | Visual indicator (badge, color, or path highlight) on tasks in the critical path. |
| `RiskGauge` | `getRiskProfile()` | Donut or gauge showing aggregate risk. Click expands to high-risk task list + mitigation gaps. |
| `TimelineView` | `estimateTimeline()` | Horizontal Gantt-style bars per phase. Milestone diamonds for FDA milestones. |
| `ResourceChart` | `getResourceAllocation()` + `getResourceBottlenecks()` | Stacked bar by role. Overloaded roles get a warning indicator. |
| `DocumentCoverageMatrix` | `getDocumentCoverage()` | Grid: CTD sections (rows) × coverage status (columns). Color-coded by completeness. |
| `GuidancePanel` | `getGuidanceReferences()` | Collapsible reference list per task. FDA guidance, ICH, CFR links. |
| `DeliverablesCatalog` | `getDeliverablesCatalog()` | Filterable table grouped by phase. Checkbox state derived from task completion. |
| `DependencyGraph` | `pyramid.tasks` (dependencies field) | DAG visualization. Nodes = tasks, edges = dependency arrows. Highlight critical path. |
| `GlobalPyramidBrowser` | `getAvailableGlobalSubmissions()` + `getPyramidsByRegion()` | Card grid with region filter tabs. Each card shows agency logo, format, estimated days. |

---

## 4. Interaction Patterns

### 4.1 Task Status Transitions

```
todo ──→ in-progress ──→ review ──→ done
  │                        │
  └──→ blocked             └──→ in-progress (rework)
```

- Status changes trigger `calculateProgress()` recomputation
- When a task moves to `done`, check if any blocked tasks become unblocked
  (run `getNextAvailableTasks()` to refresh the "what's next" panel)
- Critical path tasks should show a warning before being deprioritized

### 4.2 Drill-Down Pattern

```
Dashboard (aggregate) → Phase (group) → Task (detail)
```

Every level should show:
- **Breadcrumb** back to parent
- **Progress** at that level (overall → phase → task sub-tasks)
- **Risk** at that level (aggregate → phase risk → task risk card)

### 4.3 Pyramid Selector Flow

1. User lands on selector — sees 11 submission types grouped by category
2. Types show: display name, estimated hours, phase count, task count
3. On selection → load pyramid → land on Dashboard view
4. Switching types resets progress context (confirm if progress exists)

### 4.4 Assignment & Collaboration

- `TaskProgress.assigneeId` maps to team member
- `role` on each task suggests the appropriate assignee role
- Resource allocation view shows per-role workload to guide assignments
- Bottleneck warnings surface when a role is overloaded

---

## 5. Visual Design Constraints

### 5.1 Risk Severity Color Scale

| Severity | Color Token | Usage |
|----------|-------------|-------|
| `low` | Green / muted | Dot indicator, background tint |
| `medium` | Amber / yellow | Dot indicator, background tint |
| `high` | Orange | Dot indicator, border accent, badge |
| `critical` | Red | Dot indicator, pulsing badge, alert banner |

### 5.2 Phase Color Ramp

Phases are ordered (1–8). Use a sequential color ramp (cool → warm or
light → saturated) so phase order is visually scannable without reading labels.
The `GlobalPyramidLevel.color` field provides explicit hex values for global
pyramids — use those directly.

### 5.3 Status Chips

| Status | Visual | Icon |
|--------|--------|------|
| `todo` | Ghost/outline chip | Circle |
| `in-progress` | Solid primary chip | Spinner / half-circle |
| `review` | Solid secondary chip | Eye |
| `done` | Solid success chip | Checkmark |
| `blocked` | Solid destructive chip | Lock / ban |

### 5.4 Data Density

Regulatory professionals expect **dense, information-rich** interfaces — not
consumer-app whitespace. Design for:

- **Compact task rows** with inline status, role, hours, risk dot (no card bloat)
- **Scannable tables** over decorative cards for deliverables, guidance, coverage
- **Collapsible sections** for metadata-heavy panels (guidance refs, sub-tasks)
- **Sticky headers** for phase context during long task lists
- **Inline editing** for status changes (click-to-toggle, not navigate-to-edit)

### 5.5 Typography Hierarchy

```
H1: Submission type name + display label     ("IND — Investigational New Drug")
H2: Phase name                               ("Phase 3: Nonclinical Studies")
H3: Task name                                ("Pharmacology Studies")
Body: Descriptions, guidance text, considerations
Mono: CTD section codes, task IDs, CFR references
Caption: Estimated hours, week numbers, deadlines
```

---

## 6. Data Rendering Rules

### 6.1 Optional Field Handling

Many task fields are optional. The UI must degrade gracefully:

| Field | If Missing | Behavior |
|-------|-----------|----------|
| `risk` | No risk card | Hide risk indicators; do not show "No risk" |
| `documentBindings` | No CTD section | Hide document tab in task detail |
| `subTasks` | No sub-task list | Hide sub-tasks section entirely |
| `timeline` | No week markers | Omit from timeline view; show "–" in tables |
| `guidance` | No regulatory refs | Hide guidance tab in task detail |
| `crossSubmissionDeps` | No dep links | Hide cross-submission section |
| `deliverables` | No checklist | Hide deliverables tab |
| `role` | Unassigned | Show "Unassigned" muted text |
| `description` | No detail text | Show name only, no empty description block |

Rule: **never render an empty section**. If the data is absent, the section
does not exist in the UI.

### 6.2 Number Formatting

- Hours: always show as `Xh` (e.g., `24h`, `114h`) — no decimal places
- Weeks: `Week X` or `Wk X–Y` for ranges
- Percentages: whole numbers only (`73%` not `73.2%`)
- Risk scores: single decimal (`4.2`) or whole number bar width
- Days (global pyramids): `~200 days` for estimates

### 6.3 CTD Section Display

CTD sections follow the ICH module hierarchy. Display as:

```
M2.5 — Clinical Overview
M3.2.P — Drug Product
M5.3.5.1 — Clinical Study Reports
```

Always show both the code and the title. Group by module number when listing
multiple bindings:

```
Module 2 (Summaries)
  M2.5 — Clinical Overview
  M2.7 — Clinical Summary
Module 3 (Quality)
  M3.2.S — Drug Substance
  M3.2.P — Drug Product
```

---

## 7. API Route Design

These routes do not exist yet. They must be created to serve the engine's
pure functions to the client.

### 7.1 Pyramid Structure Routes

```
GET  /api/v1/pyramids/types
     → { types: SubmissionType[], count: number }

GET  /api/v1/pyramids/:submissionType
     → SubmissionPyramid
     (validates type via submission-type-bridge)

GET  /api/v1/pyramids/:submissionType/timeline
     → TimelineEstimate[]

GET  /api/v1/pyramids/:submissionType/resources
     → ResourceAllocation[]

GET  /api/v1/pyramids/:submissionType/document-coverage
     → DocumentCoverageEntry[]

GET  /api/v1/pyramids/:submissionType/guidance
     → GuidanceReference[]

GET  /api/v1/pyramids/:submissionType/deliverables
     → DeliverableCatalog[]

GET  /api/v1/pyramids/:submissionType/flattened
     → FlattenedTask[]
```

### 7.2 Progress Routes (require project context)

```
POST /api/v1/projects/:projectId/pyramid/progress
     Body: { taskProgress: TaskProgress[] }
     → ProgressSummary

GET  /api/v1/projects/:projectId/pyramid/next-tasks
     → PyramidTask[]

GET  /api/v1/projects/:projectId/pyramid/critical-path
     → PyramidTask[]

GET  /api/v1/projects/:projectId/pyramid/risk-profile
     → { totalRiskScore, highRiskTasks[], mitigationGaps[] }

POST /api/v1/projects/:projectId/pyramid/bottlenecks
     Body: { capacity: RoleCapacity[] }
     → ResourceBottleneck[]
```

### 7.3 Global Pyramid Routes

```
GET  /api/v1/global-pyramids
     → GlobalPyramidConfig[]

GET  /api/v1/global-pyramids/:type
     → GlobalPyramidConfig

GET  /api/v1/global-pyramids/by-region/:region
     → GlobalPyramidConfig[]
```

---

## 8. State Management Guidance

### 8.1 Server State vs Client State

| Data | Owner | Cache Strategy |
|------|-------|----------------|
| Pyramid structure | Server (immutable) | Cache indefinitely per type — structures never change at runtime |
| Task progress | Server (persisted) | Optimistic update → sync. Re-fetch on reconnect. |
| Computed metrics | Derived (pure) | Recompute client-side on progress change, or re-fetch |
| Team capacity | Client input | Local state until saved to project settings |
| UI state (selected phase, expanded panels) | Client only | Component state / URL params |

### 8.2 Recommended Query Keys

```
['pyramid', submissionType]                       → structure
['pyramid', submissionType, 'timeline']           → timeline
['pyramid', submissionType, 'resources']          → resources
['pyramid', submissionType, 'coverage']           → document coverage
['project', projectId, 'progress']                → task progress
['project', projectId, 'risk']                    → risk profile
['project', projectId, 'next-tasks']              → available tasks
['global-pyramids']                               → all global configs
['global-pyramids', type]                         → single global config
```

### 8.3 Optimistic Updates

Task status changes should be optimistic:
1. Update local `TaskProgress[]` immediately
2. Recompute `ProgressSummary` client-side (or call engine on server)
3. POST to server in background
4. Rollback on error

---

## 9. Accessibility Requirements

- All interactive elements must be keyboard-navigable
- Status changes must announce via `aria-live` region
- Risk severity colors must not be the sole indicator — always pair with text label or icon shape
- Phase strip must be horizontally scrollable via keyboard (arrow keys)
- Task detail sheet must trap focus when open, restore on close
- Data tables must use proper `<table>` semantics with `<th>` scope attributes
- Progress percentages must have `aria-valuenow`, `aria-valuemin`, `aria-valuemax`
- Dependency graph must have a tabular fallback for screen readers

---

## 10. Performance Considerations

### 10.1 Data Size

| Submission Type | Phases | Tasks | With Sub-tasks |
|----------------|--------|-------|----------------|
| IND | 8 | ~49 | ~80+ |
| IND_AMENDMENT | 5 | ~28 | ~40+ |
| 510K | 5–6 | ~25 | ~35+ |
| Global (NMPA) | 8 | ~16 | ~16 |

Payload sizes are small (5–30 KB per pyramid). No pagination needed. The
entire pyramid can load in a single request and be held in memory.

### 10.2 Rendering Strategy

- Virtualize task lists only if displaying `flattenWithSubTasks()` output
  (80+ rows). Phase-grouped views (5–10 tasks per phase) do not need
  virtualization.
- Dependency graph rendering should lazy-load the graph library and compute
  layout in a web worker if the task count exceeds 40.
- Timeline/Gantt view can use canvas rendering for smooth scrolling at scale.

---

## 11. Data Cardinality Reference

| Dimension | Count |
|-----------|-------|
| Core submission types | 8 |
| IND variant types | 3 |
| Total engine types | 11 |
| Global submission types | 12 |
| Phases per pyramid | 3–8 |
| Tasks per pyramid | 16–50+ |
| Sub-tasks per task | 0–5 |
| Document bindings per task | 0–3 |
| Roles across all pyramids | ~8 distinct (ra_lead, cmc_writer, clinical_ops, etc.) |
| CTD modules referenced | M1–M5 |
| Regulatory guidance sources | FDA Guidance, ICH Guidelines, CFR References |

---

## 12. Global vs Engine Pyramid Normalization

The UI must present both engine pyramids (11 types) and global pyramids
(12 types) in a unified experience. The two systems have different shapes:

| Aspect | Engine Pyramid | Global Pyramid |
|--------|---------------|----------------|
| Task name field | `name` | `title` |
| Grouping | `phaseId` → `PyramidPhase` | `level` → `GlobalPyramidLevel` |
| Role field | `role` | `assignedRole` |
| Time estimate | `estimatedHours` | `estimatedHours` |
| Color | Derived from phase order | Explicit `level.color` hex |
| Status type | `TaskStatus` (5 values) | `'pending' \| 'in-progress' \| 'done'` (3 values) |
| Has risk/guidance/CTD | Yes (optional) | No |

### Recommended Adapter

Create a `NormalizedTask` and `NormalizedGroup` type that both systems map to:

```typescript
interface NormalizedTask {
  id: string;
  name: string;             // from name OR title
  estimatedHours: number;
  role: string;              // from role OR assignedRole
  dependencies: string[];
  deliverables: string[];
  status: TaskStatus;        // map 3-value to 5-value
  groupId: string;           // from phaseId OR level
  // Engine-only enrichment (null for global)
  risk?: TaskRisk;
  documentBindings?: DocumentBinding[];
  subTasks?: SubTask[];
  guidance?: RegulatoryGuidance;
}

interface NormalizedGroup {
  id: string;
  name: string;
  order: number;
  color?: string;            // explicit for global, derived for engine
  tasks: NormalizedTask[];
}
```

---

## 13. Suggested Implementation Order

| Priority | View | Depends On | Effort |
|----------|------|-----------|--------|
| P0 | Submission Type Selector | API: `/pyramids/types` | S |
| P0 | Pyramid Dashboard (progress ring, phase strip) | API: pyramid + progress | M |
| P0 | Task List + Status Toggle | API: pyramid + progress CRUD | M |
| P0 | Task Detail Sheet (all tabs) | Pyramid structure loaded | L |
| P1 | Next Actions Panel | Progress state | S |
| P1 | Critical Path Highlight | Progress state | S |
| P1 | Risk Gauge + Risk Detail | API: risk-profile | M |
| P1 | Timeline / Gantt View | API: timeline | M |
| P2 | Resource Allocation Chart | API: resources | M |
| P2 | Document Coverage Matrix | API: document-coverage | M |
| P2 | Regulatory Guidance Panel | API: guidance | S |
| P2 | Deliverables Catalog | API: deliverables | S |
| P2 | Dependency Graph (DAG) | Pyramid structure loaded | L |
| P3 | Global Pyramid Browser | API: global-pyramids | M |
| P3 | Resource Bottleneck Planner | API: bottlenecks + team capacity input | M |
| P3 | Cross-Submission Dependency View | API: cross-deps | M |

**S** = small (< 1 day), **M** = medium (1–2 days), **L** = large (3+ days)

---

## 14. Open Questions for Design

1. **Single-project vs multi-project**: Does the UI manage one submission at a
   time, or should the dashboard show multiple active submissions with a
   portfolio view?

2. **Progress persistence**: Where does `TaskProgress[]` live? Options:
   - Database (project-scoped, shared across team)
   - Local storage (single-user, no collaboration)
   - Hybrid (local-first, synced to server)

3. **Notifications**: Should task status changes or deadline proximity trigger
   notifications? The engine provides `regulatoryDeadlineDays` per task.

4. **Printing / Export**: Regulatory teams often need printable submission
   checklists. Should the deliverables catalog and document coverage matrix
   support PDF export?

5. **Global pyramid editing**: Global pyramids are currently read-only
   definitions. Should the UI allow customization (adding local tasks,
   adjusting estimates)?

6. **Role management**: `role` is a freeform string today. Should the UI
   maintain a team roster with role assignments, or accept freeform input?

---

## Appendix A: Platform Infrastructure Reference

The existing UI is being replaced, but these platform-level tools and
conventions are available for the new build.

### A.1 Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19 + TypeScript |
| Bundler | Vite |
| Styling | Tailwind CSS 4.2 |
| Component primitives | shadcn/ui (Radix UI) |
| Charts | Recharts 2.13 (wrapped in `ChartContainer`) |
| Diagrams | React Flow 11.11 (for DAG / dependency graphs) |
| Virtualization | react-window 2.2 |
| Animation | Framer Motion 11.18 |
| State (server) | TanStack React Query 5.60 |
| State (local) | Zustand (where needed), React Context |
| API | Plain REST with typed service clients (no tRPC) |

### A.2 Design Tokens

Color palette uses warm, Anthropic-branded tones (not default Tailwind):

| Token | Hex | Use |
|-------|-----|-----|
| Primary / Terracotta | `#D97757` | Brand accent, CTAs |
| Accent / Blue | `#6A9BCC` | Secondary actions, links |
| Success / Green | `#788C5D` | Completed states |
| Neutral (cream) | `#FAF9F5` | Background |
| Neutral (dark) | `#141413` | Text |
| Chart colors | `chart-1` through `chart-5` + named | Data visualization |

Tokens live in:
- `tailwind.config.ts` — color extensions, radius, keyframes
- `client/src/styles/theme.css` — CSS variables (`--color-*`, `--elevation-*`, `--radius-*`)

### A.3 API Client Pattern

```typescript
// Service client (follow this pattern for pyramid routes)
const pyramidClient = {
  getTypes: () => request<TypesResponse>('GET', '/api/v1/pyramids/types'),
  getPyramid: (type: string) => request<SubmissionPyramid>('GET', `/api/v1/pyramids/${type}`),
  // ...
};

// React Query hook
export const usePyramid = (type: string) =>
  useQuery({
    queryKey: ['pyramid', type],
    queryFn: () => pyramidClient.getPyramid(type),
  });
```

Auth headers (`Authorization: Bearer`, `x-organization-id`) are injected
automatically by the base `request()` function.

### A.4 Key File Paths

| What | Path |
|------|------|
| Tailwind config | `tailwind.config.ts` |
| Theme CSS variables | `client/src/styles/theme.css` |
| shadcn/ui components | `client/src/components/ui/` |
| Chart wrapper | `client/src/components/ui/chart.tsx` |
| Query client + auth | `client/src/lib/queryClient.ts` |
| Query options helper | `client/src/lib/api/query-options.ts` |
| Pyramid engine (server) | `services/regulatory/SubmissionPyramidEngine.ts` |
| Pyramid types (server) | `services/regulatory/pyramids/types.ts` |
| Global pyramids (server) | `services/regulatory/globalPyramids.ts` |
| Submission type bridge | `shared/regulatory/submission-type-bridge.ts` |
