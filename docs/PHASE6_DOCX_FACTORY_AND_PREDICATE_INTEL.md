# Phase 6 Execution Plan - DOCX Factory + Predicate Intelligence

Last Updated: 2026-02-10

This is the detailed execution plan for Phase 6.2-6.6 with file maps, endpoints, and CI gates.

---

## Current Reality (as-built)

- 6.5 UX loop exists: seed install UI + demo packs autofill (PR #131)
- 6.6.A has started: ingest run tracking + ingest tests (commit referenced in tracker)
- Python test speed + signer/hsm test stability has been hardened

(For exact status and branch truth, see `CONCEPT2CURE_IMPLEMENTATION_TRACKER.md`.)

---

## 6.2-6.5: DOCX Factory - What "Good" Means

### Quality Bar (Non-negotiable)

- Fast: templates load, renders start immediately
- Deterministic: same inputs hash -> same outputs hash (unless template version changes)
- Auditable: events record who/what/when, not vibes
- Safe UX: clear program_id required + friendly 403/503 errors

### File/Module Map (existing patterns)

- BFF routes: `server/routes/docx-factory.ts`
- Hooks: `client/src/hooks/use-docx-factory.ts`
- UI: `client/src/pages/DocxFactory.tsx`
- Tests: `tests/docx-factory-ui.test.ts`, `server/__tests__/routes/docx-factory.test.ts`

---

## 6.6: Predicate Intelligence - Detailed Build Plan

### 6.6.A - Data Layer (already in motion)

**Deliverables**

- Tables:
  - `fda_510k_clearances` (core clearances)
  - `fda_ingest_runs` (freshness + audit)
  - (later) `predicate_safety_signals`, `predicate_lineage`, `fda_510k_embeddings`
- Job:
  - `shadow_service/jobs/ingest_fda_510k.py` (idempotent)
- SQL helper:
  - `shadow_service/sql_fda_universe.py` (query/insert helpers)
- Tests:
  - `shadow_service/tests/test_ingest_fda_510k.py` (sync-friendly)

**Gate**

- `python -m shadow_service.jobs.ingest_fda_510k --dry-run --limit 50` works
- Ingest run row created for start and updated for success/failure
- Query by product_code returns quickly

---

### 6.6.B - Predicate Suggestion Engine (NEXT)

**Goal:** 5 ranked predicates + explainability + program guard.

#### Shadow Endpoint

- `POST /device/predicate-suggest`
- Input: `{ program_id, product_code, device_description, intended_use?, technology?, materials?, tissue_contact?, duration?, software? }`
- Output: `{ suggestions: [ ...top5 ], generated_at, subject_hash }`

#### Scoring (v1 deterministic, trust-building)

Hard filters:

- product_code match
- decision_code = 'SE'
  Soft scoring:
- text match (FTS rank on device_name + txt_content)
- recency boost (small)
- completeness bonus (has txt_content/summary_url)

Return fields per suggestion:

- `k_number`, `device_name`, `decision_date`
- `similarity_score`
- `strategy_recommendation`: CONSERVATIVE/BALANCED/AGGRESSIVE
- `reasoning`: deterministic sentence (no LLM required)
- `score_breakdown`: structured weights
- `matched_terms`: up to 5 top terms
- `flags`: e.g., MISSING_SUMMARY_TEXT, OLD_PREDICATE, LOW_MATCH

#### BFF Proxy Route

- `POST /api/predicate-intel/suggest?program_id=...`
- Middleware: JWT + `requireProgramAccess(program_id)`
- Proxies to Shadow

#### Tests

- Shadow pytest: sorting, limit, reasoning non-empty, flags
- BFF vitest: auth, program access, proxy behavior

**Gate**

- One curl call returns 5 ranked predicates with breakdown + reasoning
- 100% program boundary enforcement via BFF
- CI green

---

### 6.6.C - SE Matrix Generator (DOCX Factory hook-in)

**Goal:** Select predicate -> generate SE matrix doc fast.

Deliverables

- New DOCX template: `510k_substantial_equivalence_matrix_v1`
- Payload generator (Shadow): subject + predicate -> `comparison_rows[]`
- Diff rules (v1):
  - identical -> EQUIVALENT
  - material change -> DISCUSSION_REQUIRED
  - energy source change -> SIGNIFICANT
- Render event logs: chosen predicate k_number, inputs hash, template_version

Tests

- Snapshot payload test (stable rows)
- Render smoke test (doc generates + has table)

Gate

- One flow produces a credible SE matrix DOCX end-to-end

---

### 6.6.D - Defense Preview UI (small, lethal demo)

**Goal:** "Shadow FDA Reviewer" feel without building a full BI app.

Deliverables

- UI widget/page:
  - subject device form
  - suggest button
  - predicate cards w/ strategy + flags
  - generate SE matrix button
- Preview panel (heuristic v1):
  - readiness score
  - likely questions (based on diffs + missing evidence)
  - warnings

Gate

- End-to-end demo works: input -> suggest -> select -> generate -> download -> verify hash

---

## PR Plan (mergeable, no drama)

- PR 6.6.B: Suggest endpoint + BFF proxy + tests
- PR 6.6.C: Template + generator + render smoke test
- PR 6.6.D: UI wiring + vitest
