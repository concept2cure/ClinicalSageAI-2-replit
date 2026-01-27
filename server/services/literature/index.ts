/**
 * Unified Literature Services
 *
 * Consolidates all literature management services.
 *
 * Consolidated from:
 * - LiteratureAggregatorService.ts
 * - LiteratureService.ts
 * - LiteratureSummarizerService.ts
 *
 * @version 2.0.0
 * @module server/services/literature/index
 */

// Re-export primary services
export * from '../LiteratureService';
export * from '../LiteratureAggregatorService';
export * from '../LiteratureSummarizerService';

// Unified interface
export interface LiteratureSearchParams {
  query: string;
  sources?: ('pubmed' | 'clinicaltrials' | 'fda' | 'ema')[];
  dateRange?: { start: Date; end: Date };
  limit?: number;
}

export interface LiteratureArticle {
  id: string;
  title: string;
  authors: string[];
  journal: string;
  publicationDate: Date;
  abstract: string;
  doi?: string;
  pmid?: string;
  relevanceScore: number;
  source: string;
}

export interface LiteratureSummary {
  articleId: string;
  summary: string;
  keyFindings: string[];
  methodology?: string;
  conclusions?: string;
  generatedAt: Date;
}

/**
 * Unified Literature Service
 * Provides search, aggregation, and summarization for scientific literature
 */
export class UnifiedLiteratureService {
  async search(params: LiteratureSearchParams): Promise<LiteratureArticle[]> {
    const { LiteratureService } = await import('../LiteratureService');
    const service = new LiteratureService();
    return service.search(params);
  }

  async aggregate(articleIds: string[]): Promise<LiteratureArticle[]> {
    const { LiteratureAggregatorService } = await import('../LiteratureAggregatorService');
    const service = new LiteratureAggregatorService();
    return service.aggregate(articleIds);
  }

  async summarize(articleId: string): Promise<LiteratureSummary> {
    const { LiteratureSummarizerService } = await import('../LiteratureSummarizerService');
    const service = new LiteratureSummarizerService();
    return service.summarize(articleId);
  }
}

export default UnifiedLiteratureService;
