/**
 * @fileoverview Risk Management Service
 * @module concept2cure/services/riskService
 * @version 1.0.0
 *
 * @description
 * Live service for the ISO 14971 risk-management workstream — hazard analysis,
 * risk items (hazard → hazardous situation → harm), severity × probability
 * scoring, risk controls (ISO 14971 §7 hierarchy), and an aggregate risk
 * summary.
 *
 * Binds to server/routes/mdx-risk-management.ts, mounted at /api/mdx:
 *   GET    /api/mdx/risk-items?program_id=<UUID>      list risk items
 *   POST   /api/mdx/risk-items                         create a risk item
 *   GET    /api/mdx/risk-items/:id                     single item + controls
 *   PATCH  /api/mdx/risk-items/:id                     partial update
 *   POST   /api/mdx/risk-items/:id/controls            add a risk control
 *   PATCH  /api/mdx/risk-controls/:controlId           update a control
 *   GET    /api/mdx/risk-summary/:programId            aggregate metrics
 *
 * Every read is tenant-scoped server-side (organization_id). Items carry an
 * optional program_id (UUID) — the shell threads the canonical project id from
 * useProjects through as the program filter, the same id space CMC / labeling
 * scope on. The route wraps results in the { data, meta } envelope.
 */

import { apiRequest, type ApiRequestMethod } from '../../lib/queryClient';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES — mirror the risk_items / risk_controls columns returned raw by the
// routes. Columns can vary, so consumers pick defensively; these capture the
// recognised shape.
// ═══════════════════════════════════════════════════════════════════════════════

/** ISO 14971 severity / probability scales are integers 1..5. */
export type RiskScale = 1 | 2 | 3 | 4 | 5;

export type RiskItemStatus =
  | 'open'
  | 'mitigating'
  | 'verified'
  | 'accepted'
  | 'closed';

export type RiskControlStrategy =
  | 'design_eliminate'
  | 'design_reduce'
  | 'protective'
  | 'information';

/** ISO 14971 §7 control hierarchy: inherent safety > protective > information. */
export type RiskControlType =
  | 'inherent_safety'
  | 'protective_measure'
  | 'information_safety';

export type RiskControlStatus =
  | 'proposed'
  | 'implemented'
  | 'verified'
  | 'effective';

export type RiskSource =
  | 'fmea'
  | 'pha'
  | 'fault_tree'
  | 'literature'
  | 'complaint'
  | 'capa'
  | 'other';

export interface RiskItem {
  id: number;
  organization_id: number;
  program_id: string | null;
  ref_code: string | null;
  hazard: string;
  hazardous_situation: string | null;
  harm: string;
  sequence_of_events: string | null;
  severity: number;
  probability: number;
  detectability: number | null;
  initial_risk: number | null;
  residual_severity: number | null;
  residual_probability: number | null;
  residual_risk: number | null;
  acceptable: boolean | null;
  benefit_risk_rationale: string | null;
  control_strategy: RiskControlStrategy | null;
  status: RiskItemStatus;
  source: RiskSource | null;
  assigned_to: number | null;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface RiskControl {
  id: number;
  risk_item_id: number;
  organization_id: number;
  description: string;
  control_type: RiskControlType;
  implementation_evidence: string | null;
  verification_evidence: string | null;
  effectiveness_evidence: string | null;
  introduces_new_risk: boolean | null;
  new_risk_item_id: number | null;
  status: RiskControlStatus;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface RiskItemDetail extends RiskItem {
  controls: RiskControl[];
}

export interface RiskSummary {
  total: number;
  open: number;
  highResidual: number;
  accepted: number;
  avgInitial: number | null;
  avgResidual: number | null;
}

export interface RiskItemFilter {
  programId?: string;
  status?: RiskItemStatus;
  limit?: number;
}

export interface RiskItemCreate {
  programId?: string | null;
  refCode?: string | null;
  hazard: string;
  hazardousSituation?: string | null;
  harm: string;
  sequenceOfEvents?: string | null;
  severity: RiskScale;
  probability: RiskScale;
  detectability?: RiskScale | null;
  controlStrategy?: RiskControlStrategy | null;
  source?: RiskSource | null;
  status?: RiskItemStatus;
  assignedTo?: number | null;
}

export interface RiskItemPatch extends Partial<RiskItemCreate> {
  residualSeverity?: RiskScale | null;
  residualProbability?: RiskScale | null;
  acceptable?: boolean | null;
  benefitRiskRationale?: string | null;
}

export interface RiskControlCreate {
  description: string;
  controlType: RiskControlType;
  implementationEvidence?: string | null;
  verificationEvidence?: string | null;
  effectivenessEvidence?: string | null;
  introducesNewRisk?: boolean;
  newRiskItemId?: number | null;
  status?: RiskControlStatus;
}

export type RiskControlPatch = Partial<RiskControlCreate>;

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class RiskService {
  private baseUrl = '/api/mdx';

  private async request<T>(method: ApiRequestMethod, url: string, body?: unknown): Promise<T> {
    const response = await apiRequest(method, url, body);
    if (response.status === 204) {
      return undefined as T;
    }
    const payload = await response.json().catch(() => ({}));
    if (payload?.error) {
      const err = payload.error;
      throw new Error(typeof err === 'string' ? err : err?.message || 'Risk request failed');
    }
    // Routes wrap their result in the { data, meta } envelope (api-response.ok).
    return (payload?.data ?? payload) as T;
  }

  /** List risk items, optionally filtered. Tenant-scoped server-side. */
  async listItems(filter: RiskItemFilter = {}): Promise<RiskItem[]> {
    const params = new URLSearchParams();
    if (filter.programId) params.set('program_id', filter.programId);
    if (filter.status) params.set('status', filter.status);
    if (filter.limit) params.set('limit', String(filter.limit));
    const qs = params.toString();
    const rows = await this.request<RiskItem[]>(
      'GET',
      qs ? `${this.baseUrl}/risk-items?${qs}` : `${this.baseUrl}/risk-items`,
    );
    return Array.isArray(rows) ? rows : [];
  }

  /** Single risk item, with its nested controls. */
  async getItem(id: number): Promise<RiskItemDetail> {
    return this.request<RiskItemDetail>('GET', `${this.baseUrl}/risk-items/${id}`);
  }

  /** Create a risk item. The server computes initial_risk = severity × probability. */
  async createItem(data: RiskItemCreate): Promise<RiskItem> {
    return this.request<RiskItem>('POST', `${this.baseUrl}/risk-items`, data);
  }

  /** Partial update of a risk item (re-score, accept, attach rationale). */
  async updateItem(id: number, patch: RiskItemPatch): Promise<RiskItem> {
    return this.request<RiskItem>('PATCH', `${this.baseUrl}/risk-items/${id}`, patch);
  }

  /** Add a risk control to an item. */
  async addControl(itemId: number, data: RiskControlCreate): Promise<RiskControl> {
    return this.request<RiskControl>('POST', `${this.baseUrl}/risk-items/${itemId}/controls`, data);
  }

  /** Update a risk control by id. */
  async updateControl(controlId: number, patch: RiskControlPatch): Promise<RiskControl> {
    return this.request<RiskControl>('PATCH', `${this.baseUrl}/risk-controls/${controlId}`, patch);
  }

  /** Aggregate risk summary for a program (project) id. */
  async getSummary(programId: string): Promise<RiskSummary> {
    return this.request<RiskSummary>('GET', `${this.baseUrl}/risk-summary/${programId}`);
  }
}

const riskService = new RiskService();
export default riskService;
