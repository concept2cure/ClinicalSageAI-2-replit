/**
 * IBC deterministic logic (C2C-07) — risk-group→BSL mapping, containment-adequacy
 * gate, convened-review requirement, annual expiration. Pure, no DB/LLM.
 */

import { describe, it, expect } from 'vitest';
import {
  RISK_GROUPS,
  minimumBslForRiskGroup,
  evaluateContainment,
  requiresConvenedReview,
  registrationExpiration,
  type IbcCompletenessInput,
} from '../ibc-logic';

const bsl2ok: IbcCompletenessInput = {
  declaredBsl: 'BSL-2',
  nihGuidelinesSection: 'III-D',
  involvesHumanGeneTransfer: false,
  agents: [{ agentName: 'Lentiviral vector', riskGroup: 'RG2', requiredBsl: 'BSL-2' }],
};

describe('risk-group → BSL', () => {
  it('maps RG1-4 to BSL-1..4', () => {
    expect(minimumBslForRiskGroup('RG1')).toBe('BSL-1');
    expect(minimumBslForRiskGroup('RG3')).toBe('BSL-3');
    expect(RISK_GROUPS).toHaveLength(4);
  });
});

describe('evaluateContainment', () => {
  it('passes adequate containment (low/minor)', () => {
    const r = evaluateContainment(bsl2ok);
    expect(r.highestRequiredBsl).toBe('BSL-2');
    expect(r.riskLevel).toBe('low');
  });
  it('flags declared BSL below the agents’ requirement as critical', () => {
    const r = evaluateContainment({ ...bsl2ok, declaredBsl: 'BSL-1', agents: [{ agentName: 'M. tuberculosis', riskGroup: 'RG3', requiredBsl: 'BSL-3' }] });
    expect(r.riskLevel).toBe('high');
    expect(r.findings.some((f) => /below the BSL-3/i.test(f.message))).toBe(true);
  });
  it('flags an agent registered below its risk group as major', () => {
    const r = evaluateContainment({ ...bsl2ok, declaredBsl: 'BSL-3', agents: [{ agentName: 'X', riskGroup: 'RG3', requiredBsl: 'BSL-2' }] });
    expect(r.findings.some((f) => /requires at least BSL-3/i.test(f.message))).toBe(true);
  });
  it('notes convened review for III-C / human gene transfer', () => {
    const r = evaluateContainment({ ...bsl2ok, nihGuidelinesSection: 'III-C', involvesHumanGeneTransfer: true });
    expect(r.findings.some((f) => /convened IBC/i.test(f.message))).toBe(true);
  });
  it('flags no agents registered', () => {
    const r = evaluateContainment({ ...bsl2ok, agents: [] });
    expect(r.findings.some((f) => /No biological agents/i.test(f.message))).toBe(true);
  });
});

describe('requiresConvenedReview', () => {
  it('is true for III-A/B/C or human gene transfer', () => {
    expect(requiresConvenedReview('III-A', false)).toBe(true);
    expect(requiresConvenedReview('III-D', true)).toBe(true);
    expect(requiresConvenedReview('III-E', false)).toBe(false);
  });
});

describe('registrationExpiration', () => {
  it('sets a 1-year expiration and detects expiry', () => {
    const r = registrationExpiration('2025-01-01', '2026-06-10');
    expect(r.expirationDate).toBe('2026-01-01');
    expect(r.expired).toBe(true);
  });
  it('returns nulls for an unapproved registration', () => {
    expect(registrationExpiration(null, '2026-06-10')).toEqual({ expirationDate: null, expired: false });
  });
});
