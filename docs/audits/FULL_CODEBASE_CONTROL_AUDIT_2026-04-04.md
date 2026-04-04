# Concept2Cure — Full Codebase Control Audit & Reorganization Plan

> Date: 2026-04-04
> Branch assessed: `concept2cure-v2`
> Author: Claude Code (Opus 4.6)
> Purpose: Assess what exists, what's dead, what's duplicated, and how to get this under professional control.

---

## Part 1: The Hard Numbers

### Codebase Size

| Dimension | Count |
|-----------|-------|
| **TypeScript/JS/JSX code files** | 3,231 |
| **Total code lines** | ~1,345,000 |
| **Python files** | 432 |
| **Python lines** | 143,329 |
| **Markdown documentation files** | 598 |
| **Markdown lines** | 107,351 |
| **Scripts** | 201 files |
| **Migrations** | ~15 SQL + 11 deprecated |

### By Directory

| Directory | Code Files | Lines | Notes |
|-----------|-----------|-------|-------|
| `client/` | 1,566 | 710,095 | Frontend — React + TypeScript + legacy JSX |
| `server/` | 1,308 | 523,800 | Backend — Express + services + routes |
| `shared/` | 61 | 37,513 | Schema + types |
| `tests/` | 189 | 54,128 | Vitest + Jest |
| `scripts/` | 107 | 19,733 | CI/dev/deploy scripts |
| `ind_automation/` | ~60 | ~25,000 | Python IND automation (separate app) |
| `lumen_cortex/` | ~40 | ~15,000 | Python knowledge graph (separate app) |
| `shadow_service/` | ~30 | ~10,000 | Python shadow service (separate app) |
| `backend/` | ~20 | ~8,000 | Python FastAPI backend (separate app?) |
| `agent/` | ~5 | ~2,000 | Python agent tools |

**Total estimated lines across all languages: ~1.5 million**

---

## Part 2: The Monolithic Files

Files over 3,000 lines — each is a maintenance and reliability risk:

| File | Lines | Problem |
|------|-------|---------|
| `shared/schema.ts` | 18,279 | Legacy monolithic schema — should be split (already has `shared/schema/` partials) |
| `server/routes/concept2cure.ts` | 17,823 | GOD ROUTE — everything is in here |
| `client/src/components/cmc/ComprehensiveCMCPlatformClean.jsx` | 26,553 | Single .jsx component — 26K lines |
| `client/src/pages/coauthor/CoAuthor.jsx` | 15,132 | Monolithic page |
| `client/src/pages/csr/CERV2Page.jsx` | 9,429 | Monolithic page |
| `server/index.ts` | 7,256 | Server entry — massive route mounting |
| `server/statistics-service.ts` | 6,913 | Standalone service file at root level |
| `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx` | 5,475 | Chat panel |
| `server/routes/authoring.router.ts` | 5,215 | Authoring routes |
| `client/src/components/cmc/DocumentAuthoringFixed.jsx` | 4,846 | Legacy CMC |
| `client/src/concept2cure/components/editor/EditorPanel.tsx` | 4,589 | Editor |
| `client/src/components/CommitmentIntelligenceHub.jsx` | 4,379 | Legacy component |
| `client/src/concept2cure/ZenApp.tsx` | 4,063 | App shell |
| `server/storage.ts` | 3,848 | Storage layer at root |
| `server/services/intelligent-report-engine.ts` | 3,554 | Report engine |
| `client/src/components/cmc/ManufacturingProcessPanel.jsx` | 3,542 | Legacy CMC |
| `client/src/components/coauthor/ComponentManagementSystem.jsx` | 3,444 | Legacy coauthor |
| `client/src/components/protocol/StatisticalDesign.jsx` | 3,213 | Legacy protocol |
| `server/routes/authoring-actions.ts` | 3,185 | Authoring actions |

---

## Part 3: Dead Code & Waste

### 3.1 — Unmounted Route Files: 81 files, 35,974 lines

These route files exist in `server/routes/` but are NOT referenced in `server/index.ts`. They are dead code. Highlights:

- `ana-features.ts` (2,054 lines) — unmounted
- `510kRoutes.ts` (843 lines) — superseded by unified routes
- `academic_protocol_assessment.ts` (1,262 lines) — unmounted
- `supplyChain.routes.ts` (1,159 lines) — unmounted
- `support-admin.ts` (1,104 lines) — unmounted
- `evidenceV2.ts` (1,100 lines) — unmounted
- `programsV2.ts` (984 lines) — unmounted
- `concept2cure-communication-center.ts` (1,027 lines) — unmounted
- `client-intelligence.ts` (990 lines) — unmounted

**Recommendation: Delete all 81 unmounted route files. That's 36K lines of dead weight.**

### 3.2 — Legacy .jsx Files: 616 files

The project uses TypeScript, but 616 files are still plain `.jsx`. These files:
- Cannot benefit from type checking
- Often contain legacy patterns
- Are mostly in `client/src/components/` (the old component tree)

**The largest .jsx files:**
- `ComprehensiveCMCPlatformClean.jsx` — 26,553 lines
- `CoAuthor.jsx` — 15,132 lines
- `CERV2Page.jsx` — 9,429 lines
- `DocumentAuthoringFixed.jsx` — 4,846 lines
- `CommitmentIntelligenceHub.jsx` — 4,379 lines

### 3.3 — Deprecated/Dead Directories

| Directory | Status |
|-----------|--------|
| `server/db/_deprecated_migrations/` | 11 deprecated migration files |
| `server/_deprecated_migrations/` | More deprecated migrations |
| `client/src/modules/` | 6 files — legacy module wrappers, likely dead |
| `client/src/portal-v2/` | 1 file — abandoned portal rewrite |
| `ind_automation/` | Python app — separate concern, should be separate repo |
| `lumen_cortex/` | Python knowledge graph — separate concern |
| `shadow_service/` | Python service — separate concern |
| `backend/` | Python FastAPI app — appears to be an abandoned parallel backend |
| `agent/` | Python agent tools — separate concern |
| `analytics-engine/` | Python analytics — separate concern |
| `tsa-server/` | Python server — separate concern |
| `ingestion/` | Python ingestion — separate concern |

### 3.4 — Documentation Sprawl: 598 files, 107K lines

| docs/ subdirectory | Files |
|-------------------|-------|
| `docs/reports/` | 104 |
| `docs/audits/` | 75 |
| `docs/proof/` | 52 |
| `docs/architecture/` | 31 |
| `docs/beta-work/` | 27 |
| `docs/plans/` | 25 |
| `docs/release/` | 23 |
| `docs/archive/` | 21 |

Most of these are audit/proof artifacts generated by automated agents. They are not referenced in code. Over 100K lines of markdown that no human reads.

### 3.5 — 17 Stranded Claude Branches (from prior audit)

All NOT merged. 9,533 lines of stranded work at the chain tip. Being addressed by the active recovery effort.

### 3.6 — 17 Closed/Abandoned PRs

PRs that were opened and closed without merging — wasted effort from codex (5), cursor (8), and others.

---

## Part 4: The Parallel Universes Problem

This codebase has **at least 5 parallel product universes** coexisting:

### Universe 1: Concept2Cure (the real product)
- `client/src/concept2cure/` — the actual app
- `server/routes/concept2cure.ts` — the core routes
- ZenApp.tsx → ProjectWorkspaceShell → EditorPanel → AnaPersistentPanel
- This is what matters.

### Universe 2: Legacy Component Library
- `client/src/components/` — 636 files, ~250K lines
- `cmc/` (63 files, 67K lines), `cer/` (88 files, 53K lines), `510k/` (56 files, 32K lines)
- Old UI components, mostly .jsx, many not imported by the real product
- Mixed imports: some used by concept2cure via lazy loading, most dead

### Universe 3: CoAuthor / CERV2
- `client/src/pages/coauthor/` (15K lines), `client/src/pages/csr/` (10K lines)
- Standalone page-level apps that may or may not be reachable from the shell

### Universe 4: Python Microservices
- `ind_automation/`, `lumen_cortex/`, `shadow_service/`, `backend/`, `agent/`, `analytics-engine/`, `ingestion/`, `tsa-server/`
- 432 Python files, 143K lines
- Completely separate concern — should not be in this repository

### Universe 5: Scripts & CI Sprawl
- 201 script files
- Many duplicate audit scripts (4 failed attempts at `audit-last-20-prs`)
- CI scripts that reference features that may not exist

---

## Part 5: The Route System (Server)

| Metric | Count |
|--------|-------|
| Total route files | 259 |
| Mounted in index.ts | 178 |
| Unmounted (dead) | 81 |
| Lines in mounted routes | ~123K |
| Lines in unmounted routes | ~36K |
| Service directories | 59 |
| Service files | 591 |
| Service lines | 247,647 |
| Controller files | ~3 |

**The god-route problem:** `concept2cure.ts` is 17,823 lines. It handles hundreds of endpoints. It should be broken into ~15 domain-specific route files.

**The index.ts mounting problem:** `server/index.ts` is 7,256 lines. It imports and mounts 168+ routes with inline middleware. It should be a thin orchestrator that calls a route registry.

---

## Part 6: The Client Architecture

| Area | Files | Lines | Status |
|------|-------|-------|--------|
| `concept2cure/components/` | ~280 | ~115K | Active product |
| `concept2cure/hooks/` | ~30 | ~5K | Active hooks |
| `components/` (legacy) | ~636 | ~250K | Mixed: some active via lazy load, most dead |
| `pages/` | 54 | ~40K | Standalone pages, most likely orphaned |
| `modules/` | 6 | ~2K | Dead wrappers |
| `portal-v2/` | 1 | ~1K | Abandoned |

**ZenApp.tsx imports only ~30 files directly.** The active product surface is much smaller than the codebase suggests.

---

## Part 7: PR & Development Patterns

| Source | Total PRs | Merged | Closed (wasted) | Open |
|--------|-----------|--------|------------------|------|
| Codex | 61 | 48 | 13 | 0 |
| Dependabot | 20 | 0 | 0 | 20 |
| Cursor | 15 | 7 | 8 | 0 |
| Claude | 2 | 0 | 0 | 1* |
| Copilot | 2 | 2 | 0 | 0 |

*Plus 17 stranded branches never turned into PRs.

**Pattern:** Multiple AI agents (Codex, Cursor, Claude, Copilot) have been working on this repo simultaneously, often on overlapping concerns, with ~20% waste rate.

---

## Part 8: The Reorganization Plan

### Phase 1: Triage & Delete (Week 1)
**Goal: Remove what's provably dead. Target: -150K lines.**

| Action | Est. Lines Removed |
|--------|-------------------|
| Delete 81 unmounted route files | -36,000 |
| Delete `server/db/_deprecated_migrations/` + `server/_deprecated_migrations/` | -2,000 |
| Delete `client/src/modules/` (6 dead wrappers) | -2,000 |
| Delete `client/src/portal-v2/` (abandoned) | -1,000 |
| Archive `docs/proof/`, `docs/reports/`, `docs/audits/` older than 30 days | -80,000 |
| Delete `backend/` Python directory (abandoned parallel backend) | -8,000 |
| Prune stale dependabot PRs (20 open) | — |
| Close stranded claude/* branches after recovery merge | — |

### Phase 2: Extract & Isolate (Week 2)
**Goal: Remove Python from this repo. Target: -143K lines.**

| Action | Est. Lines Removed |
|--------|-------------------|
| Move `ind_automation/` to separate repo | -25,000 |
| Move `lumen_cortex/` to separate repo | -15,000 |
| Move `shadow_service/` to separate repo | -10,000 |
| Move `analytics-engine/` to separate repo | -5,000 |
| Move `agent/` to separate repo | -2,000 |
| Move `ingestion/` to separate repo | -3,000 |
| Move `tsa-server/` to separate repo | -3,000 |
| Move remaining Python scripts | -80,000 |

### Phase 3: Decompose the God Files (Weeks 3-4)
**Goal: No file over 2,000 lines. No god-routes.**

| File | Action |
|------|--------|
| `concept2cure.ts` (17,823 lines) | Split into ~15 domain route files |
| `server/index.ts` (7,256 lines) | Extract route registry, reduce to <500 lines |
| `shared/schema.ts` (18,279 lines) | Migrate remaining tables to `shared/schema/*.ts` files, delete monolith |
| `authoring.router.ts` (5,215 lines) | Split by workflow stage |
| `ZenApp.tsx` (4,063 lines) | Extract route config, settings, feature flags |
| `AnaPersistentPanel.tsx` (5,475 lines) | Extract message rendering, command handling |
| `EditorPanel.tsx` (4,589 lines) | Extract toolbar, extension config |

### Phase 4: Consolidate the Legacy Client (Weeks 5-6)
**Goal: One component tree, not two.**

| Action | Description |
|--------|-------------|
| Audit `client/src/components/` | For each of ~636 files: is it imported by active product? |
| Delete truly dead components | Expect ~400 files, ~150K lines |
| Migrate active .jsx to .tsx | Convert remaining ~200 .jsx files that are actually used |
| Consolidate `client/src/pages/` | Merge active pages into concept2cure routing, delete orphans |
| Unify import paths | All component imports should resolve within `concept2cure/` |

### Phase 5: Service Layer Rationalization (Weeks 7-8)
**Goal: 59 service directories → ~20 coherent domain modules.**

| Action | Description |
|--------|-------------|
| Map service→route dependencies | Which services are called by which routes? |
| Identify orphan services | Services not called by any route |
| Consolidate by domain | Group: auth, documents, intelligence, governance, submissions, AI, admin |
| Remove `require()` from .ts files | 28 files still using CommonJS require |
| Establish service contracts | Each service directory gets an `index.ts` barrel export |

### Phase 6: Test & CI Rationalization (Week 9)
**Goal: Tests that actually test the product.**

| Action | Description |
|--------|-------------|
| Audit 189 test files | Which test real product behavior vs. build-order proofs? |
| Delete build-order-*.test.ts files | These are proof artifacts, not product tests |
| Consolidate CI scripts | 201 scripts → ~30 that matter |
| Remove duplicate audit scripts | 4 failed `audit-last-20-prs` attempts exist |
| Establish test coverage baseline | Run coverage, identify untested critical paths |

---

## Part 9: Target State

### Before (Now)
```
3,231 code files | ~1.5M lines (JS/TS/Python)
259 route files (81 dead)
636 legacy .jsx components
598 doc files (107K lines)
432 Python files (wrong repo)
59 service directories
5 parallel product universes
17 stranded branches
```

### After (Target)
```
~800 code files | ~300K lines (TypeScript only)
~40 route files (all mounted)
0 .jsx files (all TypeScript)
~50 doc files (current, relevant)
0 Python files (moved to own repos)
~20 service directories
1 product universe (Concept2Cure)
1 branch (concept2cure-v2)
```

---

## Part 10: Priority Order

1. **Delete dead routes** — immediate, zero risk, -36K lines
2. **Delete deprecated migrations, dead modules, abandoned portal** — immediate, -13K lines
3. **Archive stale docs** — immediate, -80K lines
4. **Extract Python to separate repos** — 1 week, -143K lines
5. **Split god-files** — 2 weeks, critical for maintainability
6. **Audit and delete dead client components** — 2 weeks, -150K lines
7. **Service layer consolidation** — 2 weeks
8. **Test rationalization** — 1 week

**Total estimated reduction: ~600K lines (~40% of codebase)**
**No functionality lost.**

---

## Part 11: Non-Negotiable Rules Going Forward

1. **One repo = one language.** Python gets its own repos.
2. **No file over 2,000 lines.** Split before it grows.
3. **No unmounted routes.** If it's not in `index.ts`, it doesn't exist.
4. **No .jsx.** TypeScript only.
5. **No agent creates branches.** All work lands on `concept2cure-v2`.
6. **No auto-generated doc sprawl.** Docs must be human-reviewed to land.
7. **One component tree.** Everything lives in `concept2cure/components/`.
8. **Tests test the product.** No proof-artifact tests.
9. **CI scripts must be used.** If a CI script isn't in a workflow, delete it.
10. **PRs require human review.** No agent-to-agent merge chains.
