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
 *   - That agent.ana.* row is written through `recordAuditRow`, and the
 *     OUTCOME of the write reaches the caller in `data.agentAuditTrail`
 *     and as a clause on `message` — see `auditNote` below and WO-16C
 *     finding 133.
 *
 * Tools shipped:
 *   - predicate.candidate.set_status
 *   - se_matrix.patch
 */

import { recordAuditRow, type AuditRowOutcome } from '../audit/audit-write-outcome';
import type { CommandContext, CommandResult } from './command-executor';
import { requireGovernedToolGate, mapServiceError, agentAuditDetails } from './mdx-tool-policy';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The clause a handler appends to its own message when the 21 CFR Part 11
 * §11.10(e) row for its `agent.ana.<verb>` action did not reach a durable
 * store.
 *
 * WO-16C finding 133. Each of the three handlers in this file wrote its audit
 * row with `void auditService.logAction({…})`. `logAction` never rejects when
 * persistence fails — that is deliberate policy, an audit-trail outage must not
 * break the user action it records — it RESOLVES an `AuditWriteResult` and
 * reports what happened in `persisted`. Discarding that value left each handler
 * with two possible outcomes and one observable result: the `CommandResult`,
 * the AnA turn built from it and the sentence read back to the regulated user
 * were byte-identical whether the agent-initiated record existed or did not,
 * while the upstream mutation had already been accepted with a 2xx.
 *
 * So the outcome travels twice, because this surface has two kinds of reader:
 * `data.agentAuditTrail` for anything parsing the structure, and this clause in
 * `message` for the conversational turn, which is the only part a chat user
 * ever sees. The upstream mutation is never reverted — reversing a committed
 * governed write because its log row was lost is the worse lie — and the
 * store's own error text never appears here: `recordAuditRow` has already
 * logged it against the action and resource id.
 *
 * The field is `agentAuditTrail`, matching the sibling AnA MDX and PDEV
 * handlers, so this agent-attribution row is never confused with an
 * `auditTrail` a spread service result reports for a row of its own. Each
 * handler here writes exactly one audit row per invocation, so one key per
 * response is unambiguous. It is NOT the only §11.10(e) record of these
 * actions: the BFF route each handler proxies to writes the human-action row
 * (`logProxyMutation` in server/routes/predicate-intelligence.ts,
 * `correspondence.ingest` in server/routes/regulatory-correspondence.ts), so a
 * lost row here costs the AnA attribution, not the whole trail.
 */
function auditNote(outcome: AuditRowOutcome): string {
  return outcome.persisted ? '' : ` ${outcome.message}`;
}

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

    // WO-16C #133: was `void auditService.logAction({…})`, so a status change
    // the shadow service had already accepted — the 2xx from the `proxyToBff`
    // call above — reported `success: true` with no way to tell a recorded
    // agent action from an unrecorded one. This is a log beside a completed
    // mutation, so the status change stands; the outcome now leaves in
    // `data.agentAuditTrail` and in the message clause.
    const agentAuditTrail = await recordAuditRow({
      tenantId: ctx.organizationId,
      userId: ctx.userId,
      action: 'agent.ana.predicate.candidate.status',
      resourceType: 'predicate_candidate',
      resourceId: candidateId,
      details: {
        ...agentAuditDetails(ctx, gate),
        programId,
        status,
      },
    });

    return {
      success: true,
      action,
      data: { ...(proxy.body as Record<string, unknown>), agentAuditTrail },
      message: `Set predicate candidate ${candidateId} status to ${status}.${auditNote(agentAuditTrail)}`,
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

    // WO-16C #133: was `void auditService.logAction({…})`. The SE matrix row
    // has already been patched upstream by the time this runs — the 2xx from
    // the `proxyToBff` call above — and the handler reported the patch
    // identically whether or not the §11.10(e) record of AnA having made it
    // existed. A log beside a completed mutation: the patch stands, and
    // `agentAuditTrail` says whether the agent row is there.
    const agentAuditTrail = await recordAuditRow({
      tenantId: ctx.organizationId,
      userId: ctx.userId,
      action: 'agent.ana.se_matrix.patch',
      resourceType: 'se_matrix_row',
      resourceId: matrixRowId,
      details: {
        ...agentAuditDetails(ctx, gate),
        programId,
        fieldsChanged: Object.keys(patch),
      },
    });

    return {
      success: true,
      action,
      data: { ...(proxy.body as Record<string, unknown>), agentAuditTrail },
      message: `Patched SE matrix row ${matrixRowId}.${auditNote(agentAuditTrail)}`,
    };
  } catch (err) {
    return mapServiceError(action, err);
  }
}

// ─── correspondence.ingest ──────────────────────────────────────────────────

export async function correspondenceIngest(
  ctx: CommandContext,
  params: Record<string, unknown>,
): Promise<CommandResult> {
  const action = 'correspondence.ingest';
  const gate = requireGovernedToolGate(action, ctx, params);
  if (!gate.ok) return gate.result;

  const projectId = Number(params.projectId);
  if (!Number.isFinite(projectId) || projectId <= 0) {
    return { success: false, action, message: 'projectId is required (positive integer).', error: 'INVALID_INPUT' };
  }
  const submissionId = typeof params.submissionId === 'string' ? params.submissionId.trim() : '';
  if (!submissionId) {
    return { success: false, action, message: 'submissionId is required.', error: 'INVALID_INPUT' };
  }
  const subject = typeof params.subject === 'string' ? params.subject.trim() : '';
  if (subject.length < 3) {
    return { success: false, action, message: 'subject is required (≥ 3 chars).', error: 'INVALID_INPUT' };
  }

  // The BFF requires either parsedText or summary with ≥ 8 non-whitespace chars.
  const parsedText = typeof params.parsedText === 'string' ? params.parsedText : null;
  const summary = typeof params.summary === 'string' ? params.summary : null;
  const sourceText = (parsedText ?? summary ?? '').trim();
  if (sourceText.length < 8) {
    return {
      success: false,
      action,
      message: 'parsedText or summary is required (≥ 8 non-whitespace chars).',
      error: 'INVALID_INPUT',
    };
  }

  const body: Record<string, unknown> = {
    projectId,
    submissionId,
    subject,
  };
  if (parsedText !== null) body.parsedText = parsedText;
  if (summary !== null) body.summary = summary;
  for (const k of ['direction', 'sourceChannel', 'communicationType', 'sender', 'recipients',
                   'receivedAt', 'dueDate', 'urgency', 'responseRequired', 'attachments'] as const) {
    if (params[k] !== undefined) body[k] = params[k];
  }

  try {
    const proxy = await proxyToBff(ctx, {
      action,
      method: 'POST',
      path: '/api/regulatory-correspondence/correspondence/intake',
      body,
    });
    if (!proxy.ok) {
      return {
        success: false,
        action,
        message: `Correspondence ingest refused (HTTP ${proxy.status}).`,
        error: proxy.status === 403 ? 'TENANT_ACCESS_DENIED' : 'EXECUTION_FAILED',
        data: proxy.body as Record<string, unknown>,
      };
    }
    const responseBody = proxy.body as Record<string, unknown>;
    const correspondenceId = (responseBody?.data as any)?.id ?? null;

    // WO-16C #133: was `void auditService.logAction({…})`. The correspondence
    // record, its timeline event and its extracted issues are all persisted by
    // the intake route before it answers 201, so by the time this runs the
    // ingest is done — a log beside a completed action, never reverted here.
    // What was missing was any way for the caller to tell an agent ingest that
    // is on the §11.10(e) trail from one that is not.
    const agentAuditTrail = await recordAuditRow({
      tenantId: ctx.organizationId,
      userId: ctx.userId,
      action: 'agent.ana.correspondence.ingest',
      resourceType: 'regulatory_correspondence',
      resourceId: String(correspondenceId ?? `${projectId}:${submissionId}`),
      details: {
        ...agentAuditDetails(ctx, gate),
        projectId,
        submissionId,
        subject,
        issueCount: Array.isArray(responseBody?.issues) ? (responseBody.issues as unknown[]).length : 0,
      },
    });

    return {
      success: true,
      action,
      data: { ...responseBody, agentAuditTrail },
      message: `Ingested correspondence ${correspondenceId ?? '(no-id)'}: ${subject}.${auditNote(agentAuditTrail)}`,
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
  {
    name: 'correspondence.ingest',
    description:
      'Ingest an FDA / regulator communication (AI letter, deficiency, IR, ' +
      'meeting minutes) into the regulatory-correspondence module. Body shape ' +
      'mirrors POST /api/regulatory-correspondence/correspondence/intake. ' +
      'Tenant scope enforced by the BFF. Requires confirm + reason.',
    parameters:
      'projectId, submissionId, subject, parsedText|summary, direction?, urgency?, attachments?, confirm="yes", reason',
    example:
      '"Ingest the FDA AI letter received today on submission K251102, summary attached."',
  },
];

export const MDX_COMMAND_HANDLERS_PHASE3: Record<
  string,
  (ctx: CommandContext, params: Record<string, unknown>) => Promise<CommandResult>
> = {
  'predicate.candidate.set_status': predicateCandidateSetStatus,
  'se_matrix.patch': seMatrixPatch,
  'correspondence.ingest': correspondenceIngest,
};
