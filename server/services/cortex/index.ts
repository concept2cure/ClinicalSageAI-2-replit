/**
 * Unified Cortex Intelligence Services
 *
 * Consolidates all AnA 1.0 RI CORTEX related services.
 *
 * Consolidated from:
 * - cortexComplianceService.ts
 * - cortexPrimeService.ts
 * - anaCortexClient.ts
 * - ana-cortex-service.ts
 * - cognitiveAdvisoryService.ts
 *
 * @version 2.0.0
 * @module server/services/cortex/index
 */

// Re-export primary services. AuditEntry is exported by both
// cortexComplianceService and anaCortexClient — re-export it once explicitly.
export * from '../cortexPrimeService';
export * from '../cortexComplianceService';
export * from '../anaCortexClient';
export type { AuditEntry } from '../cortexComplianceService';

// Unified interface
export interface CortexQuery {
  query: string;
  context?: Record<string, unknown>;
  filters?: {
    domain?: string[];
    confidence?: number;
    dateRange?: { start: Date; end: Date };
  };
}

export interface CortexResponse {
  answer: string;
  confidence: number;
  sources: CortexSource[];
  relatedTopics: string[];
  generatedAt: Date;
}

export interface CortexSource {
  id: string;
  title: string;
  type: 'regulation' | 'guidance' | 'precedent' | 'internal';
  excerpt: string;
  url?: string;
  confidence: number;
}

export interface ComplianceCheckResult {
  compliant: boolean;
  score: number;
  issues: ComplianceIssue[];
  recommendations: string[];
}

export interface ComplianceIssue {
  id: string;
  severity: 'critical' | 'major' | 'minor';
  description: string;
  regulation?: string;
  remediation?: string;
}

/**
 * Unified Cortex Intelligence Service
 * Provides AI-powered regulatory intelligence and compliance checking
 */
export class UnifiedCortexService {
  async query(params: CortexQuery): Promise<CortexResponse> {
    const mod = (await import('../cortexPrimeService')) as any;
    const Ctor = mod.CortexPrimeService ?? mod.default;
    const service = typeof Ctor === 'function' ? new Ctor() : Ctor;
    return service.query(params.query);
  }

  async checkCompliance(documentId: string): Promise<ComplianceCheckResult> {
    const mod = (await import('../cortexComplianceService')) as any;
    const Ctor = mod.CortexComplianceService ?? mod.default;
    const service = typeof Ctor === 'function' ? new Ctor() : Ctor;
    return service.check?.(documentId) ?? service.checkCompliance?.(documentId);
  }

  async getInsights(context: Record<string, unknown>): Promise<string[]> {
    return [];
  }
}

export default UnifiedCortexService;
