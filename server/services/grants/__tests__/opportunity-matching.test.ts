/**
 * Intelligent grant opportunity matching (C2C-14 finder) — transparent, pure
 * fit scoring against a funding profile. No DB/LLM.
 */

import { describe, it, expect } from 'vitest';
import {
  scoreOpportunity,
  rankOpportunities,
  dateToDays,
  type FundingProfile,
  type MatchableOpportunity,
} from '../opportunity-matching';

const TODAY = '2026-06-10';

const profile: FundingProfile = {
  keywords: ['oncology', 'immunotherapy', 'biomarker'],
  agencies: ['nih', 'dod'],
  mechanisms: ['r01', 'sbir'],
  institutionType: 'higher_ed',
  minAward: 100_000,
  maxAward: 2_000_000,
};

describe('dateToDays', () => {
  it('parses ISO and US date formats', () => {
    expect(dateToDays('2026-06-10')).toBe(dateToDays('06/10/2026'));
    expect(dateToDays('garbage')).toBeNull();
    expect(dateToDays(null)).toBeNull();
  });
});

describe('scoreOpportunity', () => {
  it('scores a strong, eligible, open NIH R01 oncology match highly', () => {
    const opp: MatchableOpportunity = {
      externalId: 'GG-1',
      title: 'NIH R01: Oncology Immunotherapy Biomarker Discovery',
      agency: 'National Institutes of Health',
      closeDate: '2026-08-01',
      awardCeiling: 1_500_000,
      eligibilities: ['Public and State controlled institutions of higher education'],
    };
    const m = scoreOpportunity(profile, opp, TODAY);
    expect(m.eligible).toBe(true);
    expect(m.agencyMatch).toBe(true);
    expect(m.mechanismMatch).toBe(true);
    expect(m.keywordHits.sort()).toEqual(['biomarker', 'immunotherapy', 'oncology']);
    expect(m.fitScore).toBeGreaterThanOrEqual(90);
    expect(m.reasons.length).toBeGreaterThan(0);
  });

  it('penalizes a closed opportunity on the deadline factor', () => {
    const opp: MatchableOpportunity = { externalId: 'GG-2', title: 'NIH R01 Oncology', agency: 'NIH', closeDate: '2026-01-01' };
    const m = scoreOpportunity(profile, opp, TODAY);
    expect(m.daysToDeadline).toBeLessThan(0);
    expect(m.reasons.some((r) => r.factor === 'deadline' && r.points === 0)).toBe(true);
  });

  it('marks ineligible and heavily discounts when institution type is excluded', () => {
    const opp: MatchableOpportunity = {
      externalId: 'GG-3',
      title: 'NIH R01 Oncology Immunotherapy Biomarker',
      agency: 'NIH',
      closeDate: '2026-08-01',
      eligibilities: ['Small businesses only'],
    };
    const m = scoreOpportunity(profile, opp, TODAY);
    expect(m.eligible).toBe(false);
    const eligibleVersion = scoreOpportunity(profile, { ...opp, eligibilities: ['Institutions of higher education'] }, TODAY);
    expect(m.fitScore).toBeLessThan(eligibleVersion.fitScore);
  });

  it('gives a low score to an unrelated, off-agency opportunity', () => {
    const opp: MatchableOpportunity = { externalId: 'GG-4', title: 'NSF Geosciences Field Station Upgrade', agency: 'National Science Foundation', closeDate: '2026-08-01' };
    const m = scoreOpportunity(profile, opp, TODAY);
    expect(m.fitScore).toBeLessThan(20);
    expect(m.keywordHits).toHaveLength(0);
  });
});

describe('rankOpportunities', () => {
  it('ranks the strongest fit first', () => {
    const opps: MatchableOpportunity[] = [
      { externalId: 'weak', title: 'NSF Geosciences', agency: 'NSF', closeDate: '2026-08-01' },
      { externalId: 'strong', title: 'NIH R01 Oncology Immunotherapy Biomarker', agency: 'NIH', closeDate: '2026-08-01', eligibilities: ['Higher education'] },
    ];
    const ranked = rankOpportunities(profile, opps, TODAY);
    expect(ranked[0].externalId).toBe('strong');
    expect(ranked[ranked.length - 1].externalId).toBe('weak');
  });
});
