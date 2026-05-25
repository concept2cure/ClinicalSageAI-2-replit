import { createScopedLogger } from '../../utils/logger';

const logger = createScopedLogger('citationjs-client');

export interface CitationJsNormalization {
  cslJson?: Record<string, unknown>;
  renderedApa?: string;
  doi?: string;
  pmid?: string;
}

export class CitationJsClient {
  async normalize(sourceText: string): Promise<CitationJsNormalization> {
    try {
      // citation-js is an optional runtime dependency without type declarations;
      // resolve the specifier indirectly so the optional import stays type-safe.
      const citationJsModule = 'citation-js';
      const citationJs = await import(citationJsModule);
      const Ctor = (citationJs as any).default || (citationJs as any).Cite;
      if (!Ctor) {
        return {};
      }

      const cite = new Ctor(sourceText);
      const cslJson = cite.format('data')?.[0];
      const renderedApa = cite.format('bibliography', {
        format: 'text',
        template: 'apa',
        lang: 'en-US',
      });

      return {
        cslJson,
        renderedApa: typeof renderedApa === 'string' ? renderedApa.trim() : undefined,
        doi: cslJson?.DOI,
        pmid: cslJson?.PMID,
      };
    } catch (error: any) {
      logger.warn('Citation.js normalization unavailable', { error: error?.message });
      return {};
    }
  }
}
