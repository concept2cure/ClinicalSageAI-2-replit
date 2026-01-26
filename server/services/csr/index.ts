/**
 * Unified CSR (Clinical Study Report) Services
 *
 * Consolidates all CSR extraction and search services.
 *
 * Consolidated from:
 * - csr-extractor-service.ts
 * - csr-foresight-orchestrator.ts
 * - csr-knowledge-extractor.ts
 * - csr-search-service.ts
 *
 * @version 2.0.0
 * @module server/services/csr/index
 */

// Re-export primary services
export * from '../csr-search-service';
export * from '../csr-extractor-service';

// Unified CSR service interface
export interface CSRSearchParams {
  query: string;
  filters?: {
    indication?: string;
    phase?: string;
    sponsor?: string;
    dateRange?: { start: Date; end: Date };
  };
  limit?: number;
  offset?: number;
}

export interface CSRSearchResult {
  id: string;
  title: string;
  sponsor: string;
  indication: string;
  phase: string;
  completionDate: Date;
  matchScore: number;
  highlights: string[];
}

export interface CSRExtractionResult {
  documentId: string;
  sections: CSRSection[];
  metadata: CSRMetadata;
  extractedAt: Date;
}

export interface CSRSection {
  id: string;
  title: string;
  content: string;
  pageRange: [number, number];
  confidence: number;
}

export interface CSRMetadata {
  sponsor: string;
  indication: string;
  phase: string;
  nctId?: string;
  protocolNumber?: string;
  completionDate?: Date;
}

/**
 * Unified CSR Service
 * Provides search and extraction capabilities for Clinical Study Reports
 */
export class UnifiedCSRService {
  async search(params: CSRSearchParams): Promise<CSRSearchResult[]> {
    const { CSRSearchService } = await import('../csr-search-service');
    const service = new CSRSearchService();
    return service.search(params);
  }

  async extract(documentId: string): Promise<CSRExtractionResult> {
    const { CSRExtractorService } = await import('../csr-extractor-service');
    const service = new CSRExtractorService();
    return service.extract(documentId);
  }

  async getKnowledge(csrId: string): Promise<Record<string, unknown>> {
    return {};
  }
}

export default UnifiedCSRService;
