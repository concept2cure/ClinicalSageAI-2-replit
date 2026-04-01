# Stage 8 — Founder Summary: Merge Reconciliation and Canonical State Lock

**Date:** 2026-04-01
**Branch reviewed:** `concept2cure-v2` (HEAD `0e8674c3`)
**Cleanup workstream status:** Fully merged — 0 ahead, 0 behind
**Stage outcome:** COMPLETE — canonical state locked, risk matrix built, organs protected

---

## One-Sentence Truth

The prior cleanup workstream has been fully integrated into `concept2cure-v2`, eliminating
the branch-divergence risk described in the original work order. The risk has shifted from
"how do we merge" to "how do we safely improve what's already on the single branch."

---

## Key Findings

### 1. Branch state is clean — merge risk is eliminated

The cleanup workstream and `concept2cure-v2` share the same HEAD commit (`0e8674c3`).
There are 0 commits ahead and 0 behind. The prior reconciliation has already happened
through a series of merge commits visible in the git history.

### 2. The real risk is now internal complexity

| Risk | Severity | Detail |
|------|----------|--------|
| Server route duplication | **HIGH** | 6 URL prefixes have 2-4 routers mounted on the same path in server/index.ts |
| ZenApp monolith | **HIGH** | 4,265 lines concentrating project identity, routing, module hosting, handoff, and chat context |
| AnaPersistentPanel monolith | **HIGH** | 5,405 lines — the single AI chat surface, largest client component |
| concept2cure.ts API monolith | **CRITICAL** | 16,383 lines — entire product API in one file |
| server/index.ts mount complexity | **CRITICAL** | 7,911 lines with 150+ route mounts; ordering-dependent behavior |
| Auth boundary duplication | **MEDIUM** | `.ts` and `.js` variants of middleware/auth exist simultaneously |
| Test port drift | **MEDIUM** | Playwright config, spec files, and E2E files use 3 different default ports |
| TypeScript type safety | **MEDIUM** | `npm run typecheck` does not pass cleanly |

### 3. The beta-safe path is real but narrow

The product has a legitimate beta path: login → shell → project → workspace → governed
document lifecycle. This path has been validated by Stage 8 artifacts. But it is surrounded
by ~60 secondary lazy routes in App.jsx, 307 backend route files, and multiple overlapping
API families.

### 4. Test coverage is useful but thin in the critical middle

- E2E tests exist (9 in default Playwright, 10 more excluded from default run)
- Contract and tripwire tests cover shell truth and workspace integrity
- **Gap**: no authenticated browser pulse test proves the full beta click path end-to-end
- **Gap**: several known test failures (auth, guided demo, ana-ri-health)

---

## Recommended Integration Path

**Strategy: Incremental convergence on `concept2cure-v2`**

Since the branch divergence problem has been solved, all future work should happen directly
on `concept2cure-v2` in small, tested increments. No new feature branches.

| Stage | Next action | Prerequisite |
|-------|------------|-------------|
| **9** | Authenticated browser pulse certification | Stage 8 canonical state (done) |
| **10** | ZenApp domain-seam extraction | Stage 9 pulse baseline |
| **11** | Backend route ownership convergence | Stage 10 shell stability |
| **12** | AnA / artifact contract enforcement | Stage 11 API clarity |
| **13** | RC packaging and human beta readiness | All prior stages |

---

## Files Opened for Evidence

| File | What it revealed |
|------|-----------------|
| `client/src/App.jsx` (967 lines) | Root router with ~60 lazy routes; login redirects to `/concept2cure/login` |
| `client/src/concept2cure/ZenApp.tsx` (4,265 lines) | Real shell; monolithic but functional; dead renderers demoted |
| `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx` (3,499 lines) | Strongest governed surface; Phase 3 additions landed |
| `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx` (5,405 lines) | Single AI chat; largest client component |
| `client/src/concept2cure/components/sidebar/ZenSidebar.tsx` (1,255 lines) | Clean navigation; 6 global + 5 project tabs |
| `server/index.ts` (7,911 lines) | 150+ route mounts; 6 duplicate prefix families identified |
| `server/routes/concept2cure.ts` (16,383 lines) | Entire product API in one file |
| `server/routes/index.ts` (106 lines) | Explicitly deprecated; legacy aggregator |
| `server/db.ts` (434 lines) | Canonical DB; Pool + Drizzle |
| `server/db.js` (252 lines) | Shim with EventEmitter status |
| `server/middleware/auth.ts` (248 lines) | JWT middleware; dual-format (.ts/.js) |
| `server/middleware/auth.js` (244 lines) | ESM variant of auth middleware |
| `client/src/main.tsx` (26 lines) | Canonical Vite entry |
| `client/src/main.jsx` (13 lines) | Legacy entry; drop candidate |
| `playwright.config.ts` | testMatch only covers `.e2e.ts`; port drift across test files |
| `docs/beta-work/stage-8-beta-release-candidate.md` | Prior Stage 8 beta RC pack |
| `docs/beta-work/stage-8-known-limits.md` | Known failures and hidden surfaces |
| `docs/beta-work/stage-8-demo-runbook.md` | Partner demo script |

---

## Files Classified

| Classification | Count | Key files |
|---------------|------:|-----------|
| Protected organs (no deep surgery) | 7 | ZenApp, ProjectWorkspaceShell, AnaPersistentPanel, server/index.ts, concept2cure.ts, auth.ts, authoring.router.ts |
| Stable (monitor only) | 4 | ZenSidebar, main.tsx, db.ts, db.js |
| Stage 10 target | 1 | ZenApp.tsx (controlled seam extraction) |
| Stage 11 target | ~15 | Duplicate route families, auth middleware, App.jsx routes |
| Stage 12 target | ~5 | chat.ts, ana-ri.ts, AI entry points |
| Drop candidate | 1 | main.jsx |
| Extend (test net) | ~90 | E2E tests, server tests, client tests |
| Keep (documentation) | ~60 | docs/beta-work, docs/proof, docs/plans |

---

## Evidence Documents Created

| Document | Purpose |
|----------|---------|
| `docs/beta-work/CURRENT_CANONICAL_STATE.md` | Single source of truth for what the product is right now |
| `docs/beta-work/stage-8-merge-risk-matrix.md` | Risk assessment for every product-critical file family |
| `docs/beta-work/stage-8-protected-organs-lock.md` | Lock list with stage-gated unlock conditions |
| `docs/beta-work/stage-8-founder-summary.md` | This document |

---

## Conflict Risks Found

| Area | Risk | Mitigation |
|------|------|-----------|
| `/api/documents` (4+ routers) | Silent route shadowing | Stage 11: unified document API owner |
| `/api/regulatory` (2 routers) | Ordering-dependent behavior | Stage 11: merge or fence |
| `/api/ind` (2 routers) | Shared prefix, different sub-paths | Stage 11: declare canonical owner |
| Auth middleware dual-format | Caller confusion, import path divergence | Stage 11: consolidate to single format |
| Playwright port drift | False test confidence; tests may not hit the right server | Stage 9: align all E2E to single base URL |

---

## Recommendation

**The cleanup stream has landed. The next bottleneck is hardening, not reconciliation.**

1. Proceed to **Stage 9** (authenticated browser pulse) immediately — this is the prerequisite
   for everything else
2. Do not create new long-lived branches — commit directly to `concept2cure-v2`
3. Keep divergence under 10 commits before mandatory push
4. Every change must be behavior-preserving and testable in isolation
5. Protected organs cannot be deeply modified until their stage prerequisites are met

---

## Unlock Next Stage?

**Yes.** Stage 8 deliverables are complete:
- Canonical state document exists and matches live code
- Merge risk matrix covers all product-critical file families
- Protected organs are locked with stage-gated prerequisites
- Integration path is explicit and staged
- No outstanding branch divergence to reconcile

**Stage 9 (Authenticated Browser Pulse Certification) can begin immediately.**
