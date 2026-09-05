/**
 * Helpers shared by every Concept2Cure router — the response envelope, the
 * rate limiter, request identity, input sanitisation and error logging.
 *
 * Split out of routes/concept2cure.ts so the domain routers under routes/c2c/
 * import from here rather than from the monolith they are being carved out
 * of. One implementation per helper: concept2cure.ts imports these too.
 *
 * @module server/routes/c2c/shared
 */

import type { Request, Response } from 'express';
import DOMPurifyImport from 'isomorphic-dompurify';
import { createScopedLogger } from '../../utils/logger';
import * as metricsModule from '../../metrics.js';
import { createRedisRateLimiter } from '../../middleware/redisRateLimiter';
import * as crypto from 'crypto';
import { db } from '../../db';
import { regulatoryAuditLogs } from '../../../shared/schema';

const DOMPurify = (DOMPurifyImport as any).default || DOMPurifyImport;
const logger = createScopedLogger('concept2cure-api');
const metrics = (
  metricsModule as {
    metrics?: { concept2cureErrors?: { inc: (labels: Record<string, string>) => void } };
  }
).metrics;

type ApiErrorPayload = {
  message: string;
  code?: string;
  details?: unknown;
};

export const sendSuccess = <T>(res: Response, data: T, meta?: Record<string, unknown>) => {
  if (meta) {
    return res.json({ success: true, data, meta });
  }
  return res.json({ success: true, data });
};

export const sendError = (
  res: Response,
  status: number,
  message: string,
  details?: unknown,
  code?: string
) =>
  res
    .status(status)
    .json({ success: false, error: { message, code, details } satisfies ApiErrorPayload });

// ─────────────────────────────────────────────────────────────────────────────
// SECURITY MIDDLEWARE CHAIN
// Apply in order: rate limit → auth → tenant context → organization check
// ─────────────────────────────────────────────────────────────────────────────

// Use Redis-based rate limiter for distributed deployments
export const concept2cureRateLimiter = createRedisRateLimiter({
  rules: {
    concept2cure: {
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 100,
      message: 'Rate limit exceeded for Concept2Cure API. Please wait.',
    },
  },
  perOrganization: true,
  keyPrefix: 'c2c:',
});

/**
 * Extract client IP address from request, handling proxies.
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    return ips.trim();
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

// ─────────────────────────────────────────────────────────────────────────────
// INPUT SANITIZATION (PRODUCTION-GRADE)
// Using isomorphic-dompurify for comprehensive XSS prevention
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sanitize user-provided text content to prevent XSS attacks.
 * Uses DOMPurify (isomorphic) for production-grade sanitization.
 *
 * @param content - Raw user input
 * @returns Sanitized string safe for storage and display
 */
export function sanitizeContent(content: string): string {
  if (!content || typeof content !== 'string') {
    return '';
  }

  return DOMPurify.sanitize(content, {
    ALLOWED_TAGS: [
      'b',
      'i',
      'em',
      'strong',
      'p',
      'br',
      'ul',
      'ol',
      'li',
      'code',
      'pre',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'blockquote',
      'a',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'span',
      'div',
      'hr',
      'sup',
      'sub',
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'id'],
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input'],
    FORBID_ATTR: ['onerror', 'onclick', 'onload', 'onmouseover', 'onfocus'],
  }).trim();
}

export function logConcept2cureError(operation: string, error: Error, meta: Record<string, unknown> = {}) {
  logger.error(`Concept2Cure ${operation} failed`, {
    error: error.message,
    operation,
    ...meta,
  });
  try {
    metrics?.concept2cureErrors?.inc({
      operation,
      error_type: error.name || 'Error',
    });
  } catch {
    // Ignore metric errors
  }
}

export interface Artifact {
  id: string;
  projectId: string;
  conversationId?: string;
  type: string;
  category: 'document' | 'interactive' | 'visualization' | 'compliance' | 'source' | 'evidence';
  title: string;
  content: string;
  ctdSection?: string | null;
  version: number;
  versions: Array<{ version: number; content: string; createdAt: Date }>;
  metadata?: Record<string, unknown>;
  status?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Get the organization ID from the request with validation.
 * Works with both auth middleware (number) and tenant context middleware (string).
 * Throws if organization context is missing.
 */
export function getOrganizationId(req: Request): number {
  // First try the auth middleware context (organizationId as number)
  if (req.tenantContext?.organizationId) {
    const orgId =
      typeof req.tenantContext.organizationId === 'number'
        ? req.tenantContext.organizationId
        : parseInt(String(req.tenantContext.organizationId), 10);
    if (!isNaN(orgId)) return orgId;
  }

  // Fall back to tenantId
  if (req.tenantId !== undefined && req.tenantId !== null) {
    const tid =
      typeof req.tenantId === 'number' ? req.tenantId : parseInt(String(req.tenantId), 10);
    if (!isNaN(tid)) return tid;
  }

  throw new Error('Organization context required');
}

/**
 * Get the current user ID from the request.
 */
export function getUserId(req: Request): number {
  if (!req.userId) {
    throw new Error('Authentication required: userId not set on request');
  }
  const uid = typeof req.userId === 'number' ? req.userId : parseInt(String(req.userId), 10);
  if (isNaN(uid)) {
    throw new Error('Authentication required: userId not numeric');
  }
  return uid;
}

export function paramStr(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return '';
}

// ─────────────────────────────────────────────────────────────────────────────
// FDA 21 CFR PART 11 AUDIT LOGGING (DATABASE-BACKED)
// One writer for every Concept2Cure router.
// ─────────────────────────────────────────────────────────────────────────────

export interface AuditEntry {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  action:
    | 'CREATE'
    | 'READ'
    | 'UPDATE'
    | 'DELETE'
    | 'EXPORT'
    | 'SIGN'
    | 'APPROVE'
    | 'AI_EDIT'
    | 'AI_TEMPLATE_GENERATE'
    | 'DUPLICATE'
    | 'TRANSFER'
    | 'FEEDBACK';
  entityType:
    | 'project'
    | 'conversation'
    | 'message'
    | 'artifact'
    | 'artifact_status'
    | 'audit_report_export'
    | 'review_comment'
    | 'review_assignment'
    | 'review_decision'
    | 'signature'
    | 'vault_registration'
    | 'prompt_template'
    | 'submission_package'
    | 'document_section'
    | 'ai_response'
    | 'system_error';
  entityId: string;
  previousValue?: unknown;
  newValue?: unknown;
  ipAddress?: string;
  sessionId?: string;
  integrityHash?: string;
}

/**
 * Log an audit entry for 21 CFR Part 11 compliance.
 * Entries are persisted to database with tamper-evident hashing.
 *
 * @param req - Express request with authenticated user context
 * @param action - Type of action being audited
 * @param entityType - Category of entity being acted upon
 * @param entityId - Unique identifier of the entity
 * @param previousValue - State before change (for updates/deletes)
 * @param newValue - State after change (for creates/updates)
 */
export async function logAuditEntry(
  req: Request,
  action: AuditEntry['action'],
  entityType: AuditEntry['entityType'],
  entityIdRaw: string | string[] | undefined,
  previousValue?: unknown,
  newValue?: unknown
): Promise<void> {
  const entityId = Array.isArray(entityIdRaw) ? entityIdRaw[0] ?? '' : entityIdRaw ?? '';
  try {
    const auditId = `audit_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    const timestamp = new Date();
    const orgId = req.tenantContext?.organizationId
      ? parseInt(req.tenantContext.organizationId as string, 10)
      : (req.tenantId as number) || 0;

    // Calculate tamper-evident integrity hash
    const hashData = JSON.stringify({
      auditId,
      timestamp: timestamp.toISOString(),
      userId: req.userId,
      action,
      entityType,
      entityId,
    });
    const integrityHash = crypto.createHash('sha256').update(hashData).digest('hex');

    // Persist to regulatory audit log table
    const userIdNum =
      typeof req.userId === 'number'
        ? req.userId
        : req.userId !== undefined
          ? parseInt(String(req.userId), 10)
          : 0;
    await db.insert(regulatoryAuditLogs).values({
      auditId,
      organizationId: orgId,
      entityType,
      entityId,
      action,
      actionCategory: getActionCategory(action),
      previousValue: previousValue ?? null,
      newValue: newValue ?? null,
      userId: Number.isFinite(userIdNum) ? userIdNum : 0,
      userName: req.userEmail || 'unknown',
      userRole: req.userRole || 'user',
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] || null,
      sessionId: (req as any).session?.id || null,
      isGxpRelevant: true, // Concept2Cure creates GxP-relevant documents
      metadata: { integrityHash },
    });

    logger.debug('Audit entry persisted', { auditId, action, entityType, entityId });
  } catch (error) {
    // Never fail the main operation due to audit logging - log and continue
    logger.error('Failed to persist audit entry', {
      error: error instanceof Error ? error.message : 'Unknown error',
      action,
      entityType,
      entityId,
    });
  }
}

/**
 * Map audit actions to categories for reporting.
 */
function getActionCategory(action: AuditEntry['action']): string {
  const categoryMap: Record<string, string> = {
    CREATE: 'data-change',
    UPDATE: 'data-change',
    DELETE: 'data-change',
    READ: 'access',
    EXPORT: 'access',
    SIGN: 'approval',
    APPROVE: 'approval',
  };
  return categoryMap[action] || 'system';
}

/* ── Content integrity ─────────────────────────────────────────────────────── */

/**
 * Calculate SHA-256 hash for content integrity verification.
 * Used for 21 CFR Part 11 tamper-evident audit trails.
 */
export function calculateContentHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/* ── Conversation shapes shared by the project and conversation routers ────── */

/**
 * Conversation within a project (stored as JSON in project settings).
 */
export interface Conversation {
  id: string;
  projectId: string;
  title: string;
  messages: Message[];
  parentConversationId?: string;
  forkMessageIndex?: number;
  threadId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  attachments?: Array<{ id: string; name: string; type: string; size: number }>;
  artifactId?: string;
  edited?: boolean;
}

/* ── Stored-record integrity (Part 11) ─────────────────────────────────────── */

/**
 * What this check actually covers, stated once and carried into every response.
 *
 * `verifyIntegrityChain` recomputes SHA-256 over `artifact.content` and each
 * version's `content` — both read from the database — and compares each to the
 * hash stored beside it. That is a real check: it catches a stored row whose
 * content and recorded hash disagree. It is NOT verification of the originating
 * document, because no source bytes are read here; nothing in this path
 * re-derives a hash from an uploaded file, a vault object, or a filed leaf.
 *
 * The distinction matters because of where this lands. The audit-report route
 * emits this block under `standard: '21 CFR Part 11 · ICH M8 eCTD v4.0'` and
 * directly beside a `sourceLineage` section, and the export persists that as a
 * governed artifact an inspector reads. "verified: true, SHA-256" next to a
 * source-lineage list reads as "the source documents were checked". They were
 * not. Naming the scope is the whole fix — the check is fine, the claim was
 * broader than the check.
 */
const INTEGRITY_CHECK_SCOPE =
  'Compares each stored artifact version against the SHA-256 recorded with it. ' +
  'Detects a stored record altered without its hash being updated. Does NOT read ' +
  'or verify the bytes of the originating source document.';

export function verifyIntegrityChain(
  artifact: { content: string | null; contentHash: string | null; version: number },
  versions: Array<{ version: number; content: string; contentHash: string; createdAt: Date | null }>
): {
  scope: string;
  sourceDocumentBytesVerified: false;
  chainIntact: boolean;
  currentHashVerified: boolean;
  computedHash: string;
  storedHash: string | null;
  versionDetails: Array<{
    version: number;
    storedHash: string;
    computedHash: string;
    verified: boolean;
    timestamp: Date | null;
  }>;
  failureReason: string | null;
} {
  const computedHash = artifact.content ? calculateContentHash(artifact.content) : '';
  const currentHashVerified = computedHash === artifact.contentHash;

  let chainIntact = currentHashVerified;
  let failureReason: string | null = null;
  const versionDetails = versions.map(v => {
    const vComputedHash = calculateContentHash(v.content);
    const verified = vComputedHash === v.contentHash;
    if (!verified) {
      chainIntact = false;
      failureReason = failureReason || `Version ${v.version} hash mismatch`;
    }
    return {
      version: v.version,
      storedHash: v.contentHash,
      computedHash: vComputedHash,
      verified,
      timestamp: v.createdAt,
    };
  });

  if (!currentHashVerified && !failureReason) {
    failureReason = 'Current artifact hash mismatch';
  }

  return {
    scope: INTEGRITY_CHECK_SCOPE,
    // Always false, and present rather than omitted: a reader must be able to
    // see that source-document verification did not happen, not infer it from
    // the absence of a field.
    sourceDocumentBytesVerified: false,
    chainIntact,
    currentHashVerified,
    computedHash,
    storedHash: artifact.contentHash,
    versionDetails,
    failureReason,
  };
}

/* ── Recursive sanitisation for stored objects ─────────────────────────────── */

/**
 * Sanitize object properties recursively for storage.
 *
 * @param obj - Object with potentially unsafe string values
 * @returns Object with all string values sanitized
 */
export function sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeContent(value);
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      sanitized[key] = sanitizeObject(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized as T;
}
