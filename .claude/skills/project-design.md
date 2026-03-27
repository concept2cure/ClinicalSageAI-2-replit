# Skill: Project Design — Claude Projects UX for Regulatory Intelligence

## Description

Design specification for ClinicalSageAI's Projects UX — a visualization and user experience that mirrors Claude.ai's Projects feature, tailored for regulatory affairs, clinical development, and submission management. Covers sidebar hierarchy, knowledge panel, memory architecture, conversation scoping, and the full project lifecycle.

## Activation

This skill activates when:
- Modifying or building any project-related UI components
- Designing navigation flows in ZenSidebar, ZenApp, or project workspace
- Adding features to ProjectKnowledgePanel or project configuration views
- Creating project creation/setup flows
- Discussing how projects should look, feel, or behave
- Adding file/knowledge management to projects
- Designing collaboration or sharing features for projects

---

## 1. Design Philosophy

### The Core Idea (Non-Negotiable)

**A project is a regulatory brain.** Every project container holds:
- The regulatory context (submission type, agency, product, sponsor)
- The intelligence memory (strategy, risks, learned signals)
- The document vault (artifacts, sections, ingested references)
- The conversation history (every AnA interaction scoped to this project)

The UX must feel like a **mission control room**, not a generic chat tool. Opening a project should instantly communicate "I know where you are, I know what you're submitting, and I remember everything we've done."

### Design Principles

1. **Context is always visible** — The user never wonders "does AnA know about this project?" The active project context badge is always present.
2. **Intelligence is ambient** — RIM signals, readiness scores, and recommendations surface naturally, not behind menus.
3. **Hierarchy is clear** — Projects → Conversations. The sidebar communicates this without explanation.
4. **Regulatory identity first** — A `510(k) — Coronary Stent` project looks and feels different from an `IND — Phase 2 Oncology` project at a glance.
5. **Compliance is never hidden** — Audit trail, e-signatures, and 21 CFR Part 11 status are visible, not buried.

---

## 2. Sidebar Design (ZenSidebar)

### Visual Hierarchy

```
┌─────────────────────────────────────┐
│  ClinicalSage                   [+] │  ← New project button
├─────────────────────────────────────┤
│  🔍 Search projects...              │
├─────────────────────────────────────┤
│                                     │
│  PINNED                             │
│  ▼ 510(k) — Coronary Stent   [...]  │  ← Active project (highlighted)
│    │  ● Today's review strategy     │  ← Active conversation (bold)
│    │    Predicate device comparison │
│    │    Performance testing gaps    │
│    │  [+ New chat]                  │
│                                     │
│  RECENT                             │
│  ► IND Phase 2 Oncology      [...]  │  ← Collapsed project
│  ► NDA — Drug X              [...]  │
│  ► BLA — Biologic Platform   [...]  │
│                                     │
│  GENERAL                            │
│    Regulatory news discussion       │  ← Unscoped conversations
│    Competitor analysis              │
│                                     │
│  [View archived]                    │
└─────────────────────────────────────┘
```

### Project Row Component

Each project row shows:
- **Icon** — Submission type badge (`510K`, `IND`, `NDA`, `BLA`, `PMA`, `MAA`, `De Novo`, `EUA`, `IVDR`)
- **Name** — Project name, truncated at ~28 chars
- **Status dot** — Color-coded: active (green), in review (amber), submitted (blue), archived (gray)
- **Expand chevron** — Rotate 90° when expanded
- **Three-dot menu** — New chat, Rename, Pin/Unpin, Archive, Delete

```
[NDA] Drug X — NDA Submission  ●  [⋮]
```

### Conversation Rows (nested)

When expanded, conversations appear indented with a left border:
- **Title** — Auto-generated from first message, truncated at ~30 chars
- **Recency** — "2h ago", "Yesterday", "Mar 20"
- **Active indicator** — Bold + subtle highlight on active conversation
- **Hover menu** — Rename, Move to project, Delete

### Active State

Active project:
- Subtle background fill (zinc-100/50 in light mode, zinc-800/30 in dark)
- Left accent border (brand color)
- Auto-expanded to show conversations

Active conversation within project:
- Bold text
- Filled dot indicator
- Persists across page navigation

### Keyboard Navigation

| Key | Action |
|-----|--------|
| `↑` / `↓` | Move between conversations |
| `Enter` | Open selected conversation |
| `Space` | Expand/collapse project |
| `N` | New chat in active project |
| `Esc` | Collapse current project |
| `/` | Focus search |

---

## 3. Project Header Bar

When inside a project, a persistent header strip appears at the top of the chat area:

```
┌──────────────────────────────────────────────────────────────────────┐
│  [NDA] Drug X — NDA Submission          Readiness: 74%  [⚙ Config]  │
└──────────────────────────────────────────────────────────────────────┘
```

Components:
- **Submission type badge** — Color-coded pill (see badge colors below)
- **Project name** — Clickable → opens project config panel
- **Readiness score** — Live number from readiness scoring engine, color-coded (red < 50, amber 50–79, green ≥ 80)
- **Config button** — Opens project settings flyout

### Submission Type Badge Colors

| Type | Color | Label |
|------|-------|-------|
| 510(k) | Blue | `510K` |
| IND | Purple | `IND` |
| NDA | Indigo | `NDA` |
| BLA | Violet | `BLA` |
| PMA | Red | `PMA` |
| MAA | Teal | `MAA` |
| De Novo | Cyan | `De Novo` |
| EUA | Orange | `EUA` |
| IVDR | Green | `IVDR` |

---

## 4. Project Knowledge Panel

The knowledge panel lives in the right column (collapsible). It is the **regulatory memory dashboard** — not just a file list.

### Panel Layout

```
┌─────────────────────────────────────┐
│  PROJECT KNOWLEDGE          [+] [×] │
├─────────────────────────────────────┤
│                                     │
│  ■ CONTEXT USAGE                    │
│  ████████████░░░░░░░░░░  42%        │
│  ~84K / 200K tokens used            │
│                                     │
├─────────────────────────────────────┤
│  ■ REGULATORY STRATEGY              │
│  "Focus on predicate performance    │
│  equivalence. Avoid..."             │
│  [Edit]                             │
│                                     │
├─────────────────────────────────────┤
│  ■ CUSTOM INSTRUCTIONS              │
│  "You are a 510(k) regulatory...    │
│  [Edit]                             │
│                                     │
├─────────────────────────────────────┤
│  ■ INTELLIGENCE MEMORY   (12 atoms) │
│  ● Clinical targets: 3              │
│  ● Learned insights: 5              │
│  ● Risk factors: 2                  │
│  ● Open questions: 2                │
│                                     │
├─────────────────────────────────────┤
│  ■ DOCUMENTS              (8 files) │
│  📄 Clinical_Study_Report.pdf  2.4MB│
│  📄 Predicate_Comparison.docx  890K │
│  📄 Performance_Testing.xlsx   1.1MB│
│  + 5 more...                        │
│  [+ Add content]                    │
│                                     │
├─────────────────────────────────────┤
│  ■ RIM SIGNALS            (34 live) │
│  ⚠ 3 high-risk patterns detected   │
│  ✓ Consistency: 91%                 │
│  [View signals]                     │
│                                     │
└─────────────────────────────────────┘
```

### Context Usage Bar

Visual indicator showing token consumption of the 200K context window:
- Green: 0–60% (`#22c55e`)
- Amber: 61–85% (`#f59e0b`)
- Red: 86–100% (`#ef4444`)
- Shows: "~84K / 200K tokens used" with estimated counts per section

### Regulatory Strategy Section

- Freeform rich text area showing the `regulatoryStrategy` field from `projectIntelligenceProfiles`
- Inline edit on click — saves to DB on blur/enter
- Shown with subtle blockquote styling when collapsed
- "Not set — AnA will build this as you work" when empty

### Custom Instructions Section

- Injected into AnA's system prompt on every message in this project
- Visible, editable freeform text
- Shows "Active — injected into every conversation" status indicator
- Placeholder: `"You are a [submission type] regulatory expert for [product name]. [Add your custom instructions here.]"`
- Auto-populated placeholder based on project metadata on project creation

### Intelligence Memory Section

Displays atoms from `projectMemoryEntries`, grouped by category:
- **Clinical targets** — drug candidates, device indications, patient population
- **Regulatory decisions** — precedent choices, agency agreements, strategy pivots
- **Learned insights** — RIM-accumulated signals (summarized, not raw)
- **Risk factors** — open high-severity risks
- **Open questions** — unresolved questions flagged for follow-up

Each atom shows:
- Category icon
- Content snippet (2 lines)
- Confidence badge (`high` / `moderate` / `low`)
- Timestamp
- Hover: full content tooltip + delete option

### Documents Section

Flat list of ingested documents, showing:
- File icon (PDF, DOCX, XLSX, image)
- Filename (truncated)
- File size
- Upload date
- Status: `Indexed`, `Indexing...`, `Failed`

Interactions:
- Click filename → open in document viewer
- Hover → delete (X) button appears
- "Add content" button → opens add-content drawer (see Section 7)

### RIM Signals Section

Live summary of signals from the Regulatory Intelligence Model:
- Total signal count
- High-risk pattern count with warning icon
- Consistency percentage
- Link to full signals view (`/signals` command)

---

## 5. Project Creation Flow

### Entry Points

1. **Sidebar "+ New Project" button** — top of sidebar
2. **AnA command** — `create_project` operational command or typing "create a new project"
3. **Keyboard shortcut** — `Cmd+Shift+N`

### Creation Modal / Inline Flow

```
┌──────────────────────────────────────────────────────┐
│  NEW PROJECT                                    [×]   │
├──────────────────────────────────────────────────────┤
│                                                       │
│  Submission Type *                                    │
│  ┌──────────────────────────────────────────────┐    │
│  │  510(k)  ▾                                   │    │
│  └──────────────────────────────────────────────┘    │
│                                                       │
│  Product / Device Name *                             │
│  ┌──────────────────────────────────────────────┐    │
│  │  e.g. "Coronary Stent Model X"               │    │
│  └──────────────────────────────────────────────┘    │
│                                                       │
│  Sponsor / Organization                               │
│  ┌──────────────────────────────────────────────┐    │
│  │  e.g. "Acme Medical Devices, Inc."           │    │
│  └──────────────────────────────────────────────┘    │
│                                                       │
│  Target Agency                                        │
│  ● FDA    ○ EMA    ○ PMDA    ○ Health Canada          │
│                                                       │
│  Target Submission Date                               │
│  ┌────────────┐                                       │
│  │ YYYY-MM-DD │                                       │
│  └────────────┘                                       │
│                                                       │
│  Custom Instructions (optional)                       │
│  ┌──────────────────────────────────────────────┐    │
│  │  Tell AnA what to remember about this...     │    │
│  │                                              │    │
│  └──────────────────────────────────────────────┘    │
│                                                       │
│              [Cancel]  [Create Project →]             │
└──────────────────────────────────────────────────────┘
```

### Post-Creation

After creation:
1. Project appears in sidebar under "RECENT"
2. AnA opens with onboarding message: `"I've set up your [510(k)] project for [Product Name]. What would you like to work on first? I can help you map your CTD structure, identify predicate devices, or start drafting sections."`
3. Suggested action chips appear: `Start Dossier Map`, `Add Documents`, `Run Readiness Check`, `Find Predicates`
4. CTD section structure auto-initialized based on submission type
5. `projectIntelligenceProfiles` row created with initial metadata

---

## 6. Project Configuration Panel

Accessible via the gear icon in the project header bar. Opens as a right-side flyout (not a modal — stays open while chatting).

### Tabs

#### General
- Project name (editable)
- Submission type (editable — warns about CTD structure impact)
- Product / device name
- Sponsor
- Target agency
- Target submission date
- Status (draft / active / in_review / submitted / archived)
- Risk level (low / medium / high / critical)

#### Instructions
- Custom instructions textarea
- Preview of how instructions look in AnA's system prompt
- "Currently active — injected into every conversation" status
- Character count + estimated token count
- `[Reset to default for {submission type}]` button

#### Team (Enterprise)
- List of team members with access
- Role assignment (Owner / Editor / Viewer)
- Invite by email
- Audit trail: who accessed, when, what they changed

#### Compliance
- 21 CFR Part 11 status
- E-signature requirements
- Audit trail export (CSV / PDF)
- Data retention policy
- Regulatory lead assignment

---

## 7. Add Content Drawer

Opened from "Add content" in the knowledge panel. Two tabs:

### Upload File Tab
- Drag-and-drop zone with file type guidance
- Accepted types: PDF, DOCX, XLSX, TXT, CSV, PNG, JPG
- Max size: 30MB per file
- Progress bar during upload + indexing
- Auto-categorization by filename heuristic (e.g., "clinical study report" → clinical category)

### Add Text Tab
- Title field
- Content textarea
- Category dropdown (clinical, regulatory, cmc, nonclinical, device, general)
- Saves as `projectMemoryEntries` atom of type `project_knowledge`
- Appears in Intelligence Memory section immediately

---

## 8. Conversation Experience Within Projects

### Context Badge (Top of Chat)

A slim banner below the chat header confirms which project is active:

```
┌───────────────────────────────────────────────────────────┐
│  [📁] 510(k) — Coronary Stent  ·  IND Phase 2 Oncology  ← │
└───────────────────────────────────────────────────────────┘
```

- Left: Active project name (clickable → opens config panel)
- Right: Quick project switcher (dropdown of recent projects)
- Background: `bg-zinc-50/80` with bottom border

### AnA's First Message in a New Conversation

When a conversation starts within a project, AnA opens with awareness:

```
Good morning. You're working on 510(k) — Coronary Stent.

I have your regulatory strategy, 8 indexed documents, and 34 accumulated
intelligence signals. Your current readiness score is 74%.

What would you like to work on?
```

Suggested action chips (context-aware based on project stage):
- `Check readiness` → `/readiness`
- `Draft a section` → `/draft [section]`
- `Review risks` → `/risk`
- `Next best action` → `/next`

### Conversation Title Handling

- Auto-generated from first user message (first 60 chars, stripped of slash command prefix)
- Shown in sidebar immediately after first exchange
- User can rename via hover → three-dot menu → Rename
- Title also used in knowledge search to find prior conversations

### Move Conversation Between Projects

Hover over conversation in sidebar → three-dot menu → "Move to project" → dropdown of available projects. Thread's `projectId` field updated; context refreshes on next message.

---

## 9. Empty States

### No Projects Yet

```
┌─────────────────────────────────────────────────┐
│                                                 │
│            📋                                   │
│                                                 │
│         No projects yet                         │
│                                                 │
│   Create your first regulatory project to       │
│   unlock AnA's full intelligence, dossier       │
│   mapping, and readiness scoring.               │
│                                                 │
│         [+ Create your first project]           │
│                                                 │
└─────────────────────────────────────────────────┘
```

### Project Has No Documents

```
Knowledge panel → Documents section:

  📂  No documents added yet

  Add your clinical study reports, predicate
  comparisons, or performance data. AnA will
  index them and reference them in every
  conversation.

  [+ Add content]
```

### Project Has No Conversations

```
Chat area:

  [📁] 510(k) — Coronary Stent

  ─────────────────────────────────────

  Ready to work on your 510(k) submission.

  I have your project context loaded. What
  would you like to tackle?

  [Map my CTD structure]  [Find predicates]
  [Check readiness]       [Draft a section]
```

---

## 10. Reference Files

| Purpose | Path |
|---------|------|
| Sidebar component | `client/src/concept2cure/components/sidebar/ZenSidebar.tsx` |
| App shell + state | `client/src/concept2cure/ZenApp.tsx` |
| Knowledge panel | `client/src/concept2cure/components/workspace/ProjectKnowledgePanel.tsx` |
| Project knowledge hook | `client/src/concept2cure/hooks/useProjectKnowledge.ts` |
| Project intelligence hook | `client/src/concept2cure/hooks/useProjectIntelligence.ts` |
| Dossier map | `client/src/concept2cure/components/workflow/DossierMap.tsx` |
| Submission readiness | `client/src/concept2cure/components/workflow/SubmissionReadiness.tsx` |
| Project home dashboard | `client/src/concept2cure/components/workflow/ProjectHomeDashboard.tsx` |
| Context badge in chat | `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx` |
| Project intelligence DB | `server/services/intelligence/project-intelligence-service.ts` |
| Context injection chain | `server/services/lumen-context-builder.ts` (getIntelligencePrefix) |
| Memory assembler | `server/services/memory-context-assembler.ts` |
| Project routes | `server/routes/concept2cure.ts` (/api/projects, /api/project-sections) |
| Chat auto-title logic | `server/routes/chat.ts` (title generation after first message) |
| DB schema | `shared/schema/` (projects, ai_threads, projectIntelligenceProfiles, projectMemoryEntries) |

---

## 11. Implementation Gap Tracker

Gaps from the redesign plan — use this as a checklist when building:

| Gap | Description | Status |
|-----|-------------|--------|
| E1 | Custom instructions injected into AnA context | ✅ DONE (verified in lumen-context-builder) |
| E2 | Sidebar project→conversation hierarchy | ✅ DONE (ZenSidebar refactored) |
| E3 | Project context badge in chat | ✅ DONE (AnaPersistentPanel) |
| E4 | Auto-title conversations from first message | ✅ DONE (chat.ts) |
| E5 | DossierMap + SubmissionReadiness use real API | ✅ DONE (API-driven, no mock data) |
| E6 | Move conversations between projects | ✅ DONE (PATCH /api/chat/thread/:id + sidebar submenu) |
| E7 | RAG file activation (toggle file in/out of context) | ✅ DONE (isActive toggle + context builder filtering) |
| E8 | Nightly memory summaries (background job) | ✅ DONE (memory-consolidation-job.ts, 2AM UTC cron) |
| E9 | Project sharing + permissions UI (Enterprise) | ⬜ TODO (Enterprise tier) |
| N1 | Add text content to project knowledge | ✅ DONE (useProjectKnowledge + panel UI) |
| N2 | Context usage / token bar in knowledge panel | ✅ DONE (ContextMeter + token estimation) |
| N3 | Team sharing UI (invite, roles, audit) | ⬜ TODO (Enterprise tier) |

---

## 12. Anti-Patterns

| Anti-Pattern | What to Do Instead |
|---|---|
| Generic "New Chat" with no project context | Always create chats within a project; unscoped chat is a fallback, not the default |
| Flat sidebar list of conversations | Project hierarchy first — conversations are nested under projects |
| File library without indexing status | Every file shows indexed/indexing/failed status |
| Custom instructions buried in settings | Instructions visible and editable directly in the knowledge panel |
| Readiness score only accessible via `/readiness` | Readiness score always visible in the project header bar |
| Project creation requiring a separate page | Inline modal or flyout — no full-page navigation |
| Memory atoms shown as raw data | Summarized, categorized, with confidence indicators |
| Project type as generic label only | Submission type badge with color coding drives visual identity of every project |
