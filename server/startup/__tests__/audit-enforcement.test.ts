import { describe, it, expect, vi } from 'vitest';
import { isAuditTrailActive, assertAuditTrailForProduction } from '../audit-enforcement';

describe('isAuditTrailActive', () => {
  it('is true only when AUDIT_TRAIL_ENABLED === "true"', () => {
    expect(isAuditTrailActive({ AUDIT_TRAIL_ENABLED: 'true' } as NodeJS.ProcessEnv)).toBe(true);
    expect(isAuditTrailActive({ AUDIT_TRAIL_ENABLED: 'false' } as NodeJS.ProcessEnv)).toBe(false);
    expect(isAuditTrailActive({} as NodeJS.ProcessEnv)).toBe(false);
    // Must be the exact string, not a truthy variant.
    expect(isAuditTrailActive({ AUDIT_TRAIL_ENABLED: '1' } as NodeJS.ProcessEnv)).toBe(false);
  });
});

describe('assertAuditTrailForProduction', () => {
  it('is a no-op (no warn, no throw) outside production', () => {
    const logger = { warn: vi.fn() };
    const active = assertAuditTrailForProduction(
      { NODE_ENV: 'development', AUDIT_TRAIL_ENABLED: 'false' } as NodeJS.ProcessEnv,
      logger,
    );
    expect(active).toBe(false);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('is silent in production when the audit trail is active', () => {
    const logger = { warn: vi.fn() };
    const active = assertAuditTrailForProduction(
      { NODE_ENV: 'production', AUDIT_TRAIL_ENABLED: 'true' } as NodeJS.ProcessEnv,
      logger,
    );
    expect(active).toBe(true);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('warns (but does not throw) in production when the audit trail is off', () => {
    const logger = { warn: vi.fn() };
    const active = assertAuditTrailForProduction(
      { NODE_ENV: 'production', AUDIT_TRAIL_ENABLED: 'false' } as NodeJS.ProcessEnv,
      logger,
    );
    expect(active).toBe(false);
    expect(logger.warn).toHaveBeenCalledOnce();
    expect(logger.warn.mock.calls[0][0]).toMatch(/§11\.10\(e\)|audit trail inactive/i);
  });

  it('fails closed (throws) when AUDIT_REQUIRE_ENFORCE=true and audit is off in production', () => {
    expect(() =>
      assertAuditTrailForProduction({
        NODE_ENV: 'production',
        AUDIT_TRAIL_ENABLED: 'false',
        AUDIT_REQUIRE_ENFORCE: 'true',
      } as NodeJS.ProcessEnv, { warn: () => {} }),
    ).toThrow(/FAIL-CLOSED/);
  });

  it('does NOT fail closed when AUDIT_REQUIRE_ENFORCE=true but audit IS active', () => {
    expect(() =>
      assertAuditTrailForProduction({
        NODE_ENV: 'production',
        AUDIT_TRAIL_ENABLED: 'true',
        AUDIT_REQUIRE_ENFORCE: 'true',
      } as NodeJS.ProcessEnv, { warn: () => {} }),
    ).not.toThrow();
  });
});
