# Governed Export Coverage Report

**Date:** 2026-03-29
**Branch:** `concept2cure-v2`
**Sprint:** Connected Submission Workspace

---

## Export Surfaces Inventory

| Surface | Route | Uses Governed Consequence | Status |
|---|---|---|---|
| CER V2 PDF Export | `server/routes/cerv2-export-routes.ts` | Yes | Governed |
| CER V2 DOCX Export | `server/routes/cerv2-export-routes.ts` | Yes | Governed |
| CER V2 ZIP Export | `server/routes/cerv2-export-routes.ts` | Yes | Governed |
| 510(k) eSTAR Export | `server/routes/510k-estar-routes.ts` | Yes | Governed |
| Document Export Service | `server/services/documentExportService.ts` | Yes (PDF, eCTD) | Governed |
| Artifact Status Transitions | `server/routes/concept2cure.ts` | Audit logged | Governed |
| HAQ Response Export | `HAQManager.tsx` → Save as Artifact | Creates governed artifact | Governed |

---

## Governance Chain Details

### Primary Export Path: `createGovernedExportConsequence()`

**File:** `server/services/export/governedExportConsequence.ts`

**5-Record Consequence:**
1. `concept2cure_artifacts` — Export document record (type, title, metadata)
2. `concept2cure_artifact_versions` — Immutable version snapshot (content hash)
3. `concept2cure_provenance_events` — Export provenance chain (event type, action, source)
4. `regulatory_audit_logs` — 21 CFR Part 11 audit trail (GXP-relevant)
5. `concept2cure_submission_snapshots` — Immutable export snapshot (binary data)

**Safety Guards:**
- Size limit: 25 MiB default (configurable via `GOVERNED_EXPORT_MAX_BYTES`)
- Input validation: org/project/user IDs, title, content, binary output
- Degraded mode: If governance write fails, operation continues but is marked degraded
- Transactional: All 5 records created atomically

### Secondary Export Path: `registerGovernedExport()`

**File:** `server/services/compute/exportGovernance.ts`

Same 5-record chain, used by:
- `cerv2-export-routes.ts` for PDF/DOCX/ZIP
- `510k-estar-routes.ts` for eSTAR packages

---

## Policy Enforcement Points

| Gate | Where | Enforcement |
|---|---|---|
| Status transitions | `PUT /artifacts/:id/status` | Role-based permission matrix |
| Attestation | Approved/Locked transitions | Required attestation object |
| Contradiction check | Promotion to approved/locked | Blocks if unresolved contradictions with `blocks_promotion` authority |
| Review quorum | Review -> Approved | All assigned reviewers must approve |
| Regression reason | Backward transitions | Minimum 5-char reason required |
| Export governance | All export routes | 5-record consequence chain |

---

## Coverage Gaps (Intentionally Deferred)

| Gap | Risk | Recommendation |
|---|---|---|
| CI governance guard | Medium | Add CI test that asserts all export routes use `createGovernedExportConsequence` |
| Sentence-level tracing | Low (for beta) | Currently section-level; full sentence linking is Phase 3 |
| Real-time collaboration | Low (for beta) | Y.js/CRDT integration deferred to post-beta |
| Cross-reference management | Low (for beta) | Manual cross-refs work; automated tracking deferred |

---

## Existing Test Coverage

| Test File | What It Covers |
|---|---|
| `tests/routes/concept2cure-project-bootstrap.test.ts` | Bootstrap + normalizer + instructions + actions + templates |
| `tests/routes/concept2cure-regulatory-catalog.test.ts` | All regulatory catalog endpoints |
| `tests/services/export-governance.test.ts` | Export governance service (if exists) |

---

## Recommendation

For CI governance coverage guard, add a test that:
1. Scans all route files for export endpoints
2. Asserts each one calls `createGovernedExportConsequence` or `registerGovernedExport`
3. Fails CI if a new export route bypasses governance
