---
name: ana-chatgpt-parity-ui
version: 2.1.0
description: |
  Execute a hard-nosed shell convergence for AnA so the product behaves like a
  ChatGPT-style conversation-first workspace with projects, apps, communication routing,
  and settings inside one calm canonical shell. Use this for any work touching global nav,
  shell ownership, project/chat/app architecture, composer behavior, token reset, or
  responsive UI convergence.
allowed-tools:
  - Read
  - Edit
  - MultiEdit
  - Write
  - Grep
  - Glob
  - Bash
---

# AnA ChatGPT-Parity UI Execution Skill

## Mission

You are not here to decorate the repo.
You are here to end shell confusion.

The user wants AnA to feel as close as possible to ChatGPT in:
- shell hierarchy
- project behavior
- conversation-first workflow
- apps callable from the composer
- responsive behavior
- typography restraint
- spatial rhythm
- low-chrome trustworthiness

But this repo is not a blank slate. It already contains a real machine room.

Your job is to:
1. preserve the machine room,
2. converge the shell,
3. demote or remove competing shells,
4. normalize the visual system,
5. and prove the result with behavior, not adjectives.

---

## First Rule: Obey Repo Law

Read `CLAUDE.md` before touching anything.

Respect all repo instructions in it, especially:
- one-branch rule (`concept2cure-v2`)
- do-not-rebuild systems that already exist
- component registry rules
- chat-first design rules
- UI state standards
- UI Convergence and Legacy Surface Deletion rules (NON-NEGOTIABLE)
- report-to-file preference

If your plan contradicts `CLAUDE.md`, your plan is wrong.

---

## Core Laws for This Skill

1. **Chat is the primary workspace.**
2. **Projects are context containers, not alternate product worlds.**
3. **Apps are callable capabilities, not standalone nav kingdoms.**
4. **Communication Center is the routing layer for tasks, reviews, submissions, and message work.**
5. **Settings is utility-only.**
6. **One canonical shell, one nav source, one composer.**
7. **No shell work may break the machine room.**
8. **No fake parity language. If behavior is missing, build it or say it is missing.**

---

## Required Source Reading Order

Read these files first, in this exact order when present:

1. `CLAUDE.md`
2. `docs/design/ANA_CHATGPT_PARITY_UI_DESIGN.md`
3. `docs/audits/CURRENT_DOCUMENT_SYSTEM_REALITY_2026-03-27.md`
4. `docs/plans/DOCUMENT_SYSTEM_CONVERGENCE_DECISIONS_2026-03-27.md`
5. `docs/reports/project-status-assessment-2026-03-28.md`
6. `config/ui-surface-registry.json` (if exists)
7. `client/src/concept2cure/ZenApp.tsx`
8. `client/src/concept2cure/components/sidebar/ZenSidebar.tsx`
9. `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx`
10. `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx`
11. `client/src/concept2cure/components/editor/EditorPanel.tsx`
12. `client/src/concept2cure/components/shell/IndustryWorkspaceShell.tsx`
13. `client/src/index.css`
14. `tailwind.config.ts`
15. any routing file controlling shell destination changes
16. `zen-app-constants.ts` or wherever `LayoutMode` enum is defined

Do not start implementing until you know who currently owns:
- top-level shell
- nav source of truth
- chat surface
- projects landing
- settings surface
- apps surface
- Communication Center surface, or whether it is missing
- token source of truth
- the `LayoutMode` enum and its 22+ values

---

## Non-Negotiable Repo Truth You Must Honor

Start from these truths:
- `EditorPanel` is canonical editor
- `ProjectWorkspaceShell` is machine room
- `AnaPersistentPanel` is the visible AnA identity worth preserving
- `ZenSidebar.tsx` is a useful convergence candidate, not a final answer
- `ZenApp.tsx` is currently overburdened and likely the top orchestration choke point
- the repo still contains more than one shell-era worldview
- the current token stack is too branded and too editorial for the requested target

**Codebase-confirmed disease vectors:**
- `ZenApp.tsx` has 22+ layout modes via `LayoutMode` enum — each renders a different-feeling app
- `AnaPersistentPanel` renders as `mode="full"` OR `mode="compact"` OR hidden depending on layout — this dual personality must be resolved to always-full within the chat surface
- `GlobalOperatingShell` is a breadcrumb/header wrapper that only appears for some modes
- `ProjectWorkspaceShell` is a second shell inside the first shell with its own panel system
- `ToolPanel` drawer is a third competing surface (fixed right, z-50) overlaying everything
- `ZenSidebar.tsx` has 16 nav items where there should be 5
- `SIDEBAR_NAV_TO_LAYOUT` maps produce 30+ layout configurations
- Theme uses Poppins + Lora (serif body), terracotta-dominant shell (#d97757), warm cream backgrounds

Do not pretend the shell is already unified. It is not.

---

## Mandatory Deliverables for Every Real Implementation Pass

You must write these files if they do not already exist for the current run:

1. `docs/audits/ANA_UI_FORENSIC_AUDIT_<date>.md`
2. `docs/plans/ANA_UI_CONVERGENCE_WORK_ORDER_<date>.md`
3. `docs/reports/ANA_UI_VALIDATION_REPORT_<date>.md`

These are not optional fluff. They are proof.

### Audit File Must Contain
- current shell owner(s)
- alternate shell files
- nav maps found
- token owners found
- route ownership map
- project/chat/app/settings ownership map
- `LayoutMode` enum values and which are still active
- what will be kept vs demoted vs redirected vs deleted
- risk notes

### Work Order File Must Contain
- exact files to edit
- exact files to demote
- exact files to delete only if safe
- route changes
- `LayoutMode` enum collapse plan (22+ → ~5-7)
- component ownership changes
- viewport test plan
- acceptance criteria copied from design doc

### Validation Report Must Contain
- what changed
- widths tested
- flows tested
- regressions checked
- `ui-surface-registry.json` updated
- screenshots or screenshot references if browser tooling exists
- remaining gaps honestly stated

---

## Hard Shell Target

### Allowed Top-Level Destinations ONLY
- Chats
- Projects
- Communication Center
- Apps
- Settings

If you leave any of these as top-level siblings, you failed the brief:
- Documents
- Intelligence
- Workspace Home
- Editor
- Review
- Verify
- Vault
- References
- Submit
- Export
- Builder
- Dossier
- Analytics dashboard

Those may still exist as project-level or context-level functions. They may not remain primary shell siblings.

---

## Convergence Algorithm

Follow this sequence exactly.

### Phase 0: Branch and Repo Sanity

```bash
git checkout concept2cure-v2
git pull origin concept2cure-v2
```

If this fails, stop and report.
Do not create a new branch.

### Phase 1: Forensic Audit

Answer these questions in the audit file:

1. What file currently owns the top-level shell?
2. How many alternate shell files exist?
3. How many different nav maps exist?
4. Where are general chats rendered?
5. Where are project chats rendered?
6. What file currently owns project landing?
7. Does Communication Center already exist? If not, what is the nearest substrate?
8. Where are apps surfaced today?
9. Where do settings live today?
10. What file controls shell typography/colors/borders/spacing?
11. What legacy shell files must be demoted?
12. What routes or nav IDs currently violate the new top-level IA?
13. How many `LayoutMode` values exist and which map to the 5 allowed destinations?
14. What is the current state of `AnaPersistentPanel` mode logic?

Use `Grep`, `Glob`, and `Read`. Name exact files.

### Phase 2: Authority Map

Produce a simple ownership table in the work order:

| Concern | Current Owner | Future Owner | Action |
|---|---|---|---|
| App shell | ... | ... | keep/refactor/demote/delete |
| Sidebar | ... | ... | ... |
| Chats view | ... | ... | ... |
| Projects view | ... | ... | ... |
| Project landing | ... | ... | ... |
| Communication Center | ... | ... | ... |
| Apps view | ... | ... | ... |
| Settings view | ... | ... | ... |
| Composer | ... | ... | ... |
| Shell tokens | ... | ... | ... |
| LayoutMode enum | ... | ... | collapse 22+ → ~5-7 |
| AnaPersistentPanel mode | ... | ... | resolve to always-full |
| ToolPanel drawer | ... | ... | reconcile with ContextDrawer |

Do not code until this map is coherent.

### Phase 3: Canonical Shell Ownership

Preferred target ownership:
- `client/src/concept2cure/shell/AppShell.tsx` (or refactored `ZenApp.tsx`)
- `client/src/concept2cure/shell/PrimarySidebar.tsx` (or refactored `ZenSidebar.tsx`)
- `client/src/concept2cure/shell/ContextDrawer.tsx`
- `client/src/concept2cure/views/ChatsView.tsx`
- `client/src/concept2cure/views/ProjectsView.tsx`
- `client/src/concept2cure/views/ProjectLandingView.tsx`
- `client/src/concept2cure/views/CommunicationCenterView.tsx`
- `client/src/concept2cure/views/AppsView.tsx`
- `client/src/concept2cure/views/SettingsView.tsx`
- `client/src/concept2cure/components/chat/Composer.tsx`
- `client/src/concept2cure/design/tokens-shell.css`

**Codebase adjustment:** Prefer refactoring `ZenApp.tsx` and `ZenSidebar.tsx` in place over creating new files. The repo's disease is file proliferation. Fewer files, one authority.

**Critical Phase 3 action:** Collapse the `LayoutMode` enum from 22+ values to ~5-7 values matching the allowed destinations plus editor/artifact context.

You do not have to create every file if existing files can cleanly own the role. But by the end, ownership must be explicit and non-overlapping.

### Phase 4: Demote Competing Shells

Explicitly choose one status for every shell-related legacy file:
- Canonical
- Refactor into child component
- Demote and redirect
- Delete when proven unused

At minimum evaluate:
- `ZenApp.tsx` (refactor, do not replace)
- `ZenSidebar.tsx` (refactor, do not replace)
- `IndustryWorkspaceShell.tsx` (verify if active; demote or delete)
- `GlobalOperatingShell` (absorb into canonical shell or demote)
- `ToolPanel` drawer (reconcile with ContextDrawer or demote)
- `AnaPersistentPanel` dual-mode logic (resolve to always-full)
- any dashboard-era shell wrapper
- any duplicate settings or workspace shell view

Never leave a legacy shell half-alive and bypassed.

**Update `config/ui-surface-registry.json`** with the status of every evaluated surface.

### Phase 5: Build the Global Shell in the Right Order

Implement in this order:
1. canonical shell frame (collapse LayoutMode)
2. primary sidebar (collapse to 5 destinations)
3. Chats view
4. Projects view
5. Project landing
6. Communication Center
7. Apps view
8. Settings view
9. right context drawer
10. composer/app invocation integration
11. route cleanup and redirect cleanup
12. responsive behavior pass
13. regression into editor/machine room

Do not start with ornament.

---

## Exact Implementation Rules

### Rule 1: Do Not Create a Second Shell
No `NewShell`, `BetterShell`, `AppShellV2`, `UnifiedShellFinal`, or similar coward branch-fodder file naming. If you create a new canonical shell, demote the old one deliberately.

### Rule 2: Do Not Preserve Duplicate Global Nav Stories
Global nav can only express the five approved destinations. Any old nav surface that resurrects Documents/Intelligence/Workspace/Submit as top-level shell siblings must be refactored.

### Rule 3: Do Not Preserve Serif Shell Typography
Replace shell chrome typography with a clean sans stack. If serif remains, it must be isolated to long-form document surfaces only.

### Rule 4: Do Not Preserve Terracotta-Led Shell Identity
The shell must become neutral. Brand color may remain as accent, not shell atmosphere.

### Rule 5: Do Not Teleport Users into Separate App Worlds
Apps must feel callable from the composer or shallow project actions. If clicking an app feels like leaving AnA, that is a failure.

### Rule 6: Do Not Break the Machine Room
Protect: editor, artifact lifecycle, provenance, review, submission, vault, dossier placement, governed actions.

### Rule 7: Do Not Proliferate Files
Refactor existing files in place when possible. The repo's history of creating new files beside old files IS the disease.

---

## Token Reset Rules

Create or designate a shell token source of truth.

**Typography:** shell = clean sans, sidebar/nav = 13px target, chat body = 15-16px target, metadata = 12px target, page titles = restrained.

**Colors:** neutral shell palette, one restrained accent family, low contrast separators, no decorative shell gradients, no terracotta-dominant shell.

**Borders/radius/shadow:** thin borders, modest radius, minimal shadow, menus/popovers only where needed.

**Motion:** subtle fade/slide, fast and quiet, no bounce.

Document surfaces may keep different typography if warranted. Shell surfaces may not.

---

## Route and Nav Cleanup Rules

You must create a route mapping table in the work order:

| Old Nav/Route | Problem | New Destination | Action |
|---|---|---|---|
| ... | duplicate top-level concept | ... | redirect/remove/refactor |

No hidden zombie routes. No dead nav IDs. No silent bypasses.

---

## Browser Parity Verification

If browser tooling, MCP, or screenshot tooling exists, compare against ChatGPT-like behavior before and after implementation.

Required comparison surfaces: expanded sidebar, collapsed sidebar, chat thread, composer, project creation and project landing, apps invocation pattern, responsive overlay behavior.

Required widths: 1440, 1280, 1024, 768, 430.

Check: spacing rhythm, nav density, composer proportions, active/hover states, clarity of chat/project hierarchy, overlay/drawer behavior.

If browser tooling is unavailable, say so explicitly in the validation report. Do not bluff.

---

## Test and Validation Protocol

Before declaring success, validate all of this.

### Structural Validation
- one canonical shell owner
- one canonical nav source
- one chats surface, one projects surface, one project landing
- one Communication Center, one apps surface, one settings surface

### Behavioral Validation
- new general chat launches fast
- project chat launches fast
- recent chat resume works
- composer file attach works
- `@app` invocation works
- project context visible and coherent
- Communication Center routes into real work objects

### Visual Validation
- shell typography neutralized to sans
- shell palette neutralized
- border/radius/spacing consistent
- no dashboard-card first impression remains

### Responsive Validation
At each required width verify: sidebar works, overlays work, composer remains usable, no hidden critical controls, no broken right drawer behavior.

### Regression Validation
- editor still opens
- artifact lifecycle still reachable
- review still reachable
- submission still reachable
- no dead routes
- no shell-escape regressions

---

## Required Proof in the Validation Report

You must show:
- exact files changed
- exact legacy shell files demoted or removed
- `ui-surface-registry.json` state
- route cleanup summary
- nav cleanup summary
- token reset summary
- widths tested
- flows tested
- remaining gaps, honestly stated

If screenshots exist, reference them. If not, say why.

---

## Stop Conditions

You are **not done** if any of the following remain true:
- two shell owners still exist
- top-level nav still has old workspace siblings
- `LayoutMode` enum still has >7 active values
- `AnaPersistentPanel` still renders in compact/hidden mode within chat contexts
- project landing still feels like a dashboard first
- apps still behave like separate products
- serif shell typography remains
- terracotta still dominates shell identity
- responsive behavior is untested
- editor or artifact workflows regress
- `ui-surface-registry.json` has undefined or stale entries

---

## Preferred Execution Mindset

Be ruthless.

Preserve the machine room.
Strip shell confusion.
Unify the product around chat, project context, callable apps, and governed outputs.

Do the boring important work:
- remove duplicate nav
- normalize tokens
- demote alternate shells
- simplify the project home
- make the composer the center of gravity
- prove the result

That is how this stops feeling like six smart products fighting over one screen.
