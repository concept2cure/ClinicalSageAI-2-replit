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
