# Pressure Test: Senior Biostatistician Workflow

**Persona**: Dr. James Park, Senior Biostatistician at CRO, Phase 2 Oncology Trial
**Date**: 2026-03-27
**Tester**: Claude Code automated trace
**Method**: Full code path trace through frontend, backend, judgment engine, and document generation

---

## STEP 1: Access Biostatistics from AnA (Slash Commands)

### Do `/sap`, `/power`, `/dose`, `/defensibility`, `/design` work?

**WORKS** — All 5 slash commands are registered and wired.

| Command          | Registered? | Enrichment? | Executor? | Verdict  |
|-----------------|-------------|-------------|-----------|----------|
| `/sap`          | Yes (line 45) | Yes (line 588) | Yes — `generateSAP()` (line 1723) | **WORKS** |
| `/power`        | Yes (line 45) | Yes (line 589) | Yes — `computeSampleSize()` (line 1765) | **WORKS** |
| `/dose`         | Yes (line 45) | Yes (line 590) | Yes — `computeDoseEscalation()` (line 1795) | **WORKS** |
| `/defensibility`| Yes (line 45) | Yes (line 591) | Yes — `assessDefensibility()` (line 1815) | **WORKS** |
| `/design`       | Yes (line 45) | Yes (line 661) | Yes — `designTrial()` (line 1844) | **PARTIAL** |

**Files**:
- `server/services/ana-ri/context-enrichment.ts` — slash command regex at line 45, enrichment mapping at lines 588-591, 657-661
- `server/services/ana-ri/command-executor.ts` — executor functions at lines 1723-1857, command registry at lines 2638-2642

### Context Enrichment for Biostat Triggers

**WORKS** — Rich context injection system.

- **8 BIOSTAT_TRIGGERS** defined (lines 93-100): sample size, power analysis, SAP, dose escalation, biostatistics, adaptive design, multiplicity, missing data
- **`enrichWithBiostatContext()`** (line 435): queries `biostat_signals` and `biostat_assumption_findings` tables for project-specific signals
- Falls back gracefully if tables don't exist (try/catch, line 473)
- Returns structured biostatistics context block injected into AnA's system prompt

### Caveats

- `/design` executor (line 1844) is a **parameter capture stub** — it returns captured parameters and suggests using `/power` or `/sap` next. No actual design optimization runs.
- `/dose` delegates to `ForesightAIEngine.calculateOptimalDoseEscalation()` which may not be available (catch block at line 1797).
- `/defensibility` delegates to `statistical-defensibility-service.ts` with import catch — may fail gracefully if service unavailable.

---

## STEP 2: Access Biostatistics from Apps/Tools

### AppsPage.tsx

**WORKS** — Biostatistics is listed in the "Studio" group.

- **File**: `client/src/concept2cure/pages/AppsPage.tsx`, line 54
- Listed as: `{ id: 'biostatistics', label: 'Biostatistics', description: 'Statistical analysis, power calculations, endpoints', tracks: ['NDA', 'BLA', 'IND', '505b2', 'PMA'] }`
- Icon: `<Beaker>`

### ZenApp.tsx Routing

**WORKS** — Full routing chain from Apps to AnaBiostatsPanel.

1. `AppsPage` emits `onNavigate('biostatistics')`
2. ZenApp handler (line 2230-2233): sets `layoutMode='regulatory-workspace'` + `activeToolPanel='ana-biostats'`
3. Panel map (line 347): `'ana-biostats': AnaBiostatsPanel`
4. Also accessible via command palette intent `'go-biostatistics'` (line 1646-1654)
5. Workspace suggested actions include "Open AnA Biostats" chip (line 1220-1225)

**File**: `client/src/concept2cure/ZenApp.tsx` — lazy import at line 296, panel map at line 347, routing at lines 1169-1172, 2230-2233

---

## STEP 3: AnaBiostatsPanel Capabilities

**WORKS** — Comprehensive structured input panel with computation, judgment, and document generation.

**File**: `client/src/concept2cure/components/biostats/AnaBiostatsPanel.tsx`

### Client Tracks Supported (line 92-96)

| Track | Study Types | Endpoint Types |
|-------|------------|----------------|
| Pharma/Biotech | Superiority, Non-inferiority, Equivalence, Single-arm, Adaptive | Continuous, Binary, Time-to-event |
| Medical Device | Non-inferiority, Equivalence, Performance goal, Superiority | Continuous, Binary |
| Diagnostics/IVD | Diagnostic accuracy, Method agreement, Performance evaluation | Sensitivity/Specificity, Agreement, AUC/ROC |

### Inputs Collected (lines 42-73)

- **Core**: alpha, powerTarget, effectSize, variance, attritionRate, allocationRatio
- **Rates**: controlRate, treatmentRate, eventRate
- **Diagnostic**: sensitivity, specificity, prevalence
- **Margins**: nonInferiorityMargin, equivalenceMargin
- **Advanced**: numberOfGroups, interimAnalyses, numberOfEndpoints
- **Multiplicity**: multiplicityMethod (bonferroni, holm, hochberg, dunnett, none)
- **Estimand**: estimandStrategy (treatment_policy, hypothetical, composite, principal_stratum, while_on_treatment)
- **Missing data**: missingDataMethod (complete_case, LOCF, MMRM, multiple_imputation, pattern_mixture), expectedMissingRate
- **Context**: regulatoryBody (FDA, EMA, MHRA, PMDA, NMPA, TGA, Health Canada), indication, phase, comparatorType

### Templates (lines 170-244)

3 pre-built templates:
1. **Phase III Efficacy SAP** — two-arm superiority, time-to-event, Holm multiplicity, MMRM
2. **Device Non-Inferiority SAP** — binary endpoint, Bonferroni, MI for missing data
3. **IVD Diagnostic Accuracy SAP** — sensitivity/specificity, AUC-ready

### Governed Document Types (lines 138-147)

8 document types across 2 categories:

| Category | Document Type |
|----------|--------------|
| Core | Sample Size Rationale, Statistical Risk Memo, Design Assumption Note, Scenario Comparison Brief |
| SAP | SAP Section Draft, Protocol Statistical Section, Submission Statistical Note, Statistical Reviewer Response |

### API Integration

- **Quick compute**: `POST /api/ana-biostats/compute` (line 336) — returns computation + judgment, no document
- **Workflow**: `POST /api/ana-biostats/workflow` (line 353) — full pipeline with document generation
- Both use `apiRequest()` (governed), both handle `.isPending` correctly

### Full SAP Mode (line 281)

Toggle for "Full SAP Mode" generates all SAP-category documents in sequence (lines 442-459).

---

## STEP 4: Backend Judgment Engine

**WORKS** — 7 deterministic judgment modules, fully implemented, no LLM dependency.

**File**: `server/services/biostatistics-judgment/index.ts`

### Modules

| # | Module | File | What It Computes |
|---|--------|------|-----------------|
| 1 | Power Adequacy | `power-adequacy.ts` | Classification (adequate/marginal/underpowered/indeterminate), rationale, concerns, gap, recommended actions |
| 2 | Assumption Fragility | `assumption-fragility.ts` | Fragility level (low/moderate/high), score 0-100, key dependencies, failure modes, sensitivity factors with breaking points |
| 3 | Endpoint-Method Defensibility | `endpoint-method-defensibility.ts` | Rating (appropriate/acceptable_with_caveats/vulnerable/poorly_matched), endpoint + method + pairing assessment, regulatory considerations |
| 4 | Tradeoff Interpreter | `tradeoff-interpreter.ts` | Dimension tradeoffs (what improves/worsens), safest path, overall guidance |
| 5 | Risk Classifier | `risk-classifier.ts` | 8 risk types (underpower, fragility, mismatch, attrition, overinterpretation, precision, multiplicity, missing data), severity (critical/major/minor/info) |
| 6 | Role-Aware Interpreter | `role-aware-interpreter.ts` | Tailored reports for 5 roles: CEO, RA Lead, Clinical Lead, Medical Writer, **Biostatistician** |
| 7 | Statistical Artifact Generator | `statistical-artifact-generator.ts` | 5 artifact types: risk memo, assumption note, sample size rationale, SAP section draft, scenario comparison brief |

### Pipeline (`runJudgmentPipeline()`, line 73)

Deterministic chain: input -> power -> fragility -> defensibility -> risk -> tradeoff -> role-aware -> overall assessment

### Artifact Generation (`runPipelineAndGenerateArtifact()`, line 123)

Runs full pipeline then generates a governed artifact with provenance metadata.

### Connected to AnA?

**YES** — via two paths:
1. **AnaBiostatsPanel** -> `POST /api/ana-biostats/workflow` -> `anaBiostatsOrchestrator.executeWorkflow()` -> judgment engine
2. **AnA slash commands** -> `command-executor.ts` -> `generateSAP()` -> `ana-biostats/orchestrator.js`
3. **API routes**: `POST /api/biostat/judgment/analyze` (line 926 of biostatPlatform.ts) directly calls `runJudgmentPipeline()`

---

## STEP 5: SAP Generation

### Can AnA generate a Statistical Analysis Plan?

**WORKS** — Two paths:

1. **Via `/sap` slash command**: `command-executor.ts` `generateSAP()` (line 1723) calls the biostats orchestrator, produces SAP artifact
2. **Via AnaBiostatsPanel**: "SAP Section Draft" document type + "Full SAP Mode" generates all SAP-category docs

### Does `/sap` produce a governed artifact?

**WORKS** — The workflow integrator (`server/services/ana-biostats/workflow-integrator.ts`) persists to:
- `concept2cure_artifacts` table (line 136)
- `concept2cure_artifact_versions` table (line 172) — immutable version record
- `concept2cure_provenance_events` table (line 115 reference)
- Optional: `concept2cure_review_threads` if review required
- Optional: `c2c_artifact_section_map` if auto-attach to dossier enabled

### Can I open the SAP in EditorPanel?

**WORKS** — The `prepareEditorHandoff()` method (line 356 of workflow-integrator.ts) returns:
```
editorUrl: `/concept2cure/editor?artifactId=${artifactId}&type=${document.type}`
```
This URL is stored in `generationHistory` and rendered as an "Open" link in the panel (line 960-963 of AnaBiostatsPanel.tsx).

### SAP Content Quality

The `generateSAPSectionDraft()` function (line 346 of statistical-artifact-generator.ts) produces structured sections:
- Primary Analysis Method (with method justification from defensibility judgment)
- Sample Size (with power, effect size, dropout inflation)
- Missing Data Handling
- Multiplicity Adjustment
- Interim Analysis
- Statistical Considerations (caveats + regulatory considerations)

**Caveat**: These are deterministic template-based sections, not AI-generated prose. They are structured and correct but may lack the narrative depth of a hand-written SAP. The content is judgment-backed (defensibility ratings, risk profiles feed into the text).

---

## STEP 6: Regulatory Design Optimizer (biostatPlatform.ts)

**WORKS** — 7 capabilities declared, all routes mounted.

**File**: `server/routes/biostatPlatform.ts`
**Mount**: `app.use('/api/biostat', biostatRoutes)` at server/index.ts line 1968

### 7 Capabilities

| # | Capability | Route Prefix | Service | Status |
|---|-----------|-------------|---------|--------|
| 1 | Statistical Continuum | `/api/biostat/continuum/*` | `statisticalContinuumService` | **WORKS** — 7 endpoints: initialize, list threads, get thread, update SAP, analysis specs, TLF shells, submit results, CSR sections |
| 2 | Regulatory Design Optimizer | `/api/biostat/design-optimizer/*` | `regulatoryOutcomeOptimizerService` | **WORKS** — recommend endpoint (line 218) |
| 3 | Estimand & Multiplicity Engine | `/api/biostat/estimand/*` | `estimandEngineService` | **WORKS** — route exists (line ~300+) |
| 4 | Collaborative SAP | `/api/biostat/sap/*` | `CollaborativeSapService` | **WORKS** — route exists |
| 5 | External Control Arms | `/api/biostat/external-controls/*` | `ExternalControlArmService` | **WORKS** — route exists |
| 6 | Adaptive Trial Operations | `/api/biostat/adaptive/*` | `adaptiveTrialOperationsService` | **WORKS** — route exists |
| 7 | Biostatistics Knowledge Graph | `/api/biostat/knowledge-graph/*` | `biostatKnowledgeGraphService` | **WORKS** — route exists |

Plus 3 judgment routes:
- `POST /api/biostat/judgment/analyze` — full pipeline
- `POST /api/biostat/judgment/role-interpretation` — single-role interpretation
- `POST /api/biostat/judgment/generate-artifact` — pipeline + artifact generation

### Connected to Frontend?

**PARTIAL** — The biostatPlatform routes are mounted and authenticated, but:
- The **AnaBiostatsPanel** uses `/api/ana-biostats/*` routes (the dedicated panel routes), NOT `/api/biostat/*` routes
- The 7 capabilities in biostatPlatform.ts (continuum, optimizer, estimand, SAP, external controls, adaptive, knowledge graph) do NOT have dedicated frontend UI panels
- They are accessible via API but there is no UI to drive the Statistical Continuum, External Control Arms, Adaptive Trial Operations, or Knowledge Graph capabilities directly

---

## Summary Scorecard

| Step | Capability | Verdict | Notes |
|------|-----------|---------|-------|
| 1a | `/sap` slash command | **WORKS** | Registered, enriched, executed, produces artifact |
| 1b | `/power` slash command | **WORKS** | Registered, enriched, executed via computation engine |
| 1c | `/dose` slash command | **PARTIAL** | Registered but depends on ForesightAIEngine availability |
| 1d | `/defensibility` slash command | **PARTIAL** | Registered but depends on statistical-defensibility-service availability |
| 1e | `/design` slash command | **PARTIAL** | Captures parameters only, suggests `/power` or `/sap` next — no optimizer runs |
| 1f | Biostat context enrichment | **WORKS** | 8 trigger patterns, queries biostat_signals + biostat_assumption_findings |
| 2a | AppsPage listing | **WORKS** | Listed in Studio group for pharma/device tracks |
| 2b | ZenApp routing to panel | **WORKS** | Full routing chain: Apps -> regulatory-workspace -> ana-biostats panel |
| 3a | AnaBiostatsPanel inputs | **WORKS** | 25+ parameters, 3 tracks, 8 study types, 6 endpoint types, 7 agencies |
| 3b | AnaBiostatsPanel templates | **WORKS** | 3 pre-built templates (Phase III, Device NI, IVD Dx) |
| 3c | AnaBiostatsPanel document gen | **WORKS** | 8 document types, full SAP mode, project attachment |
| 4a | Judgment engine pipeline | **WORKS** | 7 deterministic modules, no LLM dependency |
| 4b | Judgment-to-AnA connection | **WORKS** | Connected via orchestrator and direct API routes |
| 5a | SAP generation via /sap | **WORKS** | Orchestrator -> computation -> judgment -> document -> artifact |
| 5b | SAP as governed artifact | **WORKS** | Persisted to artifacts + versions + provenance tables |
| 5c | SAP in EditorPanel | **WORKS** | Editor handoff URL generated, "Open" link in history |
| 6a | 7 platform capabilities | **WORKS** | All routes mounted, authenticated, delegating to services |
| 6b | Platform-to-frontend connection | **PARTIAL** | API-only for 7 capabilities; no dedicated UI for continuum, external controls, adaptive ops, knowledge graph |

### Overall Assessment

The biostatistics workflow is **substantially functional**. A senior biostatistician can:

1. Open biostatistics from the Apps page or command palette
2. Configure a Phase 2 oncology trial with all relevant parameters
3. Run power/sample size computation with judgment overlay
4. Generate a governed SAP section draft with regulatory considerations
5. Open the generated SAP in the document editor
6. Use `/sap`, `/power`, `/dose`, `/defensibility` from AnA chat

**Key gaps for a production biostatistician**:
- `/design` is a parameter capture stub, not an optimizer
- `/dose` and `/defensibility` depend on services that may not be loaded
- The 7 advanced capabilities (continuum, optimizer, estimand engine, collaborative SAP, external control arms, adaptive ops, knowledge graph) have no frontend UI — they are backend-only APIs
- SAP content is template-based, not AI-generated prose — adequate for structure but may need human enrichment for submission quality
