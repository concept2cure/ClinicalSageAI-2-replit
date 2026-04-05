# AnA UI Shell Convergence — Forensic Audit

**Date:** 2026-04-05
**Branch:** `concept2cure-v2`
**Purpose:** Identify all competing shell authorities before converging to ChatGPT-style conversation-first shell.

---

## Executive Summary

The Concept2Cure platform has **5 active shell concerns** distributed across 3 files, **2 dormant shell components** that were never wired in, and a **LayoutMode state machine with 92 values** (22 active, 5 compatibility redirects, 65+ demoted/legacy). The sidebar exposes 6 global nav items + 4 project tabs — one more than the 5-destination target. CommunicationCenter and AppsPage both exist as implemented components. Theme tokens (Poppins, Lora, terracotta `#d97757`, warm cream `#FAFAF9`) are consistently applied.

---

## 1. Shell Owners Identified

### 1.1 ZenApp.tsx — DOMINANT SHELL (Active)

**File:** `client/src/concept2cure/ZenApp.tsx` (~4,100 lines)
**Role:** Primary application shell. Owns all layout state, sidebar, header, project switching, and 30+ conditional render blocks.

- Holds `layoutMode` state (the master switch for all content rendering)
- Renders `ZenSidebar`, `AnaPersistentPanel`, `GlobalOperatingShell`, embedded modules
- Contains `PROJECT_SCOPED_LAYOUTS` guard set (18 layouts requiring active project)
- Contains `DEMOTED_REDIRECTS` useEffect that redirects 65+ legacy modes to `projects`
- All content rendered via `{layoutMode === 'X' && <ComponentX />}` pattern

**Verdict:** Keep. Refactor in place to reduce to 5 destination renders.

### 1.2 zen-app-constants.ts — NAVIGATION POLICY (Active)

**File:** `client/src/concept2cure/zen-app-constants.ts` (314 lines)
**Role:** Pure data file defining LayoutMode type, nav mappings, tool panel registry.

Contains:
- `LayoutMode` type union — **92 values** (lines 27-118)
- `PRIMARY_NAV_ID_BY_LAYOUT` — 14 active layout→navId mappings (lines 124-139)
- `LEGACY_NAV_ID_BY_LAYOUT` — 42 legacy layout→navId mappings (lines 141-185)
- `SIDEBAR_NAV_TO_LAYOUT` — 31 navId→layout mappings (lines 187-218)
- `ToolPanel` type — 10 right-side panel types + null (lines 14-25)
- `TOOL_PANELS` config — 10 panel definitions with title/icon/component (lines 257-283)

**Verdict:** Keep. Collapse LayoutMode to ~8 values. Remove all legacy/demoted entries.

### 1.3 ZenRouter.tsx — ENTRY POINT DISPATCHER (Active)

**File:** `client/src/concept2cure/router/ZenRouter.tsx` (~495 lines)
**Role:** URL routing. All authenticated `/concept2cure/*` paths converge to `<ProtectedZenApp />`.

Key routes:
- `/concept2cure/project/:projectId/:rest*` → ProtectedZenApp
- `/concept2cure/project/:projectId` → ProtectedZenApp
- `/concept2cure` → ProtectedZenApp
- `/concept2cure/*` → ProtectedZenApp (catch-all)
- Embedded module routes for 510k/PMA when `EMBED_MODULES_IN_SHELL` disabled

**Verdict:** Keep. Minimal changes needed — already funnels everything to ZenApp.

### 1.4 ZenSidebar.tsx — NAVIGATION UI (Active)

**File:** `client/src/concept2cure/components/sidebar/ZenSidebar.tsx` (~1,290 lines)
**Role:** Renders left sidebar navigation. Two modes: collapsed (icon strip) and expanded (full labels).

**Current Global Nav (6 items):**
1. New (dropdown: New Chat, New Project, New Artifact)
2. Search
3. Projects
4. Workspace Home
5. Documents
6. Intelligence

**Current Project Context (4 tabs, when project active):**
1. Overview
2. Tasks
3. Tools
4. Submit

**Dynamic Sections:**
- Pinned Projects (expandable group)
- Recent Projects (expandable group)
- General Conversations (project-unscoped chats)

**Verdict:** Keep. Collapse global nav to 5 items matching allowed destinations.

### 1.5 AnaPersistentPanel.tsx — CHAT SURFACE (Active, Not Competing)

**File:** `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx` (~5,555 lines)
**Role:** Unified AI chat panel. Sub-component embedded within ZenApp — NOT a competing shell.

**Modes:**
- `mode='full'` — Fills available space, greeting + suggested actions (Claude.ai style)
- `mode='compact'` — Input bar only, conversation expands as overlay

**Chat Modes (user-selectable):**
- `standard` — Routes to AnA RI orchestrated chat
- `deep-research` — Launches deep research jobs with streaming progress
- `nano-banana` — Image/presentation generation mode

**Verdict:** Keep as-is. This becomes the central content area in the new shell.

---

## 2. Dormant / Unused Shells

### 2.1 ZenShell.tsx — LEGACY (Never Wired)

**File:** `client/src/concept2cure/layouts/ZenShell.tsx` (~300 lines)
**Role:** Alternative Claude.ai-style shell layout with ZenHeader. Never referenced in ZenApp or ZenRouter.

**Verdict:** DELETE. Dead code.

### 2.2 IndustryWorkspaceShell.tsx — INCOMPLETE (Never Wired)

**File:** `client/src/concept2cure/components/shell/IndustryWorkspaceShell.tsx` (~150 lines)
**Role:** Industry context-aware shell (biotech/pharma/cro/medtech/etc). Full props defined but never rendered.

**Verdict:** DELETE. Dead code.

---

## 3. Sub-Shells (Legitimate, Not Competing)

### 3.1 GlobalOperatingShell.tsx

**File:** `client/src/concept2cure/components/shell/GlobalOperatingShell.tsx` (74 lines)
**Role:** Minimal breadcrumb wrapper. Renders context path for 6 workspace layouts. Decorative only.

**Verdict:** Keep or demote to inline breadcrumb. Not a shell authority.

### 3.2 ProjectWorkspaceShell.tsx

**File:** `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx` (~200 lines)
**Role:** Regulated document workspace sub-shell (file tree + editor + inspector). Renders within `layoutMode === 'regulatory-workspace'`.

**Verdict:** Keep. This is the machine room for document authoring.

### 3.3 EmbeddedModuleHosts.tsx

**File:** `client/src/concept2cure/components/shell/EmbeddedModuleHosts.tsx` (~200 lines)
**Role:** Wrapper for 510k/PMA/CER embedded modules with collapsible AnA rail.

**Verdict:** Keep. Tactical adapter for specific submission workflows.

---

## 4. LayoutMode Enum — Full Inventory

**File:** `client/src/concept2cure/zen-app-constants.ts` (lines 27-118)
**Total values:** 92

### 4.1 Active Modes (22)

| Mode | Category | Maps to 5 Destinations? |
|------|----------|------------------------|
| `projects` | Global | **Chats** (project-scoped conversations) |
| `apps` | Global | **Apps** |
| `artifacts-center` | Global | Demote → Apps or remove |
| `setup` | Global | **Settings** |
| `project-home` | Project | **Chats** (project home is chat-first) |
| `documents` | Project | Demote → within project workspace |
| `vault` | Project | Demote → within project workspace |
| `review` | Project | Demote → within project workspace |
| `submissions` | Project | Demote → within project workspace |
| `dossier-map` | Project | Demote → within project workspace |
| `section-workspace` | Project | Demote → within project workspace |
| `csr-workflow` | Project | Demote → within project workspace |
| `ind-checklist` | Project | Demote → within project workspace |
| `template-library` | Project | Demote → within project workspace |
| `regulatory-workspace` | Workspace | Machine room (editor + file tree) |
| `editor` | Workspace | Within regulatory-workspace |
| `deep-research` | Workspace | Chat mode variant |
| `precedent-intelligence` | Specialist | Demote → Apps sub-view |
| `biostatistics` | Specialist | Demote → Apps sub-view |
| `review-readiness` | Specialist | Demote → Apps sub-view |
| `report-engine` | Specialist | Demote → Apps sub-view |
| `safety-narrative` | Specialist | Demote → Apps sub-view |
| `vault-workspace` | Specialist | Demote → Apps sub-view |

### 4.2 Compatibility Redirects (5)

| Mode | Redirects To |
|------|-------------|
| `workspace` | `regulatory-workspace` |
| `assistant` | `projects` (chat) |
| `ctd` | `projects` (chat) |
| `medtech-dashboard` | `projects` |
| `dossier` | `dossier-map` |

### 4.3 Demoted Modes (65+)

All redirect to `projects` via `DEMOTED_REDIRECTS` useEffect. Includes: `mission-control`, `snowglobe`, `snowglobe-chambers`, `rules`, `ectd-coauthor`, `cmc`, `document-vault`, `clinical-trial`, `templates`, `sherpa`, `analytics`, `timeline`, `audit`, `enablement-center`, `platform-admin`, `biologics-dashboard`, `ctd-onboarding`, `client-intelligence`, `collaboration-hub`, `user-inbox`, `client-branding`, `training-center`, `client-onboarding`, `knowledge-base`, `project-knowledge`, `artifacts`, `document-builder`, `ana-platform-control`, `ind-workspace`, `submission-workspace`, `author`, `intelligence-hub`, `command-center`, `legal-center`, `about-training`, `ana-dashboard`, `integrations`, plus 18 unused MissionControl sub-modes.

---

## 5. SIDEBAR_NAV_TO_LAYOUT Mapping — Full Table

**File:** `client/src/concept2cure/zen-app-constants.ts` (lines 187-218)
**Total entries:** 31

| Nav ID | → Layout Mode | Convergence Target |
|--------|---------------|-------------------|
| `apps` | `apps` | **Apps** (keep) |
| `artifacts-center` | `artifacts-center` | Remove (fold into Apps) |
| `setup` | `setup` | **Settings** (keep) |
| `projects` | `projects` | **Chats** (keep) |
| `home` | `projects` | Remove (duplicate) |
| `documents` | `regulatory-workspace` | Demote to project workspace |
| `submissions` | `submissions` | Demote to project workspace |
| `reports` | `report-engine` | Demote to Apps |
| `dossier` | `dossier-map` | Demote to project workspace |
| `ri-copilot` | `regulatory-workspace` | Demote (redundant) |
| `submission-builder` | `regulatory-workspace` | Demote (redundant) |
| `cmc` | `section-workspace` | Demote to project workspace |
| `clinical-module5` | `section-workspace` | Demote to project workspace |
| `verify` | `review-readiness` | Demote to Apps |
| `vault` | `vault-workspace` | Demote to project workspace |
| `review` | `review` | Demote to project workspace |
| `publish` | `submissions` | Demote (duplicate of submissions) |
| `haq` | `report-engine` | Demote (duplicate of reports) |
| `task-board` | `task-board` | Demote to project workspace |
| `csr-workflow` | `csr-workflow` | Demote to project workspace |
| `ind-checklist` | `ind-checklist` | Demote to project workspace |
| `overview` | `project-home` | Keep as project-scoped chat |
| `work` | `documents` | Demote (redundant) |
| `review-tab` | `review` | Demote (duplicate) |
| `submit` | `submissions` | Demote (duplicate) |
| `templates` | `template-library` | Demote to project workspace |
| `template-library` | `template-library` | Demote (duplicate) |
| `tools` | `documents` | Demote (redundant) |
| `dataroom` | `regulatory-workspace` | Demote (redundant) |
| `upload` | `regulatory-workspace` | Demote (redundant) |

---

## 6. GlobalOperatingShell — Detail

**File:** `client/src/concept2cure/components/shell/GlobalOperatingShell.tsx` (74 lines)

- Minimal breadcrumb component
- Shows `currentGlobalNodeLabel → activeArtifactLabel` hierarchy
- Only renders for 6 layouts: `regulatory-workspace`, `documents`, `report-engine`, `submissions`, `review`, `dossier-map`
- Props: `layoutMode`, `activeProjectName`, `activeNavId`, `currentGlobalNodeLabel`, `activeArtifactLabel`
- **Not a shell authority** — purely decorative context indicator

---

## 7. ToolPanel Drawer System

**File:** `client/src/concept2cure/zen-app-constants.ts` (lines 14-25, 257-283)

**Type:** Right-side slide-in panel system (Claude Artifacts style)

**10 Panel Types:**

| Panel ID | Title | Component |
|----------|-------|-----------|
| `ectd` | eCTD Navigator | ECTDNavigator |
| `protocol` | Protocol Designer | StudyProtocolDesigner |
| `intelligence` | Regulatory Intelligence | RegulatoryIntelligence |
| `vault` | Document Vault | VaultBrowser |
| `doc-editor` | Document Editor | EditorPanel |
| `ana-biostats` | AnA Biostats | AnaBiostatsPanel |
| `sop` | SOP Management | SOPManagement |
| `capa` | CAPA Management | CAPAManagement |
| `pms` | Post-Market Surveillance | PostMarketSurveillance |
| `inspection` | Inspection Readiness | InspectionReadiness |

**Convergence impact:** ToolPanel competes with the right-drawer concept only if both try to occupy the same screen real estate. In the new shell, ToolPanel should become the ONLY right-side content mechanism — no separate "right drawer" needed.

---

## 8. Theme Tokens — Current State

### 8.1 Fonts

| Token | Font | Import | Usage |
|-------|------|--------|-------|
| `font-heading` | Poppins | Google Fonts (index.html) | Headings, UI chrome |
| `font-body` | Lora | Google Fonts (index.html) | Body text, prose |
| `font-ui` | Poppins | Google Fonts (index.html) | Buttons, labels |
| `font-sans` | Poppins (via system stack) | tailwind.config.ts | Fallback sans |

**Defined in:**
- `tailwind.config.ts` lines 258-262
- `client/src/concept2cure/design/zen.ts` line 131
- `client/src/index.css` lines 292, 311

### 8.2 Colors

**Primary brand:**
- Terracotta `#d97757` — accent color, buttons, links, avatars, active states
- Defined in `tailwind.config.ts` lines 29-41 (full scale 50-950)
- Defined in `zen.ts` lines 55-60 (accent.DEFAULT, .hover, .muted, .subtle)
- Hardcoded in AnaPersistentPanel at 15+ locations as `bg-[#D97757]`, `text-[#D97757]`

**Warm neutral scale (replaces cold slate/zinc/gray):**
- `#faf9f5` (50) → `#0a0a09` (950)
- `#FAFAF9` — warm canvas background
- `#F4F3EE` — pampas secondary canvas
- `#E8E6DC` — light warm gray borders
- `#141413` — anthropic dark (primary text)
- Defined in `tailwind.config.ts` lines 14-26
- Mapped to `slate`, `gray`, `zinc`, `neutral`, `stone` (lines 87-91)

**Meta theme:** `<meta name="theme-color" content="#d97757" />` (index.html line 29)

### 8.3 Consistency Assessment

Tokens are **well-centralized** in tailwind.config.ts and zen.ts. The main issue is **hardcoded hex values** in AnaPersistentPanel (`bg-[#D97757]` etc) rather than using Tailwind tokens (`bg-accent`). This should be fixed during convergence but is not blocking.

---

## 9. Communication Center — Status

**Status:** IMPLEMENTED (component + backend route + hook)

| Artifact | Path | Size |
|----------|------|------|
| Component | `client/src/concept2cure/components/workspace/CommunicationCenter.tsx` | Exists |
| Backend route | `server/routes/concept2cure-communication-center.ts` | Exists |
| Data hook | `client/src/concept2cure/hooks/useCommunicationCenterData.ts` | Exists |

**Current structure (5 tabs):**
1. Overview — operational graph summary
2. Tasks — ProjectTaskBoard
3. Collaboration — thread lanes + audience tiers + ReviewPulseDashboard
4. Correspondence — agency communication events
5. Submission & Agency Portal — submission details + C2C PublishOps

**Integration:** Currently embedded within ProjectWorkspaceShell as a sub-view, NOT a top-level destination.

**Convergence action:** Promote to top-level destination. Wire as `layoutMode === 'communication-center'`.

---

## 10. Apps Page — Status

**Status:** IMPLEMENTED

**File:** `client/src/concept2cure/pages/AppsPage.tsx`

**Current structure (3 tab groups):**
1. Strategy & Evidence (2 apps): Deep Research, Precedent Intelligence
2. Builders (4 apps): 510(k), PMA, CER Generator, Safety Narrative
3. Specialist Studios (1 app): Biostatistics

**Track-aware sorting** by submission type (pharma vs device).

**Convergence action:** Keep as `layoutMode === 'apps'`. Already wired.

---

## 11. Other Sidebar Files Found

| File | Lines | Purpose | Status |
|------|-------|---------|--------|
| `client/src/concept2cure/components/sidebar/ProjectsSidebar.tsx` | 761 | Claude.ai-style projects sidebar (pinned/recent/general) | Active sub-component of ZenSidebar |
| `client/src/concept2cure/components/workspace/ProjectSidebar.tsx` | ~50 | Right-side knowledge panel (Memory/Instructions/Files) | Active, not competing |
| `client/src/components/layout/Sidebar.tsx` | 284 | Legacy generic sidebar (14 items, 5 sections) | LEGACY — verify if still referenced |
| `client/src/portal-v2/layouts/SidebarNav.tsx` | Unknown | Legacy portal sidebar | LEGACY — separate portal system |
| `client/src/components/ui/sidebar.tsx` | Unknown | UI primitive (SidebarProvider context) | Keep — infrastructure |

---

## 12. Missing Skill Files

The following skill files referenced in the task prompt do NOT exist on this system:

1. `/mnt/skills/user/ana-ui-design-constitution/SKILL.md` — NOT FOUND
2. `/mnt/skills/user/ana-chatgpt-parity-ui/SKILL.md` — NOT FOUND
3. `/mnt/skills/user/ana-ui-master-work-order/SKILL.md` — NOT FOUND
4. `/mnt/skills/user/trialsage-repo-ops/SKILL.md` — NOT FOUND
5. `/mnt/skills/user/trialsage-component-registry/SKILL.md` — NOT FOUND
6. `/mnt/skills/user/trialsage-design-system/SKILL.md` — NOT FOUND

The `/mnt/skills/` directory does not exist. Available in-repo skills at `.claude/skills/`:
- `claude-ui-design-principles.md` (read)
- `chat-first-design.md` (read)
- `ana-operating-system.md` (read)
- `ui-standards.md` (read)
- `figma-component-contract.md` (read)
- `project-design.md`
- `gstack/` (browser QA tooling)

---

## 13. ui-surface-registry.json — Status

**Status:** DOES NOT EXIST. All surface configuration is hardcoded in TypeScript:
- `zen-app-constants.ts` — LayoutMode type, nav mappings, tool panels
- `ZenSidebar.tsx` — nav item rendering
- `ZenApp.tsx` — conditional render blocks

**Convergence action:** Create `config/ui-surface-registry.json` as the source of truth for surface status tracking.

---

## 14. Key Findings Summary

1. **ZenApp.tsx is the single dominant shell** — 4,100 lines, owns all layout state. No true "competing shells" in the sense of rival implementations rendering simultaneously. The competition is architectural: too many layout modes, too many nav items, too many conditional renders.

2. **92 LayoutMode values is untenable** — only 22 are active, 5 are redirects, 65+ are demoted. The type union should collapse to ~8 values matching the 5 destinations + project workspace sub-modes.

3. **Current sidebar has 6 global items, needs 5** — New, Search, Projects, Workspace Home, Documents, Intelligence → must become Chats, Projects, Communication Center, Apps, Settings.

4. **CommunicationCenter exists but is buried** — needs promotion from ProjectWorkspaceShell sub-view to top-level destination.

5. **AppsPage exists and is wired** — already at `layoutMode === 'apps'`.

6. **Two dormant shells (ZenShell.tsx, IndustryWorkspaceShell.tsx) should be deleted** — dead code, never wired.

7. **ToolPanel system is sound** — 10 right-side panels, Claude Artifacts style. Should become the sole right-side content mechanism.

8. **Theme tokens are well-centralized** — terracotta #d97757, Poppins, Lora, warm cream. Minor issue: 15+ hardcoded hex values in AnaPersistentPanel.

9. **Legacy sidebar (`components/layout/Sidebar.tsx`, 284 lines) may still be referenced** — needs verification and deletion if orphaned.

10. **AnaPersistentPanel is NOT a competing shell** — it's the chat surface, correctly embedded as a sub-component. At 5,555 lines it's the largest component but architecturally sound.
