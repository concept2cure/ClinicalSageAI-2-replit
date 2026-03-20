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

const router = Router();

// All routes require authentication + admin role
router.use(authMiddleware);
router.use(requireAdminRole);

// ============================================================================
// POST /api/api-keys — Create a new API key
// ============================================================================

router.post('/', async (req: Request, res: Response) => {
  try {
    const organizationId = Number(req.tenantId) || 1;
    const userId = Number(req.userId) || 1;
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
    console.error('[api-keys] Failed to create API key:', message);
    return res.status(500).json({ error: 'Failed to create API key' });
  }
});

// ============================================================================
// GET /api/api-keys — List all keys for the organization
// ============================================================================

router.get('/', async (req: Request, res: Response) => {
  try {
    const organizationId = Number(req.tenantId) || 1;
    const keys = await listApiKeys(organizationId);

    return res.json({
      keys,
      total: keys.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[api-keys] Failed to list API keys:', message);
    return res.status(500).json({ error: 'Failed to list API keys' });
  }
});

// ============================================================================
// DELETE /api/api-keys/:id — Revoke a key
// ============================================================================

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const organizationId = Number(req.tenantId) || 1;
    const keyId = parseInt(req.params.id, 10);

    if (isNaN(keyId)) {
      return res.status(400).json({ error: 'Invalid key ID' });
    }

    const revoked = await revokeApiKey(keyId, organizationId);

    if (!revoked) {
      return res.status(404).json({
        error: 'API key not found or already revoked',
      });
    }

    return res.json({ message: 'API key revoked successfully', keyId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[api-keys] Failed to revoke API key:', message);
    return res.status(500).json({ error: 'Failed to revoke API key' });
  }
});

// ============================================================================
// GET /api/api-keys/:id/usage — Get usage stats for a key
// ============================================================================

router.get('/:id/usage', async (req: Request, res: Response) => {
  try {
    const organizationId = Number(req.tenantId) || 1;
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
    console.error('[api-keys] Failed to get API key usage:', message);
    return res.status(500).json({ error: 'Failed to get API key usage' });
  }
});

export default router;
