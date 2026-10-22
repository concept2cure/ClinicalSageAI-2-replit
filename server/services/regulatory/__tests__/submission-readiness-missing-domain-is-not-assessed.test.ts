/**
 * assessSubmissionReadiness: a required domain with no score is not assessed —
 * excluded and named — and the figure is the completeness of the assessed
 * domains, not "readiness" (2026-10-15).
 *
 * What the code used to do: a missing domain was scored 0 (`domainScores[d] ?? 0`),
 * so a pathway with one domain supplied at 1.0 averaged to 1/6 "overallScore" and
 * listed five 0% "gaps" nobody had measured; the mean of the per-domain
 * completeness figures (e.g. the §524B share of artifacts recorded present) was
 * called the overall readiness score, and its verdict 'ready' / 'nearly-ready' /
 * 'not-ready'. Served via POST /api/submission-readiness/assess.
 */
import { describe, it, expect } from 'vitest';
import { assessSubmissionReadiness, PATHWAY_DOMAINS } from '../submission-readiness';

describe('assessSubmissionReadiness — a domain with no score', () => {
  it('is excluded from the figure and named, not scored 0', () => {
    const r = assessSubmissionReadiness({ pathway: '510k', domainScores: { substantialEquivalence: 1, udiGudid: 0.5 } });
    expect(r.prioritizedGaps.map((d) => d.domain), 'an unmeasured domain listed as a 0% gap').toEqual(['udiGudid']);
    expect(r.perDomain.map((d) => d.domain)).toEqual(['substantialEquivalence', 'udiGudid']);
    expect(r.assessedDomainCompleteness, 'missing domains were averaged in as 0').toBeCloseTo(0.75, 10);
    expect(r.notAssessedDomains).toEqual(['cybersecurity', 'humanFactors', 'labelingSpl', 'postMarketPlan']);
    expect(r.verdict).toBe('incomplete');
    expect(r).not.toHaveProperty('overallScore');
  });

  it('gives no verdict of completeness while a domain is not assessed', () => {
    const r = assessSubmissionReadiness({ pathway: '510k', domainScores: { substantialEquivalence: 1 } });
    expect(r.verdict).toBe('not-assessed');
    expect(r.prioritizedGaps).toEqual([]);
    expect(r.notAssessedDomains).toHaveLength(5);
  });

  it('states no figure when nothing was assessed', () => {
    const r = assessSubmissionReadiness({ pathway: 'cdx', domainScores: {} });
    expect(r.assessedDomainCompleteness).toBeNull();
    expect(r.notAssessedDomains).toEqual(PATHWAY_DOMAINS.cdx);
    expect(r.verdict).toBe('not-assessed');
  });

  it('labels the verdict as completeness, never readiness', () => {
    const full = Object.fromEntries(PATHWAY_DOMAINS.cdx.map((d) => [d, 1]));
    const r = assessSubmissionReadiness({ pathway: 'cdx', domainScores: full });
    expect(r.verdict).toBe('complete');
    expect(r.notAssessedDomains).toEqual([]);
    expect(JSON.stringify(r)).not.toMatch(/ready/i);
  });
});
