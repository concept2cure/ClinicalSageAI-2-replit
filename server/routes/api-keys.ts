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
import { authMiddleware, requireAdminRole } from '../auth.js';
import {
  generateApiKey,
  validateApiKey as validateApiKeyService,
  revokeApiKey,
  listApiKeys,
  getApiKeyUsage,
} from '../services/api-key-service.js';
import { API_KEY_SCOPES, type ApiKeyScope } from '../../shared/schema/api-keys.js';
import auditService from '../services/auditService';
import { createScopedLogger } from '../utils/logger.js';

const log = createScopedLogger('api-keys');

const router = Router();

// All routes require authentication + admin role
router.use(authMiddleware);
router.use(requireAdminRole);

/**
 * Best-effort audit for API-key lifecycle events. Keys grant
 * programmatic access to a tenant's data and AI spend — every
 * creation, revocation, and expiration is a security event that
 * regulators expect in the audit trail. Audit-write failures are
 * non-fatal so a transient pipeline issue never breaks the admin
 * UX.
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
}): Promise<void> {
  try {
    await auditService.logAction({
      tenantId: entry.organizationId,
      userId: entry.userId,
      action: entry.action,
      resourceType: 'api_key',
      resourceId: String(entry.keyId),
      ipAddress: entry.ipAddress,
      userAgent: entry.userAgent,
      details: {
        outcome: entry.outcome,
        reason: entry.reason,
        keyPrefix: entry.keyPrefix,
        scopes: entry.scopes,
      },
    });
  } catch (err) {
    log.warn('API-key audit write failed (non-fatal)', {
      err: err instanceof Error ? err.message : String(err),
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
    const { name, scopes, expiresAt, rateLimit, metadata } = req.body;

    // Validate required fields
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Name is required' });
    }

    if (!scopes || !Array.isArray(scopes) || scopes.length === 0) {
      return res.status(400).json({
        error: 'At least one scope is required',
        availableScopes: API_KEY_SCOPES,
      });
    }

    // Validate each scope
    const invalidScopes = scopes.filter(
      (s: string) => !(API_KEY_SCOPES as readonly string[]).includes(s)
    );
    if (invalidScopes.length > 0) {
      return res.status(400).json({
        error: `Invalid scopes: ${invalidScopes.join(', ')}`,
        availableScopes: API_KEY_SCOPES,
      });
    }

    // Parse optional expiration
    let parsedExpiry: Date | undefined;
    if (expiresAt) {
      parsedExpiry = new Date(expiresAt);
      if (isNaN(parsedExpiry.getTime())) {
        return res.status(400).json({ error: 'Invalid expiresAt date format' });
      }
      if (parsedExpiry <= new Date()) {
        return res.status(400).json({ error: 'expiresAt must be in the future' });
      }
    }

    const result = await generateApiKey(
      organizationId,
      name.trim(),
      scopes,
      userId,
      parsedExpiry,
      typeof rateLimit === 'number' && rateLimit > 0 ? rateLimit : 60,
      metadata
    );

    // Audit: key creation. Records WHO minted the key, WHAT scopes
    // it carries, and the prefix (NOT the raw key — that's returned
    // to the caller exactly once and never logged). Future security
    // reviews can trace which admin authorized which scope grant.
    await auditApiKeyEvent({
      action: 'api_key_created',
      organizationId,
      userId,
      keyId: result.keyId,
      keyPrefix: result.keyPrefix,
      scopes,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
      outcome: 'success',
    });

    return res.status(201).json({
      message: 'API key created successfully. Store this key securely — it will not be shown again.',
      apiKey: result.rawKey,
      keyId: result.keyId,
      keyPrefix: result.keyPrefix,
      name: name.trim(),
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
    const keyId = parseInt(req.params.id, 10);

    if (isNaN(keyId)) {
      return res.status(400).json({ error: 'Invalid key ID' });
    }

    const revoked = await revokeApiKey(keyId, organizationId);

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

    // Audit: successful revocation. Inspectors can correlate this
    // with the original api_key_created event to see the full
    // lifecycle of a credential.
    await auditApiKeyEvent({
      action: 'api_key_revoked',
      organizationId,
      userId,
      keyId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
      outcome: 'success',
    });

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
    const keyId = parseInt(req.params.id, 10);

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
