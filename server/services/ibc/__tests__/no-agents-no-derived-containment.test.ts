/**
 * With no agents registered there is no required containment level, and with
 * no approval date there is no expiry verdict.
 *
 * evaluateContainment started `highest` at 'BSL-1' and returned it as
 * highestRequiredBsl for a registration with no agents: a required level
 * nobody derived. registrationExpiration(null) returned `expired: false`, the
 * two-boolean shape that reads an approval nobody dated as not expired.
 */
import { describe, it, expect } from 'vitest';
import { evaluateContainment, registrationExpiration } from '../ibc-logic';

describe('containment with no agents registered', () => {
  const r = evaluateContainment({ declaredBsl: 'BSL-2', nihGuidelinesSection: 'III-D', involvesHumanGeneTransfer: false, agents: [] });

  it('derives no required level', () => {
    expect(r.highestRequiredBsl).toBeNull();
  });

  it('says the containment-adequacy check was not assessed, and does not grade the risk as settled', () => {
    expect(r.findings.some((f) => /No biological agents/.test(f.message))).toBe(true);
    expect(r.notAssessed.join(' ')).toMatch(/no agents are registered/i);
    expect(r.riskLevel).toBe('undetermined');
  });
});

describe('registration expiry', () => {
  it('is undetermined, not "not expired", when no approval date is recorded', () => {
    const e = registrationExpiration(null, '2026-10-15');
    expect(e.expired).toBeNull();
    expect(e.expirationDate).toBeNull();
    expect(e.undetermined).toBe(true);
  });

  it('is computed from a recorded approval date', () => {
    expect(registrationExpiration('2025-01-01', '2026-06-10')).toEqual({ undetermined: false, expirationDate: '2026-01-01', expired: true });
  });
});
