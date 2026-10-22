/**
 * Submission-readiness capstone — pathway domain selection, weighting, verdict.
 */

import { describe, it, expect } from 'vitest';
import {
  assessSubmissionReadiness,
  PATHWAY_DOMAINS,
} from '../submission-readiness';

// 2026-10-15: these pinned a missing domain scored 0 (510k: 2/6, 'not-ready') and the
// 'ready' / 'nearly-ready' verdicts over completeness figures. A missing domain is now
// not assessed, and the figure and verdict are completeness of the assessed domains.
describe('assessSubmissionReadiness', () => {
  it('uses the pathway domain set and averages the assessed domains only', () => {
    // 510k requires 6 domains. Two at 1; the other four are not assessed.
    const r = assessSubmissionReadiness({
      pathway: '510k',
      domainScores: { substantialEquivalence: 1, udiGudid: 1 },
    });
    expect(r.requiredDomains).toEqual(PATHWAY_DOMAINS['510k']);
    expect(r.assessedDomainCompleteness).toBeCloseTo(1, 8);
    expect(r.notAssessedDomains).toEqual(['cybersecurity', 'humanFactors', 'labelingSpl', 'postMarketPlan']);
    expect(r.verdict).toBe('not-assessed');
  });

  it('verdict is complete only when every required domain is complete', () => {
    const full = Object.fromEntries(PATHWAY_DOMAINS['cdx'].map(d => [d, 1]));
    const r = assessSubmissionReadiness({ pathway: 'cdx', domainScores: full });
    expect(r.verdict).toBe('complete');
    expect(r.prioritizedGaps).toEqual([]);
    expect(r.assessedDomainCompleteness).toBeCloseTo(1, 10);
  });

  it('nearly-complete when the mean is ≥ 0.8 but a gap remains', () => {
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
    expect(r.assessedDomainCompleteness).toBeCloseTo(0.875, 8);
    expect(r.verdict).toBe('nearly-complete');
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
