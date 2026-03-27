# Agent 03 — Object Model & Naming Reconciliation

**Date:** 2026-03-27

---

## 1. Canonical Object Taxonomy

```
Object Types
├── Artifacts — governed outputs and governed records
│   └── Documents — editable artifacts in the Work experience
└── Files — uploaded / source / supporting stored materials

Places / Workspaces
├── Work — where documents are authored
├── Vault — where files live and artifacts can be browsed in storage/evidence context
├── Review — where quality/compliance is checked
└── Submit — where finalization and export happen

Backend Capabilities (not user-facing nav labels)
├── DMS — document management system
└── Dossier — CTD structure model (shown as "Section Map" inside Work)
```

---

## 2. Term-by-Term Reconciliation

### Artifact

| Attribute | Value |
|-----------|-------|
| **Canonical meaning** | A governed output or governed record. Versioned, status-tracked (Draft → In Review → Approved → Locked), auditable, provenance-tracked, signable. |
| **Where shown in UI** | Artifacts global destination page. GovernedDocumentPanel status/audit/versions. Project Overview (recent artifacts). Review tab (artifact readiness). Submit tab (artifact completeness). |
| **Where NOT shown** | Do not use "artifact" as the primary label users see when authoring. In Work, call them "documents." |
| **Repo grounding** | `GovernedDocumentPanel.tsx` manages artifact lifecycle. `ArtifactPanel.tsx` renders artifact viewer. `GET /api/concept2cure/artifacts` returns all artifacts. Status values: `draft`, `review`, `approved`, `locked`. |

### Document

| Attribute | Value |
|-----------|-------|
| **Canonical meaning** | An editable artifact in the Work experience. The user-facing word for "the thing I'm writing." |
| **Where shown in UI** | Work tab: document list, document editor, "Create Document" button, "Open Document." |
| **Where NOT shown** | Not a top-level global destination. Not in the global left rail. Not used when discussing governance status (use "artifact" in that context). |
| **Repo grounding** | `ProjectWorkspaceShell.tsx` centers on document editing via `DocumentListPane`, `EditorPanel`, `NewDocumentDialog`. The word "document" appears extensively in the workspace. |

### File

| Attribute | Value |
|-----------|-------|
| **Canonical meaning** | An uploaded, imported, or source/supporting material. PDFs, source docs, evidence, attachments. Not governed in the same lifecycle as artifacts (no D→R→A→L). |
| **Where shown in UI** | Vault tab: "Upload files," file browser, evidence packs. Work tab left rail (Files mode in ProjectFileTree). |
| **Where NOT shown** | Not a global destination. Not mixed with artifact status language. |
| **Repo grounding** | `ProjectFileTree.tsx` groups items into virtual folders (drafts, generated, dossier, evidence, cmc, ind, ectd, clinical, audit, final). These are actually artifacts grouped by folder, but the "evidence" and "audit" folders contain true file-like materials. |

### Vault

| Attribute | Value |
|-----------|-------|
| **Canonical meaning** | The workspace/place where files live and where artifacts can also be browsed in storage/evidence context. A project-level service, not a global hallway. |
| **Where shown in UI** | Project shell tab: "Vault." Vault drawer (persistent utility). Evidence linking from document editor. |
| **Where NOT shown** | Not a top-level global destination (was in old spec, removed in approved model). |
| **Repo grounding** | `document-vault` layout mode exists but is demoted → redirects to `documents`. `ProjectFileTree.tsx` is the closest existing vault UI. `DocumentVault.tsx` exists in `portal-v2` with folder tree, status tracking, categories, favorites. |

### DMS

| Attribute | Value |
|-----------|-------|
| **Canonical meaning** | Backend document management system capability. Handles storage, versioning, access control at the infrastructure level. |
| **Where shown in UI** | Nowhere as a user-facing label. |
| **Where NOT shown** | Not in sidebar. Not in global nav. Not in project tabs. Not in any heading or button. |
| **Repo grounding** | Referenced in backend services but not exposed in UI labels. |

### Dossier

| Attribute | Value |
|-----------|-------|
| **Canonical meaning** | The CTD (Common Technical Document) structure — the regulatory filing structure organized into Modules 1-5. |
| **Where shown in UI** | Inside Work tab as "Section Map" or "Dossier" sub-view. DossierTree in left rail. DossierMap as sub-page. |
| **Where NOT shown** | Not a global destination. Not a top-level sidebar item. |
| **Repo grounding** | `DossierMap.tsx` renders CTD hierarchy. `DossierTree.tsx` shows section navigation in left rail. `ctdHierarchy.ts` defines the module structure. `dossier-map` layout mode exists in ZenApp. |

### Report

| Attribute | Value |
|-----------|-------|
| **Canonical meaning** | A generated deliverable or summary — readiness report, audit report, compliance report, evidence summary. |
| **Where shown in UI** | Overview tab (readiness snapshot, status reporting). Review tab (compliance reports, audit trail, evidence confidence). Submit tab (submission readiness report, package summary). Apps (Audit Report app). |
| **Where NOT shown** | Not a top-level global destination. Not a separate project tab. Redistributed across Overview, Review, Submit. |
| **Repo grounding** | `IntelligentReportGenerator` exists as a layout mode. `report-engine` layout mode renders it. Audit Report is one of the 6 apps in `SubmissionAppsPanel`. Reports were a first-class layer in old spec — now redistributed. |

### Submission

| Attribute | Value |
|-----------|-------|
| **Canonical meaning** | The act of finalizing and filing a regulatory package. |
| **Where shown in UI** | Submit project tab. Submission type badges throughout (510k, IND, NDA, etc.). |
| **Where NOT shown** | Not a global destination (was in old spec). "Submissions" sidebar item removed. |
| **Repo grounding** | `SubmissionReadiness.tsx` is the main submission surface. `SubmissionReadinessValidator.tsx` validates CTD modules. `submission-twin-service.ts` handles simulation. |

---

## 3. UI Naming Rules

### DO

- Use "document" when the user is authoring in Work
- Use "artifact" when showing governance status, provenance, versions, or browsing the Artifacts global page
- Use "file" for uploaded/imported source materials
- Use "Vault" as the project tab for files/evidence
- Use "Section Map" or "Dossier" only inside Work, as a sub-view label
- Use submission type names (510(k), IND, NDA) as badge labels, not "Submission" as a destination

### DO NOT

- Do not label anything "DMS" in the UI
- Do not use "Document" as a global nav destination — Work holds documents
- Do not use "Report" or "Reports" as a standalone top-level destination
- Do not use "Dossier" as a sidebar item or global destination
- Do not use "Artifact" and "Document" interchangeably — they have distinct contexts
- Do not say "Vault" in the global rail — Vault is project-scoped

---

## 4. Current Naming Conflicts in Repo

| Conflict | Location | Resolution |
|----------|----------|------------|
| Sidebar says "Documents" as global nav | `ZenSidebar.tsx` Workflow group | Remove from global rail. Becomes Work project tab. |
| `layoutMode: 'artifacts'` redirects to `'documents'` | `ZenApp.tsx` DEMOTED_REDIRECTS line 833 | Un-demote. Make `'artifacts-center'` a real layout mode with its own page. |
| `layoutMode: 'document-vault'` redirects to `'documents'` | `ZenApp.tsx` DEMOTED_REDIRECTS line 827 | Replace with `'vault'` layout mode under project tabs. |
| `ProjectFileTree` mixes artifacts and files | `ProjectFileTree.tsx` virtual folders | Keep as-is for Work left rail. Vault tab should present a file-first view with linked artifacts secondary. |
| "Dossier Map" as top-level sidebar item | `ZenSidebar.tsx` Workflow group | Move inside Work tab as sub-view. |
| "Reports" not currently a separate page | Old spec wanted it as first-class. Repo has `report-engine` mode. | Keep as an app (Audit Report in Apps). Redistribute report content to Overview/Review/Submit. |
