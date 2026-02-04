# Concept2Cure — Project Planning & Roadmap Index

> **Version:** 1.0 | **Created:** 2026-01-29 | **Status:** AUTHORITATIVE  
> **Purpose:** Single entry point for all Concept2Cure planning and roadmap documentation  
> **Principle:** This index reflects the UI workspace structure.

---

## 🧭 Navigation Principle

Concept2Cure is a **Project-centric workspace OS**. All planning documentation is organized to mirror the three-pane UI structure:

| UI Pane | Planning Analog |
|---------|-----------------|
| Left Sidebar (Projects + Modules) | Project & Module Roadmaps |
| Center Pane (Chat / Workflow / Editor) | Implementation Phases |
| Right Pane (Artifacts / Audit / Tasks) | Deliverables & Evidence |

---

## ✅ Current Focus (Phase 5 — Intelligent Document System)

**Source of truth:** [docs/roadmap/CONCEPT2CURE_MASTER_ROADMAP.md](docs/roadmap/CONCEPT2CURE_MASTER_ROADMAP.md)

**Primary surface:** Artifact Editor
**Supporting panels:** Artifacts (versions), Audit (change trail), Tasks (pending reviews)

**Phase 5 Objectives**
- Unified doc editor (Tiptap) wired to artifacts
- Traceability linking UI for anchors/xrefs
- Change propagation engine for downstream artifacts
- Compliance rules engine for document checks

**Acceptance Criteria**
- Artifact editor loads with version history and audit trail
- Traceability links render and resolve to evidence pointers
- Change propagation flags impacted sections deterministically
- Compliance rules produce findings with stable hashes

## 📚 Master Documents

| Document | Purpose | Status |
|----------|---------|--------|
| [MASTER ROADMAP](roadmap/CONCEPT2CURE_MASTER_ROADMAP.md) | **PRIMARY** — Complete build guide with UI alignment | ✅ Authoritative |
| [UNIFIED PROJECT ROADMAP](CONCEPT2CURE_UNIFIED_PROJECT_ROADMAP.md) | Index to roadmap parts 1-5 | ✅ Reference |
| [IMPLEMENTATION TRACKER](../CONCEPT2CURE_IMPLEMENTATION_TRACKER.md) | Phase-by-phase completion status | ✅ Active |

---

## 🏗️ Roadmap Parts (Detailed)

| Part | Focus | Document |
|------|-------|----------|
| Part 1 | Lumen Cortex + Portal Architecture | [CONCEPT2CURE_ROADMAP_PART1.md](CONCEPT2CURE_ROADMAP_PART1.md) |
| Part 2 | File Structure + 10-Week Plan (superseded) | [CONCEPT2CURE_ROADMAP_PART2.md](CONCEPT2CURE_ROADMAP_PART2.md) |
| Part 3 | UI/UX + Database + Compliance | [CONCEPT2CURE_ROADMAP_PART3.md](CONCEPT2CURE_ROADMAP_PART3.md) |
| Part 4 | **12-Week Implementation Plan (authoritative)** | [CONCEPT2CURE_ROADMAP_PART4.md](CONCEPT2CURE_ROADMAP_PART4.md) |
| Part 5 | Testing + Deployment + KPIs | [CONCEPT2CURE_ROADMAP_PART5.md](CONCEPT2CURE_ROADMAP_PART5.md) |

---

## 🖥️ UI Workspace Structure

### Project Workspace Shell (Foundation)

```
┌─────────────────────────────────────────────────────────────────────┐
│                         APP SHELL                                    │
├─────────────┬───────────────────────────────────┬───────────────────┤
│   LEFT      │           CENTER                   │      RIGHT        │
│  SIDEBAR    │           PANE                     │      PANE         │
│             │                                    │                   │
│ • Projects  │ • Chat Interface                   │ • Artifacts       │
│ • Modules   │ • Workflow Runner                  │ • Audit Trail     │
│ • Chats     │ • Document Editor                  │ • Tasks           │
│ • PM Hub    │ • Dashboard Views                  │ • Timeline        │
│             │                                    │                   │
└─────────────┴───────────────────────────────────┴───────────────────┘
```

### Module Workspaces

| Module | Dashboard | Chats | Artifacts | Workflows | PM Docs |
|--------|-----------|-------|-----------|-----------|---------|
| Client Portal V2 | Config, usage | Support threads | Config reports | Provisioning | Integration plan |
| Project Cortex | Data readiness | Design threads | Mappings, specs | ETL pipeline | Data risks |
| eCTD Co-Author | Completion % | Drafting threads | CTD sections | Draft→Sign→Export | Content risks |
| CER Generator | Gap analysis | Review threads | CER reports | Data→Draft→Finalize | Compliance plan |
| Regulatory Intel | Alerts, calendar | Query threads | Briefings | Alert→Analyze→Report | Source coverage |
| Mission Control | Portfolio | Executive threads | KPI reports | Plan→Execute→Review | Program risks |

---

## 📋 PM Hub Documents

| Document Type | Scope | Purpose |
|---------------|-------|---------|
| Project Roadmap | Project | Timeline, milestones, dependencies |
| Module Roadmap | Module | Module-specific delivery plan |
| Requirements | Project/Module | Functional & regulatory requirements |
| Risks | Project/Module | Risk register with mitigations |
| ADRs | Project/Module | Architecture Decision Records |
| Validation Plan | Project | IQ/OQ/PQ validation strategy |
| Evidence Matrix | Project | Traceability to artifacts + audit |

---

## 🔤 Terminology Reference

| Term | Definition | Example |
|------|------------|---------|
| **Project** | Top-level container for a regulatory submission or program | "Acme 510(k) Q2 2026" |
| **Module** | Functional workspace within a project | Client Portal V2, eCTD Co-Author |
| **Chat** | Conversational AI interaction | "Draft device description" |
| **Artifact** | Persistent output (document, report, export) | Clinical Summary v2.1.docx |
| **Workflow** | Multi-step process with gates and approvals | IND Submission Pipeline |
| **PM Doc** | Project management documentation | Roadmap, Risks, ADRs |

### Deprecated Terms (Do Not Use)

| ❌ Old Term | ✅ Replace With |
|-------------|-----------------|
| "Document output" | **Artifact** |
| "AI session" | **Chat** |
| "Process" | **Workflow** |
| "Planning docs" | **PM Docs** |
| "Module UI" | **Module Workspace** |

---

## ✅ Planning QA Checklist

- [ ] Every roadmap item names a UI surface
- [ ] PM Docs are explicitly first-class
- [ ] "Project Workspace Shell" exists as an epic
- [ ] Client Portal V2 and Project Cortex both have UI footprints
- [ ] Terminology is consistent (Chat / Artifact / Workflow / PM Doc)
- [ ] Planner reads like a **product OS**, not a feature list

---

## 📝 Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-01-29 | Created planning index with UI workspace alignment | Copilot |
| 2026-01-29 | Added terminology reference and deprecated terms | Copilot |
| 2026-01-29 | Linked all roadmap parts and master documents | Copilot |
