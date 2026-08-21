import { describe, it, expect, vi } from 'vitest';
import {
  readPiiEnforcement,
  isGroundednessEnforced,
  assertAiGovernancePostureForProduction,
} from '../ai-governance-posture';

describe('readPiiEnforcement', () => {
  it('defaults to "audit" and only recognizes off/audit/block', () => {
    expect(readPiiEnforcement({} as NodeJS.ProcessEnv)).toBe('audit');
    expect(readPiiEnforcement({ AI_PII_ENFORCEMENT: 'off' } as NodeJS.ProcessEnv)).toBe('off');
    expect(readPiiEnforcement({ AI_PII_ENFORCEMENT: 'BLOCK' } as NodeJS.ProcessEnv)).toBe('block');
    // Unrecognized value falls back to the permissive default, not through.
    expect(readPiiEnforcement({ AI_PII_ENFORCEMENT: 'strict' } as NodeJS.ProcessEnv)).toBe('audit');
  });
});

/**
 * The gate is ON by default as of 2026-08-13 — it must be turned OFF
 * explicitly. The old contract was the inverse (opt-IN via exactly "1"/"true"),
 * so these expectations invert deliberately rather than by accident.
 */
describe('isGroundednessEnforced', () => {
  it('is enforced unless explicitly disabled', () => {
    expect(isGroundednessEnforced({} as NodeJS.ProcessEnv)).toBe(true);
    expect(isGroundednessEnforced({ AI_GROUNDEDNESS_ENFORCE: '' } as NodeJS.ProcessEnv)).toBe(true);
    expect(isGroundednessEnforced({ AI_GROUNDEDNESS_ENFORCE: '1' } as NodeJS.ProcessEnv)).toBe(true);
    expect(isGroundednessEnforced({ AI_GROUNDEDNESS_ENFORCE: 'true' } as NodeJS.ProcessEnv)).toBe(true);
    // An unrecognized value must not silently DISABLE a safety gate.
    expect(isGroundednessEnforced({ AI_GROUNDEDNESS_ENFORCE: 'yes' } as NodeJS.ProcessEnv)).toBe(true);
    expect(isGroundednessEnforced({ AI_GROUNDEDNESS_ENFORCE: '0' } as NodeJS.ProcessEnv)).toBe(false);
    expect(isGroundednessEnforced({ AI_GROUNDEDNESS_ENFORCE: 'false' } as NodeJS.ProcessEnv)).toBe(false);
    expect(isGroundednessEnforced({ AI_GROUNDEDNESS_ENFORCE: 'off' } as NodeJS.ProcessEnv)).toBe(false);
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

describe('assertAiGovernancePostureForProduction', () => {
  // Groundedness now defaults ON, so making BOTH gates permissive requires
  // turning it off explicitly. Leaving this as bare { NODE_ENV: 'production' }
  // would have quietly become a one-permissive-gate fixture.
  const PROD_PERMISSIVE = {
    NODE_ENV: 'production',
    AI_GROUNDEDNESS_ENFORCE: '0',
  } as NodeJS.ProcessEnv;
  const PROD_STRICT = {
    NODE_ENV: 'production',
    AI_PII_ENFORCEMENT: 'block',
    AI_GROUNDEDNESS_ENFORCE: '1',
  } as NodeJS.ProcessEnv;

  it('is a no-op (no warn, no throw) outside production even when permissive', () => {
    const logger = { warn: vi.fn() };
    const posture = assertAiGovernancePostureForProduction(
      { NODE_ENV: 'development' } as NodeJS.ProcessEnv,
      logger,
    );
    expect(posture).toEqual({ piiEnforcement: 'audit', groundednessEnforced: true });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('is silent in production when both gates are strict', () => {
    const logger = { warn: vi.fn() };
    assertAiGovernancePostureForProduction(PROD_STRICT, logger);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('warns (does not throw) in production when a gate is permissive', () => {
    const logger = { warn: vi.fn() };
    expect(() => assertAiGovernancePostureForProduction(PROD_PERMISSIVE, logger)).not.toThrow();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    const msg = logger.warn.mock.calls[0][0] as string;
    expect(msg).toContain('AI_PII_ENFORCEMENT');
    expect(msg).toContain('AI_GROUNDEDNESS_ENFORCE');
  });

  it('names only the permissive gate when the other is strict', () => {
    const logger = { warn: vi.fn() };
    assertAiGovernancePostureForProduction(
      { NODE_ENV: 'production', AI_PII_ENFORCEMENT: 'block', AI_GROUNDEDNESS_ENFORCE: '0' } as NodeJS.ProcessEnv,
      logger,
    );
    const msg = logger.warn.mock.calls[0][0] as string;
    expect(msg).toContain('AI_GROUNDEDNESS_ENFORCE');
    // The remediation footer always names both env vars ("set AI_PII_ENFORCEMENT=block
    // and AI_GROUNDEDNESS_ENFORCE=1"), so assert on the PII *permissive clause* marker
    // ("PHI/PII may reach…") which appears only when the PII gate itself is permissive.
    expect(msg).not.toContain('PHI/PII');
  });

  it('does NOT change runtime behaviour — never blocks when only warning', () => {
    // The advisory returns the resolved posture; enforcement is unchanged.
    const posture = assertAiGovernancePostureForProduction(PROD_PERMISSIVE, { warn: vi.fn() });
    expect(posture.piiEnforcement).toBe('audit');
    expect(posture.groundednessEnforced).toBe(false); // PROD_PERMISSIVE turns it off explicitly
  });

  it('fails closed only when the operator opts in via AI_GOVERNANCE_REQUIRE_ENFORCE=true', () => {
    const logger = { warn: vi.fn() };
    expect(() =>
      assertAiGovernancePostureForProduction(
        { ...PROD_PERMISSIVE, AI_GOVERNANCE_REQUIRE_ENFORCE: 'true' } as NodeJS.ProcessEnv,
        logger,
      ),
    ).toThrow(/FAIL-CLOSED/);
    // Opt-in fail-closed does not fire in non-production or when strict.
    expect(() =>
      assertAiGovernancePostureForProduction(
        { ...PROD_STRICT, AI_GOVERNANCE_REQUIRE_ENFORCE: 'true' } as NodeJS.ProcessEnv,
        logger,
      ),
    ).not.toThrow();
  });
});
