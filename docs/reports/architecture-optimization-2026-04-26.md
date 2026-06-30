# Concept2Cure-v2 — Architecture Optimization Report (Expanded)

**Date:** 2026-04-26
**Branch:** `concept2cure-v2` @ `3512eaa`
**Scope:** Safe optimizations that strengthen the architecture without breaking shipped features or regulatory guarantees.
**Owner of recommendations:** the team executing them — every step is reversible by `git revert`.

---

## Document layout

| Section | What's in it |
|---|---|
| [1. Executive summary](#1-executive-summary) | The TL;DR — three real problems, five sprints, ~10 days |
| [2. Evidence base](#2-evidence-base) | Hard metrics for every claim in this report |
| [3. Risk matrix](#3-risk-matrix) | Every sprint scored on blast radius / reversibility / verifiability |
| [4. Sprint 1 — Code splitting](#4-sprint-1--code-splitting-1-2-days-zero-behavior-risk) | Bring 2 chunks under 500KB |
| [5. Sprint 2 — Service graveyard](#5-sprint-2--service-graveyard-1-day-low-risk) | Delete ~10K LOC of dead code |
| [6. Sprint 3 — Schema extraction](#6-sprint-3--schema-extraction-2-3-days-medium-risk) | Continue splitting `shared/schema.ts` |
| [7. Sprint 4 — Test scaffolding](#7-sprint-4--test-scaffolding-2-days-zero-behavior-risk) | Smoke tests for the top 6 untested giants |
| [8. Sprint 5 — Route consolidation](#8-sprint-5--route-consolidation-2-3-days-medium-risk) | 7 doc-routes → 3 capability-aligned routers |
| [9. Anti-patterns](#9-things-to-avoid-look-attractive-arent-safe-yet) | Tempting moves that aren't safe yet |
| [10. Success criteria](#10-measurable-success-criteria) | What "done" looks like across all sprints |
| [11. Appendix — verification commands](#11-appendix--verification-commands) | Copy-pasteable shell snippets |
| [12. Appendix — what we already shipped](#12-appendix--what-we-already-shipped-prior-to-this-report) | Context for everything in this plan |

---

## 1. Executive summary

The codebase is healthy enough to ship from. The production build succeeds (`npm run build` cleanly produces dist artifacts), three Claude Design phases (Home, AnA chat, eCTD co-author) are live with backend wiring, and the legacy chat tree has been deleted. Total source: **893,502 LOC**.

But three structural debts dominate the maintenance cost going forward:

1. **One 741KB monolithic schema** (`shared/schema.ts`, 18,279 LOC) imported by **202 files** — every Drizzle table in the system lives in one file. Any column change requires touching this file and reloading it for every importer.
2. **One 666KB mega-route** (`server/routes/concept2cure.ts`, ~17,938 LOC with **153 handlers** and **247 typecheck errors** concentrated here) — the largest single source of unreviewable change in the server.
3. **One 171KB shell** (`client/src/concept2cure/ZenApp.tsx`, 4,044 LOC with **37 `layoutMode` branches** + **32 `embeddedModule` branches** and **0 tests**) — every UI route flows through this one file.

Surrounding these are smaller, fixable issues:
- ~38K LOC of legacy editor code (`client/src/concept2cure/components/editor/**`) awaiting Phase 3 parity sign-off
- ~10K LOC of orphaned server services with zero route imports
- 7 overlapping document-route files covering the same capability surface
- 5 production chunks >500KB (Vite's warning threshold)
- 8 of the top 12 largest files completely untested

**The plan:** 5 sprints, each reversible by `git revert`, each producing a measurable delta. Sprints can run in parallel by different team members. Nothing touches the multi-tenancy contract, 21 CFR Part 11 audit chain, or the Zero Capability Loss rule (CLAUDE.md) without explicit sign-off.

```
Sprint 1 (1–2 days, zero behavior risk)   → 2 chunks pulled under 500KB
Sprint 2 (1 day, low risk)                → ~10K LOC dead-service deletions
Sprint 3 (2–3 days, medium risk)          → schema.ts extraction continues
Sprint 4 (2 days, zero behavior risk)     → smoke tests for the top 6 giants
Sprint 5 (2–3 days, medium risk)          → document routes 7 → 3
```

Total focused effort: ~10 working days.

---

## 2. Evidence base

Every claim below is backed by a command you can re-run from the repo root.

### 2.1 Source size

```bash
find . -type f \( -name '*.ts' -o -name '*.tsx' \) \
  -not -path './node_modules/*' -not -path './dist/*' \
  -not -path './.git/*' -not -path './_archive/*' \
  -not -path './.claude/*' | xargs wc -l | tail -1
```

→ **893,502 LOC** total source across `client/`, `server/`, `shared/`, `services/`, `agents/`, `tests/`.

### 2.2 Hot spots — files >100KB

| File | Size | LOC | Role | Risk profile |
|---|---|---|---|---|
| `shared/schema.ts` | 741KB | 18,279 | Monolithic Drizzle schema | **High coupling** — 202 importers |
| `server/routes/concept2cure.ts` | 666KB | ~17,938 | Mega-route, 153 handlers | **High** — 247 typecheck errors here |
| `server/statistics-service.ts` | 219KB | — | Biostats engine | Medium — narrower import surface |
| `client/src/concept2cure/components/editor/EditorPanel.tsx` | 191KB | 4,648 | Legacy editor | **Scheduled retirement** |
| `client/src/concept2cure/ZenApp.tsx` | 171KB | 4,044 | Main shell | **High** — 0 tests, 37 layoutMode branches |
| `server/routes/authoring.router.ts` | 168KB | 5,215 | Authoring routes | Medium — Phase 3 backbone |
| `server/services/ana-ri/command-executor.ts` | 163KB | 4,479 | AnA command runner | 99 typecheck errors |
| `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx` | 147KB | — | Project shell | Medium |
| `server/routes/authoring-actions.ts` | 132KB | 3,185 | Action endpoints | Medium |
| `server/storage.ts` | 115KB | — | Storage layer | Medium |
| `server/services/intelligent-report-engine.ts` | 115KB | — | Report engine | Medium |
| `client/src/concept2cure/components/editor/UnifiedDocumentEditor.tsx` | 107KB | 2,806 | Legacy editor | **Scheduled retirement** |

### 2.3 Production chunks >200KB

```bash
ls -la dist/public/assets/*.js | awk '$5 > 200000 {printf "%-12s %s\n", $5, $9}' | sort -rn
```

| Chunk | Size | Contains |
|---|---|---|
| `EditorPanel-*.js` | 938KB | Legacy editor |
| `CmcWizard-*.js` | 932KB | CMC module |
| `CERV2Page-*.js` | 752KB | CER module |
| `ZenRouter-*.js` | 728KB | ZenApp + my Phase 1/2/3 changes |
| `CoAuthor-*.js` | 589KB | Phase 3 ectd-coauthor mirror |
| `index-DODaH8yJ.js` | 487KB | Main bundle |
| `vendor-tiptap-*.js` | 482KB | Already vendor-split |
| `vendor-charts-*.js` | 460KB | Already vendor-split |
| `vendor-pdf-*.js` | 421KB | Already vendor-split |

Vite vendor splitting is **already done** (see `vite.config.ts` lines 59–142 — Radix, TanStack, charts, PDF, tiptap, antd are all chunked). The remaining oversized chunks are **page-level**, not vendor-level. That's what Sprint 1 attacks.

### 2.4 Typecheck error distribution

```bash
npm run typecheck 2>&1 | grep -oE 'error TS[0-9]+' | sort | uniq -c | sort -rn | head -10
```

**Total: 2,914 errors** (after the `drizzle-zod` downgrade in commit `2f1bfd9`).

| Code | Count | Pattern |
|---|---|---|
| TS2345 | 828 | Argument-type mismatch — mostly cascade from typed-as-`unknown` parameters |
| TS2339 | 766 | Property does not exist — missing schema-table types and prop-shape drift |
| TS2322 | 302 | Type X not assignable to Y — prop and return-type drift |
| TS2769 | 214 | Overload mismatch — `db.insert(...).values(zodSchema)` shape issues |
| TS2353 | 68 | Unknown property in object literal |
| TS2551 | 65 | "Did you mean..." typos — real refactor debt |
| TS2349 | 59 | Not callable |
| TS2304 | 52 | Cannot find name — mostly missing imports |

**Hot files:**
- `server/routes/concept2cure.ts` — **247 errors** (the mega-route)
- `server/services/ana-ri/command-executor.ts` — **99 errors**
- `client/src/portal-v2/components/admin/UserManagement.tsx` — 67 errors
- `server/services/cerGenerationService.ts` — 50 errors
- `server/routes/traceability-mapping-routes.ts` — 47 errors

### 2.5 Coupling — top importers

| Module | Importers | Notes |
|---|---|---|
| `shared/schema.ts` | **202 files** | The crown jewel of coupling |
| `client/src/components/ui/index.ts` | 47 | Shadcn barrel — narrower surface, lower risk |
| `client/src/concept2cure/hooks/queryKeys.ts` | ~35 | TanStack Query discipline — established and healthy |
| `shared/types/*` and other barrels | 20–30 each | Spread across many small barrels |

### 2.6 Test coverage gaps — top 12 by size

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

### 2.7 Dead-code candidates

| Path | Type | Size | Detection signal |
|---|---|---|---|
| `db/migrations/_legacy/` | directory | 536KB | `_legacy` in path |
| `server/services/compliance/globalComplianceEngine.ts` | service | 1,823 LOC | No route imports (replaced by `compliance-guardrails-sdk-service.ts`) |
| `server/services/module-intelligence.ts` | service | 1,498 LOC | No route imports |
| `server/services/grdheService.ts` | service | 1,486 LOC | No route imports; orphan |
| `server/services/clinical-intelligence-service.ts` | service | 1,473 LOC | Runtime-broken — calls undefined `clinicalEvaluationReports` table |
| `client/src/concept2cure/components/editor/**` | 35 files | varies | ~15 components have **zero external imports** |
| `server/services/ana-ri/command-executor.ts` | service | 4,479 LOC | 99 typecheck errors; may overlap with `orchestrator.ts` — **verify before deletion** |

### 2.8 Other signals

| Signal | Value | Implication |
|---|---|---|
| Server route files | 245 | High fragmentation — Sprint 5 target |
| Server service files | 547 (195 at top level) | Substantial surface to audit |
| SQL migrations | 266 | **Do NOT consolidate** — append-only audit trail |
| Schema sub-modules already extracted | 19 | Sprint 3 continues this work |
| `console.log/warn/error` in production paths | 268 | No structured logger — defer to dedicated sprint |
| TODO/FIXME/HACK/DEPRECATED markers | 56 | Low debt density given size |
| TanStack Query `queryKey:` references | 589 | Discipline is established and healthy |
| Route-bootstrap centralization | `server/bootstrap/register-inline-routes.ts` (329 LOC) | Mount points already centralized |

---

## 3. Risk matrix

Each sprint scored on three axes. **L** = Low, **M** = Medium, **H** = High.

| Sprint | Blast radius | Reversibility | Verifiability | Net risk |
|---|---|---|---|---|
| 1. Code splitting | L (Vite config + lazy imports) | H (git revert) | H (chunk-size diff) | **Very low** |
| 2. Service graveyard | L (deleted files) | H (git revert) | H (grep + build + tests) | **Low** |
| 3. Schema extraction | M (touches 202-importer file) | H per move | H (test suite + typecheck) | **Medium** |
| 4. Test scaffolding | L (pure additions) | H (delete the tests) | H (CI green/red) | **Very low** |
| 5. Route consolidation | M (handler moves) | H per move | M (need Sprint 4 tests first) | **Medium** |

**Required order:** Sprint 4 (test scaffolding) should land before Sprint 5 (route consolidation) so the consolidation has a safety net. Sprints 1, 2, 3 can run in any order.

---

## 4. Sprint 1 — Code splitting (1–2 days, zero behavior risk)

### Goal

Cut 2 of the 5 oversized production chunks below the Vite 500KB warning threshold by lazy-loading them only when their owning surface is actually navigated to.

### Why it's safe

- Pure build-config + import-statement changes. No runtime logic touched.
- React's `Suspense` boundary is the only new surface. Every existing layout-mode branch in `ZenApp.tsx` is already wrapped in `<ErrorBoundary>` and `<Suspense>` — the pattern is already in the file.
- Reversible by a single `git revert` of the sprint commit.

### Files to touch

1. `vite.config.ts` — extend the `manualChunks` rule
2. `client/src/concept2cure/ZenApp.tsx` — convert direct imports to `React.lazy()` at the top of the file

### Step-by-step plan

**Step 1.1 — Lazy-import `EditorPanel`**

Find the current import in `ZenApp.tsx`:
```bash
grep -n "import EditorPanel\|import { EditorPanel\|import.*editor/EditorPanel" \
  client/src/concept2cure/ZenApp.tsx
```

Replace with:
```ts
const EditorPanel = React.lazy(() => import('./components/editor/EditorPanel'));
```

Wrap the render in `<Suspense fallback={<LoadingState size="sm" message="" />}>` — the pattern already exists at line ~3437.

Verify:
```bash
npm run build 2>&1 | grep -E 'EditorPanel|CoAuthor|ZenRouter|index-' | awk '{print $1, $2}'
```

**Expected:** `EditorPanel-*.js` chunk drops from 938KB to its own lazy-loaded chunk; `ZenRouter` chunk shrinks correspondingly.

**Step 1.2 — Lazy-import `CmcWizard` and `CERV2Page`**

Same pattern. Both are 752KB and 932KB chunks today.

**Step 1.3 — Force-split Phase 3 mirror into its own chunk**

Extend `vite.config.ts` `manualChunks`:
```ts
manualChunks(id) {
  // ... existing rules ...

  // Force the Phase 3 mirror into its own chunk so it doesn't bloat ZenRouter
  if (id.includes('client/src/concept2cure/components/claude-ectd-coauthor/')) {
    return 'phase3-ectd-coauthor';
  }

  // Force the Phase 2 mirror into its own chunk
  if (id.includes('client/src/concept2cure/components/ana/')) {
    return 'phase2-ana';
  }
}
```

**Step 1.4 — Verify and commit**

```bash
npm run build 2>&1 | grep -E '\.js\s*$' | sort -k1 -n | tail -15
```

**Verifiable win:** No chunk >500KB in the production build output. Initial `ZenRouter` chunk drops from 728KB to <400KB.

### Risks

- Some test setups don't tolerate lazy boundaries. Run `npm run test` after each step.
- If a chunk is needed during SSR (probably not here — this is a SPA build), lazy imports break it. Check `client/src/main.tsx` and `index.html` for any SSR hints.

---

## 5. Sprint 2 — Service graveyard (1 day, low risk)

### Goal

Delete ~10,000 LOC of orphaned server services and the `_legacy` migrations archive. Each deletion is independently verifiable by grep + build + tests.

### Why it's safe

- Deletions are reversible by `git revert`.
- Each candidate is verified by `grep` for any remaining importers BEFORE deletion.
- Build + tests after every single file deletion (not at the end).

### Files to potentially delete (verify each first)

```bash
# Step 0 — confirm every candidate has zero importers
for f in \
  server/services/compliance/globalComplianceEngine.ts \
  server/services/module-intelligence.ts \
  server/services/grdheService.ts \
  server/services/clinical-intelligence-service.ts \
  ; do
  count=$(grep -rln "from.*$(basename $f .ts)" server/ client/ 2>/dev/null \
    | grep -v "$f" | wc -l)
  echo "$count importers of $f"
done
```

| Path | Size | Verify by |
|---|---|---|
| `db/migrations/_legacy/` | 536KB | `grep -rln '_legacy' migrations/ server/ db/` returns nothing |
| `server/services/compliance/globalComplianceEngine.ts` | 1,823 LOC | Confirm `compliance-guardrails-sdk-service.ts` is the replacement |
| `server/services/module-intelligence.ts` | 1,498 LOC | Zero importers |
| `server/services/grdheService.ts` | 1,486 LOC | Zero importers |
| `server/services/clinical-intelligence-service.ts` | 1,473 LOC | Zero importers; file is runtime-broken (calls undefined table) |

### Step-by-step plan per file

1. **Verify zero importers:**
```bash
grep -rln "from.*<basename>\|require.*<basename>" \
  --include='*.ts' --include='*.tsx' --include='*.js' \
  server/ client/ shared/ 2>/dev/null | grep -v "<full-path>"
```

2. **Verify no exported symbol is used:**
```bash
grep -E '^export (const|function|class|default)' <file> \
  | awk '{print $3}' | tr -d ',(:' \
  | while read sym; do
      count=$(grep -rln "\b$sym\b" \
        --include='*.ts' --include='*.tsx' \
        server/ client/ shared/ 2>/dev/null | wc -l)
      echo "$count usages of $sym"
    done
```

3. **Delete:** `git rm <file>`
4. **Verify build still works:** `npm run build 2>&1 | tail -5`
5. **Verify typecheck delta:** `npm run typecheck 2>&1 | grep -cE 'error TS[0-9]+'`
6. **Verify tests:** `npm run test 2>&1 | tail -10`

### Edge case: `command-executor.ts`

`server/services/ana-ri/command-executor.ts` is the biggest single deletion candidate (4,479 LOC, 99 typecheck errors). **It may overlap with `orchestrator.ts`.** Before deleting:

```bash
# Find any caller of command-executor across the codebase
grep -rln "from.*ana-ri/command-executor\|require.*ana-ri/command-executor" \
  server/ client/ 2>/dev/null

# Diff the command surface of command-executor vs orchestrator
grep -E '^export' server/services/ana-ri/command-executor.ts | sort > /tmp/ce-exports.txt
grep -E '^export' server/services/ana-ri/orchestrator.ts    | sort > /tmp/orch-exports.txt
diff /tmp/ce-exports.txt /tmp/orch-exports.txt
```

If `command-executor` has unique exports still used by AnA routes, it's NOT dead. Skip it from this sprint and queue for a focused replacement.

### Verifiable win

~10,000 LOC removed. ~100–200 typecheck errors gone (each deleted file removes its own errors plus errors in downstream consumers).

### Commit pattern

```
chore(graveyard): delete orphaned <service-name>

- Zero importers across server/, client/, shared/
- Zero exported-symbol usages
- Production build green
- Tests green
- Typecheck delta: <X> → <Y>
```

---

## 6. Sprint 3 — Schema extraction (2–3 days, medium risk)

### Goal

Continue the in-progress decomposition of `shared/schema.ts` (741KB / 18,279 LOC / **202 importers**) into domain-scoped modules. The work has already begun — 19 sub-modules exist in `shared/schema/*.ts`. This sprint continues it without breaking any of the 202 importers.

### Why it's medium risk

- Schema tables have cross-references in their `relations()` definitions. Moving a table without its relations breaks queries.
- Drizzle's type inference (`InferSelectModel<T>`, `InferInsertModel<T>`) propagates types across the codebase. A missed re-export breaks 50+ downstream files.
- Backward-compat via re-exports from `shared/schema.ts` keeps importers working — but only if the re-export is correct.

### Already extracted into `shared/schema/`

```
cdisc-reference.ts       csr-knowledge-db.ts      project-charter.ts
qc-schemas.ts            orchestration.ts         regulatory-atoms.ts
unified_workflow.ts      support-admin.ts         programs.ts
cmc-os.ts                resolution.ts            ana-intelligence.ts
report-os.ts             api-keys.ts              ctd-projects.ts
+ 4 more
```

### Still in `shared/schema.ts` (extraction targets)

- **Core entities:** `projects`, `users`, `organizations`, `sessions`, `userRoles`
- **CSR domain:** `csrReports` (line 12391), `csrDetails` (line 12431), `csrSegments`, etc.
- **Clinical:** `clinicalOutcomes`, `biomarkerEndpoints`, `translationalPatterns`, `doseEscalationStudies`
- **Documents:** `documents`, `documentVersions`, `documentComments`, `summaryPackets`
- **AnA intelligence:** `insightMemories`, `wisdomTraces`, `studySessions`, `foresightPredictions`, `clinicalFeedback`

### Recommended extraction order (by safety + impact)

1. **CSR domain** → `shared/schema/csr.ts`
   Already partially extracted (`csr-knowledge-db.ts` covers part). Move `csrReports`, `csrDetails`, `csrSegments`, related junction tables.
2. **Clinical domain** → `shared/schema/clinical.ts`
   `clinicalOutcomes`, `biomarkerEndpoints`, `translationalPatterns`, `doseEscalationStudies`, `doseLevels`, `doseCohorts`, `dltEvents`, `foresightPredictions`, `clinicalFeedback`.
3. **Document domain** → `shared/schema/documents.ts`
   `documents`, `documentVersions`, `documentComments`, `summaryPackets`. **Cross-references the authoring tables in `unified_workflow.ts`** — verify relations.
4. **AnA intelligence** → consolidate into existing `shared/schema/ana-intelligence.ts`
   `insightMemories`, `wisdomTraces`, `studySessions`.
5. **Core entities** → `shared/schema/core.ts` — **LAST**
   Highest blast radius. Move only after the other 4 extractions are stable. `projects`, `users`, `organizations`, `sessions` are imported by ~half the codebase.

### Step-by-step plan per extraction

**Step A — Map the importers BEFORE moving anything.**

For each table being extracted, list which files import its name:
```bash
TABLE_NAME=csrReports
grep -rln "\b$TABLE_NAME\b" --include='*.ts' --include='*.tsx' \
  server/ client/ shared/ 2>/dev/null | grep -v 'shared/schema.ts'
```

Record the count and the file list in a tracking issue/comment.

**Step B — Extract.**

1. Create the new file `shared/schema/<domain>.ts`.
2. Move the table definitions, their enums, their `relations()` blocks, and any `InferSelectModel` / `InferInsertModel` type exports.
3. Keep `shared/schema.ts` line referencing the table — **don't delete the originals yet**.

**Step C — Add re-exports for backward compat.**

In `shared/schema/index.ts`, add:
```ts
export { csrReports, csrDetails } from './csr';
export type { CsrReport, CsrReportInsert } from './csr';
```

In `shared/schema.ts` (the monolith), add **forward** re-exports at the top:
```ts
// During schema extraction — these are now in shared/schema/csr.ts but re-exported here for backward compat.
export { csrReports, csrDetails } from './schema/csr';
```

This ensures every existing importer keeps working without modification.

**Step D — Delete the originals from `shared/schema.ts`.**

Only after Step C is committed and CI is green. Search for the original `export const csrReports = pgTable(...)` block and delete it.

**Step E — Verify.**

```bash
npm run typecheck 2>&1 | grep -cE 'error TS[0-9]+'  # should not increase
npm run build 2>&1 | tail -5                         # should succeed
npm run test 2>&1 | tail -10                         # should pass
```

**Step F — Update consumers (slow rollout).**

Over time (no deadline), update importers to import directly from the new module:
```ts
// Before
import { csrReports } from 'shared/schema';
// After
import { csrReports } from 'shared/schema/csr';
```

This is purely a cleanup — the re-export keeps the old path working indefinitely.

### Verifiable win

After all 5 extractions:
- `shared/schema.ts` shrinks from 741KB to a re-export shim (~50KB or less)
- Per-domain types are explicitly cluster-imported, making cross-domain coupling visible at the import statement
- New tables get added to the right domain module from day one

### Risk mitigation

- **Cross-domain `relations()`** — when a table references another domain's table in `relations()`, the relation goes in the SAME file as the table that owns the relation, not the target. Drizzle's `relations()` is owned by the source side.
- **Type inference** — re-export `InferSelectModel<T>` types from the new module. The Drizzle convention is `export type T = InferSelectModel<typeof table>`.

---

## 7. Sprint 4 — Test scaffolding (2 days, zero behavior risk)

### Goal

Add at least one assertion per major surface to the top 6 untested files. **These are smoke tests** — render-without-crash for the UI, status-not-500 for the routes. The point is to create tripwires, not exhaustive coverage.

### Why it's safe

- Pure additions to `tests/` and `*.test.ts` files. No production code is touched.
- If a test fails on first run, that's a real bug being surfaced.

### Files to add tests for

1. `client/src/concept2cure/ZenApp.tsx` (4,044 LOC, 0 tests)
2. `server/routes/concept2cure.ts` (17,938 LOC, <1% coverage)
3. `server/routes/authoring.router.ts` (5,215 LOC, 0 tests)
4. `server/routes/knowledge-base.ts` (~2,500 LOC, 0 tests)
5. `server/routes/ana-features.ts` (2,054 LOC, 0 tests)
6. `server/routes/regulatory-digital-twin.ts` (1,799 LOC, 0 tests)

### Test template — routes

```ts
// tests/routes/concept2cure.smoke.test.ts
import request from 'supertest';
import { createApp } from '../../server/app'; // adjust to actual app factory

describe('concept2cure route smoke', () => {
  const app = createApp();

  const PATHS = [
    'GET /api/concept2cure/projects',
    'GET /api/concept2cure/projects/all/artifacts-summary',
    // ... seed with 10–20 representative paths
  ];

  for (const path of PATHS) {
    const [method, url] = path.split(' ');
    it(`${path} returns ≠500`, async () => {
      const res = await request(app)[method.toLowerCase()](url);
      expect([200, 201, 202, 400, 401, 403, 404]).toContain(res.status);
    });
  }
});
```

The key invariant: **a smoke test asserts the handler never throws unhandled exceptions**. Any 5xx is a real bug.

### Test template — ZenApp.tsx

```tsx
// tests/concept2cure/ZenApp.smoke.test.tsx
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const ALL_LAYOUT_MODES = [
  'projects', 'project-home', 'workspace', 'editor', 'ectd-coauthor',
  'documents', 'vault', 'biostat', // ... pull from zen-app-constants.ts
];

describe('ZenApp render smoke', () => {
  for (const mode of ALL_LAYOUT_MODES) {
    it(`renders layoutMode=${mode} without crashing`, () => {
      const qc = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      // Mock useHomeData, useAnaChat, etc. with sensible defaults
      const { container } = render(
        <QueryClientProvider client={qc}>
          <ZenApp initialLayoutMode={mode} />
        </QueryClientProvider>
      );
      expect(container.firstChild).toBeTruthy();
    });
  }
});
```

### Verifiable win

A safety net for Sprints 3 and 5. Without these smokes, route consolidation is genuinely risky; with them, every move is auto-verified.

### Mock strategy

For routes: mock the `pool` import or wrap with a per-test transaction that rolls back.
For ZenApp: mock the hooks (`useHomeData`, `useAnaChat`, `useEctdAuthoringData`, `useEctdReadiness`) to return `{ items: null, loading: false }`-style defaults so render doesn't depend on backend state.

---

## 8. Sprint 5 — Route consolidation (2–3 days, medium risk)

### Goal

Collapse the 7 overlapping document-related route files into 3 capability-aligned routers.

### Why it's medium risk

- Express routing order matters — middleware before the handler still has to run.
- Handler-specific middleware (rate limit, tenant scoping, auth) must be preserved on the moved handler.
- A subtle path collision (e.g., two `/api/documents` mounts) silently shadows.

### Prerequisite

**Sprint 4 must be done first.** The route smokes catch silent regressions during the move.

### Current state — 7 overlapping route files

| File | Size | Handler count (approx) |
|---|---|---|
| `server/routes/concept2cure.ts` | 666KB | 153 |
| `server/routes/authoring.router.ts` | 168KB | ~50 |
| `server/routes/authoring-actions.ts` | 132KB | ~30 |
| `server/routes/documentAuthoring.routes.ts` | ~80KB | ~25 |
| `server/routes/document-routes.ts` | 360 LOC | ~5 |
| `server/routes/documents-unified.ts` | 229 LOC | ~3 |
| `server/routes/cerv2-document-routes.ts` | ~900 LOC | ~10 |

### Target — 3 capability-aligned routers

1. **`server/routes/documents-router.ts`** — CRUD on documents (list, get, create, update, delete, search). Pulls from `documents-unified.ts`, `document-routes.ts`, and the CRUD portion of `concept2cure.ts`.
2. **`server/routes/authoring-router.ts`** — Section editing, drafting, tokens, citations, AI drafting. Pulls from `authoring.router.ts` and `documentAuthoring.routes.ts`.
3. **`server/routes/governance-router.ts`** — Review, approval, e-sign, audit, freeze, export. Pulls from `authoring-actions.ts` and the governance portion of `concept2cure.ts`.

`cerv2-document-routes.ts` stays separate — it's domain-specific (Clinical Evaluation Reports) and small.

### Step-by-step plan

**Step A — Build a handler inventory.**

For each of the 7 files, list every handler with its path + method:

```bash
for f in \
  server/routes/concept2cure.ts \
  server/routes/authoring.router.ts \
  server/routes/authoring-actions.ts \
  server/routes/documentAuthoring.routes.ts \
  server/routes/document-routes.ts \
  server/routes/documents-unified.ts \
  ; do
  echo "=== $f ==="
  grep -nE "router\.(get|post|put|patch|delete)\(['\"]" "$f" \
    | sed -E "s/.*router\.(get|post|put|patch|delete)\(['\"]/\1 /" \
    | sed "s/['\"].*//"
done > /tmp/handler-inventory.txt
```

Use this to plan the migration: each handler ends up in exactly one of the three targets.

**Step B — Migrate one handler at a time.**

For each handler:
1. Copy the handler block to the new file.
2. Verify the auth + tenant middleware is identical or explicitly applied to the new mount.
3. Delete the handler from the old file.
4. Run the new route smoke (Sprint 4): `npm run test -- <smoke-test-file>`.
5. Run typecheck: `npm run typecheck 2>&1 | grep -cE 'error TS[0-9]+'`.
6. Commit per handler or per small cluster of related handlers.

**Step C — Update mounts.**

`server/bootstrap/register-inline-routes.ts` is the canonical mount point. Update it to mount the new routers and remove the old mounts:

```ts
// Before
app.use('/api/authoring', authoringRouter);
app.use('/api/authoring-actions', authoringActionsRouter);
// After
app.use('/api/authoring', authoringRouter);     // now consolidated
app.use('/api/governance', governanceRouter);   // new
app.use('/api/documents', documentsRouter);     // new
```

**Critical:** if any moved handler kept its old URL path (e.g., `/api/authoring/foo` stays at `/api/authoring/foo`), client code doesn't break. **Don't change paths during consolidation** — that's a separate exercise.

**Step D — Delete the empty files.**

Once a file has zero remaining handlers, delete it. Verify with the smokes.

### Verifiable win

- 7 files → 3 (+ cerv2 stays)
- ~24K LOC redistributed
- Easier to audit (each file has a single capability)
- Easier to test (smaller, focused files)
- Easier to type-fix (the 247 errors in `concept2cure.ts` redistribute to where they belong)

### Risks

- **Middleware shadowing.** If old and new files both mount at `/api/documents/...`, the first one wins. Verify zero overlap before mount.
- **Auth strictness drift.** Some handlers might have lighter auth than others. Move with the more strict auth applied.
- **Express body parsers.** If a handler depends on a body parser registered upstream of its mount, the move needs to preserve that ordering.

---

## 9. Things to avoid (look attractive, aren't safe yet)

| Tempting move | Why NOT to do it |
|---|---|
| **Wholesale `tsc --strict` flag flip** | Would surface 5,000+ new errors. Stay incremental file-by-file. |
| **Drop legacy `components/editor/**` before Phase 3 parity** | Zero Capability Loss rule (CLAUDE.md). Diff/comments/approvals/compliance scanning aren't in the Phase 3 bundle yet. |
| **Migrate to Zod v4 namespace project-wide** | The 0.7.1 drizzle-zod downgrade just stabilized v3 namespace. v4 migration is a multi-week sprint that should happen after the Zod team stabilizes the migration path. |
| **Refactor `ZenApp.tsx` into many small files** | 37 `layoutMode` branches + tight `embeddedModule` coupling — splitting prematurely creates prop-drilling chaos. **Add tests first (Sprint 4), then split.** |
| **Auto-format / mass-lint the whole repo** | Creates noisy commits that hide real changes. Format-on-save going forward instead. |
| **Switch logger from `console.*` to structured** | 268 call sites. High mechanical churn for marginal observability gain unless you're standing up centralized log aggregation simultaneously. |
| **Consolidate the 266 migrations** | Migrations are append-only history. Consolidating risks losing audit-trail integrity (21 CFR Part 11 implication). **Leave them.** |
| **Move CSS Modules to Tailwind everywhere** | Phase 1/2/3 are CSS Modules by deliberate design decision (CLAUDE.md). Don't flip. |
| **Add a monorepo tool (pnpm workspaces, turborepo) for the existing tree** | The benefits assume cleanly separated packages. Today everything is `client/`, `server/`, `shared/` — splitting is real work that delivers no immediate win. |
| **Replace TanStack Query with SWR or RTK Query** | 589 query-key call sites. The migration cost vastly exceeds the benefit. The pattern is healthy. |

---

## 10. Measurable success criteria

After all 5 sprints complete:

| Metric | Today | Target | How measured |
|---|---|---|---|
| Production chunks >500KB | 5 violators | 0 | `ls dist/public/assets/*.js | awk '$5 > 500000'` |
| Typecheck error count | 2,914 | <1,500 | `npm run typecheck 2>&1 | grep -cE 'error TS[0-9]+'` |
| `shared/schema.ts` size | 741KB | <100KB (re-export shim) | `wc -c shared/schema.ts` |
| Document-route file count | 7 | 3 | `find server/routes -name '*document*.ts' | wc -l` |
| Top-12 untested files with tests | 4 of 12 | 12 of 12 | Per-file `*.test.ts` adjacency |
| Dead-service LOC removed | 0 | ~10,000 | `git log --shortstat` for sprint 2 commits |

Each sprint produces its own commits, its own delta, its own verifiable win. No big-bang refactor. No regulatory-integrity blast radius. Every step is `git revert`-safe.

---

## 11. Appendix — verification commands

Copy-pasteable shell snippets used throughout the report.

### Re-bucket typecheck errors
```bash
npm run typecheck 2>&1 | grep -oE 'error TS[0-9]+' | sort | uniq -c | sort -rn | head -15
```

### Errors per file (top 15)
```bash
npm run typecheck 2>&1 | grep -oE '^[^(]+\.tsx?' | sort | uniq -c | sort -rn | head -15
```

### Production chunk sizes
```bash
ls -la dist/public/assets/*.js | awk '$5 > 200000 {printf "%-12s %s\n", $5, $9}' | sort -rn
```

### Files >100KB in source
```bash
find . -type f \( -name '*.ts' -o -name '*.tsx' \) \
  -not -path './node_modules/*' -not -path './dist/*' \
  -not -path './.git/*' -not -path './_archive/*' \
  -not -path './.claude/*' -printf '%s %p\n' 2>/dev/null \
  | sort -rn | awk '$1 > 100000 {printf "%-12s %s\n", $1, $2}'
```

### Importers of `shared/schema.ts`
```bash
grep -rln "from ['\"]\(\\.\\./\)*shared/schema['\"]\|from ['\"]@shared/schema['\"]" \
  --include='*.ts' --include='*.tsx' client/ server/ shared/ 2>/dev/null | wc -l
```

### Find dead-code candidates (services with zero route imports)
```bash
for f in server/services/*.ts; do
  basename=$(basename "$f" .ts)
  count=$(grep -rln "from.*services/$basename\|require.*services/$basename" \
    server/routes/ 2>/dev/null | wc -l)
  echo "$count $f"
done | sort -n | head -20
```

### Per-file handler inventory
```bash
grep -nE "router\.(get|post|put|patch|delete)\(['\"]" server/routes/concept2cure.ts \
  | sed -E "s/.*router\.(get|post|put|patch|delete)\(['\"]/\1 /" \
  | sed "s/['\"].*//"
```

### `_legacy` directories
```bash
find . -type d -name '*_legacy*' -o -name '*_archive*' -o -name '*_backup*' 2>/dev/null \
  | grep -v node_modules
```

---

## 12. Appendix — what we already shipped (prior to this report)

For context. These are the commits this report builds on:

| Commit | Subject |
|---|---|
| `5a76cd6` | Phase 1 Tweaks panel wired |
| `b3367ff` | Doc conflict markers cleaned |
| `6ea3ce3` | **Phase 2** AnA chat shell installed, legacy chat tree deleted (−9,100 LOC) |
| `256afed` | **Phase 3** eCTD workbench installed |
| `f00817d` | CLAUDE.md Phase status updated |
| `266b41c` | Phase 3 Intelligence wired to live useAnaChat |
| `5297f38` | Phase 3 tree + artifacts from `/api/authoring/docs` |
| `34d6283` | Phase 3 content parser + Submit/Export wired |
| `205f1e0` | Phase 3 RIM tree footer + share + revert wired |
| `2becea8` | Schema-import typecheck slice (−11 errors) |
| `9673129` | Phase 1 live AnA briefing + ReviewReadiness dead code removed (−28 errors) |
| `74e6021` | useHomeBriefing on TanStack Query + WorkspaceStatusBadge import |
| **`2f1bfd9`** | **drizzle-zod 0.8.3 → 0.7.1 downgrade, −492 typecheck errors** |
| `3512eaa` | This report (original short version) |

Three Claude Design phases live in production:
- **Phase 1 Home** — `client/src/concept2cure/components/concept2cure-home/` — rail, command palette, Tweaks (`?tweaks=1`), live AnA briefing card pulling RIM next-actions
- **Phase 2 AnA chat shell** — `client/src/concept2cure/components/ana/` — replaces legacy AnaPersistentPanel at all 4 ZenApp call sites; streams `/api/ana-ri/stream`; recents from `/api/chat/threads`
- **Phase 3 eCTD co-authoring workbench** — `client/src/concept2cure/components/claude-ectd-coauthor/` — 3-pane (tree / intelligence / artifact) with live data from `/api/authoring/docs`, RIM tree footer from `/api/authoring-actions/module-readiness`, Submit/Export/Revert/Share all hit real endpoints

Legacy chat tree fully deleted; legacy editor tree (`components/editor/**`) retained pending Phase 3 parity for diff/comments/approvals/compliance scanning.

---

*End of report.*
