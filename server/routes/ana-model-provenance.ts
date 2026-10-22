import type { Request } from 'express';
import { createHash } from 'crypto';
import { createScopedLogger } from '../utils/logger';
import { resolveOrgId, resolveUserId } from '../types/auth-request.js';
import type { AuditRowOutcome } from '../services/audit/audit-write-outcome';

const logger = createScopedLogger('ana-intelligence');

export async function recordModelProvenance(params: {
  req: Request;
  surface: string;
  model: string | undefined;
  content: string | undefined;
  usage?: { inputTokens?: number; outputTokens?: number };
}): Promise<AuditRowOutcome> {
  try {
    const { recordAuditRow } = await import('../services/audit/audit-write-outcome');
    const organizationId = resolveOrgId(params.req) ?? undefined;
    const userId = resolveUserId(params.req) ?? undefined;
    return await recordAuditRow({
      tenantId: organizationId,
      userId,
      action: 'ai_generation',
      resourceType: 'ai_drafting_surface',
      resourceId: params.surface,
      details: {
        model: params.model || 'unknown',
        contentSha256: params.content
          ? createHash('sha256').update(params.content).digest('hex')
          : null,
        inputTokens: params.usage?.inputTokens ?? null,
        outputTokens: params.usage?.outputTokens ?? null,
      },
    });
  } catch {
    // The canonical writer contains store failures. This arm also contains an
    // unexpected lazy-module load failure after generation has already happened.
    return unavailableModelProvenance(params.surface);
  }
}

export function unavailableModelProvenance(surface: string): AuditRowOutcome {
  logger.warn('Model provenance audit unavailable', { action: 'ai_generation', surface, code: 'AUDIT_ROW_NOT_PERSISTED' });
  return {
    persisted: false,
    code: 'AUDIT_ROW_NOT_PERSISTED',
    message: 'The audit entry for this generation could not be written. The generated output is available. This has been logged for follow-up.',
  };
}

