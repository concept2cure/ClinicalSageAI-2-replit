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
import type { PoolClient } from 'pg';
import { authMiddleware, requireAdminRole } from '../auth.js';
import {
  generateApiKey,
  revokeApiKey,
  listApiKeys,
  getApiKeyUsage,
} from '../services/api-key-service.js';
import { API_KEY_SCOPES } from '../../shared/schema/api-keys.js';
import auditService, { writeChainedAuditRow } from '../services/auditService';
import { requestPgClient } from '../db/requestDb';
import { createScopedLogger } from '../utils/logger.js';

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
  // Optional for existing integrations; the admin drawer requires it.
  reason: z.string().trim().min(1).max(2000).optional(),
  metadata: z.record(z.unknown()).optional(),
});

// All routes require authentication + admin role
router.use(authMiddleware);
router.use(requireAdminRole);

/** The auth boundary pins an idle connection and sets session scope; it does
 * not open a transaction. Each mutation owns one transaction on that connection,
 * and the credential and chained row use that same client. No pooled fallback. */
async function apiKeyTransaction<T>(req: Request, callback: (client: Pick<PoolClient, 'query'>) => Promise<T>): Promise<T> {
  const client = requestPgClient(req) as Pick<PoolClient, 'query'>;
  await client.query('BEGIN');
  try {
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

/**
 * Successful creation and revocation enlist their chained audit row on the
 * same transaction client as the credential write. A failed audit throws and
 * the credential write rolls back; the raw key is returned only after commit.
 * Refused attempts mutate no credential and use the general audit recorder.
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
}, client?: Pick<PoolClient, 'query'>): Promise<void> {
  const auditEntry = {
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
  };
  if (client) {
    await writeChainedAuditRow(client, auditEntry);
    return;
  }
  const apiKeyAudit = await auditService.logAction(auditEntry);
  if (!apiKeyAudit.persisted) {
    log.warn('API-key audit write failed (non-fatal)', {
      err: apiKeyAudit.error ?? 'no durable store accepted the row',
      action: entry.action,
    });
  }
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

    const result = await apiKeyTransaction(req, async client => {
      const key = await generateApiKey(
        { organizationId, name, scopes, createdBy: userId, expiresAt: parsedExpiry,
          rateLimit: typeof rateLimit === 'number' && rateLimit > 0 ? rateLimit : 60, metadata },
        client,
      );
      // The prefix is public; the full secret never enters the audit record.
      await auditApiKeyEvent({
        action: 'api_key_created', organizationId, userId,
        keyId: key.keyId, keyPrefix: key.keyPrefix, scopes, reason,
        ipAddress: req.ip, userAgent: req.headers['user-agent'] as string | undefined,
        outcome: 'success',
      }, client);
      return key;
    });

    return res.status(201).json({
      message: 'API key created successfully. Store this key securely — it will not be shown again.',
      apiKey: result.rawKey,
      keyId: result.keyId,
      keyPrefix: result.keyPrefix,
      name,
      scopes,
      expiresAt: parsedExpiry || null,
    });
  } catch (error: unknown) {
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
    const keyId = parseInt(String(req.params.id), 10);

    if (isNaN(keyId)) {
      return res.status(400).json({ error: 'Invalid key ID' });
    }

    const revoked = await apiKeyTransaction(req, async client => {
      const changed = await revokeApiKey(keyId, organizationId, client);
      if (changed) {
        await auditApiKeyEvent({
          action: 'api_key_revoked', organizationId, userId, keyId,
          ipAddress: req.ip, userAgent: req.headers['user-agent'] as string | undefined,
          outcome: 'success',
        }, client);
      }
      return changed;
    });

    if (!revoked) {
      // Audit: revocation attempt against a key that doesn't exist
      // or belongs to another tenant — still an event worth recording.
      // revokeApiKey itself scopes by organizationId so a foreign-
      // tenant id naturally returns false here.
      await auditApiKeyEvent({
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
      });
    }

    return res.json({ message: 'API key revoked successfully', keyId });
  } catch (error: unknown) {
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
