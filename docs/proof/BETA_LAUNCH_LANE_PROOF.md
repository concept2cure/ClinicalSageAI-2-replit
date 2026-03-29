# Beta Launch Lane Proof — Connected Submission Workspace

**Date:** 2026-03-29
**Branch:** `concept2cure-v2`
**Sprint:** Connected Submission Workspace

---

## Flagship Path: Biotech IND Submission

The controlled beta user path that must work end-to-end:

```
1. Create project from global registry
2. Enter Tools landing (workspace center)
3. Upload/browse/search/ask over project evidence (Data Room)
4. Create/open governed draft (EditorPanel)
5. Move artifact through Draft -> Review -> Verify -> Publish
6. Export through governed consequence
7. Handle regulator questions in HAQ Manager
```

---

## Step-by-Step Proof Points

### Step 1: Project Creation from Registry

| Component | Status | Evidence |
|---|---|---|
| Global Regulatory Registry | Built | 69 application types, 12 regions |
| NewProjectModal registry picker | Built | `ProjectSwitcher.tsx` — Globe toggle, RegulatoryApplicationPicker |
| Backend bootstrap | Built | `bootstrapFromRegistry()` in `concept2cure.ts` |
| SubmissionTypeEnum widened | Built | `z.string()` accepts all registry IDs |

### Step 2: Tools Landing

| Component | Status | Evidence |
|---|---|---|
| ToolsLanding component | Built | `client/src/concept2cure/components/workspace/ToolsLanding.tsx` |
| 9 tool cards | Built | Resume, Create, Builder, Templates, Dossier, Vault, Review, Submit, HAQ |
| Sidebar "Tools" entry | Built | `ZenSidebar.tsx` — Wrench icon, routes to `documents` mode |
| FullDocumentBuilder demoted | Done | One tool card, not default destination |

### Step 3: Data Room / Ask

| Component | Status | Evidence |
|---|---|---|
| VaultPage Browse tab | Built | Folder-grouped artifact browser with search |
| VaultPage Ask tab | Built | Semantic Q&A with grounded sources |
| File upload | Built | Upload to client-intelligence project documents |
| `/api/evidence/ask` endpoint | Built | `server/routes/evidence-ask.ts` |
| ForesightRAGService | Built | `server/services/foresight-rag-service.ts` |
| Project-scoped retrieval | Built | Document names passed as context preference |

### Step 4: Governed Draft Creation

| Component | Status | Evidence |
|---|---|---|
| EditorPanel | Built | `client/src/concept2cure/components/editor/EditorPanel.tsx` (3356 lines) |
| Create blank | Built | `handleDialogCreateBlank` -> `setSelectedDocId` + `setMode('edit')` |
| Create from template | Built | `handleDialogCreateFromTemplate` -> auto-opens editor |
| SubmissionApps creation | Built | `handlePhase4CreateDraft` -> auto-opens editor |
| Dossier section create | Built | DossierMap "Create" button per empty section |
| All paths converge | Verified | Every creation path calls `setSelectedDocId(created.id)` + `setMode('edit')` |

### Step 5: Lifecycle Stages (Draft -> Review -> Verify -> Publish)

| Component | Status | Evidence |
|---|---|---|
| DocumentStatusTimeline | Built | 4-stage visual timeline (Draft/In Review/Approved/Published) |
| Stage-gated transitions | Built | Backend role-based permission matrix in `concept2cure.ts` |
| Inspector panels grouped | Built | 4 groups: Draft(4), Review(5), Verify(5), Publish(4) |
| Contextual suggestions | Built | Inspector panels auto-suggested per lifecycle stage |
| Attestation gates | Built | Required for Approved/Locked transitions |
| Review quorum gate | Built | All reviewers must approve before promotion |

### Step 6: Governed Export

| Component | Status | Evidence |
|---|---|---|
| `createGovernedExportConsequence()` | Built | `server/services/export/governedExportConsequence.ts` |
| 5-record governance chain | Built | artifact + version + provenance + audit + snapshot |
| PDF export | Built | `documentExportService.ts` with eCTD compliance |
| DOCX export | Built | `cerv2-export-routes.ts` |
| eCTD packaging | Built | `assembleECTDPackage()` with ICH M8 XML |
| Export governance | Built | `server/services/compute/exportGovernance.ts` |

### Step 7: HAQ Manager

| Component | Status | Evidence |
|---|---|---|
| Question ingestion | Built | Auto-parse numbered questions from text |
| Auto-classification | Built | Category, priority, CTD section detection |
| AI draft response | Built | Routes through `/api/evidence/ask` with regulatory context |
| Review/Finalize workflow | Built | Status progression: pending -> drafted -> reviewed -> finalized |
| Save as artifact | Built | Creates governed artifact with HAQ metadata |
| Export responses | Built | Markdown export with classification metadata |
| Open in editor | Built | Content passed to EditorPanel via callback |
| Backend HAQ routes | Built | `server/routes/haq-manager.ts` (8 REST endpoints) |

---

## Governed Export Proof Chain

For every export in the flagship path:

```
User triggers export (PDF/DOCX/eCTD)
  |
  v
createGovernedExportConsequence()
  |
  +-- concept2cure_artifacts        (export record)
  +-- concept2cure_artifact_versions (immutable version snapshot)
  +-- concept2cure_provenance_events (export provenance chain)
  +-- regulatory_audit_logs          (21 CFR Part 11 audit trail)
  +-- concept2cure_submission_snapshots (immutable export snapshot)
  |
  v
GovernedExportConsequence returned
  {
    governed: true,
    artifact_id, artifact_version,
    placement_state, provenance_ref, audit_ref,
    downloadable_output_ref
  }
```

---

## Weave Parity Status After Sprint

| Dimension | Pre-Sprint | Post-Sprint |
|---|---|---|
| AI Drafting | MATCHED | MATCHED |
| Template Engine | MATCHED | MATCHED |
| Data Room / Vault | GAP | **CLOSED** (Browse + Ask) |
| Dossier Manager | PARTIAL | **STRONG** (live readiness) |
| Submission Builder | MATCHED | MATCHED |
| Editor Lifecycle | PARTIAL | **STRONG** (4-stage ribbon) |
| Review / Collaboration | MATCHED | MATCHED |
| Source Traceability | PARTIAL | PARTIAL (sentence-level deferred) |
| HAQ Workflow | GAP | **CLOSED** (full lifecycle) |
| Publishing / Export | MATCHED | MATCHED |

---

## Launch Gate Checklist

- [x] Governed artifact creation with provenance
- [x] Status transitions with role-based permissions
- [x] Attestation gates for approval/lock
- [x] Review quorum enforcement
- [x] Governed export with 5-record consequence chain
- [x] Audit trail for all mutations (21 CFR Part 11)
- [x] Project-scoped evidence retrieval
- [x] All creation paths converge to EditorPanel
- [x] No dead-end artifact creation paths in flagship lane
- [ ] E2E integration test (see `tests/routes/governed-export-e2e.test.ts`)
- [ ] CI governance coverage guard (recommended next sprint)
