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
    const { default: literatureService } = await import('../LiteratureService');
    const results = await literatureService.searchLiterature(params);
    return results.map(article => ({
      id: article.pmid,
      title: article.title,
      authors: article.authors,
      journal: article.journal,
      publicationDate: new Date(article.publicationDate),
      abstract: article.abstract,
      doi: article.doi,
      pmid: article.pmid,
      relevanceScore: 1,
      source: 'pubmed',
    }));
  }

  async aggregate(
    articleIds: string[],
    organizationId: string = 'default'
  ): Promise<LiteratureArticle[]> {
    const { default: literatureAggregator } = await import('../LiteratureAggregatorService');
    const results = await Promise.all(
      articleIds.map(id => literatureAggregator.getLiteratureById(id, organizationId))
    );
    return results
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .map(entry => ({
        id: entry.id,
        title: entry.title,
        authors: entry.authors || [],
        journal: entry.journal || 'Unknown',
        publicationDate: entry.publication_date ? new Date(entry.publication_date) : new Date(),
        abstract: entry.abstract || '',
        doi: entry.doi,
        pmid: entry.source_id,
        relevanceScore: entry.relevance_score || 0,
        source: entry.source_name,
      }));
  }

  async summarize(
    articleId: string,
    organizationId: string = 'default'
  ): Promise<LiteratureSummary> {
    const { default: literatureSummarizer } = await import('../LiteratureSummarizerService');
    const result = await literatureSummarizer.generateSummary({
      literatureIds: [articleId],
      summaryType: 'general',
      organizationId,
    });
    return {
      articleId,
      summary: result.summary,
      keyFindings: [],
      generatedAt: new Date(),
    };
  }
}

export default UnifiedLiteratureService;
