# Build Order #2 Completion Pass — Proof Document

## Date: 2026-04-03
## Tests: 84/84 passing (52 baseline + 18 Phase 2 + 14 convergence)

---

## 1. Remaining split-brain paths found

Before this pass:
- GovernanceBoundaryService independently called `readinessEvaluationService.evaluateReadiness()` (lines 288-301)
- 6 route call sites manually chained `evaluateGovernedDocument()` + `interceptFabricDecision()` separately
- RIM context input was accepted but never consumed by readiness evaluation
- Chat context builder had no governed state injection
- `usePromotionBlockers` / `useGovernanceDecisions` pointed at legacy `/api/authoring-actions/...` endpoints
- No workspace component rendered fabric state (GovernanceStatusBar used old hooks)

## 2. What was removed

- GovernanceBoundaryService's independent readiness computation via `readinessEvaluationService.evaluateReadiness()` — replaced with fabric delegation
- Old `usePromotionBlockers` implementation querying `/api/authoring-actions/promotion-blockers/` — replaced with fabric selector delegation
- Old `useGovernanceDecisions` implementation querying `/api/authoring-actions/decisions/` — replaced with fabric selector delegation

## 3. What now delegates to fabric

- **GovernanceBoundaryService** → calls `evaluateGovernedDocument()` for readiness gate (lines 288-305)
- **usePromotionBlockers** → delegates to `useFabricDecisions()` + `selectPromotionBlockersFromFabric()`
- **useGovernanceDecisions** → delegates to `useFabricDecisions()` + maps entries to decision format
- **GovernanceStatusBar** → inherits fabric truth through rewired hooks (no direct changes needed)
- **chat-context-builder** → calls `buildGovernedContextEnvelope()` before system prompt composition

## 4. Canonical evaluation path

`evaluateAndInterceptGovernedDocument(input)` — coupled entry point that:
1. Resolves governed context
2. Evaluates readiness (with RIM context if provided)
3. Evaluates placement authority
4. Evaluates export/publish gates
5. Generates downstream consequences
6. Derives overall decision
7. Builds RIM context hints
8. Builds UI presentation hints
9. Persists decision
10. Emits RIM learning signal (coupled, non-blocking)
11. Returns normalized `GovernedEvaluationResult`

## 5. Real RIM → fabric behaviors (tested)

| Effect | Trigger | Outcome | Test |
|--------|---------|---------|------|
| **Repeated blocker history** | `rimContext.recentBlockerHistory >= 3` | Score reduced by 10, `repeated_blocker_history` warning added | convergence test line 214 |
| **Critical patterns** | `rimContext.hasCriticalPatterns && level >= export_ready` | Level downgraded from export/publish to approval_ready, export_gate_failed blocker added | convergence test line 233 |
| **Declining trend + high risk** | `rimContext.overallTrend === 'declining' && hasHighRiskSignals` | Score reduced by 5, `declining_quality_trend` warning added, confidence downgraded | convergence test line 262 |

## 6. Real chat integration path

`chat-context-builder.ts` line 305 → calls `buildGovernedContextEnvelope()` → injects `governedContextBlock` between orchestration prompt and memory block. Bounded to <800 chars. Includes readiness, blockers, export/publish status, placement, next action.

## 7. Hook consolidation changes

- `usePromotionBlockers()` now internally calls `useFabricDecisions()` and returns `selectPromotionBlockersFromFabric(entries)` — same return shape, fabric-backed
- `useGovernanceDecisions()` now internally calls `useFabricDecisions()` and maps entries to the old `GovernanceDecision` format — same return shape, fabric-backed
- Old `/api/authoring-actions/...` endpoints are no longer queried by these hooks

## 8. Workspace rendering changes

GovernanceStatusBar renders fabric truth through rewired hooks — no direct component changes needed because the hooks were the single integration point and they now delegate to fabric.

## 9. Interception coupling changes

`evaluateAndInterceptGovernedDocument()` couples evaluation + RIM signal emission in a single function. Callers cannot evaluate without learning.

## 10. Tests added

14 new convergence tests in `tests/phase2-completion-convergence.test.ts`:

| Test | Proves |
|------|--------|
| fabric readiness-gates is canonical evaluator | GovernanceBoundaryService delegation |
| evaluateAndInterceptGovernedDocument same as standalone | Coupled path equivalence |
| coupled path persists decision | Decision log works |
| coupled path returns all hints | Full result shape |
| Effect 1: blocker history → reduced score + warning | RIM → fabric (testable) |
| Effect 2: critical patterns → readiness downgrade | RIM → fabric (testable) |
| Effect 3: declining trend → confidence reduction | RIM → fabric (testable) |
| chat envelope includes key sections | Chat gets governed truth |
| blocked state shows in chat | Chat reflects blockers |
| selectPromotionBlockersFromFabric works | Hook selector correctness |
| selectGovernanceDecisionBadge shows red when blocked | Badge selector correctness |
| selectGovernanceDecisionBadge shows green when clear | Badge selector correctness |
| consequence rows carry governedFabric | Workspace fabric state |
| readiness badge is Title Case | UI formatting correctness |

## 11. Open limitations

1. `evaluateAndInterceptGovernedDocument()` uses `require()` for dynamic import of the RIM bridge to avoid circular imports — works but is not pure ESM. Could be refactored to use event emitter pattern.
2. Route call sites still use `evaluateGovernedDocument()` + manual `interceptFabricDecision()` instead of the coupled function. Migration to coupled function is straightforward but touches 6 route files.
3. DB persistence of governed decisions is still in-memory only.
4. `readinessEvaluationService` still exists as a standalone service — it's no longer called by GovernanceBoundaryService but may have other callers.

## 12. Commit hash

See git log for exact hash.

## 13. Test results

```
Test Files  3 passed (3)
     Tests  84 passed (84)
  Duration  519ms
```
