import logger from '../utils/logger';
import { ECTDGenerator } from './ectd-generator';
import { CSRFetcher, type EnrichedCSR } from './csr-intelligence-worker';
import { CSRValidator, CSREnricher } from './csr-validator';

export interface SequenceMetrics {
  csrId: string;
  fetchDuration: number;
  validationErrors: number;
  enrichmentStatus: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  finalRelevance: 'HIGH' | 'MEDIUM' | 'LOW';
  predicateMatched: boolean;
}

export class CSRIntelligenceSequence {
  private fetcher = new CSRFetcher();
  private validator = new CSRValidator();
  private enricher = new CSREnricher();
  private ectdg = new ECTDGenerator();

  // Full 4-stage intelligence pipeline
  async executeSequence(csrId: string): Promise<{
    enrichedCSR: EnrichedCSR;
    metrics: SequenceMetrics;
    cerDocument: any;
  }> {
    const startTime = Date.now();
    logger.info(`INTELLIGENCE_SEQUENCE: Starting for CSR ${csrId}`);

    try {
      // Stage 1: Fetch
      const rawCSR = await this.fetcher.fetchCSR(csrId);
      const fetchDuration = Date.now() - startTime;

      // Stage 2: Validate
      const validationErrors = this.validator.validate(rawCSR);
      if (validationErrors.length > 0) {
        logger.warn(`INTELLIGENCE_SEQUENCE: Validation warnings for ${csrId}`, {
          errors: validationErrors,
        });
      }

      // Stage 3: Enrich
      const enrichedCSR = this.enricher.enrich(rawCSR);

      // Stage 4: Generate CER Document
      const cerDocument = await this.ectdg.generateCER2V({
        name: enrichedCSR.deviceName,
        indication: enrichedCSR.primaryEndpoint,
        canadianCSRs: [csrId],
      });

      // Generate metrics
      const metrics: SequenceMetrics = {
        csrId,
        fetchDuration,
        validationErrors: validationErrors.length,
        enrichmentStatus: enrichedCSR.qcFlags.length === 0 ? 'SUCCESS' : 'PARTIAL',
        finalRelevance: enrichedCSR.regulatoryRelevance,
        predicateMatched: enrichedCSR.predicateDeviceMatch !== null,
      };

      logger.info(`INTELLIGENCE_SEQUENCE: Completed for ${csrId}`, metrics);

      return {
        enrichedCSR,
        metrics,
        cerDocument,
      };
    } catch (error: any) {
      logger.error(`INTELLIGENCE_SEQUENCE: Failed for ${csrId}`, {
        error: error?.message || error,
      });
      throw error;
    }
  }

  // Bulk processing for multiple CSRs
  async executeBulkSequence(csrIds: string[]): Promise<{
    results: Array<{ enrichedCSR: EnrichedCSR; metrics: SequenceMetrics; cerDocument: any }>;
    summary: {
      totalProcessed: number;
      highRelevance: number;
      predicateMatches: number;
      averageFetchTime: number;
    };
  }> {
    const results: Array<{
      enrichedCSR: EnrichedCSR;
      metrics: SequenceMetrics;
      cerDocument: any;
    }> = [];
    let totalFetchTime = 0;

    for (const csrId of csrIds) {
      const result = await this.executeSequence(csrId);
      results.push(result);
      totalFetchTime += result.metrics.fetchDuration;
    }

    const summary = {
      totalProcessed: results.length,
      highRelevance: results.filter(r => r.metrics.finalRelevance === 'HIGH').length,
      predicateMatches: results.filter(r => r.metrics.predicateMatched).length,
      averageFetchTime: results.length ? Math.round(totalFetchTime / results.length) : 0,
    };

    logger.info('INTELLIGENCE_SEQUENCE: Bulk processing complete', summary);
    return { results, summary };
  }
}
