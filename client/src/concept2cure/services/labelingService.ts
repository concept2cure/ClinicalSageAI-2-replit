/**
 * @fileoverview Labeling Service
 * @module concept2cure/services/labelingService
 * @version 1.0.0
 *
 * @description
 * Live service for the labeling workstream — IFU, package insert, patient
 * label, operator manual, translations, and ISO 15223-1 symbol glossary.
 *
 * Binds to server/routes/mdx-labeling.ts, mounted at /api/mdx:
 *   GET    /api/mdx/labeling                          list docs
 *   POST   /api/mdx/labeling                          create doc
 *   GET    /api/mdx/labeling/:id                       single + nested
 *   PATCH  /api/mdx/labeling/:id                        partial update
 *   GET    /api/mdx/labeling/:id/translations           list translations
 *   POST   /api/mdx/labeling/:id/translations           add translation
 *   PATCH  /api/mdx/labeling/translations/:transId       update translation
 *   GET    /api/mdx/labeling/:id/symbols                 list symbols
 *   POST   /api/mdx/labeling/:id/symbols                 add symbol
 *   DELETE /api/mdx/labeling/symbols/:symId              remove symbol
 *   GET    /api/mdx/labeling/:id/coverage                translation coverage
 *
 * Every read is tenant-scoped server-side (organization_id). Docs may carry an
 * optional program_id (UUID) — the shell threads the canonical project id from
 * useProjects through as the program filter, mirroring how CMC scopes its
 * project-scoped surfaces.
 */

import { apiRequest, type ApiRequestMethod } from '../../lib/queryClient';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES — mirror the labeling_documents / labeling_translations / labeling_symbols
// columns returned raw by the routes. Columns can vary, so consumers pick
// defensively; these capture the recognised shape.
// ═══════════════════════════════════════════════════════════════════════════════

export type LabelingDocKind =
  | 'ifu'
  | 'package_insert'
  | 'patient_label'
  | 'operator_manual'
  | 'service_manual'
  | 'quick_ref'
  | 'box_label';

export type LabelingDocStatus =
  | 'draft'
  | 'review'
  | 'approved'
  | 'effective'
  | 'superseded';

export type LabelingTransMethod = 'human' | 'mt_postedited' | 'machine';

export type LabelingTransStatus =
  | 'pending'
  | 'in_progress'
  | 'review'
  | 'approved'
  | 'rejected';

export interface LabelingDoc {
  id: number;
  organization_id: number;
  program_id: string | null;
  device_name: string;
  doc_kind: LabelingDocKind;
  version: string;
  status: LabelingDocStatus;
  language: string;
  region: 'us' | 'eu' | 'jp' | 'global' | null;
  udi_di: string | null;
  effective_date: string | null;
  expires_at: string | null;
  artifact_id: number | null;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface LabelingTranslation {
  id: number;
  labeling_document_id: number;
  organization_id: number;
  language: string;
  translator: string | null;
  translation_method: LabelingTransMethod | null;
  back_translation_verified: boolean | null;
  status: LabelingTransStatus;
  approved_by?: number | null;
  approved_at?: string | null;
  [key: string]: unknown;
}

export interface LabelingSymbol {
  id: number;
  labeling_document_id: number;
  organization_id: number;
  symbol_code: string;
  symbol_name: string;
  description: string | null;
  required_by: string[] | null;
  [key: string]: unknown;
}

export interface LabelingDocDetail extends LabelingDoc {
  translations: LabelingTranslation[];
  symbols: LabelingSymbol[];
}

export interface LabelingCoverageLanguage {
  language: string;
  status: LabelingTransStatus;
  btv: boolean;
}

export interface LabelingCoverage {
  totalTranslations: number;
  approved: number;
  backTranslationVerified: number;
  languages: LabelingCoverageLanguage[];
}

export interface LabelingDocFilter {
  programId?: string;
  docKind?: LabelingDocKind;
  status?: LabelingDocStatus;
  language?: string;
}

export interface LabelingDocCreate {
  programId?: string | null;
  deviceName: string;
  docKind: LabelingDocKind;
  version?: string;
  status?: LabelingDocStatus;
  language?: string;
  region?: 'us' | 'eu' | 'jp' | 'global' | null;
  udiDi?: string | null;
  effectiveDate?: string | null;
  expiresAt?: string | null;
  artifactId?: number | null;
}

export interface LabelingTransCreate {
  language: string;
  translator?: string | null;
  translationMethod?: LabelingTransMethod | null;
  backTranslationVerified?: boolean;
  status?: LabelingTransStatus;
  artifactId?: number | null;
}

export type LabelingTransPatch = Partial<LabelingTransCreate>;

export interface LabelingSymbolCreate {
  symbolCode: string;
  symbolName: string;
  description?: string | null;
  requiredBy?: string[] | null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class LabelingService {
  private baseUrl = '/api/mdx/labeling';

  private async request<T>(method: ApiRequestMethod, url: string, body?: unknown): Promise<T> {
    const response = await apiRequest(method, url, body);
    if (response.status === 204) {
      return undefined as T;
    }
    const payload = await response.json().catch(() => ({}));
    if (payload?.error) {
      const err = payload.error;
      throw new Error(typeof err === 'string' ? err : err?.message || 'Labeling request failed');
    }
    // Routes wrap their result in the { data, meta } envelope (api-response.ok).
    return (payload?.data ?? payload) as T;
  }

  /** List labeling documents, optionally filtered. Tenant-scoped server-side. */
  async listDocuments(filter: LabelingDocFilter = {}): Promise<LabelingDoc[]> {
    const params = new URLSearchParams();
    if (filter.programId) params.set('program_id', filter.programId);
    if (filter.docKind) params.set('doc_kind', filter.docKind);
    if (filter.status) params.set('status', filter.status);
    if (filter.language) params.set('language', filter.language);
    const qs = params.toString();
    const rows = await this.request<LabelingDoc[]>('GET', qs ? `${this.baseUrl}?${qs}` : this.baseUrl);
    return Array.isArray(rows) ? rows : [];
  }

  /** Single labeling document, with nested translations + symbols. */
  async getDocument(id: number): Promise<LabelingDocDetail> {
    return this.request<LabelingDocDetail>('GET', `${this.baseUrl}/${id}`);
  }

  /** Create a labeling document. */
  async createDocument(data: LabelingDocCreate): Promise<LabelingDoc> {
    return this.request<LabelingDoc>('POST', this.baseUrl, data);
  }

  /** Partial update of a labeling document. */
  async updateDocument(id: number, patch: Partial<LabelingDocCreate>): Promise<LabelingDoc> {
    return this.request<LabelingDoc>('PATCH', `${this.baseUrl}/${id}`, patch);
  }

  /** Translations for a document. */
  async listTranslations(id: number): Promise<LabelingTranslation[]> {
    const rows = await this.request<LabelingTranslation[]>('GET', `${this.baseUrl}/${id}/translations`);
    return Array.isArray(rows) ? rows : [];
  }

  /** Add a translation to a document. */
  async addTranslation(id: number, data: LabelingTransCreate): Promise<LabelingTranslation> {
    return this.request<LabelingTranslation>('POST', `${this.baseUrl}/${id}/translations`, data);
  }

  /** Update a translation by id. */
  async updateTranslation(transId: number, patch: LabelingTransPatch): Promise<LabelingTranslation> {
    return this.request<LabelingTranslation>('PATCH', `${this.baseUrl}/translations/${transId}`, patch);
  }

  /** ISO 15223-1 symbols on a document. */
  async listSymbols(id: number): Promise<LabelingSymbol[]> {
    const rows = await this.request<LabelingSymbol[]>('GET', `${this.baseUrl}/${id}/symbols`);
    return Array.isArray(rows) ? rows : [];
  }

  /** Add a symbol to a document. */
  async addSymbol(id: number, data: LabelingSymbolCreate): Promise<LabelingSymbol> {
    return this.request<LabelingSymbol>('POST', `${this.baseUrl}/${id}/symbols`, data);
  }

  /** Remove a symbol by id. */
  async deleteSymbol(symId: number): Promise<void> {
    await this.request<void>('DELETE', `${this.baseUrl}/symbols/${symId}`);
  }

  /** Translation coverage summary for a document. */
  async getCoverage(id: number): Promise<LabelingCoverage> {
    return this.request<LabelingCoverage>('GET', `${this.baseUrl}/${id}/coverage`);
  }
}

const labelingService = new LabelingService();
export default labelingService;
