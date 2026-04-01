# Stage 8 — Merge Risk Matrix

**Generated:** 2026-04-01
**Branch state:** `cursor/cleanup-workstream-integration-7784` is at the same commit as `concept2cure-v2` (`0e8674c3`)
**Prior workstream status:** Fully merged — no outstanding branch divergence

---

## 1. Updated Branch Assessment

The original work order assumed the cleanup workstream was 33 commits ahead and 50 behind.
The current reality is different: **the workstream has been fully integrated**. The cleanup
branch and `concept2cure-v2` share the same HEAD.

This means:

- **No merge conflict risk** from branch divergence — the prior reconciliation already happened
- **The risk has shifted inward** — duplication, monoliths, and test gaps are all on the single branch
- **Future work** on this branch will create new divergence that must be managed incrementally

---

## 2. File-Family Risk Matrix

Each product-critical file family is assessed for internal risk (code quality, duplication,
blast radius) and integration risk (likelihood of causing regressions during future changes).

### Class A — Shell and Product-Critical UI

| File | Lines | Internal risk | Integration risk | Disposition |
|------|------:|---------------|-----------------|-------------|
| `client/src/concept2cure/ZenApp.tsx` | 4,265 | **HIGH** — monolithic; concentrates project identity, routing, module hosting, handoff, chat context | **HIGH** — any change touches the entire shell | **Stage 10**: domain-seam extraction |
| `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx` | 3,499 | **MEDIUM** — large but well-scoped to workspace | **MEDIUM** — governed surface, breakage is visible | **Protected organ**: do not rewrite until pulse baseline exists |
| `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx` | 5,405 | **HIGH** — largest client component; queue types, message handling, rich rendering all in one file | **HIGH** — the single AI chat surface | **Protected organ**: harden with contract tests before extraction |
| `client/src/concept2cure/components/sidebar/ZenSidebar.tsx` | 1,255 | **LOW** — clean after cleanup; well-scoped | **LOW** — isolated navigation component | **Stable**: monitor only |
| `client/src/App.jsx` | 967 | **MEDIUM** — carries ~60 legacy lazy routes alongside canonical path | **LOW** — changes are additive, not structural | **Stage 11**: reduce route museum after backend convergence |
| `client/src/main.tsx` | 26 | **LOW** — minimal entry | **LOW** | **Stable** |
| `client/src/main.jsx` | 13 | **LOW** — legacy; not used by index.html | **NONE** | **Drop candidate**: can be deleted safely |

### Class B — Backend Core

| File | Lines | Internal risk | Integration risk | Disposition |
|------|------:|---------------|-----------------|-------------|
| `server/index.ts` | 7,911 | **CRITICAL** — all middleware, all route mounts, startServer; mount-order sensitivity | **CRITICAL** — any reorder can shadow routes silently | **Protected organ**: no deep surgery until Stage 11 route convergence |
| `server/routes/concept2cure.ts` | 16,383 | **CRITICAL** — entire product API in one file | **HIGH** — changes risk cross-contamination across domains | **Stage 11**: carve canonical route families |
| `server/routes/auth.ts` | ~50KB | **MEDIUM** — comprehensive auth routes | **MEDIUM** — auth changes affect all users | **Protected organ**: audit-only changes |
| `server/routes/authoring.router.ts` | ~174KB | **HIGH** — massive authoring workflow | **MEDIUM** — Wave 2 hardened; governed actions gate changes | **Protected organ** |
| `server/routes/chat.ts` | ~56KB | **MEDIUM** — chat infrastructure | **MEDIUM** — tied to AnA panel | **Stage 12**: contract enforcement |
| `server/routes/ana-ri.ts` | ~72KB | **MEDIUM** — RI orchestration | **MEDIUM** — core intelligence surface | **Stage 12**: contract enforcement |

### Class C — Auth/DB Infrastructure

| File | Lines | Internal risk | Integration risk | Disposition |
|------|------:|---------------|-----------------|-------------|
| `server/db.ts` | 434 | **LOW** — canonical DB layer | **MEDIUM** — everything depends on it | **Stable**: do not touch |
| `server/db.js` | 252 | **LOW** — shim over db.ts with status tracking | **LOW** — compatibility layer | **Keep**: reduces ambiguity for callers needing EventEmitter |
| `server/middleware/auth.ts` | 248 | **MEDIUM** — dual format (.ts/.js) creates confusion | **MEDIUM** — imported by different callers | **Stage 11**: consolidate to single format |
| `server/middleware/auth.js` | 244 | **MEDIUM** — same exports as auth.ts in different style | **MEDIUM** | **Stage 11**: consolidate |

### Class D — Test Net

| File/Area | Files | Internal risk | Integration risk | Disposition |
|-----------|------:|---------------|-----------------|-------------|
| `tests/e2e/*.e2e.ts` | 9 | **LOW** — working Playwright tests | **LOW** — protect the investment | **Stage 9**: extend with authenticated pulse |
| `tests/e2e/*.spec.ts` | 10 | **MEDIUM** — excluded from default testMatch; port drift | **MEDIUM** — may give false confidence | **Stage 9**: align ports, include in testMatch or remove |
| Server `__tests__/` | 73 | **LOW** — contract/smoke tests | **LOW** | **Extend selectively** |
| Client `__tests__/` | 12 | **LOW** — minimal coverage | **MEDIUM** — key components untested | **Stage 10+**: add seam tests with extraction |

### Class E — Documentation

| Area | Files | Disposition |
|------|------:|------------|
| `docs/beta-work/` | 3 (+3 new) | **Keep and extend** — stage evidence trail |
| `docs/proof/` | 30 | **Keep** — validation evidence; do not treat as source of truth by themselves |
| `docs/plans/` | 25 | **Keep** — architecture reference; consolidate stale plans periodically |
| `docs/reports/` | many | **Keep** — audit trail |

---

## 3. Duplicate Route Families — Conflict Risk Detail

These are the most dangerous integration risks because Express resolves by mount order,
and a handler on an earlier-mounted router can silently shadow a later one.

| URL prefix | Routers mounted | Conflict type | Risk level | Resolution needed |
|-----------|----------------|--------------|-----------|-------------------|
| `/api/ind` | `ind-generation.ts` (L3923) + `ind.ts` (L7022) | Shared prefix, different sub-paths | **MEDIUM** — works today because sub-paths don't overlap | Stage 11: declare canonical owner |
| `/api/regulatory` | `regulatory-registry.ts` (L3928) + `regulatoryRoutes.ts` (L7266) | Shared prefix, likely overlapping sub-paths | **HIGH** — ordering-dependent behavior | Stage 11: merge or fence |
| `/api/documents` | 4+ routers across lines 1761, 7184, 7192, 7208 + documentManagement | Stacked, partially overlapping | **HIGH** — most likely to produce silent shadowing | Stage 11: unified document API owner |
| `/api/ai` | 3 mounts (L966, L1032, L3935) | Stacked, different concerns (general, circuit-breaker, claims) | **MEDIUM** — conceptually different but confusing | Stage 11: namespace or merge |
| `/api/projects` | 3 mounts (L7083, L7145, L7146) | Same module router mounted twice + project-modules | **MEDIUM** — possible double-handling | Stage 11: deduplicate |
| `/api/programs` | 2 mounts (L1697, L1709) | Different sub-routers on same prefix | **LOW** — different sub-path concerns | Monitor |

---

## 4. Recommended Integration Strategy

### Context

Since the workstream is already merged, the recommended strategy is **incremental in-place cleanup
on `concept2cure-v2`** rather than branch-based reconciliation.

### Strategy: Incremental Convergence on Single Branch

| Step | Action | Risk mitigation |
|------|--------|----------------|
| 1 | Lock canonical state (this document) | Establishes baseline for measuring drift |
| 2 | Add authenticated pulse tests (Stage 9) | Creates a regression net before any surgery |
| 3 | Extract ZenApp domain seams (Stage 10) | Reduces blast radius of future shell changes |
| 4 | Converge backend route ownership (Stage 11) | Eliminates silent shadowing and ordering risks |
| 5 | Enforce AnA/artifact contract (Stage 12) | Prevents fragmentation of the governed pipeline |
| 6 | Package RC for human beta (Stage 13) | Proves the product works for real humans |

### Why not branch-and-merge?

- The branch divergence problem has been solved — both branches are at the same commit
- Creating a new feature branch would re-introduce the exact drift problem the work order warns about
- All work should land directly on `concept2cure-v2` in small, tested increments
- Each stage should commit and push frequently, not accumulate into a merge blob

### Merge discipline going forward

- **Maximum divergence tolerance**: 10 commits ahead before mandatory push to `concept2cure-v2`
- **Every commit must be green**: at minimum, the existing test net must pass
- **No broad rewrites**: every change must be behavior-preserving and testable in isolation
- **Protected organs require pulse baseline**: before touching any protected file, ensure the authenticated pulse pack covers its critical path

---

## 5. File Classification Table (Summary)

| Classification | Files | Count |
|---------------|-------|------:|
| **Protected organ (no deep surgery)** | ZenApp.tsx, ProjectWorkspaceShell.tsx, AnaPersistentPanel.tsx, server/index.ts, concept2cure.ts, auth.ts, authoring.router.ts | 7 |
| **Stable (monitor only)** | ZenSidebar.tsx, main.tsx, db.ts, db.js | 4 |
| **Stage 10 target (seam extraction)** | ZenApp.tsx (controlled extraction only) | 1 |
| **Stage 11 target (route convergence)** | server/index.ts mounts, duplicate route families, auth middleware consolidation, App.jsx route museum | ~15 files |
| **Stage 12 target (contract enforcement)** | chat.ts, ana-ri.ts, AI entry points | ~5 files |
| **Drop candidate** | main.jsx (legacy, unused) | 1 |
| **Extend (test net)** | tests/e2e/*.e2e.ts, tests/e2e/*.spec.ts (align), server/__tests__/ | ~90 files |
| **Keep (documentation)** | docs/beta-work/, docs/proof/, docs/plans/, docs/reports/ | ~60 files |
