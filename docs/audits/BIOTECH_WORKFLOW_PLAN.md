# BIOTECH WORKFLOW PLAN — Human Experience as North Star

> Generated: 2026-03-27
> Status: PLAN — No code until approved
> Goal: Make the biotech/pharma experience match or exceed Weave.bio

---

## THE HUMAN WE'RE BUILDING FOR

**Sarah, VP Regulatory Affairs at a Series B biotech.**

She has 12 people. They're filing their first IND for a novel oncology compound. She doesn't have time to learn a platform. She needs to:

1. Upload her nonclinical study reports, CMC data, and clinical protocol
2. See the IND section structure mapped out for her (M1-M5)
3. Know which sections are ready, which need work, which are empty
4. Get AI drafts that actually reference her data — not generic templates
5. Review, mark up, approve, sign sections
6. Assemble the final eCTD package
7. Export and submit

She will judge us in 30 seconds. If she has to navigate to an "Apps page" and pick tools from a catalog, she's gone. If she has to figure out what "regulatory-workspace" means, she's gone.

---

## WHAT EXISTS TODAY (Honest Assessment)

### The Good
- **Full M1-M5 section tree** with AI-draftable flags, CFR references, estimated hours (`ind-ectd-sections.ts`)
- **AI drafting engine** that calls Claude with section-specific prompts, regulatory sources, and reference data (`indCopilot.js`)
- **Smart Tags** that bridge source documents to claims with verification status
- **eCTD Co-Author** with split-pane UX: outline tree left, content editor right, status lifecycle
- **Export governance** creating 5 interconnected audit records
- **AnA RI** that IS submission-type-aware when given context — knows IND deficiencies, Phase 1 abbreviations, 21 CFR 312
- **ProjectWorkspaceShell** with 3-pane layout, dossier mode, operating layers, and workbench types
- **Biostatistics judgment engine** (7 modules) — nothing like this in Weave
- **Regulatory precedent intelligence** — CRL/RTF patterns, advisory committee risk — nothing in Weave
- **Deep Research orchestrator** with 8+ connectors
- **RAG infrastructure** (ForesightRAGService, advancedRAGPipeline) ready but unwired

### The Bad
- **Two disconnected IND entry points**: INDFullSolution.jsx (template-first) and UnifiedSubmissionCenter.jsx (project hub) — neither is in the ZenApp shell
- **ProjectWorkspaceShell ignores submission type** — it accepts `projectType` and `submissionType` props but doesn't use them to change the section tree, available tools, or workflow gates
- **Vault has no "Ask" capability** — AskDataRoomPanel.jsx exists as UI but the `/api/evidence/ask` endpoint is a stub that doesn't exist
- **AnA gets inconsistent context** — if the frontend doesn't pass `project_context.submissionType` and `authoring_context.sectionCode`, AnA falls back to generic guidance
- **Export is incomplete** in the IND flow — button exists in eCTD Co-Author but no functional export path
- **E-signature capture** is a button with no modal
- **Redline resolution** is stub
- **Section readiness** in the dossier is hardcoded, not from DB

### The Ugly
- The biotech user has to leave ZenApp to use IND tools (legacy pages at `/ind-full-solution`)
- The workspace doesn't know an IND from a 510(k)
- Upload → AI Draft → Review → Export is a 6-click journey that should be 2

---

## THE CORRECT ARCHITECTURE

**The project type drives everything. No apps page. No navigation. The workspace adapts.**

### Principle 1: The Section Tree IS the Workflow

When Sarah opens her IND project, the left rail of ProjectWorkspaceShell should show the **IND eCTD section tree** (from `ind-ectd-sections.ts`), not generic folders. Each section shows:
- Status badge (empty / drafting / draft / in review / approved / locked)
- Completion indicator
- AI-draftable icon (sparkle) for sections that can be auto-drafted
- Document count (how many artifacts are placed in this section)

Clicking a section opens the section workspace: either the existing artifact for editing, or a "Start Drafting" prompt that triggers AI generation.

### Principle 2: AnA Always Knows Where You Are

Every interaction with AnA must include:
- `project_context.submissionType` (from the project record)
- `authoring_context.sectionCode` (from the currently selected section)
- `authoring_context.moduleCode` (from the parent module)

The frontend should pass this automatically — the user should never have to tell AnA "this is an IND." AnA should OPEN with: "I see you're working on Module 2.4 Nonclinical Overview for your IND. Your uploaded tox reports are ready for reference. Want me to draft this section?"

### Principle 3: Upload = Data Room = Source Material

When Sarah uploads her study reports, they should:
1. Land in the vault with AI-extracted metadata (study type, endpoints, sample size, key findings)
2. Get vectorized for semantic search (embedding pipeline exists)
3. Become queryable via "Ask" — Sarah types "What was the NOAEL in the 28-day tox study?" and gets an answer with page citation
4. Automatically become available to indCopilot when drafting sections that reference that data type

### Principle 4: The Workspace Adapts by Submission Type

| Submission Type | Left Rail Shows | Operating Layers | AI Prompts | Export Format |
|----------------|-----------------|------------------|------------|---------------|
| **IND** | M1-M5 IND section tree | Document Studio, Evidence, Readiness | IND-specific (21 CFR 312, Phase 1 abbreviated) | eCTD 4.0 ZIP |
| **NDA/BLA** | M1-M5 full NDA section tree | Document Studio, Evidence, Readiness | NDA-specific (full review, ISS/ISE) | eCTD 4.0 ZIP |
| **510(k)** | 510(k) sections (Admin, IFU, Description, Predicate, SE, Testing, Labeling, Conclusion) | Document Studio, Evidence, Readiness | 510(k)-specific | PDF/DOCX/ZIP |
| **CER** | CER sections (SOTA, Device, Dataset, Appraisal, Benefit-Risk, GSPR, PMS, Conclusions) | Document Studio, Evidence, Readiness | EU MDR-specific | PDF/DOCX/ZIP |
| **MAA** | M1-M5 EMA section tree | Document Studio, Evidence, Readiness | EMA-specific | eCTD 4.0 ZIP |

### Principle 5: One Document Lifecycle, Every Track

Every section follows the same governed lifecycle:
```
Empty → AI Drafting → AI Draft → Human Editing → In Review → Approved → Locked → Exported
```

The eCTD Co-Author's state machine is already correct. The issue is it lives outside ZenApp.

---

## EXECUTION PLAN (Phased)

### Phase A: Make ProjectWorkspaceShell Submission-Type-Aware

**What changes:**
The left rail "Dossier" mode currently shows a hardcoded CTD tree. Change it to:
- Load the section tree from `ind-ectd-sections.ts` when `submissionType === 'IND'`
- Load 510(k) sections from `docTypes.ts` when `submissionType === '510K'`
- Load CER sections when `submissionType === 'CER'` or `'IVDR'`
- Each section node enriched with real status from `concept2cure_artifacts` (query artifacts where `ctdSection` matches)

**Key file:** `ProjectWorkspaceShell.tsx` — modify the dossier tree data source based on `submissionType` prop.

**Supporting hook:** Create `useSubmissionSections(projectId, submissionType)` — returns the section tree with live status from DB.

### Phase B: Wire Section → Editor → AI Draft Flow

**What changes:**
When user clicks a section in the dossier tree:
1. If artifacts exist for that `ctdSection` → open in EditorPanel (existing flow)
2. If NO artifact exists → show a "Start Section" prompt with:
   - Section title, description, regulatory reference
   - "Draft with AI" button → calls `indCopilot.js` (or equivalent by submission type) with the section code
   - "Start from Template" button → opens template picker filtered to this section
   - "Write Manually" button → creates blank artifact with `ctdSection` pre-set

**Key insight:** The EditorPanel already handles editing. The gap is the "empty section" state and the AI trigger for new sections.

### Phase C: Auto-Pass Context to AnA

**What changes:**
In ZenApp, wherever ZenChat or AnaPersistentPanel is rendered, ensure it receives:
```typescript
projectContext={{
  submissionType: activeProject?.type,   // Already available
  productName: activeProject?.name,
  projectId: activeProjectId,
}}
authoringContext={{
  sectionCode: activeSectionCode,        // From dossier tree selection
  moduleCode: activeModuleCode,          // Derived from section
  submissionType: activeProject?.type,
}}
```

The `activeSectionCode` state already exists in ZenApp (used by SectionWorkspace). Wire it to update when the user selects a section in the dossier tree.

### Phase D: Wire the Data Room "Ask"

**What changes:**
1. Create `POST /api/evidence/ask` endpoint that:
   - Takes a question + projectId
   - Queries vault documents for that project (semantic search via ForesightRAGService)
   - Returns AI-synthesized answer with source citations (document name, page, excerpt)
2. Wire AskDataRoomPanel.jsx to this endpoint (the UI already exists)
3. Surface "Ask" as a tab in the vault or as a tool panel in the workspace

### Phase E: HAQ Response Workflow

**What changes:**
When FDA/EMA sends Health Authority Questions:
1. User pastes or uploads the questions into a dedicated HAQ panel
2. System parses individual questions
3. For each question, AI drafts a response using:
   - Prior submitted documents (from vault)
   - Regulatory precedent (from precedent intelligence)
   - EMA question taxonomy (existing backend service)
4. User reviews, edits, approves each response
5. Responses assembled into response document with cross-references

This can be a new panel type in ProjectWorkspaceShell (like "Reviews" or "Submissions"), not a separate app.

### Phase F: Submission Assembly & Export

**What changes:**
The "Submit" tab in ProjectWorkspaceShell should:
1. Show all sections with their status (approved = green, not approved = blocked)
2. Calculate readiness % (sections approved / total required sections)
3. When all required sections are approved, enable "Assemble eCTD Package" button
4. Assembly calls `ectd-compile.ts` → `ectd-export.ts` → downloads ZIP
5. Export creates governed submission snapshot (existing exportGovernance.ts)

### Phase G: Kill Legacy Entry Points

Once the above is wired:
- Remove `/ind-full-solution` route (INDFullSolution.jsx absorbed into workspace)
- Remove `/submission-center` route (UnifiedSubmissionCenter.jsx absorbed into workspace)
- Remove IND from "Early Access" label (it's now the real deal)
- eCTD Co-Author's section tree + status machine logic gets absorbed into ProjectWorkspaceShell's dossier mode

---

## THE USER JOURNEY AFTER THIS PLAN

### Sarah's Day 1

1. **Login → ZenApp → Projects → "New Project"**
   - Selects "IND" → enters product name, indication, target agency (FDA)
   - Project created

2. **Lands in Project Workspace**
   - Left rail: IND section tree (M1-M5), all sections showing "Empty"
   - Center: Welcome message from AnA: "Let's get your IND started. Upload your source documents first."
   - Right: AnA persistent panel

3. **Uploads source documents**
   - Drags nonclinical study reports, CMC specs, clinical protocol into vault
   - AI extracts metadata: study types, endpoints, NOAEL values, formulation details
   - Documents vectorized for semantic search

4. **Starts drafting**
   - Clicks "M2.4 Nonclinical Overview" in the section tree
   - Sees: "This section requires an integrated assessment of pharmacology, PK, and toxicology. Your uploaded tox reports are ready for reference."
   - Clicks "Draft with AI"
   - AI generates M2.4 using her actual uploaded data, with Smart Tags linking to specific study reports
   - Section status: Empty → AI Draft

5. **Reviews and edits**
   - Reads through, makes corrections, adds context
   - Smart Tags show which claims are verified vs. unverified
   - Status: AI Draft → Editing

6. **Asks AnA for help**
   - Types: "What was the NOAEL in our 28-day rat tox study?"
   - AnA queries the Data Room, returns: "The NOAEL in study TOX-2025-014 was 30 mg/kg/day (p. 47, Table 12)"
   - Types: "Are there any regulatory concerns with our nonclinical package?"
   - AnA runs deficiency taxonomy check, returns IND-specific risks with preemption suggestions

7. **Submits for review**
   - Clicks "Submit for Review" → section locked for editing
   - Reviewer gets notification, reviews in the same editor
   - Reviewer approves → electronic signature captured
   - Section status: Approved

8. **Repeats for all required sections**
   - Section tree updates in real time: greens spreading as sections get approved
   - Readiness % climbs toward 100%

9. **Assembles and exports**
   - All required sections approved
   - Clicks "Assemble eCTD Package" in Submit tab
   - System compiles eCTD 4.0 ZIP with proper module structure
   - Downloads package → submits to FDA ESG

### Sarah's Week 4 (Post-Submission)

10. **FDA sends Health Authority Questions**
    - Sarah opens HAQ panel, pastes questions
    - System parses, AI drafts responses referencing submitted documents
    - She reviews, edits, approves responses
    - Exports HAQ response package

---

## WHAT THIS BEATS WEAVE.BIO ON

| Capability | Weave.bio | Concept2Cure After Plan |
|-----------|-----------|------------------------|
| IND auto-drafting | AutoIND (their hero) | Same — indCopilot with section-specific prompts |
| Data Room with Ask | Yes — semantic search + Q&A | Yes — ForesightRAGService + AskDataRoomPanel |
| HAQ response | HAQ Manager | Yes — EMA question taxonomy + AI response drafting |
| eCTD assembly | Submission Builder | Yes — ectd-compile + ectd-export |
| Section-level status tracking | Dossier Manager | Yes — artifact status mapped to CTD sections |
| Source tracing | Inline citations | Smart Tags with verification status |
| Audit trail | Version-controlled record | 5-record export governance + RIM signals |
| **Biostatistics** | NONE | 7-module judgment engine + SAP builder |
| **Precedent intelligence** | NONE | CRL/RTF patterns, AC risk, cross-jurisdictional |
| **Risk scoring** | NONE | Foresight AI (approval probability) |
| **Protocol design** | NONE | StudyProtocolDesigner (12 trial types) |
| **Multi-device support** | NONE | 510(k), PMA, CER, IVDR |
| **Real-time compliance** | Basic flagging | RIM with 4 interceptors + pattern registry |
| **Multi-agency (live)** | FDA only (EMA roadmap) | FDA + EMA + PMDA + HC + TGA |
| **AI copilot** | Generic AI | AnA RI with personas, deficiency taxonomy, role adaptation |

---

## IMPLEMENTATION ORDER & EFFORT

| Phase | Description | Key Files | Effort | Dependency |
|-------|------------|-----------|--------|------------|
| **A** | Submission-type-aware section tree | ProjectWorkspaceShell.tsx, new hook | Medium | None |
| **B** | Section → Editor → AI Draft flow | ProjectWorkspaceShell.tsx, EditorPanel.tsx | Medium | Phase A |
| **C** | Auto-pass context to AnA | ZenApp.tsx, AnaPersistentPanel.tsx | Small | Phase A |
| **D** | Data Room "Ask" endpoint | New route, wire AskDataRoomPanel | Medium | None (parallel) |
| **E** | HAQ response workflow | New panel in workspace | Medium | Phase A |
| **F** | Submission assembly & export | SubmissionReadiness.tsx, ectd-compile | Medium | Phase B |
| **G** | Kill legacy entry points | Remove old routes | Small | All above |

**Phases A + C + D can run in parallel.** B depends on A. E and F depend on A. G is cleanup after everything works.

---

## MEASURE OF SUCCESS

A biotech VP Regulatory can:
1. Create an IND project and see the full M1-M5 section tree in 2 clicks
2. Upload source documents and ask questions against them
3. AI-draft any section with real data references
4. Review, approve, sign sections with audit trail
5. See readiness % and know exactly what's left
6. Assemble and export eCTD package
7. Handle HAQ responses when FDA comes back
8. Do all of this without ever leaving the workspace shell

**If they can do that, we beat Weave.bio. If they can also run biostatistics, precedent intelligence, and protocol design from the same workspace — we're in a different league.**
