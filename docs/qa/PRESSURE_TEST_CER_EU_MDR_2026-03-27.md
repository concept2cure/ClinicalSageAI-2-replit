# Pressure Test: CER (EU MDR Article 61) Workflow

**Persona**: Dr. Katarina Muller, Clinical Evaluation Specialist, European device manufacturer
**Expectation baseline**: Greenlight Guru-style structured CER workflows
**Date**: 2026-03-27
**Tester methodology**: Code-level trace through actual source files

---

## STEP 1: Create a CER/IVDR Project

### Can I select IVDR?

**WORKS**

`NewProjectModal.tsx` (line 137-146) includes IVDR as a selectable submission type:

```
{
  type: 'IVDR',
  name: 'EU IVDR',
  fullName: 'EU In Vitro Diagnostic Regulation',
  description: 'EU IVDR 2017/746 -- Classification, performance evaluation & technical documentation for IVDs',
  icon: Microscope,
  ...
}
```

IVDR is defined in the canonical `SubmissionType` union at `client/src/concept2cure/types/index.ts:90-99`. It is NOT marked as `earlyAccess`, so it presents as a first-class submission type.

### After creation, where do I land?

**PARTIAL** -- Project activates but no auto-navigation to project home.

- `NewProjectModal.tsx` line 233-238: `handleOpenProject` calls `onProjectCreated?.(createdProject.id, createdProject.type)` then closes the modal.
- `ProjectsSidebar.tsx` line 618-621: The callback only calls `setActiveProject(projectId)` -- it sets the active project in context but does NOT navigate to `/concept2cure/project/:id`. The user stays on whatever view they were on. No automatic routing to project home or CER generator occurs.
- The success screen (line 459-498) shows 4 "suggested actions" (Dossier Map, Add Documents, Readiness Check, Find Predicates) but ALL of them just call `handleOpenProject` -- none of them route to their specific feature.

**Gap**: After creating an IVDR project, user must manually navigate. The "Open Project Workspace" button activates the project but does not navigate to the project home view.

**Files**: `client/src/concept2cure/components/sidebar/NewProjectModal.tsx`, `client/src/concept2cure/components/sidebar/ProjectsSidebar.tsx`

---

## STEP 2: Access CER Generator

### How does the CER embedded module work?

**WORKS**

`ZenApp.tsx` line 715: `embeddedModule` is derived from `projectModuleRoutePolicy.shouldRenderInShell`. The route policy at `client/src/concept2cure/router/projectModuleRoutePolicy.ts` line 4 explicitly supports `'cer'` as a module key.

When the URL matches `/concept2cure/project/:id/cer`, the policy sets `module = 'cer'` and `shouldRenderInShell = true`.

`ZenApp.tsx` line 2453: The CER module host renders:

```jsx
{embeddedModule === 'cer' && urlProjectId && (
  <EmbeddedCERV2Page
    embedded={true}
    initialDocumentType="cerv2_cer"
    projectId={urlProjectId}
    onBackToProject={() => navigate(`/concept2cure/project/${urlProjectId}`)}
  />
)}
```

### Does it use CERV2Page with initialDocumentType="cerv2_cer"?

**WORKS**

Yes. `EmbeddedCERV2Page` is lazy-loaded from `@/pages/csr/CERV2Page` (ZenApp.tsx line 64). It receives `initialDocumentType="cerv2_cer"` which configures the page for EU MDR CER mode.

### What sections does CER show?

**WORKS**

`shared/docTypes.ts` lines 37-53 define `cerv2_cer` with 8 sections aligned to MEDDEV 2.7/1 rev. 4:

| Section ID    | Title                                          | Required |
|---------------|------------------------------------------------|----------|
| `sota`        | 1. State of the Art                            | Yes      |
| `device`      | 2. Device/Intended Purpose                     | No       |
| `dataset`     | 3. Clinical Data Set (Literature + Studies)    | Yes      |
| `appraisal`   | 4. Critical Appraisal & Weighting              | Yes      |
| `benefitrisk` | 5. Benefit-Risk Determination                  | Yes      |
| `gspr`        | 6. GSPR Mapping                                | No       |
| `pms`         | 7. PMS Plan / PMCF                             | No       |
| `concl`       | 8. Conclusions & Recommendations               | No       |

These align well with EU MDR Article 61/Annex XIV and MEDDEV 2.7/1 rev. 4 structure.

### How to navigate to CER Generator?

**WORKS**

`ZenApp.tsx` lines 2208-2213 and 2552-2554: When the app panel `'cer-generator'` is selected (from AppsPage), it navigates to `/concept2cure/project/${activeProjectId}/cer`. The CER Generator is also listed in `AppsPage.tsx` line 49 as an available app for IVDR and all device types.

**Files**: `client/src/concept2cure/ZenApp.tsx`, `shared/docTypes.ts`, `client/src/concept2cure/router/projectModuleRoutePolicy.ts`, `client/src/concept2cure/pages/AppsPage.tsx`

---

## STEP 3: Generate CER Sections

### Can AI generate CER content?

**WORKS**

`server/routes/cerv2-ai-routes.ts` provides multiple AI generation endpoints:

1. **POST `/api/cerv2/ai/suggest`** (line 268) -- RAG-augmented section suggestions. Accepts `docType: 'cerv2_cer'` with any section/field ID.
2. **POST `/api/cerv2/ai/benefit-risk`** (line 6) -- Benefit-risk determination generation.
3. **POST `/api/cerv2/ai/analyze-section`** (line 7) -- Deep section analysis with RAG.
4. **GET `/api/cerv2/ai/templates/:docType`** (line 8) -- Pre-built section templates.

### Does it use CER-specific prompts?

**WORKS**

Line 300: The system prompt adapts per docType:

```
"...Generate professional, regulatory-compliant content for a EU MDR Clinical Evaluation Report.
Section: ${sectionId}/${fieldId}..."
```

CER-specific templates exist at lines 161-194 covering all 8 sections with MEDDEV 2.7/1 rev. 4 language, including dual-keyed aliases (e.g., `sota` + `current_knowledge`, `benefitrisk` + `clinical_benefits` + `residual_risks`).

The generation flow (lines 198-264): (1) RAG retrieval from biotech knowledge base, (2) AI Gateway generation (Claude primary, OpenAI fallback), (3) Template fallback with placeholder substitution. If AI fails, templates with `[DEVICE NAME]`, `[MDR CLASS]`, etc. are returned with context-aware replacements.

### What happens to generated content?

**WORKS**

Generated content is returned as JSON (`suggestion`, `source`, `ragSources`, `docType`, `sectionId`, `fieldId`) to the CERV2Page frontend. The frontend renders it in the section editor. The `ai-to-editor` endpoint (cerv2-export-routes.ts line 694) can convert AI section maps to TipTap editor JSON for direct editing.

**Files**: `server/routes/cerv2-ai-routes.ts`

---

## STEP 4: Export CER

### Is "cerv2_cer" a supported doc type for export?

**WORKS**

`server/routes/cerv2-export-routes.ts` line 74:

```ts
const validDocTypes = ['cerv2_510k', 'cerv2_pma', 'cerv2_cer'] as const;
```

All export endpoints (PDF, DOCX, ZIP, eCTD, ai-to-editor) validate against this list. CER is fully supported.

### What style pack is used?

**WORKS**

`server/export/stylePacks/config.ts` line 21-24: The `cer_mdr_v1` style pack maps to `cer_mdr_v1.html` + `print.css`. The HTML template (`server/export/stylePacks/cer_mdr_v1.html`) contains proper EU MDR CER branding:

```html
<h1>Clinical Evaluation Report (CER)</h1>
<p class="doc-meta">EU MDR 2017/745, Article 61 &amp; Annex XIV &bull; MEDDEV 2.7/1 rev. 4</p>
```

CTD placement for CER is resolved at line 158: `ctdSection: 'm5.0'`, `suggestedPlacement: 'Module 5 / Clinical Evaluation Report'`.

### Does export create governed artifacts?

**WORKS**

All three export endpoints (PDF line 284-298, DOCX line 350-364, ZIP line 414-428) call `createGovernedExportConsequence()` from `server/services/export/governedExportConsequence.ts`. This persists:
- Organization/project/user context
- Source type (`export_pdf`, `export_docx`, `export_zip`)
- CTD section placement
- Binary output + MIME type
- Governance headers (`X-Concept2Cure-AI-Generated`, `X-Concept2Cure-Human-Review-Approved`, etc.)

An optional **human review gate** is enforced in production (line 115-119): if `CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW=true`, exports require `humanReviewApproved: true` in the governance payload.

### ZIP export for CER

**WORKS**

The ZIP builder (line 209-219) generates 8 per-section PDFs for CER:
1. `01_StateOfTheArt.pdf`
2. `02_DeviceIntendedPurpose.pdf`
3. `03_ClinicalDataSet.pdf`
4. `04_CriticalAppraisal.pdf`
5. `05_BenefitRiskDetermination.pdf`
6. `06_GSPRMapping.pdf`
7. `07_PMSPlanPMCF.pdf`
8. `08_ConclusionsRecommendations.pdf`

Plus combined PDF + DOCX. This matches the 8-section CER structure from docTypes.ts exactly.

**Files**: `server/routes/cerv2-export-routes.ts`, `server/export/stylePacks/config.ts`, `server/export/stylePacks/cer_mdr_v1.html`, `server/services/export/governedExportConsequence.ts`

---

## STEP 5: Navigate Back to Project

### After working in CER Generator, can I get back to project home?

**WORKS**

`ZenApp.tsx` line 2467: The CER embedded module passes `onBackToProject={() => navigate(\`/concept2cure/project/${urlProjectId}\`)}` to the CERV2Page.

`CERV2Page.jsx` line 7977-7986: When `embedded && onBackToProject`, a back bar renders:

```jsx
<button onClick={onBackToProject} data-testid="back-to-project">
  <ChevronLeft /> Back to Project
</button>
```

This uses `react-router` navigation and correctly routes to the project home view.

### Does the breadcrumb work?

**PARTIAL**

The "Back to Project" button works as a simple back navigation. There is no true breadcrumb trail (e.g., "Project > CER Generator > Section 3"). The back bar shows a `ChevronLeft` icon + "Back to Project" label plus the document type banner, but no hierarchical breadcrumb.

**Files**: `client/src/concept2cure/ZenApp.tsx`, `client/src/pages/csr/CERV2Page.jsx`

---

## STEP 6: Review CER in Editor

### Can I open CER sections in EditorPanel?

**PARTIAL**

The EditorPanel (`client/src/concept2cure/components/editor/EditorPanel.tsx`) is a generic artifact editor. It does NOT have CER-specific awareness -- there is no `cerv2_cer` check, no CER section structure, and no integration with the cerv2 AI routes or export routes.

CER documents created in the CERV2Page/CER Generator live in a separate document model (the CERV2Page's internal state with `cerDocumentId`, `selectedDocType`, etc.). These are NOT automatically created as governed artifacts in the EditorPanel's artifact system.

To edit CER content in the EditorPanel, a user would need to manually create an artifact and paste content -- there is no automated handoff from CER Generator to EditorPanel.

### Does the lifecycle pipeline work for CER documents?

**PARTIAL**

The EditorPanel has a lifecycle pipeline (line 2457): `Draft -> In Review -> Approved -> Published (Locked)` with status transitions, but this applies only to artifacts managed through the EditorPanel's artifact system. CER documents in the CERV2Page have their own state management that is independent of this lifecycle.

The lifecycle pipeline itself is functional and generic -- it would work for CER documents IF they were loaded as EditorPanel artifacts. But the integration path from CERV2Page -> EditorPanel does not exist automatically.

### Can I export from the editor?

**PARTIAL**

The EditorPanel has export capabilities (DOCX, PDF, PPTX, Markdown) at lines 1166-1269, but these use generic artifact export routes (`/api/concept2cure/artifacts/export-pdf`, `/api/concept2cure/generate-docx`) -- NOT the cerv2-export-routes that produce CER-specific style packs and governed consequences. The EditorPanel exports would produce generic documents without the EU MDR CER branding, CTD placement, or per-section ZIP packaging.

**Files**: `client/src/concept2cure/components/editor/EditorPanel.tsx`, `client/src/pages/csr/CERV2Page.jsx`

---

## Summary Table

| Step | Feature                              | Verdict      | Key File(s)                                                       | Notes                                                                                         |
|------|--------------------------------------|-------------|-------------------------------------------------------------------|-----------------------------------------------------------------------------------------------|
| 1    | Create IVDR project                  | **WORKS**    | `NewProjectModal.tsx:137-146`                                      | IVDR is a first-class submission type, not early-access                                       |
| 1    | Post-creation landing                | **PARTIAL**  | `NewProjectModal.tsx:233`, `ProjectsSidebar.tsx:618`               | Project activates but no auto-navigation to project home                                      |
| 2    | CER embedded module in shell         | **WORKS**    | `ZenApp.tsx:2453-2468`, `projectModuleRoutePolicy.ts:4`           | Route `/project/:id/cer` renders CERV2Page with `cerv2_cer`                                  |
| 2    | CER sections (MEDDEV 2.7/1)          | **WORKS**    | `shared/docTypes.ts:37-53`                                         | 8 sections, 4 required, aligned to MEDDEV 2.7/1 rev. 4                                       |
| 2    | Navigation to CER Generator          | **WORKS**    | `ZenApp.tsx:2208-2213`, `AppsPage.tsx:49`                          | Apps panel routes correctly; available for IVDR and device types                              |
| 3    | AI generation for CER sections       | **WORKS**    | `cerv2-ai-routes.ts:268-354`                                       | RAG+AI with Claude primary, template fallback, CER-specific prompts                          |
| 3    | CER-specific templates               | **WORKS**    | `cerv2-ai-routes.ts:161-194`                                       | All 8 sections covered with MEDDEV 2.7/1 language and dual-key aliases                       |
| 4    | PDF/DOCX export for cerv2_cer        | **WORKS**    | `cerv2-export-routes.ts:74,247,313`                                | Validated docType, governed export consequences, MDR-branded style pack                       |
| 4    | ZIP export with per-section PDFs     | **WORKS**    | `cerv2-export-routes.ts:209-219`                                   | 8 per-section PDFs + combined PDF/DOCX matching CER structure                                |
| 4    | CER style pack (cer_mdr_v1)          | **WORKS**    | `stylePacks/config.ts:21`, `cer_mdr_v1.html`                      | EU MDR Article 61 branded HTML template with MEDDEV 2.7/1 citation                           |
| 4    | Governed export with audit trail     | **WORKS**    | `cerv2-export-routes.ts:284`, `governedExportConsequence.ts`       | Full governance: org/user/project context, CTD placement m5.0, human review gate              |
| 5    | Back to project from CER             | **WORKS**    | `ZenApp.tsx:2467`, `CERV2Page.jsx:7977-7986`                      | "Back to Project" button navigates to project home                                            |
| 5    | Breadcrumb navigation                | **PARTIAL**  | `CERV2Page.jsx:7977`                                               | Simple back button only -- no hierarchical breadcrumb trail                                   |
| 6    | CER sections in EditorPanel          | **PARTIAL**  | `EditorPanel.tsx`                                                  | EditorPanel has no CER-specific awareness; no auto-handoff from CER Generator                |
| 6    | Lifecycle pipeline for CER           | **PARTIAL**  | `EditorPanel.tsx:2454-2498`                                        | Generic lifecycle works but CER docs are not automatically loaded as EditorPanel artifacts    |
| 6    | Export from editor with CER styling  | **PARTIAL**  | `EditorPanel.tsx:1166-1269`                                        | Editor exports use generic routes, not cerv2-export-routes with MDR branding                  |

---

## Critical Gaps for a Greenlight Guru-level CER Workflow

1. **No auto-navigation after project creation** -- After creating an IVDR project, the user is not routed to the project home or CER Generator. They must manually navigate through the Apps panel.

2. **Two document worlds** -- CER documents live in the CERV2Page (CER Generator) with their own state model, separate from the EditorPanel's governed artifact system. There is no bridge: CER content cannot be opened in the EditorPanel for lifecycle management (Draft -> Review -> Approve -> Lock).

3. **Export divergence** -- The CER Generator's export (cerv2-export-routes) produces MDR-branded, governed, per-section outputs. The EditorPanel's export produces generic documents. If a user somehow gets CER content into the EditorPanel, they lose the CER-specific formatting.

4. **No breadcrumb hierarchy** -- Only a flat "Back to Project" button. No trail showing Project > CER Generator > Section, which is expected in structured CER workflows.

5. **IVDR vs CER mapping gap** -- The project type is `IVDR` but the CER Generator uses `cerv2_cer`. There is no automatic mapping from IVDR project type to CER Generator launch. The user must manually open the CER Generator from the Apps panel.
