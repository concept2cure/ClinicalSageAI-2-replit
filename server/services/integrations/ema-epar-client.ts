/**
 * EMA EPAR (European Public Assessment Report) client.
 *
 * Backs AnA's `search_ema_epar` tool — live EU centrally-authorised medicines
 * intelligence, the EU analogue of the US Drugs@FDA / openFDA label connectors.
 * Queries the public EMA medicines API for authorised human medicines and their
 * active substance, authorisation status, therapeutic area, and EPAR reference.
 *
 * Base URL is configurable via EMA_EPAR_API_BASE_URL (egress proxy / tests).
 * UNLIKE the throw-on-failure US integration clients, this connector NEVER throws
 * on a network/HTTP error: it returns a typed `status: 'unavailable'` result so
 * the governed AnA handler degrades cleanly to manual-search guidance.
 *
 * NOTE: a separate `connectors/ema-epar.ts` DataConnector exists for the
 * cross-connector federated search surface; this client is the governed,
 * graceful wrapper that backs the dedicated `search_ema_epar` AnA tool.
 *
 * @module server/services/integrations/ema-epar-client
 */

import { fetchWithRetry } from './http.js';

const DEFAULT_BASE_URL = 'https://medicines.health.europa.eu/api';
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 10;
const USER_AGENT =
  process.env.INTEGRATION_USER_AGENT || 'Concept2Cure-AnA/1.0 (regulatory intelligence)';

export const EMA_EPAR_SOURCE = 'EMA EPAR (European Public Assessment Reports)' as const;

export interface EmaEparSearchParams {
  /** Free-text term (medicine name, INN, active substance, MAH). */
  query?: string;
  /** Active substance / INN filter. */
  activeSubstance?: string;
  /** Therapeutic area filter. */
  therapeuticArea?: string;
  /** Max medicines to return (1–50, default 10). */
  pageSize?: number;
}

export interface EmaEparMedicine {
  /** EMA product number — use for citation. */
  productNumber: string;
  medicineName: string;
  activeSubstance: string;
  authorisationStatus: string;
  therapeuticArea: string;
  marketingAuthorisationHolder: string;
  /** Canonical public EPAR URL — use for citation. */
  url: string;
}

export interface EmaEparSearchResult {
  source: typeof EMA_EPAR_SOURCE;
  /** 'ok' on a successful query (incl. zero matches); 'unavailable' on failure. */
  status: 'ok' | 'unavailable';
  /** Total medicines matching the query across all pages (not just this page). */
  totalCount: number;
  medicines: EmaEparMedicine[];
  /** Human-readable reason when status is 'unavailable'. */
  message?: string;
}

function baseUrl(): string {
  return (process.env.EMA_EPAR_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

function clampPageSize(pageSize?: number): number {
  return Math.min(Math.max(Math.trunc(pageSize ?? DEFAULT_PAGE_SIZE), 1), MAX_PAGE_SIZE);
}

function str(v: unknown): string {
  return v == null ? '' : String(v);
}

function eparSlug(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

/** Build the EMA medicines-search query string (exported for testability). */
export function buildEmaEparQuery(params: EmaEparSearchParams): URLSearchParams {
  const qs = new URLSearchParams();
  const term = (params.query || params.activeSubstance || params.therapeuticArea || '').trim();
  if (term) qs.set('searchTerm', term);
  if (params.therapeuticArea?.trim()) qs.set('therapeuticArea', params.therapeuticArea.trim());
  qs.set('pageSize', String(clampPageSize(params.pageSize)));
  qs.set('page', '1');
  return qs;
}

/** Defensively map an EMA medicine record to our flat, citeable shape. */
export function normalizeMedicine(raw: any): EmaEparMedicine {
  const r = raw ?? {};
  const medicineName = str(r.medicineName || r.name);
  return {
    productNumber: str(r.productNumber || r.emaProductNumber || r.id),
    medicineName,
    activeSubstance: str(r.activeSubstance || r.inn),
    authorisationStatus: str(r.authorisationStatus || r.status),
    therapeuticArea: str(r.therapeuticArea),
    marketingAuthorisationHolder: str(r.marketingAuthorisationHolder || r.mah),
    url: r.url
      ? str(r.url)
      : medicineName
        ? `https://www.ema.europa.eu/en/medicines/human/EPAR/${eparSlug(medicineName)}`
        : 'https://www.ema.europa.eu/en/medicines',
  };
}

/**
 * Search EMA EPARs for centrally-authorised human medicines. Returns a typed
 * result with `status: 'unavailable'` (never throws) on any network/HTTP error
 * so the AnA handler can degrade to manual-search guidance.
 */
export async function searchEmaEpar(params: EmaEparSearchParams): Promise<EmaEparSearchResult> {
  const pageSize = clampPageSize(params.pageSize);
  try {
    const url = `${baseUrl()}/human-medicines?${buildEmaEparQuery(params).toString()}`;
    const res = await fetchWithRetry(
      url,
      { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } },
      { timeoutMs: REQUEST_TIMEOUT_MS }
    );
    if (!res.ok) {
      if (res.status === 404) {
        return { source: EMA_EPAR_SOURCE, status: 'ok', totalCount: 0, medicines: [] };
      }
      return {
        source: EMA_EPAR_SOURCE,
        status: 'unavailable',
        totalCount: 0,
        medicines: [],
        message: `EMA EPAR API returned HTTP ${res.status}`,
      };
    }

    const data: any = await res.json();
    const content = Array.isArray(data?.content)
      ? data.content
      : Array.isArray(data?.results)
        ? data.results
        : [];
    const totalCount = Number(data?.totalElements ?? data?.total ?? content.length) || content.length;
    return {
      source: EMA_EPAR_SOURCE,
      status: 'ok',
      totalCount,
      medicines: content.slice(0, pageSize).map(normalizeMedicine),
    };
  } catch (err) {
    return {
      source: EMA_EPAR_SOURCE,
      status: 'unavailable',
      totalCount: 0,
      medicines: [],
      message: err instanceof Error ? err.message : 'EMA EPAR request failed',
    };
  }
}
