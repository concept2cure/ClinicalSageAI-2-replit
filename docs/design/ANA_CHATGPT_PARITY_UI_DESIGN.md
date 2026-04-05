# AnA UI Design — ChatGPT-Parity Shell Convergence

**Recommended repo location:** `docs/design/ANA_CHATGPT_PARITY_UI_DESIGN.md`

**Status:** Controlling UI directive for the AnA shell convergence rebuild

**Audience:** Claude Code, Codex, frontend engineers, product/design leadership

**This document is law for:**
- shell architecture
- navigation hierarchy
- composer behavior
- projects/chats/apps/settings information architecture
- responsive behavior
- visual token reset
- demotion/removal of competing shells

---

## 1. What This Really Is

This is not a visual polish pass.

This is a **product-shell replacement and convergence order**.

The repo already contains a large amount of real capability. The user-facing failure is not missing function. The failure is **too many shells, too many nav stories, too many visual systems, too many destination-first flows, and not enough conversation-first authority**.

The product must stop feeling like:
- a smart backend trapped inside an enterprise dashboard,
- a collection of powerful tools hidden behind competing shells,
- or a document platform that keeps forgetting chat is supposed to be the front door.

The product must start feeling like:
- **ChatGPT's interaction model**,
- with **project-scoped context**,
- **composer-centered tool access**,
- and **regulated artifact, review, and submission power** behind the scenes.

That is the whole game.

---

## 2. Repo-Truth Diagnosis

### 2.1 What the Repo Already Proves Is Real

The repo already contains a legitimate machine room. Do not destroy it.

Preserve and reuse:
- `client/src/concept2cure/ZenApp.tsx` as current high-level app orchestrator until a cleaner shell owner takes over
- `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx` as the visible AnA identity layer
- `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx` as the operational machine room for documents, dossier placement, artifact state, and side-panels
- `client/src/concept2cure/components/editor/EditorPanel.tsx` as canonical editing surface
- `client/src/concept2cure/components/workflow/ReviewReadiness.tsx`
- `client/src/concept2cure/components/workflow/SubmissionReadiness.tsx`
- `client/src/concept2cure/pages/VaultPage.tsx`
- governed artifacts, provenance, compare, audit, signature, export, lifecycle logic

**Rule:** the shell may be rebuilt. The machine room may be reorganized. The machine room may not be casually replaced.

### 2.2 What Is Actually Wrong

The repo's own audits and instructions already point to the disease:
- there are multiple competing "home" or shell surfaces
- one creation path still breaks canonical editor convergence
- there is a visible mismatch between chat-first rules and dashboard-era shell leftovers
- tokens and typography are not aligned with true ChatGPT-style restraint
- more than one component still behaves like a first-class app shell

**Codebase-confirmed specifics (from forensic audit):**
- `ZenApp.tsx` exposes 22+ layout modes via `LayoutMode` enum, each rendering a different-feeling app
- `AnaPersistentPanel` renders in 3 modes (full/compact/hidden) depending on layout
- `GlobalOperatingShell` is a breadcrumb/header wrapper that only appears for some modes
- `ProjectWorkspaceShell` is a second shell inside the first shell, with its own panel system
- `ToolPanel` drawer is a third competing surface (fixed right, z-50) overlaying everything
- `ZenSidebar.tsx` has 16 nav items where there should be 5
- `SIDEBAR_NAV_TO_LAYOUT` maps produce 30+ layout configurations
- Theme uses Poppins + Lora (serif body), terracotta-dominant shell (#d97757), warm cream backgrounds

### 2.3 What Must Be Demoted or Stripped of Authority

These may still exist in code for reuse, but they may no longer behave as top-level product shells:
- `client/src/concept2cure/components/shell/IndustryWorkspaceShell.tsx`
- any dashboard-era workspace shell that owns global navigation
- any "Documents", "Intelligence", "Workspace Home", "References", "Review & Verify", or "Submit & Export" global shell item
- any top-level route whose primary purpose is to create another product world instead of continuing the conversation flow

---

## 3. Product Laws

These laws override local component preference.

### 3.1 Primary Laws

1. **Chat is the primary operating surface.**
2. **Projects are context containers, not separate products.**
3. **Apps are callable capabilities, not standalone kingdoms.**
4. **Communication Center is the routing layer for tasks, reviews, submissions, and governed handoffs.**
5. **Artifacts are downstream outputs, not the top-level shell.**
6. **One shell, one nav source, one composer, one interaction model.**
7. **No shell change may break the machine room.**
8. **No visual choice may add noise unless it improves comprehension.**

### 3.2 Secondary Laws

1. The user must always know:
   - where they are,
   - what context is active,
   - what files are in scope,
   - which apps are available,
   - and what the next likely action is.
2. The user must be able to start useful work with near-zero ceremony.
3. Every meaningful workflow should begin in conversation unless there is a compelling reason not to.
4. Every project must feel like a project-scoped ChatGPT, not a dashboard.
5. Composer access must beat navigation depth.

---

## 4. Exact Top-Level Information Architecture

The global shell is allowed only five primary destinations.

### 4.1 Allowed Top-Level Destinations

1. **Chats**
2. **Projects**
3. **Communication Center**
4. **Apps**
5. **Settings**

No other top-level primary destinations are allowed.

### 4.2 Explicitly Forbidden as Global Top-Level Destinations

These may exist inside projects, drawers, tabs, or apps, but may not remain top-level shell siblings:
- Documents
- Intelligence
- Workspace Home
- Editor
- Review
- Verify
- References
- Vault
- Submit
- Export
- Builder
- Dossier
- Analytics dashboard
- Any role-specific workspace shell

### 4.3 Why

ChatGPT works because the user learns one simple truth:
- chat is where work starts,
- projects hold context,
- tools/apps are summoned,
- files live near the work,
- settings stay out of the way.

AnA must obey the same truth.

---

## 5. Object Model the UI Must Reflect

The UI must be explainable entirely through these objects:
- Workspace Template
- Project
- Chat
- Message
- App
- File
- Artifact
- Task
- Review
- Submission
- User Profile
- Client Profile
- Skill
- Connection
- Permission Policy
- Audit Event

If a view or route cannot be justified through one of those objects, it is probably shell bloat.

---

## 6. Canonical Shell Architecture

### 6.1 Desktop Shell

Three-column layout:
- **Left sidebar:** fixed, collapsible, navigation + recent context
- **Center canvas:** primary work surface
- **Right context drawer:** optional, collapsible, context-specific detail

The center canvas always dominates visual attention.

### 6.2 Laptop Shell

- left sidebar collapsible but stable
- right drawer may dock or overlay based on width
- composer remains pinned
- no content overlap that hides the active thread title or composer

### 6.3 Tablet Shell

- center thread/canvas becomes dominant
- left nav and right context become drawers/overlays
- project switching and context visibility remain shallow
- composer must stay reachable while keyboard is open

### 6.4 Mobile Shell

- chat-first
- single main pane
- left nav and right context both become slide-over surfaces
- no tiny dashboard widgets
- no two-column fake-desktop layouts
- composer must remain stable with keyboard and file attachment interactions

---

## 7. Exact Left Sidebar Structure

### 7.1 Sidebar Zones

#### Zone A: Utility Actions
- New Chat
- Search

#### Zone B: Primary Destinations
- Chats
- Projects
- Communication Center
- Apps
- Settings

#### Zone C: Contextual Recency
- pinned projects
- recent projects
- recent chats
- active project subtree when applicable

#### Zone D: Account/Footer
- user profile summary
- active client indicator if relevant
- connection or security status light if required

### 7.2 Sidebar Rules

- no duplicate workspace nav sections that reintroduce old global destinations
- no role-specific alternate nav trees
- no secondary shell inside the sidebar
- no dark-mode-only special shell unless the entire product theme changes coherently
- no category pileup that makes the user read a taxonomy before acting

### 7.3 Collapsed Sidebar Behavior

Collapsed sidebar may show only:
- brand mark
- new chat
- search
- the five primary destinations
- account/avatar/footer affordance

Collapsed sidebar must not turn into a second mysterious workflow surface.

---

## 8. Center-Canvas Allowed States

The center canvas may render only these primary state families:

1. **General chat thread**
2. **Project chat thread**
3. **Project landing**
4. **Communication Center view**
5. **Apps management/browse view**
6. **Settings view**
7. **Artifact/editor canvas launched from a project/chat context**

The center may not degrade into a random dashboard-card mosaic.

---

## 9. Right Context Drawer

### 9.1 Allowed Tabs

The right context drawer may use these tab families depending on active context:
- Context
- Files
- Artifacts
- Apps
- Activity
- Provenance
- Review
- Submission
- Memory

### 9.2 Context Logic

#### When a Chat Is Active
- files in scope
- apps in scope
- project instructions
- recent generated artifacts
- relevant memory/context summary
- tool run or provenance strip where useful

#### When a Project Landing Is Active
- client profile
- enabled apps
- recent files/artifacts
- active reviews/submissions/tasks
- project instructions and workspace template details

#### When Editor/Artifact Is Active
- artifact metadata
- lifecycle status
- provenance
- versions
- comments/reviewers
- linked files
- submission placement

#### When Communication Center Is Active
- related project
- related artifact/submission
- routing metadata
- assignees/reviewers
- deadlines/escalations

---

## 10. Screen-by-Screen Specification

### 10.1 Chats View

**Purpose:** Primary conversational work surface for general and project-scoped work.

**Required layout:**
- left sidebar visible or overlayed based on viewport
- center thread occupies majority width
- right drawer optional
- composer pinned to bottom

**Required capabilities:**
general chats, project chats, rename chat, edit previous message, retry/regenerate assistant response, branch/fork conversation, file upload from composer, drag/drop upload, `@app` invocation, slash commands, save output to artifact, open artifact/editor from message, inline tool/app activity summary.

**Chat header — general:** chat title, minimal meta, rename/share/export/menu actions, optional model/persona badge if genuinely useful.

**Chat header — project:** project name, chat title, workspace template badge, context summary trigger, quick jump to project landing, quick open files/artifacts.

**Message rendering rules:** very quiet message containers, low-chrome markdown, generous line height, compact action row on hover/press. Citations, code, tables, artifacts, and tool runs render inline without blowing up the shell. "Thinking" or process detail must remain optional disclosure, not default clutter.

**Composer behavior — the product center of gravity.**

Required: multiline text input, paperclip or plus menu, drag/drop upload, `@app`, slash commands, insert template, launch canvas/editor, send, optional extended reasoning toggle if supported.

Forbidden: toolbar soup, huge persistent button row, crowded KPI pills around the composer, modal-first file attach flow when inline attach is available.

### 10.2 Projects View

**Purpose:** Browse, search, create, and manage context containers.

**Required:** project list or simple rows/cards, search/filter/sort, create project CTA, workspace template selection during creation, recent chats preview, project status summary, client association if relevant.

**Behavior:** Selecting a project opens **Project Landing**, not a dashboard zoo.

### 10.3 Project Landing

**Purpose:** Conversation-first entry into project work.

**Primary CTAs:** Ask AnA about this project, Resume recent chat, Start new project chat.

**Required sections:** project title + metadata, workspace template, recent chats, recent artifacts, files in context, open tasks/reviews/submissions, recommended next actions.

**Forbidden:** executive dashboard hero, KPI card farm as default first impression, role-based widget soup, document builder as the default project home.

### 10.4 Communication Center

**Purpose:** Tasking, messaging, review, submission, and routing layer.

**Required subsections:** Inbox, Tasks, Reviews, Submission Queue, Sent / Completed, Alerts / Escalations.

**Item model:** each row/item may link to a project, a chat, an artifact, a review request, a submission package, a user/client, an escalation or approval trail.

**Visual rules:** list-first not card-first, compact rows with strong hierarchy, no separate software look, same shell tokens as chats/projects.

### 10.5 Apps View

**Purpose:** Browse, manage, and configure callable capabilities.

**Required:** installed apps, enabled/disabled state, connection status, workspace-template availability, permissions or scope, supported output/artifact types.

**Critical rule:** Apps page is for management and browse. Daily usage still happens mostly from the composer.

### 10.6 Settings

**Required subsections:** Connections, Skills, Security, User Profile, Client Profiles, New User Setup, New Client Setup, Licensing / Budget Selection.

**Rules:** quiet utility layout, no marketing copy, no dashboard theatrics, direct explanation of what each setting changes.

---

## 11. Workspace Template Model

Required templates:
1. Biotechnology & Pharmaceutical Authoring
2. Medical Device & Diagnostics Authoring
3. Biostatistics
4. CMC
5. CSR / CTD Intelligence
6. Study Design & Optimization
7. Reporting, Analytics & Predictive Analysis

**Templates may change:** default project instructions, enabled apps, default prompt starters, artifact types, review flows, compliance overlays, file taxonomy/folders, suggested next actions.

**Templates may NOT change:** top-level shell hierarchy, nav logic, composer behavior, responsive rules, core visual system.

Templates alter context. They do not create new product shells.

---

## 12. App/Workspace Catalog Mapping

| Workspace Template | Default Apps / Modes |
|---|---|
| Biotechnology & Pharmaceutical Authoring | Authoring, CTD/eCTD, submission drafting, review, evidence retrieval |
| Medical Device & Diagnostics Authoring | 510(k)/PMA/CER/diagnostics authoring, predicate/reference handling |
| Biostatistics | stats app, simulation, power analysis, SAP workflows |
| CMC | module 3 authoring, manufacturing, quality/governance support |
| CSR / CTD Intelligence | precedent, extraction, comparison, evidence reasoning |
| Study Design & Optimization | protocol design, tradeoff evaluation, feasibility/risk patterns |
| Reporting, Analytics & Predictive Analysis | reporting, predictive analysis, scenario summaries, trend views |

Apps must feel summonable, not siloed.

---

## 13. Visual System Reset

The current shell tokens are too branded and too editorial for the requested target. The shell must be reset to a neutral system.

### 13.1 Typography

**Shell typography:** Use a clean sans stack. Allowed: system sans stack, a restrained grotesk if already licensed and technically available.

Forbidden for shell chrome: `Lora`, mixed serif shell body, heavy biotech-corporate font expression, multi-font shell hierarchy.

**Document/editor exception:** Serif may remain in long-form governed document editing surfaces **only if** it improves drafting/readability and stays isolated from shell chrome.

### 13.2 Recommended Type Scale
- app chrome labels: 12-13px
- sidebar nav labels: 13px
- metadata: 12px
- chat body: 15-16px
- section headings: 14-16px semi-bold
- project/page title: 18-24px depending on viewport
- code: monospace only

### 13.3 Color Rules

**Shell palette:** neutral background, white/near-white surfaces, low-contrast separators, dark text with strong readability, one restrained accent family.

**Accent usage:** reserved for selected state, focused state, important action, semantic meaning. Accent color is **not** for painting the whole shell.

**Forbidden:** terracotta-led global shell identity, decorative gradients in shell chrome, loud per-module accent battles, dark enterprise sidebar unless the entire product intentionally becomes dark and remains coherent.

### 13.4 Borders, Radius, Shadow
Thin borders only. Modest radius only. Minimal shadow, mostly for popovers/menus/overlays. No shadow theater.

### 13.5 Motion
Brief fades/slides. 150-220ms default transition rhythm. No bounce. No spring spectacle. No celebratory motion.

---

## 14. Responsive Behavior Specification

Required viewport test widths: 1440, 1280, 1024, 834, 768, 430, 390.

**At each width validate:** sidebar behavior is intelligible, active destination is obvious, chat thread remains primary, composer remains visible and stable, project switching is easy, Communication Center is reachable, right drawer does not hide required context without alternate path, upload and `@app` invocation remain usable.

**Mobile/tablet rules:** use overlays/drawers, do not shrink desktop density and call it done, do not trap core actions behind double overlays, do not make the composer scroll off or break under keyboard.

---

## 15. Exact File Ownership Directive

### 15.1 Target Ownership Model

Preferred target structure:
- `client/src/concept2cure/shell/AppShell.tsx`
- `client/src/concept2cure/shell/PrimarySidebar.tsx`
- `client/src/concept2cure/shell/ContextDrawer.tsx`
- `client/src/concept2cure/views/ChatsView.tsx`
- `client/src/concept2cure/views/ProjectsView.tsx`
- `client/src/concept2cure/views/ProjectLandingView.tsx`
- `client/src/concept2cure/views/CommunicationCenterView.tsx`
- `client/src/concept2cure/views/AppsView.tsx`
- `client/src/concept2cure/views/SettingsView.tsx`
- `client/src/concept2cure/components/chat/Composer.tsx`
- `client/src/concept2cure/design/tokens-shell.css`

This does not mean "start by creating everything." It means ownership must become clear.

### 15.2 Role of Current Files

**`ZenApp.tsx`** — Current orchestrator. Must become either a thin route/bootstrap coordinator, or the single top-level shell owner temporarily during convergence. It must not remain a swollen everything-file forever. **Codebase adjustment:** Prefer refactoring in place over creating new files. Collapse the `LayoutMode` enum from 22+ values to ~5 (matching the five allowed destinations plus editor/artifact). This is a Phase 3 priority action.

**`ZenSidebar.tsx`** — May be refactored into the new canonical sidebar. It should not remain a mixed-authority nav museum.

**`ProjectWorkspaceShell.tsx`** — Keep as machine room. Demote from pretending to be a separate shell authority.

**`EditorPanel.tsx`** — Keep as canonical editing surface. Do not dislodge.

**`IndustryWorkspaceShell.tsx`** — Demote, redirect, or delete when safe.

**`AnaPersistentPanel.tsx`** — Renders as `mode="full"` OR `mode="compact"` OR hidden depending on layout mode. That dual personality is part of the disease. Convergence must resolve it to always-full within the canonical chat surface.

**`GlobalOperatingShell`** — Breadcrumb/header wrapper that only appears for some modes. Must be evaluated for demotion or absorption into the canonical shell.

**`ToolPanel` Drawer** — Fixed-right, z-50 overlay that competes with the right context drawer concept. Must be reconciled — either it becomes the ContextDrawer or it is demoted.

---

## 16. Demotion and Deletion Policy

For each shell-related file, explicitly choose one of these statuses:
- **Canonical**
- **Refactor into child component**
- **Demote and redirect**
- **Delete when proven unused**

No shell file may remain "half-alive" and silently bypassed. That is how the repo got haunted.

---

## 17. Forbidden Implementation Patterns

Do not ship any of the following:
- "modern dashboard" rewrite
- card grid as first impression
- project landing that defaults to KPIs instead of conversation
- apps that feel like separate software products
- shell-wide branded terracotta theme
- serif shell typography
- duplicate nav trees
- role-specific alternate shells
- giant toolbar composer
- top-level builder/editor destinations as shell siblings
- fake parity language without actual interaction parity

---

## 18. Acceptance Criteria

### 18.1 Structural
- one canonical shell owner
- one canonical nav source
- one chats view, one projects view, one project landing
- one Communication Center, one apps view, one settings view
- editor remains canonical editing surface

### 18.2 Behavioral
- new general chat starts in one click
- new project chat starts in one click from project landing
- recent chat resume is fast
- file attach from composer works
- `@app` invocation works
- project context is visible and understandable
- review/task/submission routing is reachable via Communication Center

### 18.3 Visual
- shell typography is clean sans
- shell palette is neutralized
- border/radius/spacing are consistent
- no loud old shell leftovers remain
- no dashboard-card hero replaces conversation-first landing

### 18.4 Responsive
- all required widths checked
- sidebar and drawers behave cleanly
- no mobile composer breakage
- tablet overlays feel intentional

### 18.5 Regression
- canonical editor still opens
- governed artifact lifecycle still reachable
- review flow still reachable
- submission flow still reachable
- no dead route regressions
- no shell-escape regressions

---

## 19. Validation Checklist

Before declaring done, produce evidence for:
- before/after shell map
- file ownership map
- removed/demoted shell files
- route mapping changes
- viewport screenshots or screenshot references
- chat flow proof
- project landing proof
- Communication Center proof
- apps invocation proof
- settings proof
- editor/regression proof

If live browser comparison tooling is available, compare against ChatGPT-like behavior at the required widths. If it is not available, say so plainly and validate against this design spec.

---

## 20. Final Instruction

Preserve the machine room.
Remove shell confusion.
Center the conversation.
Demote everything that competes with that truth.

That is the product move.
