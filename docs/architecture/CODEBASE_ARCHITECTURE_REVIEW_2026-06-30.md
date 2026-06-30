# ClinicalSageAI Codebase Architecture Review

**Date**: 2026-06-30
**Scope**: Full-stack architecture audit — file structure, data layer, service coupling, build tooling, testing, documentation

---

## Executive Summary

ClinicalSageAI is a large-scale regulatory intelligence platform (~3.5M lines across TypeScript and Python) with **194 server-side service directories**, **1,145 test files**, **1,326 markdown documents**, and **270 npm dependencies**. The platform has grown rapidly, and organic sprawl has created significant architectural debt in six key areas:

| Priority | Area | Severity | Core Problem |
|----------|------|----------|--------------|
| **P0** | Database migrations | Critical | 325+ migration files split across 2 competing directories |
| **P0** | AI gateway bypass | Critical | 14+ services call OpenAI/Anthropic directly, bypassing audit and policy |
| **P1** | Service sprawl | High | 194 service dirs with heavy overlap (intelligence x5, protocol x10) |
| **P1** | Dependency duplication | High | 4 PDF libs, 3 validators, 2 routers, 3 XML parsers |
| **P1** | Database access bypass | High | 20+ services create raw `Pool` instances, bypassing the centralized facade |
| **P2** | Triple route layer | Medium | Routes in `server/routes/`, `server/api/`, and `server/src/routes/` |
| **P2** | Test framework split | Medium | Jest + Vitest with fragile mutual exclusion lists |
| **P2** | Documentation sprawl | Medium | 1,326 markdown files, 46 at root, 837 in `docs/` |
| **P3** | Config scatter | Low | 95+ files read `process.env` directly with no typed config |
| **P3** | Shadow service sync | Low | Python risk-code map with no verified generation pipeline to TypeScript |

---

## 1. Server-Side Architecture

### 1.1 Triple Route Layer

Routes are scattered across three directories:

| Location | File Count | Purpose |
|----------|-----------|---------|
| `server/routes/` | 467 | Primary route location |
| `server/api/` | 51 | Secondary API tree (ai, cmc, ectd) |
| `server/src/routes/` | ~10 | Third layer (control-plane, pm-settings) |

The `server/src/` tree appears to be an abandoned "clean rewrite" with its own middleware (`src/mw/`), services (`src/services/`), and routes.

**Recommendation**: Consolidate into `server/routes/` grouped by domain. Archive `server/src/` or complete the migration.

### 1.2 Service Layer Sprawl (194 Directories)

`server/services/` contains 194 subdirectories plus 13 loose service files at the `server/` root. Domain overlap is extensive:

| Domain | Competing Directories |
|--------|-----------------------|
| Intelligence | `intelligence`, `intelligence-engine`, `external-intelligence`, `research-intelligence`, `regulatory-precedent-intelligence` |
| Protocol | `protocol-budget`, `protocol-consent`, `protocol-milestones`, `protocol-risks`, `protocol-soa`, `protocol-templates`, `protocol-deviations`, `protocol-amendments`, `protocol-export`, `protocol-reviews` (10 dirs) |
| Regulatory | `regulatory-*` (6+ dirs) |
| IND | `ind`, `ind-common`, `ind-forms`, `ind-lifecycle`, `ind-master-data` |

Naming is inconsistent: camelCase (`documentIntelligence`, `reviewDiffs`) mixed with kebab-case (`document-consequence-engine`).

**Recommendation**:
1. Group related services under domain namespaces: `protocols/budget.ts`, `protocols/consent.ts`, etc.
2. Consolidate intelligence services under one `intelligence/` namespace with sub-modules.
3. Enforce kebab-case naming convention.
4. Move the 13 loose root-level service files into `server/services/`.

### 1.3 Bilingual Architecture (Node + Python)

The top-level `services/` directory is a **separate Python microservice** (Flask API, Celery workers) alongside the Node.js `server/`. This is intentional but undocumented.

**Recommendation**: Add a root-level `ARCHITECTURE.md` or update `docs/ARCHITECTURE.md` to document the Node/Python boundary and contract.

---

## 2. Data Layer

### 2.1 Competing Migration Directories (P0)

| Location | File Count | Notes |
|----------|-----------|-------|
| `migrations/` | 150 | Primary Drizzle migrations |
| `db/migrations/` | 175 | Competing migration set |
| `sql/migrations/` | 3 | Tertiary location |
| `server/db/_deprecated_migrations/` | 7 | Deprecated but present |

**Risk**: Running migrations from the wrong directory could corrupt the schema or miss changes.

**Recommendation**: Designate `migrations/` as canonical. Archive `db/migrations/` if it's legacy. Add a CI check that blocks migration files from being added to the wrong directory.

### 2.2 ORM Fragmentation

Three database access patterns coexist:

1. **Drizzle ORM** via `server/db.ts` facade (primary)
2. **Raw SQL pools** via direct `new Pool()` instantiation (20+ services)
3. **Prisma client** (vestigial, in `server/prisma/`)

The `server/db.ts` facade is well-designed — it re-exports pool, Drizzle ORM, query helpers, transactions, health checks, and migrations. But 20+ services bypass it by creating their own `Pool` instances.

**Recommendation**:
1. Remove Prisma if unused.
2. Add ESLint rule: `no-restricted-imports` for `pg` `Pool` outside `server/db/`.
3. Audit and migrate the 20 bypassing services to use `db.getPool()`.

### 2.3 Configuration Scatter

95+ files access `process.env` directly. Only `DATABASE_URL` and `JWT_SECRET` are validated at startup. API keys for OpenAI, Anthropic, and other providers are not checked.

**Recommendation**: Create a typed config module using Zod that validates all required env vars at startup and is the single import point.

---

## 3. AI Gateway Bypass (P0)

The AI gateway at `server/services/ai-gateway/` is well-architected: multi-provider routing, automatic fallback, health tracking, audit logging, policy enforcement. But adoption is incomplete:

| Access Pattern | File Count |
|----------------|-----------|
| Via AI gateway | 38 |
| Direct `openai` import | 14 |
| Via legacy `openai-client.ts` / `anthropic-client.ts` | 12-13 |

Services bypassing the gateway get no audit trail, no fallback, and no policy enforcement.

**Recommendation**:
1. Add ESLint `no-restricted-imports` rule banning direct `openai`/`@anthropic-ai/sdk` imports outside `ai-gateway/`.
2. Deprecate `openai-client.ts` and `anthropic-client.ts` at the service root.
3. Migrate the 14+ direct callers to the gateway.

---

## 4. Build & Dependency Layer

### 4.1 Competing Dependencies

| Category | Libraries in Use | Recommended Standard |
|----------|-----------------|---------------------|
| Validation | `zod`, `yup`, `joi` | `zod` (already used with Drizzle) |
| PDF generation | `pdf-lib`, `pdfkit`, `jspdf`, `pdfmake` | Audit usage; standardize on 1-2 |
| XML parsing | `xml2js`, `xmlbuilder2`, `@xmldom/xmldom` | `xmlbuilder2` (modern API) |
| Routing (client) | `react-router-dom`, `wouter` | `react-router-dom` (more ecosystem support) |
| Diff | `diff`, `diff-match-patch` | Choose one based on use case |

Total: **204 production + 66 dev dependencies** (270 total).

### 4.2 Docker Compose Duplication

`docker-compose.beta.yml` is 95% copy-pasted from `docker-compose.yml` with only SSL mode and beta env vars changed. Both have hardcoded Postgres passwords.

**Recommendation**: Merge into one compose file with environment-variable overrides or a `docker-compose.override.yml`.

### 4.3 Script Sprawl

165 scripts in `scripts/` across 6 languages (`.mjs`, `.ts`, `.sh`, `.py`, `.cjs`, `.js`). Examples of duplication:
- `find_missing_fks.cjs`, `find_missing_indexes.cjs`, `find_missing_timestamps.cjs`, `find_missing_timestamps_v2.cjs` — four scripts doing similar work.
- Three deployment scripts (`deploy-dev.sh`, `deploy-prod.sh`, `deploy-staging.sh`) alongside Terraform and GitHub Actions.

**Recommendation**: Consolidate `find_missing_*` into one parameterized script. Standardize on `.mjs` or `.ts`.

---

## 5. Testing Architecture

### 5.1 Dual Test Framework

The `test` script runs Jest then Vitest sequentially. Jest handles only legacy client tests, but requires a **13-entry exclusion list** in `client/jest.config.js` to avoid conflicts with Vitest-flavored tests. A stale `server/jest.config.js` is never referenced by any npm script.

**Recommendation**: Migrate remaining Jest client tests to Vitest and remove all three Jest configs plus `babel-jest`/`ts-jest`/`jest-environment-jsdom`/`@types/jest` devDependencies.

### 5.2 Fragmented Test Locations

1,145 test files across 7+ locations:

| Location | Description |
|----------|-------------|
| `tests/` (top-level) | Mixed unit/integration/e2e |
| `tests/unit/`, `tests/integration/`, `tests/e2e/` | Structured subdirs |
| `server/__tests__/` | Server-level tests |
| `server/services/*/__tests__/` | ~130 `__tests__` directories |
| `server/test/` and `server/tests/` | Two additional server test dirs |

`server/test/` and `server/tests/` are separate directories with different content.

**Recommendation**: Consolidate `server/test/` and `server/tests/` into one. Move loose files from `tests/` root into `unit/` or `integration/`.

### 5.3 No Shared Test Fixtures

Test data is primarily inline. `tests/data/` has one PDF. `server/tests/fixtures/` has one 22-byte PDF. No factory functions, no builders, no shared fixture library.

**Recommendation**: Create `tests/_fixtures/` with domain-specific factory functions for common entities (projects, submissions, trials).

---

## 6. Documentation Sprawl

### 6.1 Volume

| Location | File Count |
|----------|-----------|
| Project root | 46 `.md` files |
| `docs/` | 837 `.md` files |
| Elsewhere in tree | ~443 `.md` files |
| **Total** | **~1,326** |

### 6.2 Root Pollution

46 markdown files at root, including 8 specs, 8 handoffs, 6 audits, 5 plans — most with date suffixes (`*_2026-06-15.md`).

**Recommendation**: Keep only `README.md`, `CHANGELOG.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, and `.ai-instructions.md` at root. Move everything else to `docs/`.

### 6.3 Docs Directory Bloat

| Subdirectory | Files |
|---|---|
| `docs/reports/` | 186 |
| `docs/audits/` | 111 |
| `docs/proof/` | 73 |
| `docs/archive/` | 57 |
| `docs/architecture/` | 55 |

**Recommendation**: Archive `reports/`, `audits/`, and `proof/` into `docs/_archive/` with date-based structure. Maintain 10-15 living documents maximum.

### 6.4 Feature Inventory Duplication

At least 5 files cover the same ground: `FEATURE_INVENTORY.md`, `docs/FEATURE_CATALOG_2026-06-16.md`, `docs/PRODUCT_VISION_ROADMAP.md`, `docs/ROADMAP.md`, plus 10 files in `docs/roadmap/`.

**Recommendation**: One `docs/FEATURE_INVENTORY.md`. One `docs/ROADMAP.md`. Archive the rest.

---

## 7. Workers & Background Jobs

Two separate systems exist:

| System | Location | Trigger | Security |
|--------|----------|---------|----------|
| **Workers** | `workers/artifact-compute/` | Request-triggered | Sandboxed, no network, bounded CPU/memory |
| **Jobs** | `server/jobs/` | Cron-scheduled | No sandboxing, direct env access |

This split is intentional but undocumented.

**Recommendation**: Document the distinction. Extract job configuration into a shared config module instead of per-job `process.env` reads.

---

## 8. Shadow Service (Python)

`shadow_service/shadow_service/` contains a deterministic risk-code-to-evidence mapping (`risk_code_map.py`, 24 risk codes). A generated TypeScript mirror exists at `shared/types/generated/risk-codes.generated.ts`.

**Risk**: No verified generation pipeline tying the Python source to the TypeScript output. They could diverge silently.

**Recommendation**: Add a CI check that regenerates the TypeScript file from the Python source and fails if the output differs.

---

## Prioritized Action Plan

### Phase 1: Safety (Week 1-2)
1. **Designate canonical migration directory** — add CI guard blocking migrations in the wrong location
2. **Enforce AI gateway usage** — ESLint rule + deprecate standalone AI clients
3. **Eliminate raw Pool bypasses** — migrate 20 services to `db.getPool()`
4. **Create typed config module** — validate all env vars at startup

### Phase 2: Consolidation (Week 3-4)
5. **Standardize dependencies** — choose one validator, one PDF lib, one XML parser
6. **Consolidate test framework** — migrate Jest tests to Vitest, remove Jest
7. **Merge Docker compose files** — eliminate beta copy-paste
8. **Clean root directory** — move 40+ markdown files to `docs/`

### Phase 3: Structure (Week 5-8)
9. **Group services by domain** — protocol/*, intelligence/*, regulatory/* under namespaces
10. **Consolidate route layers** — merge `server/api/` and `server/src/routes/` into `server/routes/`
11. **Archive stale docs** — reduce active docs from 837 to <100
12. **Unify test locations** — consolidate `server/test/` and `server/tests/`, organize `tests/` root

### Phase 4: Quality (Ongoing)
13. **Create shared test fixtures** — factory functions for domain entities
14. **Document bilingual architecture** — Node/Python boundary and contracts
15. **Add CI ratchets** — enforce conventions via `no-restricted-imports` and custom lint rules
