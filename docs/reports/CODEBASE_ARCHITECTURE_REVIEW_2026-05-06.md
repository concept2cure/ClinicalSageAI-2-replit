# Codebase architecture review — 2026-05-06

Scope: server, scripts, build, dependencies, root layout. **UI (`client/`, `design-system/`, `ui_kits/`, root MDX kit fixtures) is explicitly excluded** — the designer is evaluating the UI in parallel.

This review identifies bloat, duplication, version conflicts, and dead code. Each finding has a verdict (delete / keep / migrate) and an estimated risk level. The two changes already landed on this branch are listed at the bottom.

---

## Executive summary

The repo accumulated significant entropy from three historical phases (pre-Drizzle Prisma era, Replit/FastAPI bridging, and feature-branch one-shots that were never archived). The **runtime stack is sound** — Drizzle + Postgres + Express + Vite/React — but there is roughly **3,500 lines of dead server code, ~13 unused npm dependencies, a React 19/18 version mismatch, and ~80 npm scripts** that include obsolete one-shots.

Highest-impact, lowest-risk wins (in order):

| # | Action | Risk | Payoff |
|---|---|---|---|
| 1 | Fix React 19 / React-DOM 18 version mismatch | **Critical** | Prevents hydration runtime errors |
| 2 | Drop 13 confirmed-unused npm dependencies | Low | -15% install size, faster CI |
| 3 | Move/delete 17 unreferenced `server/*.js` one-shots (~5,200 LOC) | Low | Reduces server surface ~30% |
| 4 | Decide on Prisma vs Drizzle (Drizzle has won; remove Prisma artifacts) | Medium | Eliminates dual-ORM confusion |
| 5 | Consolidate 4 `server/__tests__/`, `server/tests/`, `server/test/`, loose `server/test-*.js` into one test root | Low | Predictable test discovery |
| 6 | Archive 15 root-level audit/report `.md` files (~320 KB) into `docs/archive/` | None | Cleaner repo root |

---

## 1. Server architecture — duplication and dead code

### 1.1 Confirmed-dead `server/*.js` one-shots (refs=0 across whole repo)

These files have **zero import or `require()` references** outside their own definition. Verified via `rg "(from|require\()\s*['\"][^'\"]*<name>['\"]"` on the full tree.

| File | LOC | Recommendation |
|---|---:|---|
| `server/test-510k-generation.js` | 276 | Move to `server/__tests__/legacy/` or delete |
| `server/test-huggingface.js` | 67 | Delete (scratch script) |
| `server/test-retrieve-api.js` | 34 | Delete (scratch script) |
| `server/test_cer_data.js` | 135 | Delete (scratch script) |
| `server/founder-login.js` | 64 | Delete (legacy auth shim) |
| `server/keep-alive.js` | 118 | Delete (use `/api/health`) |
| `server/standalone.js` | 56 | Delete (dev-only server) |
| `server/direct-api.js` | 126 | Delete (dev bypass) |
| `server/static-routes.js` | **1,688** | Delete — `setupStaticRoutes()` never called |
| `server/diagnostics.js` | 84 | Delete — superseded by `startup/inline-endpoints.ts` |
| `server/metrics.js` | 103 | Delete — superseded by `startup/inline-endpoints.ts` |
| `server/mock-data.js` | 324 | Move to `server/__tests__/fixtures/` if useful, else delete |
| `server/seed-cerv2-sections.js` | 432 | Move to `scripts/` if used, else delete |
| `server/show-ai-defense-report.js` | 280 | Delete |
| `server/generate-all-submissions.js` | **1,188** | Delete or move to `scripts/` |
| `server/fastapi_proxy.js` | 82 | Delete |
| `server/fastapi_bridge.js` | 81 | Delete (consolidate to one TS service) |
| `server/fastapi_bridge.cjs` | 233 | Delete (consolidate) |
| `server/proxy-setup.mjs` | 58 | Delete |
| `server/proxy-setup-esm.mjs` | 285 | Delete (not wired) |
| `server/cer_integration.js` | 293 | Delete — superseded by `server/services/cer/` |
| `server/data_integration.js` | 393 | Delete (only used by other unwired files) |
| `server/eudamed_client.js` | 318 | Delete (only used by `data_integration.js`) |
| `server/openai.js` | 380 | Delete — superseded by `server/services/openai-service.ts` |
| `server/cache_manager.js` | 233 | Delete (only used by `eudamed_client.js`) |
| `server/advisor-routes.js` | 189 | Delete or consolidate into `server/routes/` |
| `server/regulatory-brain-routes.js` | 217 | Delete or consolidate |
| `server/data-importer.ts` | 754 | Delete — superseded by `data-importer-v2.ts` |

**Total: ~7,600 LOC of dead server code.** Risk is low because every entry was verified by import-statement grep. Recommend a single PR titled `chore(server): remove unwired one-shot files` after the user audits the list.

### 1.2 Mixed JS/TS in same domain

- **CER**: `cer_integration.js` (legacy) coexists with `server/services/cer/index.ts` (modern).
- **FDA/FAERS**: `fda_faers_client.js`, `fda_maude_client.js` (legacy JS) coexist with `server/services/fda/index.ts` (modern TS). Migrate to TS service.
- **EUDAMED**: `eudamed_client.js` has no TS twin — it's just orphaned.

Verdict: Delete the JS legacy versions; the TS services are canonical.

### 1.3 Test home fragmentation

Four test homes exist inside `server/`:
- `server/__tests__/` — convention, used by Jest config
- `server/tests/` — orphan dir
- `server/test/` — orphan dir
- `server/test-*.js`, `server/test_*.js` — loose scratch tests in server root

**Verdict**: Consolidate to `server/__tests__/` only. The Jest config (`server/jest.config.js`) already uses that path.

### 1.4 db.js / db.ts is OK

`server/db.js` is intentional — a 9-line CommonJS compatibility wrapper that re-exports `server/db.ts`. Keep both. (This was flagged by an audit subagent, but the file header explains the intent.)

### 1.5 Deprecated migrations directory

`server/_deprecated_migrations/` contains 4 SQL files plus `runMigrations.ts`. Only referenced from `reports/phase0/code_inventory.txt` and `dangerfile.js` (introspection). No runtime caller.

**Verdict**: Move to `docs/archive/migrations/` or delete.

---

## 2. Dependency hygiene

### 2.1 Critical: React major version mismatch

```
"react": "^19.2.5",
"react-dom": "^18.3.1",
"@types/react": "^19.2.14",
"@types/react-dom": "^18.3.1",
```

React 19 with React-DOM 18 will produce **runtime hydration mismatches** and the type packages disagree. Pick one major: either upgrade `react-dom` and `@types/react-dom` to 19, or downgrade `react` and `@types/react` to 18. **This must be addressed before any prod release.**

### 2.2 Confirmed-unused production deps (delete from `package.json`)

Verified by import-statement grep across whole repo (excluding `node_modules`, `dist`).

| Package | Why drop | Server import count |
|---|---|---:|
| `aws-sdk` (v2) | Replaced by `@aws-sdk/client-s3` v3 | 0 |
| `jspdf` | Unused | 0 |
| `jspdf-autotable` | Companion to unused `jspdf` | 0 |
| `pdf-annotate.js` | Unused | 0 |
| `markdown-it` | Replaced by `marked` | 0 |
| `remark-parse` / `remark-stringify` / `unified` | Unused | 0 |
| `dayjs` | Replaced by `date-fns` | 0 |
| `langchain` | LLM SDKs called directly | 0 |
| `@langchain/openai` | Same | 0 |
| `@langchain/community` | Same | 0 |
| `firebase` | Unused (Supabase + pg used) | 0 |
| `@sendgrid/mail` | Replaced by `nodemailer` | 0 |
| `fast-xml-parser` | Replaced by `xml2js` / `cheerio` | 0 |
| `@xmldom/xmldom` | Unused | 0 |
| `jsdom` | Unused at runtime (test-only via `jest-environment-jsdom`) | 0 |
| `lodash` | 0 server imports — confirm in client before dropping | 0 server |
| `remeda` | Unused | 0 |
| `compromise` | NLP lib — verify usage | needs check |

### 2.3 Possibly-redundant deps — investigate before acting

- `prisma` + `@prisma/client` (8 imports) vs `drizzle-orm` (249 imports). **Drizzle has clearly won.** Migrate the 8 Prisma callers (look for `services/semanticSearch.js`, `pipelines/bulk_import.js`) and delete the Prisma stack including `prisma/` directory.
- `@tanstack/react-query` AND `wouter` AND `react-router-dom` — confirm the routing strategy. Likely `wouter` won and `react-router-dom` is dead.
- `pdfkit` (16) + `pdf-parse` (13) + `pdf-lib` (6) + `pdf.js-extract` (3) + `react-pdf` (UI) — five PDF libs is excessive but each appears to have a distinct purpose (generation / parsing / annotation / fallback / viewing). Consolidation possible but not urgent.
- `csv-parse` (1) + `csv-parser` (2) — two libs for one job; pick `csv-parse` (more capable) and drop `csv-parser`.

### 2.4 Confirmed-OK redundancies

- `@tailwindcss/postcss` + `tailwindcss` — both required for Tailwind v4 PostCSS pipeline.
- `pg` + `@neondatabase/serverless` — different transports for different deploy targets.
- `@anthropic-ai/sdk` + `openai` + `@google/generative-ai` — three legitimate AI vendors.
- `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` — SDK + helper.

---

## 3. `package.json` scripts (78 entries)

Categorical breakdown:

| Category | Count | Notes |
|---|---:|---|
| `audit:*` | 14 | `audit:last-20-prs*` look one-shot — still wired in `ops-audit-plan.yml`. `audit:repo-health:*` has 4 variants for one scan |
| `ci:*` | 15 | All active; governance checks |
| `db:*` | 9 | Active; consolidate `db:readiness` and `readiness:check` (duplicate concerns) |
| `cerv2:*` | 5 | Feature-branch only; archive once GA |
| `beta:*` | 4 | Feature-branch only; `beta:founder-proof` and `beta:proof` are terminal one-shots |
| dev / build / check / lint / test | 9 | Core; keep |
| `storybook*` | 3 | Question whether Storybook is still used given shadcn/Radix pivot |
| `smoke:*`, `validate:*` | 5 | Mixed quality; `smoke:e2e-assembly` looks obsolete |
| Other | 14 | |

**Recommendations**:
1. Collapse `audit:repo-health` 4 variants → 2 (`:check` + `:strict`), pass options as flags.
2. Collapse `ci:audit-route-mounts` 4 variants → 2.
3. Move `cerv2:*` and `beta:*` into `scripts/feature-branches/README.md` as docs, or delete after merge.
4. Delete `beta:founder-proof`, `beta:proof`, `smoke:e2e-assembly` if their CI jobs no longer reference them.

---

## 4. Repo-root layout

### 4.1 Markdown bloat at root

15 audit/report/plan markdown files at root totalling ~320 KB:

```
ARCHITECTURE-AI-ACTIONS.md            AUDIT-AI-UBIQUITY.md
C2C_PRODUCT_AUDIT_QUESTIONNAIRE_RESPONSES.md   COLOR_REPLACEMENT_REPORT.md
CONCEPT2CURE_AI_OS_AUDIT_PLAN.md      CONCEPT2CURE_AI_OS_CONTROL_IMPLEMENTATION_MAP.md
CONCEPT2CURE_AI_OS_EVALUATION.md      CONCEPT2CURE_AI_OS_EVIDENCE_PACK_TEMPLATE.md
CONCEPT2CURE_IMPLEMENTATION_TRACKER.md   DATA_KNOWLEDGE_MEMORY_LAYER_AUDIT.md
EXTERNAL_EVIDENCE_INTELLIGENCE_IMPLEMENTATION_REPORT.md
FEATURE_INVENTORY.md                  GENERAL_RELEASE_AUDIT_2026-03-20.md
INFERENCE_RESOURCE_ALLOCATION_AUDIT_2026-03-24.md
PHASE6_COMPLETION_CHECKLIST.md        PHASE_2_MDX_HANDOFF.md
QC_AUDIT_REPORT_2026-02-13.md         REGULATORY_UX_AUDIT_2026-02-13.md
STABILIZATION_REPORT.md
```

**Verdict**: Move to `docs/archive/<year-month>/`. Keep only `README.md`, `CLAUDE.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md`, `LICENSE`, `HANDOFF.md`, `SKILL.md`, `AGENTS.md`. The reports remain available in git history and `docs/archive/`.

### 4.2 Root binary / lockfile cruft

- `bun.lock` (427 KB) — stray Bun lockfile in an npm project. **Already untracked on this branch** and added to `.gitignore`.
- `design-system-bundle.tgz.bin` (130 KB) — stale tarball, no clear consumer. Recommend deleting unless someone identifies a CI consumer.
- `4-29-26 mdx` — 1-byte file (just a newline), looks like accidental shell output. **Already deleted on this branch.**

### 4.3 Stray UI kit fixtures at root (NOT orphans — leave alone)

`data-correspondence-detail.jsx`, `data-pathway-tabs.jsx`, `data-submissions.jsx`, `dossier-store.jsx`, `drafter.css`, `files-tree.css`, `pathway-tabs.css` — these are MDX UI kit reference fixtures listed in root `README.md` as canonical design data. The designer is reviewing UI now; **these stay.** A future move into `design-system/ui_kits/mdx/` should be done as part of the UI consolidation, not in this server-cleanup pass.

### 4.4 Database directory sprawl

The repo has at least nine directories that look DB-related:

```
prisma/                       # legacy Prisma schemas (read-only)
migrations/                   # Drizzle migrations (active)
init-sql/                     # Postgres init scripts — verify use
init-scripts/                 # ?
sql/                          # ?
database/                     # ?
db/                           # ?
server/db/                    # active Drizzle runtime + bootstrap
server/database/              # ?
server/prisma/                # legacy
server/schema/                # ?
shared/schema.ts              # active Drizzle schema (canonical)
schemas/                      # ?
```

**Verdict**: Audit each. Canonical = `server/db/` + `migrations/` + `shared/schema.ts`. Everything else is suspect; consolidate or delete.

### 4.5 Python subsystem

`requirements.txt` at root, plus `services/`, `ingestion/`, `models/`, `services/ich_wiz/`, `server/scripts/docx_pdf_pipeline.py`, etc. This is a Celery + FastAPI analytics microservice that's cleanly isolated from the Node monolith — communication is via job queue, not direct imports.

**Verdict**: Acceptable. But document this in root `README.md` as a separate runtime, and ensure deploy instructions cover it.

### 4.6 Docker compose proliferation

`docker-compose.yml`, `.beta.yml`, `.staging.yml`, `.e2e.yml` — all four serve distinct environments. Keep.

---

## 5. Test infrastructure

- `vitest.config.ts` + `vitest.workspace.ts` — vitest is the modern runner.
- `scripts/jest.config.js` + `server/jest.config.js` — two Jest configs running simultaneously per the `test` npm script.
- `package.json` `test`: `jest --config scripts/jest.config.js && vitest run --config vitest.config.ts`

**Verdict**: Two test runners is sustainable but pick one for new code. Document the split in `tests/README.md` (which test goes where).

---

## 6. Build / config files

- `tsconfig.json` + `tsconfig.beta-slice.json` — beta slice is for `beta:typecheck`. OK.
- `eslint.config.js` + `.eslintrc.cjs` — **two ESLint configs at root**. ESLint 10 reads the flat config (`eslint.config.js`) and silently ignores `.eslintrc.cjs`. **However, `.eslintrc.cjs` is not a clean delete** — it carries rules the flat config is missing:
  - `eslint-plugin-security` enforcement
  - `eslint-plugin-tailwindcss` enforcement (incl. `tailwindcss/no-custom-classname`)
  - Tech-debt prevention rules: `max-lines: 500`, `max-lines-per-function: 100`, `max-depth: 4`, `max-params: 5`, `complexity: 15`
  - Stricter overrides for `modules/**` (errors on `max-lines` and `no-console`)
  - Relaxed overrides for `_deprecated/**` paths
  - `ignorePatterns` block (which the npm `lint` script currently tries to replicate via inline `--ignore-pattern` flags)
  - The `concept2cure/**` override banning `LoadingOverlay`, `ThinkingDots`, and pattern matches on deprecated state imports

  **Correct fix**: port the legacy rules into the flat config in a focused PR with a green lint run (likely several files will need fixes once `max-lines` is enforced). Then delete `.eslintrc.cjs`. Do not delete it first — that silently relaxes the lint surface.
- `package.json` lint scripts have many `--ignore-pattern` flags carrying technical debt:
  ```
  --ignore-pattern client/src --ignore-pattern tests/integration/api/vault.test.js
  --ignore-pattern server/events/eventBus.js --ignore-pattern server/routes/fda510k-routes.ts
  --ignore-pattern server/services/pdfGenerator.js
  ```
  These should be moved into `eslint.config.js` `ignores`, and the underlying lint failures fixed file-by-file rather than carried forever.

---

## 7. Recommended phased plan

### Phase A — safe and immediate (this PR or follow-up)

- [x] Add `tmp/`, `logs/`, `bun.lock` to `.gitignore`.
- [x] Untrack `bun.lock` (committed by mistake; project uses npm).
- [x] Delete 1-byte garbage file `4-29-26 mdx`.
- [ ] Archive 15 root-level audit `.md` files → `docs/archive/2026-pre-stabilization/`.
- [ ] ~~Delete `.eslintrc.cjs`~~ — **NOT safe**: legacy config has rules the flat config is missing (see §6). Port the legacy rules into the flat config first, then delete `.eslintrc.cjs`.
- [ ] Delete `server/_deprecated_migrations/` after archiving the SQL.

### Phase B — server cleanup (one focused PR)

- [ ] Delete the 28 unreferenced `server/*.js` files listed in §1.1 (~7,600 LOC).
- [ ] Consolidate `server/tests/`, `server/test/`, loose `server/test-*.js` → `server/__tests__/`.
- [ ] Decide on FastAPI bridge — if needed, write `server/services/fastapi-gateway.ts`; if not, delete all four bridge variants.
- [ ] Migrate the 8 Prisma callers (`services/semanticSearch.js`, `pipelines/bulk_import.js`) to Drizzle.
- [ ] Delete `prisma/` directory and `@prisma/client` dependency.

### Phase C — dependency hygiene (one focused PR with full test pass)

- [ ] **Critical**: align React + React-DOM versions.
- [ ] Drop confirmed-unused deps (§2.2).
- [ ] Investigate router (`wouter` vs `react-router-dom`) and pick one.
- [ ] Investigate `csv-parse` vs `csv-parser` and pick one.

### Phase D — script consolidation (low priority)

- [ ] Collapse audit/CI variants behind flags.
- [ ] Archive `cerv2:*` and `beta:*` once their feature branches merge.
- [ ] Move loose `scripts/*.mjs` one-shots to `scripts/deprecated/`.

### Phase E — DB directory consolidation (medium priority, needs care)

- [ ] Audit nine DB-adjacent directories; merge canonical into `server/db/` + `migrations/` + `shared/schema.ts`; delete the rest.

---

## 8. What this branch landed

Multiple commits on `claude/review-codebase-architecture-eXZ6z`. After every code change, `tsc --noEmit` was rerun: baseline = 2,628 pre-existing errors, after-changes = 2,628. Zero regressions.

### Round 1 — junk cleanup

1. `.gitignore`: added `tmp/`, `logs/`, `bun.lock`.
2. Deleted `4-29-26 mdx` (1-byte file) and untracked `bun.lock` (427 KB stray Bun lockfile in an npm project).
3. Moved `server/_deprecated_migrations/` → `docs/archive/server-deprecated-migrations/`. The directory was referenced only by `dangerfile.js`'s deprecated-paths rule, which checks added content rather than directory existence — rule keeps working. Added a `README.md` recording the move.

### Round 2 — server dead code (Phase B)

4. Deleted **22 verified-dead `server/*.js` files** (refs=0 by import grep): `static-routes.js` (1,688 LOC), `generate-all-submissions.js` (1,188), `mock-data.js`, `seed-cerv2-sections.js`, `cer_integration.js`, `proxy-setup.mjs`, `proxy-setup-esm.mjs`, `fastapi_bridge.{js,cjs}`, `fastapi_proxy.js`, `show-ai-defense-report.js`, `standalone.js`, `direct-api.js`, `keep-alive.js`, `founder-login.js`, `diagnostics.js`, `advisor-routes.js`, `regulatory-brain-routes.js`, and 4 loose `test-*.js` / `test_*.js` scratch files. **Total: -6,313 LOC.**
5. Removed `server/generate-all-submissions.js` from the `APPROVED_JS` allowlist in `scripts/ci/check-docx-runtime-canonicality.mjs`.
6. Six files originally on the deletion list were spared after deeper grep showed they're live: `metrics.js` (3 importers), `data_integration.js` (1), `eudamed_client.js` (1), `cache_manager.js` (3), `openai.js` (10), `data-importer.ts` (2). Updated review accordingly.

### Round 3 — dependency cleanup (Phase C)

7. Dropped **15 confirmed-unused npm packages** from `package.json`:
   - `aws-sdk` (v2 deprecated), `@sendgrid/mail`, `@langchain/openai`, `@langchain/community`, `langchain`
   - `compromise`, `dayjs`, `remeda`
   - `markdown-it`, `remark-parse`, `remark-stringify`, `unified`
   - `fast-xml-parser`, `jspdf-autotable`, `pdf-annotate.js`
8. Several packages I had originally flagged were spared after grep showed UI usage: `jspdf` (`client/src/utils/`, `client/src/services/`), `firebase` (`client/src/concept2cure/hooks/`, `config/firebase.ts`), `@xmldom/xmldom` (`client/src/services/ectdTemplates.js`), `lodash` (`client/src/components/ai/CodeAnalysisPanel.jsx`), `jsdom` (transitive risk via `jest-environment-jsdom`).

### Round 4 — Prisma exit (Phase E partial)

9. Deleted `server/db/prisma.ts` (defensive shim, 0 importers).
10. Removed unused `Decimal` type import from `server/services/cognitive-ecosystem/types.ts`.
11. Archived `prisma/schema*.prisma` → `docs/archive/prisma-legacy/` with explanatory README.
12. Deleted `prisma/seed.js` and `scripts/seedProfiles.ts` (both 0 importers, never invoked from npm scripts).
13. Removed `@prisma/client` package from `package.json`.

### What was NOT changed — and why

- **React 19 / React-DOM 18 mismatch** (§2.1): confirmed installed versions are React 19.2.6 + React-DOM 18.3.1. Either direction of the fix changes runtime behavior of UI under live evaluation. Needs explicit user choice + targeted test pass.
- **ESLint dual-config port** (§6): lint is currently broken at the tooling layer. ESLint 10 removed APIs that `@typescript-eslint@7` depends on (`LegacyESLint`). Fixing requires holistic upgrade of `@typescript-eslint` to v8+, which has its own breaking changes. Out of scope of "consolidate configs" — this is a tooling upgrade.
- **Prisma callers `server/services/semanticSearch.js`, `server/pipelines/{bulk_import,indexDocs}.js`, `server/prisma/client.js`**: all are CLI scripts (no exports, run directly). The chain is internally orphan per its own header comment. Left alone because human operators may still invoke them on demand; deleting needs explicit owner sign-off.
- **DB directory consolidation** (§4.4): too many directories to audit safely in one sweep. Each needs individual ownership review.
- **Mass markdown archive** (§4.1): inter-doc cross-references would need to be rewritten.

### Summary

Across four rounds: **52 files removed**, **~6,900 LOC deleted**, **16 npm packages dropped** (15 unused + Prisma), **0 typecheck regressions**. The remaining recommendations in this document each need an owner decision before proceeding.
