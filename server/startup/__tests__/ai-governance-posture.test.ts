import { describe, it, expect, vi } from 'vitest';
import {
  readPiiEnforcement,
  isGroundednessEnforced,
  assertAiGovernancePostureForProduction,
} from '../ai-governance-posture';
import { resolvePiiEnforcement } from '../../services/ai-gateway/pii-screen';

const env = (o: Record<string, string>) => o as NodeJS.ProcessEnv;

describe('readPiiEnforcement (non-production — unchanged contract)', () => {
  it('defaults to "audit" and only recognizes off/audit/block', () => {
    expect(readPiiEnforcement(env({}))).toBe('audit');
    expect(readPiiEnforcement(env({ NODE_ENV: 'development' }))).toBe('audit');
    expect(readPiiEnforcement(env({ NODE_ENV: 'staging' }))).toBe('audit');
    expect(readPiiEnforcement(env({ AI_PII_ENFORCEMENT: 'off' }))).toBe('off');
    expect(readPiiEnforcement(env({ AI_PII_ENFORCEMENT: 'BLOCK' }))).toBe('block');
    // Unrecognized value falls back to the non-production default, not through.
    expect(readPiiEnforcement(env({ AI_PII_ENFORCEMENT: 'strict' }))).toBe('audit');
  });

  it('is the same resolver pii-screen.ts uses (imported, not duplicated)', () => {
    for (const e of [{}, { AI_PII_ENFORCEMENT: 'off' }, { NODE_ENV: 'production' }, { NODE_ENV: 'production', AI_PII_ENFORCEMENT: 'audit' }]) {
      expect(readPiiEnforcement(env(e))).toBe(resolvePiiEnforcement(env(e)).effective);
    }
  });
});

/**
 * Production PII default (runbook B19): unset → block; an explicit permissive
 * value is honoured only with the written acceptance, and is otherwise forced
 * to block as defence in depth (the boot gate refuses that config anyway).
 */
describe('readPiiEnforcement (production — fail-closed default)', () => {
  it('defaults to "block" when unset or unrecognized', () => {
    expect(resolvePiiEnforcement(env({ NODE_ENV: 'production' }))).toEqual({
      configured: undefined,
      effective: 'block',
      forcedByProductionDefault: false,
    });
    expect(readPiiEnforcement(env({ NODE_ENV: 'production', AI_PII_ENFORCEMENT: 'strict' }))).toBe('block');
  });

  it('forces an unaccepted explicit permissive value to "block"', () => {
    expect(resolvePiiEnforcement(env({ NODE_ENV: 'production', AI_PII_ENFORCEMENT: 'audit' }))).toEqual({
      configured: 'audit',
      effective: 'block',
      forcedByProductionDefault: true,
    });
    expect(readPiiEnforcement(env({ NODE_ENV: 'production', AI_PII_ENFORCEMENT: 'off' }))).toBe('block');
  });

  it('honours an explicit permissive value only under AI_GOVERNANCE_ACCEPT_PERMISSIVE=true', () => {
    expect(
      readPiiEnforcement(
        env({ NODE_ENV: 'production', AI_PII_ENFORCEMENT: 'audit', AI_GOVERNANCE_ACCEPT_PERMISSIVE: 'true' }),
      ),
    ).toBe('audit');
    // Only the literal "true" accepts.
    expect(
      readPiiEnforcement(env({ NODE_ENV: 'production', AI_PII_ENFORCEMENT: 'audit', AI_GOVERNANCE_ACCEPT_PERMISSIVE: '1' })),
    ).toBe('block');
  });
});

/**
 * The gate is ON by default as of 2026-08-13 — it must be turned OFF
 * explicitly. The old contract was the inverse (opt-IN via exactly "1"/"true"),
 * so these expectations invert deliberately rather than by accident.
 */
describe('isGroundednessEnforced', () => {
  it('is enforced unless explicitly disabled', () => {
    expect(isGroundednessEnforced(env({}))).toBe(true);
    expect(isGroundednessEnforced(env({ AI_GROUNDEDNESS_ENFORCE: '' }))).toBe(true);
    expect(isGroundednessEnforced(env({ AI_GROUNDEDNESS_ENFORCE: '1' }))).toBe(true);
    expect(isGroundednessEnforced(env({ AI_GROUNDEDNESS_ENFORCE: 'true' }))).toBe(true);
    // An unrecognized value must not silently DISABLE a safety gate.
    expect(isGroundednessEnforced(env({ AI_GROUNDEDNESS_ENFORCE: 'yes' }))).toBe(true);
    expect(isGroundednessEnforced(env({ AI_GROUNDEDNESS_ENFORCE: '0' }))).toBe(false);
    expect(isGroundednessEnforced(env({ AI_GROUNDEDNESS_ENFORCE: 'false' }))).toBe(false);
    expect(isGroundednessEnforced(env({ AI_GROUNDEDNESS_ENFORCE: 'off' }))).toBe(false);
  });

  /**
   * ai-governance-posture.ts deliberately DUPLICATES
   * groundedness.ts::groundednessEnforcedByDefault() rather than importing it,
   * so the posture check stays a pure env-injectable function. Duplication
   * drifts, and a drift here is not cosmetic — this module is what TELLS the
   * operator what the posture is, so a stale mirror reports "off" on a
   * deployment that is enforcing. Pin them to the same table.
   */
  it('agrees with groundedness.ts on every input — the two must not drift', async () => {
    const { groundednessEnforcedByDefault } = await import(
      '../../services/ai-governance/groundedness'
    );
    const saved = process.env.AI_GROUNDEDNESS_ENFORCE;
    try {
      for (const v of [undefined, '', '1', 'true', 'TRUE', 'yes', '0', 'false', 'off', 'OFF']) {
        if (v === undefined) delete process.env.AI_GROUNDEDNESS_ENFORCE;
        else process.env.AI_GROUNDEDNESS_ENFORCE = v;
        const viaEnvArg = isGroundednessEnforced(
          (v === undefined ? {} : { AI_GROUNDEDNESS_ENFORCE: v }) as NodeJS.ProcessEnv,
        );
        expect(groundednessEnforcedByDefault(), `disagreement on ${JSON.stringify(v)}`).toBe(
          viaEnvArg,
        );
      }
    } finally {
      if (saved === undefined) delete process.env.AI_GROUNDEDNESS_ENFORCE;
      else process.env.AI_GROUNDEDNESS_ENFORCE = saved;
    }
  });
});

/**
 * The boot gate. Ordering under test (module header):
 *   1 non-production → no-op · 2 strict → silent · 3 REQUIRE → refuse (beats ACCEPT)
 *   4 ACCEPT → warn once · 5 otherwise → refuse.
 */
describe('assertAiGovernancePostureForProduction', () => {
  const PROD_DEFAULTS = env({ NODE_ENV: 'production' });
  const PROD_PII_PERMISSIVE = env({ NODE_ENV: 'production', AI_PII_ENFORCEMENT: 'audit' });
  const PROD_GROUNDEDNESS_OFF = env({ NODE_ENV: 'production', AI_GROUNDEDNESS_ENFORCE: '0' });
  const PROD_BOTH_PERMISSIVE = env({ NODE_ENV: 'production', AI_PII_ENFORCEMENT: 'off', AI_GROUNDEDNESS_ENFORCE: 'false' });
  const PROD_STRICT = env({ NODE_ENV: 'production', AI_PII_ENFORCEMENT: 'block', AI_GROUNDEDNESS_ENFORCE: '1' });

  it('1. is a no-op (no warn, no throw) outside production even when permissive', () => {
    const logger = { warn: vi.fn() };
    const posture = assertAiGovernancePostureForProduction(
      env({ NODE_ENV: 'development', AI_PII_ENFORCEMENT: 'off', AI_GROUNDEDNESS_ENFORCE: '0' }),
      logger,
    );
    expect(posture).toEqual({
      piiEnforcement: 'off',
      piiConfigured: 'off',
      groundednessEnforced: false,
      posture: 'non-production',
    });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('2. production with both gates UNSET is strict by default — boots silently', () => {
    const logger = { warn: vi.fn() };
    const posture = assertAiGovernancePostureForProduction(PROD_DEFAULTS, logger);
    expect(posture).toEqual({
      piiEnforcement: 'block',
      piiConfigured: undefined,
      groundednessEnforced: true,
      posture: 'strict',
    });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('2. production with both gates explicitly strict boots silently, and ignores a stale acceptance', () => {
    const logger = { warn: vi.fn() };
    expect(assertAiGovernancePostureForProduction(PROD_STRICT, logger).posture).toBe('strict');
    expect(
      assertAiGovernancePostureForProduction(
        env({ ...PROD_STRICT, AI_GOVERNANCE_ACCEPT_PERMISSIVE: 'true', AI_GOVERNANCE_REQUIRE_ENFORCE: 'true' }),
        logger,
      ).posture,
    ).toBe('strict');
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('5. REFUSES TO BOOT on an explicit permissive gate with no acceptance, naming the gate', () => {
    const logger = { warn: vi.fn() };
    expect(() => assertAiGovernancePostureForProduction(PROD_PII_PERMISSIVE, logger)).toThrow(
      /REFUSING TO BOOT.*AI_PII_ENFORCEMENT is "audit".*AI_GOVERNANCE_ACCEPT_PERMISSIVE=true/s,
    );
    expect(() => assertAiGovernancePostureForProduction(PROD_GROUNDEDNESS_OFF, logger)).toThrow(
      /REFUSING TO BOOT.*AI_GROUNDEDNESS_ENFORCE is off/s,
    );
    // Groundedness-only refusal must not blame the PII gate.
    expect(() => assertAiGovernancePostureForProduction(PROD_GROUNDEDNESS_OFF, logger)).not.toThrow(
      /AI_PII_ENFORCEMENT is/,
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('4. boots with ONE structured warning when the acceptance is recorded', () => {
    const logger = { warn: vi.fn() };
    const posture = assertAiGovernancePostureForProduction(
      env({ ...PROD_BOTH_PERMISSIVE, AI_GOVERNANCE_ACCEPT_PERMISSIVE: 'true' }),
      logger,
    );
    expect(posture).toEqual({
      piiEnforcement: 'off',
      piiConfigured: 'off',
      groundednessEnforced: false,
      posture: 'permissive-accepted',
    });
    expect(logger.warn).toHaveBeenCalledTimes(1);
    const [msg, meta] = logger.warn.mock.calls[0] as [string, Record<string, unknown>];
    expect(msg).toContain('AI_PII_ENFORCEMENT is "off"');
    expect(msg).toContain('AI_GROUNDEDNESS_ENFORCE is off');
    expect(meta).toMatchObject({ acceptedVia: 'AI_GOVERNANCE_ACCEPT_PERMISSIVE=true' });
    expect((meta.acceptedRisk as string[]).length).toBe(2);
  });

  it('3. AI_GOVERNANCE_REQUIRE_ENFORCE=true refuses a permissive gate even when accepted', () => {
    const logger = { warn: vi.fn() };
    expect(() =>
      assertAiGovernancePostureForProduction(
        env({ ...PROD_PII_PERMISSIVE, AI_GOVERNANCE_ACCEPT_PERMISSIVE: 'true', AI_GOVERNANCE_REQUIRE_ENFORCE: 'true' }),
        logger,
      ),
    ).toThrow(/FAIL-CLOSED.*regardless of AI_GOVERNANCE_ACCEPT_PERMISSIVE/s);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('only the literal "true" counts as acceptance', () => {
    expect(() =>
      assertAiGovernancePostureForProduction(
        env({ ...PROD_PII_PERMISSIVE, AI_GOVERNANCE_ACCEPT_PERMISSIVE: 'yes' }),
        { warn: vi.fn() },
      ),
    ).toThrow(/REFUSING TO BOOT/);
  });
});
