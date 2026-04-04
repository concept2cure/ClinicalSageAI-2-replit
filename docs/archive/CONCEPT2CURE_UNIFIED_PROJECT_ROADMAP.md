# Concept2Cure - Unified Project Roadmap (Authoritative)

Last Updated: 2026-02-10

This roadmap is the canonical plan for Concept2Cure's regulatory document engine and intelligence layer.
For day-to-day execution status, see: `CONCEPT2CURE_IMPLEMENTATION_TRACKER.md`.

---

## Phase 6 - Document Engine + Intelligence (DOCX Factory -> Predicate Intelligence)

### 6.2 - DOCX Factory Core (Templates, Versions, Program Scoping)
**Goal:** Treat regulatory templates like deployable artifacts (versioned, program-scoped, auditable).

Deliverables
- Template registry (doc_type, template_id, versions)
- Program scoping + access boundaries
- Render inputs schema + validation rules
- Basic UI to browse templates + versions

Acceptance Gates
- Create/read templates and versions via API
- Templates and versions cached + invalidated correctly
- Program boundary enforced (no cross-program access)

---

### 6.3 - Render Pipeline + Compliance Guardrails
**Goal:** Generate documents reliably + prove what happened (auditability).

Deliverables
- Render job lifecycle: created -> running -> complete/failed
- Hash verification for outputs
- Event timeline / audit entries
- Minimal compliance checks (structure + "no surprises")

Acceptance Gates
- Render completes deterministically for seed templates
- Output hash is generated + verified
- Render events show inputs hash + output hash + timestamps

---

### 6.4 - Starter Templates + Demo Packs (Click-to-Wow Data)
**Goal:** "Install -> demo -> render -> download" without writing JSON from scratch.

Deliverables
- Seed templates endpoint
- Demo packs endpoint keyed by doc_type
- Curated, non-boring starter content (regulatory-shaped)

Acceptance Gates
- Seed returns counts created/skipped
- Demo packs return structured payloads per doc_type
- Demo packs usable in UI without manual editing

---

### 6.5 - UX Loop (Install Button + Demo Autofill)
**Goal:** Make humans actually use it.

Deliverables
- Install Starter Templates button (program_id required)
- "Use Demo Inputs" dropdown in Create Render modal
- Guardrails: missing program_id banner; 403/503 friendly errors

Acceptance Gates
- program_id missing -> banner shown
- Install button triggers POST seed and shows results
- Selecting demo pack overwrites payload JSON editor

---

## Phase 6.6 - Predicate Intelligence MVP (MedTech wedge)
**North Star:** "Shadow FDA Reviewer" for predicate strategy.

### 6.6.A - Living Predicate Universe (Data Layer)
Deliverables
- FDA 510(k) clearance ingest -> local queryable dataset
- Ingest run tracking for freshness + auditability
- (Optional later) embeddings table for semantic similarity

Acceptance Gates
- Query by product_code fast (<200ms typical)
- Ingest is idempotent and logs run status start/finish/fail
- CLI supports dry-run + limit + focused codes

---

### 6.6.B - Predicate Suggestion API (Scoring + Explainability)
Deliverables
- Shadow endpoint: suggest top predicates for subject device
- Scoring breakdown + deterministic reasoning (trust-builder)
- BFF proxy with requireProgramAccess

Acceptance Gates
- Returns top 5 with reasoning + score_breakdown
- Program-guarded via BFF route
- Test suite covers sorting, limits, denial paths

---

### 6.6.C - Evidence-Linked SE Matrix (DOCX Factory Integration)
Deliverables
- New "Substantial Equivalence Matrix" DOCX template (table-first)
- Payload generator maps subject + selected predicate -> comparison_rows
- Diff flags + "discussion required" rationale

Acceptance Gates
- Generates credible SE matrix DOCX end-to-end
- Rows with differences are flagged consistently
- Render event includes predicate K-number + inputs hash

---

### 6.6.D - Defense Preview UI ("FDA Challenge Simulator")
Deliverables
- Minimal widget/page: subject device -> suggest -> select -> generate matrix
- Preview panel: readiness score + anticipated reviewer questions (v1 heuristics)
- Links to evidence placeholders / TODOs

Acceptance Gates
- Suggest -> select predicate -> generate doc works in one flow
- Preview shows readiness score + warnings
- No dead ends: clear error messages, retry paths

---

## Repo Governance
- Every phase ships as small PRs with tests.
- No "big bang" merges.
- Each PR must include: acceptance gates + test evidence.
