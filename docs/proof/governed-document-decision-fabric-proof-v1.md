# Governed Document Decision Fabric — Proof Document v1

## Date: 2026-04-03
## Branch: concept2cure-v2
## Fabric Version: 1.0.0

---

## 1. What Was Converged

The repository had multiple subsystems each becoming "the real operating layer" for their own lane:
- AnA control-plane kernel (request-level policy)
- CMC Module 3 OS (deterministic compilation + approval gates)
- Communication Center / Submission Center (state machines + manual flags)
- Workspace consequence layer (UI-only tracking)
- Generic governed mutation paths (contract validation per-route)

**Build Order #1 created a single shared governed document decision fabric** that unifies context resolution, readiness evaluation, placement authority, export/publish gating, consequence generation, and decision persistence into one reusable path consumed by all lanes.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                   Calling Lane                          │
│  (CMC / Communication Center / Generic Mutation / etc.) │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│           evaluateGovernedDocument()                     │
│       governed-document-evaluator.ts                     │
│                                                          │
│  1. resolveDocumentContext()     → GovernedDocumentContext│
│  2. evaluateReadiness()         → LifecycleReadinessState│
│  3. evaluatePlacementAuthority()→ PlacementAuthorityDecision│
│  4. evaluateExportGate()        → ExportGateDecision     │
│  5. evaluatePublishGate()       → PublishGateDecision     │
│  6. generateConsequences()      → DownstreamConsequence[]│
│  7. deriveDecision()            → GovernedDecisionSummary│
│  8. recordGovernedDecision()    → GovernedDecisionReference│
└─────────────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│           Control-Plane Inspection                       │
│       GET /api/control-plane/governed/*                  │
│                                                          │
│  /governed/fabric-version      → module versions         │
│  /governed/decisions           → recent decisions        │
│  /governed/decisions/summary   → aggregated summary      │
│  /governed/decisions/:id       → single decision detail  │
│  /governed/trace/:proj/:art    → artifact decision trace │
│  /governed/evaluate            → simulate evaluation     │
└─────────────────────────────────────────────────────────┘
```

---

## 3. Shared Vocabulary Introduced

All types defined in `shared/types/governed-document-fabric.ts`:

| Type | Purpose |
|------|---------|
| `GovernedDocumentContext` | Full identity + regulatory + intent context for any document action |
| `GovernedDocumentEvaluation` | Complete evaluation result (readiness + placement + gates + consequences + decision) |
| `LifecycleReadinessState` | Readiness level with score, blockers, warnings, confidence |
| `LifecycleReadinessLevel` | draft → evidence_gap → review_ready → approval_ready → export_ready → publish_ready → blocked → degraded |
| `GovernedBlockingReason` | Structured blocker with category, severity, remediation hint |
| `GovernedWarning` | Structured warning |
| `PlacementAuthorityDecision` | Placement outcome (allowed/blocked/fallback/insufficient) |
| `ExportGateDecision` | Export eligibility with gate checks |
| `PublishGateDecision` | Publish/dispatch eligibility with dispatch readiness |
| `DownstreamOperatingConsequence` | Auto-generated consequence (open_blocker, create_review, mark_not_dispatch_ready, etc.) |
| `GovernedDecisionSummary` | Overall decision outcome (allow/block/review/degraded) with rationale |
| `GovernedDecisionReference` | Persistent reference for inspection |
| `GovernedMutationIntent` | 14 canonical intents (create/update/place/relocate/promote/approve/lock/export/publish/dispatch/archive/rollback/compile/refresh) |
| `GateCheck` | Individual gate check result (passed/failed, required/optional) |
| `RegulatoryContextBinding` | Regulator body + submission type + standards |
| `ConsequenceType` | 11 consequence types |
| `BlockingCategory` | 12 blocking categories |

---

## 4. Control-Plane Extensions

New modules in `server/src/control-plane/`:

| Module | Responsibility |
|--------|---------------|
| `document-context-resolver.ts` | Resolve and validate governed context from raw input |
| `readiness-gates.ts` | Evaluate lifecycle readiness (8 levels, scored 0-100) |
| `placement-authority.ts` | Validate CTD placement with canonical document-type mapping |
| `export-publish-gates.ts` | Fail-closed export (7 checks) and publish (5+ checks) gates |
| `document-consequence-engine.ts` | Generate downstream consequences from evaluation |
| `governed-decision-service.ts` | In-memory decision persistence with query/filter/trace |
| `governed-document-evaluator.ts` | Central orchestrator — single entry point for all lanes |

---

## 5. Cross-Lane Integrations Completed

### Lane A — CMC Module 3 OS (`server/api/cmc/module3OperatingSystemRoutes.ts`)
- Readiness snapshot endpoint enriched with `governedFabric` evaluation
- Final export guard now evaluates through fabric (fail-closed convergence)
- Section approval records governed decision with full context
- 4 integration points wired

### Lane B — Communication Center / Submission Center (`server/routes/concept2cure-communication-center.ts`)
- Submission center item creation evaluates initial readiness through fabric
- Submission center status updates evaluate dispatch readiness through publish gate
- `governedFabric` state included in responses alongside existing `dispatchReady` flag
- 3 integration points wired

### Lane C — Generic Governed Mutation (`server/routes/concept2cure.ts`)
- Artifact placement route evaluates through fabric
- `governedFabric` state included in placement response
- Decision recorded with full context (document type, CTD section, lifecycle status)

### Lane D — Workspace Consequence Surfaces (`client/src/concept2cure/components/workspace/documentConsequence.ts`)
- `GovernedFabricState` interface added to workspace types
- `DocumentConsequenceRow` extended with optional `governedFabric` field
- `buildDocumentConsequenceRows` accepts `fabricStateMap` parameter
- Fabric state attached to consequence rows when available

---

## 6. Tests

52 tests across 9 test suites in `tests/governed-document-decision-fabric.test.ts`:

| Suite | Count | Coverage |
|-------|-------|----------|
| Shared Types | 4 | Factory functions, version constant, unique IDs |
| Context Resolution | 8 | Valid resolution, missing fields by intent, regulatory binding, placement context |
| Readiness Gates | 7 | All readiness levels, contradiction blocking, staleness, level comparison |
| Placement Authority | 7 | CTD validation, canonical placement, relocate blocking, fallback allowed |
| Export Gate | 6 | Full pass, content missing, approval missing, stale, contradictions, AI review |
| Publish Gate | 4 | Full pass, export missing, sequence number, sections not approved |
| Consequence Engine | 3 | Audit reference, blocker consequences, dispatch-not-ready |
| Decision Service | 5 | Record/retrieve, filter by project, summaries, artifact trace, single lookup |
| Full Integration | 6 | Complete evaluation, export block/allow, placement block, degraded, cross-lane reuse |
| Workspace Integration | 1 | GovernedFabricState propagation through consequence rows |

**Result: 52/52 passed** (388ms total)

---

## 7. Tested Paths

### Path 1: Document Update → Fabric Evaluation → Decision Logged
```
Input: update intent, artifact with content and evidence
Result: allow outcome, review_ready readiness, consequences generated, decision persisted
```

### Path 2: Export Blocked → Missing Approval
```
Input: export intent, content present, approval missing
Result: block outcome, export gate blocked, "must be approved" blocker
```

### Path 3: Export Allowed → Fully Ready
```
Input: export intent, all state ready, human review done
Result: allow outcome, export gate eligible
```

### Path 4: Placement Blocked → Invalid CTD
```
Input: place intent, invalid CTD reference
Result: block outcome, placement authority blocked
```

### Path 5: Cross-Lane Reuse
```
CMC compile with stale state → stale blocker raised
Generic placement to m5.3 → placement allowed
Both recorded in same decision log, different intents visible
```

### Path 6: Publish Gate → eCTD Sequence Check
```
Input: publish intent, NDA submission type, missing sequence number
Result: block outcome, "eCTD submissions require a sequence number" blocker
```

---

## 8. Known Limitations

1. **Decision persistence is in-memory only** — no database persistence yet for governed document decisions (kernel decision log has DB persistence, this new layer does not yet)
2. **Consequence execution is deferred** — consequences are generated but not auto-executed; lanes must handle execution
3. **CMC integration is enrichment-only** — fabric evaluation is added alongside existing logic, not replacing it (intentional for safety)
4. **Communication Center dispatch readiness** — fabric's `publishGate.dispatchReady` is surfaced alongside the existing manual `dispatchReady` flag; convergence to single source of truth is Build Order #2
5. **Workspace UI rendering** — `GovernedFabricState` is available in `DocumentConsequenceRow` but no UI component renders it yet; UI display is Build Order #2

---

## 9. Intentionally Deferred Work (Build Order #2)

| Item | Rationale |
|------|-----------|
| DB persistence for governed decisions | Needs migration; pattern exists from kernel persistent-queries |
| Hash-chain integrity for governed decisions | Should mirror kernel's tamper-evident approach |
| UI rendering of governed fabric state | Needs design review; consequence rows have the data |
| Replace manual `dispatchReady` with fabric-computed | Needs production validation of fabric accuracy first |
| Full authoring-actions.ts integration | GovernanceBoundaryService already does boundary evaluation; convergence requires careful adapter |
| CERV2 route integration | Lower priority; shares same evaluator pattern |
| Regulatory overlay rules | Fabric types support it, engine doesn't evaluate them yet |
| Self-test coverage for fabric modules | Should mirror kernel self-test pattern |

---

## 10. Files Added

| File | Purpose | Size |
|------|---------|------|
| `shared/types/governed-document-fabric.ts` | Canonical shared vocabulary | 14.7KB |
| `server/src/control-plane/document-context-resolver.ts` | Context resolution | ~4KB |
| `server/src/control-plane/readiness-gates.ts` | Readiness evaluation | ~7KB |
| `server/src/control-plane/placement-authority.ts` | Placement authority | ~6KB |
| `server/src/control-plane/export-publish-gates.ts` | Export/publish gating | ~9KB |
| `server/src/control-plane/document-consequence-engine.ts` | Consequence generation | ~6KB |
| `server/src/control-plane/governed-decision-service.ts` | Decision persistence | ~6KB |
| `server/src/control-plane/governed-document-evaluator.ts` | Central orchestrator | ~8KB |
| `tests/governed-document-decision-fabric.test.ts` | 52 tests | ~16KB |
| `docs/architecture/governed-document-decision-fabric-v1.md` | Architecture doc | 24KB |
| `docs/audits/governed-document-call-sites-v1.md` | Call-site audit | 15KB |
| `docs/proof/governed-document-decision-fabric-proof-v1.md` | This document | ~8KB |

## 11. Files Modified

| File | Changes |
|------|---------|
| `server/src/routes/control-plane.router.ts` | Added 6 governed decision inspection endpoints |
| `server/api/cmc/module3OperatingSystemRoutes.ts` | Integrated fabric into readiness, export guard, and approval |
| `server/routes/concept2cure-communication-center.ts` | Integrated fabric into submission center create/status |
| `server/routes/concept2cure.ts` | Integrated fabric into artifact placement |
| `client/src/concept2cure/components/workspace/documentConsequence.ts` | Added GovernedFabricState to consequence rows |

---

## 12. Commands Run

```bash
git checkout concept2cure-v2
git pull origin concept2cure-v2
npx vitest run tests/governed-document-decision-fabric.test.ts
```

## 13. Test Results

```
Test Files  1 passed (1)
     Tests  52 passed (52)
  Start at  16:58:50
  Duration  388ms
```
