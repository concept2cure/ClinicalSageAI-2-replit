# Phase 4A–4B: Regulatory Transform Canvas & Golden Dossier Verification

## Proof of Implementation — Phase 4 Product Layer

### 1. Regulatory Transform Canvas

**Component:** `client/src/concept2cure/components/workspace/RegulatoryTransformCanvas.tsx`

**What it does:**

- 5-lane visual pipeline: Inputs → Structured Transform → Draft Output → Governance → Downstream Actions
- Fetches live project data from `GET /api/concept2cure/projects/:projectId/transform-context`
- Pre-binds CTD section, template key, and artifact ID when launched from context (dossier node, template node, or active document)
- Shows matched submission apps from `getSubmissionAppCandidates()` (existing ctdHierarchy helper)
- "Create Governed Draft" action calls existing `POST /api/concept2cure/projects/:projectId/artifacts` endpoint
- Downstream buttons: Open Editor, Open Placement, Verify Document

**Audit-first proof — no duplicate systems created:**

- Uses existing `POST /api/concept2cure/projects/:projectId/artifacts` for document creation (same endpoint used by RI Copilot, IND Workspace, eCTD Co-Author, CMC)
- Uses existing `getTemplateStructureForArtifact()` and `getSubmissionAppCandidates()` from ctdHierarchy.ts
- No new canvas rendering engine — this is a structured panel, not a second ConvergentCanvas

**Entry points wired:**

- ProjectWorkspaceShell doc-aware header: Sparkles icon button (visible when editing any document)
- DossierTree context menu: "Open Transform Canvas" (bound to selected CTD section)
- TemplateTree: Wand2 icon button per template node (bound to template key + CTD section)
- SubmissionAppsPanel: "Open Transform Canvas" action per app

### 2. Golden Dossier Verification Panel

**Component:** `client/src/concept2cure/components/workspace/GoldenDossierVerificationPanel.tsx`

**What it does:**

- Single-artifact verification against 4 dimensions: Placement, Template Conformance, Evidence Support, Governance
- Fetches from `GET /api/concept2cure/projects/:projectId/artifacts/:artifactId/verification`
- Displays overall verdict (Pass/Caution/Fail) with numeric score
- Each dimension: collapsible section with individual findings and confidence labels (deterministic/heuristic/inferred)
- Recommended actions list with numbered steps
- Quick action bar: Edit, Place, Provenance, Audit, Compare, Transform Canvas

**Backend endpoint:** `GET /projects/:projectId/artifacts/:artifactId/verification`

- 4-dimension check using real artifact data from DB
- Placement: checks if `ctdSection` is set
- Template: heuristic heading scan against expected template structure
- Evidence: checks provenance event count
- Governance: checks signatures and review comments
- Returns `overallStatus`, `score`, `findings[]`, `recommendedActions[]`

**Audit-first proof:**

- Uses existing `getVerificationRulesForSection()` from ctdHierarchy.ts
- Uses existing provenance/signature/review data from DB (same tables as DocumentProvenancePanel, ElectronicSignature)
- No duplicate governance model — reads from `concept2cureSignatures`, `concept2cureReviewComments`, `concept2cureProvenanceEvents`

**Entry points wired:**

- ProjectWorkspaceShell doc-aware header: ShieldCheck icon button
- Transform Canvas: "Verify" downstream action
- ProgramTwinPanel: per-artifact "Verify" link in problems list

### 3. Backend Endpoints Added

All 4 endpoints added to `server/routes/concept2cure.ts`:

| Endpoint                                                  | Method | Purpose                     |
| --------------------------------------------------------- | ------ | --------------------------- |
| `/projects/:projectId/transform-context`                  | GET    | Inputs for Transform Canvas |
| `/projects/:projectId/artifacts/:artifactId/verification` | GET    | 4-dimension verification    |
| `/projects/:projectId/program-twin`                       | GET    | Aggregated program state    |
| `/projects/:projectId/change-impact`                      | GET    | Downstream impact analysis  |

All endpoints use existing auth (`getOrganizationId`, `verifyProjectAccess`), existing DB queries, and existing error handling patterns. No new middleware or auth changes.

### 4. Build Verification

```
✓ 5701 modules transformed.
✓ built in 46.69s
```

Zero TypeScript errors. Zero lint errors.
