/**
 * EUDAMED (European Database on Medical Devices) client.
 *
 * Backs AnA's `search_eudamed` tool — live EU device-side intelligence mirroring
 * the US openFDA device connectors. Queries the public EUDAMED device/UDI search
 * surface for registered devices and their Basic UDI-DI, manufacturer (SRN/actor),
 * risk class, and EUDAMED reference for citation.
 *
 * Base URL is configurable via EUDAMED_API_BASE_URL (egress proxy / tests).
 * UNLIKE the throw-on-failure US integration clients, this connector NEVER throws
 * on a network/HTTP error: it returns a typed `status: 'unavailable'` result so
 * the governed AnA handler degrades cleanly to manual-search guidance.
 *
 * @module server/services/integrations/eudamed-client
 */

import { fetchWithRetry } from './http.js';

const DEFAULT_BASE_URL = 'https://ec.europa.eu/tools/eudamed/api';
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 10;
const USER_AGENT =
  process.env.INTEGRATION_USER_AGENT || 'Concept2Cure-AnA/1.0 (regulatory intelligence)';

export const EUDAMED_SOURCE = 'EUDAMED (EU Medical Device Database)' as const;

export interface EudamedSearchParams {
  /** Free-text term (device name, trade name, manufacturer, Basic UDI-DI). */
  query?: string;
  /** Manufacturer / actor name filter. */
  manufacturer?: string;
  /** Risk class filter, e.g. "IIa", "III". */
  riskClass?: string;
  /** Max devices to return (1–50, default 10). */
  pageSize?: number;
}

export interface EudamedDevice {
  /** Basic UDI-DI — the EU device family identifier; use for citation. */
  basicUdiDi: string;
  deviceName: string;
  manufacturer: string;
  /** Single Registration Number of the actor (manufacturer), when present. */
  manufacturerSrn: string;
  riskClass: string;
  status: string;
  /** Canonical public EUDAMED URL — use for citation. */
  url: string;
}

export interface EudamedSearchResult {
  source: typeof EUDAMED_SOURCE;
  /** 'ok' on a successful query (incl. zero matches); 'unavailable' on failure. */
  status: 'ok' | 'unavailable';
  /** Total devices matching the query across all pages (not just this page). */
  totalCount: number;
  devices: EudamedDevice[];
  /** Human-readable reason when status is 'unavailable'. */
  message?: string;
}

function baseUrl(): string {
  return (process.env.EUDAMED_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

function clampPageSize(pageSize?: number): number {
  return Math.min(Math.max(Math.trunc(pageSize ?? DEFAULT_PAGE_SIZE), 1), MAX_PAGE_SIZE);
}

function str(v: unknown): string {
  return v == null ? '' : String(v);
}

/** Build the EUDAMED device-search query string (exported for testability). */
export function buildEudamedQuery(params: EudamedSearchParams): URLSearchParams {
  const qs = new URLSearchParams();
  const term = (params.query || params.manufacturer || '').trim();
  if (term) qs.set('keyword', term);
  if (params.manufacturer?.trim()) qs.set('manufacturerName', params.manufacturer.trim());
  if (params.riskClass?.trim()) qs.set('riskClass', params.riskClass.trim());
  qs.set('size', String(clampPageSize(params.pageSize)));
  qs.set('page', '0');
  qs.set('languageIso2Code', 'en');
  return qs;
}

/** Defensively map a EUDAMED device record to our flat, citeable shape. */
export function normalizeDevice(raw: any): EudamedDevice {
  const r = raw ?? {};
  const basicUdiDi = str(r.basicUdiDiData?.code || r.basicUdiDiCode || r.uuid);
  const manufacturer = r.manufacturer ?? r.actor ?? {};
  return {
    basicUdiDi,
    deviceName: str(r.tradeName || r.deviceName || r.name),
    manufacturer: str(manufacturer.name || r.manufacturerName),
    manufacturerSrn: str(manufacturer.srn || r.manufacturerSrn),
    riskClass: str(r.riskClass || r.deviceRiskClass),
    status: str(r.versionState || r.status),
    url: basicUdiDi
      ? `https://ec.europa.eu/tools/eudamed/#/screen/search-device?basicUdiData.code=${encodeURIComponent(basicUdiDi)}`
      : 'https://ec.europa.eu/tools/eudamed/#/screen/home',
  };
}

/**
 * Search EUDAMED for registered medical devices. Returns a typed result with
 * `status: 'unavailable'` (never throws) on any network/HTTP error so the AnA
 * handler can degrade to manual-search guidance.
 */
export async function searchEudamed(params: EudamedSearchParams): Promise<EudamedSearchResult> {
  const pageSize = clampPageSize(params.pageSize);
  try {
    const url = `${baseUrl()}/devices/search?${buildEudamedQuery(params).toString()}`;
    const res = await fetchWithRetry(
      url,
      { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } },
      { timeoutMs: REQUEST_TIMEOUT_MS }
    );
    if (!res.ok) {
      // A zero-match search returns 404 on this surface — treat as empty, not failure.
      if (res.status === 404) {
        return { source: EUDAMED_SOURCE, status: 'ok', totalCount: 0, devices: [] };
      }
      return {
        source: EUDAMED_SOURCE,
        status: 'unavailable',
        totalCount: 0,
        devices: [],
        message: `EUDAMED API returned HTTP ${res.status}`,
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
      source: EUDAMED_SOURCE,
      status: 'ok',
      totalCount,
      devices: content.slice(0, pageSize).map(normalizeDevice),
    };
  } catch (err) {
    return {
      source: EUDAMED_SOURCE,
      status: 'unavailable',
      totalCount: 0,
      devices: [],
      message: err instanceof Error ? err.message : 'EUDAMED request failed',
    };
  }
}
