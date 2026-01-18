import type { Request, Response } from 'express';
import { CSRIntelligenceSequence } from '../../cer2v/csr-intelligence-sequence';

const sequence = new CSRIntelligenceSequence();

export default async function handler(req: Request, res: Response) {
  try {
    const { csrIds, mode = 'single' } = req.body || {};

    if (!csrIds || !Array.isArray(csrIds) || csrIds.length === 0) {
      return res.status(400).json({ error: 'csrIds array required' });
    }

    if (mode === 'bulk') {
      const { results, summary } = await sequence.executeBulkSequence(csrIds);
      return res.json({
        success: true,
        mode: 'bulk',
        dataSource: results[0]?.enrichedCSR.isRealData
          ? 'HEALTH_CANADA_API'
          : 'INTELLIGENT_FALLBACK',
        summary,
        results: results.map(r => ({
          csrId: r.enrichedCSR.clinicalTrialId,
          relevance: r.metrics.finalRelevance,
          predicate: r.enrichedCSR.predicateDeviceMatch,
          qcFlags: r.enrichedCSR.qcFlags,
          isRealData: r.enrichedCSR.isRealData,
          dataQuality: r.enrichedCSR.dataCompleteness,
        })),
      });
    }

    const { enrichedCSR, metrics, cerDocument } = await sequence.executeSequence(csrIds[0]);
    return res.json({
      success: true,
      mode: 'single',
      dataSource: enrichedCSR.isRealData ? 'HEALTH_CANADA_API' : 'INTELLIGENT_FALLBACK',
      metrics,
      enrichedCSR,
      cerDocument,
    });
  } catch (error: any) {
    console.error('Intelligence sequence error:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Unknown error',
      dataSource: 'ERROR_FALLBACK',
    });
  }
}
