/**
 * EMA human-medicine / EPAR metadata, using EMA's official automated-use JSON
 * feeds. The former medicines.health.europa.eu /human-medicines URL redirects
 * to a veterinary HTML page (verified 2026-10-27).
 *
 * These feeds list regulatory documents; they are not the account-gated
 * Clinical Data Publication CSR repository. No PDF bytes are fetched/admitted.
 * EMA_EPAR_API_BASE_URL can override the origin with a mirror of the same feeds.
 */
import { fetchWithRetry } from './http.js';

const DEFAULT_BASE_URL = 'https://www.ema.europa.eu';
const MEDICINES_PATH = '/en/documents/report/medicines-output-medicines_json-report_en.json';
const DOCUMENTS_PATH = '/en/documents/report/documents-output-epar_documents_json-report_en.json';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const USER_AGENT = process.env.INTEGRATION_USER_AGENT || 'Concept2Cure-AnA/1.0 (regulatory intelligence)';
export const EMA_EPAR_SOURCE = 'EMA EPAR (European Public Assessment Reports)' as const;

export interface EmaEparSearchParams {
  query?: string;
  activeSubstance?: string;
  therapeuticArea?: string;
  pageSize?: number;
}

export interface EmaEparDocument {
  id: string;
  title: string;
  /** Exact document type supplied by EMA; never inferred to be a CSR. */
  agencyType: string;
  classification: 'regulatory_assessment' | 'product_information' | 'risk_management_plan' | 'regulatory_document';
  url: string;
  referenceNumber: string;
  lastUpdated: string;
  acquisitionStatus: 'listed_only';
}

export interface EmaEparMedicine {
  productNumber: string;
  medicineName: string;
  activeSubstance: string;
  authorisationStatus: string;
  therapeuticArea: string;
  marketingAuthorisationHolder: string;
  url: string;
  therapeuticIndication: string;
  documents: EmaEparDocument[];
}

export interface EmaEparSearchResult {
  source: typeof EMA_EPAR_SOURCE;
  status: 'ok' | 'unavailable';
  totalCount: number;
  medicines: EmaEparMedicine[];
  message?: string;
}

function baseUrl(): string {
  return (process.env.EMA_EPAR_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
}
function str(v: unknown): string { return v == null ? '' : String(v); }
/** Official feed keys take precedence over legacy connector field aliases. */
function firstText(record: Record<string, unknown>, ...keys: string[]): string {
  return str(keys.map(key => record[key]).find(Boolean));
}
function clampPageSize(n?: number): number {
  return Number.isFinite(n) ? Math.min(Math.max(Math.trunc(n!), 1), 50) : 10;
}
function publicUrl(v: unknown): string {
  try {
    const url = new URL(str(v));
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

/** Retained filter contract; filtering is local over the official feed. */
export function buildEmaEparQuery(params: EmaEparSearchParams): URLSearchParams {
  const qs = new URLSearchParams();
  const term = (params.query || params.activeSubstance || params.therapeuticArea || '').trim();
  if (term) qs.set('searchTerm', term);
  if (params.therapeuticArea?.trim()) qs.set('therapeuticArea', params.therapeuticArea.trim());
  qs.set('pageSize', String(clampPageSize(params.pageSize)));
  qs.set('page', '1');
  return qs;
}

/** Preserve EMA's source URL and status, including withdrawn/refused products. */
export function normalizeMedicine(raw: any): EmaEparMedicine {
  const r = raw ?? {};
  const medicineName = firstText(r, 'name_of_medicine', 'medicineName', 'name');
  const slug = medicineName.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  return {
    productNumber: firstText(r, 'ema_product_number', 'productNumber', 'emaProductNumber', 'id'),
    medicineName,
    activeSubstance: firstText(r, 'active_substance', 'international_non_proprietary_name_common_name', 'activeSubstance', 'inn'),
    authorisationStatus: firstText(r, 'medicine_status', 'authorisationStatus', 'status'),
    therapeuticArea: firstText(r, 'therapeutic_area_mesh', 'therapeuticArea'),
    marketingAuthorisationHolder: firstText(r, 'marketing_authorisation_developer_applicant_holder', 'marketingAuthorisationHolder', 'mah'),
    therapeuticIndication: str(r.therapeutic_indication),
    url: publicUrl(firstText(r, 'medicine_url', 'url')) || (slug ? `https://www.ema.europa.eu/en/medicines/human/EPAR/${slug}` : 'https://www.ema.europa.eu/en/medicines'),
    documents: [],
  };
}

function normalizeDocument(r: any): EmaEparDocument | null {
  const url = publicUrl(r?.document_url);
  if (!url) return null;
  const agencyType = str(r.type);
  const classification = ['assessment-report', 'variation-report'].includes(agencyType) ? 'regulatory_assessment'
    : agencyType === 'product-information' ? 'product_information'
      : ['rmp', 'rmp-summary'].includes(agencyType) ? 'risk_management_plan' : 'regulatory_document';
  return { id: str(r.id), title: str(r.name), agencyType, classification, url,
    referenceNumber: str(r.reference_number), lastUpdated: str(r.last_updated_date), acquisitionStatus: 'listed_only' };
}

/** Stream with a byte ceiling; reject HTML/login pages even if HTTP 200. */
async function readFeed(url: string, maxBytes: number): Promise<any[]> {
  const res = await fetchWithRetry(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } }, { timeoutMs: 20_000 });
  if (!res.ok) throw new Error(`EMA EPAR feed returned HTTP ${res.status}`);
  if (!/^application\/(?:[\w.+-]+\+)?json(?:\s*;|$)/i.test(res.headers.get('content-type') || '')) {
    throw new Error('EMA EPAR feed returned non-JSON content (unexpected shape)');
  }
  if (Number(res.headers.get('content-length')) > maxBytes || !res.body) {
    await res.body?.cancel();
    throw new Error('EMA EPAR feed exceeds its byte limit or has no body');
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new Error('EMA EPAR feed exceeds its byte limit'); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const data: any = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!Array.isArray(data?.data)) throw new Error('EMA EPAR feed has no results array (unexpected shape)');
  return data.data;
}

let cache: { key: string; expiresAt: number; medicines: EmaEparMedicine[] } | undefined;
let pending: { key: string; promise: Promise<EmaEparMedicine[]> } | undefined;
/** Explicit refresh for operators and isolated HTTP contract tests. */
export function clearEmaEparCache(): void { cache = undefined; pending = undefined; }

async function loadIndex(): Promise<EmaEparMedicine[]> {
  const key = baseUrl();
  if (cache?.key === key && cache.expiresAt > Date.now()) return cache.medicines;
  if (pending?.key === key) return pending.promise;
  const promise = (async () => {
    const [rawMedicines, rawDocuments] = await Promise.all([
      readFeed(`${key}${MEDICINES_PATH}`, 8 * 1024 * 1024),
      readFeed(`${key}${DOCUMENTS_PATH}`, 40 * 1024 * 1024),
    ]);
    if (rawMedicines.some(r => !r || typeof r.category !== 'string'
      || typeof r.ema_product_number !== 'string' || typeof r.name_of_medicine !== 'string')) {
      throw new Error('EMA EPAR medicine records have an unexpected shape');
    }
    if (rawDocuments.some(r => !r || typeof r.ema_product_number !== 'string'
      || typeof r.document_url !== 'string' || typeof r.name !== 'string' || typeof r.type !== 'string')) {
      throw new Error('EMA EPAR document records have an unexpected shape');
    }
    const byProduct = new Map<string, EmaEparDocument[]>();
    for (const raw of rawDocuments) {
      const product = str(raw?.ema_product_number);
      const doc = normalizeDocument(raw);
      if (!product || !doc) continue;
      const list = byProduct.get(product) ?? [];
      list.push(doc); byProduct.set(product, list);
    }
    const medicines = rawMedicines.filter(r => str(r?.category).toLowerCase() === 'human').map(raw => {
      const medicine = normalizeMedicine(raw);
      medicine.documents = byProduct.get(medicine.productNumber) ?? [];
      return medicine;
    });
    cache = { key, expiresAt: Date.now() + CACHE_TTL_MS, medicines };
    return medicines;
  })();
  pending = { key, promise };
  try { return await promise; } finally { if (pending?.promise === promise) pending = undefined; }
}

export async function searchEmaEpar(params: EmaEparSearchParams): Promise<EmaEparSearchResult> {
  try {
    const all = await loadIndex();
    const term = buildEmaEparQuery(params).get('searchTerm')?.toLowerCase() || '';
    const substance = params.activeSubstance?.trim().toLowerCase() || '';
    const area = params.therapeuticArea?.trim().toLowerCase() || '';
    const matches = all.filter(m =>
      (!term || [m.medicineName, m.productNumber, m.activeSubstance, m.therapeuticArea, m.therapeuticIndication, m.marketingAuthorisationHolder].join(' ').toLowerCase().includes(term))
      && (!substance || m.activeSubstance.toLowerCase().includes(substance))
      && (!area || m.therapeuticArea.toLowerCase().includes(area)));
    return { source: EMA_EPAR_SOURCE, status: 'ok', totalCount: matches.length, medicines: matches.slice(0, clampPageSize(params.pageSize)) };
  } catch (err) {
    return { source: EMA_EPAR_SOURCE, status: 'unavailable', totalCount: 0, medicines: [], message: err instanceof Error ? err.message : 'EMA EPAR request failed' };
  }
}
