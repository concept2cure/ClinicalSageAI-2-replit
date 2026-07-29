/**
 * Scientific validity evidence engine tests.
 */

import { describe, it, expect } from 'vitest';
import { assessScientificValidity } from '../scientific-validity';

describe('assessScientificValidity', () => {
  it('established when guideline + corroborating studies are on target', () => {
    const r = assessScientificValidity({
      analyte: 'PD-L1',
      clinicalCondition: 'NSCLC',
      intendedPurpose: 'patient selection',
      evidence: [
        { source: 'guidelines_consensus', reference: 'NCCN', directlyOnTarget: true },
        { source: 'peer_reviewed_studies', reference: 'doi:1', directlyOnTarget: true },
        { source: 'peer_reviewed_studies', reference: 'doi:2', directlyOnTarget: true },
      ],
    });
    expect(r.verdict).toBe('established');
    expect(r.strongestSource).toBe('guidelines_consensus');
    expect(r.validityScore).toBeGreaterThanOrEqual(0.85);
  });

  it('insufficient when only expert opinion is on target', () => {
    const r = assessScientificValidity({
      analyte: 'X',
      clinicalCondition: 'Y',
      intendedPurpose: 'aid diagnosis',
      evidence: [{ source: 'expert_opinion', reference: 'panel', directlyOnTarget: true }],
    });
    expect(r.verdict).toBe('insufficient');
    expect(r.gaps.some(g => g.includes('expert opinion'))).toBe(true);
  });

  it('flags when no evidence is on target', () => {
    const r = assessScientificValidity({
      analyte: 'X',
      clinicalCondition: 'Y',
      intendedPurpose: 'aid diagnosis',
      evidence: [{ source: 'peer_reviewed_studies', reference: 'doi', directlyOnTarget: false }],
    });
    expect(r.onTargetCount).toBe(0);
    expect(r.verdict).toBe('insufficient');
  });
});
