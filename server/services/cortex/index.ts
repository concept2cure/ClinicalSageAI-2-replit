/**
 * Unified Cortex Intelligence Services
 *
 * Consolidates all AnA 1.0 RI CORTEX related services.
 *
 * Consolidated from:
 * - cortexComplianceService.ts
 * - anaCortexClient.ts
 * - ana-cortex-service.ts
 * - cognitiveAdvisoryService.ts
 *
 * cortexPrimeService.ts was retired 2026-09-10 (WO-14, Route B): every write
 * path failed on every applier-produced schema and nothing called it. Its
 * re-export and the UnifiedCortexService wrapper that instantiated it (which
 * had no importer) went with it.
 *
 * @version 2.0.0
 * @module server/services/cortex/index
 */

// Re-export primary services
export * from '../cortexComplianceService';
export * from '../anaCortexClient';

// `AuditEntry` is declared in both cortexComplianceService and anaCortexClient.
// Explicitly re-export the compliance-service definition (the GxP audit-trail
// shape) to resolve the ambiguous star re-export.
export type { AuditEntry } from '../cortexComplianceService';
