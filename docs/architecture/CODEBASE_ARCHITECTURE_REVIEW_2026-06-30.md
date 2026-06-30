# ClinicalSageAI Codebase Architecture Review

**Date**: 2026-06-30
**Scope**: Full-stack architecture audit — file structure, data layer, service coupling, build tooling, testing, documentation
**Method**: 12 specialized analysis agents across two rounds of investigation

---

## Executive Summary

ClinicalSageAI is a large-scale regulatory intelligence platform (~3.5M lines across TypeScript and Python) with **194 server-side service directories**, **1,145 test files**, **1,326 markdown documents**, and **270 npm dependencies**. The platform has grown rapidly, and organic sprawl has created significant architectural debt.

| Priority | Area | Severity | Core Problem |
|----------|------|----------|--------------|
| **P0** | Database migrations | Critical | Split-brain: Drizzle uses `migrations/`, CI applies GCC from `db/migrations/` via raw psql |
| **P0** | AI gateway bypass | Critical | 13 files bypass the gateway via legacy wrappers or direct SDK imports |
| **P0** | Config scatter | Critical | 434 env vars, only 2 validated at startup; 381 files access `process.env` directly |
| **P1** | Service sprawl | High | 194 service dirs with heavy overlap (intelligence x11, protocol-metrics x12) |
| **P1** | Dependency duplication | High | 4 unused/vestigial deps can be removed immediately |
| **P1** | Vestigial Prisma/Drizzle | High | Dead Prisma shim + redundant `server/drizzle.ts` creating dual ORM instances |
| **P2** | Triple route layer | Medium | Routes in `server/routes/`, `server/api/`, and `server/src/routes/` |
| **P2** | Test framework split | Medium | Jest + Vitest with fragile 13-entry mutual exclusion list |
| **P2** | Documentation sprawl | Medium | 1,326 markdown files, 46 at root, 837 in `docs/` |

---

## 1. Database Migrations — Split-Brain Risk (P0)

### The Problem

Two directories receive active migrations with no cross-validation:

| Directory | Files | Naming Pattern | Applied By |
|-----------|-------|----------------|------------|
| `migrations/` | 152 | Drizzle `0000_`-prefixed + date-stamped | Drizzle `runMigrations()` in `server/db/runtime.ts` |
| `db/migrations/` | 179 | 3-digit GCC series + date-stamped | Raw `psql` loop in CI (`ci.yml` lines 184, 242, 382) |
| `sql/migrations/` | 3 | Stale, orphaned | Nothing — completely unreferenced |

**`drizzle.config.ts` line 24** confirms `out: './migrations'` — Drizzle generates into and reads from `migrations/` only. The CI GCC pipeline independently applies `db/migrations/*_gcc_*.sql` via shell loop, bypassing Drizzle's migration journal entirely.

**Risk**: A migration in one directory can assume tables/columns created by the other, with no ordering guarantee. There is exactly 1 filename overlap (`20260501_q_sub.sql`) already.

### Existing Guardrails

- `scripts/ci/check-migration-prefix-collisions.mjs` — only scans `migrations/`, blind to `db/migrations/`
- `npm run ci:migration-prefix-collisions` — same limitation

### Remediation

1. **Consolidate**: Move all `db/migrations/*_gcc_*.sql` files into `migrations/` with their existing date prefixes
2. **Update CI**: Change the 3 `psql` loop references in `ci.yml` to point to `migrations/*_gcc_*.sql`
3. **Archive**: Rename `sql/migrations/` to `sql/_migrations_archived/`
4. **Guard**: Add CI step that fails if any new `.sql` file lands in `db/migrations/`
5. **CODEOWNERS**: Add `migrations/` entry requiring DB-owner review

---

## 2. AI Gateway Bypass (P0)

### Architecture

The AI gateway (`server/services/ai-gateway/`) is well-designed: multi-provider routing (OpenAI, Anthropic, Bedrock, Vertex, Azure, local), automatic fallback, health tracking, audit logging, policy enforcement, retry with overload-aware backoff. A CI guard (`check-gateway-bypass.mjs`) blocks new `new OpenAI()`/`new Anthropic()` instantiations.

### The Gap

The CI guard catches constructor calls but **not imports of legacy wrapper singletons**. Two legacy wrappers serve as bypass vectors:

- `server/services/openai-client.ts` — 9 importers
- `server/services/anthropic-client.ts` — 2 importers

### Complete Bypass Inventory

| File | What It Does | Via | Difficulty |
|------|-------------|-----|------------|
| `services/openai-service.ts` | Assistants API, chat, vision, DALL-E, web search | Direct `new OpenAI()` | **Hard** — Assistants API has no gateway equiv |
| `services/foresight-ai-engine.ts` | Predictive clinical intelligence | Gateway-first, `require('openai')` fallback | **Easy** — remove fallback |
| `services/advancedRAGPipeline.ts` | RAG pipeline | Unused `getOpenAIClient` import | **Easy** — delete import |
| `services/submission-twin-service.ts` | Digital twin | Unused `getOpenAIClient` import | **Easy** — delete import |
| `services/deep-research-orchestrator.ts` | Multi-source research | `anthropic.messages.create()` | **Medium** — 1 call site |
| `services/csr-extractor-service.ts` | CSR summarization | `getOpenAIClient` | **Medium** — 2 call sites |
| `services/EvidenceManagementService.ts` | FDA evidence extraction | `getOpenAIClient` | **Medium** — 1 call site |
| `workers/vectorization-worker.ts` | Embedding generation | `getOpenAIClient` | **Medium** — use `getEmbeddingProvider()` |
| `services/innovation/regulatory-delta-radar-service.ts` | Embeddings | `getOpenAIClient` | **Medium** — use `getEmbeddingProvider()` |
| `services/innovation/regulatory-negotiation-logbook-service.ts` | Embeddings | `getOpenAIClient` | **Medium** — 4 call sites |
| `services/innovation/auto-traceability-service.ts` | Embeddings | `getOpenAIClient` | **Medium** — 1 call site |
| `services/anthropic-files.ts` | Anthropic Files API (PDF upload) | `getAnthropicClient` | **Hard** — beta API, gateway needs passthrough |

**Score**: 3 easy (dead imports/fallbacks), 6 medium (swap to `getGateway().route()` or `getEmbeddingProvider()`), 2 hard (provider-specific APIs).

### ESLint Enforcement Rule

```jsonc
{
  "rules": {
    "no-restricted-imports": ["error", {
      "paths": [
        {
          "name": "openai",
          "message": "Use getGateway() from 'server/services/ai-gateway' for completions, or getEmbeddingProvider() for embeddings."
        },
        {
          "name": "@anthropic-ai/sdk",
          "message": "Use getGateway() from 'server/services/ai-gateway'."
        }
      ],
      "patterns": [
        {
          "group": ["**/openai-client", "**/anthropic-client"],
          "message": "Legacy AI client wrappers are deprecated. Use the AI gateway."
        }
      ]
    }]
  },
  "overrides": [{
    "files": ["server/services/ai-gateway/**/*"],
    "rules": { "no-restricted-imports": "off" }
  }]
}
```

---

## 3. Configuration Scatter (P0)

### The Problem

**434 unique `process.env` keys** accessed across **381 files** in `server/`. Only **2 are validated at startup** (`DATABASE_URL`, `JWT_SECRET`). Three more are warned-only (`SENTRY_DSN`, `REDIS_URL`, `ANTHROPIC_API_KEY`). The remaining **~429 are completely unchecked**.

| Category | Keys | Examples |
|----------|------|---------|
| Database | 10 | `DATABASE_URL`, `NEON_DATABASE_URL`, `NEO4J_URI` |
| Auth/JWT/SSO | 28 | `JWT_SECRET`, `MFA_ENCRYPTION_KEY`, `SAML_*` (12 keys) |
| AI Provider Keys | 18 | `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `AZURE_OPENAI_*` |
| Feature Flags | ~50 | `ENABLE_*`, `ANA_*`, `PRECLINICAL_*_ENABLED` |
| External Service URLs | ~40 | `GROBID_BASE_URL`, `TIKA_BASE_URL`, `TEMPORAL_ADDRESS` |
| Infrastructure | 15 | `PORT`, `NODE_ENV`, `REDIS_URL`, `SENTRY_DSN` |
| Other (DocuShare, FDA, SMTP, S3, etc.) | ~270 | Sprawling one-off integration configs |

### Breakdown by Directory

| Directory | Files accessing `process.env` |
|-----------|------|
| services/ | 178 |
| routes/ | 57 |
| __tests__/ | 36 |
| utils/ | 15 |
| middleware/ | 14 |
| integrations/ | 14 |
| Other | 67 |

### Remediation: Typed Config Module

```typescript
// server/config/env.ts
import { z } from 'zod';

const boolStr = z
  .enum(['true', 'false', '1', '0', ''])
  .optional()
  .transform(v => v === 'true' || v === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().url().optional(),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be >= 32 chars'),
  JWT_SECRET_PREVIOUS: z.string().optional(),
  REFRESH_TOKEN_SECRET: z.string().min(32).optional(),
  MFA_ENCRYPTION_KEY: z.string().optional(),

  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4o'),
  ANTHROPIC_API_KEY: z.string().optional(),
  AZURE_OPENAI_API_KEY: z.string().optional(),
  AZURE_OPENAI_ENDPOINT: z.string().url().optional(),

  SENTRY_DSN: z.string().url().optional(),
  STORAGE_PROVIDER: z.enum(['local', 's3']).default('local'),
  AWS_S3_BUCKET: z.string().optional(),
  SMTP_HOST: z.string().optional(),

  ENABLE_EXPERIMENTAL_ROUTES: boolStr,
  ENABLE_DEMO_ROUTES: boolStr,
  SINGLE_TENANT_MODE: boolStr,
}).passthrough(); // Allow uncatalogued vars during incremental migration

function loadConfig() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('[FATAL] Environment validation failed:');
    for (const issue of result.error.issues)
      console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    process.exit(1);
  }
  return Object.freeze(result.data);
}

export const config = loadConfig();
export type Config = z.infer<typeof envSchema>;
```

**Migration path**: Import `config` from this module. Use `.passthrough()` so unrecognized keys survive during incremental adoption. Add groups (DocuShare, FDA, ANA) as services are migrated.

---

## 4. Service Layer Sprawl (P1)

### Cluster Analysis

Deep investigation of the 194 service directories identified five heavily overlapping clusters:

#### Intelligence Cluster (11 files → 4 namespaces)

| Current | Purpose | Proposed Location |
|---------|---------|-------------------|
| `regulatory-intelligence-service.ts` | HuggingFace regulatory lookup | `services/intelligence/regulatory/` |
| `regulatory-pathway-intelligence.ts` | Multi-agency pathway engine | `services/intelligence/regulatory/` |
| `cross-jurisdictional-intelligence.ts` | FDA/EMA/PMDA divergence mapping | `services/intelligence/regulatory/` |
| `biologics-intelligence-service.ts` | BLA/biosimilar pathways | `services/intelligence/regulatory/` |
| `clinical-intelligence-service.ts` | CSR semantic models | `services/intelligence/clinical/` |
| `csr-intelligence-library.ts` | Regex extraction from CSRs | `services/intelligence/clinical/` |
| `user-intelligence.ts` | User context personalization | `services/intelligence/context/` |
| `client-intelligence-memory.ts` | Client knowledge-base ingestion | `services/intelligence/context/` |
| `module-intelligence.ts` | AnA RI prompt enrichment | `services/intelligence/context/` |
| `intelligent-report-engine.ts` | Report generation + sealing | `services/intelligence/reporting/` |
| `server/intelligence-service.ts` | **Dead stub — no-op methods** | **Delete** |

#### Protocol Metrics Cluster (12 files → 1 file)

All 12 `protocol-{aspect}-metrics.ts` files follow an identical pattern (~30 lines each): in-memory counter with `record*()` mutators and `render*Metrics(): string[]` for Prometheus. These are NOT separate bounded contexts — they are facets of one metrics collector.

Files: `protocol-amendments-metrics`, `protocol-budget-metrics`, `protocol-consent-metrics`, `protocol-development-metrics`, `protocol-deviations-metrics`, `protocol-export-metrics`, `protocol-milestones-metrics`, `protocol-reviews-metrics`, `protocol-portfolio-metrics`, `protocol-risks-metrics`, `protocol-soa-metrics`, `protocol-templates-metrics`

**Proposed**: Single `services/protocol/metrics.ts` with namespaced counter objects.

#### Document Cluster (6 files → 1 directory)

| Current | Proposed |
|---------|----------|
| `document-analysis.ts` | `services/document/analysis.ts` |
| `documentExportService.ts` + `documentReconstruction.js` | `services/document/export.ts` (merge) |
| `documentLocking.js` | `services/document/locking.ts` |
| `documentService.js` | `services/document/service.ts` |
| `documentTemplateMapper.ts` | `services/document/template-mapper.ts` |

#### Loose Root Files (13 files → 0 at root)

| File at `server/` root | Destination |
|-------------------------|-------------|
| `intelligence-service.ts` | **Delete** — dead stub |
| `openai-service.ts` | `services/ai-gateway/` — legacy provider |
| `huggingface-service.ts` | `services/ai-gateway/` |
| `agent-service.ts` | `services/ai-gateway/` |
| `protocol-analyzer-service.ts` | `services/protocol/analyzer.ts` |
| `protocol-knowledge-service.ts` | `services/protocol/knowledge.ts` |
| `protocol-optimizer-service.ts` | `services/protocol/optimizer.ts` |
| `ind-automation-service.ts` | `services/ind/automation.ts` |
| `csr-training-service.ts` | `services/intelligence/clinical/training.ts` |
| `academic-knowledge-service.ts` | `services/knowledge/academic.ts` |
| `research-companion-service.ts` | `services/knowledge/research-companion.ts` |
| `sage-plus-service.ts` | `services/sage-plus/service.ts` |
| `statistics-service.ts` | `services/statistics/service.ts` |

### Reduction Summary

| Cluster | Before | After |
|---------|--------|-------|
| Intelligence | 11 | 4 namespaces |
| Protocol metrics | 12 | 1 file |
| Regulatory | 5 | 2 |
| IND | 2 | 1 namespace |
| Document | 6 | 1 directory (5 files) |
| Loose root files | 13 | 0 |
| **Total affected** | **49** | **~14 targets** |

---

## 5. Dependency Duplication (P1)

### Import Count Analysis

| Category | Library | Import Count | Verdict |
|----------|---------|-------------|---------|
| **Validation** | `zod` | **200 files** | Standard |
| | `yup` | 1 file (`server/utils/ichSchema.js`) | **Remove** |
| | `joi` | 0 files | **Remove from package.json** |
| **PDF** | `pdf-lib` | 18 files (form filling, AcroFields) | Keep — edit/fill use case |
| | `pdfkit` | 14 files (document generation) | Keep — generation use case |
| | `jspdf` | 0 files | **Remove from package.json** |
| | `pdfmake` | 0 files | **Remove from package.json** |
| **XML** | `xml2js` | 2 files (FDA/ESG XML parsing) | Low-priority consolidation |
| | `xmlbuilder2` | 1 file (eCTD XML building) | Keep |
| | `@xmldom/xmldom` | 0 files | **Remove from package.json** |
| **Client routing** | `wouter` | 6 files | The only client router |
| | `react-router-dom` | 0 files | **Remove from package.json** |
| **Diff** | `diff` | 3 files | Keep |
| | `diff-match-patch` | 0 files | **Remove from package.json** |
| **HTTP** | `axios` | 17 files | Entrenched |
| | `node-fetch` | 5 files (scripts/tests only) | **Remove** — use native fetch |
| **Date** | `date-fns` | 2 files | Clean — sole date library |

### Immediate Removals (Zero Usage)

These packages can be removed from `package.json` today with no migration work:

1. `joi` — 0 imports
2. `jspdf` — 0 imports
3. `pdfmake` — 0 imports
4. `@xmldom/xmldom` — 0 imports
5. `react-router-dom` — 0 imports
6. `diff-match-patch` — 0 imports

### One-File Migrations

7. `yup` → `zod` — migrate `server/utils/ichSchema.js` (1 file)
8. `node-fetch` → native `fetch` — update 5 script/test files

---

## 6. Vestigial ORM Layer (P1)

### Current State

The `server/db.ts` facade is well-architected. A prior cleanup already migrated 20+ services from raw `Pool` to `getPool()`. The CI guard `ban-new-pool.sh` prevents regressions. **No active runtime Pool bypasses exist.**

### Remaining Dead Code

| File | Issue | Action |
|------|-------|--------|
| `server/services/semanticSearch.js` | Uses vestigial Prisma shim; methods are no-ops | **Delete** |
| `server/pipelines/bulk_import.js` | Same Prisma no-ops; CLI tool with no runtime callers | **Delete** |
| `server/prisma/client.js` | Prisma-compatible wrapper over canonical pool; sole consumers are above two files | **Delete** (after above) |
| `server/drizzle.ts` | Creates a **second** Drizzle instance identical to `db/runtime.ts`; different object identity causes ORM cache divergence | **Delete** — migrate importers to `import { db } from '../db'` |

### Type-Only Import Cleanup

~20 files use `import { Pool } from 'pg'` for type annotations when `import type { Pool } from 'pg'` is correct. No runtime effect, but makes lint rules cleaner.

### Recommended ESLint Rule

```jsonc
{
  "rules": {
    "no-restricted-syntax": ["error", {
      "selector": "NewExpression[callee.name='Pool']",
      "message": "Use getPool() from 'server/db' instead of constructing Pool directly."
    }]
  },
  "overrides": [{
    "files": ["server/db/runtime.ts", "server/db/ensureCoreTables.ts", "scripts/**"],
    "rules": { "no-restricted-syntax": "off" }
  }]
}
```

---

## 7. Server-Side Architecture

### Triple Route Layer

| Location | File Count | Purpose |
|----------|-----------|---------|
| `server/routes/` | 467 | Primary route location |
| `server/api/` | 51 | Secondary API tree (ai, cmc, ectd) |
| `server/src/routes/` | ~10 | Third layer (control-plane, pm-settings) |

The `server/src/` tree appears to be an abandoned "clean rewrite" with its own middleware, services, and routes.

**Recommendation**: Consolidate into `server/routes/` grouped by domain. Archive `server/src/` or complete the migration.

### Bilingual Architecture (Node + Python)

The top-level `services/` directory is a **separate Python microservice** (Flask API, Celery workers) alongside the Node.js `server/`. The `shadow_service/` contains a deterministic Python risk-code map with a TypeScript mirror at `shared/types/generated/risk-codes.generated.ts` — but no verified generation pipeline connects them.

**Recommendation**: Document the Node/Python boundary. Add CI check that regenerates the TypeScript mirror and fails on drift.

---

## 8. Testing Architecture

### Dual Test Framework

Jest handles only legacy client tests but requires a **13-entry exclusion list** in `client/jest.config.js` to avoid conflicts. A stale `server/jest.config.js` is unreferenced by any npm script. `tsconfig.json` lists `jest` in `types` despite Vitest globals, causing ambiguous `describe`/`it` type resolution.

**Recommendation**: Migrate remaining Jest client tests to Vitest. Remove all three Jest configs + `babel-jest`/`ts-jest`/`jest-environment-jsdom`/`@types/jest`.

### Fragmented Test Locations

1,145 test files across 7+ locations. `server/test/` and `server/tests/` are separate directories with different content. Naming is inconsistent: 1,094 `.test.ts`, 13 `.spec.ts`, 6 `.test.mjs`.

### No Shared Test Fixtures

Test data is primarily inline. `tests/data/` has 1 PDF. No factory functions, builders, or shared fixture library.

---

## 9. Documentation Sprawl

| Location | File Count |
|----------|-----------|
| Project root | 46 `.md` files |
| `docs/` | 837 `.md` files |
| Elsewhere | ~443 `.md` files |
| **Total** | **~1,326** |

### Root Pollution (46 files)

8 specs, 8 handoffs, 6 audits, 5 plans — most with date suffixes. Two README-like files (`README.md` and `READ_ME_FIRST.md`). Three AI-guidance files (`.ai-instructions.md`, `CLAUDE_CODE_SETUP.md`, `AGENTS.md`) with unclear authority.

### Docs Bloat

`docs/reports/` (186), `docs/audits/` (111), `docs/proof/` (73) — likely stale point-in-time snapshots. Feature inventory is duplicated across 5+ files.

---

## 10. Build & Infrastructure

### Docker Compose Duplication

`docker-compose.beta.yml` is 95% copy-pasted from `docker-compose.yml`. Both hardcode Postgres passwords differently (one `sslmode=prefer`, other `sslmode=require`). The staging compose has `privileged: true` and Docker socket mounts marked as GA-blockers.

### Script Sprawl

165 scripts in `scripts/` across 6 languages. Duplication examples: `find_missing_fks.cjs`, `find_missing_indexes.cjs`, `find_missing_timestamps.cjs`, `find_missing_timestamps_v2.cjs`. Three deployment scripts alongside Terraform and GitHub Actions.

### CI Sprawl

45 `ci:*` scripts in package.json. 21 GitHub Actions workflows. 36 scripts in `scripts/ci/`. The baseline-ratchet pattern is repeated ad hoc across many scripts instead of via a shared library.

---

## Prioritized Action Plan

### Phase 1: Safety — Immediate (Week 1)

| # | Action | Effort | Impact |
|---|--------|--------|--------|
| 1 | **Consolidate migration directories** — move GCC files to `migrations/`, add CI guard | Medium | Eliminates split-brain risk |
| 2 | **Remove 3 dead AI imports** — delete unused `getOpenAIClient` imports in 3 files | Trivial | Reduces bypass surface |
| 3 | **Add AI gateway ESLint rule** — `no-restricted-imports` for `openai`/`@anthropic-ai/sdk` | Small | Prevents new bypasses |
| 4 | **Delete vestigial Prisma** — remove `semanticSearch.js`, `bulk_import.js`, `prisma/client.js` | Small | Eliminates dead code |
| 5 | **Delete redundant `server/drizzle.ts`** — migrate importers to `import { db } from '../db'` | Small | Eliminates dual ORM instances |

### Phase 2: Config & Dependencies — Quick Wins (Week 2)

| # | Action | Effort | Impact |
|---|--------|--------|--------|
| 6 | **Create typed config module** — Zod schema validating top env vars at startup | Medium | Catches 429 unchecked vars |
| 7 | **Remove 6 zero-usage deps** — `joi`, `jspdf`, `pdfmake`, `@xmldom/xmldom`, `react-router-dom`, `diff-match-patch` | Trivial | Reduces bundle/install |
| 8 | **Migrate 1-file deps** — `yup`→`zod` (1 file), `node-fetch`→native (5 files) | Small | Eliminates 2 more deps |

### Phase 3: Gateway Migration (Week 3-4)

| # | Action | Effort | Impact |
|---|--------|--------|--------|
| 9 | **Migrate 6 medium-effort gateway bypasses** — swap `chat.completions.create` / embeddings calls | Medium | Full audit trail coverage |
| 10 | **Evaluate 2 hard bypasses** — Assistants API + Files API need gateway extension or exemption | Large | Provider-specific APIs |
| 11 | **Delete legacy wrappers** — `openai-client.ts`, `anthropic-client.ts` after migration | Small | Removes bypass vectors |

### Phase 4: Structural Consolidation (Week 5-8)

| # | Action | Effort | Impact |
|---|--------|--------|--------|
| 12 | **Consolidate protocol-metrics** — 12 identical files → 1 | Small | -11 files |
| 13 | **Group intelligence services** — 11 files → 4 namespaces | Medium | Clear domain boundaries |
| 14 | **Relocate 13 loose root services** — move to proper namespaces, delete dead stub | Medium | Clean server root |
| 15 | **Consolidate route layers** — merge `server/api/` and `server/src/routes/` into `server/routes/` | Large | Single route tree |

### Phase 5: Testing & Docs (Ongoing)

| # | Action | Effort | Impact |
|---|--------|--------|--------|
| 16 | **Migrate Jest → Vitest** — eliminate dual framework + 13-entry exclusion list | Medium | Single test runner |
| 17 | **Clean root directory** — move 40+ markdown files to `docs/` | Small | Clean project root |
| 18 | **Archive stale docs** — collapse `reports/`, `audits/`, `proof/` into `docs/_archive/` | Medium | 837 → <100 active docs |
| 19 | **Create shared test fixtures** — factory functions for domain entities | Medium | Reduce test duplication |
| 20 | **Document bilingual architecture** — Node/Python boundary, shadow service sync pipeline | Small | Architectural clarity |
