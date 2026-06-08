/**
 * Submission-readiness capstone — pathway domain selection, weighting, verdict.
 */

import { describe, it, expect } from 'vitest';
import {
  assessSubmissionReadiness,
  PATHWAY_DOMAINS,
} from '../submission-readiness';

describe('assessSubmissionReadiness', () => {
  it('uses the pathway domain set and averages scores', () => {
    // 510k requires 6 domains. Two at 1, the rest default to 0 → overall 2/6.
    const r = assessSubmissionReadiness({
      pathway: '510k',
      domainScores: { substantialEquivalence: 1, udiGudid: 1 },
    });
    expect(r.requiredDomains).toEqual(PATHWAY_DOMAINS['510k']);
    expect(r.overallScore).toBeCloseTo(2 / 6, 8);
    expect(r.verdict).toBe('not-ready');
  });

  it('verdict is ready only when every required domain is complete', () => {
    const full = Object.fromEntries(PATHWAY_DOMAINS['cdx'].map(d => [d, 1]));
    const r = assessSubmissionReadiness({ pathway: 'cdx', domainScores: full });
    expect(r.verdict).toBe('ready');
    expect(r.prioritizedGaps).toEqual([]);
    expect(r.overallScore).toBeCloseTo(1, 10);
  });

  it('nearly-ready when overall ≥ 0.8 but a gap remains', () => {
    // eu-ivdr requires 4 domains; 3 complete + 1 at 0.5 → overall 0.875.
    const r = assessSubmissionReadiness({
      pathway: 'eu-ivdr',
      domainScores: {
        ivdrPerformanceEvaluation: 1,
        analyticalPerformance: 1,
        clinicalPerformance: 1,
        udiGudid: 0.5,
      },
    });
    expect(r.overallScore).toBeCloseTo(0.875, 8);
    expect(r.verdict).toBe('nearly-ready');
    expect(r.prioritizedGaps.map(g => g.domain)).toEqual(['udiGudid']);
  });

  it('prioritizes gaps lowest-score first', () => {
    const r = assessSubmissionReadiness({
      pathway: 'pma',
      domainScores: {
        clinicalPerformance: 0.2,
        cybersecurity: 0.9,
        humanFactors: 0.5,
        udiGudid: 1,
        labelingSpl: 1,
        postMarketPlan: 1,
      },
    });
    expect(r.prioritizedGaps[0].domain).toBe('clinicalPerformance');
    expect(r.prioritizedGaps[0].score).toBe(0.2);
    expect(r.prioritizedGaps.map(g => g.domain)).toEqual([
      'clinicalPerformance',
      'humanFactors',
      'cybersecurity',
    ]);
  });

  it('rejects an unknown pathway or out-of-range score', () => {
    // pathway is typed, but guard the runtime path too.
    expect(() =>
      assessSubmissionReadiness({ pathway: 'xyz' as never, domainScores: {} })
    ).toThrow();
    expect(() =>
      assessSubmissionReadiness({ pathway: '510k', domainScores: { udiGudid: 1.5 } })
    ).toThrow();
  });
});
