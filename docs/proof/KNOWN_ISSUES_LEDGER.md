# Known Issues Ledger — Beta Release Candidate

**Generated:** 2026-04-01
**Branch:** `cursor/cleanup-workstream-integration-7784`
**Purpose:** Distinguish tolerated beta debt from blocker defects

---

## Classification

| Level | Meaning |
|-------|---------|
| **BLOCKER** | Must fix before any human beta tester sees the product |
| **HIGH** | Should fix before wider beta; tolerable for founder demo |
| **MEDIUM** | Known limitation; documented in beta test script |
| **LOW** | Cosmetic or deferred; does not affect beta path |
| **DEFERRED** | Intentionally not in scope for beta cycle |

---

## Blocker Issues

**None identified.** The core beta path (login → shell → project → workspace → AnA → artifact → editor → return) has no known blocking defects.

---

## High Issues

| # | Issue | Impact | Location | Discovered | Status |
|---|-------|--------|----------|-----------|--------|
| H-1 | `GET /api/regulatory/search` shadowed by mount order | Intelligence search unreachable | `server/index.ts` L3928 vs L7266 | Stage 11 | **FIXED** — renamed to `/intelligence-search` |
| H-2 | `GET /api/projects/find` swallowed by `/:projectId` param | Module lookup unreachable | `server/index.ts` L7083 vs L7145 | Stage 11 | **FIXED** — duplicate mount removed, callers updated |
| H-3 | `npm run typecheck` fails with broad pre-existing TS issues | Type safety not enforced at build time; runtime unaffected | Repo-wide | Stage 8 known-limits | Pre-existing; `vite build` succeeds |
| H-4 | `roleBasedAccess.test.ts` and `mfaService.test.ts` fail | Auth test drift | `tests/services/` | Stage 8 known-limits | **RESOLVED** — all 34 auth tests pass as of 2026-04-01 |

---

## Medium Issues

| # | Issue | Impact | Location | Discovered | Status |
|---|-------|--------|----------|-----------|--------|
| M-1 | Playwright port drift across test files | Some `.spec.ts` files default to 5173/3000 instead of 5000 | Various `tests/e2e/*.spec.ts` | Stage 9 | Partially addressed — config aligned |
| M-2 | `guided-demo-path.test.ts` has drift failures | Test expects old strings/routes/labels | `tests/` | Stage 8 known-limits | **RESOLVED** — all 24 guided-demo tests pass as of 2026-04-01 |
| M-3 | `ana-ri-health.test.ts` has 1 failing mocked-import | Mock drift; does not affect runtime | `tests/` | Stage 8 known-limits | **RESOLVED** — all 5 AnA RI health tests pass as of 2026-04-01 |
| M-4 | `/api/chat/stream` lacks `processResponseActions` | Streaming chat path cannot create governed artifacts | `server/routes/chat.ts` | Stage 12 | **FIXED** — `processResponseActions` added with org/project context |
| M-5 | Auth middleware exists in both `.ts` and `.js` | Caller confusion about which to import | `server/middleware/auth.ts` + `auth.js` | Stage 8 | **FIXED** — 2026-08-28: `auth.js` is now a pure re-export shim of `auth.ts` (single implementation, every resolver executes the canonical middleware); legacy-only behaviors dispositioned in the shim header; vitest.db.config.ts stopgap alias removed |
| M-6 | `main.jsx` is unused legacy entry | Dead file | `client/src/main.jsx` | Stage 8 | **FIXED** — deleted |

---

## Low Issues

| # | Issue | Impact | Location | Discovered |
|---|-------|--------|----------|-----------|
| L-1 | Dead code in ZenApp: `WorkspaceHeader`, `contextMetrics`, `submissionWorkspaceLabel`, `timelineSteps` | No runtime impact; cleanup opportunity | `ZenApp.tsx` | Stage 10 |
| L-2 | `useProjectKnowledge` hook called but result never read | Wasted API call; no visible impact | `ZenApp.tsx` | Stage 10 |
| L-3 | Orphaned route files: `programs.ts`, `programsV2.ts`, `tenants.ts`, `projects-create.ts` | Not mounted; no runtime impact | `server/routes/` | Stage 11 |
| L-4 | `server/routes/index.ts` deprecated but still present | Not mounted by `server/index.ts`; no runtime impact | `server/routes/index.ts` | Stage 11 |
| L-5 | App.jsx carries ~60 secondary lazy routes | Route museum; not visible in beta path | `client/src/App.jsx` | Stage 8 |

---

## Deferred Issues

| # | Issue | Why deferred |
|---|-------|-------------|
| D-1 | `concept2cure.ts` is 16,383 lines | Carving requires comprehensive integration tests; too risky for beta |
| D-2 | `server/index.ts` is 7,911 lines | Mount-order sensitivity requires careful staged approach |
| D-3 | `AnaPersistentPanel.tsx` is 5,405 lines | Largest client component; needs contract tests before extraction |
| D-4 | Legacy CMC AI paths bypass governed pipeline | Outside beta shell; needs future convergence |
| D-5 | Dr. Sage legacy code still in repo | Not in shell; dead code cleanup post-beta |
| D-6 | Full CRDT collaboration stack parity | Architecture decision needed; not beta-blocking |
| D-7 | Sentence-level source traceability | Deep feature; not needed for initial beta |

---

## Resolution Tracking

| Issue | Status | Resolved in | Notes |
|-------|--------|------------|-------|
| H-1 | **FIXED** | Post-Stage 11 | Renamed to `/api/regulatory/intelligence-search` |
| H-2 | **FIXED** | Post-Stage 11 | Duplicate mount removed; callers updated to `/api/project-modules/` |
| H-3 | **Known** | — | Pre-existing; `vite build` succeeds; runtime unaffected |
| H-4 | **RESOLVED** | 2026-04-01 | All 34 auth tests now pass |
| M-2 | **RESOLVED** | 2026-04-01 | All 24 guided-demo tests now pass |
| M-3 | **RESOLVED** | 2026-04-01 | All 5 AnA RI health tests now pass |
| M-4 | **FIXED** | Post-Stage 12 | `processResponseActions` added to chat/stream |
| M-6 | **FIXED** | Post-Stage 12 | `main.jsx` deleted |

### Beta-Critical Test Baseline (2026-04-01)

| Suite | Tests | Result |
|-------|------:|--------|
| AI entry-point contract | 33 | **All pass** |
| Guided demo path | 24 | **All pass** |
| AnA RI health | 5 | **All pass** |
| RBAC + MFA auth | 34 | **All pass** |
| **Total beta-critical** | **96** | **All pass** |
