# Clickthrough Audit: Segment 3 -- Project List & Project Creation

**Date:** 2026-03-30
**Auditor perspective:** Biotech client evaluating ClinicalSageAI for regulatory submissions
**Scope:** Project list view, project creation flow, project types, server-side CRUD

---

## Executive Summary

The project management surface has a **critical architectural split**: two independent systems manage projects -- a `ProjectContext` (localStorage-only, used by the active sidebar/modal) and a `useProjects` hook (API-backed, used by an unmounted component). The sidebar and "New Project" modal that users actually interact with **do not persist projects to the database**. Projects created through the main UI exist only in `localStorage` and will be lost on browser clear.

**Overall Verdict: FAIL (Critical)**

---

## 1. Project List View

### Component
**File:** `client/src/concept2cure/components/sidebar/ProjectsSidebar.tsx` (lines 408-758)
**Mounted in:** `client/src/concept2cure/layouts/Concept2CureLayout.tsx` (line 93, 107)

### What the User Sees
- Left sidebar (272px expanded, 64px collapsed) with "ClinicalSage" branding
- "New Project" button at top
- Search bar filtering by name, description, type, product
- Projects grouped into three sections: **PINNED**, **RECENT** (last 7 days), **GENERAL** (older)
- Each project row shows:
  - Submission type badge (color-coded: 510K blue, IND purple, NDA stone, BLA violet, MAA teal, PMA red, De Novo cyan, EUA orange, IVDR green)
  - Project name (13px, truncated)
  - Status dot (green=active, amber=in_review, blue=submitted, gray=archived/draft)
  - Product name subtitle (if set)
  - Three-dot menu on hover: New chat, Rename, Pin/Unpin, Archive, Delete
- Expand/collapse chevron reveals nested conversations per project
- Empty state: "No projects yet" with "Create your first project" CTA
- Collapsed mode: icon-only with tooltips

### Data Source
**FAIL -- localStorage only, no API fetch**

The `ProjectsSidebar` reads from `useProject()` which returns data from `ProjectContext`:
- **File:** `client/src/concept2cure/context/ProjectContext.tsx` (lines 704-726)
- On mount, loads from `localStorage.getItem('concept2cure_state')` (line 706)
- On every state change, saves back to `localStorage.setItem('concept2cure_state', ...)` (line 751)
- **No API call is ever made to fetch projects from the server**

There IS an API-backed hook at `client/src/concept2cure/hooks/useProjects.ts` that calls `GET /api/concept2cure/projects` (line 130), but it is only used by `ConnectedProjectSwitcher.tsx` which is **not mounted** in the active layout.

### What Happens When You Click a Project
- `handleProjectSelect(projectId)` at line 479-483
- Dispatches `SET_ACTIVE_PROJECT` to context (in-memory only)
- Auto-expands the project in the sidebar
- Sets most recent conversation as active
- **No server call** -- the project "selection" is purely client-side state

### Verdict: FAIL
- Data is localStorage-only; clearing browser data loses all projects
- No query key, no React Query, no API call
- The sidebar UI itself is well-built (search, grouping, status dots, conversation nesting) but is a facade over volatile storage

---

## 2. Create New Project

### Component
**File:** `client/src/concept2cure/components/sidebar/NewProjectModal.tsx` (lines 1-555)

### Three-Step Flow
**Step 1 -- Select Submission Type** (line 292-325)
- 2-column grid of 9 submission types (510K, IND, NDA, BLA, MAA, PMA, De Novo, EUA, IVDR)
- Each tile shows: icon, short name, full name, description
- Some marked "Early Access" (IND, NDA, BLA, MAA, EUA)
- Clicking a type advances to Step 2

**Step 2 -- Project Details** (lines 328-464)
- Fields:
  - Product / Device Name (required) -- `<Input>`, placeholder varies by type
  - Sponsor / Organization (optional) -- `<Input>`
  - Target Agency (optional) -- toggle buttons: FDA, EMA, PMDA, Health Canada
  - Target Submission Date (optional) -- `<Input type="date">`
  - Description (optional) -- `<Input>`
  - Custom Instructions (optional) -- `<Textarea>` with note "injected into every conversation"
- "Back" button to return to type selection
- "Create Project" button triggers `handleCreate()`

**Step 3 -- Success** (lines 467-507)
- Green checkmark, project name confirmation
- 4 suggested action chips: Start Dossier Map, Add Documents, Run Readiness Check, Find Predicates
- All 4 chips call `handleOpenProject()` which sets the project active and closes the modal
- "Open Project Workspace" footer button

### What `handleCreate()` Actually Does (lines 209-238)
```
const project = await createProject(projectName.trim(), selectedType, descParts.join(' . '))
```
This calls `ProjectContext.createProject()` at line 328 of `ProjectContext.tsx`:
1. Generates a `crypto.randomUUID()` as the project ID
2. Creates an in-memory `Project` object
3. Dispatches `ADD_PROJECT` to local reducer
4. Dispatches `SET_ACTIVE_PROJECT`
5. Creates an initial "Welcome" conversation (also in-memory only)
6. **Returns the project object -- no API call, no database insert**

### API Endpoint That EXISTS But Is Not Called
**File:** `server/routes/concept2cure.ts` (lines 1422-1687)
- `POST /api/concept2cure/projects`
- Validates with Zod schema (name required, submissionType required, max lengths enforced)
- Inserts into `projects` table via Drizzle ORM with full tenant isolation
- Sets `organizationId`, `clientWorkspaceId`, `createdById`, `ownerId`
- Stores `submissionType` in `metadata` JSONB column
- Stores `customInstructions` in `settings` JSONB column
- Auto-creates intelligence profile (non-blocking)
- Auto-initializes CTD sections from regulatory registry (non-blocking)
- Auto-creates initial AnA conversation thread with onboarding message (non-blocking)
- Returns `suggestedActions` tailored to submission type
- Logs 21 CFR Part 11 audit entry
- **This is excellent production code -- it is simply never called by the NewProjectModal**

### Verdict: FAIL (Critical)
- The `NewProjectModal` calls `ProjectContext.createProject()` which is localStorage-only
- The real server endpoint at `POST /api/concept2cure/projects` is production-ready with audit trails, intelligence profiles, section bootstrapping, and tenant isolation -- but the modal does not use it
- The `useProjects` hook in `useProjects.ts` DOES call the API (line 154: `fetch('/api/concept2cure/projects', ...)`) but this hook is not used by the `NewProjectModal`
- **Net result: projects created by users never reach the database**

---

## 3. Project Types

### Supported Types
9 submission types defined in `NewProjectModal.tsx` (lines 58-146):

| Type | Name | Full Name | Early Access? |
|------|------|-----------|---------------|
| 510K | 510(k) | Premarket Notification | No |
| IND | IND | Investigational New Drug | Yes |
| NDA | NDA | New Drug Application | Yes |
| BLA | BLA | Biologics License Application | Yes |
| MAA | MAA | Marketing Authorization Application | Yes |
| PMA | PMA | Premarket Approval | No |
| DE_NOVO | De Novo | De Novo Classification | No |
| EUA | EUA | Emergency Use Authorization | Yes |
| IVDR | EU IVDR | EU In Vitro Diagnostic Regulation | No |

### How Type Selection Affects Downstream
- **Server-side (if it were called):** `getSuggestedActionsForType()` at lines 1387-1413 returns different suggested actions:
  - Device types (510K, PMA, DE_NOVO): adds "Find Predicates"
  - Drug types (IND, NDA, BLA): adds "Review Clinical Data"
  - EU types (MAA, IVDR): adds "Map Regulatory Path"
  - Others: adds "Define Strategy"
- **Server-side (if it were called):** `bootstrapFromRegistry()` initializes CTD sections based on type
- **Server-side (if it were called):** `generateDefaultCustomInstructions()` at lines 557-564 creates type-specific AI system prompts
- **Client-side (actual):** The `ProjectHomeDashboard.tsx` (lines 66-99) uses type to determine suggested prompts (pharma vs device pathways)

### Advanced Type Picker (Not Connected)
**File:** `client/src/concept2cure/components/projects/ApplicationTypePicker.tsx` (lines 1-259)
- 3-step flow: Region -> Application Type -> Summary
- Fetches from `GET /api/regulatory/regions` and `GET /api/regulatory/registry`
- Groups by application family
- Shows dossier standard
- **Not mounted in any visible UI path** -- exists as an alternative to the hardcoded type picker

### Verdict: CONDITIONAL PASS
- Type selection UI is well-designed with 9 relevant regulatory types
- "Early Access" labeling is honest
- Server-side type handling is production-quality (custom instructions, section bootstrapping, suggested actions)
- However, since project creation doesn't reach the server, type-specific behavior (section bootstrapping, custom instructions generation) is never triggered

---

## 4. Server Routes for Projects

### Primary Routes (Concept2Cure)
**File:** `server/routes/concept2cure.ts`
**Mounted at:** `/api/concept2cure` (via `server/index.ts`)

| Endpoint | Line | Real DB? | Tenant Scoped? | Audit? |
|----------|------|----------|----------------|--------|
| `GET /api/concept2cure/projects` | 1219 | Yes (raw SQL + Drizzle) | Yes (`organizationId`) | No (read-only) |
| `GET /api/concept2cure/projects/:id` | 1332 | Yes (Drizzle) | Yes (`organizationId` in WHERE) | No (read-only) |
| `POST /api/concept2cure/projects` | 1422 | Yes (Drizzle INSERT) | Yes (`organizationId`, `clientWorkspaceId`) | Yes (21 CFR Part 11) |
| `PUT /api/concept2cure/projects/:id` | 1696 | Yes (Drizzle UPDATE) | Yes (`organizationId` in WHERE) | Yes (21 CFR Part 11) |
| `DELETE /api/concept2cure/projects/:id` | 1914 | Yes (soft delete via `actualEndDate`) | Yes (`organizationId` in WHERE) | Yes (21 CFR Part 11) |

**GET /projects (line 1219):**
- Queries `projects` table with `WHERE organization_id = $1 AND actual_end_date IS NULL`
- Batch-loads conversations (2 queries total, not N+1)
- Returns enriched objects with `ownership`, `conversations`, `submissionType` from metadata
- Limits to 100 projects
- **PASS -- real DB, tenant-scoped, efficient**

**POST /projects (line 1422):**
- Zod validation: name (1-200 chars), submissionType (required), description (max 2000), customInstructions (max 5000), plus registryId, agency, sponsor, product, region, pinned, targetAgency, color
- Inserts via Drizzle ORM with full tenant context
- Post-creation (non-blocking): creates intelligence profile, bootstraps CTD sections from registry, creates initial AnA thread with onboarding message
- **PASS -- production-quality with audit, bootstrap, and intelligence initialization**

**DELETE /projects (line 1914):**
- Soft delete: sets `actualEndDate` and `status = 'archived'`
- Also archives related conversations
- Full audit trail
- **PASS -- 21 CFR Part 11 compliant soft delete**

### Secondary Routes (Projects Management)
**File:** `server/routes/projects-management.ts`
**Mounted at:** `/api/projects` (via `server/index.ts` line 7238)

| Endpoint | Real DB? | Tenant Scoped? | Audit? |
|----------|----------|----------------|--------|
| `GET /api/projects` | Yes (Drizzle) | Yes (organizationId + clientWorkspaceId) | No |
| `GET /api/projects/:projectId` | Yes (Drizzle) | Yes | No |
| `POST /api/projects` | Yes (atomic with quota) | Yes (requires license) | Yes |
| `PATCH /api/projects/:projectId` | Yes (Drizzle) | Yes | Yes |
| `DELETE /api/projects/:projectId` | Yes (hard delete) | Yes | Yes |

**Key differences from concept2cure routes:**
- Uses `getTenantContext()` utility for tenant extraction
- POST uses `atomicCreateProject()` with quota enforcement
- DELETE is **hard delete** (not soft) -- less compliant than concept2cure route
- Different type enum: `clinical_trial`, `regulatory_submission`, `medical_device`, `literature_review`
- Auto-creates client workspace if none exists

### Legacy Routes (Projects Create)
**File:** `server/routes/projects-create.ts`
**Mounted at:** `/api/workspace/projects` (per route definition)

- POST creates into `ind_projects`, `fda_510k_projects`, or `cer_projects` depending on type
- GET returns UNION ALL from all three tables
- Uses raw SQL, no Drizzle
- Tenant-scoped by `organizationId`
- **Legacy -- different DB tables entirely**

### Verdict: PASS (Server Routes)
- The `/api/concept2cure/projects` routes are production-quality
- Full tenant isolation on all CRUD operations
- 21 CFR Part 11 audit trails on writes
- Soft delete for regulatory compliance
- Efficient batch loading (no N+1)
- Zod validation with sensible limits
- **The server is ready; the client just doesn't use it**

---

## 5. Detailed Findings

### CRITICAL-01: ProjectContext Does Not Call API
**Severity:** Critical
**Location:** `client/src/concept2cure/context/ProjectContext.tsx` lines 328-358
**Impact:** All projects created via the "New Project" modal exist only in localStorage. They:
- Are invisible to other users in the same organization
- Are lost on browser data clear
- Have no intelligence profile, no CTD sections, no AnA thread
- Generate no audit trail

The `ProjectContext` comment on line 701 says: *"PERSISTENCE (localStorage for now, could be API later)"* -- this was never upgraded.

### CRITICAL-02: Two Competing Project Systems
**Severity:** Critical
**Location:**
- `client/src/concept2cure/context/ProjectContext.tsx` -- used by sidebar + modal (active)
- `client/src/concept2cure/hooks/useProjects.ts` -- used by ConnectedProjectSwitcher (not mounted)

These two systems:
- Use different storage (localStorage vs API)
- Generate different ID formats (`crypto.randomUUID()` vs `proj_<numeric>`)
- Have different project shapes
- Cannot interoperate

### HIGH-01: Delete Uses `confirm()` Dialog
**Severity:** High
**Location:** `client/src/concept2cure/components/sidebar/ProjectsSidebar.tsx` line 505
**Code:** `if (confirm('Delete this project? This cannot be undone.')) { deleteProject(projectId); }`
**Issue:** Uses browser-native `confirm()` instead of a proper Dialog component. Forbidden per UI design principles ("Trust Through Restraint" -- no "are you sure?" dialogs). Also, the `deleteProject` call only removes from local state, never calls the server.

### HIGH-02: Rename Button Has No Handler
**Severity:** High
**Location:** `client/src/concept2cure/components/sidebar/ProjectsSidebar.tsx` line 320-322
**Code:**
```tsx
<DropdownMenuItem>
  <Edit2 className="mr-2 h-3.5 w-3.5" />
  Rename
</DropdownMenuItem>
```
No `onClick` handler. Clicking "Rename" does nothing.

### MEDIUM-01: Settings Button Has No Handler
**Severity:** Medium
**Location:** `client/src/concept2cure/components/sidebar/ProjectsSidebar.tsx` lines 741-744
**Code:**
```tsx
<button className="...">
  <Settings className="h-4 w-4" />
  Settings
</button>
```
No `onClick` handler. The Settings button in the sidebar footer does nothing.

### MEDIUM-02: Suggested Actions All Do the Same Thing
**Severity:** Medium
**Location:** `client/src/concept2cure/components/sidebar/NewProjectModal.tsx` lines 483-504
**Issue:** All 4 suggested action buttons (Start Dossier Map, Add Documents, Run Readiness Check, Find Predicates) call `handleOpenProject()` which just opens the project workspace. None of them trigger their labeled action.

### MEDIUM-03: useProjects Has Per-File getAuthHeaders()
**Severity:** Medium (code standards violation)
**Location:** `client/src/concept2cure/hooks/useProjects.ts` lines 27-33
**Issue:** Defines its own `getAuthHeaders()` function and uses raw `fetch()` instead of `apiRequest()`. Per CLAUDE.md standards, should use `apiRequest()` which handles auth automatically.

### LOW-01: ApplicationTypePicker Not Integrated
**Severity:** Low
**Location:** `client/src/concept2cure/components/projects/ApplicationTypePicker.tsx`
**Issue:** A registry-driven 3-step picker (Region -> Type -> Summary) exists and fetches from real API endpoints, but is not mounted in any visible UI flow.

---

## 6. Data Flow Summary

```
User clicks "New Project" in sidebar
  -> NewProjectModal opens
    -> Step 1: picks type (e.g., 510K)
    -> Step 2: fills name, sponsor, agency, date
    -> Step 3: clicks "Create Project"
      -> ProjectContext.createProject()
        -> crypto.randomUUID() for ID
        -> dispatch ADD_PROJECT (in-memory)
        -> dispatch SET_ACTIVE_PROJECT
        -> creates "Welcome" conversation (in-memory)
        -> saves to localStorage
        -> NEVER calls POST /api/concept2cure/projects
```

```
What SHOULD happen:
  -> useProjects().createProject() or apiRequest()
    -> POST /api/concept2cure/projects
      -> Zod validation
      -> Drizzle INSERT into projects table
      -> Audit log
      -> Auto-create intelligence profile
      -> Auto-bootstrap CTD sections
      -> Auto-create AnA thread with onboarding message
      -> Return project with suggestedActions
```

---

## 7. Verdict Summary

| Screen | Verdict | Reason |
|--------|---------|--------|
| **Project List View (Sidebar)** | **FAIL** | Reads from localStorage only; no API integration |
| **Create New Project (Modal)** | **FAIL** | Creates in localStorage only; server endpoint exists but is not called |
| **Project Types** | **CONDITIONAL PASS** | 9 types well-defined; type-specific behavior exists server-side but unreachable |
| **Server Routes** | **PASS** | Production-quality CRUD with audit, tenant isolation, soft delete, section bootstrapping |
| **Project Home (after select)** | **CONDITIONAL PASS** | `ProjectHomeDashboard.tsx` renders suggested prompts by type; works on in-memory data |

### Recommendation
Wire `NewProjectModal` to call the `useProjects` hook (or directly call `POST /api/concept2cure/projects` via `apiRequest()`), and wire `ProjectsSidebar` to read from `GET /api/concept2cure/projects` via React Query. The server routes are already production-ready. This is a frontend wiring problem, not a backend gap.

---

## 8. 2026-03-31 Full Claude Projects Parity Re-Audit (Mounted Product Path)

This section supersedes earlier assumptions that focused on `Concept2CureLayout` surfaces.  
The active product path for this audit is `client/src/concept2cure/ZenApp.tsx` with:

- `ZenSidebar`
- `ProjectSwitcher` + `NewProjectModal` (projects module)
- `ProjectKnowledgePanel` + `useProjectKnowledge`
- `AnaPersistentPanel`
- Server routes under `concept2cure.ts`, `chat.ts`, `client-intelligence.ts`, and supporting services

### Executive Verdict

**Overall parity verdict: PARTIAL (fails on core Claude Projects guarantees).**

The product has strong project CRUD and shell UX, but it does not yet meet Claude Projects-level truth on:

1. **Reliable conversation resume semantics**
2. **Single canonical project instructions path**
3. **Single canonical project file-to-memory retrieval path**
4. **Project-scoped retrieval isolation**
5. **Project-level SKILLS.md-style capability**

---

### Severity-Ranked Findings

## Critical

1. **"Resume chat" affordance is misleading in current chat architecture.**  
   - UI sets `activeConversationId` and advertises resume (`client/src/concept2cure/ZenApp.tsx:3813-3833`, `3903-3918`, `4030-4045`), but `AnaPersistentPanel` does not accept a conversation/thread seed prop and maintains thread continuity via local `threadIdRef` only (`client/src/concept2cure/components/chat/AnaPersistentPanel.tsx:592-651`, `739`, `1687`, `1820`, `2009`).  
   - **Impact:** users can click "Resume latest chat" without guaranteed hydration of that project conversation.

2. **Project instructions are split across multiple stores and can fail to reach the chat prompt path.**  
   - Project config UI claims instructions are injected into every conversation (`client/src/concept2cure/components/workspace/ProjectConfigPanel.tsx:323-335`).  
   - But save handler does not persist `customInstructions` in `handleEditProject` (`client/src/concept2cure/ZenApp.tsx:1913-1934`).  
   - Main sidebar instructions save into `projects.settings.knowledge/customInstructions` (`server/routes/concept2cure.ts:2240-2294`), while intelligence prefix reads from `projectIntelligenceProfiles` (`server/services/client-intelligence-memory.ts:1202-1256`, called by `server/services/lumen-context-builder.ts:1872-1885`).  
   - `AnaPersistentPanel` does not send `customInstructions` in payload (no usage; see payload build at `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx:1637-1715`).  
   - **Impact:** user-visible instructions may not be consistently active in model context.

3. **Project file memory path is not Claude-style "always-on project knowledge".**  
   - Main upload path (`/api/concept2cure/documents/upload`) writes to `projects.settings.knowledge.documents`, artifacts, and org-level atoms (`server/routes/concept2cure.ts:2553-2724`).  
   - For non-text files, extraction is placeholder text (`server/routes/concept2cure.ts:2598-2600`).  
   - Chat retrieval uses org-filtered hybrid atom search, not project-filtered retrieval (`server/routes/chat.ts:295-306`, `server/services/enhancedEmbeddingService.ts:423-463`).  
   - Separate project memory ingestion path exists (`/api/client-intelligence/project/:projectId/documents/upload`) but is not the primary UI path (`server/routes/client-intelligence.ts:455-491`, `server/services/client-intelligence-memory.ts:926-975`).  
   - Semantic project memory requires `embedding IS NOT NULL` (`server/services/client-intelligence-memory.ts:1551-1561`), but ingestion does not set embeddings.  
   - **Impact:** uploaded project files are not reliably guaranteed as project-scoped "always available" context.

## High

4. **Project identity normalization is inconsistent (`proj_*` vs numeric vs text).**  
   - Intelligence prefix parses project id with `parseInt(String(projectId), 10)` (`server/services/lumen-context-builder.ts:1878`), which fails for prefixed IDs.  
   - Chat builder uses `projectId ? Number(projectId) : null` for profile prefetch (`server/services/ana-ri/chat-context-builder.ts:143-146`).  
   - Trace tables use text `project_id` (`db/migrations/20260224_ai_trace_chain.sql`).  
   - **Impact:** intermittent loss of project-scoped intelligence/memory retrieval.

5. **`/api/projects` has route ownership and security quality issues.**  
   - Inline `GET /api/projects` exists in `server/index.ts` before mounted `projects-management` router (`server/index.ts:634-675`, `7057`).  
   - `POST /api/projects` schema trusts client-provided `organizationId` (`server/routes/projects-management.ts:16-29`, `135-151`, `204`).  
   - **Impact:** ambiguous behavior and tenant-risk surface on non-concept2cure path.

6. **Thread-list fallback can lose project scoping.**  
   - If `ai_threads` path fails/empty, fallback query uses `chat_threads` without project filtering (`server/routes/chat.ts:1126-1131`).  
   - **Impact:** project conversation list integrity can degrade.

## Medium

7. **`useProjectKnowledge.addTextContent` posts JSON to a multipart upload endpoint.**  
   - Calls `POST /api/concept2cure/documents/upload` with JSON (`client/src/concept2cure/hooks/useProjectKnowledge.ts:457-463`) while server expects `knowledgeUpload.single('file')` (`server/routes/concept2cure.ts:2556-2559`).  
   - **Impact:** API failure masked by local optimistic add; persistence mismatch.

8. **Local fallback can mask persistence failures.**  
   - Knowledge load/upload/instruction update has local fallback behavior (`client/src/concept2cure/hooks/useProjectKnowledge.ts:171-190`, `264-307`, `410-415`).  
   - **Impact:** UI may appear successful while server state is stale.

9. **Project settings tabs expose placeholder functionality.**  
   - Team/Compliance tabs are placeholders (`client/src/concept2cure/components/workspace/ProjectConfigPanel.tsx:365-395`).  
   - **Impact:** beta honesty risk.

## Low

10. **No explicit project-level `SKILLS.md` primitive exists in mounted product flow.**  
   - Current system supports freeform custom instructions and profile fields, but no dedicated project-level SKILLS.md upload/parse/governance contract in active project UX/API path.  
   - **Impact:** capability gap versus requested Claude-like project skill profile semantics.

---

### Confirmed Working Capabilities (Evidence-Based)

1. **Project CRUD and project shell wiring are mounted in `ZenApp` path.**  
   - Create/archive/delete/select/pin wiring (`client/src/concept2cure/ZenApp.tsx:1821-1911`, `2248-2278`, `4260-4288`).

2. **Projects foyer UX is live (search, continue card, grouped sections).**  
   - (`client/src/concept2cure/ZenApp.tsx:3760-4084`).

3. **Project chat context does carry project id/type/screen metadata.**  
   - Payload includes `project_id` and context object (`client/src/concept2cure/components/chat/AnaPersistentPanel.tsx:1682-1715`).

4. **Project knowledge panel supports file upload/removal/activation and instruction editing.**  
   - (`client/src/concept2cure/components/workspace/ProjectKnowledgePanel.tsx`, `client/src/concept2cure/hooks/useProjectKnowledge.ts`).

5. **Server routes for knowledge document upload/remove/activation are present and tenant-scoped by org.**  
   - (`server/routes/concept2cure.ts:2553-2837`).

6. **Project intelligence profile + memory APIs are implemented.**  
   - (`server/routes/client-intelligence.ts:424-567`).

---

### Claude Projects Parity Gap Summary (Requested Scope)

| Capability | Current Status | Parity |
|---|---|---|
| Project-scoped conversations | Exists, but resume wiring is inconsistent | **Not yet** |
| Project instructions always applied | Split storage/assembly paths | **Not yet** |
| Project files always in project context | Mixed stores; no strict project-scoped retrieval guarantee | **Not yet** |
| Project-level SKILLS.md equivalent | Freeform instructions only; no explicit skills artifact contract | **Not yet** |
| Honest UI affordances | Improved, but some labels over-promise behavior | **Partial** |

---

### Remediation Sequence (Recommended Order)

1. **Unify project identity** (`proj_*` to canonical numeric internal id at API boundary).  
2. **Unify instruction source of truth** (single canonical store and guaranteed inclusion in chat assembly).  
3. **Make resume deterministic** (`activeConversationId/threadId` must hydrate message history).  
4. **Unify file ingestion paths** so project knowledge upload also writes searchable project memory with embeddings.  
5. **Enforce project-scoped retrieval** in hybrid search when `project_id` exists.  
6. **Add explicit project SKILLS artifact** (e.g., `project_skills.md`) with parser + deterministic prompt injection.  
7. **Harden beta honesty** by removing/labeling placeholder tabs and any implication-only UI states.
