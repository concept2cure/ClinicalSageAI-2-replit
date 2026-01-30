# UI Alignment Summary — Concept2Cure Project Workspace

**Date:** 2026-01-29  
**Author:** Copilot Agent  
**Scope:** Roadmap + Planner documentation alignment to Project Workspace UI model

---

## Summary

All Concept2Cure planning documentation has been updated to explicitly align with the **Project-centric Workspace OS** model. The platform is no longer described as "a set of modules" — it is now documented as a **unified workspace** where every action occurs inside a Project, scoped to a Module, and expressed through Chats, Artifacts, Workflows, and PM Docs.

---

## What Changed

### 1. UI NORTH STAR Section Added
- **File:** [docs/roadmap/CONCEPT2CURE_MASTER_ROADMAP.md](docs/roadmap/CONCEPT2CURE_MASTER_ROADMAP.md)
- **Change:** Added top-level "UI NORTH STAR — CONCEPT2CURE PROJECT WORKSPACE" section
- **Content:** Canonical three-pane layout, core UI primitives, rule stating all features must be shell-accessible

### 2. PROJECT WORKSPACE SHELL Epic Added
- **File:** [docs/roadmap/CONCEPT2CURE_MASTER_ROADMAP.md](docs/roadmap/CONCEPT2CURE_MASTER_ROADMAP.md)
- **Change:** New first-class epic for foundational UI
- **Components:** AppShell, ProjectSidebar, ContextPanel, Global Create (+), Project Switcher, Module Router

### 3. PM HUB Section Created
- **File:** [docs/roadmap/CONCEPT2CURE_MASTER_ROADMAP.md](docs/roadmap/CONCEPT2CURE_MASTER_ROADMAP.md)
- **Change:** Dedicated PM Hub section with explicit screens
- **Screens:** Project Roadmap, Module Roadmap, Requirements, Risks, ADRs, Validation Plan, Evidence Matrix
- **Rule:** All PM Docs must auto-link to Chats, Artifacts, Workflows, and Audit Events

### 4. MODULE UI FOOTPRINTS Added
- **File:** [docs/roadmap/CONCEPT2CURE_MASTER_ROADMAP.md](docs/roadmap/CONCEPT2CURE_MASTER_ROADMAP.md)
- **Modules Documented:**
  - Client Portal V2
  - Project Cortex (Data Harvesting)
  - eCTD Co-Author
  - CER Generator
  - Regulatory Intelligence
  - Mission Control
- **Each Footprint Includes:** Dashboard, Chats, Artifacts, Workflows, PM Docs

### 5. UI CONTEXT Blocks Added to All Phases
- **File:** [docs/roadmap/CONCEPT2CURE_MASTER_ROADMAP.md](docs/roadmap/CONCEPT2CURE_MASTER_ROADMAP.md)
- **Phases Updated:** 5, 6, 7, 8, 9, 10
- **Format:** Project scope, Primary surface, Supporting panels

### 6. Build Order Aligned to UX-First Principle
- **File:** [docs/roadmap/CONCEPT2CURE_MASTER_ROADMAP.md](docs/roadmap/CONCEPT2CURE_MASTER_ROADMAP.md)
- **Change:** Explicit build sequence starting with UI shell
- **Order:** Shell → Chat/Artifact → Workflow → PM Hub → Compliance → Module Intelligence
- **Rule:** No module is usable until accessible through the shell

### 7. Planning Index Created
- **File:** [docs/CONCEPT2CURE_PLANNING_INDEX.md](docs/CONCEPT2CURE_PLANNING_INDEX.md) (NEW)
- **Purpose:** Single entry point for all planning docs
- **Content:** Master docs, roadmap parts, UI workspace structure, module workspaces, PM Hub docs, terminology, QA checklist

### 8. Terminology Normalized
- **Files Updated:**
  - [docs/CONCEPT2CURE_PLANNING_INDEX.md](docs/CONCEPT2CURE_PLANNING_INDEX.md)
  - [docs/CLAUDE_PROJECT_REFERENCE.md](docs/CLAUDE_PROJECT_REFERENCE.md)
  - [docs/archive/REPLIT_AGENT_ENHANCEMENT_DIRECTIVE.md](docs/archive/REPLIT_AGENT_ENHANCEMENT_DIRECTIVE.md)
- **Canonical Terms:** Project, Module, Chat, Artifact, Workflow, PM Doc
- **Deprecated Terms:** "Document output" → Artifact, "AI session" → Chat, "Process" → Workflow, "Planning docs" → PM Docs

---

## What Gaps Remain

| Gap | Priority | Notes |
|-----|----------|-------|
| Roadmap Parts 1-5 not updated with UI CONTEXT | Low | Master roadmap is authoritative; parts are reference only |
| ContextPanel component not implemented | High | In PROJECT WORKSPACE SHELL epic |
| Global Create (+) not implemented | High | In PROJECT WORKSPACE SHELL epic |
| PM Hub screens not implemented | High | Listed in PM HUB section |
| Evidence Matrix UI not implemented | Medium | Part of PM Hub |

---

## What Is Ready for UI Implementation

| Component | Status | File Location |
|-----------|--------|---------------|
| AppShell | ✅ Exists | client/src/concept2cure/layouts/ |
| ProjectSidebar | ✅ Exists | client/src/concept2cure/components/sidebar/ |
| ContextPanel | ⏳ Ready to build | Spec in master roadmap |
| Global Create (+) | ⏳ Ready to build | Spec in master roadmap |
| Project Switcher | ⏳ Ready to build | Spec in master roadmap |
| PM Hub Router | ⏳ Ready to build | Spec in master roadmap |
| Module Footprints | ⏳ Ready to build | Each module has defined surfaces |

---

## QA Verification

- [x] Every roadmap item names a UI surface
- [x] PM Docs are explicitly first-class
- [x] "Project Workspace Shell" exists as an epic
- [x] Client Portal V2 and Project Cortex both have UI footprints
- [x] Terminology is consistent (Chat / Artifact / Workflow / PM Doc)
- [x] Planner reads like a **product OS**, not a feature list

---

## Files Modified

| File | Change Type |
|------|-------------|
| docs/roadmap/CONCEPT2CURE_MASTER_ROADMAP.md | Major update |
| docs/CONCEPT2CURE_PLANNING_INDEX.md | New file |
| docs/CLAUDE_PROJECT_REFERENCE.md | Terminology update |
| docs/archive/REPLIT_AGENT_ENHANCEMENT_DIRECTIVE.md | Terminology fix |
