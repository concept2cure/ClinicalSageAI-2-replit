# Concept2Cure v2 — Current Canonical State

**Generated:** 2026-04-01
**Branch:** `concept2cure-v2` (HEAD `0e8674c3`)
**Prior cleanup workstream:** Fully merged — 0 commits ahead, 0 behind
**Purpose:** Single source of truth for what the product is right now

---

## 1. Branch Reality

The prior cleanup workstream branch (`cursor/critical-files-management-f38a` and similar)
has been **fully integrated** into `concept2cure-v2`. The merge risk described in the
original work order no longer applies as a branch-divergence problem. The integration
risk is now **internal**: duplicate routes, monolithic files, and test gaps are all on
the single branch and must be addressed in-place.

| Metric | Value |
|--------|-------|
| Workstream commits ahead of base | 0 |
| Workstream commits behind base | 0 |
| Merge base | `0e8674c3` (same as HEAD) |
| Recent history | Template/submission sequence work, auth hardening, PR integrations |

---

## 2. Shell Architecture (Client)

### Entry chain

```
index.html → main.tsx → App.jsx → ZenRouter.tsx → ZenApp.tsx
```

| File | Lines | Role |
|------|------:|------|
| `client/src/main.tsx` | 26 | Canonical Vite entry: Sentry, QueryClient, ErrorBoundary, App |
| `client/src/main.jsx` | 13 | Legacy alternate entry — not used by index.html |
| `client/src/App.jsx` | 967 | Root router: wouter Switch, lazy routes, login redirects, AnAAssistantContainer |
| `client/src/concept2cure/router/ZenRouter.tsx` | ~450 | Concept2Cure sub-router: auth gates, project bridges, onboarding |
| `client/src/concept2cure/ZenApp.tsx` | 4,265 | **The real shell**: sidebar, chat, command palette, project identity, workspace handoff |

### Shell organs

| File | Lines | Blast radius | Current state |
|------|------:|-------------|---------------|
| `ZenApp.tsx` | 4,265 | **Critical** — project identity, route policy, module hosting, handoff state, AnA context | Working but monolithic; prior cleanup demoted dead renderers |
| `ProjectWorkspaceShell.tsx` | 3,499 | **Critical** — governed document workspace (trees, editor, inspectors) | Strongest governed surface; Phase 3 additions landed |
| `AnaPersistentPanel.tsx` | 5,405 | **Critical** — single AnA chat surface, queue, message handling | Working; largest client component |
| `ZenSidebar.tsx` | 1,255 | **High** — global + project navigation, pinned/recent projects | Clean after cleanup; 6 global + 5 project tabs |

### Route truth

- All login aliases (`/sign-in`, `/auth`, `/login`) redirect to `/concept2cure/login`
- Root `/` redirects to `/concept2cure`
- `/concept2cure/*` is the canonical product shell
- `App.jsx` still carries ~60 lazy-loaded secondary routes (CMC, CSR, CER, admin, etc.)
- Legacy routes (`/client-portal`, `/v3`) are not in the approved beta path

---

## 3. Backend Architecture

### Express entry

| File | Lines | Role |
|------|------:|------|
| `server/index.ts` | 7,911 | **The backend monolith**: all middleware, all route mounts, startServer() |
| `server/routes/concept2cure.ts` | 16,383 | **The API monolith**: projects, documents, conversations, artifacts, AI, vault, team |

### Route mount reality

**307 route files** under `server/routes/` (263 `.ts`, 26 `.js`, plus subdirectories).
Total directory: **6.3 MB**.

#### Known duplicate/stacked prefixes in server/index.ts

| Prefix | Mount count | Files |
|--------|------------:|-------|
| `/api/ind` | 2 | `ind-generation.ts` (line 3923), `ind.ts` (line 7022) |
| `/api/regulatory` | 2 | `regulatory-registry.ts` (line 3928), `regulatoryRoutes.ts` (line 7266) |
| `/api/documents` | 4+ | `versionDiff.ts` (1761), `documents-unified.ts` (7184), `sourceLinks.ts` (7192), `document-intelligence-routes.ts` (7208), plus `documentManagement` at `/api` |
| `/api/ai` | 3 | Line 966, line 1032 (circuit breaker), line 3935 (claims) |
| `/api/projects` | 3 | Line 7083, line 7145, line 7146 (`project-modules`) |
| `/api/programs` | 2 | Line 1697 (SE Matrix), line 1709 (Defense Packet) |

#### Auth boundary files

| File | Lines | Role |
|------|------:|------|
| `server/middleware/auth.ts` | 248 | JWT auth: `authenticateToken`, `requireRole`, `requireOrgAccess`, `optionalAuth` |
| `server/middleware/auth.js` | 244 | ESM `.js` variant with same exports (different style) |
| `server/middleware/authAdapter.ts` | — | Adapter layer |
| `server/middleware/tenantAuth.ts` | — | Tenant-scoped auth |
| `server/routes/auth.ts` | ~50KB | Auth routes (login, register, password, MFA) |
| `server/routes/authEnterprise.ts` | ~23KB | Enterprise auth (SSO config, SAML) |
| `server/routes/sso.ts` | — | SSO routes |

### Database layer

| File | Lines | Role |
|------|------:|------|
| `server/db.ts` | 434 | **Canonical**: Pool, Drizzle, migrations, healthCheck |
| `server/db.js` | 252 | **Shim**: imports from db.ts, adds EventEmitter status tracking |

### Key service directories

| Directory | Size | Key contents |
|-----------|------|-------------|
| `server/services/` | 11 MB | 40+ subdirectories, 200+ files |
| `server/services/intelligence/` | — | RIM: rim.ts, judgment-framework, pattern-registry, signal-capture, interceptors |
| `server/services/ai-gateway/` | — | AI provider routing (Claude primary, OpenAI fallback) |
| `server/services/cortex/` | — | CORTEX Prime: knowledge atoms, threads, agents |
| `server/services/foresight/` | — | Predictive analytics (75KB engine) |
| `server/services/csr/` | — | CSR builder + knowledge extraction |

### Deprecated/legacy

- `server/routes/index.ts` (106 lines) — explicitly deprecated; `mountApiRoutes()` is no-op unless `ENABLE_LEGACY_API_INDEX=true`
- `server/routes_update.ts` — **deleted** (confirmed not present)
- `main.jsx` — legacy entry, not referenced by index.html

---

## 4. Schema and Database

| File | Role |
|------|------|
| `shared/schema/` (356 KB total) | Modular Drizzle ORM schemas — source of truth |
| `shared/schema/schema.ts` | Legacy monolithic backup (~730KB documented) |
| `migrations/` | SQL migration files (0000–0010+) |
| `db/migrations/` | Kernel DB schema additions |

---

## 5. Test Net

### Coverage summary

| Category | File count | Location |
|----------|----------:|----------|
| Unit tests | ~130 | `tests/` root + `tests/unit/` |
| Route tests | 15 | `tests/routes/` |
| Resolution tests | 16 | `tests/resolution/` |
| Service tests | 15 | `tests/services/` |
| Server tests | 73 | `server/**/__tests__/` |
| Client tests | 12 | `client/src/**/__tests__/` |
| E2E (Playwright .e2e.ts) | 9 | `tests/e2e/` — governed lifecycle, permissions, rollback, diff, review, submission-ops |
| E2E (Playwright .spec.ts) | 10 | `tests/e2e/` — login, biotech, workspace, CMC, screenshots — **NOT in default testMatch** |
| **Total** | **267** | |

### Playwright configuration

- Config: `playwright.config.ts` — `testMatch: '**/*.e2e.ts'` only
- Default base: `http://localhost:5000`
- **Port drift**: some spec files default to 5173 or 3000 — needs alignment
- The 10 `.spec.ts` files are **excluded** from default runs

### Known test gaps (from Stage 8 known-limits)

- `npm run typecheck` fails with broad pre-existing TS issues outside beta slices
- E2E assembly requires `DATABASE_URL` — cannot run in most CI without live DB
- `roleBasedAccess.test.ts` and `mfaService.test.ts` currently fail
- `guided-demo-path.test.ts` has drift failures (old strings/routes)
- `ana-ri-health.test.ts` has 1 failing mocked-import scenario

---

## 6. Documentation State

| Directory | Files | Role |
|-----------|------:|------|
| `docs/beta-work/` | 3 | Stage 8 beta RC pack, known limits, demo runbook |
| `docs/proof/` | 30 | Validation evidence (baseline, harness, document loop, canvas, etc.) |
| `docs/plans/` | 25 | Architecture plans, convergence specs, execution boards |
| `docs/reports/` | many | Audit reports, beta readiness, route audits |
| `docs/release/` | — | Rollback guidance, release notes |

---

## 7. What Is Beta-Safe Today

| Surface | Status | Evidence |
|---------|--------|----------|
| Zen shell (6 global + project tabs) | Beta-safe with caveats | Controlled beta freeze doc |
| Concept2Cure router + project module paths | Beta-safe | ZenRouter.tsx verified |
| Governed export + authoring guardrails | Beta-safe (smoke validated) | Stage 8 test results |
| AnA chat surface | Beta-safe | Single brain proof, benchmark results |
| Governed workspace (ProjectWorkspaceShell) | Beta-safe — strongest surface | Phase 3 validated |
| Document lifecycle (draft→review→verify→publish) | Beta-safe with known limits | Document loop proof |

### What Is Deliberately Hidden

| Surface | Disposition |
|---------|------------|
| Mission Control / SnowGlobe families | Demoted and redirected in ZenApp |
| Standalone eCTD without active project | Non-primary path; empty state expected |
| Legacy routes (`/v3`, `/client-portal`) | Not in approved demo path |
| Dr. Sage legacy code | Present in repo, not in primary shell |

---

## 8. Top Risks (Ordered)

1. **Server-side route duplication** — Multiple routers on same prefix creates ordering-dependent behavior and silent shadowing
2. **ZenApp monolith** (4,265 lines) — Every shell change touches one file; domain seams not yet extracted
3. **AnaPersistentPanel monolith** (5,405 lines) — Largest client component; change risk is high
4. **concept2cure.ts API monolith** (16,383 lines) — All product API in one file
5. **server/index.ts** (7,911 lines) — All middleware and route mounting in one file; mount-order sensitivity
6. **Auth boundary duplication** — `.ts` and `.js` variants of middleware/auth exist simultaneously
7. **Test port drift** — Playwright config, spec files, and E2E files use different default ports
8. **TypeScript type safety** — `npm run typecheck` does not pass cleanly
9. **App.jsx route museum** — ~60 secondary lazy routes still present alongside the canonical concept2cure path

---

## 9. Recommended Next Actions (Stage 8→13 Program)

| Stage | Mission | Depends on |
|-------|---------|-----------|
| 8 (this doc) | Canonical state lock + integration program | — |
| 9 | Authenticated browser pulse certification | Stage 8 canonical state |
| 10 | ZenApp domain-seam extraction | Stage 9 pulse baseline |
| 11 | Backend route ownership convergence | Stage 10 shell stability |
| 12 | AnA / artifact contract enforcement | Stage 11 API clarity |
| 13 | RC merge-back and human beta readiness | All prior stages |
