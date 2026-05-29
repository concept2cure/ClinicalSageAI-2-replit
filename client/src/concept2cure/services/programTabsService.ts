/**
 * @fileoverview Program sub-tabs service — Audit · Correspondence · Approvals
 * @module concept2cure/services/programTabsService
 * @version 1.0.0
 *
 * @description
 * Live data layer for the shared program sub-tab strip (ProgramSubTabs). One
 * service, three reads, three distinct route contracts — no mocks, no demo
 * arrays. Mirrors riskService's request idiom (apiRequest from the shared
 * queryClient, tenant header attached automatically).
 *
 * Routes (all mounted, confirmed):
 *   Audit          GET /api/mdx/audit
 *                    org-scoped (tenant_id); optional filters
 *                    action/resource/actor/program/from/to/limit. The program
 *                    filter ILIKEs the audit record id / new_values payload, so
 *                    the shell threads the canonical project id through as the
 *                    program anchor (best-effort, the same discipline as risk).
 *                    Envelope: api-response.ok → { data: { events, actions,
 *                    resources, kpis }, meta }.
 *   Correspondence GET /api/regulatory-correspondence/correspondence?projectId=
 *                    org-scoped; optional projectId / submissionId.
 *                    Envelope: { data: Correspondence[] }.
 *   Approvals      GET /api/approval-workflows/pending
 *                    scoped to the current user + org server-side; takes no
 *                    project id, so we do not force one.
 *                    Envelope: { success, approvals, total }.
 */

import { apiRequest, type ApiRequestMethod } from '../../lib/queryClient';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES — mirror each route's response shape. Heterogeneous columns are picked
// defensively at the component layer; these capture the recognised shape.
// ═══════════════════════════════════════════════════════════════════════════════

/** One row of the 21 CFR Part 11 audit chain (GET /api/mdx/audit). */
export interface AuditEvent {
  id: string;
  when: string;
  actor: string;
  actorName: string;
  role: string;
  action: string;
  resource: string;
  target: string;
  resourceId: string;
  reason: string;
  sha: string;
  prev: string;
  chain: string;
}

export interface AuditFilterOption {
  id: string;
  label: string;
}

export interface AuditKpi {
  label: string;
  metric: string;
  meta: string;
}

export interface AuditTrail {
  events: AuditEvent[];
  actions: AuditFilterOption[];
  resources: AuditFilterOption[];
  kpis: AuditKpi[];
}

export interface AuditFilters {
  action?: string;
  resource?: string;
  actor?: string;
  /** Program anchor — the canonical project id, ILIKE-matched server-side. */
  program?: string;
  from?: string;
  to?: string;
  limit?: number;
}

/** A correspondence thread row (GET /api/regulatory-correspondence/correspondence). */
export interface CorrespondenceRow {
  id: string;
  project_id?: number | null;
  submission_id?: string | null;
  direction?: string | null;
  source_channel?: string | null;
  communication_type?: string | null;
  subject?: string | null;
  sender?: string | null;
  recipients?: unknown;
  received_at?: string | null;
  due_date?: string | null;
  urgency?: string | null;
  response_required?: boolean | null;
  status?: string | null;
  created_at?: string | null;
  [key: string]: unknown;
}

/**
 * One parsed issue inside a correspondence thread
 * (GET /api/regulatory-correspondence/correspondence/:id → issues[]).
 * Columns are heterogeneous; consumers pick defensively. The id, body text and
 * the human review status are the load-bearing fields for the review action.
 */
export interface CorrespondenceIssue {
  id: string;
  correspondence_id?: string | null;
  issue_text?: string | null;
  summary?: string | null;
  category?: string | null;
  severity?: string | null;
  human_review_status?: string | null;
  resolution_status?: string | null;
  mapped_ctd_sections?: unknown;
  mapped_artifact_ids?: unknown;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
}

/** Full correspondence detail (GET /correspondence/:id). */
export interface CorrespondenceDetail {
  data: CorrespondenceRow | null;
  issues: CorrespondenceIssue[];
  responsePackages: Array<Record<string, unknown>>;
}

/**
 * The minimal review-issue payload accepted by
 * PATCH /api/regulatory-correspondence/issues/:issueId/review (issueReviewSchema).
 * humanReviewStatus is the only field this surface sets. The schema has no
 * free-text reason/note column, so the captured reason is not persisted by the
 * route — see ReviewIssueArgs in useProgramTabs for what is omitted and why.
 */
export interface ReviewIssuePayload {
  humanReviewStatus?: 'pending' | 'confirmed' | 'edited' | 'rejected';
  resolutionStatus?: 'open' | 'in_progress' | 'resolved' | 'waived';
}

/** A pending approval workflow instance (GET /api/approval-workflows/pending). */
export interface PendingApproval {
  id: number | string;
  [key: string]: unknown;
}

/** Result of an approve / reject decision (POST /api/approval-workflows/:id/{approve,reject}). */
export interface WorkflowDecisionResult {
  success: boolean;
  status: string;
  workflowAdvanced: boolean;
  workflowCompleted: boolean;
  workflowRejected: boolean;
  nextStep?: number;
  message?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

class ProgramTabsService {
  private async request<T>(method: ApiRequestMethod, url: string, body?: unknown): Promise<T> {
    const response = await apiRequest(method, url, body);
    if (response.status === 204) return undefined as T;
    const payload = await response.json().catch(() => ({}));
    if (payload?.error) {
      const err = payload.error;
      throw new Error(typeof err === 'string' ? err : err?.message || 'Program-tabs request failed');
    }
    return payload as T;
  }

  /** Audit trail. Envelope is api-response.ok → { data: AuditTrail }. */
  async getAuditTrail(filters: AuditFilters = {}): Promise<AuditTrail> {
    const params = new URLSearchParams();
    if (filters.action) params.set('action', filters.action);
    if (filters.resource) params.set('resource', filters.resource);
    if (filters.actor) params.set('actor', filters.actor);
    if (filters.program) params.set('program', filters.program);
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    if (filters.limit) params.set('limit', String(filters.limit));
    const qs = params.toString();
    const payload = await this.request<{ data?: AuditTrail }>(
      'GET',
      qs ? `/api/mdx/audit?${qs}` : '/api/mdx/audit',
    );
    const data = payload?.data;
    return {
      events: data?.events ?? [],
      actions: data?.actions ?? [],
      resources: data?.resources ?? [],
      kpis: data?.kpis ?? [],
    };
  }

  /** Correspondence threads for a project. Envelope is { data: CorrespondenceRow[] }. */
  async getCorrespondence(projectId: string | number): Promise<CorrespondenceRow[]> {
    const payload = await this.request<{ data?: CorrespondenceRow[] }>(
      'GET',
      `/api/regulatory-correspondence/correspondence?projectId=${encodeURIComponent(String(projectId))}`,
    );
    return Array.isArray(payload?.data) ? payload!.data! : [];
  }

  /**
   * One correspondence thread with its parsed issues and response packages.
   * Envelope is { data, issues, responsePackages }. GET /correspondence/:id.
   */
  async getCorrespondenceDetail(correspondenceId: string): Promise<CorrespondenceDetail> {
    const payload = await this.request<{
      data?: CorrespondenceRow;
      issues?: CorrespondenceIssue[];
      responsePackages?: Array<Record<string, unknown>>;
    }>(
      'GET',
      `/api/regulatory-correspondence/correspondence/${encodeURIComponent(correspondenceId)}`,
    );
    return {
      data: payload?.data ?? null,
      issues: Array.isArray(payload?.issues) ? payload!.issues! : [],
      responsePackages: Array.isArray(payload?.responsePackages) ? payload!.responsePackages! : [],
    };
  }

  /**
   * Record a human review decision on one parsed issue. Envelope is
   * { data: CorrespondenceIssue }. PATCH /issues/:issueId/review.
   */
  async reviewIssue(issueId: string, payload: ReviewIssuePayload): Promise<CorrespondenceIssue> {
    const result = await this.request<{ data?: CorrespondenceIssue }>(
      'PATCH',
      `/api/regulatory-correspondence/issues/${encodeURIComponent(issueId)}/review`,
      payload,
    );
    return (result?.data ?? {}) as CorrespondenceIssue;
  }

  /** Pending approvals for the current user. Envelope is { approvals: [] }. */
  async getPendingApprovals(): Promise<PendingApproval[]> {
    const payload = await this.request<{ approvals?: PendingApproval[] }>(
      'GET',
      '/api/approval-workflows/pending',
    );
    return Array.isArray(payload?.approvals) ? payload!.approvals! : [];
  }

  /**
   * Approve a pending approval step. The reason captured at signing is stored
   * verbatim as the approval comment. POST /api/approval-workflows/:id/approve.
   */
  async approveWorkflow(approvalId: number | string, comments: string): Promise<WorkflowDecisionResult> {
    return this.request<WorkflowDecisionResult>(
      'POST',
      `/api/approval-workflows/${encodeURIComponent(String(approvalId))}/approve`,
      { comments },
    );
  }

  /**
   * Reject a pending approval step. The server requires a non-empty comment as
   * the rejection reason. POST /api/approval-workflows/:id/reject.
   */
  async rejectWorkflow(approvalId: number | string, comments: string): Promise<WorkflowDecisionResult> {
    return this.request<WorkflowDecisionResult>(
      'POST',
      `/api/approval-workflows/${encodeURIComponent(String(approvalId))}/reject`,
      { comments },
    );
  }
}

const programTabsService = new ProgramTabsService();
export default programTabsService;
