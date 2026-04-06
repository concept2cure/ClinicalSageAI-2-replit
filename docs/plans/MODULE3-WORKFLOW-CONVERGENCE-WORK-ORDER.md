# Module 3 Workflow Work Order — Shared Project / Shared Editor / Shared AnA

## Objective

Perfect the Module 3 workflow **inside the existing shared Concept2Cure tools** so a client can:

1. upload source documents into the project,
2. classify them by dossier/module/section/type/tags,
3. use either uploaded source documents **or** structured CMC module data,
4. generate and continuously refresh Module 3 subsection content,
5. view the live build of Module 3 from the **existing** dossier tree, editor, and AnA/chat canvas,
6. review governed artifacts with provenance, versioning, contradictions, and readiness,
7. test the full sequence end to end without new workflow sprawl.

This work order is **Module 3 first**, but the pattern must be reusable for Modules 1, 2, 4, and 5 later.

---

## Non-Negotiable Constraints

- **No new Module 3 screen, app, route universe, or parallel workspace.**
- Use the **existing shared project upload, workspace shell, dossier tree, editor, inspector panels, and AnA chat system**.
- Module 3 must behave as a **shared dossier workflow**, not as a separate product.
- Uploaded source docs and CMC entered data must converge into **one reusable source layer**.
- Compile/build results must end as **governed artifacts in the existing editor**.
- AnA must invoke the **same underlying pipeline** as the workspace/editor flow.
- Build state must be visible in the **existing dossier/workspace/editor context**, not another dashboard.

---

## Repo Truth We Are Building On

Already present in the repo:

- Shared CTD hierarchy and Module 3 section structure
- Shared project workspace shell with dossier navigation and artifact placement
- Shared governed editor with provenance, compare, audit, review, signatures, import/export
- Generic Data Room / project file intake
- Module 3 backend source-object, compile, provenance, contradiction, readiness, and approval routes
- AnA governed artifact generation and chat-first orchestration model

Missing or incomplete:

- Dossier-aware upload classification at intake
- Convergence of uploaded files and Module 3 source-object normalization
- Live build-state in dossier/workspace for Module 3 sections
- Full subsection coverage and strong prose/tables across Module 3
- Automatic governed artifact creation/update from Module 3 compile results
- First-class AnA orchestration for Module 3 build/refresh/open flows
- End-to-end seeded QA proof for this exact workflow

---

## What the User Workflow Must Become

### Step 1 — Project Upload
Client uploads a file into the project from the existing project/data-room/document flow.

At upload time, the file can be classified by:
- submission track: IND / NDA / BLA / 510(k) / PMA / SOP / CER / General
- dossier module: 1 / 2 / 3 / 4 / 5
- optional CTD section: e.g. 3.2.S.2, 3.2.P.5
- source type: specification, method, stability, batch, comparability, manufacturing narrative, SOP, reference standard, etc.
- free tags
- whether it should feed Module 3 source extraction/build

### Step 2 — Source Normalization
The uploaded file remains a governed project artifact **and** can be normalized into Module 3 source inputs.

Two source classes must converge:
- uploaded project source documents
- structured CMC app/module data

Both must feed a common Module 3 source layer.

### Step 3 — Live Module 3 Build
When the user is working on Module 3 inside the existing editor or via AnA/chat:
- they can see which subsections have enough data to build,
- which subsections are missing inputs,
- which subsections are stale,
- which subsections have contradictions,
- which subsections have generated tables,
- which subsections have generated prose,
- and they can open the governed subsection artifact in the shared editor.

### Step 4 — Refresh / Review / Approve
As source docs or CMC data change:
- impacted Module 3 subsections go stale,
- refresh actions rebuild affected content,
- contradictions are surfaced,
- governed artifacts can be reviewed, compared, approved, locked, and exported.

### Step 5 — AnA Uses the Same Flow
AnA can:
- build Module 3 from current project sources,
- show missing inputs for a subsection,
- refresh a subsection from updated sources,
- compare uploaded source docs with CMC entered data,
- open the governed subsection artifact in the editor,
- propose next build actions.

No duplicate flow. Same pipeline.

---

## Build Phases

## Phase 1 — Dossier-Aware Upload Classification

### Build
Extend the existing project/Data Room upload flow so uploaded artifacts can persist:
- `submissionTrack`
- `moduleCode`
- `ctdSection`
- `documentFamily`
- `sourceType`
- `tags`
- `feedsModule3`
- `sourceProcessingMode` (`artifact_only` | `artifact_plus_source_object`)

### Required behavior
- User can upload a file and align it to Module 3 or another module from the same shared flow.
- Module 3 relevant uploads can be tagged for source extraction.
- Non-Module 3 uploads still work in the same flow for future Modules 1/2/4/5 reuse.

### Likely impacted areas
- project artifact upload endpoint(s)
- Data Room upload UI and metadata capture
- artifact metadata schema / persistence
- dossier placement helpers

### Acceptance
- A file can be uploaded and correctly classified to `3.2.S.4` or `3.2.P.8` from the existing workflow.
- Classification survives reload, appears in artifact metadata, and is visible in shared project context.

---

## Phase 2 — Converge Uploaded Docs and CMC Data Into One Source Layer

### Build
Create a canonical convergence layer where Module 3 source inputs can come from:
- uploaded source documents,
- CMC module structured entries,
- or both.

### Required behavior
- Uploaded files that are marked as Module 3 sources can be mapped into the existing `cmc_source_objects` model.
- CMC structured records can be used directly without duplicating logic.
- The system preserves lineage:
  - uploaded artifact → extracted source object
  - CMC record → source object
  - source object → compiled subsection
  - compiled subsection → governed artifact/version

### Acceptance
- A user can upload a specification document and also maintain structured CMC data.
- Both can contribute to the same subsection build.
- Lineage is preserved and inspectable.

---

## Phase 3 — Real Module 3 Build-State in Shared Dossier / Workspace

### Build
Extend the existing dossier/workspace state to show Module 3 build truth, not just artifact placement truth.

### Required subsection states
- `empty`
- `sources_present`
- `source_extraction_pending`
- `source_extracted`
- `compiled`
- `draft_ready`
- `stale`
- `contradiction_flagged`
- `review`
- `approved`
- `locked`

### Required behavior
- Module 3 sections in the shared dossier tree show actual build readiness.
- Build state reflects both uploaded docs and CMC data.
- Stale or contradiction states are visible without leaving the shared workspace.

### Acceptance
- A tester can look at Module 3 in the shared dossier tree and immediately know what is buildable, missing, stale, or blocked.

---

## Phase 4 — Expand Module 3 Composition to Full Working Spine

### Build
Expand composition beyond the current thin subset.

### Minimum coverage
Support a strong working implementation for:
- `3.2.S.1` through `3.2.S.7`
- `3.2.P.1` through `3.2.P.8`
- `3.1` and `3.3` as structural/governed support artifacts

### For each subsection, define:
- required input types
- extracted fields
- completeness logic
- missing input diagnostics
- structured output schema
- table generation rules
- prose generation rules
- lineage expectations

### Acceptance
- Each major Module 3 subsection can be built from real sources.
- The build produces useful tables + useful prose, not placeholders.

---

## Phase 5 — Compile Results Must Become Shared Governed Artifacts

### Build
Every compiled/refreshed Module 3 subsection must create or update the same governed artifact system already used by the editor.

### Required behavior
- compile result creates artifact if missing
- compile result updates artifact/version if existing
- artifact is placed into correct CTD section
- artifact opens in the shared editor
- provenance / compare / review / signatures / export all work as normal

### Acceptance
- No compile result is trapped in backend-only tables.
- Every usable output becomes a governed document in the existing editor.

---

## Phase 6 — Live Build Experience Inside Existing Editor / Canvas / AnA

### Build
Inside the existing editor and chat/canvas flow, expose:
- generated prose
- generated tables
- contributing uploaded source documents
- contributing CMC records
- missing fields
- stale indicators
- contradiction indicators
- refresh actions
- open-related-section actions

### Required behavior
A user editing `3.2.P.5` can:
- inspect current build provenance,
- pull latest source updates,
- rebuild section tables/prose,
- see what is missing,
- compare prior version,
- stay in the same editor.

### Acceptance
- The editor is the working surface for Module 3, not a detached viewer.

---

## Phase 7 — AnA First-Class Module 3 Orchestration

### Build
Add Module 3-specific AnA prompts/commands/enrichments using the existing chat-first model.

### Minimum user actions
- build Module 3 from current project sources
- show missing inputs for `3.2.S.2`
- refresh `3.2.P.5` from latest specs
- compare CMC app data to uploaded source docs for `3.2.P.3`
- draft stale sections
- open subsection artifact in editor

### Required behavior
- AnA triggers the same underlying pipeline as the workspace/editor flow
- results end in governed artifacts and editor navigation
- no second AI workflow

### Acceptance
- A user can drive Module 3 from chat without leaving the shared system.

---

## Phase 8 — End-to-End QA Proof

### Seed one realistic project with:
- drug substance inputs
- drug product inputs
- specification document(s)
- analytical method document(s)
- stability report(s)
- batch/change/comparability content
- CMC module structured entries

### Required test journey
1. Upload and classify source docs by module/section/type/tags
2. Normalize selected uploads into Module 3 source objects
3. Confirm Module 3 dossier tree reflects build state
4. Build `3.2.S.*` and `3.2.P.*` subsections
5. Open subsection artifacts in editor
6. See tables + prose + lineage
7. Change a source and confirm stale propagation
8. Refresh affected subsection
9. Detect contradiction
10. Resolve contradiction
11. Approve subsection
12. Pass export guard for valid content

### Acceptance
- QA can execute this path without manual DB patching, route guessing, or hidden admin tricks.

---

## Explicit Non-Goals

- No separate Module 3 app
- No new dashboard-first workflow
- No bypass around governed artifacts
- No Module 3-only editor
- No special-case UI that will be thrown away when Modules 1/2/4/5 follow

---

## Definition of Done

Module 3 is "ready to test" only when:

- upload is dossier-aware in the shared project flow,
- uploaded docs and CMC data converge into one source layer,
- Module 3 build state is visible in the shared dossier/workspace,
- subsections can generate tables and prose from real sources,
- compile results become governed artifacts in the existing editor,
- AnA drives the same workflow,
- one seeded project proves the end-to-end path.

---

## Build Notes for Future Reuse Across Modules 1–5

The architecture built here must be generalized later:
- intake classification must work for all module families,
- source normalization pattern must be reusable,
- build-state model must be extensible beyond Module 3,
- governed artifact convergence must remain universal,
- AnA orchestration pattern must stay shared.

Module 3 is the proving ground. Do it once, correctly, in the shared system.
