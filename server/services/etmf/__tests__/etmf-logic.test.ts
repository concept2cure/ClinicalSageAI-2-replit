/**
 * eTMF deterministic logic (C2C-08) — DIA RM zone catalog, auto-classifier, and
 * the completeness gap-check. Pure, no DB/LLM.
 */

import { describe, it, expect } from 'vitest';
import { TMF_ZONES, zoneName, classifyArtifact, evaluateCompleteness, type CompletenessArtifact } from '../etmf-logic';

describe('TMF zones', () => {
  it('has the 11 DIA RM zones', () => {
    expect(TMF_ZONES).toHaveLength(11);
    expect(zoneName(4)).toMatch(/IRB/);
    expect(zoneName(99)).toBe('Unknown');
  });
});

describe('classifyArtifact', () => {
  it('routes informed consent to Zone 4 (IRB/IEC)', () => {
    expect(classifyArtifact('Informed Consent Form v2').zone).toBe(4);
  });
  it('routes the SAP to Zone 11 (Statistics)', () => {
    expect(classifyArtifact('Statistical Analysis Plan').zone).toBe(11);
  });
  it('routes a monitoring visit report to Zone 5', () => {
    expect(classifyArtifact('Monitoring Visit Report - Site 101').zone).toBe(5);
  });
  it('defaults unknown artifacts to Zone 2', () => {
    const c = classifyArtifact('Miscellaneous note');
    expect(c.zone).toBe(2);
    expect(c.confidence).toBe('default');
  });
});

describe('evaluateCompleteness', () => {
  const base: CompletenessArtifact[] = [
    { zone: 2, artifactName: 'Protocol', expected: true, completenessRequired: true, status: 'final' },
    { zone: 4, artifactName: 'IRB Approval', expected: true, completenessRequired: true, status: 'final' },
    { zone: 5, artifactName: '1572', expected: true, completenessRequired: true, status: 'final' },
  ];

  it('scores a fully-final required set at 100 / inspection_ready', () => {
    const r = evaluateCompleteness(base);
    expect(r.completenessPct).toBe(100);
    expect(r.verdict).toBe('inspection_ready');
    expect(r.gaps).toHaveLength(0);
  });
  it('lists non-final required artifacts as gaps', () => {
    const r = evaluateCompleteness([...base, { zone: 7, artifactName: 'SAE log', expected: true, completenessRequired: true, status: 'missing' }]);
    expect(r.gaps.some((g) => /SAE log/.test(g.artifactName))).toBe(true);
    expect(r.completenessPct).toBe(75);
    expect(r.verdict).toBe('at_risk');
  });
  it('ignores not_applicable and non-required artifacts', () => {
    const r = evaluateCompleteness([
      ...base,
      { zone: 9, artifactName: 'Optional vendor doc', expected: true, completenessRequired: false, status: 'missing' },
      { zone: 6, artifactName: 'N/A item', expected: true, completenessRequired: true, status: 'not_applicable' },
    ]);
    expect(r.totalRequired).toBe(3);
    expect(r.completenessPct).toBe(100);
  });
  it('treats received-but-not-final as a (minor) gap', () => {
    const arts: CompletenessArtifact[] = Array.from({ length: 10 }, (_, i) => ({ zone: 2, artifactName: `doc${i}`, expected: true, completenessRequired: true, status: i === 0 ? 'received' : 'final' }));
    const r = evaluateCompleteness(arts);
    expect(r.completenessPct).toBe(90);
    expect(r.verdict).toBe('minor_gaps');
    expect(r.gaps).toHaveLength(1);
  });
  it('returns 100 when nothing is required', () => {
    expect(evaluateCompleteness([]).completenessPct).toBe(100);
  });
});
