# Phase 4C–4D: Program Twin & Submission Apps

## Proof of Implementation — Phase 4 Product Layer

### 1. Program Twin Panel

**Component:** `client/src/concept2cure/components/workspace/ProgramTwinPanel.tsx`

**What it does:**
- Unified project state aggregation — "digital twin" of the regulatory program
- Fetches from `GET /api/concept2cure/projects/:projectId/program-twin`
- 5 stat cards: Total / Draft / Review / Approved / Locked artifacts
- 3 readiness progress bars: Authoring readiness, Review readiness, Submission readiness
- Expandable problems list with severity badges and "Verify" action per problem
- Dossier module breakdown: per-module artifact counts with section links
- Evidence state: strong/weak/no-evidence artifact classification with drill-down
- Template usage and governance (signatures, reviews) summary sections

**Backend endpoint:** `GET /projects/:projectId/program-twin`
- Aggregates: artifacts (status counts), provenance events, signatures, review comments
- Computes readiness percentages: authoring = placed%, review = reviewed%, submission = approved/locked%
- Module breakdown from CTD section prefixes
- Problems list: unplaced docs, unsigned approved docs, no-evidence docs
- All values carry confidence labels (deterministic/heuristic/inferred)

**Entry points wired:**
- ProjectWorkspaceShell doc-aware header: Target icon button
- DossierTree context menu: "Show in Program Twin"

### 2. Submission Apps Panel

**Component:** `client/src/concept2cure/components/workspace/SubmissionAppsPanel.tsx`

**What it does:**
- Card-grid launcher for 6 document-producing submission apps
- Uses existing `SUBMISSION_APPS` array from ctdHierarchy.ts (evidence-memo, protocol-rationale, clinical-overview, module3-builder, risk-benefit, audit-report)
- Each card shows: icon, app name, description, target document type, default CTD section
- Detail view per app: required inputs, transform path visualization, governed draft creation
- "Create Governed Draft" generates title and scaffold content per app type, calls existing artifact creation endpoint

**Data layer — no new app definitions:**
- `SUBMISSION_APPS` (6 entries) was already defined in ctdHierarchy.ts from Phase 3
- `getAllSubmissionApps()` and `getSubmissionAppCandidates()` already existed
- `SubmissionAppCandidate` interface already defined
- No new data model — purely consumes existing definitions

**Entry points wired:**
- ProjectWorkspaceShell doc-aware header: AppWindow icon button
- DossierTree context menu: "Create with Submission App" (bound to CTD section)

### 3. Audit-First Validation

**Existing substrate reused (NOT duplicated):**

| Capability | Existing Source | Phase 4 Consumer |
|------------|----------------|-------------------|
| Artifact creation | `POST /api/concept2cure/projects/:id/artifacts` | Transform Canvas, Submission Apps |
| CTD hierarchy | `CTD_HIERARCHY` in ctdHierarchy.ts | Transform Canvas, Program Twin |
| Template structure | `getTemplateStructureForArtifact()` | Transform Canvas |
| Submission apps | `SUBMISSION_APPS`, `getAllSubmissionApps()` | Submission Apps Panel |
| Verification rules | `getVerificationRulesForSection()` | Verification Panel |
| Expected doc types | `getExpectedDocTypesForSection()` | Verification backend |
| Auth/org checking | `getOrganizationId()`, `verifyProjectAccess()` | All 4 backend endpoints |
| Provenance events | `concept2cureProvenanceEvents` table | Program Twin, Verification |
| Signatures | `concept2cureSignatures` table | Program Twin, Verification |
| Review comments | `concept2cureReviewComments` table | Program Twin, Verification |

**No parallel systems created:**
- ✅ No second canvas engine (Transform Canvas is a structured panel, not ConvergentCanvas)
- ✅ No second provenance model (reads from existing `concept2cureProvenanceEvents`)
- ✅ No second placement logic (uses existing PlacementDialog)
- ✅ No second artifact creation path (all draft creation → `POST .../artifacts`)
- ✅ No second auth middleware (uses existing `getOrganizationId` + `verifyProjectAccess`)

### 4. Integration Wiring Summary

**ProjectWorkspaceShell (orchestrator):**
- New state: `phase4Panel` ('none' | 'transform' | 'verification' | 'twin' | 'apps')
- New context: `phase4Ctx` (ctdSection, templateKey, artifactId, artifactTitle)
- 4 opener callbacks: `openTransformCanvas`, `openVerification`, `openProgramTwin`, `openSubmissionApps`
- Close callback: `closePhase4Panel`
- Draft creation handler: `handlePhase4CreateDraft` (reuses existing artifact creation endpoint)
- 4 icon buttons in doc-aware header: ShieldCheck, Sparkles, Target, AppWindow
- Phase 4 panels render as center pane overlays (replacing browse/edit when active)

**DossierTree (3 new context menu items):**
- "Open Transform Canvas" → `onOpenTransformCanvas(ctdSection)`
- "Create with Submission App" → `onOpenSubmissionApps(ctdSection)`
- "Show in Program Twin" → `onOpenProgramTwin()`

**TemplateTree (1 new action button):**
- Wand2 icon per template node → `onOpenTransformCanvas(ctdSection, templateKey)`
