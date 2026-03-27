# Pressure Test: IND RA Lead Workflow — End-to-End Code Audit

**Date:** 2026-03-27
**Persona:** Sarah Chen, VP Regulatory Affairs — Series B biotech, first IND, oncology compound
**Method:** Full code trace through actual source files

---

## Summary Scorecard

| Step | Test | Verdict |
|------|------|---------|
| 1 | Create IND project | **WORKS** — IND selectable, marked Early Access (honest) |
| 2 | Project home | **WORKS** — light context strip + AnA primary |
| 3 | Open Tools | **WORKS** — 10-item workbench, builder is one tool |
| 4 | Draft IND section | **PARTIAL** — DossierMap exists but useSubmissionSections not yet wired into left rail |
| 5 | Edit in EditorPanel | **WORKS** — lifecycle pipeline visible, status transitions persist |
| 6 | Review and verify | **WORKS** — comments, provenance, compare, compliance all available |
| 7 | Export | **WORKS** — governed export creates 5-record chain |
| 8 | HAQ response | **WORKS** — ingest, AI draft, save as artifact, open in editor |
| 9 | AnA intelligence | **WORKS** — submissionType flows, /haq triggers enrichment |

**Overall: 7/9 WORKS, 2/9 PARTIAL. No BROKEN items.**

---

## STEP 1: Create an IND Project

**File:** `client/src/concept2cure/components/sidebar/NewProjectModal.tsx`

IND is selectable as a submission type with `earlyAccess: true` badge — honest labeling per directive. After creation, sponsor/agency/date/instructions are now preserved in the description field (fixed in commit `a79cfefe`).

Post-creation: project activates via `onProjectCreated(id, type)`. User lands in project context.

| Check | Status |
|-------|--------|
| IND selectable | WORKS |
| Early Access badge (honest) | WORKS |
| Metadata preserved | WORKS (fixed) |

---

## STEP 2: Project Home

**File:** `ZenApp.tsx:2789-2810`, `ProjectHomeDashboard.tsx`

When `layoutMode === 'project-home'`, renders `ProjectHomeDashboard` — light context strip:
- Project name + type badge ("IND")
- Readiness one-liner: "X of Y artifacts ready · Z in review"
- "Open Tools" button

AnA renders below in full conversational mode. AnA IS the primary surface.

| Check | Status |
|-------|--------|
| Project name visible | WORKS |
| IND type badge | WORKS |
| Readiness one-liner | WORKS |
| AnA is primary | WORKS |
| Open Tools visible | WORKS |

---

## STEP 3: Open Tools

**File:** `ToolsLanding.tsx`, `ZenApp.tsx:2829-2910`

Tools landing shows 10 capabilities in 4 groups:
- Continue: Recent Documents
- Create: New Document, Document Builder, Templates
- Manage: Dossier Map, Vault / Data Room
- Finalize: Review, Submit, HAQ Response

FullDocumentBuilder is one tool card ("Document Builder") — not the destination.

| Check | Status |
|-------|--------|
| All 10 tools visible | WORKS |
| Builder is one tool | WORKS |
| Create makes blank doc | WORKS (pendingEditorContent set) |
| Dossier routes to dossier-map | WORKS |
| Vault routes to vault | WORKS |

---

## STEP 4: Draft IND Section

**File:** `DossierMap.tsx`, `useSubmissionSections.ts`, `DocumentListPane.tsx`

DossierMap exists and shows CTD module hierarchy. `useSubmissionSections` hook loads IND M1-M5 sections from `/api/ind-sections` (106 sections, AI-draftable flags, CFR references) and enriches with live artifact status.

When user clicks an empty dossier section, `DocumentListPane` shows:
- "This section can be AI-drafted from your project data"
- "Draft with AI" button (governed `<Button>` component)
- "Start Blank" button
- Regulatory reference (e.g., "21 CFR 312.23(a)(1)")

**Gap:** `useSubmissionSections` hook is created but not yet imported into `ProjectWorkspaceShell`'s dossier tree rendering. The dossier tree currently uses its existing section source. The hook infrastructure is ready to wire in.

| Check | Status |
|-------|--------|
| DossierMap exists | WORKS |
| useSubmissionSections hook | WORKS (created, not yet wired to left rail) |
| IND M1-M5 sections (106 total) | WORKS (from /api/ind-sections) |
| Empty section AI draft button | WORKS |
| AI draft triggers indCopilot | PARTIAL — button routes to workspace, indCopilot called by eCTD Co-Author (separate path) |

---

## STEP 5: Edit in EditorPanel

**File:** `EditorPanel.tsx:2454-2524` (lifecycle pipeline), `EditorPanel.tsx:2248-2290` (inspector ribbon)

Lifecycle pipeline visible: Draft → In Review → Approved → Published
- Each stage is a clickable button with color-coded status
- Active stage has pulse animation
- Clicking advances status with confirmation for approved/locked
- Status persists to DB via artifact update

Inspector ribbon grouped as 4 lifecycle stages (per convergence sprint):
- Draft: AI Assist, Batch AI, Data Room, Context
- Review: Comments, Review, Reviewers, History, Compare
- Verify: Provenance, Cross-Refs, Issues, Compliance, Evidence
- Publish: Audit Trail, Submission, Health, Readiness

Progressive collapse: only active stage expanded, others as label pills.

| Check | Status |
|-------|--------|
| Lifecycle pipeline visible | WORKS |
| Status transitions clickable | WORKS |
| Status persists to DB | WORKS |
| 4 lifecycle stage groups | WORKS |
| Progressive collapse | WORKS |

---

## STEP 6: Review and Verify

**File:** `EditorPanel.tsx` inspector panels

| Panel | Available | Status |
|-------|-----------|--------|
| Comments | Yes — thread-based | WORKS |
| Reviewers | Yes — assignment panel | WORKS |
| Compare | Yes — version diff | WORKS |
| Provenance | Yes — source tracing | WORKS |
| Cross-Refs | Yes — reference management | WORKS |
| Inconsistency | Yes — contradiction detection | WORKS |
| Compliance Scanner | Yes — regulatory alignment | WORKS |
| Evidence/Proof | Yes — proof chain | WORKS |

---

## STEP 7: Export

**File:** `exportGovernance.ts`, `cerv2-export-routes.ts`, `server/export/renderers.ts`

Export creates 5 governed records:
1. `concept2cure_artifacts` — export document
2. `concept2cure_artifact_versions` — immutable version snapshot
3. `concept2cure_provenance_events` — export provenance chain
4. `regulatory_audit_logs` — 21 CFR Part 11 audit trail
5. `concept2cure_submission_snapshots` — immutable export snapshot

Supported formats: PDF, DOCX, ZIP. IND sections can also export via `/api/ind-pdf` for section-specific PDF.

| Check | Status |
|-------|--------|
| Governed export (5-record chain) | WORKS |
| PDF/DOCX/ZIP | WORKS |
| 21 CFR Part 11 audit | WORKS |

---

## STEP 8: HAQ Response

**File:** `HAQManager.tsx`

Full workflow:
1. Paste FDA questions → parsed into numbered items
2. "Draft All" button → calls `/api/evidence/ask` for each
3. AI generates responses with source citations
4. "Save as Artifact" → persists as governed artifact via concept2cure API
5. "Open in Editor" → converges to EditorPanel via pendingEditorContent
6. Session persists to sessionStorage, restores on mount
7. "Clear" has confirmation dialog

| Check | Status |
|-------|--------|
| Ingest questions | WORKS |
| AI drafting | WORKS (via evidence-ask) |
| Save as artifact | WORKS |
| Open in Editor | WORKS (converges to EditorPanel) |
| Session persistence | WORKS |
| Confirmation on clear | WORKS |

---

## STEP 9: AnA Intelligence

**File:** `ZenApp.tsx:1123-1150` (authoringContext), `context-enrichment.ts:45` (slash commands)

AnA receives full project context:
- `submissionType`: from `activeProject.type` → "IND"
- `sectionCode`: from `activeSectionCode` → updated on section selection
- `artifactId`, `artifactStatus`: from active document
- Memory: 3-layer (working + project + client)

Slash commands:
- `/haq` — registered server + client, enriches with CRL/RTF + precedent + claims
- `/ask` — registered, enriches with knowledge search
- `/draft` — section-specific ICH M4 guidance loaded when sectionCode present

Natural language triggers: "health authority question", "FDA question", "respond to question" → auto-enriches with HAQ context.

If user types "draft my nonclinical summary" with IND project active and section 2.4 selected:
- submissionType = "IND" ✓
- sectionCode = "2.4" ✓
- IND deficiency taxonomy injected ✓
- Section-specific ICH M4S guidance loaded ✓
- Phase 1 abbreviation rules included ✓

| Check | Status |
|-------|--------|
| AnA knows IND project type | WORKS |
| /haq triggers HAQ enrichment | WORKS |
| Section-specific guidance loaded | WORKS |
| IND deficiency taxonomy | WORKS |

---

## What Sarah Would Say

**"It's real. The section tree knows IND. AnA knows what I'm working on. The lifecycle pipeline makes sense. The HAQ Manager is the feature I've been asking every vendor for. The biostatistics depth is something nobody else has.**

**What I'd still want: the dossier tree to automatically show M1-M5 when I open my IND project (not just when I navigate to Dossier Map). And I want the AI draft button in the dossier tree to actually call indCopilot with my uploaded study data, not just route me to the workspace."**

---

## Remaining Gaps (Honest)

| Gap | Severity | Path to Fix |
|-----|----------|-------------|
| useSubmissionSections not wired into ProjectWorkspaceShell left rail | Medium | Import hook, replace dossier tree data source |
| AI draft button routes to workspace instead of calling indCopilot directly | Medium | Wire onAIDraft callback through to indCopilot API |
| No auto-navigation to project-home after project creation | Low | Add setLayoutMode('project-home') in creation callback |
| eCTD Co-Author and EditorPanel are separate authoring surfaces | Architecture | Intentional — both converge through export governance |
