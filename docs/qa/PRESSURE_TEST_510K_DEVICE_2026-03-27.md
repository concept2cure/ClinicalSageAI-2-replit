# Pressure Test: 510(k) Device Workflow — End-to-End Code Audit

**Date**: 2026-03-27
**Persona**: Marcus Wright, Senior Regulatory Engineer — cardiac monitoring device 510(k) submission
**Method**: Full code trace through actual source files (no runtime)

---

## STEP 1: Create a 510(k) Project

### Can I select "510K"? Is it marked as primary (not early access)?

**WORKS**

File: `client/src/concept2cure/components/sidebar/NewProjectModal.tsx`, lines 58-146

510K is the **first item** in the `submissionTypes` array and has **no `earlyAccess` flag**, making it a first-class, production-grade submission type. The card reads:

- **Name**: 510(k)
- **Full Name**: Premarket Notification
- **Description**: "Medical device clearance demonstrating substantial equivalence"
- **Icon**: FileText (blue)

Other device types also present: PMA (no earlyAccess), De Novo (no earlyAccess), EU IVDR (no earlyAccess). EUA is marked earlyAccess. Pharma types (IND, NDA, BLA, MAA) are all earlyAccess.

### After creation, where do I land?

**PARTIAL** — Project is created but metadata is discarded

File: `NewProjectModal.tsx`, lines 209-230 and `ProjectContext.tsx`, lines 328-358

The modal collects **Sponsor**, **Target Agency**, **Target Date**, and **Custom Instructions** (lines 371-454), but `handleCreate()` only passes `(name, type, description)` to `createProject()`. The four extra fields are **silently discarded** — never sent to the context or backend.

After creation, the success screen shows 4 suggested action chips (Start Dossier Map, Add Documents, Run Readiness Check, Find Predicates), all of which just call `handleOpenProject()` which fires `onProjectCreated(id, type)`.

In `ProjectsSidebar.tsx` (line 618), `onProjectCreated` calls `setActiveProject(projectId)` — this sets the active project but does **not** navigate to the 510k workspace or project home. The user lands on whatever layout mode was already active.

| Sub-step | Verdict |
|---|---|
| 510K selectable and primary | WORKS |
| Sponsor / Agency / Date / Instructions persisted | BROKEN — collected in UI but never passed to createProject() |
| Post-creation navigation to workspace | PARTIAL — project activated but no explicit workspace redirect |

---

## STEP 2: Open 510(k) Workspace

### What is EmbeddedCERV2Page?

**WORKS** (structurally)

File: `client/src/concept2cure/ZenApp.tsx`, line 64 and lines 2316-2340

`EmbeddedCERV2Page` is a lazy-loaded wrapper around `CERV2Page.jsx`. When the URL matches `/project/:id/510k`, the shell detects `embeddedModule === '510k'` (line 2316) and renders:

```jsx
<EmbeddedCERV2Page embedded={true} projectId={urlProjectId} />
```

This is a full-featured module embedded in the Concept2Cure shell, not a standalone page.

### Does CERV2Page show 510(k)-specific sections?

**WORKS**

File: `shared/docTypes.ts`, lines 4-19 — The `cerv2_510k` config defines 8 sections:

| # | Section ID | Title | Required |
|---|---|---|---|
| 1 | admin | Administrative Information | Yes |
| 2 | ifu | Indications for Use | Yes |
| 3 | desc | Device Description | Yes |
| 4 | pred | Predicate Devices | Yes |
| 5 | se | Substantial Equivalence Discussion | Yes |
| 6 | testing | Performance Testing (Bench/Clinical) | No |
| 7 | labeling | Labeling | No |
| 8 | concl | Conclusion | No |

File: `CERV2Page.jsx`, lines 369-393 — The 510k track has a 7-stage workflow:
Setup -> Strategy -> Evidence Plan -> Evidence -> Author -> eSTAR & RTA -> Submit & AI

File: `CERV2Page.jsx`, line 529 — Default doc type resolves to `cerv2_510k` when no explicit type is set.

The CERV2Page also imports 510k-specific components (lines 19-51): EquivalenceBuilderPanel, ComplianceCheckPanel, LiteratureVisualizationPanel, ESTARBuilderPanel, PredicateFinderPanel, WorkflowPanel, RTAChecklistPanel, FDATimelineTracker, etc.

| Sub-step | Verdict |
|---|---|
| Embedded 510k module in shell | WORKS |
| 510k section structure (8 sections) | WORKS |
| 510k-specific components loaded | WORKS |
| 7-stage gated workflow | WORKS |

---

## STEP 3: Generate 510(k) Sections

### Can AI generate section content?

**WORKS**

File: `server/routes/cerv2-ai-routes.ts`, lines 266-354

The `POST /api/cerv2/ai/suggest` endpoint:
1. Validates `docType` is one of `cerv2_510k`, `cerv2_pma`, `cerv2_cer`
2. Builds a RAG query using device name, predicate, indication
3. Calls `generateWithRAG()` which:
   - Injects client/project intelligence via `getIntelligencePrefix()`
   - Retrieves context from RAG (biotech RAG service, hybrid search, top-5 results)
   - Routes through AI Gateway (Claude primary, OpenAI fallback) with `taskType: 'document_drafting'`
   - Falls back to **section-specific templates** if AI fails
4. Templates exist for all 8 510(k) sections plus aliases (lines 104-134): admin, cover_letter, ifu, summary, desc, device_description, pred, predicate_comparison, se, se_discussion, testing, performance_testing, labeling, concl, conclusion
5. Template placeholders ([DEVICE NAME], [PREDICATE DEVICE], etc.) are replaced with context values

Rate limited: 20 AI requests/minute per user+org.

### Does generated content become a governed artifact?

**PARTIAL** — Only at export time, not at generation time

The `/suggest` endpoint returns JSON with `{ suggestion, source, ragSources }`. The suggestion text is inserted into the editor client-side. It does **not** create a governed artifact at the point of generation.

Governed artifact creation happens **only at export** (see Step 5). There is no intermediate "save as draft artifact" step from the suggest flow.

| Sub-step | Verdict |
|---|---|
| AI section generation via /suggest | WORKS |
| RAG augmentation | WORKS |
| Template fallback per section | WORKS |
| Generation creates governed artifact | PARTIAL — only at export, not at generation |

---

## STEP 4: Predicate Comparison

### Is there a predicate comparison tool?

**WORKS**

Client-side 510(k) predicate components (all in `client/src/components/510k/`):
- `PredicateFinderPanel.jsx` — search and find predicate devices (uses FDA510kService)
- `PredicateAnalysis.jsx` — analyze predicate suitability
- `PredicateComparison.jsx` — side-by-side comparison
- `PredicateSearch.jsx` — search interface
- `EquivalenceBuilderPanel.jsx` — build SE comparison table
- `EquivalenceTable.jsx` — structured equivalence matrix
- `EnhancedEquivalenceComparison.jsx` — enhanced comparison view
- `EquivalenceDraft.jsx` — draft equivalence narrative

Additional predicate components in `client/src/components/predicate/`:
- `SEMatrixV2Panel.tsx` — substantial equivalence matrix panel
- `DefensePacketPanel.tsx` — predicate defense packet
- `PredicateRadarPlot.tsx` — radar chart comparison
- `LineageGraphPanel.tsx` — predicate lineage visualization
- `ProofStrip.tsx` — predicate proof strip
- `DownloadVerifyPanel.tsx` — download and verification

Also: `client/src/pages/csr/PredicateIntelligence.tsx` — dedicated predicate intelligence page.

### Does the /equivalence AI endpoint work?

**WORKS**

File: `server/routes/cerv2-ai-routes.ts`, lines 356-446

`POST /api/cerv2/ai/equivalence` accepts:
- `deviceName` (required)
- `predicateDevice` (required)
- `predicateK` (optional)
- `similarities[]` (optional)
- `differences[]` (optional)

Generation flow:
1. Builds an expert system prompt citing FDA guidance "The 510(k) Program: Evaluating Substantial Equivalence"
2. Structures output as: Intended Use Comparison, Technological Characteristics Comparison, Differences Analysis, Performance Data Summary, Conclusion
3. Routes through AI Gateway (Claude primary) with RAG augmentation
4. Falls back to structured template with dynamic text assembly if AI fails

The template fallback produces a complete SE determination document with all 5 sections filled in from provided similarities/differences.

| Sub-step | Verdict |
|---|---|
| Predicate finder UI | WORKS |
| SE comparison tools | WORKS |
| /equivalence AI endpoint | WORKS |
| Template fallback for SE | WORKS |

---

## STEP 5: Export Submission Package

### Can I export PDF/DOCX/ZIP for 510(k)?

**WORKS**

File: `server/routes/cerv2-export-routes.ts`

Three governed export routes, all with auth + role check + rate limiting:

| Route | Format | Governed | Lines |
|---|---|---|---|
| POST /api/cerv2/export/pdf | Combined PDF | Yes | 247-310 |
| POST /api/cerv2/export/docx | Combined DOCX | Yes | 313-376 |
| POST /api/cerv2/export/zip | Full submission pack | Yes | 379-440 |

**ZIP contents for 510(k)** (lines 190-197):
1. `01_CoverLetter.pdf`
2. `02_510kSummary.pdf`
3. `03_DeviceDescription.pdf`
4. `04_SE_Discussion.pdf`
5. `05_PerformanceTesting.pdf`
6. `06_Labeling.pdf`
7. `{title}_Combined.pdf` (full document)
8. `{title}_Combined.docx` (full document)
9. `attachments/` folder (user uploads, up to 20 files, 10MB each)

### What style pack is used?

**WORKS**

File: `server/export/stylePacks/config.ts`, lines 13-15

```
'510k_v1': { html: '510k_v1.html', css: 'print.css' }
```

### Does export create a governed submission snapshot?

**WORKS** — Full 5-record governance chain

File: `server/services/export/governedExportConsequence.ts` and `server/services/compute/artifactWriteback.ts`

Every export calls `createGovernedExportConsequence()` which calls `registerArtifactWithGovernance()`. This creates **5 database records in a single transaction** (lines 42-140 of artifactWriteback.ts):

| # | Table | Purpose |
|---|---|---|
| 1 | `concept2cure_artifacts` | Artifact record with content_hash, CTD placement, metadata |
| 2 | `concept2cure_artifact_versions` | Version 1 snapshot with full content |
| 3 | `concept2cure_provenance_events` | Provenance event (actor, source, timestamp) |
| 4 | `regulatory_audit_logs` | GxP-relevant audit log (21 CFR Part 11 compliant) |
| 5 | GovernedExportConsequence response | Base64 binary output + placement state returned to client |

Additional governance: Export requires human review approval in production (`shouldEnforceExportReviewGate()`, line 115-118 of cerv2-export-routes.ts). Governance headers are applied: `X-Concept2Cure-AI-Generated`, `X-Concept2Cure-Human-Review-Approved`, `X-Concept2Cure-Governance-Persistence`.

CTD placement for 510(k): `m1.5` / "Module 1 / 510(k) dossier package" (line 156).

| Sub-step | Verdict |
|---|---|
| PDF export | WORKS |
| DOCX export | WORKS |
| ZIP submission package | WORKS |
| 510k_v1 style pack | WORKS |
| 5-record governed chain | WORKS |
| Human review gate (production) | WORKS |
| CTD placement tagging | WORKS |

---

## STEP 6: Tools Workbench

### Are the right apps shown for a 510K project?

**WORKS**

File: `client/src/concept2cure/pages/AppsPage.tsx`, lines 36-55

Apps are organized into groups with track-aware filtering:

**Strategy & Evidence** (shown for all tracks):
- Deep Research (all tracks)
- Precedent Intelligence (all tracks)

**Builders** (track-filtered):
- 510(k) Workspace — tracks: `['510K', 'DE_NOVO']` — **shown first for 510K**
- PMA Workspace — tracks: `['PMA']`
- CER Generator — tracks: `['IVDR', ...DEVICE_TYPES]`
- Safety Narrative — tracks: `[...PHARMA_TYPES, 'PMA']`

**Specialist Studios**:
- Biostatistics — tracks: `[...PHARMA_TYPES, 'PMA']`

### Does track-aware sorting work?

**WORKS**

File: `AppsPage.tsx`, lines 72-79

The `sortByRelevance()` function sorts apps by whether their `tracks` array includes the current `submissionType`. For a 510K project, the Builders tab shows:
1. **510(k) Workspace** (matches 510K) — sorted to top
2. **CER Generator** (matches DEVICE_TYPES which includes 510K) — second
3. **PMA Workspace** (no match) — pushed down
4. **Safety Narrative** (no match) — pushed down

The `submissionType` prop is passed from ZenApp, so sorting is live and project-aware.

| Sub-step | Verdict |
|---|---|
| 510(k) Workspace app card exists | WORKS |
| Track-aware sorting | WORKS |
| Apps disabled without project | WORKS |
| Pharma-irrelevant apps deprioritized | WORKS |

---

## Summary Scorecard

| Step | Component | Verdict | Key File(s) |
|---|---|---|---|
| 1a | 510K selectable, primary | **WORKS** | NewProjectModal.tsx:58-66 |
| 1b | Sponsor/Agency/Date/Instructions persisted | **BROKEN** | NewProjectModal.tsx:215-218 — fields collected but not passed to createProject() |
| 1c | Post-creation navigation | **PARTIAL** | ProjectsSidebar.tsx:618 — project activated but no workspace redirect |
| 2a | Embedded 510k module | **WORKS** | ZenApp.tsx:2316-2340 |
| 2b | 510k-specific sections (8 sections) | **WORKS** | shared/docTypes.ts:4-19 |
| 2c | 7-stage gated workflow | **WORKS** | CERV2Page.jsx:369-393 |
| 3a | AI section generation | **WORKS** | cerv2-ai-routes.ts:266-354 |
| 3b | RAG + AI Gateway + template fallback | **WORKS** | cerv2-ai-routes.ts:198-264 |
| 3c | Generation creates governed artifact | **PARTIAL** | Only at export, not at generation time |
| 4a | Predicate finder tools | **WORKS** | client/src/components/510k/PredicateFinderPanel.jsx + 10 more |
| 4b | /equivalence AI endpoint | **WORKS** | cerv2-ai-routes.ts:356-446 |
| 5a | PDF/DOCX/ZIP export | **WORKS** | cerv2-export-routes.ts:247-440 |
| 5b | 510k_v1 style pack | **WORKS** | server/export/stylePacks/config.ts:13-15 |
| 5c | 5-record governed chain | **WORKS** | governedExportConsequence.ts + artifactWriteback.ts |
| 5d | Human review gate | **WORKS** | cerv2-export-routes.ts:115-118 |
| 6a | 510(k) Workspace in Apps | **WORKS** | AppsPage.tsx:47 |
| 6b | Track-aware sorting | **WORKS** | AppsPage.tsx:72-79 |

### Overall: 14/17 WORKS, 2 PARTIAL, 1 BROKEN

---

## Defects to Fix

### BROKEN: Sponsor, Target Agency, Target Date, Custom Instructions not persisted (P1)

**File**: `client/src/concept2cure/components/sidebar/NewProjectModal.tsx`
**Lines**: 209-218

The modal has state for `sponsor`, `targetAgency`, `targetDate`, `customInstructions` (lines 193-195) and renders input fields for all four (lines 373-454). But `handleCreate()` only calls `createProject(projectName, selectedType, projectDescription)` — the four additional fields are silently lost.

**Impact**: A regulatory engineer entering their sponsor name, FDA as target agency, submission deadline, and project-specific instructions will lose all of it. Custom instructions are especially critical because they "are injected into every conversation in this project" (per the modal's own description on line 451).

**Fix needed**: Extend `createProject()` signature in `ProjectContext.tsx` to accept metadata object, and persist sponsor/agency/date/instructions to the project record.

### PARTIAL: No navigation to workspace after project creation (P2)

**File**: `client/src/concept2cure/components/sidebar/ProjectsSidebar.tsx`, line 618
**File**: `client/src/concept2cure/components/sidebar/NewProjectModal.tsx`, line 233

After creation, `onProjectCreated` sets the active project but does not change layout mode or navigate to the project home/workspace. The user sees the success screen, clicks "Open Project Workspace", and... stays on whatever page they were on. They must manually navigate.

### PARTIAL: AI-generated content not tracked as governed artifact until export (P3)

**File**: `server/routes/cerv2-ai-routes.ts`, `/suggest` endpoint

Generated content is returned as raw JSON and inserted into the TipTap editor client-side. There is no artifact record, no provenance event, and no audit trail until the user explicitly exports. For 21 CFR Part 11 compliance, every AI generation event should create at minimum a provenance event (not necessarily a full artifact) so that the AI-generated vs. human-authored lineage is traceable.

---

*Report generated by code audit — no runtime testing performed.*
