/** Request-only context adapters for the existing legacy drafting endpoints. */
import type { Request } from 'express';
import type { DocumentDraftRequest } from '../services/ana/AnaDocumentDraftingService';
import { requestPgClient } from '../db/requestDb.js';
import { AnaProjectScopeError } from '../services/ana/project-scope-admission';
import { looksLikeProgramUuid, parseIntegerProjectId } from '../lib/project-id';
import { classifyGatewayError, isGatewayError } from '../services/ai-gateway/gateway-error-map';

/** Explicit scope cannot degrade into a general draft or a UUID's integer prefix. */
export function selectedDraftProject(body: unknown): string | number | undefined {
  const input = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  const stated = [input.projectRef, input.projectId, input.project_id]
    .filter(value => value !== undefined && value !== null && value !== '');
  const refs = stated.map(value => {
    const integer = parseIntegerProjectId(value);
    if (integer !== null) return integer;
    if (looksLikeProgramUuid(value)) return String(value).trim().toLowerCase();
    throw new AnaProjectScopeError(400, 'ANA_PROJECT_SCOPE_INVALID', 'Choose a valid project identifier.');
  });
  if (new Set(refs).size > 1) {
    throw new AnaProjectScopeError(400, 'ANA_PROJECT_SCOPE_MISMATCH', 'The project identifiers do not refer to the same project.');
  }
  return refs[0];
}

export function draftProjectOptions(req: Request, projectId: string | number | undefined): Pick<DocumentDraftRequest, 'projectId' | 'contextSqlClient'> {
  if (projectId === undefined) return {};
  try {
    return { projectId, contextSqlClient: requestPgClient(req) };
  } catch {
    throw new AnaProjectScopeError(503, 'DRAFT_PRODUCT_CONTEXT_UNAVAILABLE', 'Recorded product context could not be read. Nothing was drafted.');
  }
}

/** Headers may already be committed; retain typed scope status in the SSE event. */
export function draftStreamFailure(error: unknown): { type: 'error'; code: string; error: string; status?: number } {
  if (error instanceof AnaProjectScopeError) {
    return { type: 'error', code: error.code, status: error.status, error: error.message };
  }
  const failure = isGatewayError(error)
    ? classifyGatewayError(error)
    : { code: 'INTERNAL_ERROR', message: 'Drafting failed. The problem has been logged.' };
  return { type: 'error', code: failure.code, error: failure.message };
}
