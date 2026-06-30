# Loose Services Relocation Plan

**Date:** 2026-06-30  
**Scope:** 273 loose `.ts`/`.js` files at root of `server/services/` (excluding `index.ts`)  
**Total import references to update:** ~1,296

## Relocation Groups (by destination subdirectory)

| # | Destination | Files | Import refs | Exists? | Priority |
|---|-------------|-------|-------------|---------|----------|
| 1 | `ana/` | 14 (ana-*.ts, anaCortexClient.ts) | 38 | Yes | High |
| 2 | `ai-gateway/` (new: `rag/`) | 10 (rag-*.ts, ragRouter, advancedRAGPipeline) | 46 | Partial | High |
| 3 | `csr/` | 8 (csr-*.ts, CSRIntelligenceLibrary.js) | 33 | Yes | High |
| 4 | `foresight/` | 5 (foresight-*.ts) | 20 | Yes | High |
| 5 | `cmc/` | 7 (cmc-*.ts, cmcEvents.js, module3*.ts) | 46 | Yes | High |
| 6 | `fda/` | 8 (FDA*.ts, fda*.ts/js, 510k*, eSTARValidator) | 18 | Yes | High |
| 7 | `governance/` | 4 (governance-*, governed-*) | 26 | Yes | Medium |
| 8 | `billing/` | 7 (billing, license-manager, seat-licensing, usage-metering, weekly-usage-limits, atomicQuota*, quotaEnforcement*) | 74 | Yes | Medium |
| 9 | `platform/` (new: `kernel/`) | 8 (kernel-*.ts) | 28 | Partial | Medium |
| 10 | `regulatory/` | 10 (regulatory-*.ts, regulatoryAIServicePhase3, regulator-overlay-engine) | 15 | Yes | Medium |
| 11 | `documents/` | 7 (document*.ts/js, Document*.ts) | 19 | Yes | Medium |
| 12 | `protocol-*/` (each to its matching subdir) | 12 metrics files | 24 | Yes | Low |
| 13 | Domain-matched subdirs | 24 non-protocol *-metrics.ts | ~60 | Mostly | Low |
| 14 | `auth/` (new) | 9 (auth-security, security*, mfa, saml, token-revocation, roleBasedAccess*) | 44 | No | Medium |
| 15 | `ai-gateway/` | 5 (openai-client/service, anthropic-client/files, aiProviderRouter, huggingface-service) | 36 | Yes | High |
| 16 | `cortex/` | 3 (cortexPrimeService, cortexComplianceService, confidenceScoringEngine) | 11 | Yes | Low |
| 17 | `memory/` (new) | 5 (memory-*, working-memory, shared-memory-contract) | 28 | No | Medium |
| 18 | `documents/` or `docx/` | 4 (docxGenerator, docx-pdf-pipeline, pdf-converter, pdf-compression-service) | 16 | Yes | Low |
| 19 | `ectd/` | 3 (ectdExportService, ectd-submission-agent, ctd-ingestion-service) | 15 | Yes | Medium |
| 20 | `submission-service/` | 4 (submission-twin, submission-package-orchestrator, submission-bundle-storage, universal-packager) | 16 | Yes | Medium |
| 21 | `device/` | 4 (medicalDeviceService, ivdrPack*.ts) | 7 | Yes | Low |
| 22 | `study-design/` | 5 (study-design-agent, endpoint-recommender, power-sample-size, sap-generator, estimand-*) | 19 | Yes | Medium |
| 23 | `lumen-context/` | 2 (lumen-context-builder, lumen-instruction-engine) | 15 | Yes | Low |
| 24 | `audit/` | 2 (auditService.ts, auditService.js) | 130 | Yes | High |
| 25 | Remaining misc | ~40 files | ~205 | Various | Low |

## Execution Order

**Phase 1 — High priority (clear destination, many importers):**
- `audit/`: auditService (130 refs) — highest single-file impact
- `billing/`: 7 files, 74 refs
- `ai-gateway/`: AI provider clients, 36 refs
- `ana/`: 14 files, 38 refs
- `cmc/`: 7 files, 46 refs
- `rag/` (new) or `ai-gateway/rag/`: 10 files, 46 refs
- `csr/`: 8 files, 33 refs

**Phase 2 — Medium priority:**
- `auth/` (new): 9 files, 44 refs
- `memory/` (new): 5 files, 28 refs
- `kernel/` (new): 8 files, 28 refs
- `governance/`: 4 files, 26 refs
- `foresight/`, `fda/`, `regulatory/`, `ectd/`, `documents/`, `submission-service/`, `study-design/`

**Phase 3 — Low priority (metrics files, 1-2 importers each):**
- 12 protocol-*-metrics.ts → matching `protocol-*/` subdirs
- 24 domain *-metrics.ts → matching subdirs (biosketch/, etmf/, irb/, etc.)
- Remaining misc files (mostly 1-2 importers each)

## Notes

- `index.ts` re-exports ~30 loose files. Update it as each batch moves.
- The `.js`/`.ts` duplicates (auditService, roleBasedAccess, unifiedDocumentIngestion) should be consolidated to `.ts` during the move.
- New subdirectories needed: `rag/`, `kernel/`, `auth/`, `memory/` (4 total).
- Consider creating barrel `index.ts` files in each destination to preserve import paths.
