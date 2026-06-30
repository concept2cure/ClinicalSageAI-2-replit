# Concept2Cure-v2 — Architecture Optimization Report

**Date:** 2026-04-26
**Branch:** `concept2cure-v2` @ `2f1bfd9`
**Scope:** Safe optimizations that strengthen the architecture without breaking shipped features or regulatory guarantees.

---

## TL;DR

The codebase is healthy enough to ship from (production build succeeds, three Claude Design phases are live, legacy chat tree is gone) but carries three pieces of meaningful structural debt that can be paid down **safely, incrementally, and reversibly**:

1. **One 741KB monolithic schema** (`shared/schema.ts`) imported by 202 files — the single biggest coupling surface in the repo.
2. **One 666KB mega-route** (`server/routes/concept2cure.ts`) with 153 handlers and 247 typecheck errors concentrated in it.
3. **One 171KB shell** (`client/src/concept2cure/ZenApp.tsx`) with 37 `layoutMode` branches and 0 tests.

Around these are smaller fixable issues: ~38K lines of legacy editor code awaiting Phase 3 parity, ~10 orphaned server services with zero route imports, 7 overlapping document-route files, 5 production chunks >500KB, 8 of the top 12 largest files completely untested.

This report sequences safe work in **5 sprints**. Each sprint is independent, reversible via revert, and produces verifiable wins (typecheck delta, chunk-size delta, deletion delta, test coverage delta). Nothing in this plan touches multi-tenancy isolation, 21 CFR Part 11 audit chains, or Zero Capability Loss rules without explicit sign-off.

---

## 1. Evidence

### 1.1 Hot spots (files >100KB)

| File | Size | LOC | Role | Risk profile |
|---|---|---|---|---|
| `shared/schema.ts` | 741KB | 18,279 | Monolithic Drizzle schema | **High coupling** — 202 importers; touching it is high-blast-radius |
| `server/routes/concept2cure.ts` | 666KB | ~17,938 | Mega-route, 153 handlers | **High** — 247 typecheck errors live here |
| `server/statistics-service.ts` | 219KB | — | Biostats engine | Medium — narrower import surface |
| `client/src/concept2cure/components/editor/EditorPanel.tsx` | 191KB | 4,648 | Legacy editor | **Scheduled retirement** once Phase 3 parity lands |
| `client/src/concept2cure/ZenApp.tsx` | 171KB | 4,044 | Main shell | High — 0 tests, 37 layout-mode branches, 32 embeddedModule branches |
| `server/routes/authoring.router.ts` | 168KB | 5,215 | Authoring routes | Medium — Phase 3 backbone, 34 typecheck errors |
| `server/services/ana-ri/command-executor.ts` | 163KB | 4,479 | AnA command runner | **99 typecheck errors**; investigate dead-code candidacy |
| `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx` | 147KB | — | Project shell | Medium |
| `server/routes/authoring-actions.ts` | 132KB | 3,185 | Action endpoints | Medium |
| `server/storage.ts` | 115KB | — | Storage layer | Medium |
| `server/services/intelligent-report-engine.ts` | 115KB | — | Report engine | Medium |
| `client/src/concept2cure/components/editor/UnifiedDocumentEditor.tsx` | 107KB | 2,806 | Legacy editor | **Scheduled retirement** |

**Total source: ~893,502 LOC** across `client/`, `server/`, `shared/`, `services/`, `agents/`, `tests/`.

### 1.2 Production chunk sizes (largest)

| Chunk | Size | Contains |
|---|---|---|
| `EditorPanel-*.js` | 938KB | Legacy editor — will shrink dramatically when retired |
| `CmcWizard-*.js` | 932KB | CMC module entry point |
| `CERV2Page-*.js` | 752KB | CER module entry point |
| `ZenRouter-*.js` | 728KB | ZenApp + my Phase 1/2/3 changes |
| `CoAuthor-*.js` | 589KB | Phase 3 ectd-coauthor mirror |

Vite's 500KB warning fires on **5 chunks**. The `vendor-*` chunks are already split out by `vite.config.ts:59-142` (Radix, TanStack, charts, PDF, tiptap, antd, etc.) — that work is done. The remaining oversized chunks are **page-level**, not vendor-level. Splitting more inside `ZenRouter` and `CoAuthor` is the next opportunity.

### 1.3 Typecheck error distribution (post-drizzle-zod fix, 2,914 total)

| Code | Count | Pattern |
|---|---|---|
| TS2345 | 828 | Argument-type mismatch — mostly cascade from typed-as-`unknown` parameters |
| TS2339 | 766 | Property does not exist — touches missing schema-table types and prop-shape drift |
| TS2322 | 302 | Type X not assignable to Y — prop and return-type drift |
| TS2769 | 214 | Overload mismatch — `db.insert(...).values(zodSchema)` shape issues |
| TS2353 | 68 | Unknown property in object literal |
| TS2551 | 65 | "Did you mean..." typos — real refactor debt |
| TS2349 | 59 | Not callable |
| TS2304 | 52 | Cannot find name — mostly missing imports |

**Hot files:**
- `server/routes/concept2cure.ts` — **247 errors** (the mega-route)
- `server/services/ana-ri/command-executor.ts` — 99 errors
- `client/src/portal-v2/components/admin/UserManagement.tsx` — 67 errors
- `server/services/cerGenerationService.ts` — 50 errors
- `server/routes/traceability-mapping-routes.ts` — 47 errors

### 1.4 Coupling surface (top importers)

| Module | Importers | Notes |
|---|---|---|
| `shared/schema.ts` | **202 files** | The crown jewel of coupling |
| `client/src/components/ui/index.ts` | 47 | Shadcn barrel — narrower surface, lower risk |
| Other shared/types/* and hooks/* | 25–35 each | Spread across many small barrels |

### 1.5 Test coverage (top 12 by size)

| File | Tests | Status |
|---|---|---|
| `server/routes/concept2cure.ts` (17,938 LOC) | `concept2cure.test.ts` + 7 others | **<1% effective coverage** of 17.9K LOC |
| `client/src/concept2cure/ZenApp.tsx` (4,044 LOC) | **none** | **Untested** |
| `client/src/concept2cure/components/editor/EditorPanel.tsx` (4,648 LOC) | **none** | **Untested** |
| `server/routes/authoring.router.ts` (5,215 LOC) | **none** | **Untested** |
| `server/routes/authoring-actions.ts` (3,185 LOC) | `authoring-actions.test.ts` (1K) | **Minimal** |
| `server/routes/knowledge-base.ts` (~2,500 LOC) | **none** | **Untested** |
| `server/routes/ana-features.ts` (2,054 LOC) | **none** | **Untested** |
| `server/routes/documentAuthoring.routes.ts` (2,033 LOC) | **none** | **Untested** |
| `client/src/concept2cure/components/editor/UnifiedDocumentEditor.tsx` (2,806 LOC) | **none** | **Untested** |
| `server/routes/regulatory-digital-twin.ts` (1,799 LOC) | **none** | **Untested** |
| `server/routes/auth.ts` (1,781 LOC) | `auth.test.ts` (3K) | **Minimal** |
| `server/routes/ana-cortex-ft.ts` (1,774 LOC) | **none** | **Untested** |

**8 of the top 12 largest files have ZERO tests.** Combined untested LOC: ~38K.

### 1.6 Dead-code candidates (from the Explore agent's audit)

| Path | Type | Size |
|---|---|---|
| `/db/migrations/_legacy` | directory | 536KB |
| `server/services/command-executor.ts` (or `ana-ri/`) | service | 4,479 LOC — zero route imports |
| `server/services/compliance/globalComplianceEngine.ts` | service | 1,823 LOC — no route usage |
| `server/services/.../orchestrator.ts` | service | 1,745 LOC — unclear activation path |
| `server/services/module-intelligence.ts` | service | 1,498 LOC — no route call sites |
| `server/services/grdheService.ts` | service | 1,486 LOC — orphan |
| `server/services/clinical-intelligence-service.ts` | service | 1,473 LOC — runtime-broken (calls undefined `clinicalEvaluationReports` table) |
| `client/src/concept2cure/components/editor/**` | 35-file suite | ~15 components have **zero external references** |

### 1.7 Other signals

- **245 server route files** — high count suggests fragmentation; some are <2KB stubs
- **547 service files** in `server/services/**` (195 at the top level)
- **266 SQL migrations** in `migrations/` — some likely consolidatable
- **19 schema sub-modules already extracted** from the monolith into `shared/schema/*.ts`
- **268 `console.log/warn/error` calls** in production paths (no structured logger discipline)
- **56 TODO/FIXME/HACK/DEPRECATED markers** — low debt density given the size
- **589 `queryKey:` references** in client — TanStack Query discipline is established
- **329-line route-bootstrap file** (`server/bootstrap/register-inline-routes.ts`) — already centralizes mount points

---

## 2. Recommended sequence — 5 safe sprints

Each sprint is **independent**, **reversible by `git revert`**, and produces a **measurable delta**. Sprints can run in parallel by different people; ordering reflects risk + leverage.

### Sprint 1 — Code splitting (1–2 days, **zero behavior risk**)

**Goal:** Cut 2 of the 5 oversized production chunks below 500KB.

**Files to touch:** `vite.config.ts`, lazy-import sites inside `ZenRouter`/`ZenApp.tsx`.

**Plan:**
- Lazy-import the legacy `EditorPanel` (`React.lazy()` + `Suspense`) so the 938KB chunk only loads when `layoutMode === 'editor'` is reached.
- Lazy-import `CmcWizard`, `CERV2Page` similarly.
- Add a `manualChunks` rule splitting `client/src/concept2cure/components/claude-ectd-coauthor/**` into its own chunk so the Phase 3 surface doesn't bloat `ZenRouter`.
- Run `npm run build` after each change; chunk sizes are the verifiable delta.

**Risk:** Suspense boundaries can break SSR or test setups; verify each module already has an `ErrorBoundary` parent (ZenApp does — every layout-mode branch wraps in `<ErrorBoundary>`).

**Verifiable win:** Drop initial `ZenRouter` chunk from 728KB to <400KB. Drop `EditorPanel` to load-on-demand only.

---

### Sprint 2 — Service graveyard pass (1 day, **low risk**)

**Goal:** Remove ~10 dead services + the `_legacy` migrations directory. Each is independently verifiable by a `grep` for callers.

**Files to potentially delete (verify each first):**
- `db/migrations/_legacy/` — 536KB
- `server/services/compliance/globalComplianceEngine.ts` — 1,823 LOC (only confirm `compliance-guardrails-sdk-service.ts` is the replacement)
- `server/services/module-intelligence.ts` — 1,498 LOC
- `server/services/grdheService.ts` — 1,486 LOC
- `server/services/clinical-intelligence-service.ts` — 1,473 LOC (runtime-broken)

**Plan per file:**
1. `grep -rln 'from.*<filename>' server/ client/` — confirm zero importers.
2. `grep -rln '<exported-symbol>' server/ client/` — confirm zero usages of any exported name.
3. `git rm` the file.
4. `npm run typecheck` — count delta.
5. `npm run build` — confirm bundle still builds.

**Risk:** Hidden dynamic imports (string-built paths) won't show in grep. Mitigation: run `npm run test` and `npm run build` after each deletion.

**Verifiable win:** ~10,000 LOC removed, ~100–200 typecheck errors gone.

---

### Sprint 3 — Schema extraction (2–3 days, **medium risk, very high leverage**)

**Goal:** Break `shared/schema.ts` (18,279 LOC, imported by 202 files) into domain modules. Already partially done — 19 sub-modules exist in `shared/schema/*.ts`. Continue the extraction.

**Already extracted:** `cdisc-reference`, `csr-knowledge-db`, `project-charter`, `qc-schemas`, `orchestration`, `regulatory-atoms`, `unified_workflow`, `support-admin`, `programs`, `cmc-os`, `resolution`, `ana-intelligence`, `report-os`, `api-keys`, `ctd-projects`.

**Still in the monolith:** core entity tables (`projects`, `users`, `organizations`), CSR tables (`csrReports`, `csrDetails`), CER tables, dose-escalation tables, biomarkers, and the bulk of the legacy schema.

**Plan:**
1. **Map the import graph** — for each table in `shared/schema.ts`, list its importers (use the existing 202-importer fan-out as the worklist).
2. **Cluster by domain** — group tables into ~6 new modules: `core.ts` (org/user/session/project), `csr.ts`, `cer.ts`, `clinical.ts`, `documents.ts`, `compliance.ts`.
3. **Move + re-export** — extract the cluster into a new `shared/schema/<domain>.ts`, then **re-export from `shared/schema.ts`** for backward compatibility. Importers don't break.
4. **Update one importer at a time** — switch consumers to import directly from the new module. No deadline; the re-export layer keeps the old path working.
5. **Delete the monolith only after all importers move** — long-tail cleanup.

**Risk:** Schema tables have cross-references (foreign keys in `relations()`). Move them in clusters that minimize cross-module FK chains. **Do not** change column definitions while extracting — pure move-and-re-export only.

**Verifiable win:** Each extracted module is one PR with delta = lines moved, no behavior change. Eventual win: `shared/schema.ts` shrinks from 741KB to ~50KB (a re-export shim) over multiple PRs.

---

### Sprint 4 — Test scaffolding for the giants (2 days, **zero behavior risk**)

**Goal:** Smoke-test coverage for the top 6 untested giants — at least one assertion per major surface so refactors have a tripwire.

**Files to add tests for:**
- `client/src/concept2cure/ZenApp.tsx` (4,044 LOC, 0 tests)
- `server/routes/concept2cure.ts` (17,938 LOC, <1% coverage)
- `server/routes/authoring.router.ts` (5,215 LOC, 0 tests)
- `server/routes/knowledge-base.ts` (~2,500 LOC, 0 tests)
- `server/routes/ana-features.ts` (2,054 LOC, 0 tests)
- `server/routes/regulatory-digital-twin.ts` (1,799 LOC, 0 tests)

**Plan per file:**
- For routes: a **supertest smoke** that lists handler paths, hits each with an empty/auth-rejected request, and asserts status is in `[200, 401, 400]` (never 500). This catches uncaught exceptions in handlers without exercising business logic.
- For `ZenApp.tsx`: a **render-without-crash** test for each `layoutMode` branch. Mock the data hooks, render, snapshot the rail tree.

**Risk:** None — these are pure additions. They might fail on first run, exposing real bugs. That's a feature.

**Verifiable win:** Refactor safety net for the rest of this report. Without these, every other sprint is riskier.

---

### Sprint 5 — Route consolidation (2–3 days, **medium risk**)

**Goal:** Collapse the 7 overlapping document-routes into 3 capability-aligned files.

**Current overlap:**
- `server/routes/concept2cure.ts` (153 handlers — mega-route)
- `server/routes/authoring.router.ts` (5,215 LOC)
- `server/routes/authoring-actions.ts` (3,185 LOC)
- `server/routes/documentAuthoring.routes.ts` (2,033 LOC)
- `server/routes/document-routes.ts` (360 LOC)
- `server/routes/documents-unified.ts` (229 LOC — likely stub)
- `server/routes/cerv2-document-routes.ts` (~900 LOC — domain-specific, may stay)

**Plan:**
1. **Inventory each handler** — for each of the 7 files, list path + method + handler-name (handler counts are the verifiable input).
2. **Cluster by capability** — group handlers into 3 capability buckets:
   - `documents-router.ts` — CRUD, list, get, search across all document types
   - `authoring-router.ts` — section editing, drafting, tokens, citations, AI drafting
   - `governance-router.ts` — review, approval, e-sign, audit, freeze, export
3. **Move handlers** — each move is a PR; the **mount path stays the same** so clients don't break. Use the existing `server/bootstrap/register-inline-routes.ts` as the mounting authority.
4. **Run the new smoke tests** (Sprint 4) after each move — they catch regressions.

**Risk:** Handler names + middleware order matter. **Do not** change auth or tenant middleware while consolidating; pure move-only. Keep the same `app.use('/api/...')` mount prefix per route.

**Verifiable win:** 7 files → 3 files, ~24K LOC redistributed cleanly. Easier to audit, easier to test, easier to navigate.

---

## 3. Things to AVOID (look attractive, are not safe)

| Tempting move | Why NOT to do it |
|---|---|
| **Wholesale `tsc --strict` flag flip** | Would surface 5,000+ new errors. Stay incremental file-by-file. |
| **Drop legacy `components/editor/**` before Phase 3 parity** | Zero Capability Loss rule. Diff/comments/approvals/compliance scanning aren't in the Phase 3 bundle yet. |
| **Migrate to Zod v4 namespace project-wide** | The 0.7.1 drizzle-zod downgrade just stabilized v3 namespace. v4 migration is a multi-week sprint that should happen after the Zod team stabilizes the migration path. |
| **Refactor `ZenApp.tsx` into many small files** | 37 `layoutMode` branches + tight `embeddedModule` coupling — splitting prematurely creates prop-drilling chaos. Add tests first (Sprint 4), then split. |
| **Auto-format / mass-lint the whole repo** | Creates noisy commits that hide real changes. Format-on-save going forward instead. |
| **Switch logger from `console.*` to structured** | 268 call sites. High mechanical churn for marginal observability gain unless you're standing up centralized log aggregation simultaneously. |
| **Consolidate the 266 migrations** | Migrations are append-only history. Consolidating risks losing audit-trail integrity (21 CFR Part 11 implication). Leave them. |
| **Move CSS Modules to Tailwind everywhere** | Phase 1/2/3 are CSS Modules by deliberate design decision (CLAUDE.md). Don't flip. |

---

## 4. Measurable success criteria

After all 5 sprints complete:
- **Production chunks** — no chunk >500KB (currently 5 violators)
- **Typecheck errors** — under 1,500 (currently 2,914; ~10K LOC of dead code deletion alone should reach this)
- **Top-12 untested files** — every one has at least one smoke test (currently 8 untested)
- **shared/schema.ts** — reduced from 741KB to a thin re-export shim (~50KB)
- **Document routes** — 7 files → 3 files
- **Dead services** — ~10 services removed, ~10K LOC deleted

Each sprint produces its own commit(s) and its own verifiable delta. No big-bang refactor. No regulatory-integrity blast radius. Every step is `git revert`-safe.

---

## 5. Sequence summary

```
Sprint 1 (1–2 days, zero risk)        → 2 chunks pulled under 500KB
Sprint 2 (1 day, low risk)            → ~10K LOC dead-service deletions
Sprint 3 (2–3 days, medium risk)      → schema.ts extraction begun (per-domain PRs)
Sprint 4 (2 days, zero risk)          → smoke tests for the top 6 giants
Sprint 5 (2–3 days, medium risk)      → document routes 7 → 3
```

**Total elapsed:** ~10 working days of focused effort. Each sprint produces visible, reviewable PR-sized commits. Nothing in the regulatory + multi-tenancy contract is touched without explicit sign-off.
