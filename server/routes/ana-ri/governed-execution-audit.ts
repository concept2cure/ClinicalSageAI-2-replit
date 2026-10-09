/**
 * The audit rows of a governed action run through POST /api/ana-ri/governed-action
 * (utility.ts): the trace its sign-off row carries, and the row written after it
 * ran (D5/D6, 2026-09-29).
 */
import { recordAuditRow, type AuditRowOutcome } from '../../services/audit/audit-write-outcome.js';
import { canonicalJson, sha256Hex } from '../../services/ana/turn-record.js';
import type { readPendingApproval } from '../../services/ana/run-control.js';

/**
 * What a governed action's audit rows name beside the command (D5/D6): the run
 * and the tool call it answered, the model call that proposed it (the held
 * row's proposedBy, never the body), and a hash of exactly the params a person
 * authorised. The hash is the turn record's canonical one, so the row joins the
 * turn's step. A command posted without its run has no run and no model call.
 */
export function governedActionTrace(
  runId: string,
  toolUseId: string,
  pending: Awaited<ReturnType<typeof readPendingApproval>> | null,
  params: Record<string, unknown>,
) {
  const proposer = pending?.proposedBy ?? null;
  return {
    runId: runId || null,
    toolUseId: toolUseId || null,
    gatewayRequestId: proposer?.requestId ?? null,
    servingModel: proposer ? { provider: proposer.provider, model: proposer.model } : null,
    paramsSha256: sha256Hex(canonicalJson(params ?? {})),
  };
}

/**
 * The row written after a governed action ran: what came of it, how long it
 * took, and a hash of the result, beside the sign-off's trace. Until 2026-09-29
 * only the sign-off was written, before execution, so the trail could not tell
 * an action that ran from one that failed (MCP records both:
 * server/mcp/tools/runtime.ts). A command its own gate refused is 'refused'.
 */
export async function recordGovernedExecution(
  row: {
    organizationId: number;
    userId: number;
    command: string;
    trace: ReturnType<typeof governedActionTrace>;
    startedAt: number;
  },
  came: { result?: unknown; error?: string },
): Promise<AuditRowOutcome> {
  const refused = (came.result as { success?: unknown } | null | undefined)?.success === false;
  const outcome = came.error ? 'failed' : refused ? 'refused' : 'ok';
  return recordAuditRow({
    tenantId: row.organizationId,
    userId: row.userId,
    action: 'ana.governed_action.executed',
    resourceType: 'ana_command',
    resourceId: row.command,
    details: {
      command: row.command,
      ...row.trace,
      outcome,
      durationMs: Date.now() - row.startedAt,
      ...(came.error ? { error: came.error.slice(0, 500) } : { resultSha256: sha256Hex(canonicalJson(came.result ?? null)) }),
    },
  });
}

/** The action's result, carrying the lost-row notice when its executed row did not persist. */
export function withAuditTrail(result: unknown, executed: AuditRowOutcome): unknown {
  if (executed.persisted) return result;
  if (result && typeof result === 'object' && !Array.isArray(result)) return { ...result, auditTrail: executed };
  return { result, auditTrail: executed };
}
