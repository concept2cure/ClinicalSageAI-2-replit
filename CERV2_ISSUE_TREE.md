# CERv2 Issue Tree (Regulatory Workbench)

This issue tree translates the CERv2 product definition into epics, stories, and acceptance criteria. It is scoped for the Client Portal → Medical Device & Diagnostics → CERv2 module and prioritizes production-grade, auditable, file-first workflows.

## Epic 0 — Non‑Negotiables (Security + Quality Gate)

### Story 0.1 — Secrets hygiene and rotation
- Acceptance criteria
  - No secrets stored in repository or sample data assets.
  - Environment variable validation errors surface at startup.
  - Support console displays missing secret warnings.

### Story 0.2 — RBAC + org boundary enforcement
- Acceptance criteria
  - Every write endpoint enforces organization and workspace scope.
  - Audit log records include actor, org, client workspace, and action.

### Story 0.3 — Audit log foundation (append‑only)
- Acceptance criteria
  - Append‑only audit events for upload, link, export, delete, and permission changes.
  - Audit export endpoint available to support staff.

### Story 0.4 — Request IDs + structured errors
- Acceptance criteria
  - Each API response contains a request ID.
  - Errors are structured and logged with request ID.

## Epic 1 — Navigation & IA: Workbench Layout

### Story 1.1 — Workbench shell layout
- Acceptance criteria
  - Left rail + center canvas + right inspector + top context bar.
  - Deep links for Programs, Evidence, Claims, Standards, Outcomes, Co‑Author, Submissions, Audit.
  - Inspector shows context for selected object.

### Story 1.2 — Program switcher + context bar
- Acceptance criteria
  - Program switcher lists programs for the selected client workspace.
  - Export status, readiness, and search are visible in the top bar.

### Story 1.3 — Command palette
- Acceptance criteria
  - Cmd/Ctrl+K opens palette.
  - Palette can navigate to key workbench areas and create Program/Evidence/Claim.

## Epic 2 — Program Model & Readiness Spine

### Story 2.1 — Program creation wizard
- Acceptance criteria
  - Program fields: device name, pathway, markets, intended use, indications.
  - Program created with initial claims seed.

### Story 2.2 — Readiness scoring engine
- Acceptance criteria
  - Score computed from claims coverage, standards coverage, outcomes substantiation, CER citations, preflight.
  - Score explanations shown in UI.

### Story 2.3 — Next best actions list
- Acceptance criteria
  - Top blockers and recommended fixes shown per program.
  - Each action links to the correct screen.

## Epic 3 — Evidence Library 2.0

### Story 3.1 — Evidence object model
- Acceptance criteria
  - Evidence has hash, mime, size, provenance, classification, metadata.
  - Evidence linked to claims, standards, outcomes, and CER sections.

### Story 3.2 — Evidence inbox + classification workflow
- Acceptance criteria
  - Uploads land in inbox until classified.
  - Evidence cannot be used in claims/standards/outcomes until classified.

### Story 3.3 — Search, filters, and preview
- Acceptance criteria
  - Filters: type, linked/unlinked, claim‑linked, standard‑linked, outcome‑linked, export‑used.
  - Preview for PDF/DOCX/TXT with metadata editor.

## Epic 4 — Claims Matrix Generator

### Story 4.1 — Claim authoring and import
- Acceptance criteria
  - Create/edit claims with type, risk, and intended use context.
  - Import claims from labeling draft.

### Story 4.2 — Evidence linking + strength scoring
- Acceptance criteria
  - Each claim shows linked evidence and strength score.
  - Gaps flagged clearly with required evidence type suggestions.

### Story 4.3 — Claims matrix export
- Acceptance criteria
  - Deterministic XLSX export.
  - Defense binder export bundles claim evidence.

## Epic 5 — Consensus Standards Navigator

### Story 5.1 — Standards library and requirements
- Acceptance criteria
  - Standards contain clauses/requirements with expected artifact types.
  - Requirements are linkable to evidence objects.

### Story 5.2 — Coverage report + missing tests
- Acceptance criteria
  - Each requirement is satisfied, missing, or needs review.
  - Exportable coverage report and missing test list.

## Epic 6 — Outcomes Substantiation Engine

### Story 6.1 — Outcomes model
- Acceptance criteria
  - Outcome fields: endpoint, timepoint, comparator, effect size, confidence.
  - Outcomes link to evidence and analytics.

### Story 6.2 — Outcomes in CER
- Acceptance criteria
  - “Use in CER” inserts structured outcome + citation in TipTap.
  - Outcome status updates affect readiness scoring.

## Epic 7 — TipTap Co‑Author as Regulated Authoring

### Story 7.1 — Evidence‑first citations
- Acceptance criteria
  - Citations reference evidence objects with provenance.
  - Exported CER includes evidence trace links.

### Story 7.2 — Section templates + checklist
- Acceptance criteria
  - Required CER sections are tracked and validated.
  - Missing citations are flagged before export.

### Story 7.3 — Comments + approvals
- Acceptance criteria
  - Comments are auditable and role‑restricted.
  - Approvals are logged with time and actor.

## Epic 8 — Submission Center (Preflight + Export)

### Story 8.1 — Preflight validation
- Acceptance criteria
  - Preflight checks required artifacts, citation completeness, standards coverage.
  - Blocking issues prevent export unless explicitly overridden.

### Story 8.2 — eCTD export + history
- Acceptance criteria
  - Exports are deterministic for identical inputs.
  - Export history includes warnings, generator version, and manifest links.

## Epic 9 — RegTrace Manifest + Attestation (Moat)

### Story 9.1 — Manifest generation
- Acceptance criteria
  - Manifest includes evidence list, claims coverage, standards coverage, outcomes map, CER citation graph.
  - Manifest stored with export.

### Story 9.2 — Attestation + diff
- Acceptance criteria
  - Export includes attestation status and signature metadata.
  - Diff view highlights evidence and coverage changes between exports.

## Epic 10 — Reviewer Mode

### Story 10.1 — Reviewer workspace
- Acceptance criteria
  - Read‑only snapshot of export with evidence traceability.
  - Reviewer questions linked to gaps and evidence.

## Cross‑cutting Test Matrix

- Unit tests: scoring engine, validators, manifest builder.
- Integration tests: upload → classify → link → export → manifest.
- E2E smoke: create program → upload evidence → link claim → run preflight → export → download.

## Immediate Next Implementation Slice (Epic 1 + Evidence Inbox shell)

1. Workbench layout shell with left rail, center canvas, right inspector.
2. Program switcher in top bar.
3. Evidence inbox with classification states (no extraction yet).
4. Command palette navigation to Programs, Evidence Inbox, Claims Matrix.
