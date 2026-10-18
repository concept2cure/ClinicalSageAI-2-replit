/**
 * find_grant_opportunities counts a strong match only where eligibility was checked.
 *
 * Until 2026-10-15 the handler counted every result with fitScore >= 70 as a
 * "strong fit", including results whose eligibility nobody checked (the
 * matcher then reported those as eligible: true), and it did not say how many
 * Grants.gov detail fetches had failed. The discovery service is the only
 * thing replaced; it returns what the real one returns for this case.
 */
import { describe, expect, it, vi } from 'vitest';

const { discoverOpportunities } = vi.hoisted(() => ({ discoverOpportunities: vi.fn() }));
vi.mock('../../grants/grant-finder-service.js', () => ({ discoverOpportunities }));
vi.mock('../../grants/grant-finder-service', () => ({ discoverOpportunities }));

import { getToolHandler } from '../AnaToolExecutor';

const match = (externalId: string, fitScore: number, eligible: boolean | null) => ({
  externalId, title: externalId, fitScore, eligible, keywordHits: [], agencyMatch: true,
  mechanismMatch: true, daysToDeadline: null, reasons: [],
});

describe('find_grant_opportunities', () => {
  it('reports the strong matches whose eligibility was checked, the unchecked count and the failed detail fetches', async () => {
    discoverOpportunities.mockResolvedValue({
      profileUsed: { keywords: ['oncology'], agencies: ['nih'], mechanisms: ['r01'], institutionType: 'higher_ed' },
      scored: 4,
      strongMatches: 1,
      eligibilityNotChecked: 2,
      hydrationAttempted: 3,
      hydrationFailures: 1,
      matches: [match('checked', 85, true), match('unfetched', 85, null), match('fetch-failed', 80, null), match('ineligible', 21, false)],
    });

    const out = JSON.parse(await getToolHandler('find_grant_opportunities')!({ query: 'oncology' }, { organizationId: 7 } as never));

    expect(out.strongMatches).toBe(1);
    expect(out.eligibilityNotChecked).toBe(2);
    expect(out.hydrationFailures).toBe(1);
    expect(out.matches.find((m: { externalId: string }) => m.externalId === 'unfetched').eligible).toBeNull();
    expect(out.message).toMatch(/eligibility was not checked for 2/i);
    expect(out.message).toMatch(/1 of 3/);
  });
});
