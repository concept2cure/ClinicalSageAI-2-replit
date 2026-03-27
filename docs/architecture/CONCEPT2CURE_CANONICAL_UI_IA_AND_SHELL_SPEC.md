# Concept2Cure Canonical UI Information Architecture & Shell Specification

**Status:** Canonical — approved for build
**Date:** 2026-03-27 (revised from 2026-03-26 draft)
**Revision:** v2.0 — human-first OS model
**Owners:** UX Architecture, Solution Design, Platform Product

---

## Revision Delta (v1 → v2)

| What changed | Detail |
|---|---|
| **Global nav replaced** | Was: AnA Home, Projects, Vault, Documents, Reports, Reviews, Submission, Admin (8 items). Now: New, Search, Projects, Apps, Artifacts, Setup (6 items). |
| **Project nav replaced** | Was: Overview, Documents, Vault/Evidence, Reports, Tasks, Reviews, Submission, Activity (8 tabs). Now: Overview, Work, Vault, Review, Submit (5 tabs). |
| **Documents removed as global destination** | Documents live inside Work (project-local). |
| **Vault removed as global destination** | Vault is a project service, not a global hallway. |
| **Reports redistributed** | No longer a top-level hallway. Status reporting → Overview. Audit/compliance → Review. Package/readiness → Submit. |
| **Admin removed as global destination** | Replaced by Setup. |
| **Apps added as global destination** | First-class launcher: Strategy & Evidence, Builders, Specialist Studios. |
| **Artifacts added as global destination** | Cross-project governed outputs browser. |
| **Canonical naming added** | Artifacts, Documents, Files, Vault, DMS explicitly reconciled. |
| **First-time user journey added** | 7-step flow from sign-in to confidence checkpoint. |
| **AnA confirmed as sole guide** | Dr. Sage dual-identity removed from onboarding. |

---

## 1) Product Operating Model (North Star)

Concept2Cure uses a **calm, project-centric operating model** implemented as one governed enterprise OS:

- **One universal application shell** with a short, calm global navigation.
- **One project experience** with 5 clear workflow lanes.
- **One document studio** inside the Work lane as the center of regulated execution.
- **Apps as a launcher** for specialty tools and document-producing workbenches.
- **Artifacts as a global center** for governed outputs across all projects.
- **Always-available AnA** as the single conversational guide and operator.

Primary workflow chain:

**Project → Work → Evidence → Review → Submit**

---

## 2) Canonical Information Architecture

### Level 1: Global Shell (Left Rail)

Global navigation is fixed to exactly 6 destinations:

1. **New** — create chat, project, artifact, or workspace from template
2. **Search** — universal overlay across projects, artifacts, files, apps, chats, section codes
3. **Projects** — project list, creation, search/sort/filter, status
4. **Apps** — launcher page for specialty tools and document-producing workbenches
5. **Artifacts** — cross-project governed outputs browser (drafts, in review, approved, submission-ready)
6. **Setup** — org profile, user defaults, client track preferences, templates, integrations

Account/profile sits at the bottom of the rail.

#### Global IA Rules

- Do not add more than 6 global destinations.
- Documents, Vault, Reports, Reviews, and Submission are NOT global destinations. They live inside projects.
- Global destinations represent OS-level concerns that span all projects.
- Apps is a real launcher — specialist tools are accessed through it, not through the global rail.

### Level 2: Project Shell (When a Project Is Open)

When a user opens a project, a **Current Project block** appears in the sidebar (between global nav and project list) showing project name, submission type, and 5 tabs:

1. **Overview** — project home, status, readiness snapshot, next actions, recent artifacts, pending reviews, milestones
2. **Work** — document editor, section workspace, dossier map, templates, transform canvas, governed authoring, app outputs
3. **Vault** — files, evidence, source materials, linked artifacts, upload, search/filter
4. **Review** — quality checks, compliance, readiness scoring, evidence confidence, audit trail, traceability, provenance, signatures
5. **Submit** — submission readiness, section completeness, package export, final checks, filing checklist

#### Project IA Rules

- Project context is persistent and visible in sidebar block.
- All project functions are reachable without leaving the project shell.
- Specialist modes (CMC, Biostats, Device, Clinical) are launched from Apps but operate inside the active project's Work lane.
- The left rail stays global. The project tabs stay local. That is how the product stays calm.

### Level 3: Inside a Document (Within Work)

Document Studio uses these fixed tabs:

1. **Content** — the editor
2. **Evidence** — linked sources, citations, confidence
3. **Versions** — version history, diff, rollback
4. **Review** — review threads, status gates
5. **Signatures** — attestation, approval
6. **Provenance** — lineage, audit events
7. **Export** — format, package, download

#### Document IA Rules

- Documents are editable artifacts. They live inside Work.
- Evidence, provenance, and signatures are first-class tabs (not hidden drawers).
- The existing `GovernedDocumentPanel` (D→R→A→L lifecycle, 7 tabs) already implements this.

### Level 4: Apps (Global Launcher)

Apps is a destination page with exactly 3 groups:

#### Strategy & Evidence
- Deep Research
- Precedent Intelligence
- Evidence Memo
- Protocol Rationale
- Risk-Benefit Analysis

#### Builders
- Clinical Overview
- Module 3 Builder
- Safety Narrative
- 510(k) Workspace
- PMA Workspace
- CER Generator
- Audit Report

#### Specialist Studios
- CMC
- Biostatistics
- Clinical
- Device

#### App Behavior Rules

- If no project is open, prompt the user to select or create one.
- If a project is open, launch the app inside that project's Work context.
- Every app output becomes a governed artifact in the active project.
- Apps reuse the same shell, review model, and submission pipeline.

---

## 3) Canonical Naming System

| Term | Canonical meaning | Where shown in UI | Where NOT shown |
|---|---|---|---|
| **Artifacts** | Governed outputs and governed records: drafted sections, generated memos, module outputs, audit reports, approved deliverables, submission-ready outputs. What the system versions, governs, approves, places, signs, audits, compares, and submits. | Global Artifacts destination. Status badges everywhere. GovernedDocumentPanel. | Never called "records" or "objects" in UI. |
| **Documents** | Editable artifacts in the Work experience. Use "document" when the user is authoring. Use "artifact" when the system is talking governance and lifecycle. | Work tab, editor, document list, section workspace. | Not a global destination. Not a synonym for "files". |
| **Files** | Uploaded and stored source/supporting materials: PDFs, source documents, evidence, attachments, imports. | Vault tab, upload zones, file browsers. | Not called "documents" in Vault context. |
| **Vault** | The place where files live, and where artifacts can also be browsed in storage/evidence context. A workspace, not an object type. | Project Vault tab, vault drawer/utility. | Not a global nav destination. Not a synonym for DMS. |
| **DMS** | Backend document management capability. Powers storage, versioning, retrieval. | Never in top-level nav or primary UI labels. | Not a user-facing label anywhere. Backend term only. |
| **Reports** | Generated summaries and assessments. | Distributed: status reporting in Overview, audit/compliance in Review, package/readiness in Submit. | Not a standalone global or project destination. |
| **Dossier** | The CTD structure organizing sections and placements. | Inside Work as dossier map / section navigator. | Not a global or project-level tab. |
| **Submission** | The regulatory filing package. | Submit tab (project-level). | Not a global destination. |

---

## 4) Persistent UX Primitives (Always On)

The following remain accessible on every major screen:

1. **AnA composer** — bottom of screen, compact or full mode depending on context
2. **Current project identity** — sidebar project block when a project is active
3. **Global search / command bar** — ⌘K overlay
4. **Account / profile** — bottom of left rail

### Persistence Contract

- AnA is present across all screens as either inline full chat or compact input bar.
- Global nav is always visible in the left rail regardless of project state.
- If a screen cannot host these primitives, that screen is non-canonical and must be redesigned.

---

## 5) Universal Shell Blueprint

### Shell Regions

```
┌──────────────────────────────────────────────────────────────────┐
│ Left Rail (56px collapsed / 240px expanded)                      │
│ ┌──────────┐ ┌──────────────────────────────────────────────────┐│
│ │ Global   │ │                                                  ││
│ │ Nav      │ │  Center Canvas                                   ││
│ │ (6 items)│ │  (active workflow surface)                       ││
│ │          │ │                                                  ││
│ │──────────│ │                                                  ││
│ │ Project  │ │                                                  ││
│ │ Block    │ │                                                  ││
│ │ (5 tabs) │ │                                                  ││
│ │          │ │                                                  ││
│ │──────────│ │                                                  ││
│ │ Recent   │ │                                                  ││
│ │ Projects │ │                                                  ││
│ │          │ │                                                  ││
│ │──────────│ ├──────────────────────────────────────────────────┤│
│ │ Account  │ │  AnA Composer (persistent)                       ││
│ └──────────┘ └──────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────┘
```

### Shell Behavior

- Context must survive route changes (project + document + mode memory).
- Command bar supports object jump, actions, and cross-level navigation.
- AnA can be invoked from keyboard + click from every major screen.
- Left rail collapses to icon strip on narrow viewports.

---

## 6) Navigation and State Model

### Canonical Context Stack

Every routed screen carries:

- `org_id`
- `project_id` (optional at global level)
- `document_id` (optional outside Work)
- `artifact_id` (optional)
- `mode` (default or specialist)

### Layout Mode Model

Canonical layout modes:

```
Global destinations:     projects | apps | artifacts-center | setup
Project tabs:            project-home | documents | vault | review | submissions
Work sub-views:          dossier-map | section-workspace | editor
Specialist tools:        deep-research | precedent-intelligence | biostatistics
                         review-readiness | report-engine | safety-narrative
Compatibility:           workspace → documents, assistant → documents, etc.
```

All other modes in the current `LayoutMode` union (60+ values) redirect via `DEMOTED_REDIRECTS`.

---

## 7) First-Time User Journey

### Required Principle

Do not onboard by over-explaining agent architecture first. Do not auto-advance users through abstract intro slides. Users must reach first value quickly. AnA is the sole guide.

### 7-Step Flow

**Step 1: Welcome**
- Clean centered page after sign-in
- Primary CTA: "Create your first project"
- Secondary: "Explore apps" / "Import existing materials"
- AnA appears at bottom: "I'll guide you to the fastest path."

**Step 2: Guided Setup**
- Single compact flow (not 7 slides):
  - Client track (Pharma & Biotech / Medical Device & Diagnostics)
  - Primary role
  - Submission type
  - Agency / region
  - Organization name
  - Guided mode vs fast mode
- AnA summarizes choices in one card

**Step 3: Create First Project**
- Project name, sponsor/company, product name, submission type
- Optional: upload starting files
- Skip compliance validation on first run (reduce friction)

**Step 4: Land in Project → Overview**
- Auto-navigate to Overview tab
- Show readiness snapshot, next recommended actions, "resume where you left off"

**Step 5: AnA Tab Tour**
- AnA sends a guided message explaining the 5 project tabs:
  - Overview = where the project stands
  - Work = where documents are created
  - Vault = where files/evidence live
  - Review = where quality/compliance is checked
  - Submit = where final readiness/export happens
- Optional tooltip sequence highlighting each tab

**Step 6: First Successful Output**
- AnA suggests a context-appropriate first action based on track:
  - Pharma/Biotech: "Let's create your Clinical Overview" or "Open Module 3 Builder"
  - Device/Diagnostics: "Let's set up your 510(k) workspace" or "Create a CER scaffold"

**Step 7: Confidence Checkpoint**
- Summary card: "You're set up"
- Continue options: Work, Vault, Apps, Overview

### What Changes from Current Onboarding

| Current (`FirstRunExperience.tsx`) | Target |
|---|---|
| 7 screens, first 3 auto-advance at 6 seconds | No auto-advance. User controls pace. |
| Dr. Sage introduced as separate guide | Removed. AnA is the sole guide. |
| AnA introduced as separate copilot | AnA is present from Step 1. |
| Role → submission type → agent team → automation level | Track → role → submission → region → org. No agent team selection on first run. |
| Ends at "Launch Concept2Cure" | Ends at first successful output + confidence checkpoint. |

---

## 8) Client Tracks

Two client tracks, one OS:

| Aspect | Pharma & Biotech | Medical Device & Diagnostics |
|---|---|---|
| Default submission types | IND, NDA, BLA, MAA, CTA | 510(k), PMA, De Novo, CER/MDR, IVDR |
| Default apps | Clinical Overview, Module 3 Builder, Safety Narrative | 510(k) Workspace, PMA Workspace, CER Generator |
| Default specialist studios | CMC, Biostatistics, Clinical | CMC, Device, Clinical |
| Template sets | ICH CTD Module 1-5 | FDA device modules, EU MDR/IVDR |
| Guided onboarding emphasis | Dossier structure, clinical evidence | Predicate comparison, evidence compilation |

Client track influences defaults and recommendations. Client track does NOT create separate shells.

---

## 9) Role Swim Lanes

| Role | Expected primary path |
|---|---|
| **Regulatory lead** | Projects → Overview → Work → Review → Submit |
| **Medical writer** | Projects → Work → Builders (via Apps) → Review |
| **CMC specialist** | Projects → Apps → Specialist Studios → CMC → Work → Vault → Review |
| **Biostatistician** | Projects → Apps → Specialist Studios → Biostatistics → Work → Review |
| **Device / diagnostics lead** | Projects → Apps → Builders → 510(k)/PMA/CER → Vault → Review → Submit |
| **QA / reviewer** | Projects → Review → Submit |
| **Executive / PM** | Projects → Overview → Artifacts |

Role lenses adjust default landing views and suggested actions, not the core IA.

---

## 10) Governed Document Core Requirements

The document core is the center of execution in Work and must provide:

- Structured content model with section-level identity.
- Evidence binding (claims → sources → confidence/provenance).
- Version lineage and diff visibility.
- Review workflows with role/state governance (Draft → In Review → Approved → Locked).
- Signature support with compliant audit events.
- Export profiles aligned to submission requirements.

The existing `GovernedDocumentPanel` implements: Status (D→R→A→L), Audit, Versions, Snapshots, Threads, Governance, Lineage.

---

## 11) Vault Interaction Model

Vault is a project-scoped workspace for files and evidence. It is NOT a global destination.

### Vault Capabilities

- Browse uploaded files organized by folder (drafts, generated, dossier, evidence, cmc, ind, ectd, clinical, audit, final).
- Upload source documents, evidence packs, and attachments.
- Link/unlink evidence to document claims.
- Show provenance metadata, recency, and usage history.
- Surface evidence gaps and stale evidence warnings.

### Vault UX Rules

- Vault is a project tab, always accessible from the project shell.
- Vault can also be invoked as a drawer/utility from within Work for in-context evidence linking.
- Vault actions generate traceable activity events.

---

## 12) Reporting Distribution

Reports are NOT a standalone destination. They are distributed:

| Report type | Where it lives |
|---|---|
| Project status, progress, milestones | **Overview** tab |
| Quality checks, compliance, audit trail, traceability | **Review** tab |
| Submission readiness, package readiness, filing checklist | **Submit** tab |
| Portfolio health, cross-project analytics | **Projects** page (global) |
| Generated report artifacts (audit report, readiness report) | **Artifacts** page (global) + **Work** tab (project) |

---

## 13) UX Governance Rules (Non-Negotiables)

1. **6 global destinations only:** New, Search, Projects, Apps, Artifacts, Setup.
2. **5 project tabs only:** Overview, Work, Vault, Review, Submit.
3. **One shell:** no standalone app experiences for domain teams.
4. **One project experience:** consistent scaffolding across all work.
5. **One document workflow:** regulated path is uniform.
6. **Always-available AnA:** persistent assistant, sole guide.
7. **No competing AI personas:** AnA only. No Dr. Sage in user-facing flows.
8. **Artifacts are governed:** every meaningful output has provenance, versions, and lifecycle.
9. **Apps is a real launcher:** specialist tools live there, not in the global rail.
10. **Calm over comprehensive:** fewer nouns, fewer controls, less competing hierarchy.

---

## 14) Implementation Sequence (Recommended)

### Phase 0 — Audit + Naming Lock
- Lock canonical naming (this document).
- Audit all existing sidebar items and layout modes against the 6+5 model.

### Phase 1 — Shell + Sidebar Restructure
- Rewrite `ZenSidebar.tsx` to 6 global items + Current Project block with 5 tabs.
- Update `ZenApp.tsx` LayoutMode type, onNavigate handler, activeNavId mapping, and render switch.

### Phase 2 — Project Shell Cleanup
- Wire 5 project tabs to renderers: Overview→ProjectHomeDashboard, Work→ProjectWorkspaceShell, Vault→new VaultPage, Review→ReviewReadiness, Submit→SubmissionReadiness.
- Enhance ProjectHomeDashboard with readiness snapshot, recent artifacts, next actions.

### Phase 3 — Global Destination Pages
- Create AppsPage (3 groups, card launcher, project-aware launch behavior).
- Create ArtifactsPage (cross-project browser with status filters).
- Create SetupPage (extracted from ZenSettings modal content).

### Phase 4 — Naming + Route Reconciliation
- Clean up LayoutMode union to ~20 canonical modes + compatibility redirects.
- Update all activeNavId mappings.
- Remove dead PlatformHome module cards referencing demoted destinations.

### Phase 5 — Onboarding / First-Run Rewrite
- Rewrite FirstRunExperience.tsx to 7-step human-first flow.
- Remove Dr. Sage introduction. AnA is sole guide from Step 1.
- Add track-specific first-output suggestions.

### Phase 6 — Polish + Validation
- End-to-end navigation testing for all persona swim lanes.
- Backward compatibility for saved URLs and demoted layout modes.
- Screenshot proof collection.

---

## 15) Success Criteria

### IA Clarity
- Fixed 6-node global nav (down from 8+ mixed items).
- Fixed 5-node project nav (down from 8 tabs + workflow group).
- No route leads to a dead end.

### Workflow Quality
- First-time user reaches first output within 5 minutes of sign-in.
- App launch → governed artifact creation works for all 6 SubmissionAppsPanel apps.
- Review → Submit pipeline works end-to-end.

### Experience
- AnA is reachable from every screen.
- Search finds projects, artifacts, files, apps, and chats.
- No user ever needs to understand internal architecture to do their work.
