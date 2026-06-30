/**
 * @fileoverview Risk-Based Monitoring (RBM / RBQM) Service
 * @module concept2cure/services/rbmService
 *
 * Live service for the ICH E6(R3) / E8(R1) conduct-layer monitoring workstream:
 * Risk Assessment (RACT / Critical-to-Quality factors), Key Risk Indicators,
 * Quality Tolerance Limits, central-monitoring signals, per-site risk scores,
 * and the integrated monitoring plan + actions.
 *
 * Binds to server/routes/mdx-rbm.ts, mounted at /api/mdx. Every read is
 * tenant-scoped server-side (organization_id). Items carry an optional
 * program_id (UUID) — the shell threads the canonical project id from
 * useProjects through as the program filter. Routes wrap results in the
 * { data, meta } envelope.
 */

import { apiRequest, type ApiRequestMethod } from '../../lib/queryClient';

// ── Row shapes (mirror the rbm_* columns returned raw) ───────────────────────

export interface RbmAssessment {
  id: number;
  organization_id: number;
  program_id: string | null;
  title: string;
  framework: 'ich_e6r3' | 'transcelerate_ract';
  overall_risk: 'low' | 'medium' | 'high' | null;
  status: 'draft' | 'active' | 'archived';
  version: number;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface RbmRiskItem {
  id: number;
  organization_id: number;
  assessment_id: number | null;
  program_id: string | null;
  ref_code: string | null;
  category: 'safety' | 'efficacy' | 'data_integrity' | 'compliance' | 'operational';
  ctq_factor: string;
  risk_description: string | null;
  likelihood: number;
  impact: number;
  detectability: number | null;
  risk_score: number | null;
  is_critical: boolean;
  mitigation: string | null;
  residual_score: number | null;
  status: 'open' | 'mitigating' | 'accepted' | 'closed';
  [key: string]: unknown;
}

export interface RbmAssessmentDetail extends RbmAssessment {
  items: RbmRiskItem[];
}

export interface RbmKri {
  id: number;
  program_id: string | null;
  name: string;
  metric_definition: string | null;
  data_source: string;
  unit: string | null;
  direction: 'higher_worse' | 'lower_worse';
  threshold_amber: string | null;
  threshold_red: string | null;
  current_value: string | null;
  status: 'green' | 'amber' | 'red';
  evaluated_at: string | null;
  [key: string]: unknown;
}

export interface RbmKriValue {
  id: number;
  kri_id: number;
  value: string;
  status: 'green' | 'amber' | 'red' | null;
  observed_at: string;
  note: string | null;
  [key: string]: unknown;
}

export interface RbmQtl {
  id: number;
  program_id: string | null;
  parameter: string;
  rationale: string | null;
  threshold: string | null;
  secondary_limit: string | null;
  current_value: string | null;
  breached: boolean;
  status: 'within' | 'approaching' | 'breached';
  [key: string]: unknown;
}

export interface RbmSignal {
  id: number;
  program_id: string | null;
  site_id: string | null;
  source: 'central_stat' | 'kri' | 'qtl' | 'site_score' | 'manual';
  signal_type: string | null;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  detail: string | null;
  detected_at: string;
  status: 'new' | 'triaged' | 'investigating' | 'resolved' | 'dismissed';
  [key: string]: unknown;
}

export interface RbmSiteRisk {
  id: number;
  program_id: string | null;
  site_id: string | null;
  site_number: string | null;
  site_name: string | null;
  composite_risk: string | null;
  enrollment_risk: string | null;
  quality_risk: string | null;
  operational_risk: string | null;
  monitoring_tier: 'reduced' | 'standard' | 'enhanced';
  drivers: string[] | null;
  scored_at: string;
  [key: string]: unknown;
}

export interface RbmSiteOversight {
  site_id: string | null;
  site_number: string | null;
  site_name: string | null;
  composite_risk: string | null;
  monitoring_tier: 'reduced' | 'standard' | 'enhanced';
  drivers: string[] | null;
  open_signals: number;
  high_signals: number;
  [key: string]: unknown;
}

export interface RbmPlan {
  id: number;
  program_id: string | null;
  assessment_id: number | null;
  title: string;
  strategy: 'centralized' | 'risk_based' | 'on_site' | 'hybrid';
  status: 'draft' | 'active' | 'archived';
  [key: string]: unknown;
}

export interface RbmAction {
  id: number;
  plan_id: number | null;
  risk_item_id: number | null;
  signal_id: number | null;
  action_type: 'issue' | 'capa' | 'site_visit' | 'query' | 'escalation';
  description: string;
  priority: 'low' | 'medium' | 'high';
  owner: number | null;
  due_date: string | null;
  status: 'open' | 'in_progress' | 'done';
  [key: string]: unknown;
}

export interface RbmPlanDetail extends RbmPlan {
  actions: RbmAction[];
}

export interface RbmSummary {
  overallRisk: 'low' | 'medium' | 'high' | null;
  riskItems: { total: number; critical: number; open: number; high: number };
  kris: { total: number; red: number; amber: number };
  qtls: { total: number; breached: number; approaching: number };
  signals: { total: number; open: number; high: number };
  sites: { total: number; enhanced: number };
}

// ── Create / patch DTOs ──────────────────────────────────────────────────────

export interface RbmRiskItemCreate {
  assessmentId?: number | null;
  programId?: string | null;
  refCode?: string | null;
  category?: RbmRiskItem['category'];
  ctqFactor: string;
  riskDescription?: string | null;
  likelihood: number;
  impact: number;
  detectability?: number | null;
  isCritical?: boolean;
  mitigation?: string | null;
  status?: RbmRiskItem['status'];
}
export type RbmRiskItemPatch = Partial<RbmRiskItemCreate> & {
  residualLikelihood?: number | null;
  residualImpact?: number | null;
};

export interface RbmKriCreate {
  programId?: string | null;
  name: string;
  metricDefinition?: string | null;
  dataSource?: string;
  unit?: string | null;
  direction?: RbmKri['direction'];
  thresholdAmber?: number | null;
  thresholdRed?: number | null;
  currentValue?: number | null;
}
export type RbmKriPatch = Partial<RbmKriCreate>;

export interface RbmQtlCreate {
  programId?: string | null;
  parameter: string;
  rationale?: string | null;
  threshold?: number | null;
  secondaryLimit?: number | null;
  currentValue?: number | null;
}
export type RbmQtlPatch = Partial<RbmQtlCreate>;

export interface RbmSignalCreate {
  programId?: string | null;
  siteId?: string | null;
  source?: RbmSignal['source'];
  signalType?: string | null;
  severity?: RbmSignal['severity'];
  title: string;
  detail?: string | null;
}

export interface RbmPlanCreate {
  programId?: string | null;
  assessmentId?: number | null;
  title: string;
  strategy?: RbmPlan['strategy'];
}

export interface RbmActionCreate {
  planId: number;
  riskItemId?: number | null;
  signalId?: number | null;
  actionType?: RbmAction['action_type'];
  description: string;
  priority?: RbmAction['priority'];
  owner?: number | null;
  dueDate?: string | null;
}

// ── Service ─────────────────────────────────────────────────────────────────

class RbmService {
  private baseUrl = '/api/mdx';

  private async request<T>(method: ApiRequestMethod, url: string, body?: unknown): Promise<T> {
    const response = await apiRequest(method, url, body);
    if (response.status === 204) return undefined as T;
    const payload = await response.json().catch(() => ({}));
    if (payload?.error) {
      const err = payload.error;
      throw new Error(typeof err === 'string' ? err : err?.message || 'RBM request failed');
    }
    return (payload?.data ?? payload) as T;
  }

  private list<T>(path: string, params: Record<string, string | undefined>): Promise<T[]> {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
    const s = qs.toString();
    return this.request<T[]>('GET', s ? `${this.baseUrl}/${path}?${s}` : `${this.baseUrl}/${path}`)
      .then((rows) => (Array.isArray(rows) ? rows : []));
  }

  // Assessments
  listAssessments(programId?: string) { return this.list<RbmAssessment>('rbm-assessments', { program_id: programId }); }
  getAssessment(id: number) { return this.request<RbmAssessmentDetail>('GET', `${this.baseUrl}/rbm-assessments/${id}`); }
  createAssessment(body: { programId?: string | null; title: string; framework?: string }) { return this.request<RbmAssessment>('POST', `${this.baseUrl}/rbm-assessments`, body); }
  seedAssessment(programId: string, title?: string) { return this.request<RbmAssessmentDetail>('POST', `${this.baseUrl}/rbm-assessments/seed`, { programId, title }); }

  // Risk items
  listItems(programId?: string, assessmentId?: number) { return this.list<RbmRiskItem>('rbm-risk-items', { program_id: programId, assessment_id: assessmentId ? String(assessmentId) : undefined }); }
  createItem(body: RbmRiskItemCreate) { return this.request<RbmRiskItem>('POST', `${this.baseUrl}/rbm-risk-items`, body); }
  updateItem(id: number, patch: RbmRiskItemPatch) { return this.request<RbmRiskItem>('PATCH', `${this.baseUrl}/rbm-risk-items/${id}`, patch); }

  // KRIs
  listKris(programId?: string) { return this.list<RbmKri>('rbm-kris', { program_id: programId }); }
  createKri(body: RbmKriCreate) { return this.request<RbmKri>('POST', `${this.baseUrl}/rbm-kris`, body); }
  updateKri(id: number, patch: RbmKriPatch) { return this.request<RbmKri>('PATCH', `${this.baseUrl}/rbm-kris/${id}`, patch); }
  seedKris(programId: string) { return this.request<RbmKri[]>('POST', `${this.baseUrl}/rbm-kris/seed`, { programId }); }
  listKriValues(kriId: number) { return this.list<RbmKriValue>(`rbm-kris/${kriId}/values`, {}); }
  appendKriValue(kriId: number, body: { value: number; observedAt?: string | null; note?: string | null }) { return this.request<RbmKriValue>('POST', `${this.baseUrl}/rbm-kris/${kriId}/values`, body); }

  // QTLs
  listQtls(programId?: string) { return this.list<RbmQtl>('rbm-qtls', { program_id: programId }); }
  createQtl(body: RbmQtlCreate) { return this.request<RbmQtl>('POST', `${this.baseUrl}/rbm-qtls`, body); }
  updateQtl(id: number, patch: RbmQtlPatch) { return this.request<RbmQtl>('PATCH', `${this.baseUrl}/rbm-qtls/${id}`, patch); }
  seedQtls(programId: string) { return this.request<RbmQtl[]>('POST', `${this.baseUrl}/rbm-qtls/seed`, { programId }); }

  // Signals
  listSignals(programId?: string, status?: string) { return this.list<RbmSignal>('rbm-signals', { program_id: programId, status }); }
  createSignal(body: RbmSignalCreate) { return this.request<RbmSignal>('POST', `${this.baseUrl}/rbm-signals`, body); }
  updateSignal(id: number, patch: Partial<Pick<RbmSignal, 'severity' | 'status' | 'detail'>> & { resolutionNotes?: string | null }) { return this.request<RbmSignal>('PATCH', `${this.baseUrl}/rbm-signals/${id}`, patch); }

  // Site risk
  listSiteRisk(programId: string) { return this.list<RbmSiteRisk>('rbm-site-risk', { program_id: programId }); }
  recomputeSiteRisk(programId: string) { return this.request<unknown[]>('POST', `${this.baseUrl}/rbm-site-risk/recompute`, { programId }); }

  // Central statistical monitoring (CluePoints SMART-style) + SPOT oversight
  runCentralMonitoring(programId: string) { return this.request<{ findings: unknown[]; signals: RbmSignal[] }>('POST', `${this.baseUrl}/rbm-central-monitoring/run`, { programId }); }
  listSiteOversight(programId: string) { return this.list<RbmSiteOversight>(`rbm-site-oversight/${programId}`, {}); }

  // Plans + actions
  listPlans(programId?: string) { return this.list<RbmPlan>('rbm-monitoring-plans', { program_id: programId }); }
  getPlan(id: number) { return this.request<RbmPlanDetail>('GET', `${this.baseUrl}/rbm-monitoring-plans/${id}`); }
  createPlan(body: RbmPlanCreate) { return this.request<RbmPlan>('POST', `${this.baseUrl}/rbm-monitoring-plans`, body); }
  updatePlan(id: number, patch: Partial<RbmPlanCreate> & { status?: RbmPlan['status'] }) { return this.request<RbmPlan>('PATCH', `${this.baseUrl}/rbm-monitoring-plans/${id}`, patch); }
  listActions(planId?: number, programId?: string) { return this.list<RbmAction>('rbm-monitoring-actions', { plan_id: planId ? String(planId) : undefined, program_id: programId }); }
  createAction(body: RbmActionCreate) { return this.request<RbmAction>('POST', `${this.baseUrl}/rbm-monitoring-actions`, body); }
  updateAction(id: number, patch: Partial<Omit<RbmActionCreate, 'planId'>> & { status?: RbmAction['status'] }) { return this.request<RbmAction>('PATCH', `${this.baseUrl}/rbm-monitoring-actions/${id}`, patch); }

  // Summary
  getSummary(programId: string) { return this.request<RbmSummary>('GET', `${this.baseUrl}/rbm-summary/${programId}`); }
}

const rbmService = new RbmService();
export default rbmService;
