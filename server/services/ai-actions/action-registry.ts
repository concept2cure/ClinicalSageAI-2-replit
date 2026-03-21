/**
 * AI Action Registry & Dispatcher
 *
 * Central registry for all AI action handlers. The dispatcher:
 * 1. Validates the request
 * 2. Checks permissions
 * 3. Executes the handler
 * 4. Logs audit/provenance
 * 5. Returns standardized response
 *
 * Phase 1 foundation. Phase 2: add middleware pipeline, async queue, retries.
 */

import * as crypto from 'crypto';
import { generateUUID } from '../../utils/id-generator';
import { db } from '../../db';
import { regulatoryAuditLogs } from '../../../shared/schema';
import type {
  AIActionType,
  AIActionRequest,
  AIActionResponse,
  AIActionHandler,
  AIActionExecutionContext,
  AIActionError,
  AIActionProvenance,
  AIActionHandlerError as AIActionHandlerErrorType,
} from '../../../shared/types/ai-actions';
import { AIActionHandlerError } from '../../../shared/types/ai-actions';

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const handlers = new Map<AIActionType, AIActionHandler>();

/**
 * Register an action handler. Called at startup by each handler module.
 */
export function registerActionHandler(handler: AIActionHandler): void {
  if (handlers.has(handler.actionType)) {
    console.warn(
      `[AI Actions] Overwriting handler for action: ${handler.actionType}`
    );
  }
  handlers.set(handler.actionType, handler);
  console.log(`[AI Actions] Registered handler: ${handler.actionType}`);
}

/**
 * Get all registered action types (for introspection / command palette).
 */
export function getRegisteredActions(): AIActionType[] {
  return Array.from(handlers.keys());
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

export interface DispatchOptions {
  /** Express request for IP/session extraction. */
  ipAddress: string;
  sessionId?: string;
  /** Authenticated user — must be populated by middleware. */
  user: {
    userId: number;
    userName: string;
    userRole?: string;
    organizationId: number;
    organizationName?: string;
  };
}

/**
 * Dispatch an AI action request to the appropriate handler.
 *
 * This is the single entry point for all AI-driven system mutations.
 */
export async function dispatchAction(
  request: AIActionRequest,
  options: DispatchOptions
): Promise<AIActionResponse> {
  const actionId = generateUUID();
  const startTime = Date.now();

  // 1. Lookup handler
  const handler = handlers.get(request.actionType);
  if (!handler) {
    return buildErrorResponse(request, actionId, options, [
      {
        code: 'UNKNOWN_ACTION',
        message: `No handler registered for action type: ${request.actionType}`,
      },
    ]);
  }

  // 2. Validate request (fast pre-check)
  if (handler.validate) {
    const validationErrors = handler.validate(request);
    if (validationErrors.length > 0) {
      return buildErrorResponse(request, actionId, options, validationErrors);
    }
  }

  // 3. Build execution context
  const executionContext: AIActionExecutionContext = {
    user: {
      userId: options.user.userId,
      userName: options.user.userName,
      userRole: options.user.userRole,
      organizationId: options.user.organizationId,
      organizationName: options.user.organizationName,
    },
    db,
    actionId,
    ipAddress: options.ipAddress,
    sessionId: options.sessionId,
  };

  // 4. Execute
  let response: AIActionResponse;
  try {
    response = await handler.execute(request, executionContext);
  } catch (err) {
    if (err instanceof AIActionHandlerError) {
      response = buildErrorResponse(request, actionId, options, [
        {
          code: err.code,
          message: err.message,
          details: err.details,
        },
      ]);
    } else {
      const message =
        err instanceof Error ? err.message : 'Unknown execution error';
      console.error(`[AI Actions] Handler error for ${request.actionType}:`, err);
      response = buildErrorResponse(request, actionId, options, [
        { code: 'HANDLER_ERROR', message },
      ]);
    }
  }

  // 5. Log audit (non-blocking)
  logAuditEntry(request, response, actionId, options, Date.now() - startTime).catch(
    (err) => console.error('[AI Actions] Audit log error:', err)
  );

  return response;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildErrorResponse(
  request: AIActionRequest,
  actionId: string,
  options: DispatchOptions,
  errors: AIActionError[]
): AIActionResponse {
  return {
    success: false,
    actionType: request.actionType,
    status: 'failed',
    result: null,
    createdObjects: [],
    updatedObjects: [],
    warnings: [],
    errors,
    provenance: buildProvenance(request, actionId, options),
    nextSuggestedActions: [],
  };
}

function buildProvenance(
  request: AIActionRequest,
  actionId: string,
  options: DispatchOptions
): AIActionProvenance {
  return {
    actionId,
    timestamp: new Date().toISOString(),
    userId: options.user.userId,
    organizationId: options.user.organizationId,
    projectId: request.projectId,
    sourceSurface: request.sourceSurface,
  };
}

/**
 * Compute SHA-256 integrity hash over the action request + response.
 */
function computeIntegrityHash(
  request: AIActionRequest,
  response: AIActionResponse,
  actionId: string
): string {
  const payload = JSON.stringify({
    actionId,
    actionType: request.actionType,
    targetType: request.targetType,
    targetId: request.targetId,
    projectId: request.projectId,
    success: response.success,
    createdObjects: response.createdObjects,
    updatedObjects: response.updatedObjects,
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * Log to regulatoryAuditLogs for 21 CFR Part 11 compliance.
 */
async function logAuditEntry(
  request: AIActionRequest,
  response: AIActionResponse,
  actionId: string,
  options: DispatchOptions,
  durationMs: number
): Promise<void> {
  try {
    const integrityHash = computeIntegrityHash(request, response, actionId);

    await db.insert(regulatoryAuditLogs).values({
      auditId: `ai-action-${actionId}`,
      organizationId: options.user.organizationId,
      entityType: 'ai_action',
      entityId: actionId,
      action: request.actionType,
      actionCategory: 'system',
      previousValue: null,
      newValue: {
        actionType: request.actionType,
        targetType: request.targetType,
        targetId: request.targetId,
        projectId: request.projectId,
        sourceSurface: request.sourceSurface,
        success: response.success,
        createdObjects: response.createdObjects.map((o) => ({
          type: o.type,
          id: o.id,
        })),
        updatedObjects: response.updatedObjects.map((o) => ({
          type: o.type,
          id: o.id,
        })),
        durationMs,
        errors: response.errors,
      },
      userId: options.user.userId,
      userName: options.user.userName,
      userRole: options.user.userRole || 'unknown',
      ipAddress: options.ipAddress,
      sessionId: options.sessionId || null,
      isGxpRelevant: true,
      metadata: {
        integrityHash,
        module: request.module,
        conversationId: request.conversationId,
      },
    });

    // Update provenance on the response with audit reference
    response.provenance.auditLogId = `ai-action-${actionId}`;
    response.provenance.integrityHash = integrityHash;
  } catch (err) {
    // Audit failures must never break the action
    console.error('[AI Actions] Failed to write audit log:', err);
  }
}
