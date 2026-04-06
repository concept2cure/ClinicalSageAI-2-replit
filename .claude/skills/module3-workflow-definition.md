# Skill: Module 3 Workflow Definition — Shared Dossier Workflow, No New Screens

## Description

Use this skill when designing, modifying, or auditing the Module 3 workflow in Concept2Cure.

Module 3 is **not** a separate app, page family, or workflow universe. It is a **shared dossier workflow** that uses the same project system, workspace shell, dossier tree, governed editor, artifact model, inspector surfaces, and AnA chat system used across Modules 1–5.

This skill exists to prevent Module 3 from becoming a sprawl engine.

---

## Activation

Activate this skill when:
- modifying Module 3 / CMC workflow behavior
- changing project upload behavior for source documents
- changing artifact intake, tagging, or dossier placement
- modifying Data Room / project file handling
- wiring CMC structured data into dossier authoring
- modifying Module 3 compose/build logic
- exposing Module 3 capabilities through AnA
- designing "live build" behavior for Module 3 sections
- building reusable patterns that will later apply to Modules 1–5

---

## Core Principle

**Module 3 uses the same tools as the rest of the platform.**

That means:
- same project
- same upload system
- same dossier tree
- same artifact model
- same governed editor
- same provenance and version system
- same review and approval flow
- same AnA chat-first orchestration

Only the **source context**, **section logic**, and **generation rules** are specialized.

---

## Non-Negotiable Rules

### 1. No New Module 3 Workflow Surface
Forbidden:
- a separate Module 3 app
- a separate Module 3 document editor
- a separate Module 3 dashboard-first workflow
- a duplicate CMC authoring surface outside the shared workspace
- a second artifact universe for Module 3 outputs

Allowed:
- extending the existing shared project upload flow
- extending the existing dossier tree and section-state model
- extending the existing editor panels/inspectors/context bars
- extending AnA commands/enrichments
- extending the existing artifact metadata and build-state logic

### 2. Upload Happens in the Shared Project Flow
Source documents enter through the existing project/Data Room/document system.

Uploads for Module 3 must be classifiable by:
- submission track
- module code
- CTD section
- source type
- document family
- tags
- whether the file should feed Module 3 build/extraction

Do **not** invent a separate Module 3 upload world.

### 3. Uploaded Documents and CMC Data Must Converge
Module 3 has two input classes:
- uploaded source documents
- structured CMC module data

Both must converge into a **single source layer** for Module 3 build behavior.

Do **not** let uploaded docs and structured CMC entries evolve into competing truth systems.

### 4. Live Build Must Use the Shared Dossier / Editor System
When a user works on Module 3:
- the build state appears in the shared dossier/workspace model
- subsection outputs are governed artifacts in the shared editor
- tables and prose are visible in the shared editor/canvas workflow
- provenance and contradictions are inspectable in existing inspector patterns

"Live build" means the user can see Module 3 taking shape **inside the shared workspace**, not on another screen.

### 5. Build Results Must Become Governed Artifacts
Any compiled or generated Module 3 subsection output must:
- create or update a governed artifact
- carry CTD placement
- retain lineage to source inputs
- support compare / review / provenance / signatures / export

Backend-only compiled state is not enough.

### 6. AnA Must Call the Same Underlying Pipeline
AnA is allowed to orchestrate Module 3 build actions, but only by invoking the same shared pipeline that the workspace/editor uses.

Forbidden:
- a special AI-only Module 3 path with different persistence rules
- chat output that does not converge into governed artifacts when the result is document-worthy

Required:
- chat-first triggers
- governed artifact convergence
- same editor open path
- same placement and provenance model

### 7. Build-State Must Be More Than Artifact Status
For Module 3, section state must reflect more than "does an artifact exist?"

A subsection may need to express:
- empty
- sources present
- extraction pending
- extracted
- compiled
- draft ready
- stale
- contradiction flagged
- review
- approved
- locked

Do not reduce Module 3 truth to plain artifact placement status only.

### 8. Design for Module 3 First, Pattern for Modules 1–5 Later
Module 3 is the first perfected version.
But the architecture must be reusable later for Modules 1, 2, 4, and 5.

That means:
- shared intake model
- shared source convergence model
- shared build-state abstraction
- shared artifact convergence model
- shared AnA orchestration pattern

Do not hard-code Module 3 in a way that poisons reuse later.

---

## Canonical User Workflow

### A. Upload / Intake
User uploads a file into the existing project flow.
The system stores the file as a governed project artifact and captures dossier-aware metadata.

### B. Source Alignment
If the artifact is relevant to Module 3, the system can align or normalize it into a Module 3 source representation.
Structured CMC data joins this same source layer.

### C. Build Readiness
The shared dossier/workspace reflects which Module 3 subsections are ready, missing inputs, stale, blocked, or drafted.

### D. Draft / Refresh
The system builds or refreshes subsection tables and prose from:
- uploaded source documents,
- CMC data,
- or both.

### E. Governed Editing
The subsection opens as a governed artifact in the shared editor.
The user can review provenance, compare versions, inspect contradictions, and approve or revise.

### F. AnA Orchestration
The same workflow can be triggered from AnA chat/canvas.
AnA must never send the user into a duplicate workflow world.

---

## Required Behaviors

### Intake behaviors
- Upload classification is dossier-aware
- Metadata survives reloads and placement operations
- Source documents remain visible as governed artifacts

### Convergence behaviors
- Uploaded docs can feed Module 3 source normalization
- Structured CMC data can feed the same subsection build
- Lineage across both sources is preserved

### Build behaviors
- Module 3 subsections can generate real tables and real prose
- Missing-input diagnostics are explicit and actionable
- Source changes can mark subsections stale
- Contradictions can block advancement when appropriate

### Editor behaviors
- Users can inspect build source lineage inside the shared editor workflow
- Users can refresh subsection content from the latest source state
- Users can compare versions and review approval state

### AnA behaviors
- `/cmc`, `/draft`, `/workflow`, or natural-language prompts can drive Module 3 build tasks
- document-worthy outputs become governed artifacts
- navigation lands in the same editor and same artifact context

---

## Anti-Patterns

| Anti-Pattern | What to do instead |
|---|---|
| "Build a separate Module 3 app" | Extend the shared dossier/workspace/editor flow |
| "Put Module 3 on a dedicated dashboard" | Extend section-state in the shared dossier tree and editor inspectors |
| "Treat uploads as generic files only" | Add dossier-aware classification and source-alignment metadata |
| "Treat CMC data and uploaded docs as separate truth systems" | Converge both into one source layer |
| "Keep compile results in backend tables" | Create/update governed artifacts in the editor |
| "Let AnA have a special Module 3 path" | Use the same governed build pipeline AnA and the workspace both call |
| "Optimize only for Module 3" | Build the pattern so Modules 1–5 can follow later |

---

## Module 3 Workflow Checklist

Before shipping a Module 3 workflow change, verify:

- [ ] No new Module 3 workflow surface was introduced
- [ ] Upload stays inside shared project/Data Room/document flow
- [ ] Upload supports dossier-aware classification
- [ ] Uploaded docs can align to Module 3 source processing
- [ ] CMC structured data and uploaded docs converge into one source layer
- [ ] Shared dossier/workspace reflects real Module 3 build state
- [ ] Subsection outputs become governed artifacts in the shared editor
- [ ] Live build includes tables and prose where appropriate
- [ ] Provenance/lineage survives from source to subsection artifact
- [ ] AnA drives the same underlying workflow
- [ ] Nothing added for Module 3 blocks later reuse for Modules 1, 2, 4, or 5

---

## Design Intent for Future Expansion

Module 3 is the proving ground.
Once perfected, the same pattern should later support:
- Module 1 administrative source alignment and artifact generation
- Module 2 summaries built from dossier evidence
- Module 4 nonclinical source normalization and study-report assembly
- Module 5 CSR / study-report-driven live build and authored artifacts

The point is not to make Module 3 special forever.
The point is to define the reusable shared workflow correctly by perfecting Module 3 first.
