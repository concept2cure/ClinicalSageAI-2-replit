/**
 * Unified Cortex Intelligence Services
 *
 * Consolidates all LUMEN CORTEX related services.
 *
 * Consolidated from:
 * - cortexComplianceService.ts
 * - cortexPrimeService.ts
 * - lumenCortexClient.ts
 * - lumen-cortex-service.ts
 * - lumen-insights-service.ts
 * - cognitiveAdvisoryService.ts
 *
 * @version 2.0.0
 * @module server/services/cortex/index
 */

// Re-export primary services
export * from '../cortexPrimeService';
export * from '../cortexComplianceService';
export * from '../lumenCortexClient';

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
    return service.query(params);
  }

  async checkCompliance(documentId: string): Promise<ComplianceCheckResult> {
    const { CortexComplianceService } = await import('../cortexComplianceService');
    const service = new CortexComplianceService();
    return service.check(documentId);
  }

  async getInsights(context: Record<string, unknown>): Promise<string[]> {
    return [];
  }
}

export default UnifiedCortexService;
