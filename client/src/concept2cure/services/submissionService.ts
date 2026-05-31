/**
 * @fileoverview Submission Gateway Service
 * @module concept2cure/services/submissionService
 * @version 1.0.0
 *
 * @description
 * Live service for the submission gateway workstream — the "press send to the
 * agency" layer over FDA ESG, EMA CESP, EUDAMED, and PMDA Gateway. This is the
 * transmittal / acknowledgement / pre-flight-findings surface, distinct from
 * the package + section + readiness management that the existing 'submissions'
 * layoutMode already owns via /api/submission-ops/*. This service does NOT
 * touch package management — it only drives transmittals and their findings.
 *
 * Binds to server/routes/mdx-submission-gateway.ts, mounted at /api/mdx
 * (server/bootstrap/register-inline-routes.ts → app.use('/api/mdx', …)):
 *   GET    /api/mdx/gateways                              list + per-org config status
 *   GET    /api/mdx/gateways/transmittals                 list transmittals
 *   GET    /api/mdx/gateways/transmittals/:id             single transmittal + findings
 *   POST   /api/mdx/gateways/:region/:gateway/transmit    transmit a package
 *   GET    /api/mdx/gateways/transmittals/:id/status      poll latest status
 *   GET    /api/mdx/gateways/transmittals/:id/ack         download ack (text/plain)
 *   POST   /api/mdx/gateways/transmittals/:id/findings    record validator finding
 *   PATCH  /api/mdx/gateways/findings/:findingId/resolve  resolve a finding
 *
 * Scoping: every gateway route resolves the org id server-side from
 * req.user.organizationId (numeric). There is no client-supplied org param —
 * unlike taskingService, this service does NOT send organizationId. The
 * optional program filter is a UUID (submission_transmittals.program_id); the
 * canonical concept2cure project id space is non-numeric and is not a UUID, so
 * it is only threaded when a real UUID program id is available (otherwise the
 * list is org-wide, which is the correct default for this surface).
 *
 * All responses use the canonical { data, meta? } envelope.
 */

import { apiRequest, type ApiRequestMethod } from '../../lib/queryClient';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES — mirror submission_transmittals + submission_validation_findings rows
// and the gateway descriptor / status results from
// server/services/submission-gateways/types.ts.
// ═══════════════════════════════════════════════════════════════════════════════

export type Region = 'fda' | 'ema' | 'pmda';

export type GatewayName = 'esg' | 'cesp' | 'eudamed' | 'pmda_gateway';

export type SubmissionFormat = 'ectd' | 'estar' | 'eudamed_register' | 'pmda_ectd';

export type Transport = 'as2' | 'sftp' | 'rest' | 'soap';

export type SubmissionStatus =
  | 'pending'
  | 'in_transit'
  | 'received'
  | 'rejected'
  | 'ack1_received'
  | 'ack2_received'
  | 'ack3_received'
  | 'validation_passed'
  | 'validation_failed'
  | 'review_started'
  | 'response_required'
  | 'completed'
  | string;

export type FindingSeverity = 'error' | 'warning' | 'info' | string;

/** A gateway descriptor with its per-org configuration status. */
export interface Gateway {
  region: Region;
  gateway: GatewayName;
  transport: string;
  configured: boolean;
  environment: 'staging' | 'production';
}

/** A pre-flight / post-receipt validation finding on a transmittal. */
export interface ValidationFinding {
  id: number;
  transmittalId: number;
  organizationId: number;
  validator: string | null;
  severity: FindingSeverity;
  ruleId: string | null;
  ruleTitle: string | null;
  message: string;
  filePath: string | null;
  lineNumber: number | null;
  resolved: boolean;
  resolvedAt: string | null;
  resolvedBy: number | null;
  resolutionNote: string | null;
  createdAt?: string;
  [key: string]: unknown;
}

/** A transmittal row — one transmission attempt to one gateway. */
export interface Transmittal {
  id: number;
  organizationId: number;
  programId: string | null;
  packageId: number | null;
  region: Region | string;
  gateway: GatewayName | string;
  format: SubmissionFormat | string | null;
  submissionType: string | null;
  transport: Transport | string | null;
  transmissionId: string | null;
  status: SubmissionStatus;
  httpStatus: number | null;
  errorClass: string | null;
  errorMessage: string | null;
  bundleSizeBytes: number | null;
  submittedBy: number | null;
  submittedAt: string | null;
  ackReceivedAt: string | null;
  completedAt: string | null;
  metadata: Record<string, unknown> | null;
  /** Present only on the single-transmittal endpoint. */
  findings?: ValidationFinding[];
  [key: string]: unknown;
}

export interface GatewayStatusResult {
  transmittalId: number;
  transmissionId: string;
  status: SubmissionStatus;
  ackLevel?: 1 | 2 | 3;
  ackReceivedAt: string | null;
  rawResponse?: unknown;
}

export interface TransmittalFilter {
  /** Program UUID (submission_transmittals.program_id). */
  programId?: string;
  region?: Region;
  status?: string;
  limit?: number;
}

export interface TransmitInput {
  region: Region;
  gateway: GatewayName;
  programId?: string | null;
  packageId?: number | null;
  environment?: 'staging' | 'production';
  submissionType?: string;
  bundle: {
    path: string;
    sha256: string;
    sizeBytes: number;
    format: SubmissionFormat;
    displayName?: string;
  };
  metadata?: Record<string, unknown>;
  /** Reason-for-change, required by the governed transmit route (min 8 chars). */
  reason: string;
  /** Re-auth credentials; the server re-verifies the signer (high-risk sign). */
  reauth: { password: string; totp?: string };
}

// The DB returns snake_case columns; normalise to the camelCase shapes above so
// surfaces read a single consistent contract.
function pick<T = unknown>(row: Record<string, unknown>, ...keys: string[]): T {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null) return row[k] as T;
  }
  return (row[keys[0]] ?? null) as T;
}

function adaptTransmittal(row: Record<string, unknown>): Transmittal {
  return {
    ...(row as Transmittal),
    id: Number(pick(row, 'id')),
    organizationId: Number(pick(row, 'organization_id', 'organizationId')),
    programId: pick(row, 'program_id', 'programId'),
    packageId: (() => {
      const v = pick(row, 'package_id', 'packageId');
      return v == null ? null : Number(v);
    })(),
    region: pick(row, 'region'),
    gateway: pick(row, 'gateway'),
    format: pick(row, 'format'),
    submissionType: pick(row, 'submission_type', 'submissionType'),
    transport: pick(row, 'transport'),
    transmissionId: pick(row, 'transmission_id', 'transmissionId'),
    status: pick(row, 'status'),
    httpStatus: (() => {
      const v = pick(row, 'http_status', 'httpStatus');
      return v == null ? null : Number(v);
    })(),
    errorClass: pick(row, 'error_class', 'errorClass'),
    errorMessage: pick(row, 'error_message', 'errorMessage'),
    bundleSizeBytes: (() => {
      const v = pick(row, 'bundle_size_bytes', 'bundleSizeBytes');
      return v == null ? null : Number(v);
    })(),
    submittedBy: (() => {
      const v = pick(row, 'submitted_by', 'submittedBy');
      return v == null ? null : Number(v);
    })(),
    submittedAt: pick(row, 'submitted_at', 'submittedAt'),
    ackReceivedAt: pick(row, 'ack_received_at', 'ackReceivedAt'),
    completedAt: pick(row, 'completed_at', 'completedAt'),
    metadata: (pick(row, 'metadata') as Record<string, unknown> | null) ?? null,
    findings: Array.isArray(row.findings)
      ? (row.findings as Record<string, unknown>[]).map(adaptFinding)
      : undefined,
  };
}

function adaptFinding(row: Record<string, unknown>): ValidationFinding {
  return {
    ...(row as ValidationFinding),
    id: Number(pick(row, 'id')),
    transmittalId: Number(pick(row, 'transmittal_id', 'transmittalId')),
    organizationId: Number(pick(row, 'organization_id', 'organizationId')),
    validator: pick(row, 'validator'),
    severity: (pick(row, 'severity') as FindingSeverity) ?? 'info',
    ruleId: pick(row, 'rule_id', 'ruleId'),
    ruleTitle: pick(row, 'rule_title', 'ruleTitle'),
    message: (pick(row, 'message') as string) ?? '',
    filePath: pick(row, 'file_path', 'filePath'),
    lineNumber: (() => {
      const v = pick(row, 'line_number', 'lineNumber');
      return v == null ? null : Number(v);
    })(),
    resolved: Boolean(pick(row, 'resolved')),
    resolvedAt: pick(row, 'resolved_at', 'resolvedAt'),
    resolvedBy: (() => {
      const v = pick(row, 'resolved_by', 'resolvedBy');
      return v == null ? null : Number(v);
    })(),
    resolutionNote: pick(row, 'resolution_note', 'resolutionNote'),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class SubmissionService {
  private baseUrl = '/api/mdx/gateways';

  private async request<T>(method: ApiRequestMethod, url: string, body?: unknown): Promise<T> {
    const response = await apiRequest(method, url, body);
    if (response.status === 204) {
      return undefined as T;
    }
    const payload = await response.json().catch(() => ({}));
    // Canonical { data, meta } envelope — surface the error envelope if present.
    if (payload?.error) {
      const err = payload.error;
      throw new Error(typeof err === 'string' ? err : err?.message || 'Submission request failed');
    }
    return payload as T;
  }

  /** List every gateway with its per-org configuration status. */
  async listGateways(environment: 'staging' | 'production' = 'production'): Promise<Gateway[]> {
    const payload = await this.request<{ data?: Record<string, unknown>[] }>(
      'GET',
      `${this.baseUrl}?environment=${environment}`,
    );
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    return rows.map((g) => ({
      region: g.region as Region,
      gateway: g.gateway as GatewayName,
      transport: String(g.transport ?? ''),
      configured: Boolean(g.configured),
      environment: (g.environment as 'staging' | 'production') ?? environment,
    }));
  }

  /** List transmittals, most-recent first. Org-scoped server-side. */
  async listTransmittals(filter: TransmittalFilter = {}): Promise<Transmittal[]> {
    const params = new URLSearchParams();
    if (filter.programId) params.set('program_id', filter.programId);
    if (filter.region) params.set('region', filter.region);
    if (filter.status) params.set('status', filter.status);
    params.set('limit', String(filter.limit ?? 100));
    const payload = await this.request<{ data?: Record<string, unknown>[] }>(
      'GET',
      `${this.baseUrl}/transmittals?${params.toString()}`,
    );
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    return rows.map(adaptTransmittal);
  }

  /** Single transmittal with its validation findings. */
  async getTransmittal(id: number): Promise<Transmittal | null> {
    const payload = await this.request<{ data?: Record<string, unknown> }>(
      'GET',
      `${this.baseUrl}/transmittals/${id}`,
    );
    return payload?.data ? adaptTransmittal(payload.data) : null;
  }

  /** Poll the gateway for the live status of a transmittal. */
  async getStatus(id: number): Promise<GatewayStatusResult | null> {
    const payload = await this.request<{ data?: GatewayStatusResult }>(
      'GET',
      `${this.baseUrl}/transmittals/${id}/status`,
    );
    return payload?.data ?? null;
  }

  /** Transmit a package through a region's gateway. */
  async transmit(input: TransmitInput): Promise<Transmittal> {
    const { region, gateway, ...body } = input;
    const payload = await this.request<{ data: Record<string, unknown> }>(
      'POST',
      `${this.baseUrl}/${region}/${gateway}/transmit`,
      {
        programId: body.programId ?? null,
        packageId: body.packageId ?? null,
        environment: body.environment ?? 'production',
        submissionType: body.submissionType,
        bundle: body.bundle,
        metadata: body.metadata,
        reason: body.reason,
        reauth: body.reauth,
      },
    );
    return adaptTransmittal(payload.data);
  }

  /** Resolve a validation finding. */
  async resolveFinding(findingId: number, resolutionNote?: string): Promise<ValidationFinding> {
    const payload = await this.request<{ data: Record<string, unknown> }>(
      'PATCH',
      `${this.baseUrl}/findings/${findingId}/resolve`,
      { resolutionNote },
    );
    return adaptFinding(payload.data);
  }
}

const submissionService = new SubmissionService();
export default submissionService;
