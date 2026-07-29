/**
 * FDA device recall search for AnA.
 *
 * Thin, testable wrapper over the existing post-market surveillance module
 * (server/services/postmarket/openfda-surveillance.ts) which already fetches and
 * normalizes openFDA device/recall data. Exposes recall/safety intelligence
 * (Class I/II/III counts + recall details) for CER, post-market surveillance,
 * and competitive safety analysis.
 *
 * The openFDA fetcher is injectable (it already is in the underlying module),
 * so this is unit-testable without network access.
 *
 * @module server/services/integrations/device-recalls
 */

import {
  fetchDeviceRecalls,
  summarizeRecalls,
  type DeviceRecall,
  type RecallSummary,
  type Fetcher,
} from '../postmarket/openfda-surveillance.js';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

export interface DeviceRecallSearchParams {
  deviceName?: string;
  manufacturer?: string;
  /** Free-text fallback (matched against the recall product description). */
  query?: string;
  limit?: number;
}

export interface DeviceRecallSearchResult {
  source: 'FDA Device Recalls (openFDA)';
  searchExpression: string;
  summary: RecallSummary;
  recalls: DeviceRecall[];
}

/**
 * Build a single-clause openFDA query expression. Single-clause (no AND/OR)
 * keeps it robust under the underlying encodeURIComponent. Device/query terms
 * match the recall product description; otherwise the recalling firm.
 */
export function buildDeviceRecallSearch(params: DeviceRecallSearchParams): string {
  const term = (params.deviceName || params.query || '').trim();
  if (term) return `product_description:"${term}"`;
  const firm = (params.manufacturer || '').trim();
  if (firm) return `recalling_firm:"${firm}"`;
  return '';
}

/**
 * Search FDA device recalls. Returns an empty summary when no usable search term
 * is supplied; throws only on an underlying fetch error (caller degrades).
 */
export async function searchDeviceRecalls(
  params: DeviceRecallSearchParams,
  opts: { fetcher?: Fetcher } = {}
): Promise<DeviceRecallSearchResult> {
  const limit = Math.min(Math.max(Math.trunc(params.limit ?? DEFAULT_LIMIT), 1), MAX_LIMIT);
  const searchExpression = buildDeviceRecallSearch(params);

  if (!searchExpression) {
    return {
      source: 'FDA Device Recalls (openFDA)',
      searchExpression: '',
      summary: summarizeRecalls([]),
      recalls: [],
    };
  }

  const recalls = await fetchDeviceRecalls(searchExpression, { limit, fetcher: opts.fetcher });
  return {
    source: 'FDA Device Recalls (openFDA)',
    searchExpression,
    summary: summarizeRecalls(recalls),
    recalls: recalls.slice(0, limit),
  };
}
