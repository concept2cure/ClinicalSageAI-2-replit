import { evaluatePasswordPolicy, isPasswordPolicySatisfied } from '../passwordPolicy';

describe('passwordPolicy', () => {
  it('fails incomplete passwords', () => {
    const rules = evaluatePasswordPolicy('short');
    expect(rules.some(rule => !rule.met)).toBe(true);
    expect(isPasswordPolicySatisfied('short')).toBe(false);
  });

  it('passes a policy-compliant password', () => {
    const candidate = 'StrongPass2026!';
    const rules = evaluatePasswordPolicy(candidate);
    expect(rules.every(rule => rule.met)).toBe(true);
    expect(isPasswordPolicySatisfied(candidate)).toBe(true);
  });
});
