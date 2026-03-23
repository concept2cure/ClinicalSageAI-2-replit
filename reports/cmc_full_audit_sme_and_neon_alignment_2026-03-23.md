# Full CMC Module Audit (SME Lens) + NEON DB/Schema Alignment

**Date:** 2026-03-23  
**Audience:** CMC Leads, RA-CMC, QA, MSAT, Tech Ops, Product/Platform Engineering

---

## 1) Executive verdict

The CMC capability breadth is strong, but operational maturity is split across two user experiences and unevenly wired in critical areas (task orchestration, evidence-gated readiness, and cross-tab context continuity). The latest refinements materially improve in-module reporting/collaboration, but additional closure work is still required for biotech-grade day-to-day operations.

---

## 2) What is now in place (validated in code)

1. **In-module Reports workspace** with title/notes, collaboration note capture, markdown export, and project attachment flow.  
2. **Cross-tab reporting data model** that composes project/substance/product/compliance signals into a unified report payload.  
3. **Project-scoped persistence** for report drafts and collaboration context (local draft continuity).  
4. **Report artifact retrieval** from project document endpoint for history traceability.  
5. **Comparability service deterministic layer** already present from prior hardening efforts.

---

## 3) Role-based fit assessment (biotech CMC staff)

## CMC Lead
- **Good:** Portfolio/project visibility, report snapshots, collaboration notes.
- **Gap:** No hard submission gate controls in the CMC page itself (readiness is still mostly soft/derived in UI).
- **Solution:** Add mandatory gate checks (stability maturity, PPQ/GMP status, batch representativeness) before report status transitions.

## RA-CMC
- **Good:** Report generation and project attachment supports dossier communication.
- **Gap:** Limited explicit section-level traceability from report lines to CTD artifacts/evidence links.
- **Solution:** Add artifact references in report metadata (`ctdSection`, `artifactIds`, `sourceDocs[]`).

## QA
- **Good:** Collaboration capture and status metrics.
- **Gap:** CAPA/deviation integration not enforced from report workspace.
- **Solution:** Add “Create linked QA task” for each collaboration note and for unresolved compliance gaps.

## MSAT / Tech Ops
- **Good:** Substance/product coverage and comparability service support.
- **Gap:** Limited process-parameter lineage and no first-class PPQ evidence checklist in report workflow.
- **Solution:** Extend report schema with PPQ checklist block and process-change lineage references.

---

## 4) NEON DB + schema alignment audit

## Findings
1. `regulatory_documents.organization_id` is required by schema and type-bound to integer.
2. Frontend report attachment may not always provide reliable org context.
3. Project route previously accepted broad payloads without strict validation for report document creation.

## Hardening applied in this pass
- `POST /api/cmc/projects/:projectId/documents` now:
  - derives `organizationId` from authenticated org context when not explicitly provided,
  - validates payload using `insertRegulatoryDocumentSchema` (required `documentType`, `title`),
  - sets sane defaults (`status`, `version`),
  - returns structured validation errors for invalid payloads.

## Remaining alignment tasks
- Add DB constraints/index strategy for report retrieval by `(project_id, document_type, created_at)`.
- Add migration check ensuring `regulatory_documents.organization_id` has consistent tenant semantics with `cmc_projects.organization_id` (currently integer vs text patterns across tables).
- Add integration test against NEON staging for report create/read with tenant-auth context.

---

## 5) Functional gaps still open + concrete solutions

## G1 — Dual-route CMC UX fragmentation (`/cmc` vs `/cmc-wizard`)
- **Risk:** inconsistent operator workflow and onboarding confusion.
- **Solution:** canonical route policy + redirect + telemetry deprecation window.

## G2 — Task orchestration not deeply integrated in Reports flow
- **Risk:** collaboration notes become static text, not executable work.
- **Solution:** one-click “convert note to task” with owner/due date + project link.

## G3 — Evidence-gated readiness still soft
- **Risk:** report may appear “ready” while critical evidence remains missing.
- **Solution:** add hard gate engine and status locks (draft -> in_review -> ready) enforced by evidence thresholds.

## G4 — CTD traceability depth
- **Risk:** reviewer-facing defensibility reduced.
- **Solution:** include section- and artifact-level provenance references in generated report metadata and render them in history views.

## G5 — Collaboration persistence currently local-first
- **Risk:** cross-user collaboration continuity can be inconsistent.
- **Solution:** persist collaboration notes as structured document metadata revisions or dedicated collaboration records.

---

## 6) Next implementation sprint (recommended)

1. **Task conversion from collaboration notes** (linked to project + module context).
2. **Readiness gate enforcement** inside Reports attach flow.
3. **CTD provenance references** in report payload and history rendering.
4. **NEON integration test suite** for report create/read path with tenant context.
5. **Route consolidation plan** for CMC primary workflow entry.

---

## 7) Final recommendation

Current implementation is directionally correct and materially improved, but to meet biotech CMC operating standards, prioritize **execution wiring** (tasks, gates, provenance, tenant-consistent persistence) over adding new UI surfaces.
