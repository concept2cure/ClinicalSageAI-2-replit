# Concept2Cure Canonical UI Information Architecture & Shell Specification

**Status:** Canonical draft for implementation  
**Date:** 2026-03-26  
**Owners:** UX Architecture, Solution Design, Platform Product

---

## 1) Product Operating Model (North Star)

Concept2Cure uses a **Claude-style project operating model** implemented as one governed enterprise OS:

- **One universal application shell** (not module sprawl).
- **One project experience** for all domain work.
- **One document studio** as the center of regulated execution.
- **Specialist workbenches as modes** inside projects (not standalone apps).
- **Always-on Vault** for evidence retrieval and traceability.
- **Always-available AnA composer** for guided actions and reasoning.
- **First-class reports layer** at global and project scope.

Primary workflow chain:

**Project -> Document -> Evidence -> Review -> Report/Export/Submit**

---

## 2) Canonical Information Architecture

### Level 1: Global OS Navigation

Global navigation is fixed to the following destinations:

1. **AnA Home**
2. **Projects**
3. **Vault**
4. **Documents**
5. **Reports**
6. **Reviews**
7. **Submission**
8. **Admin**

#### Global IA Rules

- Do not introduce additional top-level app destinations for specialist domains.
- Global destinations represent enterprise operating concerns, not team silos.
- Reports is a top-level OS layer and cannot be hidden under analytics/settings.

### Level 2: Inside a Project

Project workspace uses the following fixed sub-navigation:

1. **Overview**
2. **Documents**
3. **Vault / Evidence**
4. **Reports**
5. **Tasks**
6. **Reviews**
7. **Submission**
8. **Activity**

#### Project IA Rules

- Project context is persistent and visible in header + breadcrumbs.
- All project functions are reachable without leaving the project shell.
- Specialist modes inherit this project IA; they do not fork navigation.

### Level 3: Inside a Document

Document Studio uses the following fixed tabs:

1. **Content**
2. **Evidence**
3. **Versions**
4. **Review**
5. **Signatures**
6. **Provenance**
7. **Export**

#### Document IA Rules

- Document is the regulated execution unit.
- Evidence, provenance, and signatures are first-class tabs (not hidden drawers).
- Review and export stay in-document to preserve context continuity.

### Level 4: Specialist Modes (Project-Scoped Workbenches)

Specialist modes are project modes that reuse the same shell and primitives:

- **CMC**
- **Biostats**
- **Device / Diagnostics**
- **Clinical / Safety**
- **Submission Readiness**

#### Specialist Mode Rules

- Modes are tuned views/workbenches within project context.
- Modes cannot create independent global nav stacks.
- Mode switching preserves the same project, vault, review, and submission pipeline.

---

## 3) Persistent UX Primitives (Always On)

The following controls and context markers remain accessible on every major screen:

1. **AnA composer**
2. **Vault drawer**
3. **Current project identity**
4. **Current document / current artifact deep link**
5. **Global search / command bar**
6. **Reports access**
7. **Review status**
8. **Quick return to AnA Home**

### Persistence Contract

- If a screen cannot host these primitives, that screen is non-canonical and must be redesigned.
- Persistent primitives are platform-level affordances, not page-level components.
- Layout can adapt by viewport, but access parity must be maintained across desktop/tablet.

---

## 4) Universal Shell Blueprint

### Shell Regions

- **Top bar:** project identity, document/artifact context, search/command bar, review status, quick actions.
- **Left rail:** level-appropriate navigation (global or project/document).
- **Main canvas:** active workflow surface (overview, editor, reports, reviews, etc.).
- **Right utility rail / drawer stack:** AnA composer, Vault drawer, contextual assistants.
- **Footer status strip (optional):** sync state, policy environment, audit heartbeat.

### Shell Behavior

- Context must survive route changes (project + document + mode memory).
- Command bar supports object jump, actions, and cross-level navigation.
- Vault and AnA can be invoked from keyboard + click from every major screen.

---

## 5) Navigation and State Model

### Canonical Context Stack

Every routed screen carries:

- `org_id`
- `project_id` (optional at global level)
- `document_id` (optional outside document studio)
- `artifact_id` (optional)
- `mode` (default/general or specialist mode)

### Routing Principles

- Routes are hierarchical and human-readable.
- Deep links must open with preserved shell context.
- Breadcrumbs must reflect IA levels, not technical entities.

Illustrative route pattern:

- `/home`
- `/projects/:projectId/overview`
- `/projects/:projectId/documents/:documentId/content`
- `/projects/:projectId/reports`
- `/projects/:projectId/modes/cmc`

---

## 6) Governed Document Core Requirements

The document core is the center of operating model execution and must provide:

- Structured content model with section-level identity.
- Evidence binding model (claims -> sources -> confidence/provenance).
- Version lineage and diff visibility.
- Review workflows with role/state governance.
- Signature support with compliant audit events.
- Export profiles aligned to submission requirements.

---

## 7) Vault Interaction Model

Vault is not a destination-only module; it is an omnipresent system utility.

### Vault Capabilities

- Retrieve evidence by query, facet, and provenance metadata.
- Link/unlink evidence to document claims in-context.
- Show recency, source trust level, and usage history.
- Surface evidence gaps and stale evidence warnings.

### Vault UX Rules

- Drawer opens without route interruption.
- Selected evidence can be inserted into current document context.
- Vault actions generate traceable activity events.

---

## 8) Reports as First-Class OS Layer

Reports exist at both global and project levels:

- **Global reports:** portfolio health, submission cadence, review SLA, audit readiness.
- **Project reports:** document maturity, evidence coverage, review cycle time, submission readiness.

### Reporting Rules

- Reports are navigable from persistent shell affordance and IA nodes.
- Reports support drill-down to project/document/evidence entities.
- Report snapshots are exportable and traceable.

---

## 9) Review and Submission Pipeline Model

Single pipeline model across all modes:

1. Authoring/updates in Document Studio.
2. Evidence linkage/validation via Vault.
3. Review orchestration with assigned roles and status gates.
4. Report generation for readiness and audit transparency.
5. Export + Submission package finalization.

### Pipeline Integrity Rules

- No specialist mode can bypass review or provenance requirements.
- Submission state must be computable from document/review/evidence state.
- Review status is always visible from shell-level persistence.

---

## 10) Role Lens and Work Allocation

The same shell supports multiple lenses without IA divergence:

- **Executive lens:** portfolio and readiness summaries.
- **Program lead lens:** project tasks, reviews, milestone risk.
- **Author/reviewer lens:** document editing, evidence validation, sign-off.
- **Specialist lens:** mode-specific workbench tools within shared shell.

Role lenses adjust default landing views and widgets, not the core IA.

---

## 11) UX Governance Rules (Non-Negotiables)

1. **Fewer nouns:** avoid introducing new categories when existing IA nodes suffice.
2. **One shell:** no standalone app experiences for domain teams.
3. **One project experience:** consistent project scaffolding across all work.
4. **One document workflow:** regulated path is uniform.
5. **Always-on Vault:** accessible from every major screen.
6. **Always-available AnA:** persistent assistant interaction model.
7. **Reports first-class:** available globally and per project.

---

## 12) Implementation Sequence (Recommended)

### Phase 1 — Shell Foundation

- Implement persistent shell regions and context stack.
- Add command bar + quick return behavior.
- Ship persistent AnA + Vault entry points.

### Phase 2 — IA Convergence

- Consolidate global/project/document nav to canonical levels.
- Remove duplicate module-level destinations.
- Normalize breadcrumbs and route taxonomy.

### Phase 3 — Document Core Hardening

- Complete evidence/provenance/signature/version tabs.
- Enforce review state model and activity audit hooks.
- Add export profiles aligned to submissions.

### Phase 4 — Specialist Mode Integration

- Introduce mode switcher under project scope.
- Map CMC/Biostats/Device/Clinical/Submission Readiness workbenches.
- Reuse shared shell, review model, and submission pipeline.

### Phase 5 — Reporting Elevation

- Promote reports to first-class global + project layer.
- Add readiness, quality, throughput, and audit report packs.

---

## 13) Success Criteria

### IA Clarity Metrics

- Reduced top-level navigation entropy (fixed 8-node global IA).
- Reduced cross-module bounce rate.
- Improved task completion for project->document->review->submission flows.

### Workflow Quality Metrics

- Higher evidence-link coverage per finalized document.
- Faster review cycle times with lower rework rates.
- Higher first-pass submission readiness scores.

### Platform Experience Metrics

- Higher command-bar and AnA usage from contextual workflows.
- Consistent Vault usage across modes.
- Lower navigation confusion in user testing.

---

## 14) Canonical Team Message

Concept2Cure will operate as a unified enterprise OS with a governed document core, persistent Vault, and first-class reporting.

We will avoid module sprawl and instead deliver one shell, one project experience, one document workflow, and project-scoped specialist workbenches.

Our default flow is:

**Project -> Document -> Evidence -> Review -> Report/Export/Submit**

This is the canonical IA and shell model to guide all UX and solution architecture decisions going forward.
