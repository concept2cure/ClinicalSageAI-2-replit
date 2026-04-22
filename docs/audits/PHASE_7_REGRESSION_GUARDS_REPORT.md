# Phase 7 — Tests + Truth Tables to Prevent Regression

**Branch:** `concept2cure-v2`
**Date:** 2026-04-22
**Status:** Complete.

## Objective

Lock in the Phases 4 and 6 invariants with automated regression guards,
and clear the pre-existing chat typecheck errors that Phase 4 surfaced
but intentionally left untouched (Karpathy discipline — surgical
changes).

Two concrete deliverables:

1. **Architecture test** — `tests/routes/route-ownership.test.ts`
   enforces the Phase 6 composition-root invariant: zero inline mounts
   in `server/startup/routes.ts`, six slot functions called exactly
   once in documented order, and `register-inline-routes.ts` scoped to
   route-related imports only.

2. **Typecheck clean-up** — fix the 10 `server/routes/chat/**` errors
   that were present before Phase 4 and carried over verbatim during
   the decomposition. These were documented in
   `PHASE_4_CHAT_ROUTE_REPORT.md` and scheduled for Phase 7.

## What landed

### Files

| File | Change |
| --- | --- |
| `tests/routes/route-ownership.test.ts` | **new** — 13 architecture assertions |
| `server/bootstrap/static-data-guard.ts` | **new** — extracted from `startup/routes.ts` so the composition root truly has zero `app.use(...)` |
| `server/startup/routes.ts` | import the extracted guard; drop the inline helper |
| `server/routes/chat/send-message.ts` | `orchestratorResult` hoist; `memoryDiagnostics` type widened to `MemoryAssemblyDiagnostics` |
| `server/routes/chat/threads.ts` | narrow `req.params.threadId` to `string` at all 4 destructure sites |

Zero product behavior changes. The static-data guard helper is
byte-identical; the chat typecheck fixes are purely the minimum
annotations TypeScript needs.

### Architecture test coverage

`tests/routes/route-ownership.test.ts` groups 13 assertions into four
invariant families:

1. **`server/startup/routes.ts` is a pure composition root** (3 tests)
   - Zero `app.use(...)` calls (source-analyzed; comments and string
     literals stripped before matching).
   - Zero inline `express.static(...)` mounts.
   - Zero inline `await import('../routes/...')` — dynamic route
     imports belong in a registrar, not the composition root.

2. **`register-inline-routes.ts` exposes the documented slot API** (2 tests)
   - All six expected slot functions are declared as value exports.
   - No value exports other than the six slots (prevents drift —
     adding a seventh slot requires updating `EXPECTED_SLOTS`,
     `ROUTE_OWNERSHIP.md`, and this test in lockstep).

3. **`startup/routes.ts` wires every slot exactly once, in documented order** (7 tests)
   - One assertion per slot: called exactly once.
   - One assertion across slots: call-site positions appear in
     `EXPECTED_SLOTS` order (catches accidental re-ordering).

4. **`register-inline-routes.ts` stays within its family scope** (1 test)
   - Imports only from `../routes/`, `../services/`, `../middleware/`,
     `../auth*`, `../betaRouteManifest`, or `../src/routes/`. Catches
     regressions where new inline-routes logic grows dependencies it
     shouldn't (e.g. client-side modules or test fixtures).

All source analyses strip comments and string literals first via a
shared `stripCommentsAndStrings(source)` helper so docstring examples
and error messages don't false-positive.

Runtime imports of `register-inline-routes.ts` were avoided on purpose
— transitive loading of the route graph would turn this into a
dependency-wiring smoke test and couple the assertions to vitest path
aliasing. Source analysis is local and deterministic.

### Composition root — now truly free of inline mounts

`server/startup/routes.ts` previously contained one surviving
`app.use(...)` call inside `buildStaticBusinessDataGuard`, a factory
that returns a mount-callback passed to document/advanced-platform
registrars. Even though it's a helper factory (not an ad-hoc inline
mount), the first Phase 7 architecture test flagged it as a violation.

Fix: extracted to `server/bootstrap/static-data-guard.ts`, imported by
`startup/routes.ts`. Same function signature, same warn log, same
fail-closed behavior. Zero callers changed.

### Chat typecheck fixes (the 10 pre-existing errors)

Each fix is a minimum annotation; no runtime logic changed.

| Error | Fix |
| --- | --- |
| `MemoryAssemblyDiagnostics` not assignable to `Record<string, unknown>` (1 error) | Import `MemoryAssemblyDiagnostics` from `memory-context-assembler` and type `memoryDiagnostics` with it directly |
| `orchestratorResult` referenced outside its `try` scope (7 errors) | Import `OrchestratorOutput` from `ana-ri/orchestrator`; hoist `let orchestratorResult: OrchestratorOutput \| null = null;` before the try block; use `orchestratorResult!.…` at the post-catch response site (catch returns 503 — reaching the response implies non-null) |
| `req.params.threadId` typed `string \| string[]` (2 errors at mount-counted sites, plus 2 parallel sites that were about to fail) | Replace `const { threadId } = req.params;` with `const threadId = String(req.params.threadId);` at all 4 thread handlers — uniform narrowing, no behavior change |

Repo-wide typecheck:

```
before Phase 7:  2,501 errors
after  Phase 7:  2,491 errors  (−10 — the exact set fixed)
```

Phase 6/7 file-level:

```
server/startup/routes.ts                       → 0 errors
server/bootstrap/register-inline-routes.ts     → 0 errors
server/bootstrap/static-data-guard.ts          → 0 errors
server/routes/chat/**                          → 0 errors
tests/routes/route-ownership.test.ts           → 0 errors
```

No new regressions introduced.

### Test run

```
npx vitest run tests/routes/route-ownership.test.ts
               tests/routes/chat-governed-upload.test.ts
               tests/routes/ai-entry-point-contract.test.ts
→ Test Files  3 passed (3)
→ Tests      47 passed (47)   (13 new + 34 existing)
```

## What this does NOT cover (intentionally)

- **Full route-count reconciliation.** A harder-to-build test would
  boot the Express app, walk `app._router.stack`, and diff mounted
  paths against `ROUTE_OWNERSHIP.md`. That requires test-time
  initialization of Redis, Drizzle, and the AI Gateway, all of which
  have heavier setup needs than the static-analysis approach here.
  Parked as future work — tracked at the end of
  `ROUTE_OWNERSHIP.md`'s invariants section.

- **The other 2,491 typecheck errors.** Phase 7 only cleared the chat
  errors that Phase 4 surfaced. The rest are pre-existing codebase
  debt (legacy schema mismatches, `any` erosion in CMC routes,
  incorrect mock types) and should be addressed feature-by-feature
  rather than in a consolidation sprint.

- **UI architecture tests.** UI decomposition is deferred to the
  Claude Design bundle per CLAUDE.md; no UI-side regression guards are
  in scope.

## Closing

All architecture-consolidation phases are complete on
`concept2cure-v2`:

| Phase | Status |
| --- | --- |
| 1 — Composition root split (`server/index.ts`) | ✅ |
| 2 — Converge retrieval to one active path | ✅ |
| 3 — Separate DB runtime from DB bootstrap | ✅ |
| 4 — Decompose chat route | ✅ |
| 5 — Decompose `ProjectWorkspaceShell.tsx` | ⏸ deferred (UI → Claude Design bundle) |
| 6 — Route ownership normalization | ✅ |
| 7 — Tests + truth tables to prevent regression | ✅ |

Tripwires: `chat-governed-upload.test.ts` (Phase 4),
`ai-entry-point-contract.test.ts` (Phase 4), and
`route-ownership.test.ts` (Phase 7). Any phase that reverts these
invariants must either fix the regression or update the truth tables
and this report with a justification.
