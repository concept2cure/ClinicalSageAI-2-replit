/**
 * A grant match whose eligibility nobody checked says so; it is not "eligible".
 *
 * Until 2026-10-15 scoreOpportunity started from `let eligible = true` and ran
 * the eligibility gate only when the profile set an institution type AND the
 * opportunity's eligible-applicant list had been fetched. discoverOpportunities
 * fetches that list only for the first 8 search results and swallowed every
 * detail-fetch failure, so results 9-25, every failed fetch and every profile
 * without an institution type read `eligible: true`, and a fit score >= 70 on
 * those counted as a strong match. Nothing reported how many fetches failed.
 *
 * The connector and the database are the only things replaced.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const S = vi.hoisted(() => ({
  search: vi.fn(),
  detail: vi.fn(),
  profileRow: null as Record<string, unknown> | null,
}));

vi.mock('../../../db', () => ({
  pool: { query: async () => ({ rows: S.profileRow ? [S.profileRow] : [] }) },
}));
vi.mock('../../connectors/grants-gov', () => ({
  GrantsGovConnector: class {
    search(...a: unknown[]) { return S.search(...a); }
    fetchOpportunityDetail(...a: unknown[]) { return S.detail(...a); }
  },
}));
vi.mock('../grants-service', () => ({ createOpportunityTx: vi.fn() }));

import { scoreOpportunity, type FundingProfile, type MatchableOpportunity } from '../opportunity-matching';
import { discoverOpportunities } from '../grant-finder-service';

const TODAY = '2026-06-10';
const profile: FundingProfile = {
  keywords: ['oncology'],
  agencies: ['nih'],
  mechanisms: ['r01'],
  institutionType: 'higher_ed',
  minAward: 100_000,
  maxAward: 2_000_000,
};
// Keywords (50) + agency (20) + mechanism (15) = 85 from search-level fields alone.
const strongOnSearchFields: MatchableOpportunity = {
  externalId: 'GG-1',
  title: 'NIH R01 Oncology Research',
  agency: 'National Institutes of Health',
  closeDate: null,
  eligibilities: null,
  awardCeiling: null,
};

describe('scoreOpportunity: eligibility is a fact only when it was checked', () => {
  it('an opportunity whose eligibility list was not retrieved is not checked (null), and says why', () => {
    const m = scoreOpportunity(profile, strongOnSearchFields, TODAY);
    expect(m.eligible).toBeNull();
    const reason = m.reasons.find((r) => r.factor === 'eligibility');
    expect(reason?.detail).toMatch(/not checked/i);
    expect(reason?.detail).toMatch(/not retrieved/i);
  });

  it('a profile with no institution type cannot check eligibility (null)', () => {
    const m = scoreOpportunity({ ...profile, institutionType: null }, { ...strongOnSearchFields, eligibilities: ['Small businesses'] }, TODAY);
    expect(m.eligible).toBeNull();
    expect(m.reasons.find((r) => r.factor === 'eligibility')?.detail).toMatch(/institution type/i);
  });

  it('a retrieved detail that lists no eligible applicant types is not checked (null)', () => {
    const m = scoreOpportunity(profile, { ...strongOnSearchFields, eligibilities: [] }, TODAY);
    expect(m.eligible).toBeNull();
  });

  it('a checked list still decides: true when the institution type is listed, false when it is not', () => {
    expect(scoreOpportunity(profile, { ...strongOnSearchFields, eligibilities: ['Institutions of higher education'] }, TODAY).eligible).toBe(true);
    expect(scoreOpportunity(profile, { ...strongOnSearchFields, eligibilities: ['Small businesses'] }, TODAY).eligible).toBe(false);
  });

  it('says award-size fit was not assessed when no award ceiling is available', () => {
    const m = scoreOpportunity(profile, strongOnSearchFields, TODAY);
    expect(m.reasons.find((r) => r.factor === 'award')?.detail).toMatch(/not assessed/i);
  });
});

describe('discoverOpportunities: counts what it could not check', () => {
  beforeEach(() => {
    S.search.mockReset();
    S.detail.mockReset();
    S.profileRow = {
      keywords: ['oncology'], agencies: ['nih'], mechanisms: ['r01'],
      institution_type: 'higher_ed', min_award: null, max_award: null,
    };
  });

  it('reports failed detail fetches, leaves those results unchecked, and counts only checked results as strong', async () => {
    // Ten results, all scoring 85 on search fields. The first 8 are hydrated;
    // GG-2 and GG-5 fail; GG-9 and GG-10 are never fetched.
    S.search.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => ({
        id: `GG-${i + 1}`,
        title: `NIH R01 Oncology Research ${i + 1}`,
        metadata: { agency: 'National Institutes of Health', closeDate: null },
      })),
    );
    S.detail.mockImplementation(async (id: string) => {
      if (id === 'GG-2' || id === 'GG-5') throw new Error('Grants.gov opportunity not found');
      return { synopsis: null, agency: null, closeDate: null, awardCeiling: null, eligibilities: ['Public and State controlled institutions of higher education'] };
    });

    const r = await discoverOpportunities(7, {});
    const byId = new Map(r.matches.map((m) => [m.externalId, m]));

    expect(r.hydrationAttempted).toBe(8);
    expect(r.hydrationFailures).toBe(2);
    for (const id of ['GG-2', 'GG-5', 'GG-9', 'GG-10']) expect(byId.get(id)?.eligible, id).toBeNull();
    for (const id of ['GG-1', 'GG-3', 'GG-4', 'GG-6', 'GG-7', 'GG-8']) expect(byId.get(id)?.eligible, id).toBe(true);
    // All ten score >= 70; only the six whose eligibility was checked are strong.
    expect(r.matches.every((m) => m.fitScore >= 70)).toBe(true);
    expect(r.strongMatches).toBe(6);
    expect(r.eligibilityNotChecked).toBe(4);
  });
});
