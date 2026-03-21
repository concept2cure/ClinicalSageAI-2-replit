# Phase 3 Architecture — Orchestrated Intelligence, Predictive Guidance & Dossier Readiness

## Overview

Phase 3 transforms Concept2Cure from "AI can act on local surfaces" to "AI can coordinate governed work across the project." It adds five major capabilities on top of the Phase 1 action system and Phase 2 contextual wiring.

---

## 1. Workflow Orchestration Engine

### Design
The orchestration engine (`server/services/orchestration/workflow-orchestrator.ts`) is a **template-based sequential executor** built on top of the Phase 1 unified AI action system.

**Key Properties:**
- Template-driven: Workflows are defined as step sequences
- Sequential execution with safe-stop on failure
- Each step is either an AI action dispatch or internal orchestrator logic
- Full audit trail per execution
- Cancellable, resumable-ready architecture
- Permission-aware via Phase 1's role-based dispatch

**Execution Flow:**
```
Request → Template Lookup → Cross-Object Assembly → Step Loop:
  → Orchestrator Logic | AI Action Dispatch → Result Collection → Audit
→ Aggregate Results → Blockers + Recommendations + Readiness
```

### Workflow Templates

| Template | Steps | Purpose |
|----------|-------|---------|
| `submission_readiness_review` | 5 | Inspect → Inventory → Gap Analysis → Readiness Score → Recommendations |
| `draft_validate_route` | 5 | Inspect → Draft Plan → Validate → Recommendations → Compile |
| `project_blocker_scan` | 4 | Inspect → Scan Blockers → Prioritize → Next Actions |

Templates registered in: `server/services/orchestration/templates/`

### Extension Points
- Add new templates by creating files in `templates/` and calling `registerWorkflowTemplate()`
- Add custom orchestrator steps by extending the `executeOrchestratorStep()` switch
- Add async/long-running AI action steps by using the existing action queue infrastructure

---

## 2. Cross-Object Reasoning Layer

### Design
The cross-object resolver (`server/services/orchestration/cross-object-resolver.ts`) assembles structured reasoning payloads from multiple project object types.

**Assembled Payload Structure (`CrossObjectReasoningPayload`):**
```
├── project: ProjectSnapshot (name, status, progress, risk, counts)
├── documents: DocumentSnapshot[] (status, module, validation, routing)
├── artifacts: ArtifactSnapshot[] (version, published, promoted, CTD section)
├── validations: ValidationSnapshot[] (scores, findings by severity)
├── tasks: TaskSnapshot[] (status, blocked, overdue, dependencies)
├── moduleMap: ModulePlacementSnapshot[] (per-module coverage & gaps)
├── recentActions: ActionHistoryEntry[] (last 30 days of AI actions)
├── evidence: EvidenceSnapshot[] (type, quality, verification)
└── scope: { organizationId, projectId, module? }
```

**Key Features:**
- All queries are org-scoped (multi-tenant safe)
- Parallel query execution for speed
- `summarizePayloadForAI()` produces a compact text summary for system prompts
- Reusable by workflows, recommendations, readiness engine, and the contextual assistant

### Questions the Layer Can Answer
- What is missing? (moduleMap.missingItems, empty modules)
- What is stale? (lastModified > threshold)
- What is unvalidated? (documents without validation records)
- What is inconsistent? (promoted without validation, routed without approval)
- What is blocked? (tasks.isBlocked, critical findings)
- What should happen next? (recommendation engine output)

---

## 3. Predictive Recommendation Engine

### Design
The recommendation engine (`server/services/orchestration/recommendation-engine.ts`) produces structured, grounded recommendations from cross-object data.

**Recommendation Structure:**
```typescript
{
  id: string;
  recommendationType: 'missing_content' | 'weak_content' | 'stale_content' | ...;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  targetObjectType: string;
  targetObjectId: string | number;
  reason: string;           // Why this recommendation exists
  evidence: string[];       // Grounded in actual data
  suggestedAction: string;  // What to do
  actionPayload?: {...};    // Dispatchable to AI action system
  confidence: number;       // 0-1
}
```

**Analyzers (8 total):**
1. `analyzeUnvalidatedContent` — Documents in non-draft status with no validation
2. `analyzeUnroutedDocuments` — Non-draft documents without module assignment
3. `analyzeStaleContent` — Documents unchanged in 30+ days
4. `analyzeValidationFailures` — Critical/major validation findings
5. `analyzeModuleGaps` — CTD modules below expected document counts
6. `analyzeBlockedTasks` — Tasks in blocked state
7. `analyzeOverdueTasks` — Tasks past due date
8. `analyzeWeakContent` — Low compliance scores without critical findings

**Next Best Action:**
Derived from the highest-priority recommendation. Always grounded, never speculative.

**Rules Enforced:**
- Every recommendation is tied to a real object
- Every recommendation has evidence from system state
- Action payloads are dispatchable to the Phase 1 action system
- No motivational filler — only actionable items

---

## 4. Readiness Model & UI

### Readiness Engine
`server/services/orchestration/readiness-engine.ts`

**Scoring Model (weighted):**
| Dimension | Weight | Source |
|-----------|--------|--------|
| Completeness | 30% | Module coverage + document count vs baseline |
| Quality | 25% | Average validation scores + validation coverage |
| Compliance | 20% | Critical/major finding deductions |
| Routing | 15% | Percentage of documents with module assignments |
| Consistency | 10% | Cross-reference checks (promoted + validated, routed + validated) |

**Output: `ReadinessAssessment`**
- `overallScore` (0-100)
- `status`: not_started → in_progress → needs_attention → at_risk → on_track → ready
- Per-module breakdown with expected vs actual document counts
- Document inventory with readiness flags (drafted, validated, routed, approved, export-ready)
- Blockers by category and severity
- Recommendations from the predictive engine

### UI Components
Located in `client/src/concept2cure/components/readiness/`:

| Component | Purpose |
|-----------|---------|
| `ProjectReadinessDashboard` | Main tabbed surface with 6 views |
| `ReadinessScoreRing` | SVG circular progress with status color |
| `ModuleBreakdown` | Per-module progress bars with doc counts |
| `BlockerList` | Severity-styled blocker cards with resolve action |
| `RecommendationList` | Prioritized recommendations with confidence bars |
| `WorkflowRunner` | Template selector + step-by-step execution tracker |
| `ContinuityBriefing` | Cross-session intelligence summary |

**Route:** `/concept2cure/readiness` — Renders inside ZenApp shell with persistent AI access.

---

## 5. Project Continuity / Cross-Session Intelligence

### Design
`server/services/orchestration/continuity-service.ts`

**Continuity Snapshot (`ProjectContinuitySnapshot`):**
```
├── summary: Human-readable project status
├── changes: ContinuityChange[] (detected from audit logs since last snapshot)
├── activeBlockers: ReadinessBlocker[]
├── newlyReady: items that resolved since last snapshot
├── needsAttention: items requiring action
├── nextActions: top 5 recommendations
├── trajectory: 'improving' | 'declining' | 'stable'
├── metrics: { readinessScore, documentCount, validatedCount, blockerCount, taskCompletionPercent }
└── previousSnapshotId: for diff tracking
```

**Features:**
- Snapshots are project-scoped, not user-scoped
- Change detection compares against previous snapshot via audit logs
- Trajectory computed from readiness score delta
- Snapshots are inspectable and stored (trimmed to last 20 per project)
- No creepy/noisy behavior — explicit user-triggered or API-triggered

---

## 6. Contextual AI Integration

### Lumen Context Builder Enhancement
`server/services/lumen-context-builder.ts` now injects readiness intelligence into the AnA system prompt:

- Readiness score + subscores
- Top blockers (first 3)
- Top 5 recommendations with severity and suggested actions
- Instruction to reference this data when users ask about readiness, gaps, or next steps
- Suggestion to offer orchestration workflows

This means the contextual AI assistant can now answer:
- "What is missing for this module?" → References moduleMap gaps
- "What is most likely to get flagged?" → References validation failures + blockers
- "What should I work on next?" → References next best action

---

## 7. API Routes

`server/routes/orchestration.ts` — Mounted at `/api/orchestration/`

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/execute` | Run a workflow template |
| GET | `/templates` | List available templates |
| GET | `/executions/:id` | Get workflow execution state |
| GET | `/project/:id` | Get all workflows for a project |
| POST | `/cancel/:id` | Cancel a running workflow |
| POST | `/readiness` | Compute readiness assessment |
| POST | `/recommendations` | Generate recommendations |
| POST | `/continuity` | Generate continuity snapshot |
| GET | `/continuity/:projectId` | Get latest continuity snapshot |

---

## 8. Client Hooks

`client/src/concept2cure/hooks/useOrchestration.ts`

| Hook | Purpose |
|------|---------|
| `useWorkflowExecution()` | Execute, cancel, track workflow progress |
| `useReadinessAssessment(projectId)` | Fetch readiness with caching |
| `useRecommendations(projectId, opts)` | Fetch filtered recommendations |
| `useContinuity(projectId)` | Get/refresh continuity snapshot |
| `useWorkflowTemplates()` | List available templates |

---

## 9. Governance & Compliance

All Phase 3 features maintain:
- **Tenant scoping**: Every query is `organizationId`-filtered
- **Audit trail**: Workflows log every step to `auditTrail[]`
- **Provenance**: AI actions preserve provenance via Phase 1 action system
- **Permission awareness**: Workflow dispatch goes through Phase 1 permission checks
- **Failure safety**: `stopOnFailure` per step, safe-stop on permission or validation failures
- **Transparency**: All results, blockers, and recommendations are inspectable
- **No autonomous loops**: Workflows run once per invocation, no self-triggering

---

## 10. Extension Points for Phase 4+

1. **Persistent workflow storage**: Move execution state from in-memory Map to DB table
2. **Conditional branching**: Add edge conditions between workflow steps
3. **Parallel step execution**: Run independent steps concurrently
4. **HITL gates**: Integrate with ApprovalOrchestrator for human approval steps
5. **Recommendation dismissal**: Let users dismiss/snooze recommendations
6. **Readiness history**: Track readiness scores over time for trend visualization
7. **Cross-project intelligence**: Compare readiness across portfolio programs
8. **Real-time SSE**: Stream workflow progress via the existing SSE infrastructure
9. **Action chaining**: Recommendations that auto-queue follow-up workflows
10. **AI-generated readiness narratives**: Use the gateway to produce natural language summaries
