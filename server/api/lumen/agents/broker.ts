import { openFdaSearch } from '../../../services/openfda';

// REAL FDA ENDPOINTS (via existing openFDA service)
const DATASET = 'device/recall' as const;

function buildClassIQuery(term: string): string {
  const safe = String(term || '').trim().replace(/\s+/g, ' ').slice(0, 200);
  if (!safe) return 'classification:"Class I"';
  // openFDA supports AND + quoted terms
  return `classification:"Class I"+AND+root_cause_description:"${safe}"`;
}

export const BrokerAgent = {
  async scan(query: string) {
    const recallQuery = buildClassIQuery(query);

    try {
      const res = await openFdaSearch({ dataset: DATASET, query: recallQuery, limit: 5, timeoutMs: 5000 });

      if (!res.ok) {
        return {
          type: 'BROKER_RESULT',
          market_sector: query,
          opportunities: [],
          _meta: { dataset: DATASET, httpStatus: res.error?.status, url: res.url },
        };
      }

      return {
        type: 'BROKER_RESULT',
        market_sector: query,
        opportunities: res.results.map((r: any) => ({
          status: 'DISTRESSED',
          firm: r.recalling_firm || r.recalling_firm_names_1?.[0] || 'Unknown',
          device: r.product_description || r.product_description_1 || 'Unknown',
          reason: r.reason_for_recall || 'Unknown',
          action: 'Potential IP Acquisition Target',
          recall_number: r.recall_number,
          classification: r.classification,
        })),
        sources: res.sources,
        _meta: { dataset: DATASET, total: res.total, url: res.url },
      };
    } catch {
      // Best-effort: never throw
      return { type: 'BROKER_RESULT', market_sector: query, opportunities: [] };
    }
  },
};
