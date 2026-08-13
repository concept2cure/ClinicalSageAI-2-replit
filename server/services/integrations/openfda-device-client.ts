/**
 * openFDA device client — the canonical HTTP client for FDA device datasets.
 *
 *   searchDeviceClassification()  device/classification.json — product code /
 *                                 device class / regulation number lookup for
 *                                 device-profile intake autofill.
 *   search510kClearances()        device/510k.json — cleared 510(k)s, used as
 *                                 the in-repo predicate-search fallback when
 *                                 the external predicate-intelligence shadow
 *                                 service is not configured.
 *
 * Honest-by-construction, mirroring integrations/pubmed-client.ts: network or
 * API failure returns { available: false, results: [] } with the reason — it
 * never fabricates a classification or a predicate. openFDA is public and
 * unauthenticated (an optional OPENFDA_API_KEY raises rate limits).
 *
 * @module server/services/integrations/openfda-device-client
 */

const OPENFDA_BASE = 'https://api.fda.gov';
const TIMEOUT_MS = 10_000;

export interface DeviceClassificationHit {
  deviceName: string;
  productCode: string;
  deviceClass: string;
  regulationNumber: string;
  medicalSpecialty: string;
  reviewPanel: string;
}

export interface Clearance510kHit {
  kNumber: string;
  deviceName: string;
  applicant: string;
  productCode: string;
  decisionDate: string;
  decisionCode: string;
  clearanceType: string;
}

export interface OpenFdaResult<T> {
  available: boolean;
  /** Set when available=false — why the lookup could not run. */
  unavailableReason?: string;
  results: T[];
  source: 'openfda';
}

/** Escape a value for an openFDA (Lucene) quoted phrase. */
function phrase(value: string): string {
  return `"${value.replace(/["\\]/g, ' ').trim()}"`;
}

async function openFdaSearch(
  dataset: string,
  search: string,
  limit: number,
): Promise<{ ok: true; results: Array<Record<string, unknown>> } | { ok: false; reason: string }> {
  const params = new URLSearchParams({ search, limit: String(limit) });
  const apiKey = process.env.OPENFDA_API_KEY;
  if (apiKey) params.set('api_key', apiKey);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${OPENFDA_BASE}/${dataset}?${params.toString()}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (res.status === 404) {
      // openFDA returns 404 for zero matches — an honest empty result, not an outage.
      return { ok: true, results: [] };
    }
    if (!res.ok) {
      return { ok: false, reason: `openFDA ${dataset} responded ${res.status}` };
    }
    const json = (await res.json()) as { results?: Array<Record<string, unknown>> };
    return { ok: true, results: Array.isArray(json.results) ? json.results : [] };
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return {
      ok: false,
      reason: aborted
        ? `openFDA ${dataset} timed out after ${TIMEOUT_MS}ms`
        : `openFDA ${dataset} unreachable: ${err instanceof Error ? err.message : String(err)}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * Look up FDA device classifications by product code, device name, or
 * regulation number (at least one required by the caller).
 */
export async function searchDeviceClassification(query: {
  productCode?: string;
  deviceName?: string;
  regulationNumber?: string;
  limit?: number;
}): Promise<OpenFdaResult<DeviceClassificationHit>> {
  const clauses: string[] = [];
  if (query.productCode) clauses.push(`product_code:${phrase(query.productCode)}`);
  if (query.regulationNumber) clauses.push(`regulation_number:${phrase(query.regulationNumber)}`);
  if (query.deviceName) clauses.push(`device_name:${phrase(query.deviceName)}`);
  if (clauses.length === 0) {
    return { available: false, unavailableReason: 'No query terms provided', results: [], source: 'openfda' };
  }

  const outcome = await openFdaSearch(
    'device/classification.json',
    clauses.join('+AND+'),
    Math.min(Math.max(query.limit ?? 10, 1), 50),
  );
  if (!outcome.ok) {
    return { available: false, unavailableReason: outcome.reason, results: [], source: 'openfda' };
  }
  return {
    available: true,
    source: 'openfda',
    results: outcome.results.map((r) => ({
      deviceName: str(r.device_name),
      productCode: str(r.product_code),
      deviceClass: str(r.device_class),
      regulationNumber: str(r.regulation_number),
      medicalSpecialty: str(r.medical_specialty_description),
      reviewPanel: str(r.review_panel),
    })),
  };
}

/**
 * Search cleared 510(k)s by device name and/or product code — the reduced,
 * clearly-labeled predicate fallback (no SE scoring, no evidence cells; just
 * real FDA clearance records to start from).
 */
export async function search510kClearances(query: {
  deviceName?: string;
  productCode?: string;
  limit?: number;
}): Promise<OpenFdaResult<Clearance510kHit>> {
  const clauses: string[] = [];
  if (query.productCode) clauses.push(`product_code:${phrase(query.productCode)}`);
  if (query.deviceName) clauses.push(`device_name:${phrase(query.deviceName)}`);
  if (clauses.length === 0) {
    return { available: false, unavailableReason: 'No query terms provided', results: [], source: 'openfda' };
  }

  const outcome = await openFdaSearch(
    'device/510k.json',
    clauses.join('+AND+'),
    Math.min(Math.max(query.limit ?? 15, 1), 50),
  );
  if (!outcome.ok) {
    return { available: false, unavailableReason: outcome.reason, results: [], source: 'openfda' };
  }
  return {
    available: true,
    source: 'openfda',
    results: outcome.results.map((r) => ({
      kNumber: str(r.k_number),
      deviceName: str(r.device_name),
      applicant: str(r.applicant),
      productCode: str(r.product_code),
      decisionDate: str(r.decision_date),
      decisionCode: str(r.decision_code),
      clearanceType: str(r.clearance_type),
    })),
  };
}

export default { searchDeviceClassification, search510kClearances };
