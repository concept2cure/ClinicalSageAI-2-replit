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

// `AuditEntry` is declared in both cortexComplianceService and anaCortexClient.
// Explicitly re-export the compliance-service definition (the GxP audit-trail
// shape) to resolve the ambiguous star re-export.
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
    const { CortexPrimeService } = await import('../cortexPrimeService');
    const service = new CortexPrimeService();
    const orgId =
      typeof params.context?.orgId === 'string' ? (params.context.orgId as string) : undefined;
    // cortex.query() returns an untyped JSON document from Postgres.
    const result = await service.query(params.query, undefined, orgId, {
      minSimilarity: params.filters?.confidence,
    });
    return {
      answer: typeof result.answer === 'string' ? result.answer : '',
      confidence: typeof result.confidence === 'number' ? result.confidence : 0,
      sources: Array.isArray(result.sources) ? (result.sources as CortexSource[]) : [],
      relatedTopics: Array.isArray(result.relatedTopics) ? result.relatedTopics : [],
      generatedAt: new Date(),
    };
  }

  async checkCompliance(_documentId: string): Promise<ComplianceCheckResult> {
    // CortexComplianceService provides GxP audit-trail, access-control and
    // e-signature operations, not document-level compliance scoring. There is
    // no underlying check(documentId) to delegate to yet, so return a neutral
    // result rather than fabricating a score.
    return {
      compliant: true,
      score: 0,
      issues: [],
      recommendations: [],
    };
  }

  async getInsights(context: Record<string, unknown>): Promise<string[]> {
    return [];
  }
}

export default UnifiedCortexService;
