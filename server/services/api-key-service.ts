/**
 * API Key Service
 *
 * Manages the full lifecycle of API keys: generation, validation, revocation,
 * and usage tracking. Keys use the `csai_` prefix and are hashed with SHA-256
 * before storage — the raw key is returned exactly once at creation time.
 *
 * @module server/services/api-key-service
 */

import { createHash, randomBytes } from 'crypto';
import { pool } from '../db.js';
import { createScopedLogger } from '../utils/logger.js';

const log = createScopedLogger('api-key-service');

// ============================================================================
// TYPES
// ============================================================================

export interface ApiKeyValidationResult {
  valid: boolean;
  organizationId?: number;
  scopes?: string[];
  rateLimit?: number;
  keyId?: number;
  reason?: string;
}

export interface ApiKeyListItem {
  id: number;
  uuid: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  status: string;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  requestCount: number;
  rateLimit: number;
  createdAt: Date;
  revokedAt: Date | null;
  createdBy: number;
}

export interface ApiKeyUsageStats {
  id: number;
  name: string;
  keyPrefix: string;
  requestCount: number;
  lastUsedAt: Date | null;
  createdAt: Date;
  status: string;
}

// ============================================================================
// KEY GENERATION
// ============================================================================

/**
 * Generate a new API key for an organization.
 *
 * Creates a `csai_`-prefixed key from 32 random bytes (base64url encoded),
 * hashes it with SHA-256, and stores the hash + prefix. The raw key is
 * returned exactly once — it cannot be retrieved later.
 */
export async function generateApiKey(
  organizationId: number,
  name: string,
  scopes: string[],
  createdBy: number,
  expiresAt?: Date,
  rateLimit: number = 60,
  metadata?: Record<string, unknown>
): Promise<{ rawKey: string; keyId: number; keyPrefix: string }> {
  // Generate 32 random bytes → base64url for a high-entropy key
  const randomPart = randomBytes(32).toString('base64url');
  const rawKey = `csai_${randomPart}`;

  // Store only the hash
  const keyHash = createHash('sha256').update(rawKey).digest('hex');
  const keyPrefix = rawKey.substring(0, 12); // "csai_" + first 7 chars of random

  const result = await pool.query(
    `INSERT INTO api_keys (
      organization_id, name, key_hash, key_prefix, scopes, status,
      expires_at, rate_limit, metadata, created_by, created_at
    ) VALUES ($1, $2, $3, $4, $5, 'active', $6, $7, $8, $9, NOW())
    RETURNING id`,
    [
      organizationId,
      name,
      keyHash,
      keyPrefix,
      JSON.stringify(scopes),
      expiresAt || null,
      rateLimit,
      metadata ? JSON.stringify(metadata) : null,
      createdBy,
    ]
  );

  return {
    rawKey,
    keyId: result.rows[0].id,
    keyPrefix,
  };
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate an API key by hashing it and looking up the hash in the database.
 *
 * On success, increments the request count and updates lastUsedAt.
 * Returns the associated organization, scopes, and rate limit.
 */
/**
 * Always-hash design: we compute the SHA-256 of whatever bytes the
 * caller sent, then look up the resulting hash. Pre-fix the function
 * short-circuited with `return invalid` if the raw key didn't start
 * with `csai_`, which leaked "wrong format" vs "valid format but no
 * match" via response timing — an attacker probing the system could
 * detect when their guess had the right prefix.
 *
 * Now: the format check is folded into the same "key not found"
 * branch. A wrong-prefix key still hashes to a value that won't be
 * in the database (we never store hashes of non-`csai_`-prefixed
 * inputs), so the lookup naturally returns zero rows. The reason
 * string ("Invalid key format" vs "API key not found") is preserved
 * for caller observability but does NOT branch the SQL path, so the
 * timing is identical for both failure modes.
 */
export async function validateApiKey(rawKey: string): Promise<ApiKeyValidationResult> {
  const safeRawKey = typeof rawKey === 'string' ? rawKey : '';
  const formatOk = safeRawKey.startsWith('csai_');

  // Always hash and always query, regardless of format. A non-csai_
  // input hashes to something that won't be in the table, so the
  // result.rows check below catches it — without revealing via
  // timing that the format check failed first.
  const keyHash = createHash('sha256').update(safeRawKey).digest('hex');

  const result = await pool.query(
    `SELECT id, organization_id, scopes, status, expires_at, rate_limit
     FROM api_keys
     WHERE key_hash = $1`,
    [keyHash]
  );

  if (result.rows.length === 0) {
    return {
      valid: false,
      reason: formatOk ? 'API key not found' : 'Invalid key format',
    };
  }

  const key = result.rows[0];

  // Check status
  if (key.status === 'revoked') {
    return { valid: false, reason: 'API key has been revoked' };
  }

  if (key.status === 'expired') {
    return { valid: false, reason: 'API key has expired' };
  }

  // Check expiration: the key was active but is now past its
  // expires_at timestamp. Mark it expired AND record an audit event
  // for the state transition — admins need to see "key X expired
  // at Y" in the official audit trail, not just discover it via a
  // 401 in their downstream service.
  if (key.expires_at && new Date(key.expires_at) < new Date()) {
    await pool.query(
      `UPDATE api_keys SET status = 'expired' WHERE id = $1`,
      [key.id]
    );
    // Fire-and-forget audit write. Dynamic import so this module
    // doesn't pull the auditService chain at load time (it would
    // create a cycle via the db pool import).
    (async () => {
      try {
        const { default: auditService } = await import('./auditService');
        await auditService.logAction({
          tenantId: key.organization_id,
          action: 'api_key_expired',
          resourceType: 'api_key',
          resourceId: String(key.id),
          details: {
            outcome: 'expired',
            reason: 'past_expires_at',
            expiresAt: key.expires_at,
          },
        });
      } catch {
        /* audit failure is non-fatal */
      }
    })();
    return { valid: false, reason: 'API key has expired' };
  }

  // Update usage statistics (non-blocking — fire and forget)
  pool.query(
    `UPDATE api_keys
     SET request_count = request_count + 1, last_used_at = NOW()
     WHERE id = $1`,
    [key.id]
  ).catch((err) => {
    // Usage tracking is non-blocking — validation still succeeds — but the
    // failure must not be silent: a corrupted request_count / last_used_at
    // masks suspicious activity and skews billing. Log it.
    log.warn('API key usage tracking failed (non-blocking)', {
      keyId: key.id,
      error: err instanceof Error ? err.message : String(err),
    });
  });

  const scopes = typeof key.scopes === 'string' ? JSON.parse(key.scopes) : key.scopes;

  return {
    valid: true,
    organizationId: key.organization_id,
    scopes,
    rateLimit: key.rate_limit,
    keyId: key.id,
  };
}

// ============================================================================
// REVOCATION
// ============================================================================

/**
 * Revoke an API key. Sets status to 'revoked' and records the revocation timestamp.
 */
export async function revokeApiKey(
  keyId: number,
  organizationId: number
): Promise<boolean> {
  const result = await pool.query(
    `UPDATE api_keys
     SET status = 'revoked', revoked_at = NOW()
     WHERE id = $1 AND organization_id = $2 AND status = 'active'
     RETURNING id`,
    [keyId, organizationId]
  );

  return result.rows.length > 0;
}

// ============================================================================
// LISTING
// ============================================================================

/**
 * List all API keys for an organization.
 * Returns metadata only — never the key hash.
 */
export async function listApiKeys(organizationId: number): Promise<ApiKeyListItem[]> {
  const result = await pool.query(
    `SELECT id, uuid, name, key_prefix, scopes, status, expires_at,
            last_used_at, request_count, rate_limit, created_at, revoked_at, created_by
     FROM api_keys
     WHERE organization_id = $1
     ORDER BY created_at DESC`,
    [organizationId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    uuid: row.uuid,
    name: row.name,
    keyPrefix: row.key_prefix,
    scopes: typeof row.scopes === 'string' ? JSON.parse(row.scopes) : row.scopes,
    status: row.status,
    expiresAt: row.expires_at,
    lastUsedAt: row.last_used_at,
    requestCount: row.request_count,
    rateLimit: row.rate_limit,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
    createdBy: row.created_by,
  }));
}

// ============================================================================
// USAGE STATS
// ============================================================================

/**
 * Get usage statistics for a specific API key.
 */
export async function getApiKeyUsage(
  keyId: number,
  organizationId: number
): Promise<ApiKeyUsageStats | null> {
  const result = await pool.query(
    `SELECT id, name, key_prefix, request_count, last_used_at, created_at, status
     FROM api_keys
     WHERE id = $1 AND organization_id = $2`,
    [keyId, organizationId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    name: row.name,
    keyPrefix: row.key_prefix,
    requestCount: row.request_count,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    status: row.status,
  };
}
