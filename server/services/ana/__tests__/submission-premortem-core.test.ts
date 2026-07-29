/**
 * Submission pre-mortem composition — pure, honest-by-construction core.
 * No DB, no LLM, no mocks. These tests pin the trust contract: confidence is
 * tied to the precedent denominator and never overstated.
 */
import { describe, it, expect } from 'vitest';
import {
  composePremortem,
  confidenceFromDenominator,
  overallRiskFromFindings,
  rankFindings,
  type PremortemFinding,
} from '../submission-premortem-core';

const finding = (over: Partial<PremortemFinding>): PremortemFinding => ({
  patternId: 'P',
  title: 'pattern',
  category: 'deficiency',
  severity: 'medium',
  matchedText: '…',
  matchConfidence: 80,
  reviewerQuestion: 'Why?',
  regulatoryBasis: 'ICH',
  remediation: 'Fix it.',
  ...over,
});

describe('confidenceFromDenominator', () => {
  it('ties confidence to the denominator and never overstates at cold start', () => {
    expect(confidenceFromDenominator(0)).toBe('low');
    expect(confidenceFromDenominator(4)).toBe('low');
    expect(confidenceFromDenominator(5)).toBe('medium');
    expect(confidenceFromDenominator(19)).toBe('medium');
    expect(confidenceFromDenominator(20)).toBe('high');
  });
});

describe('overallRiskFromFindings', () => {
  it('escalates on criticals and multiple highs', () => {
    expect(overallRiskFromFindings([finding({ severity: 'critical' })])).toBe('critical');
    expect(overallRiskFromFindings([finding({ severity: 'high' }), finding({ severity: 'high' })])).toBe('high');
    expect(overallRiskFromFindings([finding({ severity: 'high' })])).toBe('moderate');
    expect(overallRiskFromFindings([finding({ severity: 'medium' })])).toBe('moderate');
    expect(overallRiskFromFindings([finding({ severity: 'low' })])).toBe('low');
    expect(overallRiskFromFindings([])).toBe('low');
  });
});

describe('rankFindings', () => {
  it('orders by severity then match confidence', () => {
    const ranked = rankFindings([
      finding({ patternId: 'lowsev', severity: 'low', matchConfidence: 99 }),
      finding({ patternId: 'critA', severity: 'critical', matchConfidence: 50 }),
      finding({ patternId: 'critB', severity: 'critical', matchConfidence: 90 }),
    ]);
    expect(ranked.map(f => f.patternId)).toEqual(['critB', 'critA', 'lowsev']);
  });
});

describe('composePremortem — honest by construction', () => {
  it('flags pattern-only with low confidence when there is no precedent corpus', () => {
    const v = composePremortem({
      findings: [finding({ severity: 'high' })],
      precedentCount: 0,
      precedentCitations: [],
      submissionType: 'IND',
      agency: 'FDA',
    });
    expect(v.denominator).toBe(0);
    expect(v.confidence).toBe('low');
    expect(v.honestyNote).toMatch(/PATTERN-ONLY/i);
    expect(v.summary).toContain('n=0');
  });

  it('reports calibrated confidence with the denominator when precedents exist', () => {
    const v = composePremortem({
      findings: [finding({ severity: 'critical' })],
      precedentCount: 25,
      precedentCitations: [{ id: '1', label: 'K123', outcome: 'CLEARED' }],
      submissionType: '510(k)',
      agency: 'FDA',
    });
    expect(v.confidence).toBe('high');
    expect(v.riskLevel).toBe('critical');
    expect(v.honestyNote).toBeNull();
    expect(v.summary).toContain('n=25');
    expect(v.precedentCitations).toHaveLength(1);
  });

  it('does not claim soundness when nothing matched', () => {
    const v = composePremortem({ findings: [], precedentCount: 10, precedentCitations: [] });
    expect(v.findingsCount).toBe(0);
    expect(v.summary).toMatch(/NOT proof of soundness/i);
  });

  it('caps precedent citations at five', () => {
    const cites = Array.from({ length: 9 }, (_, i) => ({ id: String(i), label: `K${i}`, outcome: 'CLEARED' }));
    const v = composePremortem({ findings: [], precedentCount: 9, precedentCitations: cites });
    expect(v.precedentCitations).toHaveLength(5);
  });
});
