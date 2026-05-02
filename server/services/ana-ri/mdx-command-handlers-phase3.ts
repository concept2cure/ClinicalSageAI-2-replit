/**
 * AnA MDX command handlers — phase 3.
 *
 * Predicate-intelligence proxy tools. The underlying mutation lives in
 * the Python shadow service; the BFF (`/api/predicate-intelligence/*`)
 * already proxies + reflects to the central audit_logs on 2xx via the
 * `logProxyMutation` helper there. These handlers internal-fetch the
 * BFF endpoint with a service token, which keeps the proxy-logging
 * path centralized in one place (the BFF route file).
 *
 * Audit emission:
 *   - The BFF's `logProxyMutation` writes the human-action audit row
 *     under `predicate.candidate.status` / `se_matrix.patch`.
 *   - This handler ALSO writes a separate row under
 *     `agent.ana.predicate.candidate.status` etc. so the cross-cutting
 *     audit-contract test sees an agent.ana.* row per tool.
 *
 * Tools shipped:
 *   - predicate.candidate.set_status
 *   - se_matrix.patch
 */

import auditService from '../auditService';
import type { CommandContext, CommandResult } from './command-executor';
import { requireGovernedToolGate, mapServiceError } from './mdx-tool-policy';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ALLOWED_CANDIDATE_STATUSES = new Set<string>([
  'shortlisted',
  'rejected',
  'primary',
  'reference',
  'considering',
]);

function getInternalUrl(): string {
  return process.env.INTERNAL_BFF_URL || 'http://localhost:3000';
}

function getServiceToken(): string {
  return process.env.ANA_SERVICE_TOKEN || '';
}

interface ProxyArgs {
  action: string;
  method: 'PATCH' | 'POST';
  path: string;
  query?: Record<string, string>;
  body?: unknown;
}

async function proxyToBff(
  ctx: CommandContext,
  args: ProxyArgs,
): Promise<{ ok: boolean; status: number; body: unknown; error?: string }> {
  const url = new URL(args.path, getInternalUrl());
  if (args.query) {
    for (const [k, v] of Object.entries(args.query)) url.searchParams.set(k, v);
  }
  const token = getServiceToken();
  if (!token) {
    return { ok: false, status: 503, body: null, error: 'ANA_SERVICE_TOKEN not configured' };
  }
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: args.method,
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Token': token,
        'X-Tenant-Id': String(ctx.organizationId),
        'X-User-Id': String(ctx.userId),
      },
      body: args.body !== undefined ? JSON.stringify(args.body) : undefined,
    });
  } catch (err) {
    return {
      ok: false,
      status: 502,
      body: null,
      error: err instanceof Error ? err.message : 'fetch failed',
    };
  }
  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    parsed = null;
  }
  return { ok: res.ok, status: res.status, body: parsed };
}

// ─── predicate.candidate.set_status ─────────────────────────────────────────

export async function predicateCandidateSetStatus(
  ctx: CommandContext,
  params: Record<string, unknown>,
): Promise<CommandResult> {
  const action = 'predicate.candidate.set_status';
  const gate = requireGovernedToolGate(action, ctx, params);
  if (!gate.ok) return gate.result;

  const candidateId = typeof params.candidateId === 'string' ? params.candidateId : '';
  if (!candidateId) {
    return {
      success: false,
      action,
      message: 'candidateId is required.',
      error: 'INVALID_INPUT',
    };
  }
  const programId = typeof params.programId === 'string' ? params.programId : '';
  if (!UUID_RE.test(programId)) {
    return {
      success: false,
      action,
      message: 'programId must be a UUID.',
      error: 'INVALID_INPUT',
    };
  }
  const status = typeof params.status === 'string' ? params.status.toLowerCase() : '';
  if (!ALLOWED_CANDIDATE_STATUSES.has(status)) {
    return {
      success: false,
      action,
      message: `status must be one of: ${[...ALLOWED_CANDIDATE_STATUSES].join(', ')}.`,
      error: 'INVALID_INPUT',
    };
  }

  try {
    const proxy = await proxyToBff(ctx, {
      action,
      method: 'PATCH',
      path: `/api/predicate-intelligence/candidates/${encodeURIComponent(candidateId)}/status`,
      query: { program_id: programId },
      body: { status, reason: gate.reason },
    });

    if (!proxy.ok) {
      return {
        success: false,
        action,
        message: `Predicate status update refused (HTTP ${proxy.status}).`,
        error: proxy.status === 403 ? 'TENANT_ACCESS_DENIED' : 'EXECUTION_FAILED',
        data: proxy.body as Record<string, unknown>,
      };
    }

    void auditService.logAction({
      tenantId: ctx.organizationId,
      userId: ctx.userId,
      action: 'agent.ana.predicate.candidate.status',
      resourceType: 'predicate_candidate',
      resourceId: candidateId,
      details: {
        actorKind: 'agent:ana',
        agentReason: gate.reason,
        programId,
        status,
      },
    });

    return {
      success: true,
      action,
      data: proxy.body as Record<string, unknown>,
      message: `Set predicate candidate ${candidateId} status to ${status}.`,
    };
  } catch (err) {
    return mapServiceError(action, err);
  }
}

// ─── se_matrix.patch ────────────────────────────────────────────────────────

export async function seMatrixPatch(
  ctx: CommandContext,
  params: Record<string, unknown>,
): Promise<CommandResult> {
  const action = 'se_matrix.patch';
  const gate = requireGovernedToolGate(action, ctx, params);
  if (!gate.ok) return gate.result;

  const matrixRowId = typeof params.matrixRowId === 'string' ? params.matrixRowId : '';
  if (!matrixRowId) {
    return {
      success: false,
      action,
      message: 'matrixRowId is required.',
      error: 'INVALID_INPUT',
    };
  }
  const programId = typeof params.programId === 'string' ? params.programId : '';
  if (!UUID_RE.test(programId)) {
    return {
      success: false,
      action,
      message: 'programId must be a UUID.',
      error: 'INVALID_INPUT',
    };
  }
  const patch = (params.patch && typeof params.patch === 'object' ? params.patch : null) as
    | Record<string, unknown>
    | null;
  if (!patch) {
    return {
      success: false,
      action,
      message: 'patch (object) is required.',
      error: 'INVALID_INPUT',
    };
  }

  try {
    const proxy = await proxyToBff(ctx, {
      action,
      method: 'PATCH',
      path: `/api/predicate-intelligence/se-matrix/${encodeURIComponent(matrixRowId)}`,
      query: { program_id: programId },
      body: { ...patch, reason: gate.reason },
    });

    if (!proxy.ok) {
      return {
        success: false,
        action,
        message: `SE matrix patch refused (HTTP ${proxy.status}).`,
        error: proxy.status === 403 ? 'TENANT_ACCESS_DENIED' : 'EXECUTION_FAILED',
        data: proxy.body as Record<string, unknown>,
      };
    }

    void auditService.logAction({
      tenantId: ctx.organizationId,
      userId: ctx.userId,
      action: 'agent.ana.se_matrix.patch',
      resourceType: 'se_matrix_row',
      resourceId: matrixRowId,
      details: {
        actorKind: 'agent:ana',
        agentReason: gate.reason,
        programId,
        fieldsChanged: Object.keys(patch),
      },
    });

    return {
      success: true,
      action,
      data: proxy.body as Record<string, unknown>,
      message: `Patched SE matrix row ${matrixRowId}.`,
    };
  } catch (err) {
    return mapServiceError(action, err);
  }
}

// ─── Metadata ───────────────────────────────────────────────────────────────

export const MDX_COMMAND_METADATA_PHASE3 = [
  {
    name: 'predicate.candidate.set_status',
    description:
      'Update a predicate candidate row in the predicate-intelligence ' +
      'shadow service via the BFF proxy. Tenant scope is enforced by the ' +
      'BFF. Requires confirm + reason.',
    parameters:
      'candidateId, programId (UUID), status (shortlisted|rejected|primary|reference|considering), confirm="yes", reason',
    example:
      '"Mark predicate candidate K212284 as primary on program OR-801."',
  },
  {
    name: 'se_matrix.patch',
    description:
      'Patch a Substantial Equivalence matrix row in the predicate-' +
      'intelligence shadow service via the BFF proxy. Requires confirm + reason.',
    parameters: 'matrixRowId, programId (UUID), patch (object), confirm="yes", reason',
    example:
      '"Patch SE matrix row m-12 to mark trend-arrow technology difference as resolved."',
  },
];

export const MDX_COMMAND_HANDLERS_PHASE3: Record<
  string,
  (ctx: CommandContext, params: Record<string, unknown>) => Promise<CommandResult>
> = {
  'predicate.candidate.set_status': predicateCandidateSetStatus,
  'se_matrix.patch': seMatrixPatch,
};
