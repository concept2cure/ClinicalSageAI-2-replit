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

// ── P0-9a: immutability triggers must exist before production serves (DP-06) ──

import {
  assertAuditImmutabilityForProduction,
  assertAuditIntegritySweepForProduction,
  resolveAuditChainSweepPosture,
} from '../audit-enforcement';
import type { AuditImmutabilityTriggerReport } from '../../services/audit/audit-immutability-triggers';

const healthy: AuditImmutabilityTriggerReport = {
  ok: true, expected: 8, present: 8, missing: [], disabled: [], tablesAbsent: [],
};
const missingDelete: AuditImmutabilityTriggerReport = {
  ok: false, expected: 8, present: 7,
  missing: ['public.audit_logs.trg_audit_logs_no_delete'], disabled: [], tablesAbsent: [],
};
const client = { query: vi.fn() };
const quiet = () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() });

describe('assertAuditImmutabilityForProduction', () => {
  it('returns the report and refuses nothing when every trigger is present', async () => {
    const logger = quiet();
    const check = vi.fn().mockResolvedValue(healthy);
    const report = await assertAuditImmutabilityForProduction(
      client, { NODE_ENV: 'production' } as NodeJS.ProcessEnv, logger, check,
    );
    expect(report).toEqual(healthy);
    expect(check).toHaveBeenCalledWith(client);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('REFUSES TO BOOT in production when a trigger is missing, naming it', async () => {
    const check = vi.fn().mockResolvedValue(missingDelete);
    await expect(
      assertAuditImmutabilityForProduction(client, { NODE_ENV: 'production' } as NodeJS.ProcessEnv, quiet(), check),
    ).rejects.toThrow(/FAIL-CLOSED[\s\S]*public\.audit_logs\.trg_audit_logs_no_delete/);
  });

  it('refuses in production even without AUDIT_REQUIRE_ENFORCE (a missing trigger is not a rollout state)', async () => {
    const check = vi.fn().mockResolvedValue(missingDelete);
    await expect(
      assertAuditImmutabilityForProduction(
        client, { NODE_ENV: 'production', AUDIT_REQUIRE_ENFORCE: 'false' } as NodeJS.ProcessEnv, quiet(), check,
      ),
    ).rejects.toThrow(/FAIL-CLOSED/);
  });

  it('refuses in production when a trigger exists but is disabled', async () => {
    const check = vi.fn().mockResolvedValue({
      ...healthy, ok: false, present: 7, disabled: ['audit.tamper_proof_log.trg_prevent_audit_mutation'],
    });
    await expect(
      assertAuditImmutabilityForProduction(client, { NODE_ENV: 'production' } as NodeJS.ProcessEnv, quiet(), check),
    ).rejects.toThrow(/trg_prevent_audit_mutation/);
  });

  it('warns (structured, no throw) outside production when a trigger is missing', async () => {
    const logger = quiet();
    const check = vi.fn().mockResolvedValue(missingDelete);
    const report = await assertAuditImmutabilityForProduction(
      client, { NODE_ENV: 'development' } as NodeJS.ProcessEnv, logger, check,
    );
    expect(report).toEqual(missingDelete);
    expect(logger.warn).toHaveBeenCalledOnce();
    const [message, context] = logger.warn.mock.calls[0];
    expect(message).toMatch(/trg_audit_logs_no_delete/);
    expect(context).toMatchObject({ missing: ['public.audit_logs.trg_audit_logs_no_delete'] });
  });

  it('refuses in production when the check cannot run and AUDIT_REQUIRE_ENFORCE=true (fail closed)', async () => {
    const check = vi.fn().mockRejectedValue(new Error('connection refused'));
    await expect(
      assertAuditImmutabilityForProduction(
        client, { NODE_ENV: 'production', AUDIT_REQUIRE_ENFORCE: 'true' } as NodeJS.ProcessEnv, quiet(), check,
      ),
    ).rejects.toThrow(/FAIL-CLOSED[\s\S]*could not be verified[\s\S]*connection refused/);
  });

  it('warns loudly, and never reports a pass, when the check cannot run in production without the enforce flag', async () => {
    const logger = quiet();
    const check = vi.fn().mockRejectedValue(new Error('connection refused'));
    const report = await assertAuditImmutabilityForProduction(
      client, { NODE_ENV: 'production' } as NodeJS.ProcessEnv, logger, check,
    );
    expect(report).toBeNull();
    expect(logger.warn).toHaveBeenCalledOnce();
    expect(logger.warn.mock.calls[0][0]).toMatch(/could not be verified/);
  });

  it('refuses in production when AUDIT_REQUIRE_ENFORCE=true and the daily sweep is switched off', async () => {
    const check = vi.fn().mockResolvedValue(healthy);
    await expect(
      assertAuditImmutabilityForProduction(
        client,
        { NODE_ENV: 'production', AUDIT_REQUIRE_ENFORCE: 'true', ENABLE_AUDIT_CHAIN_CHECK: 'false' } as NodeJS.ProcessEnv,
        quiet(),
        check,
      ),
    ).rejects.toThrow(/FAIL-CLOSED[\s\S]*ENABLE_AUDIT_CHAIN_CHECK/);
    // The database is not consulted for a posture the environment already refuses.
    expect(check).not.toHaveBeenCalled();
  });
});

describe('assertAuditIntegritySweepForProduction', () => {
  it('is a no-op outside production and without the enforce flag', () => {
    expect(() =>
      assertAuditIntegritySweepForProduction({ NODE_ENV: 'development', ENABLE_AUDIT_CHAIN_CHECK: 'false' } as NodeJS.ProcessEnv),
    ).not.toThrow();
    expect(() =>
      assertAuditIntegritySweepForProduction({ NODE_ENV: 'production', ENABLE_AUDIT_CHAIN_CHECK: 'false' } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });

  it('throws in production when AUDIT_REQUIRE_ENFORCE=true and the sweep is disabled', () => {
    expect(() =>
      assertAuditIntegritySweepForProduction({
        NODE_ENV: 'production', AUDIT_REQUIRE_ENFORCE: 'true', ENABLE_AUDIT_CHAIN_CHECK: 'false',
      } as NodeJS.ProcessEnv),
    ).toThrow(/FAIL-CLOSED/);
  });

  it('does not throw in production with AUDIT_REQUIRE_ENFORCE=true when the sweep is on (the production default)', () => {
    expect(() =>
      assertAuditIntegritySweepForProduction({ NODE_ENV: 'production', AUDIT_REQUIRE_ENFORCE: 'true' } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });
});

describe('resolveAuditChainSweepPosture (the sweep gating matrix, shared with the job)', () => {
  const env = (o: Record<string, string>) => o as NodeJS.ProcessEnv;
  it('ENABLE_AUDIT_CHAIN_CHECK=false never schedules', () => {
    expect(resolveAuditChainSweepPosture(env({ NODE_ENV: 'production', ENABLE_AUDIT_CHAIN_CHECK: 'false' })).enabled).toBe(false);
    expect(resolveAuditChainSweepPosture(env({ AUDIT_TRAIL_ENABLED: 'true', ENABLE_AUDIT_CHAIN_CHECK: 'false' })).enabled).toBe(false);
  });
  it('ENABLE_AUDIT_CHAIN_CHECK=true always schedules', () => {
    expect(resolveAuditChainSweepPosture(env({ ENABLE_AUDIT_CHAIN_CHECK: 'true' })).enabled).toBe(true);
  });
  it('unset: on in production, on elsewhere only with the audit trail active', () => {
    expect(resolveAuditChainSweepPosture(env({ NODE_ENV: 'production' })).enabled).toBe(true);
    expect(resolveAuditChainSweepPosture(env({ NODE_ENV: 'development', AUDIT_TRAIL_ENABLED: 'true' })).enabled).toBe(true);
    expect(resolveAuditChainSweepPosture(env({ NODE_ENV: 'development' })).enabled).toBe(false);
  });
  it('names the controlling variable', () => {
    expect(resolveAuditChainSweepPosture(env({})).controlledBy).toBe('ENABLE_AUDIT_CHAIN_CHECK');
  });
});
