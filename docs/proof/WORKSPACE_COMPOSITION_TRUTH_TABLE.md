# Workspace Composition Truth Table

**Date:** 2026-03-12
**Branch:** `concept2cure-v2` @ `0a4b8e7c`

---

## Canonical Workspace: ProjectWorkspaceShell

All surfaces below compose into a single workspace orchestrated by `ProjectWorkspaceShell.tsx`.

### Truth Table

| #   | Surface                  | Location                     |               Rendered In Shell?                |          Creates Artifacts?           | API Endpoint                                                              | Wiring Status                                                                 | Verdict            |
| --- | ------------------------ | ---------------------------- | :---------------------------------------------: | :-----------------------------------: | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------ |
| 1   | **File Tree**            | Left rail (mode='files')     |                  ✅ PWS L~480                   |                  NO                   | GET /artifacts                                                            | Loads real artifacts, groups by type                                          | **REAL AND WIRED** |
| 2   | **Dossier Tree**         | Left rail (mode='dossier')   |                  ✅ PWS L~490                   |                  NO                   | GET /artifacts + GET /dossier-metrics                                     | Real artifact counts per CTD section, context menu with Cut/Paste/Place       | **REAL AND WIRED** |
| 3   | **Template Tree**        | Left rail (mode='templates') |                  ✅ PWS L~500                   |     YES (delegates via callback)      | POST /artifacts (via handleCreateFromTemplate)                            | Click + → creates artifact with templateId + ctdSection                       | **REAL AND WIRED** |
| 4   | **Outline Tree**         | Left rail (mode='outline')   |                  ✅ PWS L~510                   |                  NO                   | N/A (parses editor HTML)                                                  | Dual mode: document headings + template structure alignment                   | **REAL AND WIRED** |
| 5   | **Document List Pane**   | Center (mode='browse')       |                  ✅ PWS L~420                   |                  NO                   | GET /artifacts                                                            | Click row → opens in editor                                                   | **REAL AND WIRED** |
| 6   | **Editor Panel**         | Center (mode='edit')         |                ✅ PWS L62 (lazy)                | YES (auto-create from initialContent) | POST /artifacts, PUT /artifacts/:id, GET+PUT /signatures, GET /provenance | Full lifecycle: create, save, version, export, sign, lock                     | **REAL AND WIRED** |
| 7   | **Placement Dialog**     | Modal overlay                |                  ✅ PWS L~550                   |                  NO                   | PUT /artifacts/:id/placement                                              | 3 ops (place/relocate/reclassify), reason ≥5 chars, CTD regex, lock check 423 | **REAL AND WIRED** |
| 8   | **Transform Canvas**     | Phase 4 panel overlay        |        ✅ PWS (phase4Panel='transform')         |   YES (delegates via onCreateDraft)   | GET /transform-context                                                    | 5-lane pipeline, fetches real project data, creates governed drafts           | **REAL AND WIRED** |
| 9   | **Verification Panel**   | Phase 4 panel overlay        |       ✅ PWS (phase4Panel='verification')       |                  NO                   | GET /artifacts/:id/verification                                           | 4-dimension check (CTD, template, evidence, governance), confidence labels    | **REAL AND WIRED** |
| 10  | **Program Twin**         | Phase 4 panel overlay        |           ✅ PWS (phase4Panel='twin')           |                  NO                   | GET /program-twin                                                         | 6-dimension state model, deterministic/heuristic labels, problems list        | **REAL AND WIRED** |
| 11  | **Submission Apps**      | Phase 4 panel overlay        |           ✅ PWS (phase4Panel='apps')           |          YES (handleRunApp)           | POST /artifacts                                                           | 6 apps, each creates governed artifact with app-specific scaffold             | **REAL AND WIRED** |
| 12  | **Editor: Intelligence** | Right inspector tab          | ✅ EditorPanel (activeInspector='intelligence') |      NO (delegates via callback)      | GET /fda-precedents, GET /lumen-cortex, GET /csr-search                   | 5-tab intel: Insights, Precedents, Risk, Strategy, Evidence                   | **REAL AND WIRED** |
| 13  | **Editor: Provenance**   | Right inspector tab          |  ✅ EditorPanel (activeInspector='provenance')  |                  NO                   | GET /artifacts/:id/provenance                                             | 6-section audit trail, signature roster, hash chain, export CSV               | **REAL AND WIRED** |
| 14  | **Editor: Compare**      | Right inspector tab          |   ✅ EditorPanel (activeInspector='compare')    |                  NO                   | GET /artifacts/:id/versions                                               | Word-level + line-level diff, metadata delta                                  | **REAL AND WIRED** |
| 15  | **Editor: Audit**        | Right inspector tab          |    ✅ EditorPanel (activeInspector='audit')     |                  NO                   | GET /artifacts/:id/provenance                                             | Inspection-ready report, export PDF/JSON                                      | **REAL AND WIRED** |
| 16  | **Section Requirements** | Right sidebar                |              ✅ PWS (when editing)              |                  NO                   | N/A (static data from TEMPLATE_STRUCTURE_MAP)                             | Expected subsections, regulatory refs, signal alignment                       | **REAL AND WIRED** |

### Summary

- **16 surfaces** compose into ProjectWorkspaceShell
- **ALL 16 are REAL AND WIRED** — connected to real APIs and real DB tables
- **4 surfaces create artifacts**: ProjectWorkspaceShell (2 handlers), EditorPanel (auto-create), SubmissionAppsPanel (app runner) — all use the same `POST /api/concept2cure/projects/:id/artifacts` endpoint
- **0 surfaces are partial, duplicate, or dead** within the workspace composition

---

## Surfaces Outside the Canonical Workspace

| #   | Surface                          | Location                         | Status                                             |                   Conflict with Canonical?                    | Verdict          |
| --- | -------------------------------- | -------------------------------- | -------------------------------------------------- | :-----------------------------------------------------------: | ---------------- |
| 17  | ConvergentCanvas (canvas/)       | Concept: Phase 52 command center | Separate routing system                            |                NO — does not create artifacts                 | **DO NOT TOUCH** |
| 18  | ConvergentCanvas (layout/)       | Layout wrapper for above         | Separate routing system                            |                       NO — layout only                        | **DO NOT TOUCH** |
| 19  | EditorCanvas (routes/authoring/) | Legacy TipTap route              | Uses `/api/documents/:docId` (different API)       |                NO — different system entirely                 | **DO NOT TOUCH** |
| 20  | EditorPage (routes/authoring/)   | Legacy authoring page            | Uses `/api/documents/:docId`                       |                     NO — different system                     | **DO NOT TOUCH** |
| 21  | DossierTree (routes/authoring/)  | Legacy CTD tree                  | Hardcoded mock structure                           |                      NO — not connected                       | **DO NOT TOUCH** |
| 22  | ComprehensiveCMCPlatformClean    | CMC data platform                | Uses `stability_studies` + `save-docx-as-artifact` |      PARTIAL — creates artifact but doesn't open editor       | **NEEDS BRIDGE** |
| 23  | eCTDCoAuthor                     | Sherpa-style authoring           | Stateless presentation                             | NO — delegates via callbacks to ZenApp → pendingEditorContent | **DO NOT TOUCH** |
| 24  | IndustryWorkspace                | Role-specific workspace selector | Part of ConvergentCanvas system                    |                         NO — isolated                         | **DO NOT TOUCH** |

---

## Architecture Zones

### Zone 1: ProjectWorkspaceShell Ecosystem (CANONICAL)

- **16 wired surfaces** — all real, all connected
- Single artifact creation endpoint
- Single editor
- Single placement mechanism
- Full provenance + audit

### Zone 2: Convergent Canvas System (ISOLATED)

- Phase 52 vision surfaces
- No artifact creation
- No conflict with Zone 1
- **Do not touch**

### Zone 3: Legacy Routes (ISOLATED)

- `/authoring/documents/[docId]/` tree
- Uses different API (`/api/documents/`)
- No connection to concept2cure
- **Do not touch**

### Zone 4: CMC Platform (NEEDS BRIDGE)

- Creates artifacts in the RIGHT table
- Emits provenance
- Missing: editor auto-open navigation
- **One client-side wiring change needed**

---

## Answer: Which Is Canonical?

**`ProjectWorkspaceShell` is the canonical Canvas/document workspace.**

All other surfaces are either:

- **Support surfaces** that compose INTO ProjectWorkspaceShell (trees, inspectors, panels, dialogs)
- **Isolated systems** that do not create artifacts and do not conflict
- **CMC** — which creates artifacts correctly but needs a navigation bridge to open them in the canonical workspace

There is exactly ONE canonical document workspace. There are ZERO competing document workspaces.
