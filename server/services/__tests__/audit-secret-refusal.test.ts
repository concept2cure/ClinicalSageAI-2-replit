/**
 * A missing audit signing secret must stop a production process, not demote it.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * TamperProofAuditLog's constructor refuses in production when
 * AUDIT_HMAC_SECRET is absent, and says so:
 *
 *     '[FATAL] AUDIT_HMAC_SECRET is required in production. … Refusing to start.'
 *
 * It was constructed inside auditService.ensureInitialized(), whose catch read:
 *
 *     } catch (error) {
 *       logger.warn('Tamper-proof audit unavailable — fallback to console', error);
 *       return null;
 *     }
 *
 * So the refusal was caught, one warning was logged, and the process started —
 * writing its 21 CFR Part 11 records to stdout. Observed at a real production
 * boot: the log line "[audit-service] Tamper-proof audit unavailable — fallback
 * to console" carrying that same "Refusing to start." text inside it.
 *
 * The hole is the one server/services/audit/auditSealPosture.ts was written to
 * close for the SEALING key (AUDIT_HMAC_KEY), whose header describes it exactly:
 * "a production deploy that simply never set AUDIT_HMAC_KEY" boots unsealed.
 * The CHAINING key (AUDIT_HMAC_SECRET) had its own refusal written, and a catch
 * two modules away defeated it.
 *
 * ── The fix, and what this pins ──────────────────────────────────────────────
 * A refusal a caller can catch is not a boot gate, so the gate moved to where
 * this codebase already refuses to boot: config load, beside the SEAL key's
 * assertion, fired on import from server/config/environment.ts. That is the
 * mechanism that stops the process, and it is what the first three cases pin —
 * absent, present-but-weak, and adequate.
 *
 * The constructor's own refusal stays, and is now a distinct type
 * (AuditConfigurationError) so auditService can tell a configuration decision
 * from a transient database failure and stop demoting the first. In production
 * the boot gate means nothing should ever reach it; the last two cases pin it
 * anyway, because "unreachable" is a property of today's call graph.
 *
 * Outside production nothing refuses at all — the constructor warns and uses a
 * development fallback, and no real records are at risk. The final case pins
 * that, so the gate cannot quietly grow into non-production.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../db', () => ({
  pool: { query: vi.fn(async () => ({ rows: [] })) },
  getPool: () => ({ query: vi.fn(async () => ({ rows: [] })) }),
  db: {},
}));

const ENTRY = {
  tenantId: 3,
  userId: 7,
  action: 'test.action',
  resourceType: 'test_resource',
  resourceId: 'R1',
};

const ORIGINAL_ENV = process.env.NODE_ENV;
const ORIGINAL_SECRET = process.env.AUDIT_HMAC_SECRET;

beforeEach(() => {
  // auditService caches the tamper-proof log in a module-level binding, so the
  // module is re-imported per test rather than shared across them.
  vi.resetModules();
});

afterEach(() => {
  if (ORIGINAL_ENV === undefined) delete (process.env as Record<string, unknown>).NODE_ENV;
  else process.env.NODE_ENV = ORIGINAL_ENV;
  if (ORIGINAL_SECRET === undefined) delete process.env.AUDIT_HMAC_SECRET;
  else process.env.AUDIT_HMAC_SECRET = ORIGINAL_SECRET;
});

describe('AUDIT_HMAC_SECRET missing in production', () => {
  it('REFUSES TO BOOT — the gate is at config load, not at first audit write', async () => {
    const { assertAuditChainSecretForProduction } = await import(
      '../audit/auditSealPosture'
    );
    expect(() =>
      assertAuditChainSecretForProduction({ NODE_ENV: 'production' } as NodeJS.ProcessEnv),
    ).toThrow(/REFUSING TO BOOT: AUDIT_HMAC_SECRET is not configured/);
  });

  it('refuses a present-but-weak secret too — a short key is a misconfiguration', async () => {
    const { assertAuditChainSecretForProduction } = await import(
      '../audit/auditSealPosture'
    );
    expect(() =>
      assertAuditChainSecretForProduction({
        NODE_ENV: 'production',
        AUDIT_HMAC_SECRET: 'too-short',
      } as NodeJS.ProcessEnv),
    ).toThrow(/REFUSING TO BOOT: AUDIT_HMAC_SECRET is too short/);
  });

  it('accepts a secret of adequate length', async () => {
    const { assertAuditChainSecretForProduction } = await import(
      '../audit/auditSealPosture'
    );
    expect(() =>
      assertAuditChainSecretForProduction({
        NODE_ENV: 'production',
        AUDIT_HMAC_SECRET: 'a'.repeat(32),
      } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });

  it('still refuses to DEMOTE the lazy construction, if anything reaches it', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.AUDIT_HMAC_SECRET;

    const { AuditConfigurationError } = await import('../../lib/tamper-proof-audit');
    const { TamperProofAuditLog } = await import('../../lib/tamper-proof-audit');

    // The constructor's own refusal, now typed so auditService can tell it from
    // a transient database failure and let this one through.
    expect(() => new TamperProofAuditLog({} as never)).toThrow(AuditConfigurationError);
  });

  it('is a distinct error type, so only THIS failure is allowed through', async () => {
    const { AuditConfigurationError } = await import('../../lib/tamper-proof-audit');
    expect(new AuditConfigurationError('x')).toBeInstanceOf(Error);
    expect(new AuditConfigurationError('x').name).toBe('AuditConfigurationError');
  });
});

describe('AUDIT_HMAC_SECRET missing outside production', () => {
  it('does not refuse — the constructor warns and uses a development fallback', async () => {
    process.env.NODE_ENV = 'test';
    delete process.env.AUDIT_HMAC_SECRET;

    const { default: auditService } = await import('../auditService');

    // Resolves rather than rejecting. What it reports about persistence is the
    // sibling suites' subject; what matters here is that nothing refused.
    await expect(auditService.logAction({ ...ENTRY })).resolves.toBeDefined();
  });
});
