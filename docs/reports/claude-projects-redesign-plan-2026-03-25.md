# Claude Projects UX Redesign Plan — ClinicalSageAI

> **Date**: 2026-03-25
> **Goal**: Replicate Claude.ai Projects UX patterns onto ClinicalSageAI's existing infrastructure
> **Approach**: Map every Claude Projects feature to existing code, identify gaps, produce build plan

---

## Part 1: Claude Projects UX Research

### 1.1 What Claude Projects Is

Claude Projects (launched mid-2024, enhanced through 2025-2026) is a workspace feature on claude.ai that lets users organize work into persistent, context-rich project containers. Each project maintains its own knowledge base, custom instructions, and conversation history.

**Core value proposition**: "Set it up once, Claude remembers everything."

### 1.2 Entry Points & Navigation

| UX Pattern | How It Works on Claude.ai |
|------------|---------------------------|
| **Sidebar projects list** | Left sidebar shows all projects, sorted by recent activity. Each shows name + last-active timestamp. |
| **Create project** | "New Project" button at top of sidebar → inline creation flow (name + optional description) |
| **Switch projects** | Click any project in sidebar → conversations + knowledge panel update instantly |
| **Default state** | No project selected = general Claude conversations (unscoped) |
| **Search** | Filter projects by name in sidebar search |
| **Star/pin** | Star projects to pin them to top of list |
| **Archive** | Archive projects to hide from default list; accessible via filter |

### 1.3 Project Setup & Configuration

| Field | Required | Description |
|-------|----------|-------------|
| **Name** | Yes | Short project title (e.g., "510(k) Submission — Device X") |
| **Description** | No | Brief context; shown in project header |
| **Custom instructions** | No | System-level instructions injected into every conversation in this project |

**Custom Instructions** are the key differentiator:
- Freeform text field (no character limit visible to user, but context-window-aware)
- Injected as system context before every user message
- Persists across all conversations within the project
- Example: "You are a regulatory affairs expert. This project is for an FDA 510(k) submission for a Class II cardiovascular device. Always cite 21 CFR 807 requirements."

### 1.4 File Management (Project Knowledge)

| Feature | Detail |
|---------|--------|
| **Upload location** | Right panel → "Project knowledge" section → "Add content" button |
| **File types** | PDF, TXT, CSV, DOCX, XLSX, images (PNG/JPG/GIF/WEBP), code files |
| **Size limit** | Up to 30MB per file, 100 files per project |
| **Context window** | Visual bar showing how much of the 200K token window is consumed |
| **Token counting** | Each file shows estimated token count |
| **Organization** | Flat list (no folders), sorted by upload date |
| **Remove** | Click X on any file to remove from project knowledge |
| **Text content** | Can also paste raw text directly as a "knowledge item" |

**How files work in context**:
- All uploaded files are available to Claude in every conversation within the project
- Files are included in the context window alongside custom instructions
- Claude can reference specific files by name
- No manual "attach" step — files are always present

### 1.5 Memory & Context Architecture

```
┌─────────────────────────────────────────┐
│           Claude's Context Window        │
│                                          │
│  ┌──────────────────────────────────┐   │
│  │  System prompt (Anthropic base)   │   │
│  ├──────────────────────────────────┤   │
│  │  Project custom instructions      │   │  ← Set once, always present
│  ├──────────────────────────────────┤   │
│  │  Project knowledge files          │   │  ← All files, always present
│  ├──────────────────────────────────┤   │
│  │  Conversation history             │   │  ← Current conversation only
│  ├──────────────────────────────────┤   │
│  │  User message                     │   │
│  └──────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

**Key behaviors**:
- **No cross-conversation memory**: Each conversation is independent. Claude does NOT remember Conversation A when you start Conversation B (unless you use the newer "memory" feature).
- **Project instructions persist**: Custom instructions are injected into every conversation automatically.
- **Files are always in context**: No need to re-upload or re-attach.
- **Memory feature** (newer): Claude can save key facts to project memory, which persists across conversations. This is a separate system from files/instructions.

### 1.6 Conversation Flow

| Pattern | Detail |
|---------|--------|
| **Multiple conversations per project** | Yes — each project has its own conversation list |
| **New conversation** | "New chat" button within the project context |
| **Conversation list** | Shown in sidebar under the project, sorted by recency |
| **Conversation titles** | Auto-generated from first message, editable |
| **Delete conversation** | Hover → three-dot menu → Delete |
| **Conversation isolation** | Each conversation has independent history; project knowledge + instructions shared |

### 1.7 Visual Design Patterns

| Element | Pattern |
|---------|---------|
| **Sidebar hierarchy** | Projects (top level) → Conversations (nested under each project) |
| **Project indicator in chat** | Project name shown in chat header when inside a project |
| **Knowledge panel** | Right sidebar panel, collapsible, shows files + instructions + context usage |
| **Color/icons** | Minimal — no color coding per project type. Clean, monochrome. |
| **Context usage bar** | Horizontal bar: green (low usage) → yellow → red (near capacity) |
| **Empty state** | "Add knowledge to get started" prompt when project has no files |
| **Active project highlight** | Subtle background highlight on the active project in sidebar |

### 1.8 Sharing & Collaboration

| Feature | Status |
|---------|--------|
| **Share project** | Available on Team/Enterprise plans |
| **Visibility** | Private (default) or shared with team |
| **Team members** | Can view project knowledge + conversations |
| **Permissions** | Owner can edit instructions/files; members can chat |
| **Public sharing** | Not available for projects (only individual conversations) |

---

## Part 2: Existing Infrastructure Audit

### 2.1 What You Already Have (Feature Mapping)

| Claude Projects Feature | Your Equivalent | Status | File(s) |
|------------------------|-----------------|--------|---------|
| **Project creation** | `useProjects()` → `POST /api/concept2cure/projects` | Working | `useProjects.ts`, `projects-management.ts` |
| **Project list in sidebar** | `ProjectsSidebar.tsx` | Working | `components/sidebar/ProjectsSidebar.tsx` |
| **Project switcher modal** | `ProjectSwitcher.tsx` + `ConnectedProjectSwitcher.tsx` | Working | `components/projects/` |
| **Custom instructions** | `useProjectKnowledge()` → `PATCH .../knowledge` | Working | `useProjectKnowledge.ts` |
| **File upload** | `useProjectKnowledge()` → `POST .../documents/upload` | Working | `useProjectKnowledge.ts` |
| **Context window bar** | Token counting (200K limit, 0.25 tok/char) | Working | `useProjectKnowledge.ts` |
| **Knowledge panel (right)** | `ProjectKnowledgePanel.tsx` + `ProjectSidebar.tsx` | Working | `components/workspace/` |
| **Conversations per project** | `useCortexThreads(activeProjectId)` | Working | `ZenApp.tsx:1125` |
| **Conversation list** | Sidebar shows threads filtered by project | Working | `ZenApp.tsx:1128-1137` |
| **Project-scoped chat** | `AnaPersistentPanel` receives `contextProfile.projectId` | Working | `AnaPersistentPanel.tsx` |
| **Star/archive projects** | `ProjectSwitcher` has star + archive actions | Working | `ProjectSwitcher.tsx` |
| **Search projects** | Sidebar search + ProjectSwitcher search | Working | Both components |
| **Project memory (AI-learned)** | `projectMemoryEntries` + `projectIntelligenceProfiles` | Working | `useIntelligence.ts`, RIM system |
| **New conversation in project** | `addConversation(projectId, title)` | Working | `useProjects.ts` |

### 2.2 State Management Architecture (Current)

```
ZenApp.tsx (app shell)
├── useState: activeProjectId          [line 772]
├── useState: activeConversationId     [line 775]
├── useState: activeThreadId           [line 776]
├── useProjects() → TanStack Query     [line 654]
├── useCortexThreads(activeProjectId)  [line 1125]
│
├── → ProjectsSidebar (props: projects, conversations, activeProjectId)
├── → ProjectSwitcher (props: onSelectProject → setActiveProjectId)
├── → AnaPersistentPanel (props: contextProfile.projectId)
└── → ProjectWorkspaceShell (props: projectId, projectName, projectType)
```

**Pattern**: React useState + TanStack Query + prop drilling. No Redux/Zustand. Simple and effective.

### 2.3 Hooks Inventory

| Hook | Endpoint | Cache | Purpose |
|------|----------|-------|---------|
| `useProjects()` | `GET /api/concept2cure/projects` | React Query | CRUD projects |
| `useProjectKnowledge(projectId)` | `GET/POST/PATCH/DELETE .../knowledge` | Local state | Files + instructions |
| `useCortexThreads(projectId)` | `GET /api/chat/threads?project_id=` | React Query | Conversations |
| `useIntelligenceDashboard(projectId)` | `GET .../dashboard` | 1min | Unified intelligence |
| `useReadinessScore(projectId)` | `GET .../readiness` | 1min | Submission readiness |
| `useRecommendations(projectId)` | `GET .../recommendations` | 1min | Next actions |
| `useProjectIntelligence(projectId)` | `GET .../profile` | 2min | RIM continuity |
| `useProjectTasks(projectId)` | `GET .../tasks` | React Query | Task management |
| `useModules(projectId)` | `GET .../modules/status` | React Query | Module access |

### 2.4 Database Tables (Project-Related)

| Table | Purpose | Key for Claude Projects UX? |
|-------|---------|----------------------------|
| `projects` | Core project record | Yes — project CRUD |
| `projectIntelligenceProfiles` | RIM continuity (custom instructions, persona) | Yes — maps to "custom instructions" |
| `projectMemoryEntries` | Knowledge atoms (pgvector) | Yes — maps to "project memory" |
| `projectIngestedDocuments` | Uploaded file tracking | Yes — maps to "project knowledge files" |
| `concept2cureConversations` | Conversation records | Yes — maps to "conversations per project" |
| `ai_threads` | Cortex thread records | Yes — conversation scoping |
| `projectModules` | Module linking | Extra (beyond Claude Projects) |
| `projectWorkflowStages` | Workflow stages | Extra |
| `projectTasks` | Tasks | Extra |
| `projectRules` | Automation rules | Extra |
| `projectTemplates` | Templates | Extra |
| `clientWorkspaces` | Multi-tenant isolation | Infrastructure |

---

## Part 3: Gap Analysis — What to Build vs. What to Enhance

### 3.1 Already Matching Claude Projects (No Work Needed)

These features already replicate Claude Projects patterns:

1. **Project CRUD** — create, update, delete, list
2. **Project switching** — sidebar click + modal switcher
3. **Conversations per project** — scoped via `useCortexThreads(activeProjectId)`
4. **Custom instructions** — stored in `projectIntelligenceProfiles.customInstructions`
5. **File upload** — `useProjectKnowledge()` with 50MB limit, multiple file types
6. **Context window visualization** — 200K token bar with usage percentage
7. **Search & filter** — sidebar search, project list filtering
8. **Star/archive** — implemented in ProjectSwitcher

### 3.2 Gaps to Close (Enhance Existing)

#### Gap E1: Knowledge Panel Integration with Chat Context

**Claude.ai behavior**: All project files + instructions are automatically injected into every conversation's context window. Zero user effort.

**Your current state**: `useProjectKnowledge()` manages files, but it's unclear if `AnaPersistentPanel` actually injects file content + custom instructions into the AI context for every message.

**Where to check**:
- `server/services/memory-context-assembler.ts` — Does it pull `projectIntelligenceProfiles.customInstructions`?
- `server/services/lumen-context-builder.ts` — Does it include uploaded file content?
- `server/routes/chat.ts` — When sending a message, is project knowledge included?

**Action**: Verify the full context injection chain. If gaps exist, wire `customInstructions` + file content into the chat context assembly.

**Files to modify**: `memory-context-assembler.ts`, `chat.ts`

---

#### Gap E2: Sidebar Hierarchy (Projects → Conversations)

**Claude.ai behavior**: Sidebar shows projects as collapsible groups, with conversations nested underneath each project. Clicking a project expands it to show its conversations.

**Your current state**: `ProjectsSidebar.tsx` shows projects and conversations, but the exact nesting/expand behavior should be verified. The sidebar has `ConversationItem` subcomponents and access menu items (Home, Projects, Agents, Tasks, Templates, Analytics) which go beyond Claude's simpler model.

**Action**: Ensure the sidebar defaults to the Claude-style hierarchy: Projects (collapsible) → Conversations (nested). The extra nav items (Agents, Tasks, Templates, Analytics) can remain but should be secondary.

**Files to modify**: `ProjectsSidebar.tsx`

---

#### Gap E3: "No Project" Default State

**Claude.ai behavior**: When no project is selected, the user is in a general chat mode — conversations aren't scoped to any project. This is the default landing state.

**Your current state**: `ZenApp.tsx` auto-selects the first project on load (line 1147: `setActiveProjectId(projects[0].id)`). There's no "unscoped" mode.

**Action**: Allow `activeProjectId = undefined` as a valid state. Show a general chat experience when no project is selected. Update sidebar to show "All conversations" or "General" at the top.

**Files to modify**: `ZenApp.tsx` (lines 1141-1151), `ProjectsSidebar.tsx`, `AnaPersistentPanel.tsx`

---

#### Gap E4: Conversation Title Auto-Generation

**Claude.ai behavior**: Conversation titles are auto-generated from the first message, then editable by the user.

**Your current state**: Conversations use `t.title || 'New conversation'` (ZenApp.tsx line 1131). Unclear if titles are auto-generated from first message content.

**Action**: After the first AI response, call a lightweight title-generation endpoint (or use the first ~50 chars of the user's message). Store the title in `ai_threads`.

**Files to modify**: `chat.ts` (backend), conversation creation flow

---

#### Gap E5: Project Description Visibility

**Claude.ai behavior**: Project description is shown in the project header area when you're inside a project.

**Your current state**: `ProjectHomeDashboard.tsx` shows description, but when you're in the chat view, the project context indicator may be minimal.

**Action**: Add a subtle project name + description badge in the chat header when `activeProjectId` is set.

**Files to modify**: `AnaPersistentPanel.tsx` (header area)

---

### 3.3 New Features to Build

#### New N1: "Add Text Content" to Project Knowledge

**Claude.ai behavior**: Users can paste raw text as a knowledge item (not just upload files).

**Your current state**: `useProjectKnowledge()` supports file upload but no raw text paste.

**Action**: Add a "Add text" option to `ProjectKnowledgePanel.tsx` that creates a `projectIngestedDocuments` entry with `extractedText` populated directly (no file upload needed).

**Files**: `ProjectKnowledgePanel.tsx`, `useProjectKnowledge.ts`, backend endpoint

---

#### New N2: Project-Level Memory (Learned Facts)

**Claude.ai behavior**: Claude can save facts to project memory that persist across conversations. This is separate from uploaded files — it's AI-learned knowledge.

**Your current state**: You have `projectMemoryEntries` (knowledge atoms) and `projectIntelligenceProfiles` (continuity object) which is MORE sophisticated than Claude's memory. But it's surfaced through the intelligence dashboard, not through the chat UX.

**Action**: Surface memory in the Knowledge Panel as a "Memory" section showing what AnA has learned about this project. Allow users to view, edit, and delete memory entries directly.

**Files**: `ProjectKnowledgePanel.tsx` or `ProjectSidebar.tsx`, new API endpoint to list/manage memory entries

---

#### New N3: Sharing & Collaboration (Team Projects)

**Claude.ai behavior**: Projects can be shared with team members on Team/Enterprise plans.

**Your current state**: Multi-tenant via `clientWorkspaces` + `clientAccess` (RBAC). But project-level sharing isn't exposed in the UI.

**Action**: Add a "Share" button on project settings that leverages existing `clientAccess` to grant project-level permissions. Lower priority — your multi-tenant model already supports this at the workspace level.

**Files**: New component, `projects-management.ts` (add collaborator endpoint)

---

### 3.4 Additional Gaps (from Extended UX Research)

#### Gap E6: Move Conversations Between Projects

**Claude.ai behavior**: Users can reassign a conversation to a different project via the three-dot menu.

**Your current state**: `ai_threads` has a `project_id` column, so the data model supports it. No UI for moving.

**Action**: Add "Move to project" option in conversation context menu. Backend: `PATCH /api/chat/threads/:id { project_id }`.

**Files**: `ProjectsSidebar.tsx` (conversation menu), `chat.ts` (backend)

---

#### Gap E7: RAG Activation for Large Knowledge Bases

**Claude.ai behavior**: When project knowledge approaches the 200K context limit (~13+ files), RAG (retrieval-augmented generation) activates automatically — not all files are stuffed into context, instead relevant chunks are retrieved per query.

**Your current state**: `projectMemoryEntries` has pgvector embeddings (1536 dims). The infrastructure for semantic search exists. Unclear if it activates automatically when context is too large.

**Action**: In the context assembly chain, when total file tokens exceed a threshold (e.g., 150K), switch from "stuff all files" to "semantic retrieval of top-K relevant chunks." Leverage existing pgvector index on `projectMemoryEntries`.

**Files**: `memory-context-assembler.ts`, `lumen-context-builder.ts`

---

#### Gap E8: Nightly Project Memory Summaries

**Claude.ai behavior**: Since March 2026, Claude maintains auto-generated project-scoped memory summaries, updated nightly. These persist key facts across conversations.

**Your current state**: RIM's `projectIntelligenceProfiles` + `projectMemoryEntries` already track learned insights, but enrichment happens on-demand (via interceptors), not on a schedule.

**Action**: Add a nightly cron job (Bull queue) that summarizes recent conversation signals into `projectMemoryEntries`. This is a natural extension of your existing RIM interceptor architecture.

**Files**: New job in `server/services/` or `server/jobs/`, Bull queue configuration

---

#### Gap E9: Sharing Permissions (Can Use / Can Edit)

**Claude.ai behavior**: Two permission tiers — "Can Use" (view + chat in project) and "Can Edit" (modify instructions, files, settings).

**Your current state**: `clientAccess` table has `role` (admin, member, viewer) and `permissions` (JSON). The data model supports this. No project-level sharing UI.

**Action**: Expose project-level sharing with two tiers. Map "Can Use" → viewer, "Can Edit" → member. Add share dialog to project settings.

**Files**: New `ProjectShareDialog.tsx`, backend endpoint for project-level access grants

---

> **Full Claude Projects UX research**: See `docs/reports/claude-projects-ux-research.md` for the complete reference.

---

## Part 4: Implementation Plan (Ordered Segments)

### Segment 1: Verify Context Injection Chain (Gap E1)
**Priority**: Critical — this is the #1 value proposition of Projects
**Effort**: Investigation + potential wiring (1 session)
**Files to read**: `memory-context-assembler.ts`, `lumen-context-builder.ts`, `chat.ts`
**Deliverable**: Confirm or wire: custom instructions + file content → every chat message

### Segment 2: Sidebar Hierarchy Polish (Gap E2)
**Priority**: High — visual UX alignment
**Effort**: Small (1 session)
**Files**: `ProjectsSidebar.tsx`
**Deliverable**: Projects as collapsible groups with nested conversations

### Segment 3: "No Project" Default State (Gap E3)
**Priority**: High — UX alignment
**Effort**: Small (1 session)
**Files**: `ZenApp.tsx`, `ProjectsSidebar.tsx`, `AnaPersistentPanel.tsx`
**Deliverable**: Allow unscoped chat when no project selected

### Segment 4: Surface Memory in Knowledge Panel (New N2)
**Priority**: High — leverages existing RIM investment
**Effort**: Medium (1-2 sessions)
**Files**: `ProjectKnowledgePanel.tsx`, new memory management endpoint
**Deliverable**: "Memory" section in knowledge panel showing AI-learned facts

### Segment 5: Add Text Content to Knowledge (New N1)
**Priority**: Medium
**Effort**: Small (1 session)
**Files**: `ProjectKnowledgePanel.tsx`, `useProjectKnowledge.ts`, backend endpoint
**Deliverable**: "Add text" option alongside file upload

### Segment 6: Conversation Title Auto-Generation (Gap E4)
**Priority**: Medium
**Effort**: Small (1 session)
**Files**: `chat.ts`, conversation creation flow
**Deliverable**: Auto-title from first message

### Segment 7: Project Context in Chat Header (Gap E5)
**Priority**: Low — cosmetic
**Effort**: Tiny (30 min)
**Files**: `AnaPersistentPanel.tsx`
**Deliverable**: Project name badge in chat header

### Segment 8: Team Sharing (New N3)
**Priority**: Low — future
**Effort**: Medium (2 sessions)
**Files**: New component + backend endpoint
**Deliverable**: Share project with team members

---

## Part 5: What You Have That Claude Projects Doesn't

Your existing infrastructure EXCEEDS Claude Projects in several ways. These are competitive advantages — don't remove them:

| Your Feature | Claude Projects Equivalent | Your Advantage |
|-------------|---------------------------|----------------|
| **RIM intelligence layer** | None | Regulatory judgment scoring, pattern detection, signal capture |
| **Readiness scoring** | None | Submission readiness % with gap analysis |
| **Recommendations engine** | None | Next-best-action generation |
| **Project hierarchy** (Program → Project → Study) | Flat list only | Enterprise portfolio management |
| **Rules automation** | None | Event-driven automation (20+ triggers) |
| **Module linking** (CER, CSR, eCTD, etc.) | None | Cross-module intelligence |
| **Workflow stages** | None | 21 CFR Part 11 compliant lifecycle |
| **Document authoring** | None | Full editor with review/approve/sign |
| **Submission types** (510K, IND, NDA, BLA, MAA, PMA) | None | Regulatory-specific workflows |
| **Dossier map** (CTD structure) | None | CTD module visualization |
| **Project tasks** | None | Cross-module task management |
| **3-layer memory** (working + project + client) | Simple project memory | Deeper context architecture |

**Strategy**: Keep Claude Projects' simplicity for the core experience (sidebar, knowledge, chat), but layer your regulatory intelligence on top. Don't simplify away your competitive moat.

---

## Summary

| Category | Count | Status |
|----------|-------|--------|
| Features already matching | 8 | No work needed |
| Gaps to close (enhance) | 9 | E1-E9, ordered by priority |
| New features to build | 3 | N1-N3 |
| Implementation segments | 8+ | Each independently deployable |
| Your competitive advantages | 12+ | Preserve and highlight |

**Bottom line**: You're closer than you think. The core Claude Projects UX (project CRUD, file upload, custom instructions, conversations, context window) is already built. The main gaps are:
1. Verifying the context injection chain works end-to-end (critical)
2. RAG activation when knowledge exceeds context window (high value, infra exists)
3. UX polish (sidebar hierarchy, no-project state, move conversations, chat header)
4. Surfacing your existing memory/intelligence in the knowledge panel (high value, low effort)
5. Nightly memory summaries + sharing permissions (future)

---

*Report generated 2026-03-25. Ready for segment-by-segment execution.*
