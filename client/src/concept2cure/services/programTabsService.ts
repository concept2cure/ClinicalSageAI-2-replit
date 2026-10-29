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

import type { CommRow } from '../v2/surfaces/AgencyInbox';
import { apiRequest, serverMessage, type ApiRequestMethod } from '../../lib/queryClient';

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
  /** The row's real `sha256_chain` value; '' when the row was written outside
   *  the chain (see `chain`). Never synthesized. */
  sha: string;
  /** Always '' for audit_logs rows: the chain is global across tenants, so the
   *  predecessor is not this tenant's to show. `prevAvailable` states it. */
  prev: string;
  prevAvailable?: boolean;
  /** Real per-row integrity: 'sealed' (chained + HMAC), 'chained', or
   *  'unchained' — a row that reached the table outside the chain writer. */
  chain: 'sealed' | 'chained' | 'unchained' | string;
}

/** Honest integrity summary for the audit window (GET /api/mdx/audit). */
export interface AuditIntegrity {
  total: number;
  sealed: number;
  chained: number;
  unchained: number;
  /** 'global' — one chain across all tenants, not one per organization. */
  chainScope: string;
  /** False when the chain cannot be walked from a tenant-scoped read. */
  verifiableHere: boolean;
  note: string | null;
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
  /** Absent on fixture/sample data, which carries no real integrity claim. */
  integrity?: AuditIntegrity;
}

export interface AuditFilters {
  action?: string;
  resource?: string;
  /** One record's own trail (exact audit_logs.record_id). */
  record?: string;
  actor?: string;
  /** Program anchor — the canonical project id, ILIKE-matched server-side. */
  program?: string;
  from?: string;
  to?: string;
  limit?: number;
}

/**
 * A letter in the project's agency inbox, the canonical correspondence record
 * (GET /api/concept2cure/projects/:projectId/agency-communications; P-39 step 3,
 * S2). The device screens read the same letters Communication holds; a letter's
 * questions, responses and signed approvals are worked there.
 */
export type InboxLetterRow = Pick<CommRow, 'id' | 'communicationType' | 'sourceChannel' | 'receivedDate' | 'dueDate'
  | 'closureStatus' | 'humanReviewStatus' | 'extractedIssues' | 'responseRequired'>;

/** A pending approval workflow instance (GET /api/approval-workflows/pending). */
export interface PendingApproval {
  id: number | string;
  [key: string]: unknown;
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
      // A 2xx body that still carries an `error` field. The string form of that
      // field was thrown as-is, so an envelope of { error: '<CODE>', message:
      // '<a real sentence>' } reached every tab as the literal token — the
      // nested `message` was only consulted when `error` was an object. The
      // envelope reader takes the sentence wherever the server put it and
      // refuses both enum tokens and infrastructure text; this service's own
      // wording stays as the fallback.
      throw new Error(serverMessage(payload) ?? 'Program-tabs request failed');
    }
    return payload as T;
  }

  /** Audit trail. Envelope is api-response.ok → { data: AuditTrail }. */
  async getAuditTrail(filters: AuditFilters = {}): Promise<AuditTrail> {
    const params = new URLSearchParams();
    if (filters.action) params.set('action', filters.action);
    if (filters.resource) params.set('resource', filters.resource);
    if (filters.record) params.set('record', filters.record);
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

  /**
   * The project's agency inbox (P-39 step 3, S2). The route takes the program
   * id the device screens hold and admits the reader to its project. Envelope
   * is { success, data: CommRow[] }.
   */
  async getCorrespondence(projectId: string | number): Promise<InboxLetterRow[]> {
    const payload = await this.request<{ data?: InboxLetterRow[] }>(
      'GET',
      `/api/concept2cure/projects/${encodeURIComponent(String(projectId))}/agency-communications`,
    );
    return Array.isArray(payload?.data) ? payload!.data! : [];
  }

  /** Pending approvals for the current user. Envelope is { approvals: [] }. */
  async getPendingApprovals(): Promise<PendingApproval[]> {
    const payload = await this.request<{ approvals?: PendingApproval[] }>(
      'GET',
      '/api/approval-workflows/pending',
    );
    return Array.isArray(payload?.approvals) ? payload!.approvals! : [];
  }


}

const programTabsService = new ProgramTabsService();
export default programTabsService;
