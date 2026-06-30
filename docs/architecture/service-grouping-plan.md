# Service Grouping Plan: Intelligence Services

**Action item #13** from `CODEBASE_ARCHITECTURE_REVIEW_2026-06-30.md`
**Goal**: Move 26 loose intelligence-related files in `server/services/` into 4 existing namespace directories.

## Target Directories (all already exist)

| Directory | Purpose | Existing files |
|-----------|---------|----------------|
| `server/services/regulatory/` | Regulatory intelligence & compliance | 53 |
| `server/services/csr/` | CSR extraction, search, knowledge | 3 |
| `server/services/foresight/` | Predictive analytics & foresight | 1 (index.ts) |
| `server/services/intelligence/` | Cross-cutting intelligence services | 36 |

## Migration Manifest

### Phase 1: Foresight (5 files, 21 import updates) -- fewest cross-deps

`foresight/index.ts` already re-exports `foresight-ai-engine` and `foresight-rag-service` via `../<name>`. After moving, update the index to `from './<name>'`.

| File | Destination | Importers |
|------|-------------|-----------|
| `foresight-knowledge-graph.ts` | `foresight/` | 8 -- foresight-ai-engine, foresight-csr-integration, foresight-feedback-orchestrator, csr-foresight-orchestrator, foresight/index, server/services/index, server/routes/foresight-api, tests/audit-medium-extraction-search |
| `foresight-ai-engine.ts` | `foresight/` | 7 -- csr-foresight-orchestrator, foresight/index, ana-ri/command-executor, stats/dose-finding-boin, routes/foresight-ai-advanced, security test, scripts/generate-foresight-mock-data |
| `foresight-feedback-orchestrator.ts` | `foresight/` | 3 -- foresight/index, server/services/index, routes/foresight-feedback |
| `foresight-csr-integration.ts` | `foresight/` | 2 -- csr-foresight-orchestrator, foresight/index |
| `foresight-rag-service.ts` | `foresight/` | 1 -- foresight/index |

**Move order**: `foresight-knowledge-graph` first (no deps on other foresight files), then `foresight-rag-service`, then `foresight-csr-integration`, then `foresight-feedback-orchestrator`, then `foresight-ai-engine`.

### Phase 2: CSR / Document Analysis (9 files, 41 import updates)

`csr/index.ts` already re-exports `csr-search-service` and `csr-extractor-service` via `../<name>`.

| File | Destination | Importers |
|------|-------------|-----------|
| `csr-builder.ts` | `csr/` | 22 -- routes/csr-builder-routes, routes/concept2cure, routes/csr-jobs, csr/csr-job-runner, csr/load-csr-inputs-for-project, csr-tabulation-builders, m2-summary-builders, submission-package-orchestrator, authoring/m5-clinical-qc, authoring/ib-builder, authoring/nonclinical-study-report-builder, shared/schema, shared/constants/ui-surface-registry, bootstrap/register-clinical-intel-routes, 4 tests |
| `csr-search-service.ts` | `csr/` | 5 -- csr/index, server/services/index, routes/public-api, bootstrap/register-inline-routes, security test |
| `csr-knowledge-extractor.ts` | `csr/` | 3 -- csr-foresight-orchestrator, csr/index, server/services/index |
| `csr-tabulation-builders.ts` | `csr/` | 3 -- routes, m2-summary-builders, tests |
| `csr-intelligence-library.ts` | `csr/` | 2 -- routes/corpus-routes, CSRIntelligenceLibrary.js |
| `CSRIntelligenceLibrary.js` | `csr/` | 1 -- (JS wrapper for csr-intelligence-library) |
| `csr-extractor-service.ts` | `csr/` | 1 -- csr/index |
| `csr-foresight-orchestrator.ts` | `csr/` | 3 -- routes, server/services/index, tests |
| `document-analysis.ts` | `csr/` | 1 -- ana/AnaToolExecutor |

**Move order**: `csr-intelligence-library` + `CSRIntelligenceLibrary.js` first, then `csr-extractor-service`, `csr-search-service`, `csr-knowledge-extractor`, `csr-tabulation-builders`, `document-analysis`, `csr-foresight-orchestrator`, `csr-builder` last (highest importer count).

### Phase 3: Regulatory (6 files, 13 import updates)

| File | Destination | Importers |
|------|-------------|-----------|
| `regulatory-intelligence-service.ts` | `regulatory/` | 4 -- routes/regulatoryRoutes, study-design-agent-service, server/services/index, test |
| `regulatory-pathway-intelligence.ts` | `regulatory/` | 2 -- routes/public-api, security test |
| `regulatory-guidance-retrieval.ts` | `regulatory/` | 2 -- routes/snowglobe, ragRouter |
| `cross-jurisdictional-intelligence.ts` | `regulatory/` | 2 -- region-design-rules, ana-ri/command-executor |
| `regulator-overlay-engine.ts` | `regulatory/` | 2 -- routes/authoring-actions, shared/types/contradiction-architecture |
| `regulatory-outcome-optimizer-service.ts` | `regulatory/` | 1 -- routes/biostatPlatform |

**Move order**: Any order is safe; no intra-group dependencies.

### Phase 4: Intelligence catch-all (6 files, 24 import updates)

| File | Destination | Importers |
|------|-------------|-----------|
| `client-intelligence-memory.ts` | `intelligence/` | 8 -- ana-session-bootstrap, ana/AnaToolExecutor, lumen-context/intelligence-prefix, lumen-context-builder, memory-context-assembler, routes/client-intelligence, routes/protocol_routes, test |
| `module-intelligence.ts` | `intelligence/` | 5 -- ana-ri/context-enrichment, intelligence/cross-module-intelligence, intelligence/index, intelligence/rim, lumen-context-builder |
| `user-intelligence.ts` | `intelligence/` | 4 -- client/src/concept2cure/hooks/useLicense, routes/module-subscriptions, lumen-context-builder, module-intelligence |
| `clinical-intelligence-service.ts` | `intelligence/` | 3 -- study-design-agent-service, server/services/index, ana-ri/command-executor |
| `intelligent-report-engine.ts` | `intelligence/` | 3 -- routes/intelligent-reports, ana-ri/command-executor, security test |
| `predictiveSectionService.ts` | `intelligence/` | 1 -- routes/predictive-sections |

**Move order**: `user-intelligence` first (depended on by `module-intelligence`), then `module-intelligence` (already imported by `intelligence/index`), then remainder in any order.

## Cross-Group Dependencies

These files reference each other across groups; update their imports after both are moved:

- `csr-foresight-orchestrator` (csr/) imports `foresight-ai-engine`, `foresight-knowledge-graph`, `foresight-csr-integration` (foresight/)
- `foresight-ai-engine` (foresight/) imports `lumen-context-builder` (stays in place)
- `module-intelligence` (intelligence/) imports `user-intelligence` (also intelligence/)

**Recommended execution order**: Phase 1 (foresight) -> Phase 2 (csr) -> Phase 3 (regulatory) -> Phase 4 (intelligence). This minimizes broken cross-references because foresight files settle first, then CSR files that reference them can use final paths.

## Barrel Index Updates

Each namespace directory has (or needs) an `index.ts` barrel file. After migration:

- `foresight/index.ts` -- update 5 re-export paths from `'../<name>'` to `'./<name>'`
- `csr/index.ts` -- update 2 existing re-export paths, add 7 new re-exports
- `regulatory/index.ts` -- does not exist yet; create with 6 re-exports
- `intelligence/index.ts` -- already exists; add 6 new re-exports

## Summary

| Metric | Count |
|--------|-------|
| Files to move | 26 |
| Total import updates | ~99 |
| Highest-risk file | `csr-builder.ts` (22 importers across routes, shared/, tests, and authoring/) |
| Phases | 4 |
| Estimated effort | 2-3 hours with find-and-replace tooling |
