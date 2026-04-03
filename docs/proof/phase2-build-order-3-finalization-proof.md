# Build Order #3 — Fabric Finalization Proof

## Date: 2026-04-03
## Tests: 84/84 passing

---

## 1. Production route call sites found

| # | File | Line | Old Pattern | Status |
|---|------|------|------------|--------|
| 1 | server/api/cmc/module3OperatingSystemRoutes.ts | ~398 | evaluateGovernedDocument + interceptFabricDecision | MIGRATED |
| 2 | server/api/cmc/module3OperatingSystemRoutes.ts | ~520 | evaluateGovernedDocument + interceptFabricDecision | MIGRATED |
| 3 | server/api/cmc/module3OperatingSystemRoutes.ts | ~704 | evaluateGovernedDocument + interceptFabricDecision | MIGRATED |
| 4 | server/routes/concept2cure-communication-center.ts | ~825 | evaluateGovernedDocument + interceptFabricDecision | MIGRATED |
| 5 | server/routes/concept2cure-communication-center.ts | ~963 | evaluateGovernedDocument + interceptFabricDecision | MIGRATED |
| 6 | server/routes/concept2cure.ts | ~7067 | evaluateGovernedDocument + interceptFabricDecision | MIGRATED |

## 2. Routes migrated to coupled evaluation

All 6 routes now use `evaluateAndInterceptGovernedDocument()`. Zero remaining calls to manual `evaluateGovernedDocument()` or `interceptFabricDecision()` in any route file.

## 3. Manual interception patterns removed

All `try { interceptFabricDecision({...}) } catch {}` blocks removed from routes. The `interceptFabricDecision` import was removed from all 3 route files.

## 4. Durable persistence design

Governed decisions are now durably persisted via `persistGovernedDecisionDurably()` in governed-decision-service.ts. This function bridges to the existing `decisionRecordService.create()` which writes to the `decision_records` table in PostgreSQL. Fields mapped: organizationId, projectId, decisionCode, title, domainTrack, recommendationType, confidenceLevel, decidedBy, notes (full JSON), decisionContext (structured). Persistence is non-blocking — failures are logged but don't break evaluation.

## 5. ReadinessEvaluationService disposition

| Caller | Classification | Action |
|--------|---------------|--------|
| GovernanceBoundaryService | Was production-governance (already migrated in completion pass) | N/A — already delegates to fabric |
| regulatory/readinessEvaluator.ts | Separate module, own evaluateReadiness() | RETAINED — different concern (regulatory scoring) |
| report-os/orchestrator.ts | Uses regulatory/readinessEvaluator, not readiness-evaluation-service | RETAINED — reporting |
| evals/gaReadinessService.ts | Own evaluateReadiness() for GA scorecards | RETAINED — different concern |
| readiness-evaluation-service.ts itself | Zero callers | **DELETED** — dead code permanently removed |

## 6. Inspection

Control-plane routes at `/api/control-plane/governed/decisions` serve governed decisions from in-memory log. Durable persistence now also writes to `decision_records` table queryable through existing infrastructure.

## 7. Dead code removed
- `server/services/readiness-evaluation-service.ts` — deleted (zero callers)
- `AUDIT_REPORT_BUILD_ORDER_1.md` — deleted (stray root-level file from audit agent)
- All manual `interceptFabricDecision` imports and call blocks from routes — deleted

## 8. Test results
```
Test Files  3 passed (3)
     Tests  84 passed (84)
  Duration  785ms
```
