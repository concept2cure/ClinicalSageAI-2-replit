# AI Action System — Architecture Summary
**Phase 1 Implementation — 2026-03-21**

---

## Overview

The AI Action System is the **execution spine** that transforms Concept2Cure from "AI can talk" to "AI can execute governed work." It provides one canonical endpoint, one action registry, one artifact promotion pipeline, and one validation-refinement loop.

---

## 1. Action API Contract

### Endpoint
```
POST /api/ai-actions/execute
GET  /api/ai-actions/types
```

### Request Shape
```typescript
{
  actionType: AIActionType;         // 'promote_artifact', 'run_validation', etc.
  targetType: AIActionTargetType;   // 'artifact', 'document', 'project', etc.
  targetId: string | number | null; // Target entity ID
  projectId: number;                // Project scope (required)
  module?: AIActionModuleType;      // 'ind', '510k', 'cer', etc.
  context?: AIActionContext;        // Submission type, section code, etc.
  payload: Record<string, unknown>; // Action-specific data
  sourceSurface: AIActionSourceSurface; // Where invoked from
  conversationId?: number | string; // Thread continuity
  threadId?: string;
}
```

### Response Shape
```typescript
{
  success: boolean;
  actionType: AIActionType;
  status: 'completed' | 'queued' | 'partial' | 'failed';
  result: Record<string, unknown> | null;
  createdObjects: AIActionObjectRef[];  // { type, id, title, status, url }
  updatedObjects: AIActionObjectRef[];
  warnings: string[];
  errors: AIActionError[];              // { code, message, field?, details? }
  provenance: AIActionProvenance;       // actionId, timestamp, userId, auditLogId, integrityHash
  nextSuggestedActions: AIActionSuggestion[];  // Suggested follow-ups
}
```

### Supported Actions (Phase 1)
| Action | Description |
|--------|-------------|
| `promote_artifact` | Promote artifact → unified document |
| `create_document_from_artifact` | Alias for promote |
| `save_document_version` | Increment version with audit |
| `run_validation` | Validate artifact/document content |
| `refine_with_validation` | AI revision addressing validation findings |
| `route_document_to_module` | Link document to a module |
| `export_document` | Track export with provenance |
| `attach_sources_to_document` | Link source references |

---

## 2. Action Registry Design

### Files
```
server/services/ai-actions/
├── index.ts                    # Entry point — imports all handlers
├── action-registry.ts          # Registry + dispatcher
└── handlers/
    ├── promote-artifact.ts     # Artifact → document promotion
    ├── save-document-version.ts
    ├── run-validation.ts       # Structured validation
    ├── refine-with-validation.ts  # AI refinement loop
    ├── route-document.ts       # Module routing
    ├── export-document.ts      # Export tracking
    └── attach-sources.ts       # Source/citation attachment
```

### How It Works
1. Each handler implements `AIActionHandler` interface and calls `registerActionHandler()` at import time
2. `dispatchAction()` looks up the handler, validates, executes, and audit-logs
3. Every action gets a unique `actionId`, SHA-256 integrity hash, and `regulatoryAuditLogs` entry
4. Errors never break the audit trail — audit failures are swallowed

### Adding New Actions
```typescript
// server/services/ai-actions/handlers/my-new-action.ts
import { registerActionHandler } from '../action-registry';

const handler: AIActionHandler = {
  actionType: 'my_new_action',
  validate(request) { /* fast pre-check */ },
  async execute(request, ctx) { /* implementation */ },
};

registerActionHandler(handler);
```
Then add the import to `server/services/ai-actions/index.ts`.

---

## 3. Artifact Promotion Pipeline

### Problem Solved
The "two-world problem": `concept2cureArtifacts` (lightweight, AI-generated) vs `unifiedDocuments` (governed, versioned).

### Flow
```
concept2cureArtifacts              unifiedDocuments
┌────────────────────┐             ┌────────────────────┐
│ artifactId         │             │ id                 │
│ content            │──promote──▶ │ title              │
│ status: draft      │             │ status: draft      │
│ type: markdown     │             │ documentType       │
│ projectId          │             │ organizationId     │
│ organizationId     │             │ metadata.source... │
└────────────────────┘             └────────────────────┘
  status → approved                  latestVersion: 1
  metadata.promotedToDocumentId      metadata.sourceArtifactId
```

### Promotion preserves:
- Project association
- Organization scoping
- Content hash (SHA-256)
- Source artifact reference
- CTD section placement
- Full audit trail

---

## 4. Validation → Refinement Loop

### Flow
```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│ Content      │────▶│ run_validation│────▶│ ValidationReport│
│ (artifact or │     │              │     │  - findings[]   │
│  document)   │     │              │     │  - score        │
└─────────────┘     └──────────────┘     └────────┬────────┘
                                                   │
                                                   ▼
                                          ┌─────────────────┐
                                          │ refine_with_     │
                                          │ validation       │
                                          │  - AI revision   │
                                          │  - preserves     │
                                          │    structure     │
                                          └────────┬────────┘
                                                   │
                                                   ▼
                                          ┌─────────────────┐
                                          │ Refined content  │
                                          │  - provenance    │
                                          │  - version bump  │
                                          │  - re-validate?  │
                                          └─────────────────┘
```

### Validation Finding Format
```typescript
{
  severity: 'critical' | 'major' | 'minor' | 'info';
  issueType: 'content' | 'terminology' | 'compliance' | 'citation' | 'completeness';
  message: string;
  affectedSection?: string;
  position?: { start, end };
  recommendation: string;
  confidence: number; // 0-1
}
```

### Integration
- Uses existing `RealTimeValidationService` when available
- Falls back to basic structural validation if service is unavailable
- Refinement uses AI gateway (`unified-ai-client`) with `document_drafting` task type

---

## 5. Client Wiring Points

### Hook
```typescript
// client/src/concept2cure/hooks/useAIAction.ts
const { execute, isLoading, lastResponse, reset } = useAIAction();
const { promote, validate, refine } = useArtifactLifecycle(projectId);
```

### Wired Surfaces
| Surface | File | Integration |
|---------|------|-------------|
| AnaPersistentPanel | `components/chat/AnaPersistentPanel.tsx` | Suggested action intents routed through AI actions |
| DrSagePanel (Fix tab) | `components/dr-sage/DrSagePanel.tsx` | "Fix this" buttons use `run_validation` |

### How Client Calls Flow
```
useAIAction.execute()
  → fetch POST /api/ai-actions/execute
    → dispatchAction()
      → handler.validate()
      → handler.execute()
      → logAuditEntry()
    ← AIActionResponse
  ← query invalidation (artifacts, documents, project)
```

---

## 6. Known Follow-On Work (Phase 2)

### Must Build
- [ ] `assign_task` action handler (wire to `taskManagement.routes.ts`)
- [ ] `compile_dossier` action handler (orchestrated export)
- [ ] Streaming action responses for long-running operations
- [ ] Action chaining (promote → validate → route in one call)
- [ ] Full project context injection via `buildLumenContext()` in action handlers
- [ ] Inline AI actions on data tables (`<AITableAction>` component)
- [ ] Wire `useAIAction` into `ZenCommandPalette` (⌘K → action execution)
- [ ] Wire `useAIAction` into `LumenProjectAssistant`

### Should Build
- [ ] Action queue with status polling for async operations
- [ ] Optimistic UI updates in `useAIAction`
- [ ] Action permissions matrix (role → allowed actions)
- [ ] Cross-session action history UI
- [ ] Migrate legacy `chat-actions.ts` intents to action handlers

### Nice to Have
- [ ] Action middleware pipeline (pre/post hooks)
- [ ] Action replay for debugging
- [ ] Action analytics dashboard
- [ ] Batch action execution API

---

## 7. File Inventory

### New Files Created
| File | Purpose |
|------|---------|
| `shared/types/ai-actions.ts` | Shared type contracts |
| `server/services/ai-actions/action-registry.ts` | Registry + dispatcher |
| `server/services/ai-actions/index.ts` | Entry point |
| `server/services/ai-actions/handlers/promote-artifact.ts` | Artifact promotion |
| `server/services/ai-actions/handlers/save-document-version.ts` | Version save |
| `server/services/ai-actions/handlers/run-validation.ts` | Validation |
| `server/services/ai-actions/handlers/refine-with-validation.ts` | AI refinement |
| `server/services/ai-actions/handlers/route-document.ts` | Module routing |
| `server/services/ai-actions/handlers/export-document.ts` | Export tracking |
| `server/services/ai-actions/handlers/attach-sources.ts` | Source attachment |
| `server/routes/ai-actions.ts` | Express route |
| `client/src/concept2cure/hooks/useAIAction.ts` | Client hook |

### Modified Files
| File | Change |
|------|--------|
| `server/index.ts` | Route registration for `/api/ai-actions` |
| `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx` | `useAIAction` hook + intent routing |
| `client/src/concept2cure/components/dr-sage/DrSagePanel.tsx` | `useAIAction` hook + Fix tab wiring |
