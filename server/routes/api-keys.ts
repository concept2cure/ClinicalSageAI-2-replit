/**
 * API Key Management Routes
 *
 * CRUD endpoints for managing organization API keys. All endpoints require
 * JWT authentication and admin role.
 *
 * Endpoints:
 *   POST   /api/api-keys          Create a new API key (returns raw key once)
 *   GET    /api/api-keys          List all keys for the authenticated org
 *   DELETE /api/api-keys/:id      Revoke a key
 *   GET    /api/api-keys/:id/usage  Get usage stats for a key
 *
 * @module server/routes/api-keys
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authMiddleware, requireAdminRole } from '../auth.js';
import {
  generateApiKey,
  ApiKeyLifecycleError,
  revokeApiKey,
  listApiKeys,
  getApiKeyUsage,
} from '../services/api-key-service.js';
import { API_KEY_SCOPES } from '../../shared/schema/api-keys.js';
import { recordAuditRow, type AuditRowOutcome } from '../services/audit/audit-write-outcome';
import { createScopedLogger } from '../utils/logger.js';
import { requestPgClient, type RequestSqlClient } from '../db/requestDb';

const log = createScopedLogger('api-keys');

const router = Router();

// ============================================================================
// Validation schema for API-key creation.
//
// organizationId / userId are intentionally absent — both are derived from the
// authenticated request (req.tenantId / req.userId), never from the body.
// expiresAt is validated as a future datetime; rateLimit/metadata stay optional
// and are normalized by the handler exactly as before.
// ============================================================================
const createApiKeySchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(255),
  scopes: z
    .array(z.enum(API_KEY_SCOPES))
    .min(1, 'At least one scope is required'),
  expiresAt: z.coerce
    .date()
    .refine(d => d.getTime() > Date.now(), 'expiresAt must be in the future')
    .optional(),
  rateLimit: z.number().int().positive().optional(),
  metadata: z.record(z.unknown()).optional(),
  reason: z.string().trim().min(3).max(500).optional(),
});

// All routes require authentication + admin role
router.use(authMiddleware);
router.use(requireAdminRole);

/** The authentication boundary supplies an idle, tenant-pinned connection.
 * Never release an uncertain COMMIT back to that request's later queries. */
async function apiKeyTransaction<T>(req: Request, work: (client: RequestSqlClient) => Promise<T>): Promise<T> {
  const client = requestPgClient(req);
  let commitStarted = false;
  let writtenKeyId: number | undefined;
  try {
    await client.query('BEGIN');
    const result = await work(client);
    if (result && typeof result === 'object' && 'keyId' in result && typeof result.keyId === 'number') writtenKeyId = result.keyId;
    commitStarted = true;
    await client.query('COMMIT');
    return result;
  } catch (error) {
    if (commitStarted) await client.discard?.(error instanceof Error ? error : new Error('API-key commit unconfirmed'));
    else {
      try { await client.query('ROLLBACK'); }
      catch (rollbackError) { await client.discard?.(rollbackError instanceof Error ? rollbackError : new Error('API-key rollback unconfirmed')); }
    }
    throw new ApiKeyLifecycleError(commitStarted, commitStarted ? writtenKeyId : undefined);
  }
}

/**
 * Refused operations have no key mutation to enlist. Their security-attempt
 * audit uses the canonical outcome; successful lifecycle writes are atomic
 * inside the service transaction.
 */
async function auditApiKeyEvent(entry: {
  action: 'api_key_created' | 'api_key_revoked';
  organizationId: number;
  userId: number;
  keyId: number;
  keyPrefix?: string;
  scopes?: string[];
  ipAddress?: string;
  userAgent?: string;
  outcome: 'success' | 'failure';
  reason?: string;
}): Promise<AuditRowOutcome> {
  return recordAuditRow({
    tenantId: entry.organizationId,
    userId: entry.userId,
    action: entry.action,
    resourceType: 'api_key',
    resourceId: String(entry.keyId),
    ipAddress: entry.ipAddress,
    userAgent: entry.userAgent,
    reason: entry.reason,
    details: {
      outcome: entry.outcome,
      reason: entry.reason,
      keyPrefix: entry.keyPrefix,
      scopes: entry.scopes,
    },
  });
}

// ============================================================================
// POST /api/api-keys — Create a new API key
// ============================================================================

router.post('/', async (req: Request, res: Response) => {
  try {
    const organizationId = Number(req.tenantId);
    if (!organizationId) {
      return res.status(401).json({ error: 'Organization context required' });
    }
    const userId = Number(req.userId);
    if (!userId) {
      return res.status(401).json({ error: 'User context required' });
    }
    const parsed = createApiKeySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        availableScopes: API_KEY_SCOPES,
        details: parsed.error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message,
          code: e.code,
        })),
      });
    }
    // z.string().trim() has already normalized `name`.
    const { name, scopes, expiresAt, rateLimit, metadata, reason } = parsed.data;
    const parsedExpiry: Date | undefined = expiresAt;

    const result = await apiKeyTransaction(req, client => generateApiKey({
      organizationId, name, scopes, createdBy: userId, expiresAt: parsedExpiry,
      rateLimit: typeof rateLimit === 'number' && rateLimit > 0 ? rateLimit : 60, metadata,
      auditContext: { reason, ipAddress: req.ip, userAgent: req.headers['user-agent'] as string | undefined },
    }, client));

    return res.status(201).json({
      message: 'API key created successfully. Store this key securely — it will not be shown again.',
      apiKey: result.rawKey,
      keyId: result.keyId,
      keyPrefix: result.keyPrefix,
      name,
      scopes,
      expiresAt: parsedExpiry || null,
      meta: { auditTrail: { persisted: true, chained: true } },
    });
  } catch (error: unknown) {
    if (error instanceof ApiKeyLifecycleError) return res.status(error.status).json({
      error: error.message, code: error.code, ...(error.keyId ? { keyId: error.keyId } : {}),
      recoveryUrl: '/api/api-keys',
    });
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.error('Failed to create API key', { err: message });
    return res.status(500).json({ error: 'Failed to create API key' });
  }
});

// ============================================================================
// GET /api/api-keys — List all keys for the organization
// ============================================================================

router.get('/', async (req: Request, res: Response) => {
  try {
    const organizationId = Number(req.tenantId);
    if (!organizationId) {
      return res.status(401).json({ error: 'Organization context required' });
    }
    const keys = await listApiKeys(organizationId);

    return res.json({
      keys,
      total: keys.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.error('Failed to list API keys', { err: message });
    return res.status(500).json({ error: 'Failed to list API keys' });
  }
});

// ============================================================================
// DELETE /api/api-keys/:id — Revoke a key
// ============================================================================

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const organizationId = Number(req.tenantId);
    if (!organizationId) {
      return res.status(401).json({ error: 'Organization context required' });
    }
    const userId = Number(req.userId);
    const id = String(req.params.id);
    const keyId = Number(id);
    if (!Number.isSafeInteger(userId) || userId < 1) return res.status(401).json({ error: 'User context required' });

    if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(keyId) || keyId > 2_147_483_647) {
      return res.status(400).json({ error: 'Invalid key ID' });
    }

    const revoked = await apiKeyTransaction(req, client => revokeApiKey(keyId, organizationId, client, {
      userId, ipAddress: req.ip, userAgent: req.headers['user-agent'] as string | undefined,
    }));

    if (!revoked) {
      // Audit: revocation attempt against a key that doesn't exist
      // or belongs to another tenant — still an event worth recording.
      // revokeApiKey itself scopes by organizationId so a foreign-
      // tenant id naturally returns false here.
      const auditTrail = await auditApiKeyEvent({
        action: 'api_key_revoked',
        organizationId,
        userId,
        keyId,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] as string | undefined,
        outcome: 'failure',
        reason: 'not_found_or_already_revoked',
      });
      return res.status(404).json({
        error: 'API key not found or already revoked',
        meta: { auditTrail },
      });
    }

    return res.json({ message: 'API key revoked successfully', keyId, meta: { auditTrail: { persisted: true, chained: true } } });
  } catch (error: unknown) {
    if (error instanceof ApiKeyLifecycleError) return res.status(error.status).json({
      error: error.message, code: error.code, ...(error.keyId ? { keyId: error.keyId } : {}),
      recoveryUrl: '/api/api-keys',
    });
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.error('Failed to revoke API key', { err: message });
    return res.status(500).json({ error: 'Failed to revoke API key' });
  }
});

// ============================================================================
// GET /api/api-keys/:id/usage — Get usage stats for a key
// ============================================================================

router.get('/:id/usage', async (req: Request, res: Response) => {
  try {
    const organizationId = Number(req.tenantId);
    if (!organizationId) {
      return res.status(401).json({ error: 'Organization context required' });
    }
    const keyId = parseInt(String(req.params.id), 10);

    if (isNaN(keyId)) {
      return res.status(400).json({ error: 'Invalid key ID' });
    }

    const usage = await getApiKeyUsage(keyId, organizationId);

    if (!usage) {
      return res.status(404).json({ error: 'API key not found' });
    }

    return res.json(usage);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.error('Failed to get API key usage', { err: message });
    return res.status(500).json({ error: 'Failed to get API key usage' });
  }
});

export default router;
