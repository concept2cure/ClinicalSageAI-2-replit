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

describe('isGroundednessEnforced', () => {
  it('is true only for the exact "1"/"true" opt-in values', () => {
    expect(isGroundednessEnforced({} as NodeJS.ProcessEnv)).toBe(false);
    expect(isGroundednessEnforced({ AI_GROUNDEDNESS_ENFORCE: '1' } as NodeJS.ProcessEnv)).toBe(true);
    expect(isGroundednessEnforced({ AI_GROUNDEDNESS_ENFORCE: 'true' } as NodeJS.ProcessEnv)).toBe(true);
    expect(isGroundednessEnforced({ AI_GROUNDEDNESS_ENFORCE: 'yes' } as NodeJS.ProcessEnv)).toBe(false);
  });
});

describe('assertAiGovernancePostureForProduction', () => {
  const PROD_PERMISSIVE = { NODE_ENV: 'production' } as NodeJS.ProcessEnv; // both gates default-permissive
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
    expect(posture).toEqual({ piiEnforcement: 'audit', groundednessEnforced: false });
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
      { NODE_ENV: 'production', AI_PII_ENFORCEMENT: 'block' } as NodeJS.ProcessEnv,
      logger,
    );
    const msg = logger.warn.mock.calls[0][0] as string;
    expect(msg).toContain('AI_GROUNDEDNESS_ENFORCE');
    expect(msg).not.toContain('AI_PII_ENFORCEMENT');
  });

  it('does NOT change runtime behaviour — never blocks when only warning', () => {
    // The advisory returns the resolved posture; enforcement is unchanged.
    const posture = assertAiGovernancePostureForProduction(PROD_PERMISSIVE, { warn: vi.fn() });
    expect(posture.piiEnforcement).toBe('audit');
    expect(posture.groundednessEnforced).toBe(false);
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
