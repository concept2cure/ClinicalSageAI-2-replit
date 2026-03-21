/**
 * AI Action Registry & Dispatcher
 *
 * Central registry for all AI action handlers. The dispatcher:
 * 1. Checks idempotency (dedup)
 * 2. Validates the request
 * 3. Checks permissions (role-based)
 * 4. Executes the handler (with timeout, transaction, retry)
 * 5. Logs audit/provenance
 * 6. Records metrics
 * 7. Returns standardized response
 *
 * HA features: timeout, circuit breaker, idempotency, metrics, retry.
 */

import * as crypto from 'crypto';
import { generateUUID } from '../../utils/id-generator';
import { db } from '../../db';
import { regulatoryAuditLogs } from '../../../shared/schema';
import { checkActionPermission } from './shared-utils';
import { acquireLock } from './distributed-lock';
import { acquireConcurrencySlot } from './concurrency-limiter';
import type {
  AIActionType,
  AIActionRequest,
  AIActionResponse,
  AIActionHandler,
  AIActionExecutionContext,
  AIActionError,
  AIActionProvenance,
} from '../../../shared/types/ai-actions';
import { AIActionHandlerError } from '../../../shared/types/ai-actions';

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const handlers = new Map<AIActionType, AIActionHandler>();

export function registerActionHandler(handler: AIActionHandler): void {
  if (handlers.has(handler.actionType)) {
    console.warn(`[AI Actions] Overwriting handler for action: ${handler.actionType}`);
  }
  handlers.set(handler.actionType, handler);
  console.log(`[AI Actions] Registered handler: ${handler.actionType}`);
}

export function getRegisteredActions(): AIActionType[] {
  return Array.from(handlers.keys());
}

// ---------------------------------------------------------------------------
// Metrics (in-memory, exportable via health endpoint)
// ---------------------------------------------------------------------------

interface ActionMetrics {
  totalExecutions: number;
  successCount: number;
  failureCount: number;
  totalDurationMs: number;
  byAction: Record<string, { count: number; successCount: number; avgDurationMs: number; lastExecuted: string }>;
  circuitBreakerTrips: number;
  idempotentHits: number;
  timeouts: number;
  retries: number;
}

const metrics: ActionMetrics = {
  totalExecutions: 0,
  successCount: 0,
  failureCount: 0,
  totalDurationMs: 0,
  byAction: {},
  circuitBreakerTrips: 0,
  idempotentHits: 0,
  timeouts: 0,
  retries: 0,
};

export function getActionMetrics(): Readonly<ActionMetrics> {
  return { ...metrics };
}

function recordMetrics(actionType: string, success: boolean, durationMs: number): void {
  metrics.totalExecutions++;
  if (success) metrics.successCount++;
  else metrics.failureCount++;
  metrics.totalDurationMs += durationMs;

  if (!metrics.byAction[actionType]) {
    metrics.byAction[actionType] = { count: 0, successCount: 0, avgDurationMs: 0, lastExecuted: '' };
  }
  const a = metrics.byAction[actionType];
  a.avgDurationMs = (a.avgDurationMs * a.count + durationMs) / (a.count + 1);
  a.count++;
  if (success) a.successCount++;
  a.lastExecuted = new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Circuit Breaker (per action type)
// ---------------------------------------------------------------------------

interface CircuitState {
  failures: number;
  lastFailure: number;
  state: 'closed' | 'open' | 'half_open';
}

const CIRCUIT_FAILURE_THRESHOLD = 5;
const CIRCUIT_RESET_MS = 30_000; // 30 seconds
const circuits = new Map<string, CircuitState>();

function getCircuit(actionType: string): CircuitState {
  if (!circuits.has(actionType)) {
    circuits.set(actionType, { failures: 0, lastFailure: 0, state: 'closed' });
  }
  return circuits.get(actionType)!;
}

function checkCircuitBreaker(actionType: string): AIActionError | null {
  const circuit = getCircuit(actionType);

  if (circuit.state === 'open') {
    // Check if reset timeout has elapsed
    if (Date.now() - circuit.lastFailure > CIRCUIT_RESET_MS) {
      circuit.state = 'half_open';
      return null; // Allow one test request
    }
    metrics.circuitBreakerTrips++;
    return {
      code: 'CIRCUIT_OPEN',
      message: `Action '${actionType}' is temporarily unavailable due to repeated failures. Retry after ${Math.ceil((CIRCUIT_RESET_MS - (Date.now() - circuit.lastFailure)) / 1000)}s.`,
    };
  }
  return null;
}

function recordCircuitSuccess(actionType: string): void {
  const circuit = getCircuit(actionType);
  circuit.failures = 0;
  circuit.state = 'closed';
}

function recordCircuitFailure(actionType: string): void {
  const circuit = getCircuit(actionType);
  circuit.failures++;
  circuit.lastFailure = Date.now();
  if (circuit.failures >= CIRCUIT_FAILURE_THRESHOLD) {
    circuit.state = 'open';
    console.warn(`[AI Actions] Circuit OPEN for ${actionType} after ${circuit.failures} failures`);
  }
}

// ---------------------------------------------------------------------------
// Idempotency (in-memory LRU — Phase 2: Redis-backed)
// ---------------------------------------------------------------------------

const IDEMPOTENCY_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_IDEMPOTENCY_ENTRIES = 1000;
const idempotencyCache = new Map<string, { response: AIActionResponse; expiresAt: number }>();

function computeIdempotencyKey(request: AIActionRequest, userId: number): string {
  const payload = JSON.stringify({
    actionType: request.actionType,
    targetType: request.targetType,
    targetId: request.targetId,
    projectId: request.projectId,
    userId,
  });
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

function getCachedResponse(key: string): AIActionResponse | null {
  const entry = idempotencyCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    idempotencyCache.delete(key);
    return null;
  }
  metrics.idempotentHits++;
  return entry.response;
}

function cacheResponse(key: string, response: AIActionResponse): void {
  // LRU eviction — loop to handle concurrent insertions safely
  while (idempotencyCache.size >= MAX_IDEMPOTENCY_ENTRIES) {
    const firstKey = idempotencyCache.keys().next().value;
    if (firstKey) idempotencyCache.delete(firstKey);
    else break;
  }
  idempotencyCache.set(key, {
    response,
    expiresAt: Date.now() + IDEMPOTENCY_TTL_MS,
  });
}

// ---------------------------------------------------------------------------
// Timeout
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 30_000;      // 30s for most actions
const AI_CALL_TIMEOUT_MS = 120_000;     // 2min for actions that call AI
const AI_ACTIONS = new Set(['refine_with_validation']);

/** Actions that mutate state and need distributed locking. */
const WRITE_ACTIONS = new Set([
  'promote_artifact',
  'save_document_version',
  'refine_with_validation',
  'route_document_to_module',
  'attach_sources_to_document',
]);

function getTimeoutMs(actionType: string): number {
  return AI_ACTIONS.has(actionType) ? AI_CALL_TIMEOUT_MS : DEFAULT_TIMEOUT_MS;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, actionType: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      metrics.timeouts++;
      reject(new AIActionHandlerError(
        'ACTION_TIMEOUT',
        `Action '${actionType}' timed out after ${timeoutMs / 1000}s`,
        504
      ));
    }, timeoutMs);

    promise.then(
      (result) => { clearTimeout(timer); resolve(result); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

// ---------------------------------------------------------------------------
// Retry (for transient DB errors only)
// ---------------------------------------------------------------------------

const MAX_RETRIES = 2;
const RETRY_BASE_MS = 200;
const RETRYABLE_CODES = new Set([
  '40001',  // Serialization failure
  '40P01',  // Deadlock detected
  '08006',  // Connection failure
  '08001',  // Unable to connect
  '57P01',  // Server shutting down
]);

function isRetryable(err: unknown): boolean {
  if (err instanceof AIActionHandlerError) return false; // Business errors are not retryable
  const code = (err as any)?.code;
  return typeof code === 'string' && RETRYABLE_CODES.has(code);
}

async function executeWithRetry(
  handler: AIActionHandler,
  request: AIActionRequest,
  ctx: AIActionExecutionContext,
  timeoutMs: number
): Promise<AIActionResponse> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await withTimeout(handler.execute(request, ctx), timeoutMs, request.actionType);
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES && isRetryable(err)) {
        metrics.retries++;
        const backoff = RETRY_BASE_MS * Math.pow(2, attempt);
        console.warn(`[AI Actions] Retrying ${request.actionType} (attempt ${attempt + 1}/${MAX_RETRIES}) after ${backoff}ms`);
        await new Promise(r => setTimeout(r, backoff));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

export interface DispatchOptions {
  ipAddress: string;
  sessionId?: string;
  user: {
    userId: number;
    userName: string;
    userRole?: string;
    organizationId: number;
    organizationName?: string;
  };
  /** If true, skip idempotency cache (force re-execution). */
  forceExecution?: boolean;
}

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
      { code: 'UNKNOWN_ACTION', message: `No handler registered for action type: ${request.actionType}` },
    ]);
  }

  // 2. Permission check
  const permError = checkActionPermission(request.actionType, options.user.userRole);
  if (permError) {
    return buildErrorResponse(request, actionId, options, [
      { code: 'PERMISSION_DENIED', message: permError },
    ]);
  }

  // 3. DB pre-flight check (lightweight, only for write actions)
  if (WRITE_ACTIONS.has(request.actionType)) {
    try {
      await (db as any).execute({ sql: 'SELECT 1' });
    } catch (dbErr: any) {
      return buildErrorResponse(request, actionId, options, [
        { code: 'DB_UNAVAILABLE', message: 'Database is temporarily unavailable. Please retry.' },
      ]);
    }
  }

  // 4. Circuit breaker check
  const circuitError = checkCircuitBreaker(request.actionType);
  if (circuitError) {
    return buildErrorResponse(request, actionId, options, [circuitError]);
  }

  // 5. Idempotency check (for non-read actions with same params)
  if (!options.forceExecution && request.actionType !== 'run_validation') {
    const idempotencyKey = computeIdempotencyKey(request, options.user.userId);
    const cached = getCachedResponse(idempotencyKey);
    if (cached) {
      return { ...cached, provenance: { ...cached.provenance, actionId } };
    }
  }

  // 6. Validate request (fast pre-check)
  if (handler.validate) {
    const validationErrors = handler.validate(request);
    if (validationErrors.length > 0) {
      return buildErrorResponse(request, actionId, options, validationErrors);
    }
  }

  // 7. Build execution context (with transaction-capable DB)
  const executionContext: AIActionExecutionContext = {
    user: {
      userId: options.user.userId,
      userName: options.user.userName,
      userRole: options.user.userRole,
      organizationId: options.user.organizationId,
      organizationName: options.user.organizationName,
    },
    db, // Handlers that need transactions call db.transaction() themselves
    actionId,
    ipAddress: options.ipAddress,
    sessionId: options.sessionId,
  };

  // 8. Concurrency limit (per-org backpressure)
  const slot = await acquireConcurrencySlot(options.user.organizationId);
  if (!slot) {
    return buildErrorResponse(request, actionId, options, [
      { code: 'CONCURRENCY_LIMIT', message: 'Too many concurrent actions for your organization. Please retry shortly.' },
    ]);
  }

  // 9. Execute with timeout, retry, and distributed lock (for write actions)
  let response: AIActionResponse;
  const timeoutMs = getTimeoutMs(request.actionType);
  try {
    // Acquire distributed lock for mutation actions that target a specific entity
    const needsLock = WRITE_ACTIONS.has(request.actionType) && request.targetId;
    const lockResource = needsLock
      ? `${request.targetType}:${request.targetId}`
      : null;
    const lock = lockResource
      ? await acquireLock(lockResource, actionId, timeoutMs + 5000)
      : null;

    if (needsLock && !lock) {
      slot.release();
      return buildErrorResponse(request, actionId, options, [
        { code: 'LOCK_CONTENTION', message: `Another operation is in progress on ${request.targetType} ${request.targetId}. Please retry.` },
      ]);
    }

    try {
      response = await executeWithRetry(handler, request, executionContext, timeoutMs);
      recordCircuitSuccess(request.actionType);
    } catch (err) {
      recordCircuitFailure(request.actionType);
      if (err instanceof AIActionHandlerError) {
        response = buildErrorResponse(request, actionId, options, [
          { code: err.code, message: err.message, details: err.details },
        ]);
      } else {
        const message = err instanceof Error ? err.message : 'Unknown execution error';
        console.error(`[AI Actions] Handler error for ${request.actionType}:`, err);
        response = buildErrorResponse(request, actionId, options, [
          { code: 'HANDLER_ERROR', message },
        ]);
      }
    } finally {
      if (lock) await lock.release();
    }
  } finally {
    await slot.release();
  }

  // 8. Compute audit data and attach provenance
  const durationMs = Date.now() - startTime;
  const integrityHash = computeIntegrityHash(request, response, actionId);
  response.provenance.auditLogId = `ai-action-${actionId}`;
  response.provenance.integrityHash = integrityHash;

  // 9. Record metrics
  recordMetrics(request.actionType, response.success, durationMs);

  // 10. Cache successful responses for idempotency
  if (response.success && request.actionType !== 'run_validation') {
    const idempotencyKey = computeIdempotencyKey(request, options.user.userId);
    cacheResponse(idempotencyKey, response);
  }

  // 11. Log audit (non-blocking)
  logAuditEntry(request, response, actionId, options, durationMs, integrityHash).catch(
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
    timestamp: response.provenance.timestamp,
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

async function logAuditEntry(
  request: AIActionRequest,
  response: AIActionResponse,
  actionId: string,
  options: DispatchOptions,
  durationMs: number,
  integrityHash: string
): Promise<void> {
  try {
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
        createdObjects: response.createdObjects.map(o => ({ type: o.type, id: o.id })),
        updatedObjects: response.updatedObjects.map(o => ({ type: o.type, id: o.id })),
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
  } catch (err) {
    console.error('[AI Actions] Failed to write audit log:', err);
  }
}
