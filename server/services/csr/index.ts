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
    const { csrs } = await service.searchCSRs({
      query_text: params.query,
      indication: params.filters?.indication,
      phase: params.filters?.phase,
      limit: params.limit,
    });

    return csrs.map(csr => ({
      id: csr.csr_id,
      title: csr.title,
      sponsor: csr.sponsor ?? '',
      indication: csr.indication,
      phase: csr.phase,
      completionDate: csr.date ? new Date(csr.date) : new Date(0),
      matchScore: typeof csr.matchScore === 'number' ? csr.matchScore : 0,
      highlights: Array.isArray(csr.highlights) ? csr.highlights : [],
    }));
  }

  async extract(_documentId: string): Promise<CSRExtractionResult> {
    // The underlying csr-extractor-service operates on extracted text
    // (extractTextFromPDF / extractStructuredInfo), not on a document id.
    // A document-id-based extraction pipeline has not been wired up here.
    throw new Error(
      'UnifiedCSRService.extract is not implemented: csr-extractor-service requires document text, not a document id'
    );
  }

  async getKnowledge(csrId: string): Promise<Record<string, unknown>> {
    return {};
  }
}

export default UnifiedCSRService;
