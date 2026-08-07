/**
 * Every boot path must record a schema-readiness verdict.
 *
 * THE BUG THIS PINS. `verifyDatabaseConnection` (server/startup/services.ts)
 * had five terminal branches that never called setSchemaReadiness():
 *
 *   - result.errors.length > 0        (verification ran, reported errors)
 *   - result.missingSchemas.length > 0
 *   - result.warnings.length > 0      (success false, warnings only)
 *   - the implicit final else         (success false, no diagnosable cause)
 *   - the outer catch                 (verification ITSELF threw)
 *
 * Each left the process-wide flag at its 'unknown' default, which /readyz then
 * mapped to 'skipped' and served as 200 ready. The last one is the worst: the
 * schema check crashed and the probe reported healthy.
 *
 * The gate in readyz-schema-gate.test.ts covers the probe's mapping of a
 * verdict to a status code. This file covers the other half — that a verdict is
 * actually produced — because a correct mapping of a verdict that is never set
 * is still a green probe on a broken database.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const ensureCoreTables = vi.fn();
vi.mock('../../server/db/ensureCoreTables', () => ({ ensureCoreTables }));

// The remaining imports services.ts pulls in at module load. Stubbed so this
// test exercises the readiness logic and nothing else.
vi.mock('../../server/middleware/redisRateLimiter', () => ({
  initializeRedisRateLimiter: vi.fn(),
}));
vi.mock('../../services/proof/database-setup', () => ({
  initializeProofDatabasePersistence: vi.fn(),
}));
vi.mock('../../server/services/featureToggleService', () => ({ default: {} }));

const { verifyDatabaseConnection } = await import('../../server/startup/services');
const { getSchemaReadiness, getSchemaReadinessDetail, isSchemaReadinessServing, resetSchemaReadinessForTests } =
  await import('../../server/startup/readiness-state');

/** A pool whose connect() succeeds, so only the schema dimension is under test. */
const okPool = { connect: async () => ({ release() {} }) } as any;

/** A fully-clean ensureCoreTables result; each case overrides one dimension. */
const clean = (over: Record<string, unknown> = {}) => ({
  success: true,
  missingCritical: [],
  missingImportant: [],
  missingExtensions: [],
  missingSchemas: [],
  subsystems: [],
  errors: [],
  warnings: [],
  existingSchemas: ['public'],
  existingTables: ['organizations', 'users'],
  ...over,
});

describe('boot always records a schema-readiness verdict', () => {
  beforeEach(() => {
    resetSchemaReadinessForTests();
    ensureCoreTables.mockReset();
    vi.stubEnv('NODE_ENV', 'test');
  });

  it('clean schema → ready, and serves', async () => {
    ensureCoreTables.mockResolvedValue(clean());
    await verifyDatabaseConnection(okPool);
    expect(getSchemaReadiness()).toBe('ready');
    expect(isSchemaReadinessServing()).toBe(true);
  });

  it('verification reported errors → error, does NOT serve', async () => {
    ensureCoreTables.mockResolvedValue(
      clean({ success: false, errors: ['relation "x" does not exist'] })
    );
    await verifyDatabaseConnection(okPool);
    expect(getSchemaReadiness()).toBe('error');
    expect(isSchemaReadinessServing()).toBe(false);
    expect(getSchemaReadinessDetail()).toContain('does not exist');
  });

  it('missing schemas → missing, does NOT serve', async () => {
    ensureCoreTables.mockResolvedValue(clean({ success: false, missingSchemas: ['cmc', 'ectd'] }));
    await verifyDatabaseConnection(okPool);
    expect(getSchemaReadiness()).toBe('missing');
    expect(isSchemaReadinessServing()).toBe(false);
    expect(getSchemaReadinessDetail()).toContain('cmc');
  });

  it('warnings with success=false → error, does NOT serve', async () => {
    ensureCoreTables.mockResolvedValue(clean({ success: false, warnings: ['drift detected'] }));
    await verifyDatabaseConnection(okPool);
    expect(getSchemaReadiness()).toBe('error');
    expect(isSchemaReadinessServing()).toBe(false);
  });

  it('success=false with no diagnosable cause → error, does NOT serve', async () => {
    // The branch that previously did not exist at all: nothing matched, so
    // nothing was recorded, so the probe served 200.
    ensureCoreTables.mockResolvedValue(clean({ success: false }));
    await verifyDatabaseConnection(okPool);
    expect(getSchemaReadiness()).toBe('error');
    expect(isSchemaReadinessServing()).toBe(false);
  });

  it('ensureCoreTables THREW → error, does NOT serve', async () => {
    // The worst of the five: we know less here than anywhere else, and this
    // path used to serve 200.
    ensureCoreTables.mockRejectedValue(new Error('connection terminated unexpectedly'));
    await verifyDatabaseConnection(okPool);
    expect(getSchemaReadiness()).toBe('error');
    expect(isSchemaReadinessServing()).toBe(false);
    expect(getSchemaReadinessDetail()).toContain('connection terminated');
  });

  it('database unreachable (non-production) → error, does NOT serve', async () => {
    const deadPool = {
      connect: async () => {
        throw new Error('ECONNREFUSED');
      },
    } as any;
    await verifyDatabaseConnection(deadPool);
    expect(getSchemaReadiness()).toBe('error');
    expect(isSchemaReadinessServing()).toBe(false);
  });

  describe('security-load-bearing tables', () => {
    it('missing auth/RBAC tables → missing, does NOT serve', async () => {
      // These are classified "important", not "critical", so the flat critical
      // check passes without them. A database that cannot resolve org
      // membership, a role grant, or a token revocation has no safe behaviour
      // available to it. The table names here must be the real load-bearing set
      // (server/startup/services.ts SECURITY_CRITICAL_TABLES) — the earlier
      // auth_users/roles/user_roles were phantom names no migration creates, so
      // the gate keyed on them could never fire.
      ensureCoreTables.mockResolvedValue(
        clean({ missingImportant: ['organization_users', 'platform_role_grants', 'revoked_tokens'] })
      );
      await verifyDatabaseConnection(okPool);
      expect(getSchemaReadiness()).toBe('missing');
      expect(isSchemaReadinessServing()).toBe(false);
      expect(getSchemaReadinessDetail()).toContain('organization_users');
    });

    it('missing only non-essential module tables → degraded, serves but names them', async () => {
      ensureCoreTables.mockResolvedValue(
        clean({ missingImportant: ['cerv2_510k_sections', 'document_templates'] })
      );
      await verifyDatabaseConnection(okPool);
      expect(getSchemaReadiness()).toBe('degraded');
      expect(isSchemaReadinessServing()).toBe(true);
      expect(getSchemaReadinessDetail()).toContain('cerv2_510k_sections');
    });

    it('auth tables outrank module tables when both are absent', async () => {
      ensureCoreTables.mockResolvedValue(
        clean({ missingImportant: ['cerv2_510k_sections', 'revoked_tokens'] })
      );
      await verifyDatabaseConnection(okPool);
      expect(getSchemaReadiness()).toBe('missing');
      expect(isSchemaReadinessServing()).toBe(false);
    });
  });
});
