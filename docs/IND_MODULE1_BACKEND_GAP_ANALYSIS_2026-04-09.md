# IND Module 1 Backend Gap Analysis (Audit Date: 2026-04-09)

## Executive Summary

Current backend readiness for **completing all IND Module 1 work** is **partial**.

- **What exists:** multiple IND route families, an IND/eCTD section registry, document generation entry points, and governance primitives.
- **What blocks completion:** fragmented route surface, inconsistent Module 1 section models across services, dependency on a missing Python automation service path, storage interface/implementation drift, and limited automated test coverage for IND Module 1 critical paths.

### Readiness Score (Module 1 Backend)

| Area | Score | Notes |
|---|---:|---|
| API surface availability | 7/10 | Multiple mounted IND APIs exist, but there is overlap and duplication across `/api/ind`, `/api/ind-wizard`, `/api/ind-templates`, `/api/ind-submissions`, `/api/ind-database`, `/api/ind-automation`. |
| Canonical Module 1 data model alignment | 4/10 | Competing definitions of Module 1 sections/codes exist across registry, templates, autodraft, and placement authority. |
| Document generation for Module 1 artifacts | 5/10 | Form/cover-letter generation endpoints exist, but critical generation path depends on external/missing automation service assets. |
| Persistence and workflow durability | 4/10 | IND routes call storage methods that are defined in interface but not concretely implemented in `storage.ts` classes. |
| Validation, governance, and auditability | 6/10 | Governance controls exist in broader eCTD export path; direct Module 1 path coverage is uneven. |
| Test coverage (Module 1 backend) | 3/10 | eCTD tests exist, but no dedicated IND Module 1 API/integration tests were found. |

**Overall estimated ability to complete all IND Module 1 backend:** **~48% (yellow/red)**.

---

## Scope audited

1. Route registration and mount topology for IND and eCTD flows.
2. Module 1 section/schema definitions used by backend services.
3. IND automation/document generation dependencies.
4. Persistence layer readiness for IND project/template/submission records.
5. Existing automated test coverage relevant to Module 1 backend operations.

---

## Key Findings

### 1) Strength: IND backend surface is broad and actively mounted

The platform mounts several IND-specific route families through bootstrap registration, indicating meaningful backend investment and available API entry points. This includes legacy and unified surfaces.

**Evidence highlights**
- IND route family mounts across multiple paths in clinical-intel bootstrap.
- eCTD/coauthor and IND adjunct routes are mounted separately in document bootstrap.

**Impact**
- Positive: teams can integrate quickly against existing endpoints.
- Risk: parallel/overlapping route families increase drift and inconsistent behavior.

---

### 2) Critical gap: Module 1 canonical model is inconsistent across backend components

There are **conflicting definitions** for Module 1 section structure and placement:

- `services/regulatory/ind-ectd-sections.ts` defines Module 1 as `m1.1`…`m1.9` with nested FDA forms and additional sections.
- `server/services/ind/ind-section-registry.ts` models Module 1 as only `1.1`…`1.5`.
- `server/services/docx/templateRegistry.ts` mirrors the reduced `1.1`…`1.5` set.
- `server/routes/ind-autodraft.ts` uses yet another numbering set (`1.0`, `1.1`, `1.2`) and a mocked section list.
- `server/src/control-plane/placement-authority.ts` expects `m1` sections up to `1.15`, and maps cover letter to `m1.1`, conflicting with the other registries.

**Impact**
- Inconsistent section addressing, misplacement risk, validation ambiguity, and UI/API mismatch potential.
- Hard to guarantee “all Module 1 complete” when completion depends on which model is used.

---

### 3) Critical gap: automation path relies on missing local Python service assets

`server/ind-automation-service.ts` expects an `ind_automation` service folder and startup scripts; the repository path is not present in this workspace.

**Impact**
- Module 1 form/document generation endpoints may fail at runtime when automation service calls are exercised.
- Production confidence is reduced without an internal fallback implementation for critical Module 1 artifacts.

---

### 4) Critical gap: storage contract drift for IND entities

`server/storage.ts` declares IND project/template/submission methods at the `IStorage` interface level, but concrete `DatabaseStorage`/`MemStorage` method implementations for these IND-specific methods are not present in this file.

**Impact**
- Routes depending on `storage.getIndSubmission*` / `createIndSubmission` etc. face potential runtime failures or undefined behavior depending on code path.
- Persistence durability and handoff from wizard → coauthor may be fragile.

---

### 5) Medium gap: Module 1 autodraft route appears mock/demo oriented

`server/routes/ind-autodraft.ts` contains static section definitions and hard-coded generated narrative templates for key sections.

**Impact**
- Useful for demo acceleration, but insufficient as regulated production backend for full Module 1 completeness, provenance, and reproducibility.

---

### 6) Medium gap: Module 1 test coverage is thin

Repository tests include eCTD bundle validation and governance checks for export routes, but no focused backend test suite was found for IND Module 1 route flows (forms, section completeness checks, cross-registry consistency, persistence lifecycle).

**Impact**
- High regression risk when converging on single canonical Module 1 backend.

---

## Gap Matrix (Module 1 backend completion)

| Capability needed to claim “Module 1 complete” | Current state | Gap level | Recommendation |
|---|---|---|---|
| Single canonical Module 1 taxonomy (codes, requiredness, ownership) | Multiple conflicting definitions across 5 files | **High** | Declare one source-of-truth schema and generate downstream registries from it. |
| Deterministic API surface for Module 1 CRUD + progression | Multiple overlapping route families | **High** | Consolidate to one primary gateway/version; deprecate others behind compatibility shim. |
| Reliable generation for all Module 1 artifacts (forms + admin docs) | Endpoints exist; generation depends on missing automation service assets | **High** | Add native Node fallback for forms 1571/1572/3674 + cover letter; enforce health checks. |
| Durable persistence of submissions and workflow states | Interface exposes methods; implementation drift in storage layer | **High** | Implement and test all IND storage methods in active storage class. |
| Validation/completeness gate for “Module 1 ready” | Partial (section/progress helpers present) | **Medium** | Introduce Module 1 readiness endpoint with hard fail-closed criteria. |
| Audit trail and governance for Module 1 publish/export | Present in broader eCTD governance components | **Medium** | Bind Module 1 publish path directly to existing governance gate framework. |
| Automated tests for Module 1 backend golden path | Sparse/no focused tests found | **High** | Add route + service + persistence integration tests for initial IND + amendment. |

---

## Recommended remediation plan

### Phase A (1–2 weeks): Stabilize contracts
1. Pick and lock **one canonical Module 1 schema** (recommend `services/regulatory/ind-ectd-sections.ts` as source).
2. Align section codes used by:
   - placement authority,
   - IND section registry,
   - docx template registry,
   - autodraft route,
   - frontend consumers.
3. Introduce a CI check that fails if duplicated registries drift.

### Phase B (2–4 weeks): Fix execution path
1. Implement missing IND methods in active storage class (`DatabaseStorage` at minimum).
2. Add Module 1 “readiness gate” API:
   - verifies required sections,
   - verifies artifact existence,
   - verifies governance metadata,
   - returns structured blockers.
3. Remove hard dependency on absent `ind_automation` path by adding native fallback generation.

### Phase C (2–3 weeks): Harden for production
1. Add integration tests for:
   - create/update/retrieve IND submission lifecycle,
   - Module 1 section completeness,
   - forms generation,
   - amendment-specific requiredness,
   - fail-closed export/approval gates.
2. Add operational telemetry/SLOs for Module 1 endpoints (error rate, generation latency, completion rate).

---

## Bottom line

You have enough backend scaffolding to progress quickly, but **not enough consistency and reliability to claim full Module 1 backend completion today**. The most important blockers are:

1. **Canonical section/model drift**,
2. **Missing automation dependency path**,
3. **Storage implementation mismatch**, and
4. **Insufficient Module 1-specific test coverage**.

If the Phase A+B remediation is prioritized, you can likely move from ~48% to ~75–85% readiness in the next execution cycle.
