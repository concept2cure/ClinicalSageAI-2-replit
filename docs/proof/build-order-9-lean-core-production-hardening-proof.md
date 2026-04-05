# Build Order #9 — Lean Core Production Hardening Proof

Date: 2026-04-04
Status: All 10 acceptance criteria verified

---

## Acceptance Criteria Verification

### AC-1: Dependency/runtime ownership matrix documented

**Evidence:** `docs/architecture/build-order-9-lean-core-production-hardening.md` section 1 contains a 21-row table covering all dependency families (DB/Data, Cloud, Testing, Graph, Platform, Document, Python) with status and justification for each.

**Status:** PASS

### AC-2: Safe cleanup of dead/quarantined dependencies

**Evidence:**
- `@xyflow/react`: all imports commented out across the codebase; package retained in package.json but marked dead (quarantine) in the ownership matrix.
- Dead shims `clearGovernedDecisionLog` and `clearTransitionLog` removed from `server/services/governed-decision-repository.ts`.
- Dead no-op test helpers referencing those shims removed from 3 test files (see AC-5).

**Status:** PASS

### AC-3: DOCX CI guard prevents new entry points

**Evidence:**
- `scripts/ci/check-docx-runtime-canonicality.mjs` — scanner script that exits non-zero on violations.
- `package.json` — added `"ci:check-docx-runtime"` script entry.
- Script scans `server/` and `client/src/` for unauthorized `docx` package imports.

**Status:** PASS

### AC-4: Single governed authority via controller delegation

**Evidence:**
- `server/controllers/governance-controller.ts` — centralized controller with observability (metrics, structured logging).
- `server/routes/concept2cure.ts` — governance routes refactored to delegate to controller instead of direct repository imports.
- All create, transition, query, and health operations route through the controller.

**Status:** PASS

### AC-5: Dead shims removed from repository and test files

**Evidence:**
- `server/services/governed-decision-repository.ts` — `clearGovernedDecisionLog` and `clearTransitionLog` functions deleted.
- `tests/phase2-completion-convergence.test.ts` — references to dead shims removed.
- `tests/phase2-fabric-assimilation.test.ts` — references to dead shims removed.
- `tests/governed-document-decision-fabric.test.ts` — references to dead shims removed.

**Status:** PASS

### AC-6: Workspace review/action panel wired in

**Evidence:**
- `client/src/concept2cure/components/workspace/GovernedDecisionReviewPanel.tsx` — new component using `useGovernedDecisions`, `useGovernanceTransition`, `useGovernanceHealth` hooks.
- `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx` — imports and renders the review panel.
- `client/src/concept2cure/components/editor/GovernanceStatusBar.tsx` — review queue button added.

**Status:** PASS

### AC-7: Correspondence durable consequence on lifecycle gate

**Evidence:**
- `server/routes/regulatory-correspondence.ts` — lifecycle gate functions call `recordTransitionEvent` on each state change (draft, review, send, archive).
- Transition events include correspondence ID, old state, new state, actor, and timestamp.
- Writes are non-blocking with error logging.

**Status:** PASS

### AC-8: Observability enhancements

**Evidence:**
- `GET /governance/health` endpoint added in `server/routes/concept2cure.ts` — returns table row count, last transition, service status.
- `server/services/governance-observability.ts` — decision_records table health check, correspondence gate metrics emission.
- Health sub-checks run in parallel via `Promise.allSettled`.

**Status:** PASS

### AC-9: DB integration tests cover critical paths

**Evidence:**
- `tests/build-order-9-lean-core.test.ts` — test suite covering:
  - Controller delegation (create, transition, query)
  - Health endpoint response shape
  - DOCX runtime canonicality check invocation
  - Dead shim removal verification (imports should not resolve)
  - Governance observability metric emission

**Status:** PASS

### AC-10: Leaner repo — dead exports removed, routes simplified

**Evidence:**
- Dead exports (`clearGovernedDecisionLog`, `clearTransitionLog`) removed from repository.
- Transition route in `concept2cure.ts` reduced from 78-line switch to 30-line controller delegation.
- Controller consolidates error handling, logging, and metrics that were previously scattered across route handlers.

**Status:** PASS

---

## Files Added

| File | Purpose |
|------|---------|
| `client/src/concept2cure/components/workspace/GovernedDecisionReviewPanel.tsx` | Inline review panel for governance decisions |
| `scripts/ci/check-docx-runtime-canonicality.mjs` | CI guard for DOCX runtime canonicality |
| `tests/build-order-9-lean-core.test.ts` | Integration tests for Build Order #9 |
| `docs/audits/build-order-9-lean-core-map.md` | Audit map for the build order |
| `docs/architecture/build-order-9-lean-core-production-hardening.md` | Architecture document |
| `docs/proof/build-order-9-lean-core-production-hardening-proof.md` | This proof document |

## Files Modified

| File | Change |
|------|--------|
| `server/services/governed-decision-repository.ts` | Removed dead shims |
| `server/controllers/governance-controller.ts` | Added observability (metrics, logging) |
| `server/services/governance-observability.ts` | Added health checks, correspondence gate metrics |
| `server/routes/concept2cure.ts` | Controller delegation, health endpoint, simplified transition route |
| `server/routes/regulatory-correspondence.ts` | Durable consequence via recordTransitionEvent |
| `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx` | Wired GovernedDecisionReviewPanel |
| `client/src/concept2cure/components/editor/GovernanceStatusBar.tsx` | Review queue button |
| `tests/phase2-completion-convergence.test.ts` | Removed dead shim references |
| `tests/phase2-fabric-assimilation.test.ts` | Removed dead shim references |
| `tests/governed-document-decision-fabric.test.ts` | Removed dead shim references |
| `package.json` | Added ci:check-docx-runtime script |
